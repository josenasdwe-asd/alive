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

interface AliveLayersProps {
  layers: ImageLayer[];
  config: AnimationConfig;
  liquidFilterId?: string;
  editorMode?: boolean;
  selectedLayerId?: string;
  onSelectLayer?: (id: string) => void;
  onLayerTransform?: (id: string, transform: Partial<ImageLayer["transform"]>) => void;
  /** optional scroll progress 0..1 for scroll-driven parallax (hero mode) */
  scrollY?: MotionValue<number>;
}

const DURATIONS = {
  breath: 6.2,
  sway: 8.3,
  twist: 11.3,
  float: 11.1,
  drift: 13.7,
  wave: 9.4,
  jitter: 0.18,
  glow: 5.7,
  hue: 28,
  focus: 14.3,
  shadow: 9.7,
};

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
 * Nivel 1 renderer — 1 plane per layer (no hardcoded bg/original/fg).
 * Each layer is a full independent entity: own URL, transform, visibility.
 *
 * Architecture (Awwwards-inspired):
 *  - Outer wrapper: parallax (mouse-driven, framer-motion controlled)
 *  - Inner content: user transform (drag/scale/rotate via moveable) — NEVER touched by framer
 *  This split eliminates the framer-motion/react-moveable transform fight.
 */
export function AliveLayers({
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

  // sort layers back→front for correct painter's order
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

  // === FOLLOW-THROUGH (Principle 5): per-layer spring with depth-based stiffness ===
  // CALIBRATED: near layers react fast, far layers lag slightly (not too much)
  const springStiffness = 60 + layer.depth * 60;  // 60..120 (was 30..110)
  const springDamping = 18 + layer.depth * 14;     // 18..32 (was 15..30)
  const springMass = 0.3 + (1 - layer.depth) * 0.4; // 0.3..0.7 (was 0.3..1.1 — too heavy)
  const smx = useSpring(mx, { stiffness: springStiffness, damping: springDamping, mass: springMass });
  const smy = useSpring(my, { stiffness: springStiffness, damping: springDamping, mass: springMass });
  const smvx = useSpring(mvx, { stiffness: 60 + layer.depth * 60, damping: 25 });
  const smvy = useSpring(mvy, { stiffness: 60 + layer.depth * 60, damping: 25 });

  const layerAnim: LayerAnimationConfig =
    config.layers[layer.id] ??
    ({ layerId: layer.id, ...DEFAULT_LAYER_ANIM } as LayerAnimationConfig);

  // CALIBRATED: less aggressive depth factor (was 0.3 + 1.4 = 1.7 max, now 0.2 + 1.0 = 1.2 max)
  const depthFactor = 0.2 + layer.depth * 1.0;
  const intensity = config.intensity;
  const pxToMove =
    (config.parallaxEnabled ? layerAnim.parallaxStrength : 0) *
    depthFactor *
    intensity;

  // parallax transform (framer-motion) — separate from user transform
  const parallaxX = useTransform(smx, (v) => v * pxToMove);
  const parallaxY = useTransform(smy, (v) => v * pxToMove * 0.7);
  const velX = useTransform(
    smvx,
    (v) => v * layerAnim.mouseVelocityInfluence * intensity * (0.3 + layer.depth)
  );
  const velY = useTransform(
    smvy,
    (v) => v * layerAnim.mouseVelocityInfluence * intensity * (0.3 + layer.depth) * 0.5
  );
  // scroll-driven parallax: back layers move less, front layers move more
  const fallbackScroll = useMotionValue(0);
  const scrollSource = scrollY ?? fallbackScroll;
  const scrollOffset = useTransform(
    scrollSource,
    (v) => v * (0.2 + layer.depth * 0.4) * config.scrollParallax * 300
  );
  const tx = useTransform([parallaxX, velX] as any, (vals: any) => vals[0] + vals[1]);

  // === ARCS (Principle 7): layers move in a parabola, not a straight line ===
  // y gets a subtle quadratic offset based on x position — gives organic arc motion
  const arcY = useTransform(smx, (v) => -Math.abs(v) * pxToMove * 0.15 * layer.depth);

  const ty = useTransform(
    [parallaxY, velY, scrollOffset, arcY] as any,
    (vals: any) => vals[0] + vals[1] + (vals[2] ?? 0) + (vals[3] ?? 0)
  );

  // === SQUASH & STRETCH (Principle 1): at parallax extremes, layers deform elastically ===
  // CALIBRATED: doubled from 0.03/0.02 to 0.06/0.04 for perceptible elastic feel
  const squashX = useTransform(smx, (v) => 1 + Math.abs(v) * 0.06 * layer.depth * intensity);
  const squashY = useTransform(smx, (v) => 1 - Math.abs(v) * 0.04 * layer.depth * intensity);

  // === BUG FIX #1: respect visibility (after all hooks) ===
  if (!t.visible) return null;

  // durations
  const dm = layerAnim.durationMultiplier;
  const speed = config.speed * dm;
  const phaseDelay = `-${(layerAnim.phaseOffset * 6).toFixed(2)}s`;

  const breathDur = (DURATIONS.breath / Math.max(0.2, speed)).toFixed(2);
  const swayDur = (DURATIONS.sway / Math.max(0.2, speed)).toFixed(2);
  const twistDur = (DURATIONS.twist / Math.max(0.2, speed)).toFixed(2);
  const floatDur = (DURATIONS.float / Math.max(0.2, speed)).toFixed(2);
  const driftDur = (DURATIONS.drift / Math.max(0.2, speed)).toFixed(2);
  const waveDur = (DURATIONS.wave / Math.max(0.2, speed)).toFixed(2);
  const jitterDur = DURATIONS.jitter.toFixed(3);
  const glowDur = (DURATIONS.glow / Math.max(0.2, speed)).toFixed(2);
  const hueDur = (DURATIONS.hue / Math.max(0.2, speed)).toFixed(2);
  const focusDur = (DURATIONS.focus / Math.max(0.2, speed)).toFixed(2);
  const shadowDur = (DURATIONS.shadow / Math.max(0.2, speed)).toFixed(2);

  const animations: string[] = [];
  const ampVars: Record<string, string | number> = {};

  if (!config.reducedMotion) {
    if (layerAnim.breathing) {
      animations.push(`alive-breath ${breathDur}s ease-in-out infinite`);
      ampVars["--breath-amp"] = layerAnim.breathingAmp * intensity;
    }
    if (layerAnim.sway) {
      animations.push(`alive-sway ${swayDur}s ease-in-out infinite`);
      ampVars["--sway"] = `${layerAnim.swayAmp * intensity * 0.5}deg`;
    }
    if (layerAnim.twist) {
      animations.push(`alive-twist ${twistDur}s ease-in-out infinite`);
      ampVars["--twist"] = `${layerAnim.twistAmp * intensity}deg`;
    }
    if (layerAnim.floatY) {
      animations.push(`alive-float-y ${floatDur}s ease-in-out infinite`);
      ampVars["--float-y"] = `${layerAnim.floatAmp * 6 * intensity}px`;
    }
    if (layerAnim.driftX) {
      animations.push(`alive-drift-x ${driftDur}s ease-in-out infinite`);
      ampVars["--drift-x"] = `${layerAnim.driftAmp * 4 * intensity}px`;
    }
    if (layerAnim.wave) {
      animations.push(`alive-wave ${waveDur}s ease-in-out infinite`);
      ampVars["--wave-x"] = `${layerAnim.waveAmp * 8 * intensity}px`;
    }
    if (layerAnim.jitter) {
      animations.push(`alive-jitter ${jitterDur}s steps(1) infinite`);
      ampVars["--jitter-x"] = `${layerAnim.jitterAmp * 1.5 * intensity}px`;
      ampVars["--jitter-y"] = `${layerAnim.jitterAmp * 1.5 * intensity}px`;
    }
    if (layerAnim.glow) {
      animations.push(`alive-glow ${glowDur}s ease-in-out infinite`);
      ampVars["--glow"] = layerAnim.glowAmp * intensity;
    }
    if (layerAnim.hueDrift) {
      animations.push(`alive-hue ${hueDur}s linear infinite`);
      ampVars["--hue"] = `${layerAnim.hueDriftAmp * intensity}deg`;
    }
    if (layerAnim.focusPull) {
      animations.push(`alive-focus ${focusDur}s ease-in-out infinite`);
      ampVars["--focus"] = `${layerAnim.focusAmp * intensity}px`;
    }
    if (layerAnim.shadowDrift) {
      animations.push(`alive-shadow ${shadowDur}s ease-in-out infinite`);
    }
  }

  const useLiquid =
    layerAnim.liquid && config.liquidEnabled && liquidFilterId;

  // === 2.5D DOF: organic focus pull based on layer depth ===
  // blur = aperture * |layer.depth - focusDepth| * maxBlur
  // This emulates a real lens: layers far from focal plane get more blur
  let dofBlur = 0;
  if (config.dofEnabled && !config.reducedMotion) {
    const focusDepth = config.focusMode === "object" && config.focusLayerId
      ? (config.layers[config.focusLayerId] ? layer.depth : config.focusDepth)
      : config.focusDepth;
    const dist = Math.abs(layer.depth - focusDepth);
    dofBlur = dist * config.aperture * 12; // CALIBRATED: was 20, now 12 (max 12px — more natural)
  }

  const layerBlur = t.blur + layerAnim.blur + dofBlur;
  ampVars["--layer-blur"] = `${layerBlur}px`;

  // === Scale-with-depth: layers auto-scale based on Z (Disguise "Scale with depth") ===
  const depthScale = config.scaleWithDepth ? 1 + layer.depth * 0.15 : 1;
  const overscale = (1.08 + layer.depth * 0.04) * depthScale;
  const userScale = t.scale * overscale;
  const zIndex = t.zOverride ?? 10 + index + Math.round(layer.depth * 100);

  // entrance reveal: back layers first, front layers last, expo.out
  // CALIBRATED: faster stagger (0.08 vs 0.12) and max 4 layers (was 6) = max 0.32s (was 0.72s)
  const entranceDelay = config.entranceEnabled
    ? layer.depth * 0.08 * Math.min(total, 4)
    : 0;

  return (
    // OUTER wrapper — entrance reveal (opacity + scale + blur)
    <motion.div
      className="absolute inset-0"
      initial={config.entranceEnabled ? { opacity: 0, scale: 1.08, filter: "blur(8px)" } : false}
      animate={
        config.entranceEnabled
          ? { opacity: 1, scale: 1, filter: "blur(0px)" }
          : undefined
      }
      transition={
        config.entranceEnabled
          ? { duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: entranceDelay }
          : undefined
      }
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
      {/* MIDDLE wrapper — parallax + squash (separate from entrance to avoid conflict) */}
      <motion.div
        className="absolute inset-0"
        style={{
          x: tx,
          y: ty,
          scaleX: squashX,
          scaleY: squashY,
          willChange: "transform",
        }}
      >
      {/* INNER content — user transform (plain CSS, moveable controls this) */}
      {/* The .alive-layer class applies breathing/sway/etc via @property */}
      <div
        className={`alive-layer absolute inset-0 ${selected ? "selected" : ""}`}
        data-layer-id={layer.id}
        style={
          {
            transform: `scale(${userScale}) rotate(${t.rotation}deg)`,
            animationDelay: phaseDelay,
            animation: animations.join(", ") || undefined,
            filter: useLiquid ? `url(#${liquidFilterId})` : undefined,
            ...ampVars,
          } as React.CSSProperties
        }
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
