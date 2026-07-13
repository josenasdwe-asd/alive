import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/ai";
import { readImageAsDataUrl } from "@/lib/image-utils";
import path from "path";
import type { SceneAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    let dataUrl: string;
    if (url.startsWith("data:")) {
      dataUrl = url;
    } else if (url.startsWith("http")) {
      return NextResponse.json(
        { error: "Only local uploads supported" },
        { status: 400 }
      );
    } else {
      const safeUrl = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, "");
      dataUrl = await readImageAsDataUrl(safeUrl);
    }

    try {
      const analysis = await analyzeImage(dataUrl);
      return NextResponse.json({ success: true, analysis });
    } catch (vlmErr: any) {
      // VLM failed (likely 429 rate limit) — return a deterministic fallback
      // so the user can still proceed with Depth Slice (which only needs a depth map)
      const msg = String(vlmErr?.message ?? "");
      if (msg.includes("429") || msg.includes("Too many requests")) {
        const fallback = buildFallbackAnalysis();
        return NextResponse.json({
          success: true,
          analysis: fallback,
          fallback: true,
        });
      }
      throw vlmErr;
    }
  } catch (err: any) {
    console.error("[analyze] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}

/**
 * Deterministic fallback analysis when VLM is rate-limited.
 * Produces 6 generic depth bands — the user can still use Depth Slice
 * (which generates its own depth map + slices it mathematically).
 */
function buildFallbackAnalysis(): SceneAnalysis {
  const layers = [
    { name: "Fondo lejano", role: "background" as const, depth: 0.1, description: "Plano más lejano", extractPrompt: "the farthest background elements" },
    { name: "Plano medio-lejano", role: "midground" as const, depth: 0.3, description: "Elementos a media distancia", extractPrompt: "the mid-distance elements" },
    { name: "Plano medio", role: "midground" as const, depth: 0.5, description: "Plano central", extractPrompt: "the central plane elements" },
    { name: "Sujeto principal", role: "subject" as const, depth: 0.7, description: "Sujeto focal", extractPrompt: "the main subject" },
    { name: "Primer plano cercano", role: "foreground" as const, depth: 0.88, description: "Elementos cercanos", extractPrompt: "the near foreground elements" },
    { name: "Frente", role: "foreground" as const, depth: 0.97, description: "Plano más cercano", extractPrompt: "the closest foreground elements" },
  ];
  return {
    sceneDescription: "Escena analizada por depth slicing (VLM no disponible temporalmente).",
    subject: "el sujeto principal",
    mood: "atmospheric",
    palette: ["#3a3a4a", "#6a6a7a", "#9a9aaa", "#cacada"],
    layers,
    recommendedPreset: "dream",
  };
}
