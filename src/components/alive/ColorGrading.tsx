"use client";

import { useMemo } from "react";
import type { ColorGrade } from "@/lib/types";

interface ColorGradingProps {
  grade: ColorGrade;
  intensity?: number;
}

/**
 * Cinematic color grading via CSS blend modes (no LUT file needed).
 * Each grade is a stack of gradient overlays with specific blend modes
 * that emulate film emulation LUTs.
 *
 * Based on research: shadows→highlights mapped via linear-gradient + mix-blend-mode.
 */
const GRADES: Record<
  Exclude<ColorGrade, "none">,
  Array<{ bg: string; blend: string; opacity: number }>
> = {
  "teal-orange": [
    // shadows → teal, highlights → orange
    { bg: "linear-gradient(180deg, rgba(0,80,120,0.35) 0%, rgba(0,40,60,0) 50%, rgba(255,140,40,0.25) 100%)", blend: "soft-light", opacity: 0.9 },
    // boost contrast
    { bg: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(255,255,255,0.05) 100%)", blend: "overlay", opacity: 0.6 },
  ],
  "bleach-bypass": [
    // desaturated + high contrast (Saving Private Ryan look)
    { bg: "linear-gradient(180deg, rgba(40,40,50,0.4) 0%, rgba(200,200,210,0.15) 100%)", blend: "color", opacity: 0.7 },
    { bg: "rgba(255,255,255,0.08)", blend: "overlay", opacity: 0.5 },
  ],
  portra: [
    // warm film stock — warm shadows, cream highlights
    { bg: "linear-gradient(180deg, rgba(80,50,20,0.3) 0%, rgba(255,240,210,0.15) 100%)", blend: "soft-light", opacity: 0.8 },
    { bg: "rgba(255,220,180,0.06)", blend: "color", opacity: 0.4 },
  ],
  "blade-runner": [
    // teal + magenta + orange — cyberpunk
    { bg: "linear-gradient(135deg, rgba(0,60,80,0.4) 0%, rgba(120,20,80,0.3) 50%, rgba(255,120,40,0.25) 100%)", blend: "soft-light", opacity: 0.9 },
    { bg: "radial-gradient(ellipse at 70% 30%, rgba(255,180,80,0.15), transparent 60%)", blend: "screen", opacity: 0.5 },
  ],
  "noir-film": [
    // high-contrast B&W
    { bg: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(255,255,255,0.1) 100%)", blend: "color", opacity: 0.85 },
    { bg: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.3) 100%)", blend: "overlay", opacity: 0.7 },
  ],
};

export function ColorGrading({ grade, intensity = 1 }: ColorGradingProps) {
  const layers = useMemo(() => {
    if (grade === "none") return [];
    return (GRADES[grade] ?? []).map((l) => ({
      ...l,
      opacity: l.opacity * intensity,
    }));
  }, [grade, intensity]);

  if (layers.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {layers.map((l, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            background: l.bg,
            mixBlendMode: l.blend as React.CSSProperties["mixBlendMode"],
            opacity: l.opacity,
          }}
        />
      ))}
    </div>
  );
}
