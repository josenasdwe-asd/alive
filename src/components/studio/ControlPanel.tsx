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
} from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ControlPanel() {
  const config = useAliveStore((s) => s.animation);
  const layers = useAliveStore((s) => s.layers);
  const updateAnimation = useAliveStore((s) => s.updateAnimation);
  const updateLayerAnim = useAliveStore((s) => s.updateLayerAnim);

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
          <div className="grid grid-cols-2 gap-1.5">
            <ModeButton
              active={config.renderMode === "css"}
              onClick={() => updateAnimation({ renderMode: "css" })}
              label="CSS + SVG"
              hint="Framer + líquido"
            />
            <ModeButton
              active={config.renderMode === "webgl"}
              onClick={() => updateAnimation({ renderMode: "webgl" })}
              label="WebGL2"
              hint="Depth shader"
              disabled={!useAliveStore.getState().depthUrl}
            />
          </div>
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

        {/* Per-layer controls */}
        {layers.length > 0 && (
          <Accordion type="multiple" className="w-full">
            <AccordionItem
              value="layers"
              className="border-white/5"
            >
              <AccordionTrigger className="text-xs hover:no-underline">
                <span className="flex items-center gap-1.5">
                  Por capa
                  <Badge variant="secondary" className="text-[10px]">
                    {layers.length}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2">
                {layers.map((layer) => {
                  const la = config.layers[layer.id];
                  if (!la) return null;
                  return (
                    <div
                      key={layer.id}
                      className="space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{layer.name}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {layer.role}
                        </span>
                      </div>
                      <SliderRow
                        compact
                        label="Parallax"
                        value={la.parallaxStrength}
                        min={0}
                        max={60}
                        step={1}
                        format={(v) => `${v.toFixed(0)}px`}
                        onChange={(v) =>
                          updateLayerAnim(layer.id, { parallaxStrength: v })
                        }
                      />
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <MiniToggle
                          label="Respira"
                          checked={la.breathing}
                          onChange={(v) =>
                            updateLayerAnim(layer.id, { breathing: v })
                          }
                        />
                        <MiniToggle
                          label="Balanceo"
                          checked={la.sway}
                          onChange={(v) =>
                            updateLayerAnim(layer.id, { sway: v })
                          }
                        />
                        <MiniToggle
                          label="Flota"
                          checked={la.floatY}
                          onChange={(v) =>
                            updateLayerAnim(layer.id, { floatY: v })
                          }
                        />
                        <MiniToggle
                          label="Líquido"
                          checked={la.liquid}
                          onChange={(v) =>
                            updateLayerAnim(layer.id, { liquid: v })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
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

function MiniToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center justify-between rounded-md border px-2 py-1 text-[11px] transition-colors",
        checked
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-white/5 bg-white/[0.02] text-muted-foreground hover:text-foreground"
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          checked ? "bg-primary" : "bg-white/20"
        )}
      />
    </button>
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
