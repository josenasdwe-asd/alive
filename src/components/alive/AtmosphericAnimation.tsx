"use client";

import { useEffect, useRef } from "react";

interface AtmosphericAnimationProps {
  type: "light-cycle" | "fog-drift" | "timelapse" | "seasonal";
  enabled: boolean;
  speed: number;
  intensity: number;
}

/**
 * Atmospheric animations — elegant cinematographic effects that go beyond
 * simple parallax. These overlay the entire stage with time-based environmental
 * changes.
 *
 * - light-cycle: day→night color temperature shift over 30s loop
 * - fog-drift: rolling fog bank that slowly crosses the scene
 * - timelapse: accelerated light movement (sun arc)
 * - seasonal: subtle hue rotation simulating seasons
 */
export function AtmosphericAnimation({
  type,
  enabled,
  speed,
  intensity,
}: AtmosphericAnimationProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !layerRef.current) return;
    const el = layerRef.current;
    let raf = 0;
    let start = performance.now();

    const tick = () => {
      const t = ((performance.now() - start) / 1000) * speed;
      const cycle = (t % 30) / 30; // 0..1 over 30s

      switch (type) {
        case "light-cycle": {
          // day (0) → golden hour (0.3) → dusk (0.5) → night (0.7) → dawn (0.95) → day
          const isDay = cycle < 0.4 || cycle > 0.9;
          const isGolden = (cycle >= 0.3 && cycle < 0.45) || (cycle >= 0.85 && cycle < 0.95);
          const isNight = cycle >= 0.5 && cycle < 0.8;

          if (isNight) {
            el.style.background = `linear-gradient(180deg, rgba(10,15,40,${0.35 * intensity}), rgba(20,30,60,${0.2 * intensity}))`;
            el.style.mixBlendMode = "multiply";
          } else if (isGolden) {
            el.style.background = `linear-gradient(180deg, rgba(255,180,80,${0.2 * intensity}), rgba(255,120,40,${0.15 * intensity}))`;
            el.style.mixBlendMode = "soft-light";
          } else {
            el.style.background = `linear-gradient(180deg, rgba(255,250,240,${0.05 * intensity}), transparent)`;
            el.style.mixBlendMode = "normal";
          }
          el.style.opacity = "1";
          break;
        }
        case "fog-drift": {
          // fog bank crosses left to right over 20s
          const fogX = (cycle * 200 - 50); // -50% to 150%
          el.style.background = `radial-gradient(ellipse 60% 40% at ${fogX}% 60%, rgba(220,225,230,${0.3 * intensity}), transparent 70%)`;
          el.style.mixBlendMode = "screen";
          el.style.opacity = "1";
          break;
        }
        case "timelapse": {
          // sun arc: light source moves across sky
          const sunX = cycle * 100;
          const sunY = 30 + Math.sin(cycle * Math.PI) * -20; // arc up then down
          const warmth = Math.sin(cycle * Math.PI); // peak warmth at midday
          const r = 255;
          const g = Math.round(240 - warmth * 60);
          const b = Math.round(200 - warmth * 120);
          el.style.background = `radial-gradient(circle 200px at ${sunX}% ${sunY}%, rgba(${r},${g},${b},${0.25 * intensity}), transparent 60%)`;
          el.style.mixBlendMode = "soft-light";
          el.style.opacity = "1";
          break;
        }
        case "seasonal": {
          // hue rotation over 60s
          const hue = (cycle * 60) % 360;
          el.style.background = `hsla(${hue}, 30%, 50%, ${0.08 * intensity})`;
          el.style.mixBlendMode = "color";
          el.style.opacity = "1";
          break;
        }
      }

      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => cancelAnimationFrame(raf);
  }, [enabled, type, speed, intensity]);

  if (!enabled) return null;

  return (
    <div
      ref={layerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-all duration-1000"
    />
  );
}
