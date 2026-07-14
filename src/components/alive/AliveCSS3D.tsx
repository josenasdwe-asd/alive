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
  wave: 9.4,
  jitter: 0.18,
  glow: 5.7,
  hue: 28,
  focus: 14.3,
  shadow: 9.7,
  // v3 animation durations
  heartbeat: 2.4,
  vortex: 16.5,
  ripple: 7.2,
  zTilt: 12.1,
  sway3d: 10.4,
  breatheX: 5.3,
  scan: 3.8,
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
          allLayers={sorted}
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
  allLayers: ImageLayer[];
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
  allLayers,
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

  // HARMONIC ratios so layers NEVER sync
  const HARMONIC = [1.0, 1.618, 2.414, 3.303, 4.791, 6.404, 8.284, 10.445, 12.896, 15.652];
  const h = HARMONIC[index % HARMONIC.length];
  const dm = layerAnim.durationMultiplier;
  const speed = config.speed * dm;
  const phaseDelay = `-${(layerAnim.phaseOffset * 6).toFixed(2)}s`;

  const breathDur = (DURATIONS.breath * h / Math.max(0.2, speed)).toFixed(2);
  const swayDur = (DURATIONS.sway * h / Math.max(0.2, speed)).toFixed(2);
  const twistDur = (DURATIONS.twist / Math.max(0.2, speed)).toFixed(2);
  const floatDur = (DURATIONS.float / Math.max(0.2, speed)).toFixed(2);
  const driftDur = (DURATIONS.drift / Math.max(0.2, speed)).toFixed(2);
  const waveDur = (DURATIONS.wave / Math.max(0.2, speed)).toFixed(2);
  const jitterDur = DURATIONS.jitter.toFixed(3);
  const glowDur = (DURATIONS.glow / Math.max(0.2, speed)).toFixed(2);
  const hueDur = (DURATIONS.hue / Math.max(0.2, speed)).toFixed(2);
  const focusDur = (DURATIONS.focus / Math.max(0.2, speed)).toFixed(2);
  const shadowDur = (DURATIONS.shadow / Math.max(0.2, speed)).toFixed(2);
  // v3 durations
  const heartbeatDur = (DURATIONS.heartbeat / Math.max(0.2, speed)).toFixed(2);
  const vortexDur = (DURATIONS.vortex / Math.max(0.2, speed)).toFixed(2);
  const rippleDur = (DURATIONS.ripple / Math.max(0.2, speed)).toFixed(2);
  const zTiltDur = (DURATIONS.zTilt / Math.max(0.2, speed)).toFixed(2);
  const sway3dDur = (DURATIONS.sway3d / Math.max(0.2, speed)).toFixed(2);
  const breatheXDur = (DURATIONS.breatheX / Math.max(0.2, speed)).toFixed(2);
  const scanDur = (DURATIONS.scan / Math.max(0.2, speed)).toFixed(2);

  // === BUG FIX #1: respect visibility ===
  if (!t.visible) return null;

  const animations: string[] = [];
  const ampVars: Record<string, string | number> = {};

  if (!config.reducedMotion) {
    // BUG C2 FIX: all ampVars now use the `-amp` suffix to match globals.css.
    // Previously: --sway, --twist, --float-y, --drift-x (without -amp) — these
    // overrode the animated 0→1 @property vars AND the amplitude vars the CSS
    // calc actually reads were never set, so 4 of 5 animations were doubly dead.
    if (layerAnim.breathing) {
      animations.push(`alive-breath ${breathDur}s ease-in-out infinite`);
      ampVars["--breath-amp"] = layerAnim.breathingAmp * intensity * 0.04;
    }
    if (layerAnim.sway) {
      animations.push(`alive-sway ${swayDur}s ease-in-out infinite`);
      ampVars["--sway-amp"] = `${layerAnim.swayAmp * intensity * 0.5}deg`;
    }
    if (layerAnim.twist) {
      animations.push(`alive-twist ${twistDur}s ease-in-out infinite`);
      ampVars["--twist-amp"] = `${layerAnim.twistAmp * intensity}deg`;
    }
    if (layerAnim.floatY) {
      animations.push(`alive-float-y ${floatDur}s ease-in-out infinite`);
      ampVars["--float-y-amp"] = `${layerAnim.floatAmp * 6 * intensity}px`;
    }
    if (layerAnim.driftX) {
      animations.push(`alive-drift-x ${driftDur}s ease-in-out infinite`);
      ampVars["--drift-x-amp"] = `${layerAnim.driftAmp * 4 * intensity}px`;
    }
    // BUG D1 FIX: added the 6 missing organic animations (wave, jitter, glow,
    // hueDrift, focusPull, shadowDrift) — parity with AliveLayers.
    if (layerAnim.wave) {
      animations.push(`alive-wave ${waveDur}s ease-in-out infinite`);
      ampVars["--wave-x-amp"] = `${layerAnim.waveAmp * 8 * intensity}px`;
    }
    if (layerAnim.jitter) {
      animations.push(`alive-jitter ${jitterDur}s steps(1) infinite`);
      ampVars["--jitter-x-amp"] = `${layerAnim.jitterAmp * 1.5 * intensity}px`;
      ampVars["--jitter-y-amp"] = `${layerAnim.jitterAmp * 1.5 * intensity}px`;
    }
    if (layerAnim.glow) {
      animations.push(`alive-glow ${glowDur}s ease-in-out infinite`);
      ampVars["--glow-amp"] = layerAnim.glowAmp * intensity;
    }
    if (layerAnim.hueDrift) {
      animations.push(`alive-hue ${hueDur}s linear infinite`);
      ampVars["--hue-amp"] = `${layerAnim.hueDriftAmp * intensity}deg`;
    }
    if (layerAnim.focusPull) {
      animations.push(`alive-focus ${focusDur}s ease-in-out infinite`);
      ampVars["--focus-amp"] = `${layerAnim.focusAmp * intensity}px`;
    }
    if (layerAnim.shadowDrift) {
      animations.push(`alive-shadow ${shadowDur}s ease-in-out infinite`);
      ampVars["--shadow-amp"] = `${4 * intensity}px`;
    }
    // v3 animations — parity with AliveLayers
    if (layerAnim.heartbeat) {
      animations.push(`alive-heartbeat ${heartbeatDur}s ease-in-out infinite`);
      ampVars["--heartbeat-amp"] = layerAnim.heartbeatAmp * intensity * 0.05;
    }
    if (layerAnim.vortex) {
      animations.push(`alive-vortex ${vortexDur}s ease-in-out infinite`);
      ampVars["--vortex-amp"] = layerAnim.vortexAmp * intensity * 0.5 * 0.01;
      ampVars["--vortex-rot-amp"] = `${layerAnim.vortexRotAmp * intensity}deg`;
    }
    if (layerAnim.ripple) {
      animations.push(`alive-ripple ${rippleDur}s ease-in-out infinite`);
      ampVars["--ripple-x-amp"] = `${layerAnim.rippleAmp * intensity}px`;
      ampVars["--ripple-y-amp"] = `${layerAnim.rippleAmp * intensity * 0.6}px`;
    }
    if (layerAnim.zTilt) {
      animations.push(`alive-z-tilt ${zTiltDur}s ease-in-out infinite`);
      ampVars["--z-tilt-amp"] = `${layerAnim.zTiltAmp * intensity}deg`;
    }
    if (layerAnim.sway3d) {
      animations.push(`alive-sway-3d ${sway3dDur}s ease-in-out infinite`);
      ampVars["--sway-3d-amp"] = `${layerAnim.sway3dAmp * intensity}deg`;
    }
    if (layerAnim.breatheX) {
      animations.push(`alive-breathe-x ${breatheXDur}s ease-in-out infinite`);
      ampVars["--breathe-x-amp"] = layerAnim.breatheXAmp * intensity * 0.04;
    }
    if (layerAnim.scan) {
      animations.push(`alive-scan ${scanDur}s linear infinite`);
      ampVars["--scan-amp"] = layerAnim.scanAmp * intensity;
    }
  }

  const useLiquid =
    layerAnim.liquid && config.liquidEnabled && liquidFilterId;

  // === DOF (same calibration as AliveLayers) ===
  let dofBlur = 0;
  if (config.dofEnabled && !config.reducedMotion) {
    // BUG FIX: same as AliveLayers — find focused layer's actual depth
    let focusDepth = config.focusDepth;
    if (config.focusMode === "object" && config.focusLayerId) {
      const focusedLayer = allLayers.find((l) => l.id === config.focusLayerId);
      if (focusedLayer) focusDepth = focusedLayer.depth;
    }
    const dist = Math.abs(layer.depth - focusDepth);
    dofBlur = dist * config.aperture * 12;
  }

  const layerBlur = t.blur + layerAnim.blur + dofBlur;
  ampVars["--layer-blur"] = `${layerBlur}px`;

  // === Scale-with-depth + perspective compensation (BUG B2 FIX) ===
  // Old: overscale = (1.15 + depth*0.05) × depthScale × t.scale
  //   back layer (depth=0, translateZ=-400, perspective=1200) shrinks to 0.75× on screen
  //   → effective 1.15×0.75 = 0.86× < 1.0 → EDGE GAPS when container rotates.
  // New: divide by perspective factor so back layers compensate for shrink.
  const depthScale = config.scaleWithDepth ? 1 + layer.depth * 0.15 : 1;
  const perspectiveFactor = config.perspective / (config.perspective - translateZ);
  const overscale = ((1.10 + layer.depth * 0.04) * depthScale * t.scale) * perspectiveFactor;
  const zIndex = t.zOverride ?? 10 + index + Math.round(layer.depth * 100);

  // entrance reveal (same calibration as AliveLayers) — BUG D2 FIX: now actually applied
  const entranceDelay = config.entranceEnabled
    ? layer.depth * 0.08 * Math.min(total, 4)
    : 0;

  return (
    // OUTER: 3D position (translateZ) + blend + opacity + entrance reveal
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
        transform: `translateZ(${translateZ}px)`,
        transformStyle: "preserve-3d",
        mixBlendMode: BLEND_CSS[t.blendMode],
        opacity: config.entranceEnabled ? undefined : t.opacity * layerAnim.opacity,
        zIndex,
        isolation: t.blendMode !== "normal" ? "isolate" : undefined,
        pointerEvents: editorMode ? "auto" : "none",
        cursor: editorMode ? (selected ? "move" : "pointer") : "default",
        willChange: "transform, filter",
      }}
      onPointerDown={(e) => {
        if (editorMode) {
          e.stopPropagation();
          onSelect?.();
        }
      }}
    >
      {/* USER TRANSFORM wrapper — moveable target (BUG F fix, same as AliveLayers)
       * User transform lives HERE on a separate wrapper. The .alive-layer child
       * handles ONLY organic animation transform via CSS calc. Parent × child = composed. */}
      <div
        data-layer-id={layer.id}
        className={`alive-layer-wrapper absolute inset-0 ${selected ? "selected" : ""}`}
        style={{
          transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${overscale}) rotate(${t.rotation}deg)`,
        }}
      >
        {/* ORGANIC ANIMATION layer — CSS calc transform + filter */}
        <div
          className="alive-layer absolute inset-0"
          style={
            {
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
    </motion.div>
  );
}
