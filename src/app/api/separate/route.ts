import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  generateBackgroundPlate,
  generateDepthMap,
  extractElement,
} from "@/lib/ai";
import {
  generateDeterministicDepth,
  generateDeterministicBackground,
} from "@/lib/depth-fallback";
import { readImageAsDataUrl, saveGeneratedImage, sanitizeFilename } from "@/lib/image-utils";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

interface SeparateBody {
  url: string;
  subject: string;
  layers: Array<{
    name: string;
    role: string;
    description: string;
    extractPrompt?: string;
    depth: number;
  }>;
  /** when true, only generate bg + depth map (no per-element extraction) */
  baseOnly?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body: SeparateBody = await req.json();
    const { url, subject, layers, baseOnly } = body;

    if (!url || !subject) {
      return NextResponse.json(
        { error: "url and subject required" },
        { status: 400 }
      );
    }

    // Sanitize URL path (keep as relative URL, not full path — readImageAsDataUrl handles resolution)
    const safeUrl = url.replace(/^\/+/, "").replace(/(\.\.(\/|\\|$))+/g, "");
    const dataUrl = await readImageAsDataUrl(safeUrl);
    const originalPath = path.join(process.cwd(), "public", safeUrl);

    // Get original image dimensions so we can resize AI-generated assets to match
    // CRITICAL FIX (C3): AI depth map is forced to 1024x1024 by the API, which
    // misaligns with non-square color images. Resize depth map to original dims.
    const originalMeta = await sharp(originalPath).metadata();
    const origW = originalMeta.width ?? 1024;
    const origH = originalMeta.height ?? 1024;

    // Phase 1: try AI for bg + depth, fallback to deterministic on 429
    // v3: 30s timeout on AI calls (was 5s — too aggressive, killed legitimate calls)
    const out: Record<string, { url: string; filename: string } | null> = {};

    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
        ),
      ]);

    // depth map — resize AI output to match original aspect ratio
    try {
      const buf = await withTimeout(generateDepthMap(dataUrl, subject), 30000);
      const resizedDepth = await sharp(buf)
        .resize(origW, origH, { fit: "fill" })
        .png()
        .toBuffer();
      const r = await saveGeneratedImage(resizedDepth, "depth");
      out.depth = { url: r.url, filename: r.filename };
    } catch (e: any) {
      console.warn("[separate] AI depth failed, using deterministic fallback:", e?.message?.substring(0, 60));
      out.depth = await generateDeterministicDepth(originalPath);
    }

    // background plate — resize AI output to match original aspect ratio
    try {
      const buf = await withTimeout(generateBackgroundPlate(dataUrl, subject), 30000);
      const resizedBg = await sharp(buf)
        .resize(origW, origH, { fit: "fill" })
        .png()
        .toBuffer();
      const r = await saveGeneratedImage(resizedBg, "bg");
      out.background = { url: r.url, filename: r.filename };
    } catch (e: any) {
      console.warn("[separate] AI bg failed, using deterministic fallback:", e?.message?.substring(0, 60));
      out.background = await generateDeterministicBackground(originalPath);
    }

    // If baseOnly, skip per-element extraction
    if (baseOnly) {
      return NextResponse.json({
        success: true,
        background: out.background,
        depth: out.depth,
        extracted: [],
      });
    }

    // Phase 2: extract each non-background layer that has an extractPrompt
    const extractTargets = (layers ?? [])
      .filter(
        (l) =>
          l.role !== "background" &&
          l.extractPrompt &&
          l.depth > 0.25
      )
      .slice(0, 5);

    const extractResults: Array<{
      layerName: string;
      url: string;
      filename: string;
    }> = [];

    for (let i = 0; i < extractTargets.length; i += 2) {
      const batch = extractTargets.slice(i, i + 2);
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          const buf = await extractElement(dataUrl, t.extractPrompt!);
          // resize extracted element to original aspect ratio too
          const resizedEl = await sharp(buf)
            .resize(origW, origH, { fit: "fill" })
            .png()
            .toBuffer();
          const r = await saveGeneratedImage(resizedEl, sanitizeFilename(`layer-${t.name}`));
          return { layerName: t.name, ...r };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") extractResults.push(r.value);
        else console.warn("[separate] extract failed", r.reason);
      }
    }

    return NextResponse.json({
      success: true,
      background: out.background,
      depth: out.depth,
      extracted: extractResults,
    });
  } catch (err: any) {
    console.error("[separate] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Separation failed" },
      { status: 500 }
    );
  }
}
