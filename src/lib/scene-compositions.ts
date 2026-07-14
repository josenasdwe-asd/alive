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
    // anchor: bottom 40% of depth range (ground/floor stays still)
    isAnchor: (l) => l.depth < 0.2,
    parallaxMultiplier: (l) => (l.depth < 0.2 ? 0 : l.depth * 1.2),
  },
  {
    id: "subject-focus",
    name: "Sujeto ancla",
    emoji: "👤",
    desc: "El sujeto permanece quieto, fondo y frente se mueven. Ideal para retratos.",
    // anchor: the layer closest to depth 0.5 (the subject)
    isAnchor: (l, _i, _total) => l.depth > 0.4 && l.depth < 0.65,
    parallaxMultiplier: (l) => {
      if (l.depth > 0.4 && l.depth < 0.65) return 0;
      // far and near layers move most — parabola centered at 0.5
      return Math.abs(l.depth - 0.5) * 2.5;
    },
  },
  {
    id: "tunnel",
    name: "Túnel",
    emoji: "🌀",
    desc: "El centro queda fijo, los bordes se mueven hacia dentro. Sensación de inmersión.",
    // anchor: the middle layer by DEPTH (not array index — more reliable)
    isAnchor: (l) => l.depth > 0.4 && l.depth < 0.6,
    parallaxMultiplier: (l) => {
      if (l.depth > 0.4 && l.depth < 0.6) return 0;
      // layers further from center move more
      return Math.abs(l.depth - 0.5) * 2;
    },
  },
  {
    id: "wind",
    name: "Viento",
    emoji: "🍃",
    desc: "El primer plano se balancea, el fondo permanece. Naturaleza viva.",
    // anchor: far layers (background stays still, foreground sways)
    isAnchor: (l) => l.depth < 0.35,
    parallaxMultiplier: (l) => (l.depth < 0.35 ? 0 : (l.depth - 0.35) * 2),
  },
  {
    id: "anchor-midground",
    name: "Medio ancla",
    emoji: "⚖️",
    desc: "El plano medio queda fijo, fondo y frente hacen parallax. Equilibrado.",
    isAnchor: (l) => l.depth > 0.35 && l.depth < 0.65,
    parallaxMultiplier: (l) => {
      if (l.depth > 0.35 && l.depth < 0.65) return 0;
      return l.depth < 0.35 ? 0.5 : 1.2;
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

  // sort layers by depth so index-based logic works correctly
  const sorted = [...layers].sort((a, b) => a.depth - b.depth);

  sorted.forEach((layer, i) => {
    const anchor = scene.isAnchor(layer, i, sorted.length);
    const mult = scene.parallaxMultiplier(layer, i, sorted.length);

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
      // drifters: parallax + organic effects scaled by multiplier
      const isWind = sceneId === "wind";
      const isTunnel = sceneId === "tunnel";
      result[layer.id] = {
        parallaxStrength: Math.round(baseParallax * mult),
        mouseVelocityInfluence: 0.3 * mult,
        breathing: true,
        breathingAmp: 0.5 + mult * 0.5,
        // sway: always for wind (front sways), for others only if mult is high
        sway: isWind ? true : mult > 0.5,
        swayAmp: isWind ? 1.0 : mult * 0.6,
        // floatY: tunnel layers float inward, others float if mult is high
        floatY: isTunnel || mult > 0.7,
        floatAmp: isTunnel ? 0.8 : mult * 0.5,
        driftX: mult > 0.6,
        driftAmp: mult * 0.4,
      };
    }
  });

  return result;
}
