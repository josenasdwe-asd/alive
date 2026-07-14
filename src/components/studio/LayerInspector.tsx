"use client";

import {
  Crosshair,
  Maximize2,
  RotateCw,
  Sparkles,
  Wind,
  Droplets,
  Moon,
  Sun,
  Palette,
  Aperture,
  Waves,
  Zap,
} from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function LayerInspector() {
  const {
    layers,
    selectedLayerId,
    updateLayerTransform,
    animation,
    updateLayerAnim,
  } = useAliveStore();

  const layer = layers.find((l) => l.id === selectedLayerId);
  if (!layer) return null;

  const la = animation.layers[layer.id];
  const t = layer.transform;

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Crosshair className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-medium tracking-tight truncate">
          {layer.name}
        </h3>
      </header>

      <div className="space-y-3">
        {/* Transform */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Posición
          </Label>
          <div className="grid grid-cols-2 gap-1.5">
            <NumInput
              icon={<Crosshair className="h-3 w-3" />}
              label="X"
              value={t.x}
              onChange={(v) => updateLayerTransform(layer.id, { x: v })}
              step={1}
            />
            <NumInput
              icon={<Crosshair className="h-3 w-3" />}
              label="Y"
              value={t.y}
              onChange={(v) => updateLayerTransform(layer.id, { y: v })}
              step={1}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Maximize2 className="h-2.5 w-2.5" />
              Escala
            </Label>
            <Slider
              value={[t.scale]}
              min={0.1}
              max={3}
              step={0.01}
              onValueChange={(v) =>
                updateLayerTransform(layer.id, { scale: v[0] })
              }
              className="py-0.5"
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {t.scale.toFixed(2)}×
            </span>
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <RotateCw className="h-2.5 w-2.5" />
              Rotación
            </Label>
            <Slider
              value={[t.rotation]}
              min={-180}
              max={180}
              step={1}
              onValueChange={(v) =>
                updateLayerTransform(layer.id, { rotation: v[0] })
              }
              className="py-0.5"
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {t.rotation.toFixed(0)}°
            </span>
          </div>
        </div>

        {/* Animation effects */}
        {la && (
          <div className="space-y-2 border-t border-white/5 pt-2">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Animación
            </Label>

            {/* parallax strength */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Wind className="h-2.5 w-2.5" />
                Parallax
              </Label>
              <Slider
                value={[la.parallaxStrength]}
                min={0}
                max={60}
                step={1}
                onValueChange={(v) =>
                  updateLayerAnim(layer.id, { parallaxStrength: v[0] })
                }
                className="py-0.5"
              />
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Zap className="h-2.5 w-2.5" />
                Velocidad mouse
              </Label>
              <Slider
                value={[la.mouseVelocityInfluence]}
                min={0}
                max={2}
                step={0.05}
                onValueChange={(v) =>
                  updateLayerAnim(layer.id, { mouseVelocityInfluence: v[0] })
                }
                className="py-0.5"
              />
            </div>

            {/* Effect toggles */}
            <div className="grid grid-cols-2 gap-1">
              <EffectToggle
                icon={<Moon className="h-3 w-3" />}
                label="Respira"
                checked={la.breathing}
                onChange={(v) => updateLayerAnim(layer.id, { breathing: v })}
              />
              <EffectToggle
                icon={<RotateCw className="h-3 w-3" />}
                label="Balancea"
                checked={la.sway}
                onChange={(v) => updateLayerAnim(layer.id, { sway: v })}
              />
              <EffectToggle
                icon={<Sparkles className="h-3 w-3" />}
                label="Twist"
                checked={la.twist}
                onChange={(v) => updateLayerAnim(layer.id, { twist: v })}
              />
              <EffectToggle
                icon={<Waves className="h-3 w-3" />}
                label="Flota"
                checked={la.floatY}
                onChange={(v) => updateLayerAnim(layer.id, { floatY: v })}
              />
              <EffectToggle
                icon={<Wind className="h-3 w-3" />}
                label="Deriva"
                checked={la.driftX}
                onChange={(v) => updateLayerAnim(layer.id, { driftX: v })}
              />
              <EffectToggle
                icon={<Waves className="h-3 w-3" />}
                label="Onda"
                checked={la.wave}
                onChange={(v) => updateLayerAnim(layer.id, { wave: v })}
              />
              <EffectToggle
                icon={<Droplets className="h-3 w-3" />}
                label="Líquido"
                checked={la.liquid}
                onChange={(v) => updateLayerAnim(layer.id, { liquid: v })}
              />
              <EffectToggle
                icon={<Zap className="h-3 w-3" />}
                label="Jitter"
                checked={la.jitter}
                onChange={(v) => updateLayerAnim(layer.id, { jitter: v })}
              />
              <EffectToggle
                icon={<Sun className="h-3 w-3" />}
                label="Glow"
                checked={la.glow}
                onChange={(v) => updateLayerAnim(layer.id, { glow: v })}
              />
              <EffectToggle
                icon={<Palette className="h-3 w-3" />}
                label="Hue"
                checked={la.hueDrift}
                onChange={(v) => updateLayerAnim(layer.id, { hueDrift: v })}
              />
              <EffectToggle
                icon={<Aperture className="h-3 w-3" />}
                label="Focus"
                checked={la.focusPull}
                onChange={(v) => updateLayerAnim(layer.id, { focusPull: v })}
              />
              <EffectToggle
                icon={<Sparkles className="h-3 w-3" />}
                label="Sombra"
                checked={la.shadowDrift}
                onChange={(v) => updateLayerAnim(layer.id, { shadowDrift: v })}
              />
            </div>

            {/* Phase offset */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Fase (desfase)
              </Label>
              <Slider
                value={[la.phaseOffset]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={(v) =>
                  updateLayerAnim(layer.id, { phaseOffset: v[0] })
                }
                className="py-0.5"
              />
            </div>

            {/* Duration multiplier */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Velocidad propia
              </Label>
              <Slider
                value={[la.durationMultiplier]}
                min={0.25}
                max={3}
                step={0.05}
                onValueChange={(v) =>
                  updateLayerAnim(layer.id, { durationMultiplier: v[0] })
                }
                className="py-0.5"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function NumInput({
  icon,
  label,
  value,
  onChange,
  step = 1,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  // Scrubby input: drag left/right on the label to change the value
  const onScrubStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startVal = value;
    const onMove = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) * step;
      onChange(startVal + delta);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-white/5 bg-white/[0.02] px-1.5 py-1">
      <span
        className="cursor-ew-resize select-none text-muted-foreground"
        onPointerDown={onScrubStart}
        title="Arrastra para cambiar"
      >
        {icon}
      </span>
      <span
        className="cursor-ew-resize select-none text-[10px] text-muted-foreground"
        onPointerDown={onScrubStart}
        title="Arrastra para cambiar"
      >
        {label}
      </span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-transparent text-right text-[11px] outline-none"
      />
    </div>
  );
}

function EffectToggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] transition-colors",
        checked
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-white/5 bg-white/[0.02] text-muted-foreground hover:text-foreground"
      )}
    >
      <span className={checked ? "text-primary" : ""}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          checked ? "bg-primary" : "bg-white/20"
        )}
      />
    </button>
  );
}
