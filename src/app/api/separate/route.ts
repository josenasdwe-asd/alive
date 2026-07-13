import { NextRequest, NextResponse } from "next/server";
import {
  generateBackgroundPlate,
  generateDepthMap,
  extractElement,
} from "@/lib/ai";
import {
  generateDeterministicDepth,
  generateDeterministicBackground,
} from "@/lib/depth-fallback";
import { readImageAsDataUrl, saveGeneratedImage } from "@/lib/image-utils";
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

    const safeUrl = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, "");
    const dataUrl = await readImageAsDataUrl(safeUrl);
    const originalPath = path.join(process.cwd(), "public", safeUrl);

    // Phase 1: try AI for bg + depth, fallback to deterministic on 429
    const out: Record<string, { url: string; filename: string } | null> = {};

    // depth map
    try {
      const buf = await generateDepthMap(dataUrl, subject);
      const r = await saveGeneratedImage(buf, "depth");
      out.depth = { url: r.url, filename: r.filename };
    } catch (e: any) {
      console.warn("[separate] AI depth failed, using deterministic fallback", e?.message);
      out.depth = await generateDeterministicDepth(originalPath);
    }

    // background plate
    try {
      const buf = await generateBackgroundPlate(dataUrl, subject);
      const r = await saveGeneratedImage(buf, "bg");
      out.background = { url: r.url, filename: r.filename };
    } catch (e: any) {
      console.warn("[separate] AI bg failed, using deterministic fallback", e?.message);
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
          const r = await saveGeneratedImage(buf, `layer-${t.name.toLowerCase().replace(/\s+/g, "-")}`);
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
