import "server-only";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs/promises";
import path from "path";
import type { SceneAnalysis } from "./types";
import { getZai as getZaiBase, withRetry, enqueue, getCached, setCached, hashKey } from "./ai-resilient";

// Re-export getZai for backwards compatibility
export async function getZai() {
  return getZaiBase();
}

/** Read a local image file as base64 data URL */
export async function imageToDataUrl(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Analyze an image with VLM and produce a structured layer decomposition plan
 * PLUS an intelligent configuration recommendation bundle.
 *
 * Returns semantic layers ordered back → front with depth values 0..1,
 * per-layer animation suggestions based on content, and a full recommended
 * config (preset, renderMode, sceneComposition, colorGrade, effects, DOF,
 * relighting, intensity, speed) for one-click professional setup.
 */
export async function analyzeImage(dataUrl: string): Promise<SceneAnalysis> {
  // v3 FIX: cache VLM analysis results so repeated calls (re-analysis, re-upload)
  // don't hit the API and trigger 429 rate limits.
  const cacheKey = `analyze:${hashKey(dataUrl.substring(0, 200))}`;
  const cached = getCached<SceneAnalysis>(cacheKey);
  if (cached) {
    console.log("[ai] analyze cache hit — skipping API call");
    return cached;
  }

  const zai = await getZai();

  const prompt = `Analyze this image for 2.5D parallax animation. Identify 6-10 visual elements as layers. Return ONLY raw JSON:
{"sceneDescription":"one sentence","subject":"main subject","mood":"1-3 words","palette":["#hex","#hex","#hex","#hex"],"layers":[{"name":"element name","role":"background|midground|subject|foreground","depth":0..1,"description":"phrase","extractPrompt":"how to isolate this element","suggestedAnimations":["driftX"|"breathing"|"sway"|"floatY"|"wave"|"glow"|"jitter"]}],"recommendedPreset":"vivo|dream|aurora|zen|ethereal|float|noir|cosmic|neon|underwater|lava"}
Rules: 6-10 layers far→near, depth increasing. One "subject" at depth 0.6-0.9. suggestedAnimations: sky→driftX, clouds→driftX+floatY, mountains→breathing, water→wave, person→breathing, fire→glow, particles→floatY+jitter. recommendedPreset: nature→vivo, portrait→ethereal, night→noir, water→underwater, fire→lava.`;

  // v3 FIX: minimal retry (1 attempt, 1s delay) — VLM is often 429,
  // retrying 3× with 2s/4s/8s causes 14s waits. Better to fail fast to fallback.
  const response = await enqueue(() => withRetry(() =>
    zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    }), 1, 1500  // maxRetries=1, baseDelay=1.5s (max 3s total wait)
  ));

  const content = response.choices[0]?.message?.content ?? "";
  const result = parseAnalysis(content);
  setCached(cacheKey, result);
  return result;
}

