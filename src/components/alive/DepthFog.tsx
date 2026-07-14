"use client";

import { useMemo } from "react";

interface DepthFogProps {
  enabled: boolean;
  /** fog density 0..1 */
  density: number;
  /** fog color (default: atmospheric blue-white) */
  color?: string;
  layers: Array<{ depth: number }>;
}

/**
 * Depth-aware volumetric fog — smooth continuous gradient.
 *
 * Instead of discrete bands, uses a single vertical gradient that goes from
 * opaque (top = far) to transparent (bottom = near), with screen blend.
 * This creates atmospheric perspective — distant elements fade into haze.
 *
 * Mathematically: fogOpacity(y) = density * (1 - y/H) * 0.5
 * where y=0 is top (farthest) and y=H is bottom (nearest).
 */
export function DepthFog({
  enabled,
  density,
  color = "rgba(180, 200, 220, 1)",
  layers,
}: DepthFogProps) {
  const fogStyle = useMemo(() => {
    if (!enabled || layers.length === 0) return null;

    // find the depth distribution to position fog correctly
    const minDepth = Math.min(...layers.map((l) => l.depth));
    const fogStart = minDepth * 40; // % from top where fog starts
    const fogEnd = 50 + density * 30; // % from top where fog ends

    // continuous gradient: opaque at top → transparent at bottom
    const colorBase = color.replace(/[\d.]+\)$/, "");
    return {
      background: `linear-gradient(180deg,
        ${colorBase}${density * 0.45}) 0%,
        ${colorBase}${density * 0.3}) ${fogStart}%,
        ${colorBase}${density * 0.15}) ${fogEnd}%,
        transparent 100%)`,
      mixBlendMode: "screen" as const,
      opacity: 0.9,
    };
  }, [enabled, density, color, layers]);

  if (!enabled || !fogStyle) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={fogStyle}
    />
  );
}
