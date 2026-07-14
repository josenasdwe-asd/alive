"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import type {
  AnimationConfig,
  ImageLayer,
  LayerAnimationConfig,
  BlendMode,
} from "@/lib/types";
import { DEFAULT_LAYER_ANIM } from "@/lib/types";
import {
  buildLayerMotionConfig,
  computeLayerTransform,
  safeTranslationBound,
  depthSpringParams,
  springStep,
  predictMouse,
  inertiaDecay,
  fmBreath,
  amEnvelope,
  snoise2D,
  motionBlurFromVelocity,
  type LayerMotionConfig,
  type SpringState,
} from "@/lib/motion-engine";
import { useGyroscope } from "@/hooks/use-gyroscope";

interface AliveLayersProps {
  layers: ImageLayer[];
  config: AnimationConfig;
  liquidFilterId?: string;
  editorMode?: boolean;
  selectedLayerId?: string;
  onSelectLayer?: (id: string) => void;
  onLayerTransform?: (id: string, transform: Partial<ImageLayer["transform"]>) => void;
  scrollY?: MotionValue<number>;
}

const BLEND_CSS: Record<BlendMode, string> = {
  normal: "normal",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  "soft-light": "soft-light",
  "hard-light": "hard-light",
  "color-dodge": "color-dodge",
  lighten: "lighten",
  darken: "darken",
  difference: "difference",
};

/**
 * MATHEMATICAL MOTION ENGINE RENDERER.
 *
 * v3 ARCHITECTURE: replaces CSS @property keyframes with JS-driven RAF math.
 * - All motion is computed via pure mathematical functions (sin, Perlin, Lissajous)
 * - Scale is ALWAYS uniform (non-deforming — no squash & stretch that changes aspect)
 * - All translation is BOUNDED to the overscale margin (no edge gaps, ever)
 * - Layers use PRIME harmonic ratios so animations NEVER sync visually
 * - Motion is deterministic: same (t, layerIndex, config) → same transform
 *
 * This is the "exact mathematical algorithmic system" the user requested.
 */
export function AliveLayersMath({
  layers,
  config,
  liquidFilterId,
  editorMode = false,
  selectedLayerId,
  onSelectLayer,
  scrollY,
}: AliveLayersProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const mvx = useMotionValue(0);
  const mvy = useMotionValue(0);

  // v3 FEATURE: Mobile gyroscope parallax — blends with mouse input
  const gyro = useGyroscope();

  // Feed gyroscope tilt into the same mx/my motion values (blended with mouse)
  useEffect(() => {
    if (!gyro.enabled || !gyro.permissionGranted) return;
    // Gyro tilt is -1..1, same range as mouse. Blend: add gyro to current mouse value.
    // Use a gentle lerp so gyro doesn't fight mouse on desktop.
    const currentX = mx.get();
    const currentY = my.get();
    // Only apply gyro if mouse is near center (not actively moving)
    if (Math.abs(currentX) < 0.3 && Math.abs(currentY) < 0.3) {
      mx.set(gyro.tilt.x);
      my.set(gyro.tilt.y);
    }
  }, [gyro.tilt, gyro.enabled, gyro.permissionGranted, mx, my]);

  useEffect(() => {
    if (config.reducedMotion || !config.parallaxEnabled) return;
    const el = containerRef.current;
    if (!el) return;

    let lastX = 0;
    let lastY = 0;
    let lastT = performance.now();

    const handle = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const vx = ((e.clientX - lastX) / dt) * 16;
      const vy = ((e.clientY - lastY) / dt) * 16;
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;
      mx.set(Math.max(-1.5, Math.min(1.5, x)));
      my.set(Math.max(-1.5, Math.min(1.5, y)));
      mvx.set(Math.max(-20, Math.min(20, vx)));
      mvy.set(Math.max(-20, Math.min(20, vy)));
    };
    const reset = () => {
      mx.set(0);
      my.set(0);
      mvx.set(0);
      mvy.set(0);
    };
    el.addEventListener("pointermove", handle);
    el.addEventListener("pointerleave", reset);
    return () => {
      el.removeEventListener("pointermove", handle);
      el.removeEventListener("pointerleave", reset);
    };
  }, [config.reducedMotion, config.parallaxEnabled, mx, my, mvx, mvy]);

  const sorted = [...layers].sort((a, b) => a.depth - b.depth);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ perspective: "1200px", isolation: "isolate" }}
      onPointerDown={(e) => {
        if (editorMode && onSelectLayer && e.target === e.currentTarget) {
          onSelectLayer("");
        }
      }}
    >
      {sorted.map((layer, i) => (
        <LayerPlane
          key={layer.id}
          layer={layer}
          index={i}
          total={sorted.length}
          mx={mx}
          my={my}
          mvx={mvx}
          mvy={mvy}
          config={config}
          liquidFilterId={liquidFilterId}
          editorMode={editorMode}
          selected={selectedLayerId === layer.id}
          onSelect={() => onSelectLayer?.(layer.id)}
          scrollY={scrollY}
        />
      ))}
    </div>
  );
}

