"use client";

import { Aperture, Focus, Crosshair, Layers, Camera, CloudFog, Sun } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function Pipeline25DPanel() {
  const {
    animation: config,
    updateAnimation,
    layers,
  } = useAliveStore();

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Camera className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-medium tracking-tight">Pipeline 2.5D</h3>
        <span className="ml-auto text-[10px] text-muted-foreground">Disguise-style</span>
      </header>

      <div className="space-y-3">
        {/* DOF toggle */}
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Aperture className="h-3.5 w-3.5 text-muted-foreground" />
            DOF orgánico
          </Label>
          <Switch
            checked={config.dofEnabled}
            onCheckedChange={(v) => updateAnimation({ dofEnabled: v })}
          />
        </div>

        {config.dofEnabled && (
          <div className="space-y-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            {/* Focus mode */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Focus mode</Label>
              <Select
                value={config.focusMode}
                onValueChange={(v) => updateAnimation({ focusMode: v as "manual" | "object" })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (slider)</SelectItem>
                  <SelectItem value="object">Object tracking</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Focus depth slider (manual mode) */}
            {config.focusMode === "manual" && (
              <div className="space-y-1">
                <Label className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Focus className="h-2.5 w-2.5" />
                    Plano de enfoque
                  </span>
                  <span className="font-mono text-foreground/80">
                    {config.focusDepth.toFixed(2)}
                  </span>
                </Label>
                <Slider
                  value={[config.focusDepth]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={(v) => updateAnimation({ focusDepth: v[0] })}
                  className="py-0.5"
                />
                <div className="flex justify-between text-[8px] text-muted-foreground/60">
                  <span>Lejano</span>
                  <span>Cercano</span>
                </div>
              </div>
            )}

            {/* Object tracking layer selector */}
            {config.focusMode === "object" && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Crosshair className="h-2.5 w-2.5" />
                  Capa a seguir
                </Label>
                <Select
                  value={config.focusLayerId ?? ""}
                  onValueChange={(v) => updateAnimation({ focusLayerId: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar capa" />
                  </SelectTrigger>
                  <SelectContent>
                    {layers.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Aperture */}
            <div className="space-y-1">
              <Label className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Apertura (bokeh)</span>
                <span className="font-mono text-foreground/80">
                  ƒ/{(1 / (config.aperture + 0.1)).toFixed(1)}
                </span>
              </Label>
              <Slider
                value={[config.aperture]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(v) => updateAnimation({ aperture: v[0] })}
                className="py-0.5"
              />
            </div>
          </div>
        )}

        {/* Scale with depth */}
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <Label className="text-xs">Scale with depth</Label>
              <p className="text-[9px] text-muted-foreground">
                Auto-escala capas según Z
              </p>
            </div>
          </div>
          <Switch
            checked={config.scaleWithDepth}
            onCheckedChange={(v) => updateAnimation({ scaleWithDepth: v })}
          />
        </div>

        {/* Depth fog */}
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5">
            <CloudFog className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs">Depth fog volumétrico</Label>
          </div>
          <Switch
            checked={config.depthFogEnabled}
            onCheckedChange={(v) => updateAnimation({ depthFogEnabled: v })}
          />
        </div>
        {config.depthFogEnabled && (
          <div className="space-y-1">
            <Label className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Densidad niebla</span>
              <span className="font-mono text-foreground/80">
                {config.depthFogDensity.toFixed(2)}
              </span>
            </Label>
            <Slider
              value={[config.depthFogDensity]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={(v) => updateAnimation({ depthFogDensity: v[0] })}
              className="py-0.5"
            />
          </div>
        )}

        {/* Bloom + ACES */}
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs">Bloom + ACES</Label>
          </div>
          <Switch
            checked={config.bloomEnabled}
            onCheckedChange={(v) => updateAnimation({ bloomEnabled: v })}
          />
        </div>
        {config.bloomEnabled && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Bloom</span>
                <span className="font-mono text-foreground/80">
                  {config.bloomIntensity.toFixed(2)}
                </span>
              </Label>
              <Slider
                value={[config.bloomIntensity]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(v) => updateAnimation({ bloomIntensity: v[0] })}
                className="py-0.5"
              />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Tone map</span>
                <span className="font-mono text-foreground/80">
                  {config.toneMapStrength.toFixed(2)}
                </span>
              </Label>
              <Slider
                value={[config.toneMapStrength]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(v) => updateAnimation({ toneMapStrength: v[0] })}
                className="py-0.5"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
