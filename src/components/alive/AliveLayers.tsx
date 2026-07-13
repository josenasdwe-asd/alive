"use client";

import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import type { AnimationConfig, ImageLayer, LayerAnimationConfig } from "@/lib/types";
import { DEFAULT_LAYER_ANIM } from "@/lib/types";

interface AliveLayersProps {
  layers: ImageLayer[];
  config: AnimationConfig;
  backgroundUrl?: string;
  originalUrl: string;
  foregroundUrl?: string;
  liquidFilterId?: string;
}

// prime-ish durations so animations never re-sync (organic feel)
const DURATIONS = {
  breath: 6.2,
  sway: 8.3,
  float: 11.1,
  drift: 13.7,
};

export function AliveLayers({
  layers,
  config,
  backgroundUrl,
  originalUrl,
  foregroundUrl,
  liquidFilterId,
}: AliveLayersProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 50, damping: 20, mass: 0.5 });
  const smy = useSpring(my, { stiffness: 50, damping: 20, mass: 0.5 });

  useEffect(() => {
    if (config.reducedMotion || !config.parallaxEnabled) return;
    const el = containerRef.current;
    if (!el) return;

    const handle = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      mx.set(Math.max(-1.5, Math.min(1.5, x)));
      my.set(Math.max(-1.5, Math.min(1.5, y)));
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

  const planes = buildPlanes(layers, backgroundUrl, originalUrl, foregroundUrl);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ perspective: "1200px" }}
    >
      {planes.map((plane, i) => (
        <Plane
          key={plane.id}
          plane={plane}
          index={i}
          smx={smx}
          smy={smy}
          config={config}
          liquidFilterId={liquidFilterId}
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
}

interface PlaneProps {
  plane: PlaneData;
  index: number;
  smx: MotionValue<number>;
  smy: MotionValue<number>;
  config: AnimationConfig;
  liquidFilterId?: string;
}

function Plane({ plane, index, smx, smy, config, liquidFilterId }: PlaneProps) {
  const layerAnim: LayerAnimationConfig =
    config.layers[plane.layerId] ??
    ({ layerId: plane.layerId, ...DEFAULT_LAYER_ANIM } as LayerAnimationConfig);

  const depthFactor = 0.3 + plane.depth * 1.4;
  const intensity = config.intensity;
  const pxToMove =
    (config.parallaxEnabled ? layerAnim.parallaxStrength : 0) *
    depthFactor *
    intensity;

  const tx = useTransform(smx, (v) => v * pxToMove);
  const ty = useTransform(smy, (v) => v * pxToMove * 0.7);

  const breathDur = (DURATIONS.breath / Math.max(0.2, config.speed)).toFixed(2);
  const swayDur = (DURATIONS.sway / Math.max(0.2, config.speed)).toFixed(2);
  const floatDur = (DURATIONS.float / Math.max(0.2, config.speed)).toFixed(2);
  const driftDur = (DURATIONS.drift / Math.max(0.2, config.speed)).toFixed(2);

  const animations: string[] = [];
  const ampVars: Record<string, string | number> = {};
  if (layerAnim.breathing && !config.reducedMotion) {
    animations.push(`alive-breath ${breathDur}s ease-in-out infinite`);
    ampVars["--breath-amp"] = layerAnim.breathingAmp * intensity;
  }
  if (layerAnim.sway && !config.reducedMotion) {
    animations.push(`alive-sway ${swayDur}s ease-in-out infinite`);
    ampVars["--sway"] = `${layerAnim.swayAmp * intensity * 0.5}deg`;
  }
  if (layerAnim.floatY && !config.reducedMotion) {
    animations.push(`alive-float-y ${floatDur}s ease-in-out infinite`);
    ampVars["--float-y"] = `${layerAnim.floatAmp * 6 * intensity}px`;
  }
  if (layerAnim.driftX && !config.reducedMotion) {
    animations.push(`alive-drift-x ${driftDur}s ease-in-out infinite`);
    ampVars["--drift-x"] = `${layerAnim.driftAmp * 4 * intensity}px`;
  }

  const useLiquid =
    layerAnim.liquid && config.liquidEnabled && liquidFilterId;
  const filter = useLiquid
    ? `url(#${liquidFilterId})`
    : layerAnim.blur > 0
      ? `blur(${layerAnim.blur}px)`
      : "none";

  const overscale = 1.08 + plane.depth * 0.04;

  return (
    <motion.div
      className="alive-layer absolute inset-0"
      style={
        {
          x: tx,
          y: ty,
          scale: overscale,
          opacity: layerAnim.opacity,
          filter,
          animation: animations.join(", ") || undefined,
          zIndex: 10 + index,
          willChange: "transform, filter",
          ...ampVars,
        } as React.CSSProperties
      }
    >
      {plane.url ? (
         
        <img
          src={plane.url}
          alt={plane.alt}
          className="h-full w-full object-cover"
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
  });

  if (foregroundUrl) {
    const fgLayer = layers.find((l) => l.role === "foreground");
    planes.push({
      id: "plane-fg",
      layerId: fgLayer?.id ?? "foreground",
      depth: fgLayer?.depth ?? 0.95,
      url: foregroundUrl,
      alt: "Foreground layer",
    });
  }

  return planes;
}
