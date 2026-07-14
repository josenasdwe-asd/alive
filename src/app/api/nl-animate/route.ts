import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { withRetry, enqueue } from "@/lib/ai-resilient";

export const runtime = "nodejs";
export const maxDuration = 30;

let _zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;
async function getZai() {
  if (!_zaiPromise) _zaiPromise = ZAI.create();
  return _zaiPromise;
}

/**
 * Local keyword-based fallback parser — used when the LLM is rate-limited (429).
 * Parses common animation keywords from the user's prompt and returns a config
 * patch without calling the API.
 */
function localParsePrompt(prompt: string, analysis?: any): Record<string, any> {
  const p = prompt.toLowerCase();
  const config: Record<string, any> = {};

  // Preset detection
  if (/soñad|dreamy|ethereal|etéreo|soft|suave/.test(p)) config.preset = "dream";
  else if (/flot|float/.test(p)) config.preset = "float";
  else if (/latid|pulse|heart/.test(p)) config.preset = "pulse";
  else if (/liquid|líquid|agua/.test(p)) config.preset = "liquid";
  else if (/cinem|cinema|3d/.test(p)) config.preset = "cinematic3d";
  else if (/shimmer|brill|resplan/.test(p)) config.preset = "shimmer";
  else if (/boil|tembl|jitter/.test(p)) config.preset = "boil";
  else if (/ken burns|pan|zoom/.test(p)) config.preset = "kenburns";
  else if (/aurora|boreal/.test(p)) config.preset = "aurora";
  else if (/underwater|submarin|bajo agua/.test(p)) config.preset = "underwater";
  else if (/noir|negro|dark|oscuro/.test(p)) config.preset = "noir";
  else if (/cosmic|espacial|estrella/.test(p)) config.preset = "cosmic";
  else if (/paper|papel/.test(p)) config.preset = "paper";
  else if (/glass|vidrio|cristal/.test(p)) config.preset = "glass";
  else if (/vintage|retro|película|film/.test(p)) config.preset = "vintage";
  else if (/techno|glitch|digital/.test(p)) config.preset = "techno";
  else if (/zen|calma|paz|peaceful/.test(p)) config.preset = "zen";
  else if (/lava|magma|fuego|fire/.test(p)) config.preset = "lava";
  else if (/prism|prisma|arcoíris|rainbow/.test(p)) config.preset = "prism";
  else if (/ghost|fantasma|espectral/.test(p)) config.preset = "ghost";
  else if (/origami|plegad/.test(p)) config.preset = "origami";
  else if (/neon|cyberpunk|cyber/.test(p)) config.preset = "neon";

  // Intensity / speed
  if (/lent|slow|despac/.test(p)) {
    config.speed = 0.6;
    config.intensity = 0.8;
  } else if (/rápid|fast|veloz/.test(p)) {
    config.speed = 1.3;
    config.intensity = 1.2;
  }
  if (/sutil|subtle|delicad/.test(p)) config.intensity = 0.7;
  if (/intens|dramát|epic/.test(p)) config.intensity = 1.4;

  // Color grade
  if (/cálid|warm|dorad|golden|sunset|atardec/.test(p)) config.colorGrade = "teal-orange";
  else if (/frí|cold|azul|blue/.test(p)) config.colorGrade = "blade-runner";
  else if (/desaturad|noir|monocrom/.test(p)) config.colorGrade = "noir-film";
  else if (/vibrant|saturad|vivid/.test(p)) config.colorGrade = "portra";

  // Effects
  const effects: Record<string, boolean> = {};
  if (/niebla|fog|mist|brum/.test(p)) effects.fog = true;
  if (/nieve|snow/.test(p)) effects.snow = true;
  if (/lluvia|rain/.test(p)) effects.rain = true;
  if (/god ?ray|rayo|luz divina/.test(p)) effects.godrays = true;
  if (/bokeh|desenfoc/.test(p)) effects.bokeh = true;
  if (/polvo|dust/.test(p)) effects.dust = true;
  if (/light ?leak|fuga luz/.test(p)) effects.lightleak = true;
  if (/grano|grain|película/.test(p)) effects.grain = true;
  if (/humo|smoke/.test(p)) effects.smoke = true;
  if (/fuego|fire|ember|brasa/.test(p)) { effects.fire = true; effects.embers = true; }
  if (Object.keys(effects).length > 0) config.effects = effects;

  // Atmospheric
  if (/profund|depth|3d|parallax/.test(p)) config.renderMode = "webgl";
  if (/niebla|fog|atmosf/.test(p)) config.depthFogEnabled = true;
  if (/brill|glow|resplan|bloom/.test(p)) config.bloomEnabled = true;

  return config;
}

/**
 * POST /api/nl-animate
 * Body: { prompt: string, analysis?: SceneAnalysis }
 *
 * Uses the LLM to parse a natural language animation request and return
 * a config patch that can be applied to the animation store.
 *
 * v3 FIX: falls back to local keyword parser on 429 rate-limit (no more 500 errors).
 */
export async function POST(req: NextRequest) {
  try {
    const { prompt, analysis } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    try {
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

      // v3 FIX: use queued + retried execution
      const response = await enqueue(() => withRetry(() =>
        zai.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.3,
          max_tokens: 500,
        })
      ));

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
      return NextResponse.json({ success: true, config, source: "llm" });
    } catch (apiErr: any) {
      // v3 FIX: graceful fallback to local keyword parser on 429/5xx
      const msg = String(apiErr?.message ?? "");
      console.warn("[nl-animate] API failed, using local fallback:", msg.substring(0, 60));
      const config = localParsePrompt(prompt, analysis);
      return NextResponse.json({
        success: true,
        config,
        source: "local-fallback",
        warning: "IA rate-limited, usando parser local",
      });
    }
  } catch (err: any) {
    console.error("[nl-animate] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Natural language animation failed" },
      { status: 500 }
    );
  }
}

