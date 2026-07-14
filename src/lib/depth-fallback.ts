import "server-only";
import sharp from "sharp";
import { saveGeneratedImage } from "./image-utils";

/**
 * Deterministic fallback depth map generation when the AI image-edit API
 * is rate-limited. Uses luminance + vertical gradient as a depth heuristic.
 *
 * CORRECTED: added double normalise() for maximum contrast — without this,
 * dark/night images produce depth maps with almost no contrast and K-means
 * can't separate bands properly.
 */
export async function generateDeterministicDepth(
  imagePath: string
): Promise<{ url: string; filename: string }> {
  const meta = await sharp(imagePath).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  // load original as grayscale luminance WITH histogram equalization
  const lum = await sharp(imagePath)
    .resize(W, H, { fit: "cover" })
    .greyscale()
    .normalise() // stretch histogram to full 0-255 range
    .raw()
    .toBuffer();

  // build depth: luminance + vertical gradient
  // HIGHER CONTRAST: more weight to luminance so objects separate better
  const depth = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) {
    const vGrad = 20 + (y / H) * 215; // wider range for better K-means
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const lumVal = lum[idx];
      // 50% luminance + 50% vertical = balanced depth perception
      const d = Math.round(lumVal * 0.50 + vGrad * 0.50);
      depth[idx] = Math.max(0, Math.min(255, d));
    }
  }

  // stronger smoothing + double normalise for maximum K-means separation
  const smoothed = await sharp(depth, { raw: { width: W, height: H, channels: 1 } })
    .blur(5)       // more blur = smoother depth transitions
    .normalise()   // stretch to full 0-255
    .normalise()   // stretch again for max contrast
    .png()
    .toBuffer();

  const saved = await saveGeneratedImage(smoothed, "depth-fallback");
  return { url: saved.url, filename: saved.filename };
}

/**
 * Deterministic fallback background plate when AI inpainting is unavailable.
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
