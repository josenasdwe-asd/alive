import type { LayerAnimationConfig, ImageLayer } from "./types";
import { DEFAULT_LAYER_ANIM } from "./types";

/**
 * Scene Composition Presets — elegant algorithmic techniques for depth perception.
 *
 * The key insight (from user): "leave one layer static, others move to give
 * depth sensation, with the ground still anchoring you."
 *
 * Each preset defines which layers are ANCHORS (static, no parallax) and which
 * are DRIFTERS (move with mouse/scroll). This creates elegant, intentional
 * parallax rather than uniform movement.
 */

export type SceneCompositionId =
  | "horizon" // sky moves, ground stays (landscape classic)
  | "subject-focus" // subject stays, bg + fg move (portrait)
  | "tunnel" // center stays, edges move inward (depth tunnel)
  | "wind" // foreground sways, bg static (nature)
  | "anchor-midground" // midground stays, bg + fg parallax (balanced)
  | "free"; // all layers move (default)

export interface SceneComposition {
  id: SceneCompositionId;
  name: string;
  emoji: string;
  desc: string;
  /** returns true if this layer should be an anchor (static) */
  isAnchor: (layer: ImageLayer, index: number, total: number) => boolean;
  /** parallax multiplier for this layer (0 = anchor, 1 = full) */
  parallaxMultiplier: (layer: ImageLayer, index: number, total: number) => number;
}

export const SCENE_COMPOSITIONS: SceneComposition[] = [
  {
    id: "horizon",
    name: "Horizonte",
    emoji: "🌅",
    desc: "El cielo se mueve, el suelo te ancla. Clásico de paisajes.",
    isAnchor: (l) => l.depth < 0.35, // background/sky is anchor
    parallaxMultiplier: (l) => (l.depth < 0.35 ? 0 : l.depth),
  },
  {
    id: "subject-focus",
    name: "Sujeto ancla",
    emoji: "👤",
    desc: "El sujeto permanece quieto, fondo y frente se mueven. Ideal para retratos.",
    isAnchor: (l) => l.role === "subject" || (l.depth > 0.4 && l.depth < 0.7),
    parallaxMultiplier: (l) => {
      if (l.role === "subject") return 0;
      return Math.abs(l.depth - 0.5) * 2; // far and near move most
    },
  },
  {
    id: "tunnel",
    name: "Túnel",
    emoji: "🌀",
    desc: "El centro queda fijo, los bordes se mueven hacia dentro. Sensación de inmersión.",
    isAnchor: (l, i, total) => i === Math.floor(total / 2),
    parallaxMultiplier: (l, i, total) => {
      const center = Math.floor(total / 2);
      return Math.abs(i - center) / total;
    },
  },
  {
    id: "wind",
    name: "Viento",
    emoji: "🍃",
    desc: "El primer plano se balancea, el fondo permanece. Naturaleza viva.",
    isAnchor: (l) => l.depth < 0.4,
    parallaxMultiplier: (l) => (l.depth < 0.4 ? 0.1 : l.depth * 1.5),
  },
  {
    id: "anchor-midground",
    name: "Medio ancla",
    emoji: "⚖️",
    desc: "El plano medio queda fijo, fondo y frente hacen parallax. Equilibrado.",
    isAnchor: (l) => l.depth > 0.35 && l.depth < 0.65,
    parallaxMultiplier: (l) => {
      if (l.depth > 0.35 && l.depth < 0.65) return 0;
      return l.depth < 0.35 ? 0.5 : 1;
    },
  },
  {
    id: "free",
    name: "Libre",
    emoji: "🔓",
    desc: "Todas las capas se mueven con parallax completo. Máximo movimiento.",
    isAnchor: () => false,
    parallaxMultiplier: () => 1,
  },
];

export const SCENE_MAP: Record<SceneCompositionId, SceneComposition> =
  SCENE_COMPOSITIONS.reduce(
    (acc, s) => {
      acc[s.id] = s;
      return acc;
    },
    {} as Record<SceneCompositionId, SceneComposition>
  );

/**
 * Apply a scene composition to the animation config.
 * Anchors get parallaxStrength = 0 + breathing only.
 * Drifters get parallax scaled by their multiplier.
 */
export function applySceneComposition(
  layers: ImageLayer[],
  sceneId: SceneCompositionId,
  baseParallax: number
): Record<string, Partial<LayerAnimationConfig>> {
  const scene = SCENE_MAP[sceneId] ?? SCENE_MAP.free;
  const result: Record<string, Partial<LayerAnimationConfig>> = {};

  layers.forEach((layer, i) => {
    const anchor = scene.isAnchor(layer, i, layers.length);
    const mult = scene.parallaxMultiplier(layer, i, layers.length);

    if (anchor) {
      // anchors: no parallax, subtle breathing only
      result[layer.id] = {
        parallaxStrength: 0,
        mouseVelocityInfluence: 0,
        breathing: true,
        breathingAmp: 0.3,
        sway: false,
        floatY: false,
        driftX: false,
      };
    } else {
      // drifters: full parallax scaled by multiplier
      result[layer.id] = {
        parallaxStrength: baseParallax * mult,
        mouseVelocityInfluence: 0.3 * mult,
        breathing: true,
        breathingAmp: 0.5 + mult * 0.5,
        sway: mult > 0.5,
        swayAmp: mult * 0.6,
      };
    }
  });

  return result;
}
