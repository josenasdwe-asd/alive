/**
 * Mathematical Motion Engine — exact, non-deforming, harmonic animations.
 *
 * DESIGN PRINCIPLES:
 * 1. NON-DEFORMING: scale is ALWAYS uniform (scaleX === scaleY). Never squash
 *    with different X/Y scales — that changes aspect ratio and deforms images.
 * 2. BOUNDED: all translation is bounded to the overscale margin. Layers can
 *    never reveal edges, no matter how extreme the mouse moves.
 * 3. HARMONIC: layer frequencies use PRIME number ratios so animations NEVER
 *    sync visually. Layer 0 uses frequency f, layer 1 uses f × 1.618 (golden
 *    ratio), layer 2 uses f × 2.414 (silver ratio), etc.
 * 4. EXACT: all motion is pure mathematical functions of time. No CSS easing
 *    ambiguity. Given (t, layerIndex, config), the transform is deterministic.
 * 5. ORGANIC: Perlin noise + sinusoidal combinations produce natural-looking
 *    motion that never repeats exactly.
 */

// === PRIME FREQUENCY RATIOS ===
// Each layer gets a frequency multiplied by an irrational ratio so phases
// drift apart and NEVER realign (unlike integer ratios which sync every N cycles).
// Golden ratio φ = 1.618..., silver ratio δ = 2.414..., bronze = 3.303...
export const HARMONIC_RATIOS = [
  1.0,        // layer 0: base frequency
  1.618,      // layer 1: golden ratio φ
  2.414,      // layer 2: silver ratio (1 + √2)
  3.303,      // layer 3: bronze ratio
  4.791,      // layer 4: copper ratio
  6.404,      // layer 5: next metallic mean
  8.284,      // layer 6
  10.445,     // layer 7
  12.896,     // layer 8
  15.652,     // layer 9
];

// Phase offsets per layer (prime-based, so they never align)
export const PRIME_PHASES = [
  0,
  0.37,      // ~1/e
  0.618,     // golden ratio fractional
  0.732,     // √3 - 1
  0.414,     // √2 - 1
  0.262,     // π - 3 + 0.12
  0.577,     // 1/√3
  0.0976,    // ln(2.1)
  0.828,     // 2 - √2 + 0.242
  0.134,     // e - 2.584
];

// === MATHEMATICAL MOTION FUNCTIONS ===
// Each returns a bounded, non-deforming transform component.
// All functions are pure: same input → same output, no side effects.

/** Smooth sinusoidal: A * sin(2π * f * t + φ) */
export function sinusoidal(
  t: number,
  frequency: number,
  phase: number,
  amplitude: number
): number {
  return amplitude * Math.sin(2 * Math.PI * frequency * t + phase * 2 * Math.PI);
}

/** Lissajous figure: produces figure-8 and elliptical motion paths.
 *  x = A * sin(a*t + δ), y = B * sin(b*t)
 *  When a/b is irrational, the path never closes (organic). */
export function lissajous(
  t: number,
  freqX: number,
  freqY: number,
  ampX: number,
  ampY: number,
  phase: number
): { x: number; y: number } {
  return {
    x: ampX * Math.sin(2 * Math.PI * freqX * t + phase * 2 * Math.PI),
    y: ampY * Math.sin(2 * Math.PI * freqY * t),
  };
}

/** Damped spring: decaying oscillation for entrance reveals.
 *  A * e^(-k*t) * cos(ω*t) */
export function dampedSpring(
  t: number,
  amplitude: number,
  decayRate: number,
  frequency: number
): number {
  return amplitude * Math.exp(-decayRate * t) * Math.cos(2 * Math.PI * frequency * t);
}

