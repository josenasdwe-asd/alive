"use client";

import { CloudRain, Snowflake, CloudFog, Sun, Sparkles, Film, Wind, Grid3x3 } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import type { EffectType } from "@/lib/types";
import { cn } from "@/lib/utils";

const EFFECT_META: Array<{
  id: EffectType;
  name: string;
  icon: React.ReactNode;
  desc: string;
}> = [
  { id: "fog", name: "Niebla", icon: <CloudFog className="h-3.5 w-3.5" />, desc: "Bruma suave" },
  { id: "snow", name: "Nieve", icon: <Snowflake className="h-3.5 w-3.5" />, desc: "Copos cayendo" },
  { id: "rain", name: "Lluvia", icon: <CloudRain className="h-3.5 w-3.5" />, desc: "Gotas diagonales" },
  { id: "godrays", name: "Rayos", icon: <Sun className="h-3.5 w-3.5" />, desc: "God rays de luz" },
  { id: "bokeh", name: "Bokeh", icon: <Sparkles className="h-3.5 w-3.5" />, desc: "Círculos de luz" },
  { id: "dust", name: "Polvo", icon: <Wind className="h-3.5 w-3.5" />, desc: "Partículas finas" },
  { id: "lightleak", name: "Light leak", icon: <Film className="h-3.5 w-3.5" />, desc: "Fuga de luz cálida" },
  { id: "grain", name: "Grano", icon: <Grid3x3 className="h-3.5 w-3.5" />, desc: "Grano de película" },
];

export function EffectsPanel() {
  const effects = useAliveStore((s) => s.animation.effects);
  const toggleEffect = useAliveStore((s) => s.toggleEffect);

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-medium tracking-tight">Atmósfera</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {Object.values(effects).filter(Boolean).length} activos
        </span>
      </header>

      <div className="grid grid-cols-2 gap-1.5">
        {EFFECT_META.map((e) => {
          const active = effects[e.id];
          return (
            <button
              key={e.id}
              onClick={() => toggleEffect(e.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2 text-left transition-all",
                active
                  ? "border-primary/50 bg-primary/10"
                  : "border-white/5 bg-white/[0.02] hover:border-white/15"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md",
                  active ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
                )}
              >
                {e.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium">{e.name}</div>
                <div className="truncate text-[9px] text-muted-foreground">
                  {e.desc}
                </div>
              </div>
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  active ? "bg-primary" : "bg-white/15"
                )}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
