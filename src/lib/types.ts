// Shared types for the Alive Image studio

export type LayerRole =
  | "background" // far plane, inpainted sky/scene
  | "midground" // middle depth
  | "subject" // main subject (isolated or original)
  | "foreground" // closest plane
  | "depth"; // depth-map texture (grayscale)

export interface ImageLayer {
  id: string;
  name: string;
  role: LayerRole;
  /** 0 = farthest, 1 = closest. Drives parallax multiplier. */
  depth: number;
  /** public URL of the layer image */
  url: string;
  /** short semantic description from VLM */
  description: string;
  /** whether this layer should move with mouse parallax */
  parallax: boolean;
}

export interface SceneAnalysis {
  sceneDescription: string;
  /** primary subject the user cares about */
  subject: string;
  mood: string;
  palette: string[];
  /** ordered back → front */
  layers: Array<{
    name: string;
    role: LayerRole;
    depth: number;
    description: string;
  }>;
  /** recommended default preset id */
  recommendedPreset: string;
}

export type PresetId =
  | "dream"
  | "float"
  | "pulse"
  | "liquid"
  | "cinematic3d"
  | "shimmer"
  | "boil"
  | "kenburns";

export interface LayerAnimationConfig {
  layerId: string;
  parallaxStrength: number; // px of movement at max mouse distance
  breathing: boolean;
  breathingAmp: number; // 0..1 → scale 1 + amp*0.02
  sway: boolean;
  swayAmp: number; // deg multiplier
  floatY: boolean;
  floatAmp: number; // px
  driftX: boolean;
  driftAmp: number; // px
  liquid: boolean;
  liquidScale: number; // SVG displacement scale
  blur: number; // depth-of-field blur in px
  opacity: number; // 0..1
}

export interface AnimationConfig {
  preset: PresetId;
  intensity: number; // 0..2 global multiplier
  speed: number; // 0.25..3 duration multiplier
  parallaxEnabled: boolean;
  liquidEnabled: boolean;
  particlesEnabled: boolean;
  shimmerEnabled: boolean;
  chromaticAberration: number; // 0..6 px
  vignette: number; // 0..1
  reducedMotion: boolean;
  /** render mode: 'css' = Framer+SVG, 'webgl' = depth displacement shader */
  renderMode: "css" | "webgl";
  layers: Record<string, LayerAnimationConfig>;
}

export interface ProjectState {
  id: string;
  originalUrl: string;
  /** base64 data URL of original (for preview before persistence) */
  originalDataUrl?: string;
  width: number;
  height: number;
  analysis?: SceneAnalysis;
  layers: ImageLayer[];
  /** depth map url (for webgl mode) */
  depthMapUrl?: string;
  /** inpainted background url (subject removed) */
  backgroundUrl?: string;
  animation: AnimationConfig;
  status:
    | "idle"
    | "uploaded"
    | "analyzing"
    | "analyzed"
    | "separating"
    | "ready"
    | "error";
  error?: string;
}

export const DEFAULT_LAYER_ANIM: Omit<LayerAnimationConfig, "layerId"> = {
  parallaxStrength: 20,
  breathing: true,
  breathingAmp: 1,
  sway: true,
  swayAmp: 1,
  floatY: false,
  floatAmp: 1,
  driftX: false,
  driftAmp: 1,
  liquid: false,
  liquidScale: 8,
  blur: 0,
  opacity: 1,
};