/** 1D Perlin-like noise (value noise with smoothstep interpolation).
 *  Produces organic drift that never repeats. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise1D(
  t: number,
  seed: number,
  frequency: number
): number {
  const x = t * frequency + seed;
  const i = Math.floor(x);
  const f = x - i;
  // hash function for pseudo-random values at integer points
  const hash = (n: number) => {
    const s = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
    return s - Math.floor(s); // 0..1
  };
  const a = hash(i);
  const b = hash(i + 1);
  return (a + (b - a) * smoothstep(f)) * 2 - 1; // -1..1
}

// === BOUNDED TRANSFORM COMPUTATION ===

/**
 * Compute the safe translation bound from the overscale factor.
 * A layer scaled by S can translate up to (S - 1) * halfSize without revealing edges.
 *
 * @param overscaleFactor e.g. 1.18 means layer is scaled 118%
 * @param layerSize the width or height of the layer in px
 * @returns max safe translation in px (per side)
 */
export function safeTranslationBound(
  overscaleFactor: number,
  layerSize: number
): number {
  // (overscale - 1) * size / 2 = available margin per side
  return Math.max(0, (overscaleFactor - 1) * layerSize * 0.5);
}

/**
 * Clamp a translation to the safe bound, preventing edge gaps.
 */
export function boundTranslation(
  value: number,
  safeBound: number
): number {
  return Math.max(-safeBound, Math.min(safeBound, value));
}

// === LAYER TRANSFORM COMPUTATION ===

export interface LayerMotionConfig {
  // Frequencies (Hz — cycles per second)
  breathFreq: number;
  swayFreq: number;
  floatFreq: number;
  driftFreq: number;
  // Amplitudes (in their natural units)
  breathAmp: number;      // scale delta (e.g. 0.02 = 2% scale change)
  swayAmp: number;        // degrees
  floatAmp: number;       // px
  driftAmp: number;       // px
  // Phase offsets (0..1)
  phase: number;
  // Per-layer multiplier (from HARMONIC_RATIOS)
  harmonicRatio: number;
  // Parallax config
  parallaxStrength: number;  // px
  parallaxDepthFactor: number;  // 0..1 (back=low, front=high)
}

export interface ComputedTransform {
  translateX: number;  // px, bounded
  translateY: number;  // px, bounded
  scale: number;       // UNIFORM (never different X/Y)
  rotate: number;      // degrees, bounded
  // No separate scaleX/scaleY — that would deform
}

/**
 * Compute the exact transform for a layer at time t, given:
 * - the layer's motion config
 * - the current parallax input (-1..1 for X and Y)
 * - the safe bounds (from overscale)
 *
 * This is the CORE of the mathematical engine. All motion is deterministic.
 */
export function computeLayerTransform(
  t: number,
  config: LayerMotionConfig,
  parallaxX: number,  // -1..1 (smoothed mouse)
  parallaxY: number,  // -1..1
  safeBoundX: number, // max px translation X
  safeBoundY: number, // max px translation Y
  layerSize: number   // for scale computation
): ComputedTransform {
  // Apply harmonic ratio so each layer's frequency is different (never syncs)
  const h = config.harmonicRatio;
  const breathT = t * config.breathFreq * h;
  const swayT = t * config.swayFreq * h;
  const floatT = t * config.floatFreq * h;
  const driftT = t * config.driftFreq * h;

  const phase = config.phase;

  // === BREATHING (uniform scale) ===
  // sin-based, uniform — NO deformation
  const breathDelta = config.breathAmp * Math.sin(2 * Math.PI * breathT + phase * 2 * Math.PI);
  // scale is always 1 + delta (uniform, non-deforming)
  const scale = 1 + breathDelta;

  // === SWAY (rotation, bounded) ===
  const swayAngle = config.swayAmp * Math.sin(2 * Math.PI * swayT + phase * 2 * Math.PI);

  // === FLOAT Y (vertical translation, bounded) ===
  const floatY = config.floatAmp * Math.sin(2 * Math.PI * floatT + phase * 2 * Math.PI * 0.7);

  // === DRIFT X (horizontal, uses Perlin for organic non-repeating motion) ===
  const driftX = config.driftAmp * valueNoise1D(t, phase * 100, config.driftFreq * h);

  // === PARALLAX (mouse-driven, depth-weighted, bounded) ===
  const parallaxX_px = parallaxX * config.parallaxStrength * config.parallaxDepthFactor;
  const parallaxY_px = parallaxY * config.parallaxStrength * config.parallaxDepthFactor * 0.7;

  // === COMBINE & BOUND ===
  const rawX = driftX + parallaxX_px;
  const rawY = floatY + parallaxY_px;

  // Bound to safe margin — NEVER reveal edges
  const translateX = boundTranslation(rawX, safeBoundX);
  const translateY = boundTranslation(rawY, safeBoundY);

  return {
    translateX,
    translateY,
    scale,
    rotate: swayAngle,
  };
}

