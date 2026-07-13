import "server-only";
import sharp from "sharp";
import { saveGeneratedImage } from "./image-utils";

/**
 * Deterministic fallback depth map generation when the AI image-edit API
 * is rate-limited. Uses luminance + vertical gradient as a depth heuristic:
 *  - brighter pixels tend to be closer (heuristic from CPIF depth datasets)
 *  - bottom of image tends to be closer (ground plane assumption)
 *  - heavy bilateral blur to smooth noise
 *
 * This is NOT as accurate as Depth Anything V2, but it produces a usable
 * depth map that the K-means slicer can decompose into reasonable bands.
 */
export async function generateDeterministicDepth(
  imagePath: string
): Promise<{ url: string; filename: string }> {
  const meta = await sharp(imagePath).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  // load original as grayscale luminance
  const lum = await sharp(imagePath)
    .resize(W, H, { fit: "cover" })
    .greyscale()
    .normalise()
    .raw()
    .toBuffer();

  // build depth: 0.4 * luminance + 0.6 * vertical_gradient (bottom = near)
  const depth = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) {
    // vertical gradient: top (y=0) = far (40), bottom (y=H-1) = near (215)
    const vGrad = 40 + (y / H) * 175;
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const lumVal = lum[idx];
      // blend: luminance contributes 35%, vertical gradient 65%
      const d = Math.round(lumVal * 0.35 + vGrad * 0.65);
      depth[idx] = Math.max(0, Math.min(255, d));
    }
  }

  // bilateral-like smoothing: gaussian blur to remove speckles
  const smoothed = await sharp(depth, { raw: { width: W, height: H, channels: 1 } })
    .blur(4)
    .png()
    .toBuffer();

  const saved = await saveGeneratedImage(smoothed, "depth-fallback");
  return { url: saved.url, filename: saved.filename };
}

/**
 * Deterministic fallback background plate when AI inpainting is unavailable.
 * Blurs the original heavily — simulates "background behind subject" when
 * the subject layer shifts. Not perfect but prevents gaps.
 */
export async function generateDeterministicBackground(
  imagePath: string
): Promise<{ url: string; filename: string }> {
  const buf = await sharp(imagePath)
    .resize(1024, 1024, { fit: "cover" })
    .blur(12)
    .modulate({ brightness: 1.05, saturation: 0.85 })
    .png()
    .toBuffer();

  const saved = await saveGeneratedImage(buf, "bg-fallback");
  return { url: saved.url, filename: saved.filename };
}
