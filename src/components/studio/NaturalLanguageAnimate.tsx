"use client";

import { useState, useRef } from "react";
import { Sparkles, Loader2, Send, Brain } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Hazlo soñador y lento con luz cálida",
  "Cyberpunk neón intenso",
  "Niebla atmosférica cinematográfica",
  "Zen minimalista y pacífico",
  "Retro vintage con grano de película",
  "Dramático épico con profundidad 3D",
];

/**
 * v3 INTELLIGENCE: Natural language animation input.
 * User types a desired feeling → LLM parses → applies config patch.
 *
 * This is the most "magical" intelligence feature — the user doesn't need to
 * know what a preset or color grade is. They just describe the feeling.
 */
export function NaturalLanguageAnimate() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const analysis = useAliveStore((s) => s.analysis);
  const updateAnimation = useAliveStore((s) => s.updateAnimation);
  const applyPreset = useAliveStore((s) => s.applyPreset);
  const applySceneComp = useAliveStore((s) => s.applySceneComp);
  const toggleEffect = useAliveStore((s) => s.toggleEffect);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (text?: string) => {
    const q = (text ?? prompt).trim();
    if (!q || loading) return;

    setLoading(true);
    setPrompt(q);
    try {
      const res = await fetch("/api/nl-animate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q, analysis }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      const config = data.config || {};
      const applied: string[] = [];

      // Apply preset
      if (config.preset) {
        applyPreset(config.preset);
        applied.push(config.preset);
      }

      // Build animation patch
      const patch: any = {};
      if (config.intensity !== undefined) patch.intensity = config.intensity;
      if (config.speed !== undefined) patch.speed = config.speed;
      if (config.renderMode !== undefined) patch.renderMode = config.renderMode;
      if (config.colorGrade !== undefined) patch.colorGrade = config.colorGrade;
      if (config.chromaticAberration !== undefined) patch.chromaticAberration = config.chromaticAberration;
      if (config.vignette !== undefined) patch.vignette = config.vignette;
      if (config.depthFogEnabled !== undefined) patch.depthFogEnabled = config.depthFogEnabled;
      if (config.bloomEnabled !== undefined) patch.bloomEnabled = config.bloomEnabled;
      if (config.relightingEnabled !== undefined) patch.relightingEnabled = config.relightingEnabled;
      if (config.dofEnabled !== undefined) patch.dofEnabled = config.dofEnabled;

      if (Object.keys(patch).length > 0) {
        updateAnimation(patch);
        applied.push(`${Object.keys(patch).length} ajustes`);
      }

      // Apply effects
      if (config.effects && typeof config.effects === "object") {
        let effectCount = 0;
        for (const [k, v] of Object.entries(config.effects)) {
          if (v) {
            // only toggle on if currently off
            if (!useAliveStore.getState().animation.effects[k as any]) {
              toggleEffect(k as any);
              effectCount++;
            }
          }
        }
        if (effectCount > 0) applied.push(`${effectCount} efectos`);
      }

      toast.success(`🧠 IA interpretó: "${q}"`, {
        description: applied.length > 0 ? `Aplicado: ${applied.join(" + ")}` : "Sin cambios",
      });
      setPrompt("");
    } catch (err: any) {
      toast.error(err?.message ?? "Error interpretando");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Brain className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-medium tracking-tight">Animar con IA</h3>
          <p className="text-[10px] text-muted-foreground">Describe el feeling en lenguaje natural</p>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="relative"
      >
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ej: hazlo soñador y lento con luz cálida"
          disabled={loading}
          className="h-9 w-full rounded-lg border border-white/5 bg-white/[0.02] pl-3 pr-10 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30"
          aria-label="Aplicar"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
        </button>
      </form>

      {/* Quick suggestion chips */}
      <div className="mt-2 flex flex-wrap gap-1">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => handleSubmit(s)}
            disabled={loading}
            className="flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[9px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-30"
          >
            <Sparkles className="h-2 w-2" />
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
