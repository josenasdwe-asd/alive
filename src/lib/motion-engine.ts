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

// ============================================================
// v3 POWER-UP: Advanced Physics & Organic Motion Functions
// ============================================================

// === SPRING PHYSICS (Hooke's law, semi-implicit Euler) ===
// Real per-layer spring integration for true time-parallax.
// Far layers are heavy & sluggish → settle 7× slower than near layers.

export interface SpringState { x: number; v: number; }

/**
 * One step of semi-implicit Euler spring integration.
 * F = -k·x - c·v  (Hooke + damping)
 * v_new = v + (F/m)·dt
 * x_new = x + v_new·dt
 *
 * Semi-implicit is energy-stable for any dt (unlike explicit Euler).
 */
export function springStep(
  s: SpringState,
  target: number,
  k: number,    // stiffness (N/m)
  c: number,    // damping coefficient
  m: number,    // mass (kg)
  dt: number    // time step (s)
): SpringState {
  const F = -k * (s.x - target) - c * s.v;
  const a = F / m;
  const v = s.v + a * dt;
  const x = s.x + v * dt;
  return { x, v };
}

/**
 * Depth-tuned spring parameters for TIME-PARALLAX.
 * Near layers (depth→1) react fast, far layers (depth→0) lag dramatically.
 *
 * @param depth 0..1 (0=far, 1=near)
 * @returns { k, c, m } — stiffness, damping, mass
 */
export function depthSpringParams(depth: number): {
  k: number; c: number; m: number;
} {
  return {
    k: 40 + depth * 140,       // 40 → 180 (near = stiffer)
    c: 22 - depth * 10,        // 22 → 12 (near = less damping → slight overshoot)
    m: 1.8 - depth * 1.5,      // 1.8 → 0.3 (far = 6× heavier → 6× slower settle)
  };
}

// === MOTION PREDICTION + INERTIA ===
// Extrapolate mouse 1 frame ahead to reduce perceived lag.
// Keep layers drifting after mouse stops, decelerating via friction.

/**
 * Predict mouse position 1 frame ahead.
 * @param x current position
 * @param v velocity (px/s)
 * @param tau prediction time (s), default 0.016 (1 frame @ 60fps)
 */
export function predictMouse(x: number, v: number, tau = 0.016): number {
  return x + v * tau;
}

/**
 * Inertia field — layer keeps moving after mouse stops, decelerating.
 * @param pos current layer position
 * @param vel current layer velocity
 * @param target where the layer wants to be (predicted mouse)
 * @param influence 0..2 — how strongly layer follows target
 * @param inertia 0..1 — 1 = perfect conservation (drifts forever), 0 = instant stop
 * @param dt delta time (s)
 */
export function inertiaDecay(
  pos: number,
  vel: number,
  target: number,
  influence: number,
  inertia: number,
  dt: number
): { pos: number; vel: number } {
  // Pull toward target proportional to influence
  const pull = (target - pos) * influence * dt * 10;
  const newVel = (vel + pull) * Math.max(0, 1 - (1 - inertia) * 5 * dt);
  const newPos = pos + newVel * dt;
  return { pos: newPos, vel: newVel };
}

// === FM BREATHING + AM ENVELOPE ===
// Frequency-modulated breathing with HRV-like variability.
// Amplitude envelope fades motion in/out for natural rest periods.

/**
 * FM synthesis breathing.
 * y(t) = A · sin(2π·f_c·t + I · sin(2π·f_m·t))
 *
 * @param t time (s)
 * @param carrierFreq base breathing frequency (Hz, e.g. 0.161 = ~6.2s cycle)
 * @param modFreq modulator frequency (e.g. carrierFreq × 0.23 for slow HRV)
 * @param modIndex modulation index (0.5 = ±50% frequency variation)
 * @param amplitude peak amplitude
 */
export function fmBreath(
  t: number,
  carrierFreq: number,
  modFreq: number,
  modIndex: number,
  amplitude: number
): number {
  return amplitude * Math.sin(
    2 * Math.PI * carrierFreq * t +
    modIndex * Math.sin(2 * Math.PI * modFreq * t)
  );
}

