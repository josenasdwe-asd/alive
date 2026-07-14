"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useRef } from "react";
import type {
  AnimationConfig,
  ImageLayer,
  LayerAnimationConfig,
  BlendMode,
} from "@/lib/types";
import { DEFAULT_LAYER_ANIM } from "@/lib/types";

interface AliveCSS3DProps {
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
 * Nivel 2 — CSS 3D estereoscópico, 1 plane per layer.
 * Container rotates with mouse; each layer positioned at translateZ(depth).
 */
export function AliveCSS3D({
  layers,
  config,
  liquidFilterId,
  editorMode = false,
  selectedLayerId,
  onSelectLayer,
}: AliveCSS3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 60, damping: 20, mass: 0.6 });
  const smy = useSpring(my, { stiffness: 60, damping: 20, mass: 0.6 });
  const rotateY = useTransform(smx, (v) => v * config.rotate3dStrength);
  const rotateX = useTransform(smy, (v) => -v * config.rotate3dStrength);

  useEffect(() => {
    if (config.reducedMotion || !config.parallaxEnabled) return;
    const el = containerRef.current;
    if (!el) return;
    const handle = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      mx.set(Math.max(-1.2, Math.min(1.2, x)));
      my.set(Math.max(-1.2, Math.min(1.2, y)));
    };
    const reset = () => {
      mx.set(0);
      my.set(0);
    };
    el.addEventListener("pointermove", handle);
    el.addEventListener("pointerleave", reset);
    return () => {
      el.removeEventListener("pointermove", handle);
      el.removeEventListener("pointerleave", reset);
    };
  }, [config.reducedMotion, config.parallaxEnabled, mx, my]);

  const sorted = [...layers].sort((a, b) => a.depth - b.depth);
  const zRange = 800;

  return (
    <motion.div
      ref={containerRef}
      className="absolute inset-0"
      style={
        {
          perspective: `${config.perspective}px`,
          transformStyle: "preserve-3d",
          rotateX,
          rotateY,
          isolation: "isolate",
        } as React.CSSProperties
      }
      onPointerDown={(e) => {
        if (editorMode && onSelectLayer && e.target === e.currentTarget) {
          onSelectLayer("");
        }
      }}
    >
      {sorted.map((layer, i) => (
        <CSS3DLayer
          key={layer.id}
          layer={layer}
          index={i}
          total={sorted.length}
          zRange={zRange}
          config={config}
          liquidFilterId={liquidFilterId}
          editorMode={editorMode}
          selected={selectedLayerId === layer.id}
          onSelect={() => onSelectLayer?.(layer.id)}
        />
      ))}
    </motion.div>
  );
}

interface CSS3DLayerProps {
  layer: ImageLayer;
  index: number;
  total: number;
  zRange: number;
  config: AnimationConfig;
  liquidFilterId?: string;
  editorMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

function CSS3DLayer({
  layer,
  index,
  total,
  zRange,
  config,
  liquidFilterId,
  editorMode,
  selected,
  onSelect,
}: CSS3DLayerProps) {
  const t = layer.transform;

  const layerAnim: LayerAnimationConfig =
    config.layers[layer.id] ??
    ({ layerId: layer.id, ...DEFAULT_LAYER_ANIM } as LayerAnimationConfig);

  const intensity = config.intensity;
  const translateZ = (layer.depth - 0.5) * zRange;

  const dm = layerAnim.durationMultiplier;
  const speed = config.speed * dm;
  const phaseDelay = `-${(layerAnim.phaseOffset * 6).toFixed(2)}s`;

  const breathDur = (DURATIONS.breath / Math.max(0.2, speed)).toFixed(2);
  const swayDur = (DURATIONS.sway / Math.max(0.2, speed)).toFixed(2);
  const twistDur = (DURATIONS.twist / Math.max(0.2, speed)).toFixed(2);
  const floatDur = (DURATIONS.float / Math.max(0.2, speed)).toFixed(2);
  const driftDur = (DURATIONS.drift / Math.max(0.2, speed)).toFixed(2);

  // === BUG FIX #1: respect visibility ===
  if (!t.visible) return null;

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
  }

  const useLiquid =
    layerAnim.liquid && config.liquidEnabled && liquidFilterId;

  // === DOF (same calibration as AliveLayers) ===
  let dofBlur = 0;
  if (config.dofEnabled && !config.reducedMotion) {
    const focusDepth = config.focusMode === "object" && config.focusLayerId
      ? (config.layers[config.focusLayerId] ? layer.depth : config.focusDepth)
      : config.focusDepth;
    const dist = Math.abs(layer.depth - focusDepth);
    dofBlur = dist * config.aperture * 12;
  }

  const layerBlur = t.blur + layerAnim.blur + dofBlur;
  ampVars["--layer-blur"] = `${layerBlur}px`;

  // === Scale-with-depth (same as AliveLayers) ===
  const depthScale = config.scaleWithDepth ? 1 + layer.depth * 0.15 : 1;
  const overscale = (1.15 + layer.depth * 0.05) * depthScale * t.scale;
  const zIndex = t.zOverride ?? 10 + index + Math.round(layer.depth * 100);

  // entrance reveal (same calibration as AliveLayers)
  const entranceDelay = config.entranceEnabled
    ? layer.depth * 0.08 * Math.min(total, 4)
    : 0;

  return (
    // OUTER: 3D position (translateZ) + blend + opacity
    <div
      className="absolute inset-0"
      style={{
        transform: `translateZ(${translateZ}px)`,
        transformStyle: "preserve-3d",
        mixBlendMode: BLEND_CSS[t.blendMode],
        opacity: t.opacity * layerAnim.opacity,
        zIndex,
        isolation: t.blendMode !== "normal" ? "isolate" : undefined,
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
      {/* INNER: user transform + organic animations */}
      <div
        className={`alive-layer absolute inset-0 ${selected ? "selected" : ""}`}
        data-layer-id={layer.id}
        style={
          {
            transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${overscale}) rotate(${t.rotation}deg)`,
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
    </div>
  );
}