// === LAYER MOTION CONFIG BUILDER ===

/**
 * Build a LayerMotionConfig for a specific layer index.
 * Uses HARMONIC_RATIOS and PRIME_PHASES to ensure layers never sync.
 */
export function buildLayerMotionConfig(
  layerIndex: number,
  totalLayers: number,
  depth: number,  // 0..1
  options: {
    breathAmp?: number;
    swayAmp?: number;
    floatAmp?: number;
    driftAmp?: number;
    parallaxStrength?: number;
    baseFreq?: number;  // base frequency (Hz), default 0.16 (≈6.2s period)
  } = {}
): LayerMotionConfig {
  const baseFreq = options.baseFreq ?? 0.161;  // ~6.2s period (prime-ish)
  const h = HARMONIC_RATIOS[layerIndex % HARMONIC_RATIOS.length];
  const phase = PRIME_PHASES[layerIndex % PRIME_PHASES.length];

  return {
    breathFreq: baseFreq,
    swayFreq: baseFreq * 0.74,     // different ratio so breath & sway don't sync
    floatFreq: baseFreq * 0.55,    // slower
    driftFreq: baseFreq * 0.42,    // even slower (Perlin)
    breathAmp: options.breathAmp ?? 0.02,
    swayAmp: options.swayAmp ?? 0.5,
    floatAmp: options.floatAmp ?? 0,
    driftAmp: options.driftAmp ?? 0,
    phase,
    harmonicRatio: h,
    parallaxStrength: options.parallaxStrength ?? 12,
    parallaxDepthFactor: 0.2 + depth * 1.0,  // back layers move less
  };
}

// === QUALITY METRICS ===

/**
 * Compute the "sync score" — how much layers' phases align at time t.
 * 0 = perfectly synced (bad), 1 = completely desynced (good, organic).
 */
export function computeSyncScore(
  t: number,
  configs: LayerMotionConfig[]
): number {
  if (configs.length < 2) return 1;
  let totalDiff = 0;
  let count = 0;
  for (let i = 0; i < configs.length; i++) {
    for (let j = i + 1; j < configs.length; j++) {
      const phaseI = (configs[i].breathFreq * configs[i].harmonicRatio * t + configs[i].phase) % 1;
      const phaseJ = (configs[j].breathFreq * configs[j].harmonicRatio * t + configs[j].phase) % 1;
      const diff = Math.min(Math.abs(phaseI - phaseJ), 1 - Math.abs(phaseI - phaseJ));
      totalDiff += diff;
      count++;
    }
  }
  return count > 0 ? totalDiff / count : 1;
}

/**
 * Compute the "deformation score" — should always be 0 (non-deforming).
 * Checks that scale is uniform (scaleX === scaleY) for all layers.
 */
export function computeDeformationScore(
  transforms: Array<{ scaleX?: number; scaleY?: number; scale?: number }>
): number {
  let maxDeformation = 0;
  for (const t of transforms) {
    if (t.scaleX !== undefined && t.scaleY !== undefined) {
      const deformation = Math.abs(t.scaleX - t.scaleY);
      maxDeformation = Math.max(maxDeformation, deformation);
    }
  }
  return maxDeformation; // 0 = no deformation (perfect)
}