/**
 * CSS-spec cubic Bézier easing curve solver.
 * Returns y for a given x in [0,1] using Newton-Raphson.
 */
export function cubicBezier(
  t: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number
): number {
  // Newton-Raphson to solve for parameter given x
  let guess = t;
  for (let i = 0; i < 8; i++) {
    const xt = 3 * (1 - guess) * (1 - guess) * guess * p1x + 3 * (1 - guess) * guess * guess * p2x + guess * guess * guess;
    const dxt = 3 * (1 - guess) * (1 - guess) * (p1x - 2 * p2x + 1) + 6 * (1 - guess) * guess * (p2x - p1x);
    if (Math.abs(dxt) < 1e-6) break;
    guess -= (xt - t) / dxt;
    guess = Math.max(0, Math.min(1, guess));
  }
  // Evaluate y at solved parameter
  return 3 * (1 - guess) * (1 - guess) * guess * p1y + 3 * (1 - guess) * guess * guess * p2y + guess * guess * guess;
}

/**
 * Amplitude modulation envelope.
 * Fade in → sustain → fade out → rest, repeating.
 *
 * @param t time (s)
 * @param fadeIn seconds to fade in
 * @param sustain seconds at full amplitude
 * @param fadeOut seconds to fade out
 * @param rest seconds at zero amplitude
 */
export function amEnvelope(
  t: number,
  fadeIn: number,
  sustain: number,
  fadeOut: number,
  rest: number
): number {
  const L = fadeIn + sustain + fadeOut + rest;
  if (L <= 0) return 1;
  const p = t % L;
  const fi = fadeIn;
  const su = fadeIn + sustain;
  const fo = fadeIn + sustain + fadeOut;
  if (p < fi) return cubicBezier(p / fi, 0.42, 0, 0.58, 1);
  if (p < su) return 1;
  if (p < fo) return cubicBezier((p - su) / (fo - su), 0.42, 1, 0.58, 0);
  return 0; // rest
}

// === 2D SIMPLEX NOISE ===
// For spatially-correlated drift between adjacent layers.
// Adjacent layers see correlated noise → wave propagation feel.

/**
 * 2D Simplex noise (Perlin 2001, Gustavson reference implementation).
 * Returns -1..1, smooth in both x and y.
 * Used for drift that varies across layers in space.
 */
const SIMPLEX_GRAD2 = [
  [1,1],[-1,1],[1,-1],[-1,-1],
  [1,0],[-1,0],[1,0],[-1,0],
  [0,1],[0,-1],[0,1],[0,-1],
];

const SIMPLEX_PERM = (() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle with fixed seed for determinism
  let seed = 12345;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  return { perm, permMod12 };
})();

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export function snoise2D(xin: number, yin: number): number {
  let n0 = 0, n1 = 0, n2 = 0;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;
  let i1: number, j1: number;
  if (x0 > y0) { i1 = 1; j1 = 0; }
  else { i1 = 0; j1 = 1; }
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  const gi0 = SIMPLEX_PERM.permMod12[ii + SIMPLEX_PERM.perm[jj]];
  const gi1 = SIMPLEX_PERM.permMod12[ii + i1 + SIMPLEX_PERM.perm[jj + j1]];
  const gi2 = SIMPLEX_PERM.permMod12[ii + 1 + SIMPLEX_PERM.perm[jj + 1]];
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (SIMPLEX_GRAD2[gi0][0] * x0 + SIMPLEX_GRAD2[gi0][1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (SIMPLEX_GRAD2[gi1][0] * x1 + SIMPLEX_GRAD2[gi1][1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (SIMPLEX_GRAD2[gi2][0] * x2 + SIMPLEX_GRAD2[gi2][1] * y2); }
  return 70 * (n0 + n1 + n2);
}

// === MOTION BLUR FROM VELOCITY ===
/**
 * Compute motion blur amount from layer velocity.
 * @param v velocity (px/s)
 * @param k blur coefficient (default 0.04)
 * @param maxBlur maximum blur in px (default 6)
 */
export function motionBlurFromVelocity(
  v: number,
  k = 0.04,
  maxBlur = 6
): number {
  return Math.min(maxBlur, Math.abs(v) * k);
}
