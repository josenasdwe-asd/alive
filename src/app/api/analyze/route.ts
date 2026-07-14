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
  // v3: 12 layers for more depth detail (fallback when VLM is rate-limited)
  const layers = [
    { name: "Cielo lejano", role: "background" as const, depth: 0.05, description: "Cielo más lejano", extractPrompt: "the farthest sky background", suggestedAnimations: ["driftX"] },
    { name: "Nubes lejanas", role: "background" as const, depth: 0.12, description: "Nubes de fondo", extractPrompt: "distant background clouds", suggestedAnimations: ["driftX","floatY"] },
    { name: "Montañas lejanas", role: "midground" as const, depth: 0.22, description: "Montañas de fondo", extractPrompt: "distant mountains in the background", suggestedAnimations: ["breathing"] },
    { name: "Niebla atmosférica", role: "midground" as const, depth: 0.30, description: "Niebla entre montañas", extractPrompt: "atmospheric fog or mist between layers", suggestedAnimations: ["driftX","focusPull"] },
    { name: "Nubes medias", role: "midground" as const, depth: 0.38, description: "Nubes a media altura", extractPrompt: "mid-level clouds", suggestedAnimations: ["driftX","floatY"] },
    { name: "Plano medio-lejano", role: "midground" as const, depth: 0.45, description: "Elementos a media distancia", extractPrompt: "mid-distance landscape elements", suggestedAnimations: ["breathing"] },
    { name: "Plano medio", role: "midground" as const, depth: 0.52, description: "Plano central", extractPrompt: "central plane elements", suggestedAnimations: ["sway"] },
    { name: "Sujeto principal", role: "subject" as const, depth: 0.65, description: "Sujeto focal", extractPrompt: "the main subject element", suggestedAnimations: ["breathing","glow"] },
    { name: "Sujeto primer plano", role: "subject" as const, depth: 0.75, description: "Parte frontal del sujeto", extractPrompt: "foreground part of the main subject", suggestedAnimations: ["breathing"] },
    { name: "Elementos cercanos", role: "foreground" as const, depth: 0.85, description: "Elementos del primer plano", extractPrompt: "near foreground elements", suggestedAnimations: ["floatY"] },
    { name: "Partículas", role: "foreground" as const, depth: 0.92, description: "Partículas flotantes", extractPrompt: "floating particles or dust", suggestedAnimations: ["floatY","jitter"] },
    { name: "Frente", role: "foreground" as const, depth: 0.97, description: "Plano más cercano", extractPrompt: "the closest foreground elements", suggestedAnimations: ["floatY"] },
  ];
  return {
    sceneDescription: "Escena analizada por depth slicing (VLM no disponible temporalmente).",
    subject: "el sujeto principal",
    mood: "atmospheric",
    palette: ["#3a3a4a", "#6a6a7a", "#9a9aaa", "#cacada"],
    layers,
    recommendedPreset: "vivo",
  };
}
