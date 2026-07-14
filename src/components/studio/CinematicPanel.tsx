"use client";

import { Sun, Palette, Wind, Film } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getColorScriptActName } from "@/components/alive/ColorScript";

export function CinematicPanel() {
  const {
    animation: config,
    updateAnimation,
  } = useAliveStore();

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Film className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-medium tracking-tight">Cinemático</h3>
      </header>

      <div className="space-y-3">
        {/* Relighting */}
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs">Relighting dinámico</Label>
          </div>
          <Switch
            checked={config.relightingEnabled}
            onCheckedChange={(v) => updateAnimation({ relightingEnabled: v })}
          />
        </div>
        {config.relightingEnabled && (
          <div className="space-y-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <SliderRow label="Azimut luz" value={config.relightingAzimuth} min={0} max={360} step={5} format={(v) => `${v.toFixed(0)}°`} onChange={(v) => updateAnimation({ relightingAzimuth: v })} />
            <SliderRow label="Elevación" value={config.relightingElevation} min={0} max={90} step={5} format={(v) => `${v.toFixed(0)}°`} onChange={(v) => updateAnimation({ relightingElevation: v })} />
            <SliderRow label="Intensidad" value={config.relightingIntensity} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateAnimation({ relightingIntensity: v })} />
            <SliderRow label="Temp. color" value={config.relightingColorTemp} min={0} max={1} step={0.05} format={(v) => v < 0.5 ? "Cálido" : "Frío"} onChange={(v) => updateAnimation({ relightingColorTemp: v })} />
          </div>
        )}

        {/* Color Script */}
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs">Color script</Label>
          </div>
          <Switch
            checked={config.colorScriptEnabled}
            onCheckedChange={(v) => updateAnimation({ colorScriptEnabled: v })}
          />
        </div>
        {config.colorScriptEnabled && (
          <div className="space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <Label className="text-[10px] text-muted-foreground">Acto narrativo</Label>
            <Select
              value={String(config.colorScriptAct)}
              onValueChange={(v) => updateAnimation({ colorScriptAct: parseInt(v) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">Auto-cycle (5 actos)</SelectItem>
                <SelectItem value="0">Establecimiento</SelectItem>
                <SelectItem value="1">Incidente</SelectItem>
                <SelectItem value="2">Tensión</SelectItem>
                <SelectItem value="3">Clímax</SelectItem>
                <SelectItem value="4">Resolución</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[9px] text-muted-foreground">
              {getColorScriptActName(config.colorScriptAct)}
            </p>
          </div>
        )}

        {/* Motion Blur */}
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5">
            <Wind className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs">Motion blur</Label>
          </div>
          <Switch
            checked={config.motionBlurEnabled}
            onCheckedChange={(v) => updateAnimation({ motionBlurEnabled: v })}
          />
        </div>
        {config.motionBlurEnabled && (
          <div className="space-y-1 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <SliderRow label="Fuerza" value={config.motionBlurStrength} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateAnimation({ motionBlurStrength: v })} />
          </div>
        )}
      </div>
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground/80">{format(value)}</span>
      </Label>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} className="py-0.5" />
    </div>
  );
}
