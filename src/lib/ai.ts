import "server-only";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs/promises";
import path from "path";
import type { SceneAnalysis } from "./types";

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
async function getZai() {
  if (!_zai) _zai = await ZAI.create();
  return _zai;
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
 * Analyze an image with VLM and produce a structured layer decomposition plan.
 * Returns semantic layers ordered back → front with depth values 0..1.
 */
export async function analyzeImage(dataUrl: string): Promise<SceneAnalysis> {
  const zai = await getZai();

  const prompt = `Decompose this image into 6-8 semantic depth layers for parallax animation. Return ONLY raw JSON (no markdown, no prose):
{"sceneDescription":"one sentence","subject":"main focal subject","mood":"1-3 words","palette":["#hex","#hex","#hex","#hex"],"layers":[{"name":"short name","role":"background|midground|subject|foreground","depth":0..1,"description":"short phrase","extractPrompt":"precise visual description to isolate this element"}],"recommendedPreset":"dream|float|pulse|liquid|cinematic3d|shimmer|boil|kenburns|aurora|underwater|ethereal|noir|cosmic"}
Rules: 6-8 layers ordered far→near. Exactly one "subject" (depth 0.6-0.9). Depth strictly increasing. extractPrompt for each non-background layer must precisely describe that element for isolation. Preset: landscapes→cinematic3d/aurora, portraits→ethereal/float, night→cosmic, dark→noir, ocean→underwater, dreamy→dream.`;

  const response = await zai.chat.completions.createVision({
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
  });

  const content = response.choices[0]?.message?.content ?? "";
  return parseAnalysis(content);
}

function parseAnalysis(content: string): SceneAnalysis {
  // extract JSON even if wrapped in code fences or extra prose
  let jsonStr = content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const braceStart = jsonStr.indexOf("{");
  const braceEnd = jsonStr.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
  }
  const parsed = JSON.parse(jsonStr);

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
    .slice(0, 10);

  // ensure exactly one subject
  if (!layers.some((l: any) => l.role === "subject") && layers.length > 0) {
    layers[Math.min(layers.length - 1, layers.length - 2)].role = "subject";
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
  ];
  const preset = validPresets.includes(parsed.recommendedPreset)
    ? parsed.recommendedPreset
    : "dream";

  return {
    sceneDescription: String(parsed.sceneDescription ?? ""),
    subject: String(parsed.subject ?? "the main subject"),
    mood: String(parsed.mood ?? ""),
    palette: Array.isArray(parsed.palette)
      ? parsed.palette.slice(0, 6).map(String)
      : [],
    layers,
    recommendedPreset: preset,
  };
}

/**
 * Generate the inpainted background plate (subject removed) via image-edit.
 * This is the key asset for parallax — when the original shifts, this fills the gap.
 */
export async function generateBackgroundPlate(
  dataUrl: string,
  subject: string
): Promise<Buffer> {
  const zai = await getZai();
  const prompt = `Remove the ${subject} from this image completely. Inpaint the background naturally and seamlessly where the ${subject} used to be, so the scene looks like the ${subject} was never there. Keep every other element — sky, ground, background objects, lighting, colors — identical to the original. Photorealistic seamless inpainting, no artifacts, no text, no blur. The result must be the same scene with the ${subject} gone.`;

  const response = await zai.images.generations.edit({
    prompt,
    images: [{ url: dataUrl }],
    size: "1024x1024",
  });

  const b64 = response.data?.[0]?.base64;
  if (!b64) throw new Error("No image returned from background generation");
  return Buffer.from(b64, "base64");
}

/**
 * Generate a grayscale depth map (white=near, black=far) via image-edit.
 * Used for WebGL displacement-mode parallax and for masking the subject in CSS mode.
 */
export async function generateDepthMap(
  dataUrl: string,
  subject: string
): Promise<Buffer> {
  const zai = await getZai();
  const prompt = `Convert this image into a clean grayscale depth map. White (#ffffff) represents pixels closest to the camera, black (#000000) represents the farthest background. The ${subject} must be the brightest area (closest). Smooth gradients between depth regions, no harsh noise, no text, no labels. Pure grayscale depth visualization, like a 3D depth pass from a CGI render.`;

  const response = await zai.images.generations.edit({
    prompt,
    images: [{ url: dataUrl }],
    size: "1024x1024",
  });

  const b64 = response.data?.[0]?.base64;
  if (!b64) throw new Error("No image returned from depth generation");
  return Buffer.from(b64, "base64");
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
