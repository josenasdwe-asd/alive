import type {
  AnimationConfig,
  LayerAnimationConfig,
  PresetId,
} from "./types";
import { DEFAULT_LAYER_ANIM } from "./types";

export interface PresetMeta {
  id: PresetId;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  /** builds per-layer config from a base layer (depth 0..1) */
  buildLayer: (depth: number) => Omit<LayerAnimationConfig, "layerId">;
  base: Pick<
    AnimationConfig,
    | "intensity"
    | "speed"
    | "parallaxEnabled"
    | "liquidEnabled"
    | "particlesEnabled"
    | "shimmerEnabled"
    | "chromaticAberration"
    | "vignette"
    | "renderMode"
  >;
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

export const PRESETS: PresetMeta[] = [
  {
    id: "dream",
    name: "Dream",
    emoji: "🌙",
    tagline: "Respiración sutil + líquido + parallax",
    description:
      "El efecto por defecto. La imagen respira, se balancea dulcemente y ondula como agua. Parallax suave con el mouse.",
    buildLayer: (depth) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 8 + depth * 28,
      breathing: true,
      breathingAmp: 0.6 + depth * 0.6,
      sway: true,
      swayAmp: 0.5 + depth * 0.6,
      floatY: depth > 0.6,
      floatAmp: 0.6,
      liquid: false,
      liquidScale: 6,
    }),
    base: {
      intensity: 1,
      speed: 1,
      parallaxEnabled: true,
      liquidEnabled: true,
      particlesEnabled: true,
      shimmerEnabled: true,
      chromaticAberration: 1.2,
      vignette: 0.25,
      renderMode: "css",
    },
  },
  {
    id: "float",
    name: "Float",
    emoji: "🪶",
    tagline: "Capas flotando en el aire",
    description:
      "Cada capa flota y deriva suavemente como si estuviera suspendida en el aire. Sin distorsión líquida.",
    buildLayer: (depth) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 12 + depth * 36,
      breathing: true,
      breathingAmp: 0.8,
      sway: depth > 0.4,
      swayAmp: 0.4,
      floatY: true,
      floatAmp: 0.5 + depth * 0.8,
      driftX: true,
      driftAmp: 0.4 + depth * 0.5,
      liquid: false,
    }),
    base: {
      intensity: 1.1,
      speed: 0.85,
      parallaxEnabled: true,
      liquidEnabled: false,
      particlesEnabled: true,
      shimmerEnabled: false,
      chromaticAberration: 0.6,
      vignette: 0.15,
      renderMode: "css",
    },
  },
  {
    id: "pulse",
    name: "Pulse",
    emoji: "💓",
    tagline: "Latido rítmico orgánico",
    description:
      "La imagen late como un corazón. Respiración intensa y opacidad pulsante, sin parallax.",
    buildLayer: (depth) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: depth * 14,
      breathing: true,
      breathingAmp: 1.2 + depth * 0.6,
      sway: false,
      floatY: false,
      liquid: false,
      opacity: 1,
    }),
    base: {
      intensity: 1.3,
      speed: 0.7,
      parallaxEnabled: false,
      liquidEnabled: false,
      particlesEnabled: true,
      shimmerEnabled: true,
      chromaticAberration: 0.4,
      vignette: 0.35,
      renderMode: "css",
    },
  },
  {
    id: "liquid",
    name: "Liquid",
    emoji: "💧",
    tagline: "Distorsión líquida LSD",
    description:
      "Máxima distorsión SVG tipo agua. La imagen se ondula como una superficie líquida. Efecto psicodélico sutil.",
    buildLayer: (depth) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 6 + depth * 16,
      breathing: true,
      breathingAmp: 0.4,
      sway: true,
      swayAmp: 0.3,
      liquid: true,
      liquidScale: 10 + depth * 8,
    }),
    base: {
      intensity: 1,
      speed: 0.9,
      parallaxEnabled: true,
      liquidEnabled: true,
      particlesEnabled: true,
      shimmerEnabled: true,
      chromaticAberration: 2.4,
      vignette: 0.3,
      renderMode: "css",
    },
  },
  {
    id: "cinematic3d",
    name: "Cinematic 3D",
    emoji: "🎬",
    tagline: "Parallax por mapa de profundidad (WebGL)",
    description:
      "Usa el mapa de profundidad generado por IA para un parallax 3D real píxel-a-píxel. Calidad tipo Immersity/LeiaPix.",
    buildLayer: (depth) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 0,
      breathing: true,
      breathingAmp: 0.4,
      sway: false,
      liquid: false,
    }),
    base: {
      intensity: 1.2,
      speed: 1,
      parallaxEnabled: true,
      liquidEnabled: false,
      particlesEnabled: false,
      shimmerEnabled: false,
      chromaticAberration: 1.8,
      vignette: 0.4,
      renderMode: "webgl",
    },
  },
  {
    id: "shimmer",
    name: "Shimmer",
    emoji: "✨",
    tagline: "Brillo de luz barriente",
    description:
      "Un haz de luz barre la imagen lentamente. Sutil movimiento + shimmer. Ideal para productos y heroes elegante.",
    buildLayer: (depth) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 4 + depth * 12,
      breathing: true,
      breathingAmp: 0.3,
      sway: false,
      liquid: false,
    }),
    base: {
      intensity: 0.8,
      speed: 1.2,
      parallaxEnabled: true,
      liquidEnabled: false,
      particlesEnabled: false,
      shimmerEnabled: true,
      chromaticAberration: 0.8,
      vignette: 0.2,
      renderMode: "css",
    },
  },
  {
    id: "boil",
    name: "Hand-drawn Boil",
    emoji: "✏️",
    tagline: "Temblor de ilustración animada",
    description:
      "El 'boiling' de la animación tradicional: temblor orgánico continuo como dibujo a mano. Estilo Spider-Verse.",
    buildLayer: (depth) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 2 + depth * 6,
      breathing: false,
      sway: false,
      liquid: true,
      liquidScale: 4 + depth * 4,
      floatY: true,
      floatAmp: 0.3,
    }),
    base: {
      intensity: 1.4,
      speed: 1.6,
      parallaxEnabled: true,
      liquidEnabled: true,
      particlesEnabled: false,
      shimmerEnabled: false,
      chromaticAberration: 0.3,
      vignette: 0.1,
      renderMode: "css",
    },
  },
  {
    id: "kenburns",
    name: "Ken Burns",
    emoji: "🎥",
    tagline: "Zoom y pan lento cinematográfico",
    description:
      "El clásico efecto Ken Burns: zoom muy lento + pan sutil. Sin parallax de mouse. Elegante para fondos.",
    buildLayer: (depth) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 0,
      breathing: false,
      sway: false,
      floatY: false,
      liquid: false,
    }),
    base: {
      intensity: 0.7,
      speed: 0.5,
      parallaxEnabled: false,
      liquidEnabled: false,
      particlesEnabled: false,
      shimmerEnabled: false,
      chromaticAberration: 0,
      vignette: 0.2,
      renderMode: "css",
    },
  },
];

export const PRESET_MAP: Record<PresetId, PresetMeta> = PRESETS.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<PresetId, PresetMeta>
);

export function buildAnimationFromPreset(
  presetId: PresetId,
  layerIds: string[],
  layerDepths: Record<string, number>
): AnimationConfig {
  const preset = PRESET_MAP[presetId];
  const layers: Record<string, LayerAnimationConfig> = {};
  for (const id of layerIds) {
    const depth = layerDepths[id] ?? 0.5;
    layers[id] = { layerId: id, ...preset.buildLayer(depth) };
  }
  return {
    preset: presetId,
    intensity: preset.base.intensity,
    speed: preset.base.speed,
    parallaxEnabled: preset.base.parallaxEnabled,
    liquidEnabled: preset.base.liquidEnabled,
    particlesEnabled: preset.base.particlesEnabled,
    shimmerEnabled: preset.base.shimmerEnabled,
    chromaticAberration: preset.base.chromaticAberration,
    vignette: preset.base.vignette,
    reducedMotion: false,
    renderMode: preset.base.renderMode,
    layers,
  };
}