function parseAnalysis(content: string): SceneAnalysis {

  /**
   * v3 FIX: Repair truncated JSON from VLM.
   * When VLM response is too long, it gets cut off mid-string.
   * This function tries to close open strings, arrays, and objects.
   */
  function repairTruncatedJSON(str: string): any | null {
    // Strategy 1: Find the last complete layer object and close from there
    // Look for the last "}," or "}" that closes a layer
    const lastCompleteLayer = str.lastIndexOf("},");
    if (lastCompleteLayer > 0) {
      // Truncate after last complete layer, close the array and object
      let repaired = str.substring(0, lastCompleteLayer + 1); // include the }
      repaired += "]"; // close layers array

      // Check if recommendedPreset exists
      if (repaired.includes('"recommendedPreset"')) {
        // Try to find it
        const presetMatch = repaired.match(/"recommendedPreset"\s*:\s*"([^"]*)"/);
        if (presetMatch) {
          repaired += "}";
        } else {
          repaired += ',"recommendedPreset":"dream"}';
        }
      } else {
        repaired += ',"recommendedPreset":"vivo"}';
      }

      try {
        return JSON.parse(repaired);
      } catch {
        // Try strategy 2: even more aggressive truncation
      }
    }

    // Strategy 2: Find the last "name" field and build a minimal valid JSON
    const nameMatches = [...str.matchAll(/"name"\s*:\s*"([^"]+)"/g)];
    if (nameMatches.length > 0) {
      // Extract what we can: sceneDescription, subject, palette
      const sceneMatch = str.match(/"sceneDescription"\s*:\s*"([^"]*)"/);
      const subjectMatch = str.match(/"subject"\s*:\s*"([^"]*)"/);
      const moodMatch = str.match(/"mood"\s*:\s*"([^"]*)"/);
      const paletteMatch = str.matchAll(/"#[0-9a-fA-F]{6}"/g);

      const palette = [...paletteMatch].map(m => m[0]).slice(0, 4);

      // Build layers from what we extracted
      const layers: any[] = [];
      nameMatches.forEach((m, i) => {
        layers.push({
          name: m[1],
          role: i === 0 ? "background" : i === nameMatches.length - 2 ? "subject" : "midground",
          depth: i / Math.max(1, nameMatches.length),
          description: "",
        });
      });

      const repaired = {
        sceneDescription: sceneMatch?.[1] ?? "Escena analizada",
        subject: subjectMatch?.[1] ?? "el sujeto principal",
        mood: moodMatch?.[1] ?? "atmospheric",
        palette: palette.length > 0 ? palette : ["#3a3a4a", "#6a6a7a", "#9a9aaa", "#cacada"],
        layers,
        recommendedPreset: "vivo",
      };

      return repaired;
    }

    return null;
  }


  // extract JSON even if wrapped in code fences or extra prose
  let jsonStr = content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const braceStart = jsonStr.indexOf("{");
  const braceEnd = jsonStr.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
  }

  // v3 FIX: VLM often returns truncated JSON (too many layers = too long response).
  // Try to repair: close unclosed strings, arrays, and objects.
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.warn("[ai] JSON parse failed, attempting repair…");
    parsed = repairTruncatedJSON(jsonStr);
    if (!parsed) {
      // If repair fails, use fallback analysis
      console.error("[ai] JSON repair failed, using fallback");
      throw new Error("VLM response was truncated and could not be repaired");
    }
  }

  // validate / normalize
  const layers = (parsed.layers ?? [])
    .map((l: any, i: number) => ({
      name: String(l.name ?? `Layer ${i + 1}`),
      role: (["background", "midground", "subject", "foreground"].includes(
        l.role
      )
        ? l.role
        : i === 0
          ? "background"
          : "midground") as SceneAnalysis["layers"][number]["role"],
      depth: Math.max(0, Math.min(1, Number(l.depth ?? i / 8))),
      description: String(l.description ?? ""),
      extractPrompt: l.extractPrompt ? String(l.extractPrompt) : undefined,
    }))
    .slice(0, 15); // v3: up to 15 semantic layers

  // ensure exactly one subject
  if (!layers.some((l: any) => l.role === "subject") && layers.length > 0) {
    layers[Math.max(0, layers.length - 2)].role = "subject";
  }

  const validPresets = [
    "dream",
    "float",
    "pulse",
    "liquid",
    "cinematic3d",
    "shimmer",
    "boil",
    "kenburns",
    "aurora",
    "underwater",
    "ethereal",
    "noir",
    "cosmic",
    // v3 presets
    "paper",
    "glass",
    "vintage",
    "techno",
    "zen",
    "lava",
    "prism",
    "ghost",
    "origami",
    "neon",
    "vivo",
  ];
  const preset = validPresets.includes(parsed.recommendedPreset)
    ? parsed.recommendedPreset
    : "dream";

  // v3: extract intelligent config recommendation bundle
  const rc = parsed.recommendedConfig ?? {};
  const validRenderModes = ["css", "css3d", "webgl", "kenburns3d"];
  const validSceneComps = ["horizon", "subject-focus", "tunnel", "wind", "anchor-midground", "free"];
  const validColorGrades = ["none", "teal-orange", "bleach-bypass", "portra", "blade-runner", "noir-film"];
  const validAnimNames = [
    "breathing","sway","twist","floatY","driftX","wave","jitter","glow","hueDrift",
    "focusPull","shadowDrift","chromatic","liquid","heartbeat","vortex","ripple",
    "zTilt","sway3d","breatheX","scan",
  ];
  const validEffects = ["fog","snow","rain","godrays","bokeh","dust","lightleak","grain","smoke","fire","embers"];

  const recommendedConfig: SceneAnalysis["recommendedConfig"] = {
    renderMode: validRenderModes.includes(rc.renderMode) ? rc.renderMode : "css",
    sceneComposition: validSceneComps.includes(rc.sceneComposition) ? rc.sceneComposition : "free",
    colorGrade: validColorGrades.includes(rc.colorGrade) ? rc.colorGrade : "none",
    effects: validEffects.reduce((acc: Record<string, boolean>, e) => {
      acc[e] = !!(rc.effects && rc.effects[e]);
      return acc;
    }, {}),
    dofEnabled: !!rc.dofEnabled,
    dofFocusDepth: Math.max(0, Math.min(1, Number(rc.dofFocusDepth ?? 0.7))),
    relightingEnabled: !!rc.relightingEnabled,
    relightingAzimuth: Math.max(0, Math.min(360, Number(rc.relightingAzimuth ?? 45))),
    relightingElevation: Math.max(0, Math.min(90, Number(rc.relightingElevation ?? 45))),
    intensity: Math.max(0.5, Math.min(1.5, Number(rc.intensity ?? 1))),
    speed: Math.max(0.5, Math.min(1.5, Number(rc.speed ?? 1))),
    depthFogEnabled: !!rc.depthFogEnabled,
    bloomEnabled: !!rc.bloomEnabled,
  };

  // v3: extract per-layer suggestedAnimations (validated)
  const layersWithAnims = layers.map((l: any, i: number) => ({
    ...l,
    suggestedAnimations: Array.isArray(l.suggestedAnimations)
      ? l.suggestedAnimations.filter((a: string) => validAnimNames.includes(a)).slice(0, 4)
      : [],
  }));

  return {
    sceneDescription: String(parsed.sceneDescription ?? ""),
    subject: String(parsed.subject ?? "the main subject"),
    mood: String(parsed.mood ?? ""),
    palette: Array.isArray(parsed.palette)
      ? parsed.palette.slice(0, 6).map(String)
      : [],
    layers: layersWithAnims,
    recommendedPreset: preset,
    recommendedConfig,
  };
}

