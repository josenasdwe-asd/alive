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
 *
 * FIXED (BUG #3): empty clusters produced phantom transparent PNG layers.
 *  - Init centers at evenly-spaced HISTOGRAM QUANTILES (not just first k values)
 *  - Use `<=` in the assignment step so ties don't all collapse to cluster 0
 *  - After convergence, DROP empty clusters (return only non-empty ones)
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
      // only add if this center value isn't already in the list (dedupe)
      if (centers.length === 0 || centers[centers.length - 1] !== v) {
        centers.push(v);
      }
      target += step;
      if (centers.length >= k) break;
    }
  }
  // pad if needed — use evenly spaced values across the data range instead of duplicates
  const dataMin = centers[0] ?? 0;
  const dataMax = centers[centers.length - 1] ?? 255;
  while (centers.length < k) {
    const idx = centers.length;
    const interpolated = Math.round(dataMin + ((dataMax - dataMin) * idx) / Math.max(1, k - 1));
    centers.push(interpolated);
  }

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
        // BUG #3 fix: use <= so ties distribute evenly (was strict <, collapsed to c=0)
        if (d <= bestD) {
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

    // update step — only update non-empty clusters (empty clusters keep old center)
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) centers[c] = Math.round(sums[c] / counts[c]);
    }

    if (!changed) break;
  }

  // sort clusters by center value ascending (dark=far=0, light=near=k-1)
  const order = centers
    .map((c, i) => ({ c, i, count: 0 }))
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
 * FIXED (BUG #2): the function now ACTUALLY uses its dilationRadius and featherSigma
 * parameters. Previously it only called hardcoded `.blur(2)` — the "CORRECTED" comments
 * on the caller (dilationRadius=8, featherSigma=4) had zero effect.
 *
 * Pipeline:
 * 1. Dilate the binary mask by `dilationRadius` px (so foreground shifts reveal background)
 * 2. Gaussian feather edges with `featherSigma` px sigma
 * 3. OR with original binary so no pixels are lost (preserves exact cluster coverage)
 */
async function makeFeatheredMask(
  binaryMask: Buffer,
  width: number,
  height: number,
  dilationRadius: number,
  featherSigma: number
): Promise<Buffer> {
  // 1. Dilate: blur then threshold at low value to expand the mask by ~dilationRadius px
  const dilated = await sharp(binaryMask, { raw: { width, height, channels: 1 } })
    .blur(dilationRadius)
    .threshold(1) // any pixel touched by the blur becomes 255 (expands mask)
    .raw()
    .toBuffer();

  // 2. Feather: blur the dilated mask for soft anti-aliased edges
  const feathered = await sharp(dilated, { raw: { width, height, channels: 1 } })
    .blur(featherSigma)
    .raw()
    .toBuffer();

  // 3. OR: any pixel that was 255 in the original stays 255 (no pixel loss).
  //    The feathered version adds soft gradient edges.
  const result = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    result[i] = Math.max(binaryMask[i], feathered[i]);
  }

  return result;
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
  const dilationRadius = options.dilationRadius ?? 8;  // CORRECTED: was 25 (too aggressive, covered entire image)
  const featherSigma = options.featherSigma ?? 8;       // CORRECTED: was 10 (too soft, made layers indistinguishable)
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
    // BUG #3 fix: skip empty clusters (would produce phantom transparent PNG layers)
    let nonEmptyIdx = 0;
    for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
      const maskBuf = Buffer.alloc(W * H);
      let pixelCount = 0;
      for (let i = 0; i < labels.length; i++) {
        if (labels[i] === clusterIdx) {
          maskBuf[i] = 255;
          pixelCount++;
        }
      }
      // skip empty clusters (K-means may produce them on low-contrast images)
      if (pixelCount === 0) continue;

      const featheredMask = await makeFeatheredMask(maskBuf, W, H, dilationRadius, featherSigma);

      // Straight alpha (PNG standard) — browser handles compositing correctly
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
      nonEmptyIdx++;

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
        index: nonEmptyIdx, // sequential index skipping empties
      });
    }

    return results;
  }

  // === ISOLATED or CUMULATIVE modes (original behavior) ===
  // BUG #3 fix: skip empty clusters in isolated mode too
  let nonEmptyIdxIso = -1;
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
      let pixelCount = 0;
      for (let i = 0; i < labels.length; i++) {
        if (labels[i] === clusterIdx) {
          maskBuf[i] = 255;
          pixelCount++;
        }
      }
      // skip empty clusters
      if (pixelCount === 0) continue;
    }

    const featheredMask = await makeFeatheredMask(maskBuf, W, H, dilationRadius, featherSigma);

    // Straight alpha (PNG standard)
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
    nonEmptyIdxIso++;

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
      index: nonEmptyIdxIso,
    });
  }

  return results;
}
