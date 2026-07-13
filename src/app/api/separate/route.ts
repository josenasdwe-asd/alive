import { NextRequest, NextResponse } from "next/server";
import {
  generateBackgroundPlate,
  generateDepthMap,
  extractElement,
} from "@/lib/ai";
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

    // Phase 1: essential assets in parallel (bg + depth)
    const essential: Promise<unknown>[] = [
      generateBackgroundPlate(dataUrl, subject)
        .then((buf) => saveGeneratedImage(buf, "bg"))
        .then((r) => ({ key: "background", ...r }))
        .catch((e) => {
          console.warn("[separate] background failed", e);
          return null;
        }),
      generateDepthMap(dataUrl, subject)
        .then((buf) => saveGeneratedImage(buf, "depth"))
        .then((r) => ({ key: "depth", ...r }))
        .catch((e) => {
          console.warn("[separate] depth failed", e);
          return null;
        }),
    ];

    const essentialResults = (await Promise.allSettled(essential)) as any[];
    const out: Record<string, { url: string; filename: string } | null> = {};
    for (const r of essentialResults) {
      if (r.status === "fulfilled" && r.value) {
        out[r.value.key] = { url: r.value.url, filename: r.value.filename };
      }
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

    // run extracts in batches of 2 to respect rate limits
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

    if (!out.background && !out.depth) {
      return NextResponse.json(
        { error: "Layer generation failed for all essential assets" },
        { status: 500 }
      );
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
