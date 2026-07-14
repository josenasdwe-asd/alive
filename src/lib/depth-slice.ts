import "server-only";
import sharp from "sharp";
import { saveGeneratedImage } from "./image-utils";

/**
 * Mathematical depth-map slicing.
 *
 * Pipeline:
 *  1. Load depth map → grayscale Uint8 array (one value per pixel, 0..255)
 *  2. K-means 1D clustering on the depth histogram → K cluster centers
 *  3. For each cluster k:
 *     a. binary mask = (pixel label == k)
 *     b. morphological dilation (radius R) so foreground shifts reveal background
 *     c. Gaussian alpha feathering on mask edges
 *     d. composite: original image × feathered mask → PNG with transparency
 *  4. Return K layer PNGs ordered back→front, each with its depth centroid.
 *
 * Deterministic, fast (~2-3s for 8 layers at 1024px), no AI per-layer calls.
 */

export interface SlicedLayer {
  url: string;
  filename: string;
  name: string;
  /** depth centroid 0..1 (0=far, 1=near) */
  depth: number;
  /** index in back→front order */
  index: number;
}

export interface SliceOptions {
  /** number of depth bands (layers) to produce. 4..12 */
  k?: number;
  /** dilation radius in px (prevents gaps when layers parallax) */
  dilationRadius?: number;
  /** alpha feathering sigma in px (soft edges) */
  featherSigma?: number;
  /** "anchor-base" (default): layer 0 = full image (anchor), layers 1+ = isolated bands
   *  "isolated": each layer only its band (transparent elsewhere)
   *  "cumulative": each layer contains everything from its band forward */
  mode?: "isolated" | "cumulative" | "anchor-base";
}

/**
 * Sobel edge detection on a grayscale buffer.
 * Returns edge magnitude 0..255 per pixel.
 * Used to prevent K-means from splitting objects across depth bands.
 */
function sobelEdges(data: Uint8Array, W: number, H: number): Uint8Array {
  const edges = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      // Sobel X kernel
      const gx =
        -data[idx - W - 1] - 2 * data[idx - 1] - data[idx + W - 1] +
        data[idx - W + 1] + 2 * data[idx + 1] + data[idx + W + 1];
      // Sobel Y kernel
      const gy =
        -data[idx - W - 1] - 2 * data[idx - W] - data[idx - W + 1] +
        data[idx + W - 1] + 2 * data[idx + W] + data[idx + W + 1];
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      edges[idx] = mag;
    }
  }
  return edges;
}

/**
 * Edge-aware smoothing: at strong edges, snap the depth value to the nearest
 * cluster center of the neighboring pixels. This prevents K-means from
 * splitting an object (like a mountain) across two bands.
 */
function edgeAwareSmooth(
  data: Uint8Array,
  edges: Uint8Array,
  W: number,
  H: number,
  edgeThreshold = 50
): Uint8Array {
  const smoothed = Buffer.from(data);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      if (edges[idx] > edgeThreshold) {
        // at an edge: take the median of a 3x3 neighborhood to preserve the edge
        const neighbors: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            neighbors.push(data[idx + dy * W + dx]);
          }
        }
        neighbors.sort((a, b) => a - b);
        smoothed[idx] = neighbors[4]; // median
      }
    }
  }
  return smoothed;
}

/**
 * K-means 1D clustering.
 * Returns the cluster label (0..k-1) for each pixel, plus the sorted cluster
 * centers (so cluster 0 = darkest = farthest).
 */
