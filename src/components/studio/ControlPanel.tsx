"use client";

import {
  SlidersHorizontal,
  MousePointer2,
  Droplets,
  Sparkles,
  Sun,
  Aperture,
  Gauge,
  Cpu,
  Accessibility,
  RotateCw,
} from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function ControlPanel() {
  const config = useAliveStore((s) => s.animation);
  const updateAnimation = useAliveStore((s) => s.updateAnimation);

  return (
    <section className="glass rounded-xl p-4">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <SlidersHorizontal className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-medium tracking-tight">Controles</h3>
      </header>

      <div className="space-y-4">
        {/* Master sliders */}
        <SliderRow
          icon={<Gauge className="h-3.5 w-3.5" />}
          label="Intensidad"
          value={config.intensity}
          min={0}
          max={2}
          step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => updateAnimation({ intensity: v })}
        />
        <SliderRow
          icon={<Gauge className="h-3.5 w-3.5" />}
          label="Velocidad"
          value={config.speed}
          min={0.2}
          max={3}
          step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => updateAnimation({ speed: v })}
        />
        <SliderRow
          icon={<Aperture className="h-3.5 w-3.5" />}
          label="Aberración cromática"
          value={config.chromaticAberration}
          min={0}
          max={6}
          step={0.1}
          format={(v) => `${v.toFixed(1)}px`}
          onChange={(v) => updateAnimation({ chromaticAberration: v })}
        />
        <SliderRow
          icon={<Sun className="h-3.5 w-3.5" />}
          label="Viñeta"
          value={config.vignette}
          min={0}
          max={1}
          step={0.02}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          onChange={(v) => updateAnimation({ vignette: v })}
        />

        {/* Toggles */}
        <div className="grid grid-cols-2 gap-2">
          <ToggleRow
            icon={<MousePointer2 className="h-3.5 w-3.5" />}
            label="Parallax"
            checked={config.parallaxEnabled}
            onChange={(v) => updateAnimation({ parallaxEnabled: v })}
          />
          <ToggleRow
            icon={<Droplets className="h-3.5 w-3.5" />}
            label="Líquido"
            checked={config.liquidEnabled}
            onChange={(v) => updateAnimation({ liquidEnabled: v })}
          />
          <ToggleRow
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Partículas"
            checked={config.particlesEnabled}
            onChange={(v) => updateAnimation({ particlesEnabled: v })}
          />
          <ToggleRow
            icon={<Sun className="h-3.5 w-3.5" />}
            label="Shimmer"
            checked={config.shimmerEnabled}
            onChange={(v) => updateAnimation({ shimmerEnabled: v })}
          />
        </div>

        {/* Render mode */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" />
            Modo de render
          </Label>
          <div className="grid grid-cols-4 gap-1">
            <ModeButton
              active={config.renderMode === "css"}
              onClick={() => updateAnimation({ renderMode: "css" })}
              label="CSS"
              hint="Multiplane"
            />
            <ModeButton
              active={config.renderMode === "css3d"}
              onClick={() => updateAnimation({ renderMode: "css3d" })}
              label="3D"
              hint="Perspectiva"
            />
            <ModeButton
              active={config.renderMode === "webgl"}
              onClick={() => updateAnimation({ renderMode: "webgl" })}
              label="Depth"
              hint="Shader"
              disabled={!useAliveStore.getState().depthMapUrl}
            />
            <ModeButton
              active={config.renderMode === "kenburns3d"}
              onClick={() => updateAnimation({ renderMode: "kenburns3d" })}
              label="3D KB"
              hint="Point cloud"
              disabled={!useAliveStore.getState().depthMapUrl}
            />
          </div>

          {/* 3D controls (only for css3d mode) */}
          {config.renderMode === "css3d" && (
            <div className="space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <SliderRow
                compact
                icon={<Aperture className="h-3 w-3" />}
                label="Perspectiva"
                value={config.perspective}
                min={400}
                max={2000}
                step={50}
                format={(v) => `${v.toFixed(0)}px`}
                onChange={(v) => updateAnimation({ perspective: v })}
              />
              <SliderRow
                compact
                icon={<RotateCw className="h-3 w-3" />}
                label="Rotación 3D"
                value={config.rotate3dStrength}
                min={0}
                max={25}
                step={0.5}
                format={(v) => `${v.toFixed(1)}°`}
                onChange={(v) => updateAnimation({ rotate3dStrength: v })}
              />
            </div>
          )}
        </div>

        {/* Reduced motion */}
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Accessibility className="h-3.5 w-3.5 text-muted-foreground" />
            Movimiento reducido
          </Label>
          <Switch
            checked={config.reducedMotion}
            onCheckedChange={(v) => updateAnimation({ reducedMotion: v })}
          />
        </div>

        {/* Mouse smoothing */}
        <SliderRow
          icon={<MousePointer2 className="h-3.5 w-3.5" />}
          label="Suavizado mouse"
          value={config.mouseSmoothing}
          min={0.01}
          max={0.3}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => updateAnimation({ mouseSmoothing: v })}
        />

        <p className="rounded-md border border-white/5 bg-white/[0.02] p-2 text-[10px] leading-relaxed text-muted-foreground">
          Selecciona una capa en el panel de capas para editar su posición,
          escala, rotación y efectos individuales.
        </p>
      </div>
    </section>
  );
}

function SliderRow({
  icon,
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  compact = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </Label>
        <span className="font-mono text-[11px] text-foreground/80">
          {format(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="py-0.5"
      />
    </div>
  );
}

function ToggleRow({
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
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
      <Label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  hint,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-start rounded-lg border p-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-primary bg-primary/10"
          : "border-white/5 bg-white/[0.02] hover:border-white/15"
      )}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </button>
  );
}
