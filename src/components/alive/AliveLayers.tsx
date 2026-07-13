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
}: AliveLayersProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const mvx = useMotionValue(0);
  const mvy = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 50, damping: 20, mass: 0.5 });
  const smy = useSpring(my, { stiffness: 50, damping: 20, mass: 0.5 });
  const smvx = useSpring(mvx, { stiffness: 80, damping: 30 });
  const smvy = useSpring(mvy, { stiffness: 80, damping: 30 });

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
          smx={smx}
          smy={smy}
          smvx={smvx}
          smvy={smvy}
          config={config}
          liquidFilterId={liquidFilterId}
          editorMode={editorMode}
          selected={selectedLayerId === layer.id}
          onSelect={() => onSelectLayer?.(layer.id)}
        />
      ))}
    </div>
  );
}

interface LayerPlaneProps {
  layer: ImageLayer;
  index: number;
  smx: MotionValue<number>;
  smy: MotionValue<number>;
  smvx: MotionValue<number>;
  smvy: MotionValue<number>;
  config: AnimationConfig;
  liquidFilterId?: string;
  editorMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

function LayerPlane({
  layer,
  index,
  smx,
  smy,
  smvx,
  smvy,
  config,
  liquidFilterId,
  editorMode,
  selected,
  onSelect,
}: LayerPlaneProps) {
  const t = layer.transform;

  const layerAnim: LayerAnimationConfig =
    config.layers[layer.id] ??
    ({ layerId: layer.id, ...DEFAULT_LAYER_ANIM } as LayerAnimationConfig);

  const depthFactor = 0.3 + layer.depth * 1.4;
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
  const tx = useTransform([parallaxX, velX] as any, (vals: any) => vals[0] + vals[1]);
  const ty = useTransform([parallaxY, velY] as any, (vals: any) => vals[0] + vals[1]);

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
  const layerBlur = t.blur + layerAnim.blur;
  ampVars["--layer-blur"] = `${layerBlur}px`;

  const overscale = 1.08 + layer.depth * 0.04;
  const userScale = t.scale * overscale;
  const zIndex = t.zOverride ?? 10 + index + Math.round(layer.depth * 100);

  return (
    // OUTER wrapper — parallax (framer-motion owns x/y here)
    <motion.div
      className="absolute inset-0"
      style={{
        x: tx,
        y: ty,
        zIndex,
        mixBlendMode: BLEND_CSS[t.blendMode],
        opacity: t.opacity * layerAnim.opacity,
        isolation: t.blendMode !== "normal" ? "isolate" : undefined,
        willChange: "transform",
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
      {/* INNER content — user transform (plain CSS, moveable controls this) */}
      {/* The .alive-layer class applies breathing/sway/etc via @property */}
      <div
        className={`alive-layer absolute inset-0 ${selected ? "selected" : ""}`}
        data-layer-id={layer.id}
        style={
          {
            transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${userScale}) rotate(${t.rotation}deg)`,
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
  );
}