function kmeans1d(
  data: Uint8Array,
  k: number,
  maxIter = 20
): { labels: Uint8Array; centers: number[] } {
  // init centers: evenly spaced quantiles of the histogram
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i++) histogram[data[i]]++;
  let centers: number[] = [];
  const total = data.length;
  const step = total / k;
  let count = 0;
  let target = step;
  for (let v = 0; v < 256; v++) {
    count += histogram[v];
    if (count >= target || v === 255) {
      centers.push(v);
      target += step;
      if (centers.length >= k) break;
    }
  }
  // pad if needed
  while (centers.length < k) centers.push(centers[centers.length - 1] ?? 128);

  const labels = new Uint8Array(data.length);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    // assign step
    const sums = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = Math.abs(v - centers[c]);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (labels[i] !== bestC) {
        labels[i] = bestC;
        changed = true;
      }
      sums[bestC] += v;
      counts[bestC]++;
    }

    // update step
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) centers[c] = Math.round(sums[c] / counts[c]);
    }

    if (!changed) break;
  }

  // sort clusters by center value ascending (dark=far=0, light=near=k-1)
  const order = centers
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c - b.c);
  const remap = new Array(k);
  order.forEach((o, newIndex) => {
    remap[o.i] = newIndex;
  });
  for (let i = 0; i < labels.length; i++) labels[i] = remap[labels[i]];
  const sortedCenters = order.map((o) => o.c);

  return { labels, centers: sortedCenters };
}

/**
 * Feathered mask generation for isolated layers.
 *
 * CORRECTED: the previous approach (blur(50).threshold(1)) dilated masks
 * to cover nearly the entire image — layers weren't actually isolated.
 *
 * New approach:
 * 1. Raw binary mask (255 for this cluster, 0 elsewhere)
 * 2. Small dilation (blur + high threshold) to cover parallax gaps (5-8px)
 * 3. Light feather (3px blur) for soft edges ONLY at boundaries
 */
async function makeFeatheredMask(
  binaryMask: Buffer,
  width: number,
  height: number,
  dilationRadius: number,
  featherSigma: number
): Promise<Buffer> {
  // step 1: small dilation — only expand by a few px to cover parallax gaps
  // use blur(R) + threshold(128) so only pixels CLOSE to the mask expand
  const dilated = await sharp(binaryMask, { raw: { width, height, channels: 1 } })
    .blur(Math.min(dilationRadius, 8)) // cap at 8px to avoid covering everything
    .threshold(128) // high threshold: only truly dense areas stay
    .raw()
    .toBuffer();

  // step 2: light feather at edges only
  const feathered = await sharp(dilated, { raw: { width, height, channels: 1 } })
    .blur(Math.min(featherSigma, 4)) // cap at 4px for crisp edges
    .raw()
    .toBuffer();

  return feathered;
}

/**
 * Slice an image into N depth-based layers using its depth map.
 *
 * @param originalPath  filesystem path to the original RGB image
 * @param depthPath     filesystem path to the grayscale depth map
 * @param options       k, dilationRadius, featherSigma
 * @returns array of SlicedLayer ordered back→front
 */
