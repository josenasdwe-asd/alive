"use client";

import { useAliveStore } from "@/lib/store";
import { PRESETS } from "@/lib/presets";
import type { PresetId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function PresetPicker() {
  const currentPreset = useAliveStore((s) => s.animation.preset);
  const applyPreset = useAliveStore((s) => s.applyPreset);

  return (
    <section className="glass rounded-xl p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium tracking-tight">Presets</h3>
        <span className="text-[11px] text-muted-foreground">
          {PRESETS.length} estilos
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => {
          const active = currentPreset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id as PresetId)}
              className={cn(
                "group relative flex flex-col items-start gap-0.5 overflow-hidden rounded-lg border p-2.5 text-left transition-all",
                active
                  ? "border-primary bg-primary/10"
                  : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
              )}
            >
              {active && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
              <span className="text-base leading-none">{p.emoji}</span>
              <span className="mt-1 text-xs font-medium">{p.name}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                {p.tagline}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
