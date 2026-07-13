import type {
  AnimationConfig,
  LayerAnimationConfig,
  PresetId,
  EffectType,
} from "./types";
import { DEFAULT_LAYER_ANIM, DEFAULT_TRANSFORM, ALL_EFFECTS } from "./types";

export interface PresetMeta {
  id: PresetId;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  /** builds per-layer config from a base layer (depth 0..1, index) */
  buildLayer: (depth: number, index: number, total: number) => Omit<LayerAnimationConfig, "layerId">;
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
    | "mouseSmoothing"
  >;
  effects?: Partial<Record<EffectType, boolean>>;
  /** whether this preset is "advanced" (v2) */
  v2?: boolean;
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

// helper: prime-ish phase offset per layer so animations desync
const primePhase = (i: number) => (i * 0.37) % 1;

export const PRESETS: PresetMeta[] = [
  // ============ ORIGINAL 8 ============
  {
    id: "dream",
    name: "Dream",
    emoji: "🌙",
    tagline: "Respiración sutil + líquido + parallax",
    description:
      "El efecto por defecto. La imagen respira, se balancea dulcemente y ondula como agua. Parallax suave con el mouse.",
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 8 + depth * 28,
      mouseVelocityInfluence: 0.3,
      breathing: true,
      breathingAmp: 0.6 + depth * 0.6,
      sway: true,
      swayAmp: 0.5 + depth * 0.6,
      floatY: depth > 0.6,
      floatAmp: 0.6,
      phaseOffset: primePhase(i),
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
      mouseSmoothing: 0.06,
    },
    effects: { dust: true },
  },
  {
    id: "float",
    name: "Float",
    emoji: "🪶",
    tagline: "Capas flotando en el aire",
    description:
      "Cada capa flota y deriva suavemente como si estuviera suspendida en el aire. Sin distorsión líquida.",
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 12 + depth * 36,
      mouseVelocityInfluence: 0.5,
      inertia: 0.25,
      breathing: true,
      breathingAmp: 0.8,
      sway: depth > 0.4,
      swayAmp: 0.4,
      floatY: true,
      floatAmp: 0.5 + depth * 0.8,
      driftX: true,
      driftAmp: 0.4 + depth * 0.5,
      phaseOffset: primePhase(i),
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
      mouseSmoothing: 0.05,
    },
  },
  {
    id: "pulse",
    name: "Pulse",
    emoji: "💓",
    tagline: "Latido rítmico orgánico",
    description:
      "La imagen late como un corazón. Respiración intensa y opacidad pulsante, sin parallax.",
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: depth * 14,
      breathing: true,
      breathingAmp: 1.2 + depth * 0.6,
      glow: depth > 0.5,
      glowAmp: 0.5,
      sway: false,
      floatY: false,
      liquid: false,
      phaseOffset: primePhase(i),
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
      mouseSmoothing: 0.06,
    },
  },
  {
    id: "liquid",
    name: "Liquid",
    emoji: "💧",
    tagline: "Distorsión líquida LSD",
    description:
      "Máxima distorsión SVG tipo agua. La imagen se ondula como una superficie líquida.",
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 6 + depth * 16,
      breathing: true,
      breathingAmp: 0.4,
      sway: true,
      swayAmp: 0.3,
      liquid: true,
      liquidScale: 10 + depth * 8,
      wave: true,
      waveAmp: 0.6,
      phaseOffset: primePhase(i),
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
      mouseSmoothing: 0.07,
    },
  },
  {
    id: "cinematic3d",
    name: "Cinematic 3D",
    emoji: "🎬",
    tagline: "Parallax por mapa de profundidad (WebGL)",
    description:
      "Usa el mapa de profundidad generado por IA para un parallax 3D real píxel-a-píxel.",
    buildLayer: () => ({
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
      mouseSmoothing: 0.05,
    },
  },
  {
    id: "shimmer",
    name: "Shimmer",
    emoji: "✨",
    tagline: "Brillo de luz barriente",
    description:
      "Un haz de luz barre la imagen lentamente. Sutil movimiento + shimmer.",
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 4 + depth * 12,
      breathing: true,
      breathingAmp: 0.3,
      sway: false,
      liquid: false,
      phaseOffset: primePhase(i),
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
      mouseSmoothing: 0.06,
    },
  },
  {
    id: "boil",
    name: "Hand-drawn Boil",
    emoji: "✏️",
    tagline: "Temblor de ilustración animada",
    description:
      "El 'boiling' de la animación tradicional: temblor orgánico continuo como dibujo a mano.",
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 2 + depth * 6,
      breathing: false,
      sway: false,
      liquid: true,
      liquidScale: 4 + depth * 4,
      jitter: true,
      jitterAmp: 0.8,
      floatY: true,
      floatAmp: 0.3,
      phaseOffset: primePhase(i),
      durationMultiplier: 1.6,
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
      mouseSmoothing: 0.08,
    },
  },
  {
    id: "kenburns",
    name: "Ken Burns",
    emoji: "🎥",
    tagline: "Zoom y pan lento cinematográfico",
    description:
      "El clásico efecto Ken Burns: zoom muy lento + pan sutil. Sin parallax de mouse.",
    buildLayer: () => ({
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
      mouseSmoothing: 0.06,
    },
  },

  // ============ NEW v2 ADVANCED PRESETS ============
  {
    id: "aurora",
    name: "Aurora",
    emoji: "🌌",
    tagline: "Deriva de color etérea",
    description:
      "Capas con hue-drift lento, glow pulsante y deriva sutil. Crea una aurora boreal de color sobre la imagen.",
    v2: true,
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 6 + depth * 18,
      mouseVelocityInfluence: 0.4,
      inertia: 0.2,
      breathing: true,
      breathingAmp: 0.5 + depth * 0.4,
      sway: true,
      swayAmp: 0.4,
      driftX: true,
      driftAmp: 0.5,
      hueDrift: true,
      hueDriftAmp: 6 + depth * 6,
      glow: depth > 0.5,
      glowAmp: 0.4,
      phaseOffset: primePhase(i),
    }),
    base: {
      intensity: 1,
      speed: 0.8,
      parallaxEnabled: true,
      liquidEnabled: false,
      particlesEnabled: true,
      shimmerEnabled: true,
      chromaticAberration: 1.6,
      vignette: 0.3,
      renderMode: "css",
      mouseSmoothing: 0.05,
    },
    effects: { bokeh: true, dust: true },
  },
  {
    id: "underwater",
    name: "Underwater",
    emoji: "🌊",
    tagline: "Inmersión acuosa con caustics",
    description:
      "Líquido intenso + wave + focus pull + glow. Simula estar bajo el agua con caustics de luz.",
    v2: true,
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 4 + depth * 10,
      mouseVelocityInfluence: 0.6,
      inertia: 0.3,
      breathing: true,
      breathingAmp: 0.4,
      sway: true,
      swayAmp: 0.6,
      liquid: true,
      liquidScale: 14 + depth * 8,
      wave: true,
      waveAmp: 1.2,
      focusPull: depth < 0.4,
      focusAmp: 1.5,
      glow: true,
      glowAmp: 0.3,
      hueDrift: true,
      hueDriftAmp: 4,
      phaseOffset: primePhase(i),
    }),
    base: {
      intensity: 1.2,
      speed: 0.7,
      parallaxEnabled: true,
      liquidEnabled: true,
      particlesEnabled: true,
      shimmerEnabled: true,
      chromaticAberration: 2.8,
      vignette: 0.45,
      renderMode: "css",
      mouseSmoothing: 0.04,
    },
    effects: { bokeh: true, lightleak: true },
  },
  {
    id: "ethereal",
    name: "Ethereal",
    emoji: "🪽",
    tagline: "Susurrante y divino",
    description:
      "Brillo suave, niebla, partículas bokeh y deriva etérea. Para retratos y escenas celestiales.",
    v2: true,
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 5 + depth * 14,
      mouseVelocityInfluence: 0.3,
      inertia: 0.2,
      breathing: true,
      breathingAmp: 0.7 + depth * 0.3,
      sway: true,
      swayAmp: 0.3,
      floatY: depth > 0.3,
      floatAmp: 0.5,
      glow: true,
      glowAmp: 0.5 + depth * 0.3,
      focusPull: depth < 0.3,
      focusAmp: 1,
      phaseOffset: primePhase(i),
    }),
    base: {
      intensity: 0.9,
      speed: 0.75,
      parallaxEnabled: true,
      liquidEnabled: false,
      particlesEnabled: true,
      shimmerEnabled: true,
      chromaticAberration: 0.8,
      vignette: 0.25,
      renderMode: "css",
      mouseSmoothing: 0.04,
    },
    effects: { fog: true, bokeh: true, lightleak: true },
  },
  {
    id: "noir",
    name: "Noir",
    emoji: "🕶️",
    tagline: "Cine negro con grano",
    description:
      "Alto contraste, grano animado, viñeta fuerte y parallax lento. Estética de cine negro.",
    v2: true,
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 3 + depth * 10,
      mouseVelocityInfluence: 0.2,
      inertia: 0.15,
      breathing: true,
      breathingAmp: 0.3,
      sway: depth > 0.5,
      swayAmp: 0.2,
      jitter: depth > 0.6,
      jitterAmp: 0.4,
      phaseOffset: primePhase(i),
    }),
    base: {
      intensity: 1,
      speed: 0.85,
      parallaxEnabled: true,
      liquidEnabled: false,
      particlesEnabled: false,
      shimmerEnabled: false,
      chromaticAberration: 0,
      vignette: 0.55,
      renderMode: "css",
      mouseSmoothing: 0.05,
    },
    effects: { grain: true },
  },
  {
    id: "cosmic",
    name: "Cosmic",
    emoji: "☄️",
    tagline: "Cosmos con polvo estelar",
    description:
      "Glow intenso, hue drift cósmico, chromatic aberration y muchísimas partículas. Para escenas espaciales.",
    v2: true,
    buildLayer: (depth, i) => ({
      ...DEFAULT_LAYER_ANIM,
      parallaxStrength: 8 + depth * 30,
      mouseVelocityInfluence: 0.7,
      inertia: 0.35,
      breathing: true,
      breathingAmp: 0.6 + depth * 0.6,
      sway: true,
      swayAmp: 0.5,
      driftX: true,
      driftAmp: 0.6,
      glow: true,
      glowAmp: 0.8 + depth * 0.4,
      hueDrift: true,
      hueDriftAmp: 12,
      chromatic: depth > 0.5,
      chromaticAmp: 2,
      phaseOffset: primePhase(i),
    }),
    base: {
      intensity: 1.4,
      speed: 0.9,
      parallaxEnabled: true,
      liquidEnabled: false,
      particlesEnabled: true,
      shimmerEnabled: true,
      chromaticAberration: 3.2,
      vignette: 0.35,
      renderMode: "css",
      mouseSmoothing: 0.04,
    },
    effects: { bokeh: true, dust: true, lightleak: true, godrays: false },
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
  layerIds.forEach((id, i) => {
    const depth = layerDepths[id] ?? 0.5;
    layers[id] = { layerId: id, ...preset.buildLayer(depth, i, layerIds.length) };
  });

  const effects = ALL_EFFECTS.reduce(
    (acc, e) => {
      acc[e] = preset.effects?.[e] ?? false;
      return acc;
    },
    {} as Record<EffectType, boolean>
  );

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
    mouseSmoothing: preset.base.mouseSmoothing,
    layers,
    effects,
  };
}
