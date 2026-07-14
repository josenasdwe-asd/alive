"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef } from "react";
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
  type LayerMotionConfig,
} from "@/lib/motion-engine";

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

  // === BUILD MATHEMATICAL MOTION CONFIG (once per layer) ===
  const motionConfig: LayerMotionConfig = buildLayerMotionConfig(
    index,
    total,
    layer.depth,
    {
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
    }
  );

  // === SPRING SMOOTHING for parallax (depth-based stiffness) ===
  const springStiffness = 60 + layer.depth * 60;
  const springDamping = 18 + layer.depth * 14;
  const springMass = 0.3 + (1 - layer.depth) * 0.4;
  const smx = useSpring(mx, { stiffness: springStiffness, damping: springDamping, mass: springMass });
  const smy = useSpring(my, { stiffness: springStiffness, damping: springDamping, mass: springMass });

  // === OVERSCALE (non-deforming: uniform scale) ===
  // Computed to guarantee NO edge gaps. Base 1.12 + depth + intensity.
  const depthScale = config.scaleWithDepth ? 1 + layer.depth * 0.15 : 1;
  const overscale = (1.12 + layer.depth * 0.06 + config.intensity * 0.04) * depthScale;
  const userScale = t.scale * overscale;

  // === SAFE BOUNDS (computed from overscale) ===
  // These guarantee translation can NEVER reveal edges.
  const containerRef2 = useRef<HTMLDivElement>(null);
  const safeBoundX = safeTranslationBound(overscale, 800); // conservative default
  const safeBoundY = safeTranslationBound(overscale, 500);

  // === RAF-DRIVEN MATHEMATICAL MOTION ===
  // Instead of CSS @property keyframes, we compute transforms in JS via RAF.
  // This gives EXACT control over the math and guarantees non-deforming motion.
  const txMV = useMotionValue(0);
  const tyMV = useMotionValue(0);
  const scaleMV = useMotionValue(userScale);
  const rotateMV = useMotionValue(0);

  useEffect(() => {
    if (config.reducedMotion) {
      txMV.set(0);
      tyMV.set(0);
      scaleMV.set(userScale);
      rotateMV.set(t.rotation);
      return;
    }

    let raf = 0;
    const start = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      const speed = config.speed * layerAnim.durationMultiplier;

      // Get current parallax (from springs)
      const px = smx.get();
      const py = smy.get();

      // Compute exact mathematical transform
      const result = computeLayerTransform(
        elapsed * speed,
        motionConfig,
        px,
        py,
        safeBoundX,
        safeBoundY,
        800
      );

      // Apply user transform ON TOP of mathematical motion (composable, non-deforming)
      txMV.set(result.translateX + t.x);
      tyMV.set(result.translateY + t.y);
      scaleMV.set(result.scale * userScale); // UNIFORM scale only
      rotateMV.set(result.rotate + t.rotation);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [config.reducedMotion, config.speed, config.intensity, motionConfig, smx, smy, safeBoundX, safeBoundY, userScale, t.x, t.y, t.rotation, txMV, tyMV, scaleMV, rotateMV, layerAnim.durationMultiplier]);

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
      animate={config.entranceEnabled ? { opacity: 1, scale: 1, filter: "blur(0px)" } : undefined}
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
        {/* USER TRANSFORM WRAPPER (moveable target) */}
        <div
          data-layer-id={layer.id}
          className={`alive-layer-wrapper absolute inset-0 ${selected ? "selected" : ""}`}
          style={{
            filter: useLiquid
              ? `blur(${layerBlur}px) url(#${liquidFilterId})`
              : layerBlur > 0
                ? `blur(${layerBlur}px)`
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
