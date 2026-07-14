"use client";

import { useMemo } from "react";
import {
  Gauge,
  Layers as LayersIcon,
  Sparkles,
  Wind,
  Sun,
  TrendingUp,
  Lightbulb,
} from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * v3 INTELLIGENCE: Quality scoring + improvement suggestions.
 *
 * Analyzes the current animation configuration and computes a 0-100 score
 * based on: layer count, depth distribution, animation variety, effect
 * coherence, and visual balance. Shows specific actionable suggestions.
 */
export function QualityScore() {
  const layers = useAliveStore((s) => s.layers);
  const animation = useAliveStore((s) => s.animation);
  const analysis = useAliveStore((s) => s.analysis);

  const { score, breakdown, suggestions } = useMemo(() => {
    const layerCount = layers.length;
    const layerAnims = Object.values(animation.layers);

    // 1. Layer count score (0-20): ideal 5-8 layers
    let layerCountScore = 0;
    if (layerCount >= 5 && layerCount <= 8) layerCountScore = 20;
    else if (layerCount >= 4 && layerCount <= 10) layerCountScore = 15;
    else if (layerCount >= 3) layerCountScore = 10;
    else if (layerCount > 0) layerCountScore = 5;

    // 2. Depth distribution score (0-20): check if depths are spread out
    const depths = layers.map((l) => l.depth).sort((a, b) => a - b);
    let depthScore = 0;
    if (depths.length >= 2) {
      const range = depths[depths.length - 1] - depths[0];
      depthScore = Math.min(20, Math.round(range * 25));
    }

    // 3. Animation variety score (0-20): how many different animations are active
    const activeAnims = new Set<string>();
    layerAnims.forEach((la: any) => {
      const animFields = [
        "breathing", "sway", "twist", "floatY", "driftX", "wave", "jitter",
        "glow", "hueDrift", "focusPull", "shadowDrift", "chromatic", "liquid",
        "heartbeat", "vortex", "ripple", "zTilt", "sway3d", "breatheX", "scan",
      ];
      animFields.forEach((f) => {
        if (la[f]) activeAnims.add(f);
      });
    });
    const varietyScore = Math.min(20, activeAnims.size * 3);

    // 4. Effect coherence score (0-20): effects that match the scene
    let effectScore = 10; // base
    const activeEffects = Object.entries(animation.effects).filter(([, v]) => v);
    if (activeEffects.length >= 1 && activeEffects.length <= 4) effectScore = 20;
    else if (activeEffects.length === 0) effectScore = 8;
    else if (activeEffects.length > 6) effectScore = 5; // too many

    // 5. Visual balance score (0-20): intensity, vignette, chromatic in good ranges
    let balanceScore = 0;
    if (animation.intensity >= 0.7 && animation.intensity <= 1.3) balanceScore += 7;
    else balanceScore += 3;
    if (animation.vignette >= 0.15 && animation.vignette <= 0.45) balanceScore += 7;
    else balanceScore += 3;
    if (animation.chromaticAberration >= 0.5 && animation.chromaticAberration <= 3) balanceScore += 6;
    else if (animation.chromaticAberration === 0) balanceScore += 4;
    else balanceScore += 2;

    const total = layerCountScore + depthScore + varietyScore + effectScore + balanceScore;

    const breakdown = [
      { label: "Capas", score: layerCountScore, max: 20, icon: <LayersIcon className="h-3 w-3" /> },
      { label: "Profundidad", score: depthScore, max: 20, icon: <TrendingUp className="h-3 w-3" /> },
      { label: "Variedad", score: varietyScore, max: 20, icon: <Sparkles className="h-3 w-3" /> },
      { label: "Efectos", score: effectScore, max: 20, icon: <Sun className="h-3 w-3" /> },
      { label: "Balance", score: balanceScore, max: 20, icon: <Gauge className="h-3 w-3" /> },
    ];

    // Generate suggestions
    const suggestions: { text: string; priority: "high" | "medium" | "low" }[] = [];
    if (layerCount < 4) {
      suggestions.push({ text: "Pocas capas — prueba SLIC o más bandas K-means para mejor separación", priority: "high" });
    }
    if (depthScore < 15) {
      suggestions.push({ text: "Distribución de profundidad baja — las capas deberían cubrir todo el rango 0-1", priority: "medium" });
    }
    if (varietyScore < 12) {
      suggestions.push({ text: "Poca variedad de animaciones — activa más movimientos orgánicos en el ControlPanel", priority: "medium" });
    }
    if (activeEffects.length === 0) {
      suggestions.push({ text: "Sin efectos atmosféricos — prueba niebla, bokeh o light leak en la tab Atmósfera", priority: "low" });
    }
    if (activeEffects.length > 6) {
      suggestions.push({ text: "Demasiados efectos activos — puede verse sobrecargado, desactiva algunos", priority: "medium" });
    }
    if (animation.vignette < 0.15) {
      suggestions.push({ text: "Viñeta muy baja — subir a 0.25-0.35 da más foco cinematográfico", priority: "low" });
    }
    if (animation.intensity > 1.4) {
      suggestions.push({ text: "Intensidad muy alta — puede verse temblorosa, prueba 0.9-1.2", priority: "medium" });
    }
    if (!animation.dofEnabled && layerCount >= 5) {
      suggestions.push({ text: "Activa DOF (Pipeline 2.5D) para profundidad de campo cinematográfica", priority: "low" });
    }
    if (!animation.entranceEnabled) {
      suggestions.push({ text: "Entrance reveal desactivado — da un inicio más elegante", priority: "low" });
    }
    if (analysis?.recommendedConfig && animation.preset !== analysis.recommendedPreset) {
      suggestions.push({ text: `La IA recomienda el preset: ${analysis.recommendedPreset}`, priority: "high" });
    }

    return { score: total, breakdown, suggestions: suggestions.slice(0, 4) };
  }, [layers, animation, analysis]);

  const scoreColor =
    score >= 80 ? "text-emerald-400" :
    score >= 60 ? "text-primary" :
    score >= 40 ? "text-amber-400" :
    "text-rose-400";

  const scoreLabel =
    score >= 80 ? "Excelente" :
    score >= 60 ? "Bueno" :
    score >= 40 ? "Mejorable" :
    "Básico";

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Gauge className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-medium tracking-tight">Calidad de animación</h3>
      </header>

      {/* Score gauge */}
      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
            <circle
              cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4"
              strokeDasharray={`${(score / 100) * 176} 176`}
              strokeLinecap="round"
              className={scoreColor}
            />
          </svg>
          <span className={cn("absolute text-lg font-bold", scoreColor)}>{score}</span>
        </div>
        <div>
          <p className={cn("text-sm font-medium", scoreColor)}>{scoreLabel}</p>
          <p className="text-[10px] text-muted-foreground">Score de calidad</p>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="mb-3 space-y-1.5">
        {breakdown.map((b) => (
          <div key={b.label} className="flex items-center gap-2">
            <span className="flex w-20 items-center gap-1 text-[10px] text-muted-foreground">
              {b.icon}
              {b.label}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-primary/60 transition-all"
                style={{ width: `${(b.score / b.max) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right font-mono text-[9px] text-muted-foreground">
              {b.score}/{b.max}
            </span>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="h-3 w-3" />
            Sugerencias
          </p>
          {suggestions.map((s, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-1.5 rounded-md border px-2 py-1 text-[10px] leading-tight",
                s.priority === "high"
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : s.priority === "medium"
                    ? "border-amber-500/20 bg-amber-500/5 text-amber-400"
                    : "border-white/5 bg-white/[0.02] text-muted-foreground"
              )}
            >
              <Wind className="mt-0.5 h-2.5 w-2.5 flex-shrink-0" />
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
