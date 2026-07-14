import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

let _zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;
async function getZai() {
  if (!_zaiPromise) _zaiPromise = ZAI.create();
  return _zaiPromise;
}

/**
 * POST /api/nl-animate
 * Body: { prompt: string, analysis?: SceneAnalysis }
 *
 * Uses the LLM to parse a natural language animation request and return
 * a config patch that can be applied to the animation store.
 *
 * Example: "make it dreamy and slow with warm light" →
 * { preset: "dream", intensity: 0.7, speed: 0.6, colorGrade: "teal-orange", ... }
 */
export async function POST(req: NextRequest) {
  try {
    const { prompt, analysis } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    const zai = await getZai();

    const systemPrompt = `You are an animation configuration expert for the Alive Studio image animation app. The user describes a desired animation feeling in natural language. You return a JSON config patch that will be applied to the animation.

Available presets: dream, float, pulse, liquid, cinematic3d, shimmer, boil, kenburns, aurora, underwater, ethereal, noir, cosmic, paper, glass, vintage, techno, zen, lava, prism, ghost, origami, neon

Available config fields (all optional, only include what the user's prompt implies):
- preset: one of the preset names above
- intensity: 0.5..1.5 (lower = subtler, higher = more dramatic)
- speed: 0.5..1.5 (lower = slower, higher = faster)
- renderMode: "css" | "css3d" | "webgl" | "kenburns3d"
- colorGrade: "none" | "teal-orange" | "bleach-bypass" | "portra" | "blade-runner" | "noir-film"
- chromaticAberration: 0..6
- vignette: 0..1
- depthFogEnabled: boolean
- bloomEnabled: boolean
- relightingEnabled: boolean
- dofEnabled: boolean
- effects: object with any of { fog, snow, rain, godrays, bokeh, dust, lightleak, grain, smoke, fire, embers } → boolean

Mapping hints:
- "dreamy/ethereal/soft" → preset dream/ethereal/aurora, intensity 0.7-0.9, speed 0.6-0.8
- "dramatic/intense/epic" → preset cosmic/lava/cinematic3d, intensity 1.2-1.5, speed 0.85-1.2
- "retro/vintage/analog" → preset vintage/paper/boil, grain effect, colorGrade bleach-bypass or noir-film
- "cyberpunk/neon/digital" → preset neon/techno, chromaticAberration 3-5, scanlines via grain
- "calm/zen/peaceful" → preset zen, intensity 0.5-0.7, speed 0.5-0.6
- "water/ocean/underwater" → preset underwater/lava, liquid enabled
- "warm/sunset/golden" → colorGrade teal-orange or portra
- "cold/night/dark" → colorGrade noir-film or blade-runner, preset noir/cosmic
- "foggy/misty/atmospheric" → depthFogEnabled, fog effect, dofEnabled
- "glowing/bright/shining" → bloomEnabled, glow on subject
- "3d/depth/parallax" → renderMode webgl or kenburns3d

Return ONLY raw JSON (no markdown, no prose). If the user's request is unclear, return { }.`;

    const userContent = `User request: "${prompt}"
${analysis ? `Scene context: ${analysis.sceneDescription}, mood: ${analysis.mood}, subject: ${analysis.subject}` : ""}
Return the config patch JSON:`;

    const response = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content ?? "{}";

    // extract JSON
    let jsonStr = content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    const braceStart = jsonStr.indexOf("{");
    const braceEnd = jsonStr.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
    }

    const config = JSON.parse(jsonStr);
    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    console.error("[nl-animate] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Natural language animation failed" },
      { status: 500 }
    );
  }
}
