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

export async function readImageAsDataUrl(url: string): Promise<string> {
  // url is like /uploads/xxx.jpg
  const filepath = path.join(process.cwd(), "public", url);
  const buf = await fs.readFile(filepath);
  const ext = path.extname(filepath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
