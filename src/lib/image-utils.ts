import "server-only";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveUpload(
  buffer: Buffer,
  ext: string
): Promise<{ id: string; filename: string; url: string; width: number; height: number }> {
  await ensureUploadDir();
  const id = crypto.randomBytes(8).toString("hex");
  const filename = `${id}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  // normalize to jpeg, max 1024px on the longest side for the AI pipeline
  const meta = await sharp(buffer).metadata();
  const longest = Math.max(meta.width ?? 1024, meta.height ?? 1024);
  const targetLongest = Math.min(1024, longest);

  await sharp(buffer)
    .resize({
      width: targetLongest,
      height: targetLongest,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(filepath.replace(/\.\w+$/, ".jpg"));

  const finalFilename = `${id}.jpg`;
  const finalPath = path.join(UPLOAD_DIR, finalFilename);
  const finalMeta = await sharp(finalPath).metadata();

  // clean up the original ext file if different
  if (finalFilename !== filename) {
    await fs.unlink(filepath).catch(() => {});
  }

  return {
    id,
    filename: finalFilename,
    url: `/uploads/${finalFilename}`,
    width: finalMeta.width ?? 1024,
    height: finalMeta.height ?? 1024,
  };
}

export async function saveGeneratedImage(
  buffer: Buffer,
  label: string
): Promise<{ filename: string; url: string }> {
  await ensureUploadDir();
  const id = crypto.randomBytes(6).toString("hex");
  const filename = `${label}-${id}.png`;
  const filepath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(filepath, buffer);
  return { filename, url: `/uploads/${filename}` };
}

/**
 * Sanitize a filename label to prevent path traversal.
 * Only allows lowercase alphanumeric and hyphens.
 */
export function sanitizeFilename(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "element";
}

/**
 * Resolve a URL path safely within the public/uploads directory.
 * Throws if the path escapes the uploads directory.
 */
export function safeResolvePath(url: string): string {
  const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
  const PUBLIC_DIR = path.join(process.cwd(), "public");

  // Only allow paths starting with /uploads/
  if (!url.startsWith("/uploads/")) {
    // also allow direct /uploads paths for depth maps etc
    const normalized = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, "");
    const resolved = path.resolve(PUBLIC_DIR, normalized);
    if (!resolved.startsWith(PUBLIC_DIR + path.sep)) {
      throw new Error("Invalid path: escapes public directory");
    }
    return resolved;
  }

  const normalized = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = path.resolve(PUBLIC_DIR, normalized);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep)) {
    throw new Error("Invalid path: escapes public directory");
  }
  return resolved;
}

export async function readImageAsDataUrl(url: string): Promise<string> {
  const filepath = safeResolvePath(url);
  const buf = await fs.readFile(filepath);
  const ext = path.extname(filepath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
