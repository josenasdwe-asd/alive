"use client";

import { useEffect, useRef } from "react";

interface AtmosphericAnimationProps {
  type: "light-cycle" | "fog-drift" | "timelapse" | "seasonal";
  enabled: boolean;
  speed: number;
  intensity: number;
}

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
    let lastKey = ""; // only write styles when state changes

    const tick = () => {
      const t = ((performance.now() - start) / 1000) * speed;
      const cycle = (t % 30) / 30;

      let bg = "";
      let blend = "normal";
      let key = "";

      switch (type) {
        case "light-cycle": {
          const isDay = cycle < 0.4 || cycle > 0.9;
          const isGolden = (cycle >= 0.3 && cycle < 0.45) || (cycle >= 0.85 && cycle < 0.95);
          const isNight = cycle >= 0.5 && cycle < 0.8;

          if (isNight) { key = "night"; bg = `linear-gradient(180deg, rgba(10,15,40,${0.35 * intensity}), rgba(20,30,60,${0.2 * intensity}))`; blend = "multiply"; }
          else if (isGolden) { key = "golden"; bg = `linear-gradient(180deg, rgba(255,180,80,${0.2 * intensity}), rgba(255,120,40,${0.15 * intensity}))`; blend = "soft-light"; }
          else { key = "day"; bg = `linear-gradient(180deg, rgba(255,250,240,${0.05 * intensity}), transparent)`; }
          break;
        }
        case "fog-drift": {
          key = "fog";
          const fogX = (cycle * 200 - 50);
          bg = `radial-gradient(ellipse 60% 40% at ${fogX}% 60%, rgba(220,225,230,${0.3 * intensity}), transparent 70%)`;
          blend = "screen";
          break;
        }
        case "timelapse": {
          key = "tl";
          const sunX = cycle * 100;
          const sunY = 30 + Math.sin(cycle * Math.PI) * -20;
          const warmth = Math.sin(cycle * Math.PI);
          const r = 255, g = Math.round(240 - warmth * 60), b = Math.round(200 - warmth * 120);
          bg = `radial-gradient(circle 200px at ${sunX}% ${sunY}%, rgba(${r},${g},${b},${0.25 * intensity}), transparent 60%)`;
          blend = "soft-light";
          break;
        }
        case "seasonal": {
          key = "season";
          const hue = (cycle * 60) % 360;
          bg = `hsla(${hue}, 30%, 50%, ${0.08 * intensity})`;
          blend = "color";
          break;
        }
      }

      // Only write DOM when state changes (not every frame)
      if (key !== lastKey || type === "fog-drift" || type === "timelapse") {
        el.style.background = bg;
        el.style.mixBlendMode = blend;
        lastKey = key;
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
      className="pointer-events-none absolute inset-0"
    />
  );
}
