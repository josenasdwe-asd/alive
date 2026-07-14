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
 * Depth-aware volumetric fog.
 * Each layer gets a white overlay proportional to its depth (farther = foggier).
 * Mathematically: fogOpacity = (1 - depth) * density * 0.5
 *
 * This creates atmospheric perspective — distant layers fade into haze,
 * giving true depth perception (not just parallax).
 */
export function DepthFog({
  enabled,
  density,
  color = "rgba(180, 200, 220, 1)",
  layers,
}: DepthFogProps) {
  const fogBands = useMemo(() => {
    if (!enabled || layers.length === 0) return [];
    // create a few fog gradient bands at different depths
    return [
      { depth: 0.1, opacity: density * 0.4 },
      { depth: 0.3, opacity: density * 0.25 },
      { depth: 0.5, opacity: density * 0.12 },
    ];
  }, [enabled, density, layers]);

  if (!enabled) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {fogBands.map((band, i) => {
        // each band is a horizontal gradient: more opaque at top (far), transparent at bottom (near)
        const yStart = (1 - band.depth) * 60; // % from top
        return (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${color.replace("1)", `${band.opacity})`)} 0%, transparent ${yStart + 20}%, transparent 100%)`,
              mixBlendMode: "screen",
              opacity: 0.8,
            }}
          />
        );
      })}
    </div>
  );
}