/**
 * Generate the inpainted background plate (subject removed) via image-edit.
 * This is the key asset for parallax — when the original shifts, this fills the gap.
 *
 * v3 FIX: NO retry on image-edit APIs. They consistently 429 and retrying causes
 * 30s waits. Fail fast → caller uses deterministic fallback immediately.
 */
export async function generateBackgroundPlate(
  dataUrl: string,
  subject: string
): Promise<Buffer> {
  const cacheKey = `bg:${hashKey(dataUrl.substring(0, 100), subject)}`;
  const cached = getCached<Buffer>(cacheKey);
  if (cached) {
    console.log("[ai] bg cache hit");
    return cached;
  }

  const zai = await getZai();
  const prompt = `Remove the ${subject} from this image completely. Inpaint the background naturally and seamlessly where the ${subject} used to be, so the scene looks like the ${subject} was never there. Keep every other element — sky, ground, background objects, lighting, colors — identical to the original. Photorealistic seamless inpainting, no artifacts, no text, no blur. The result must be the same scene with the ${subject} gone.`;

  // NO retry — image-edit APIs 429 consistently. Fail fast, use fallback.
  const response = await enqueue(() =>
    zai.images.generations.edit({
      prompt,
      images: [{ url: dataUrl }],
      size: "1024x1024",
    })
  );

  const b64 = response.data?.[0]?.base64;
  if (!b64) throw new Error("No image returned from background generation");
  const buf = Buffer.from(b64, "base64");
  setCached(cacheKey, buf);
  return buf;
}

/**
 * Generate a grayscale depth map (white=near, black=far) via image-edit.
 * Used for WebGL displacement-mode parallax and for masking the subject in CSS mode.
 *
 * v3 FIX: NO retry on image-edit APIs. They consistently 429 and retrying causes
 * 30s waits. Fail fast → caller uses deterministic fallback immediately.
 */
export async function generateDepthMap(
  dataUrl: string,
  subject: string
): Promise<Buffer> {
  const cacheKey = `depth:${hashKey(dataUrl.substring(0, 100), subject)}`;
  const cached = getCached<Buffer>(cacheKey);
  if (cached) {
    console.log("[ai] depth cache hit");
    return cached;
  }

  const zai = await getZai();
  const prompt = `Convert this image into a clean grayscale depth map. White (#ffffff) represents pixels closest to the camera, black (#000000) represents the farthest background. The ${subject} must be the brightest area (closest). Smooth gradients between depth regions, no harsh noise, no text, no labels. Pure grayscale depth visualization, like a 3D depth pass from a CGI render.`;

  // NO retry — image-edit APIs 429 consistently. Fail fast, use fallback.
  const response = await enqueue(() =>
    zai.images.generations.edit({
      prompt,
      images: [{ url: dataUrl }],
      size: "1024x1024",
    })
  );

  const b64 = response.data?.[0]?.base64;
  if (!b64) throw new Error("No image returned from depth generation");
  const buf = Buffer.from(b64, "base64");
  setCached(cacheKey, buf);
  return buf;
}

/**
 * Optionally generate an isolated foreground element (closest plane).
 */
export async function generateForegroundLayer(
  dataUrl: string,
  foregroundDescription: string
): Promise<Buffer> {
  const zai = await getZai();
  const prompt = `Isolate ONLY the ${foregroundDescription} from this image. Show only those closest foreground elements on a flat solid neutral gray background (#7f7f7f). Remove the subject, the background, and all other elements. Keep the foreground elements' original detail, color, and lighting. The result is the foreground elements floating on flat gray.`;

  const response = await zai.images.generations.edit({
    prompt,
    images: [{ url: dataUrl }],
    size: "1024x1024",
  });

  const b64 = response.data?.[0]?.base64;
  if (!b64) throw new Error("No image returned from foreground generation");
  return Buffer.from(b64, "base64");
}

/**
 * Extract a single named element from the image as its own layer.
 * Returns the element on a transparent / flat background so it can be composited.
 */
export async function extractElement(
  dataUrl: string,
  elementDescription: string
): Promise<Buffer> {
  const zai = await getZai();
  const prompt = `Isolate ONLY the ${elementDescription} from this image. Show ONLY those elements on a flat solid neutral gray background (#7f7f7f). Remove everything else — no other objects, no background scene, no text. Preserve the original detail, color, lighting, and proportions of the isolated elements. The result is the ${elementDescription} floating centered on flat gray, ready to be used as a separate layer in a composite.`;

  const response = await zai.images.generations.edit({
    prompt,
    images: [{ url: dataUrl }],
    size: "1024x1024",
  });

  const b64 = response.data?.[0]?.base64;
  if (!b64) throw new Error("No image returned from element extraction");
  return Buffer.from(b64, "base64");
}
