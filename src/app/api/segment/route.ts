import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  generateBackgroundPlate,
  extractElement,
  imageToDataUrl,
} from "@/lib/ai";
import {
  generateDeterministicDepth,
  generateDeterministicBackground,
} from "@/lib/depth-fallback";
import { saveGeneratedImage, sanitizeFilename } from "@/lib/image-utils";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/segment
 *
 * v3 VANGUARDIA: Semantic segmentation + inpainting.
 *
 * 1. Generates an inpainted background plate (subject removed, bg reconstructed)
 * 2. Extracts each element as a separate transparent PNG layer
 * 3. Returns all layers ready for animation
 */
export async function POST(req: NextRequest) {
  try {
    const { url, subject, layers } = await req.json();

    if (!url || !subject) {
      return NextResponse.json({ error: "url and subject required" }, { status: 400 });
    }

    const safeUrl = url.replace(/^\/+/, "").replace(/(\.\.(\/|\\|$))+/g, "");
    const originalPath = path.join(process.cwd(), "public", safeUrl);
    // imageToDataUrl needs the full path, not relative
    const dataUrl = await imageToDataUrl(originalPath);

    const originalMeta = await sharp(originalPath).metadata();
    const origW = originalMeta.width ?? 1024;
    const origH = originalMeta.height ?? 1024;

    // PHASE 1: Inpainted background plate
    let bgUrl: string;
    try {
      const buf = await generateBackgroundPlate(dataUrl, subject);
      const resized = await sharp(buf).resize(origW, origH, { fit: "fill" }).png().toBuffer();
      const r = await saveGeneratedImage(resized, "bg-inpainted");
      bgUrl = r.url;
    } catch {
      const fallback = await generateDeterministicBackground(originalPath);
      bgUrl = fallback.url;
    }

    // PHASE 2: Extract elements
    const extractTargets = (layers ?? [])
      .filter((l: any) => l.role !== "background" && l.extractPrompt && l.depth > 0.15)
      .slice(0, 8);

    const extractedLayers: Array<{ layerName: string; url: string; depth: number; role: string }> = [];

    for (const target of extractTargets) {
      try {
        const buf = await extractElement(dataUrl, target.extractPrompt);
        const resized = await sharp(buf).resize(origW, origH, { fit: "fill" }).png().toBuffer();
        const r = await saveGeneratedImage(resized, sanitizeFilename(`seg-${target.name}`));
        extractedLayers.push({ layerName: target.name, url: r.url, depth: target.depth, role: target.role });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e: any) {
        console.warn(`[segment] extraction failed for ${target.name}:`, e?.message?.substring(0, 60));
      }
    }

    // PHASE 3: Depth map
    let depthUrl = "";
    try {
      const r = await generateDeterministicDepth(originalPath);
      depthUrl = r.url;
    } catch {}

    return NextResponse.json({
      success: true,
      background: { url: bgUrl },
      depth: { url: depthUrl },
      extracted: extractedLayers,
      totalExtracted: extractedLayers.length,
    });
  } catch (err: any) {
    console.error("[segment] error", err);
    return NextResponse.json({ error: err?.message ?? "Segmentation failed" }, { status: 500 });
  }
}