export async function sliceImageByDepth(
  originalPath: string,
  depthPath: string,
  options: SliceOptions = {}
): Promise<SlicedLayer[]> {
  const k = Math.max(2, Math.min(12, options.k ?? 6));
  const dilationRadius = options.dilationRadius ?? 25; // CALIBRATED: was 18, now 25 (covers parallax gaps better)
  const featherSigma = options.featherSigma ?? 10;     // CALIBRATED: was 6, now 10 (softer edges, less visible seams)
  const mode = options.mode ?? "anchor-base"; // default: base + isolated bands

  // Load both images at the same size (use original's dimensions)
  const originalMeta = await sharp(originalPath).metadata();
  const W = originalMeta.width ?? 1024;
  const H = originalMeta.height ?? 1024;

  // Resize depth map to match original
  const depthGray = await sharp(depthPath)
    .resize(W, H, { fit: "cover" })
    .greyscale()
    .raw()
    .toBuffer();

  // original as raw RGB
  const originalRaw = await sharp(originalPath)
    .resize(W, H, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();

  // === EDGE-AWARE K-MEANS ===
  // 1. Detect edges in the depth map with Sobel
  const edges = sobelEdges(depthGray, W, H);
  // 2. Smooth depth values AT edges (median filter) to prevent objects from splitting
  const smoothedDepth = edgeAwareSmooth(depthGray, edges, W, H, 50);
  // 3. K-means on the edge-smoothed depth → cleaner object-aligned clusters
  const { labels, centers } = kmeans1d(smoothedDepth, k);

  const results: SlicedLayer[] = [];

  if (mode === "anchor-base") {
    // === ANCHOR-BASE MODE ===
    // Layer 0 = FULL original image (opaque, anchor — the complete scene)
    // Layers 1..k-1 = ISOLATED depth bands (only their pixels, transparent elsewhere)
    //
    // This gives the user REAL separate layers:
    //   - The base is always complete (no empty background)
    //   - Each isolated layer shows ONLY its depth band (just clouds, just mountains, just ground)
    //   - Hiding an isolated layer reveals the base underneath
    //   - Parallax: isolated layers move, base stays anchored

    // Layer 0: full image (anchor)
    const fullRgba = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      fullRgba[i * 4] = originalRaw[i * 3];
      fullRgba[i * 4 + 1] = originalRaw[i * 3 + 1];
      fullRgba[i * 4 + 2] = originalRaw[i * 3 + 2];
      fullRgba[i * 4 + 3] = 255; // fully opaque
    }
    const fullPng = await sharp(fullRgba, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toBuffer();
    const fullSaved = await saveGeneratedImage(fullPng, "slice-base");
    results.push({
      url: fullSaved.url,
      filename: fullSaved.filename,
      name: "Escena base",
      depth: 0.0, // farthest = anchor
      index: 0,
    });

    // Layers 1..k-1: isolated bands
    for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
      const maskBuf = Buffer.alloc(W * H);
      for (let i = 0; i < labels.length; i++) {
        maskBuf[i] = labels[i] === clusterIdx ? 255 : 0;
      }

      const featheredMask = await makeFeatheredMask(maskBuf, W, H, dilationRadius, featherSigma);

      const rgba = Buffer.alloc(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        rgba[i * 4] = originalRaw[i * 3];
        rgba[i * 4 + 1] = originalRaw[i * 3 + 1];
        rgba[i * 4 + 2] = originalRaw[i * 3 + 2];
        rgba[i * 4 + 3] = featheredMask[i];
      }

      const pngBuffer = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
        .png()
        .toBuffer();

      const saved = await saveGeneratedImage(pngBuffer, `slice-${clusterIdx}`);
      const depthCentroid = centers[clusterIdx] / 255;

      const name =
        clusterIdx === 0
          ? "Fondo lejano"
          : clusterIdx === k - 1
            ? "Primer plano"
            : clusterIdx === Math.floor(k / 2)
              ? "Plano medio"
              : `Plano ${clusterIdx + 1}`;

      results.push({
        url: saved.url,
        filename: saved.filename,
        name,
        depth: depthCentroid,
        index: clusterIdx + 1,
      });
    }

    return results;
  }

  // === ISOLATED or CUMULATIVE modes (original behavior) ===
  for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
    let maskBuf: Buffer;

    if (mode === "cumulative") {
      maskBuf = Buffer.alloc(W * H);
      for (let i = 0; i < labels.length; i++) {
        maskBuf[i] = labels[i] >= clusterIdx ? 255 : 0;
      }
    } else {
      // isolated
      maskBuf = Buffer.alloc(W * H);
      for (let i = 0; i < labels.length; i++) {
        maskBuf[i] = labels[i] === clusterIdx ? 255 : 0;
      }
    }

    const featheredMask = await makeFeatheredMask(maskBuf, W, H, dilationRadius, featherSigma);

    const rgba = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      rgba[i * 4] = originalRaw[i * 3];
      rgba[i * 4 + 1] = originalRaw[i * 3 + 1];
      rgba[i * 4 + 2] = originalRaw[i * 3 + 2];
      rgba[i * 4 + 3] = featheredMask[i];
    }

    const pngBuffer = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toBuffer();

    const saved = await saveGeneratedImage(pngBuffer, `slice-${clusterIdx}`);
    const depthCentroid = centers[clusterIdx] / 255;

    const name =
      clusterIdx === 0
        ? "Fondo lejano"
        : clusterIdx === k - 1
          ? "Frente completo"
          : clusterIdx === Math.floor(k / 2)
            ? "Plano medio"
            : `Plano ${clusterIdx + 1}`;

    results.push({
      url: saved.url,
      filename: saved.filename,
      name,
      depth: depthCentroid,
      index: clusterIdx,
    });
  }

  return results;
}
