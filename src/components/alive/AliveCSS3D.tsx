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

interface AliveCSS3DProps {
  layers: ImageLayer[];
  config: AnimationConfig;
  backgroundUrl?: string;
  originalUrl: string;
  foregroundUrl?: string;
  liquidFilterId?: string;
  editorMode?: boolean;
  selectedLayerId?: string;
  onSelectLayer?: (id: string) => void;
  onLayerTransform?: (id: string, transform: Partial<ImageLayer["transform"]>) => void;
}

// prime-ish durations for organic desync
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
 * Nivel 2 — CSS 3D estereoscópico.
 * Cada capa se posiciona en Z real con translateZ(). El contenedor rota
 * con el mouse (rotateX/rotateY) y el navegador calcula la perspectiva
 * matemáticamente correcta — parallax estereoscópico real, no aproximado.
 */
export function AliveCSS3D({
  layers,
  config,
  backgroundUrl,
  originalUrl,
  foregroundUrl,
  liquidFilterId,
  editorMode = false,
  selectedLayerId,
  onSelectLayer,
}: AliveCSS3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  // spring for smooth rotation
  const smx = useSpring(mx, {
    stiffness: 60,
    damping: 20,
    mass: 0.6,
  });
  const smy = useSpring(my, {
    stiffness: 60,
    damping: 20,
    mass: 0.6,
  });

  // container rotation from mouse
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

  const planes = buildPlanes(layers, backgroundUrl, originalUrl, foregroundUrl);

  // Z range: far layers at -400px, near at +400px
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
        } as React.CSSProperties
      }
      onPointerDown={(e) => {
        if (editorMode && onSelectLayer && e.target === e.currentTarget) {
          onSelectLayer("");
        }
      }}
    >
      {planes.map((plane, i) => (
        <CSS3DPlane
          key={plane.id}
          plane={plane}
          index={i}
          zRange={zRange}
          config={config}
          liquidFilterId={liquidFilterId}
          editorMode={editorMode}
          selected={selectedLayerId === plane.layerId}
          onSelect={() => onSelectLayer?.(plane.layerId)}
        />
      ))}
    </motion.div>
  );
}

interface PlaneData {
  id: string;
  layerId: string;
  depth: number;
  url?: string;
  alt: string;
  transform: ImageLayer["transform"];
}

interface PlaneProps {
  plane: PlaneData;
  index: number;
  zRange: number;
  config: AnimationConfig;
  liquidFilterId?: string;
  editorMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

function CSS3DPlane({
  plane,
  index,
  zRange,
  config,
  liquidFilterId,
  editorMode,
  selected,
  onSelect,
}: PlaneProps) {
  const layerAnim: LayerAnimationConfig =
    config.layers[plane.layerId] ??
    ({ layerId: plane.layerId, ...DEFAULT_LAYER_ANIM } as LayerAnimationConfig);

  const t = plane.transform;
  const intensity = config.intensity;

  // TRUE 3D Z position: depth 0 → -zRange/2, depth 1 → +zRange/2
  const translateZ = (plane.depth - 0.5) * zRange;

  // durations
  const dm = layerAnim.durationMultiplier;
  const speed = config.speed * dm;
  const phaseDelay = `-${(layerAnim.phaseOffset * 6).toFixed(2)}s`;

  const breathDur = (DURATIONS.breath / Math.max(0.2, speed)).toFixed(2);
  const swayDur = (DURATIONS.sway / Math.max(0.2, speed)).toFixed(2);
  const twistDur = (DURATIONS.twist / Math.max(0.2, speed)).toFixed(2);
  const floatDur = (DURATIONS.float / Math.max(0.2, speed)).toFixed(2);
  const driftDur = (DURATIONS.drift / Math.max(0.2, speed)).toFixed(2);

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
  const layerBlur = t.blur + layerAnim.blur;
  ampVars["--layer-blur"] = `${layerBlur}px`;

  // scale to cover perspective shrink (closer Z = appears larger naturally, but we need to overscale to cover edges during rotation)
  const overscale = (1.15 + plane.depth * 0.05) * t.scale;

  return (
    <div
      className={`alive-layer absolute inset-0 ${selected ? "selected" : ""}`}
      data-layer-id={plane.layerId}
      style={
        {
          // TRUE 3D: translateZ positions the layer in 3D space
          transform: `translateZ(${translateZ}px) translate3d(${t.x}px, ${t.y}px, 0) scale(${overscale}) rotate(${t.rotation}deg)`,
          transformStyle: "preserve-3d",
          mixBlendMode: BLEND_CSS[t.blendMode],
          opacity: t.opacity * layerAnim.opacity,
          zIndex: t.zOverride ?? 10 + index + Math.round(plane.depth * 100),
          animationDelay: phaseDelay,
          filter: useLiquid ? `url(#${liquidFilterId})` : undefined,
          willChange: "transform, filter",
          cursor: editorMode ? "move" : "default",
          pointerEvents: editorMode ? "auto" : "none",
          ...ampVars,
          animation: animations.join(", ") || undefined,
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
    </div>
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
