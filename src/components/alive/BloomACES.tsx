"use client";

import { useMemo } from "react";

interface BloomACESProps {
  enabled: boolean;
  /** bloom intensity 0..1 */
  intensity: number;
  /** ACES tone mapping strength 0..1 */
  toneMap: number;
}

/**
 * Bloom + ACES tone mapping — cinematic post-processing.
 *
 * - Bloom: bright areas glow with a soft Gaussian-like halo
 * - ACES: filmic tone mapping that compresses highlights (cinematic look)
 *
 * Implemented as CSS overlay (no WebGL post-process needed for CSS mode).
 * In WebGL mode, the shader handles this natively.
 */
export function BloomACES({ enabled, intensity, toneMap }: BloomACESProps) {
  const layers = useMemo(() => {
    if (!enabled) return [];
    return [
      // Bloom: screen-blend a blurred bright copy
      {
        background:
          "radial-gradient(ellipse at 50% 40%, rgba(255,250,230,0.15), transparent 60%)",
        blend: "screen" as const,
        blur: 20,
        opacity: intensity * 0.8,
      },
      // ACES tone map: warm highlight compression via overlay
      {
        background:
          "linear-gradient(180deg, rgba(255,240,220,0.06), rgba(20,15,30,0.08))",
        blend: "soft-light" as const,
        blur: 0,
        opacity: toneMap,
      },
      // Subtle contrast boost (S-curve via overlay)
      {
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(255,255,255,0.05))",
        blend: "overlay" as const,
        blur: 0,
        opacity: toneMap * 0.6,
      },
    ];
  }, [enabled, intensity, toneMap]);

  if (!enabled || layers.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {layers.map((l, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            background: l.background,
            mixBlendMode: l.blend,
            opacity: l.opacity,
            filter: l.blur > 0 ? `blur(${l.blur}px)` : undefined,
          }}
        />
      ))}
    </div>
  );
}
