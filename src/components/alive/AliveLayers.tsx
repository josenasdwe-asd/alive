"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
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
  backgroundUrl?: string;
  originalUrl: string;
  foregroundUrl?: string;
  liquidFilterId?: string;
  /** when true, layers can be clicked to select (editor mode) */
  editorMode?: boolean;
  selectedLayerId?: string;
  onSelectLayer?: (id: string) => void;
  onLayerTransform?: (id: string, transform: Partial<ImageLayer["transform"]>) => void;
}

// prime-ish durations so animations never re-sync (organic feel)
const DURATIONS = {
  breath: 6.2,
  sway: 8.3,
  twist: 11.3,
  float: 11.1,
  drift: 13.7,
  wave: 9.4,
  jitter: 0.18, // fast boil
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

export function AliveLayers({
  layers,
  config,
  backgroundUrl,
  originalUrl,
  foregroundUrl,
  liquidFilterId,
  editorMode = false,
  selectedLayerId,
  onSelectLayer,
  onLayerTransform,
}: AliveLayersProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const mvx = useMotionValue(0); // mouse velocity x
  const mvy = useMotionValue(0); // mouse velocity y
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
      const vx = ((e.clientX - lastX) / dt) * 16; // normalize to ~frame
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

  const planes = buildPlanes(layers, backgroundUrl, originalUrl, foregroundUrl);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ perspective: "1200px" }}
      onPointerDown={(e) => {
        if (editorMode && onSelectLayer) {
          // click on empty area deselects
          if (e.target === e.currentTarget) onSelectLayer("");
        }
      }}
    >
      {planes.map((plane, i) => (
        <Plane
          key={plane.id}
          plane={plane}
          index={i}
          smx={smx}
          smy={smy}
          smvx={smvx}
          smvy={smvy}
          config={config}
          liquidFilterId={liquidFilterId}
          editorMode={editorMode}
          selected={selectedLayerId === plane.layerId}
          onSelect={() => onSelectLayer?.(plane.layerId)}
          onTransform={(t) => onLayerTransform?.(plane.layerId, t)}
        />
      ))}
    </div>
  );
}

interface PlaneData {
  id: string;
  layerId: string;
  depth: number;
  url?: string;
  alt: string;
  fallback?: ReactNode;
  transform: ImageLayer["transform"];
}

interface PlaneProps {
  plane: PlaneData;
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
  onTransform?: (t: Partial<ImageLayer["transform"]>) => void;
}

function Plane({
  plane,
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
  onTransform,
}: PlaneProps) {
  const layerAnim: LayerAnimationConfig =
    config.layers[plane.layerId] ??
    ({ layerId: plane.layerId, ...DEFAULT_LAYER_ANIM } as LayerAnimationConfig);

  const t = plane.transform;
  const depthFactor = 0.3 + plane.depth * 1.4;
  const intensity = config.intensity;
  const pxToMove =
    (config.parallaxEnabled ? layerAnim.parallaxStrength : 0) *
    depthFactor *
    intensity;

  // base parallax from mouse position
  const baseTx = useTransform(smx, (v) => v * pxToMove + t.x);
  const baseTy = useTransform(smy, (v) => v * pxToMove * 0.7 + t.y);

  // mouse velocity adds a "wind" push
  const velX = useTransform(
    smvx,
    (v) => v * layerAnim.mouseVelocityInfluence * intensity * (0.3 + plane.depth)
  );
  const velY = useTransform(
    smvy,
    (v) => v * layerAnim.mouseVelocityInfluence * intensity * (0.3 + plane.depth) * 0.5
  );
  const tx = useTransform([baseTx, velX], (vals) => (vals[0] as number) + (vals[1] as number));
  const ty = useTransform([baseTy, velY], (vals) => (vals[0] as number) + (vals[1] as number));

  // durations — per-layer multiplier + phase offset (negative delay)
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

  // apply negative delay for phase offset (after the first animation)
  const style: React.CSSProperties = {
    animationDelay: phaseDelay,
    mixBlendMode: BLEND_CSS[t.blendMode],
    opacity: t.opacity * layerAnim.opacity,
    zIndex: t.zOverride ?? 10 + index + Math.round(plane.depth * 100),
  };

  // filter (liquid + per-layer blur + chromatic)
  const useLiquid =
    layerAnim.liquid && config.liquidEnabled && liquidFilterId;
  const layerBlur = t.blur + layerAnim.blur;
  ampVars["--layer-blur"] = `${layerBlur}px`;

  const filters: string[] = [];
  if (useLiquid) filters.push(`url(#${liquidFilterId})`);
  // the .alive-layer utility already adds blur/focus/glow/hue/shadow via filter
  // we don't override — let CSS handle it

  // overscale: cover parallax edges + user scale
  const overscale = (1.08 + plane.depth * 0.04) * t.scale;

  return (
    <motion.div
      className={`alive-layer absolute inset-0 ${selected ? "selected" : ""}`}
      data-layer-id={plane.layerId}
      style={
        {
          x: tx,
          y: ty,
          scale: overscale,
          rotate: t.rotation,
          ...style,
          ...ampVars,
          willChange: "transform, filter",
          cursor: editorMode ? "move" : "default",
          pointerEvents: editorMode ? "auto" : "none",
        } as React.CSSProperties
      }
      onPointerDown={(e) => {
        if (editorMode) {
          e.stopPropagation();
          onSelect?.();
        }
      }}
    >
      {plane.url ? (
        <img
          src={plane.url}
          alt={plane.alt}
          className="h-full w-full object-cover select-none"
          draggable={false}
        />
      ) : (
        plane.fallback
      )}
    </motion.div>
  );
}

function buildPlanes(
  layers: ImageLayer[],
  backgroundUrl: string | undefined,
  originalUrl: string,
  foregroundUrl: string | undefined
): PlaneData[] {
  const planes: PlaneData[] = [];

  const bgLayer = layers.find((l) => l.role === "background");
  if (backgroundUrl) {
    planes.push({
      id: "plane-bg",
      layerId: bgLayer?.id ?? layers[0]?.id ?? "bg",
      depth: bgLayer?.depth ?? 0.1,
      url: backgroundUrl,
      alt: "Background layer",
      transform: bgLayer?.transform ?? ({} as ImageLayer["transform"]),
    });
  }

  const subjectLayer = layers.find((l) => l.role === "subject");
  const midLayer = layers.find((l) => l.role === "midground");
  planes.push({
    id: "plane-original",
    layerId:
      subjectLayer?.id ??
      midLayer?.id ??
      layers[layers.length - 1]?.id ??
      "subject",
    depth: subjectLayer?.depth ?? midLayer?.depth ?? 0.6,
    url: originalUrl,
    alt: "Main image",
    transform:
      subjectLayer?.transform ??
      midLayer?.transform ??
      ({} as ImageLayer["transform"]),
  });

  if (foregroundUrl) {
    const fgLayer = layers.find((l) => l.role === "foreground");
    planes.push({
      id: "plane-fg",
      layerId: fgLayer?.id ?? "foreground",
      depth: fgLayer?.depth ?? 0.95,
      url: foregroundUrl,
      alt: "Foreground layer",
      transform: fgLayer?.transform ?? ({} as ImageLayer["transform"]),
    });
  }

  return planes;
}