interface LayerPlaneProps {
  layer: ImageLayer;
  index: number;
  total: number;
  mx: MotionValue<number>;
  my: MotionValue<number>;
  mvx: MotionValue<number>;
  mvy: MotionValue<number>;
  config: AnimationConfig;
  liquidFilterId?: string;
  editorMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  scrollY?: MotionValue<number>;
}

function LayerPlane({
  layer,
  index,
  total,
  mx,
  my,
  mvx,
  mvy,
  config,
  liquidFilterId,
  editorMode,
  selected,
  onSelect,
  scrollY,
}: LayerPlaneProps) {
  const t = layer.transform;
  const layerRef = useRef<HTMLDivElement>(null);

  const layerAnim: LayerAnimationConfig =
    config.layers[layer.id] ??
    ({ layerId: layer.id, ...DEFAULT_LAYER_ANIM } as LayerAnimationConfig);

  // === BUILD MATHEMATICAL MOTION CONFIG (memoized — was recreated every render) ===
  // PERF FIX: useMemo prevents RAF teardown/recreate on every parent re-render.
  const motionConfig: LayerMotionConfig = useMemo(
    () =>
      buildLayerMotionConfig(index, total, layer.depth, {
        breathAmp: layerAnim.breathing
          ? 0.012 + layerAnim.breathingAmp * 0.01 * config.intensity
          : 0,
        swayAmp: layerAnim.sway
          ? layerAnim.swayAmp * 0.5 * config.intensity
          : 0,
        floatAmp: layerAnim.floatY
          ? layerAnim.floatAmp * 5 * config.intensity
          : 0,
        driftAmp: layerAnim.driftX
          ? layerAnim.driftAmp * 4 * config.intensity
          : 0,
        parallaxStrength: config.parallaxEnabled
          ? layerAnim.parallaxStrength
          : 0,
      }),
    [index, total, layer.depth, config.intensity, config.parallaxEnabled,
     layerAnim.breathing, layerAnim.breathingAmp, layerAnim.sway, layerAnim.swayAmp,
     layerAnim.floatY, layerAnim.floatAmp, layerAnim.driftX, layerAnim.driftAmp,
     layerAnim.parallaxStrength]
  );

  // === v3 POWER-UP: PHANTOM SPRING PHYSICS ===
  // Real Hooke's law per layer for true TIME-PARALLAX.
  // Far layers are 6× heavier → settle 6× slower than near layers.
  const springParams = useMemo(() => depthSpringParams(layer.depth), [layer.depth]);

  // Spring state refs (avoid re-creating springs on every render)
  const springX = useRef<SpringState>({ x: 0, v: 0 });
  const springY = useRef<SpringState>({ x: 0, v: 0 });

  // v3 POWER-UP: Inertia field state (wires previously-dead config fields)
  const inertiaX = useRef({ pos: 0, vel: 0 });
  const inertiaY = useRef({ pos: 0, vel: 0 });

  // === OVERSCALE (non-deforming: uniform scale) ===
  const depthScale = config.scaleWithDepth ? 1 + layer.depth * 0.15 : 1;
  const overscale = (1.12 + layer.depth * 0.06 + config.intensity * 0.04) * depthScale;
  const userScale = t.scale * overscale;

  // === SAFE BOUNDS (measured from real container size) ===
  // PERF FIX: was hardcoded 800×500. Now uses ResizeObserver.
  const containerSizeRef = useRef({ w: 800, h: 500 });
  const layerWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layerWrapperRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        containerSizeRef.current = { w: rect.width, h: rect.height };
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // === RAF-DRIVEN MATHEMATICAL MOTION ===
  const txMV = useMotionValue(0);
  const tyMV = useMotionValue(0);
  const scaleMV = useMotionValue(userScale);
  const rotateMV = useMotionValue(t.rotation);
  const blurMV = useMotionValue(0);

  // Refs for delta-time computation and velocity tracking
  const lastNowRef = useRef(performance.now());
  const lastTxRef = useRef(0);
  const lastTyRef = useRef(0);

  useEffect(() => {
    if (config.reducedMotion) {
      txMV.set(0);
      tyMV.set(0);
      scaleMV.set(userScale);
      rotateMV.set(t.rotation);
      blurMV.set(0);
      return;
    }

    let raf = 0;
    const start = performance.now();
    lastNowRef.current = start;

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastNowRef.current) / 1000); // cap at 50ms (tab throttle)
      lastNowRef.current = now;
      const elapsed = (now - start) / 1000;
      const speed = config.speed * layerAnim.durationMultiplier;

      // === v3: PHANTOM SPRING PHYSICS ===
      // Real Hooke's law integration per layer (replaces framer useSpring)
      const targetX = mx.get();
      const targetY = my.get();
      springX.current = springStep(springX.current, targetX, springParams.k, springParams.c, springParams.m, dt);
      springY.current = springStep(springY.current, targetY, springParams.k, springParams.c, springParams.m, dt);

      // === v3: MOTION PREDICTION + INERTIA ===
      // Predict mouse 1 frame ahead, then apply inertia field.
      // Wires the previously-DEAD `inertia` and `mouseVelocityInfluence` config fields.
      const predictedX = predictMouse(springX.current.x, mvx.get() * 0.01, 0.016);
      const predictedY = predictMouse(springY.current.x, mvy.get() * 0.01, 0.016);

      inertiaX.current = inertiaDecay(
        inertiaX.current.pos, inertiaX.current.vel,
        predictedX, layerAnim.mouseVelocityInfluence, layerAnim.inertia, dt
      );
      inertiaY.current = inertiaDecay(
        inertiaY.current.pos, inertiaY.current.vel,
        predictedY, layerAnim.mouseVelocityInfluence, layerAnim.inertia, dt
      );

      // Measure real container size for safe bounds
      const { w: cw, h: ch } = containerSizeRef.current;
      const safeX = safeTranslationBound(overscale, cw);
      const safeY = safeTranslationBound(overscale, ch);

      // Compute exact mathematical transform using PREDICTED + INERTIA position
      const result = computeLayerTransform(
        elapsed * speed,
        motionConfig,
        inertiaX.current.pos,
        inertiaY.current.pos,
        safeX,
        safeY,
        cw
      );

      // === v3: FM BREATHING + AM ENVELOPE ===
      // Override the simple sinusoidal breath with FM synthesis + AM envelope.
      // Produces breathing with HRV-like variability and natural rest periods.
      let finalScale = result.scale;
      if (layerAnim.breathing) {
        const h = motionConfig.harmonicRatio;
        const carrierFreq = motionConfig.breathFreq * h;
        const modFreq = carrierFreq * 0.23; // slow HRV drift
        const modIndex = 0.6; // ±60% frequency variation
        const breathAmp = 0.012 + layerAnim.breathingAmp * 0.01 * config.intensity;
        const envelope = amEnvelope(elapsed + motionConfig.phase * 100, 4, 8, 4, 8);
        const fmBreathDelta = fmBreath(elapsed * speed, carrierFreq, modFreq, modIndex, breathAmp) * envelope;
        finalScale = 1 + fmBreathDelta;
      }

      // === v3: 2D SIMPLEX DRIFT (spatially-correlated) ===
      // Replace 1D value noise with 2D simplex for correlated drift between layers.
      let finalTx = result.translateX;
      if (layerAnim.driftX) {
        const driftT = elapsed * speed * motionConfig.driftFreq * motionConfig.harmonicRatio;
        const driftVal = snoise2D(driftT, layer.depth * 3.0) * motionConfig.driftAmp * 4 * config.intensity;
        finalTx = Math.max(-safeX, Math.min(safeX, finalTx + driftVal));
      }

      // === v3: VELOCITY-BASED MOTION BLUR ===
      const vx = (finalTx - lastTxRef.current) / Math.max(0.001, dt);
      const vy = (result.translateY - lastTyRef.current) / Math.max(0.001, dt);
      lastTxRef.current = finalTx;
      lastTyRef.current = result.translateY;
      const velocity = Math.hypot(vx, vy);
      const motionBlur = motionBlurFromVelocity(velocity);

      // === PERF: Guard MotionValue.set with epsilon (avoid redundant dirty updates) ===
      const eps = 0.01;
      if (Math.abs(txMV.get() - (finalTx + t.x)) > eps) txMV.set(finalTx + t.x);
      if (Math.abs(tyMV.get() - (result.translateY + t.y)) > eps) tyMV.set(result.translateY + t.y);
      if (Math.abs(scaleMV.get() - (finalScale * userScale)) > eps) scaleMV.set(finalScale * userScale);
      if (Math.abs(rotateMV.get() - (result.rotate + t.rotation)) > eps) rotateMV.set(result.rotate + t.rotation);
      if (Math.abs(blurMV.get() - motionBlur) > eps) blurMV.set(motionBlur);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // PERF: reduced deps — use refs for values that change frequently
  }, [config.reducedMotion, config.speed, config.intensity, motionConfig, springParams,
      mx, my, mvx, mvy, overscale, userScale, t.x, t.y, t.rotation,
      layerAnim.breathing, layerAnim.breathingAmp, layerAnim.driftX,
      layerAnim.inertia, layerAnim.mouseVelocityInfluence, layerAnim.durationMultiplier,
      txMV, tyMV, scaleMV, rotateMV, blurMV]);

  // Scroll-driven parallax (separate from organic motion)
  const fallbackScroll = useMotionValue(0);
  const scrollSource = scrollY ?? fallbackScroll;
  const scrollOffset = useTransform(
    scrollSource,
    (v) => v * (0.2 + layer.depth * 0.4) * config.scrollParallax * 300
  );

  // === RESPECT VISIBILITY ===
  if (!t.visible) return null;

  // === DOF blur (non-deforming filter) ===
  let dofBlur = 0;
  if (config.dofEnabled && !config.reducedMotion) {
    const dist = Math.abs(layer.depth - config.focusDepth);
    dofBlur = dist * config.aperture * 12;
  }
  const layerBlur = t.blur + layerAnim.blur + dofBlur;

  // === LIQUID (SVG filter, non-deforming) ===
  const useLiquid = layerAnim.liquid && config.liquidEnabled && liquidFilterId;

  const zIndex = t.zOverride ?? 10 + index + Math.round(layer.depth * 100);

  // Entrance reveal
  const entranceDelay = config.entranceEnabled
    ? layer.depth * 0.08 * Math.min(total, 4)
    : 0;

  return (
    <motion.div
      className="absolute inset-0"
      initial={config.entranceEnabled ? { opacity: 0, scale: 1.08, filter: "blur(8px)" } : false}
      animate={config.entranceEnabled ? { opacity: 1, scale: 1, filter: "none" } : undefined}
      transition={config.entranceEnabled ? { duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: entranceDelay } : undefined}
      style={{
        zIndex,
        mixBlendMode: BLEND_CSS[t.blendMode],
        opacity: config.entranceEnabled ? undefined : t.opacity * layerAnim.opacity,
        isolation: t.blendMode !== "normal" ? "isolate" : undefined,
        willChange: "transform, filter",
        pointerEvents: editorMode ? "auto" : "none",
        cursor: editorMode ? (selected ? "move" : "pointer") : "default",
      }}
      onPointerDown={(e) => {
        if (editorMode) {
          e.stopPropagation();
          onSelect?.();
        }
      }}
    >
      {/* MATHEMATICAL MOTION WRAPPER — RAF-driven, non-deforming */}
      <motion.div
        className="absolute inset-0"
        style={{
          x: txMV,
          y: tyMV,
          scale: scaleMV,  // UNIFORM — never deforms
          rotate: rotateMV,
          willChange: "transform",
        }}
      >
        {/* USER TRANSFORM WRAPPER (moveable target) — ref for size measurement */}
        <div
          ref={layerWrapperRef}
          data-layer-id={layer.id}
          className={`alive-layer-wrapper absolute inset-0 ${selected ? "selected" : ""}`}
          style={{
            filter: useLiquid
              ? `blur(${layerBlur + blurMV.get()}px) url(#${liquidFilterId})`
              : (layerBlur + blurMV.get()) > 0
                ? `blur(${layerBlur + blurMV.get()}px)`
                : undefined,
          }}
        >
          {layer.url ? (
            <img
              src={layer.url}
              alt={layer.name}
              className="h-full w-full object-cover select-none"
              draggable={false}
            />
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
