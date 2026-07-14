"use client";

import { Mountain, Sun, Cloud, Clock, Palette, Anchor } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { SCENE_COMPOSITIONS, type SceneCompositionId } from "@/lib/scene-compositions";
import { cn } from "@/lib/utils";

export function ScenePanel() {
  const {
    animation: config,
    updateAnimation,
    applySceneComp,
  } = useAliveStore();

  return (
    <div className="space-y-3">
      {/* Scene Composition */}
      <section className="glass rounded-xl p-3">
        <header className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Mountain className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-medium tracking-tight">Composición</h3>
        </header>

        <div className="space-y-1.5">
          {SCENE_COMPOSITIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => applySceneComp(s.id as SceneCompositionId)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg border p-2 text-left transition-all",
                config.sceneComposition === s.id
                  ? "border-primary/50 bg-primary/10"
                  : "border-white/5 bg-white/[0.02] hover:border-white/15"
              )}
            >
              <span className="text-base leading-none">{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{s.name}</span>
                  {config.sceneComposition === s.id && (
                    <Anchor className="h-2.5 w-2.5 text-primary" />
                  )}
                </div>
                <p className="text-[10px] leading-tight text-muted-foreground">
                  {s.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Atmospheric animations */}
      <section className="glass rounded-xl p-3">
        <header className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Sun className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-medium tracking-tight">Atmósfera cinemática</h3>
        </header>

        <div className="grid grid-cols-2 gap-1.5">
          <AtmoToggle
            icon={<Sun className="h-3.5 w-3.5" />}
            label="Día/Noche"
            desc="Ciclo de luz"
            checked={config.atmoLightCycle}
            onChange={(v) => updateAnimation({ atmoLightCycle: v })}
          />
          <AtmoToggle
            icon={<Cloud className="h-3.5 w-3.5" />}
            label="Niebla"
            desc="Bank drift"
            checked={config.atmoFogDrift}
            onChange={(v) => updateAnimation({ atmoFogDrift: v })}
          />
          <AtmoToggle
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Timelapse"
            desc="Arco solar"
            checked={config.atmoTimelapse}
            onChange={(v) => updateAnimation({ atmoTimelapse: v })}
          />
          <AtmoToggle
            icon={<Palette className="h-3.5 w-3.5" />}
            label="Estaciones"
            desc="Hue rotation"
            checked={config.atmoSeasonal}
            onChange={(v) => updateAnimation({ atmoSeasonal: v })}
          />
        </div>
      </section>
    </div>
  );
}

function AtmoToggle({
  icon,
  label,
  desc,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition-all",
        checked
          ? "border-primary/50 bg-primary/10"
          : "border-white/5 bg-white/[0.02] hover:border-white/15"
      )}
    >
      <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", checked ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground")}>
        {icon}
      </span>
      <div>
        <div className="text-[11px] font-medium">{label}</div>
        <div className="text-[9px] text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}
