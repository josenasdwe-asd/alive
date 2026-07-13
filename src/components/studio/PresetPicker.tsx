"use client";

import { useAliveStore } from "@/lib/store";
import { PRESETS } from "@/lib/presets";
import type { PresetId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function PresetPicker() {
  const currentPreset = useAliveStore((s) => s.animation.preset);
  const applyPreset = useAliveStore((s) => s.applyPreset);

  const original = PRESETS.filter((p) => !p.v2);
  const advanced = PRESETS.filter((p) => p.v2);

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-medium tracking-tight">Presets</h3>
        <span className="text-[11px] text-muted-foreground">
          {PRESETS.length} estilos
        </span>
      </header>

      <div className="grid grid-cols-2 gap-1.5">
        {original.map((p) => (
          <PresetCard
            key={p.id}
            preset={p}
            active={currentPreset === p.id}
            onClick={() => applyPreset(p.id as PresetId)}
          />
        ))}
      </div>

      <div className="mt-3 mb-1.5 flex items-center gap-1.5">
        <div className="h-px flex-1 bg-white/5" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Avanzados
        </span>
        <div className="h-px flex-1 bg-white/5" />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {advanced.map((p) => (
          <PresetCard
            key={p.id}
            preset={p}
            active={currentPreset === p.id}
            onClick={() => applyPreset(p.id as PresetId)}
          />
        ))}
      </div>
    </section>
  );
}

function PresetCard({
  preset: p,
  active,
  onClick,
}: {
  preset: (typeof PRESETS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start gap-0.5 overflow-hidden rounded-lg border p-2 text-left transition-all",
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
      <span className="text-sm leading-none">{p.emoji}</span>
      <span className="mt-0.5 text-[11px] font-medium">{p.name}</span>
      <span className="text-[9px] leading-tight text-muted-foreground">
        {p.tagline}
      </span>
    </button>
  );
}
