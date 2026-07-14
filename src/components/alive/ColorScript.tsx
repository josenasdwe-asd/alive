"use client";

import { useEffect, useRef } from "react";

interface ColorScriptProps {
  enabled: boolean;
  /** which act (0..4) or -1 for auto-cycle */
  act: number;
  speed: number;
}

/**
 * Cinematic color script — 5 acts following narrative structure.
 * Each act has a distinct color palette that shifts the mood:
 *
 * 0. Establishment — neutral, balanced (introduce the world)
 * 1. Inciting incident — warm golden (something is about to happen)
 * 2. Rising action — cool teal (tension building)
 * 3. Climax — high contrast orange/teal (peak drama)
 * 4. Resolution — soft warm pink (peace restored)
 *
 * When act = -1, auto-cycles through all 5 acts over 60s loop.
 */
const ACTS = [
  {
    name: "Establecimiento",
    // neutral, slight warm
    overlay: "linear-gradient(180deg, rgba(255,250,240,0.04), rgba(240,235,220,0.03))",
    blend: "soft-light" as const,
  },
  {
    name: "Incidente",
    // warm golden hour
    overlay: "linear-gradient(180deg, rgba(255,200,100,0.12), rgba(255,160,60,0.08))",
    blend: "soft-light" as const,
  },
  {
    name: "Tensión",
    // cool teal
    overlay: "linear-gradient(180deg, rgba(60,120,140,0.15), rgba(40,80,100,0.1))",
    blend: "soft-light" as const,
  },
  {
    name: "Clímax",
    // high contrast orange/teal
    overlay: "linear-gradient(135deg, rgba(255,120,40,0.15), rgba(0,80,100,0.12))",
    blend: "overlay" as const,
  },
  {
    name: "Resolución",
    // soft warm pink
    overlay: "linear-gradient(180deg, rgba(255,200,210,0.1), rgba(255,180,150,0.06))",
    blend: "soft-light" as const,
  },
];

export function ColorScript({ enabled, act, speed }: ColorScriptProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !layerRef.current) return;
    const el = layerRef.current;
    let raf = 0;
    let start = performance.now();

    const tick = () => {
      const t = ((performance.now() - start) / 1000) * speed;
      // auto-cycle: 12s per act = 60s total
      const currentAct = act >= 0 ? act : Math.floor((t / 12) % 5);
      const phaseInAct = act >= 0 ? 0 : (t % 12) / 12;

      // cross-fade between acts: last 2s of each act blends into next
      const nextAct = (currentAct + 1) % 5;
      const blendFactor = phaseInAct > 0.83 ? (phaseInAct - 0.83) / 0.17 : 0;

      const a = ACTS[currentAct];
      const b = ACTS[nextAct];

      el.style.background = a.overlay;
      el.style.mixBlendMode = a.blend;
      el.style.opacity = String(1 - blendFactor * 0.5);

      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => cancelAnimationFrame(raf);
  }, [enabled, act, speed]);

  if (!enabled) return null;

  return (
    <div
      ref={layerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 14 }}
    />
  );
}

export function getColorScriptActName(act: number): string {
  if (act < 0 || act >= ACTS.length) return "Auto-cycle";
  return ACTS[act].name;
}
