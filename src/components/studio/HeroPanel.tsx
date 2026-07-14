"use client";

import { Film, Palette, Type, Maximize2, Sparkles, Wand2, Brain } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColorGrade } from "@/lib/types";
import { cn } from "@/lib/utils";
import { recommendColorGrade, explainColorGrade } from "@/lib/palette-intelligence";

const GRADES: Array<{ id: ColorGrade; name: string; swatch: string }> = [
  { id: "none", name: "Ninguno", swatch: "linear-gradient(135deg, #555, #aaa)" },
  { id: "teal-orange", name: "Teal-Orange", swatch: "linear-gradient(135deg, #0080a0, #ff8c28)" },
  { id: "bleach-bypass", name: "Bleach Bypass", swatch: "linear-gradient(135deg, #2a2a35, #c0c0cc)" },
  { id: "portra", name: "Portra", swatch: "linear-gradient(135deg, #5a3a14, #ffd8b0)" },
  { id: "blade-runner", name: "Blade Runner", swatch: "linear-gradient(135deg, #004060, #ff7828)" },
  { id: "noir-film", name: "Noir", swatch: "linear-gradient(135deg, #000, #fff)" },
];

export function HeroPanel() {
  const {
    animation: config,
    updateAnimation,
    textOverlay,
    setTextOverlay,
    setHeroMode,
    analysis,
  } = useAliveStore();

  // safe defaults when textOverlay is undefined
  const overlay = {
    headline: "",
    subheadline: "",
    cta: "",
    align: "left" as const,
    position: "bottom" as const,
    enabled: false,
    ...textOverlay,
  };

  return (
    <div className="space-y-3">
      {/* Hero mode launch */}
      <section className="glass rounded-xl p-3">
        <header className="mb-2.5 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Maximize2 className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-medium tracking-tight">Hero</h3>
        </header>
        <Button
          className="w-full gap-2"
          onClick={() => setHeroMode(true)}
        >
          <Wand2 className="h-3.5 w-3.5" />
          Activar modo hero
        </Button>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Full-viewport con scroll parallax, texto animado y color grading cinematográfico.
        </p>
      </section>

      {/* Scroll parallax */}
      <section className="glass rounded-xl p-3">
        <header className="mb-2.5 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Film className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-medium tracking-tight">Scroll & cine</h3>
        </header>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Parallax scroll</span>
              <span className="font-mono text-[11px] text-foreground/80">
                {(config.scrollParallax ?? 0.4).toFixed(2)}
              </span>
            </Label>
            <Slider
              value={[config.scrollParallax ?? 0.4]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={(v) => updateAnimation({ scrollParallax: v[0] })}
              className="py-0.5"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <Label className="text-xs">Entrance reveal</Label>
            <Switch
              checked={config.entranceEnabled}
              onCheckedChange={(v) => updateAnimation({ entranceEnabled: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <Label className="text-xs">Letterbox 2.39:1</Label>
            <Switch
              checked={config.letterbox}
              onCheckedChange={(v) => updateAnimation({ letterbox: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <Label className="text-xs">Gate weave (film)</Label>
            <Switch
              checked={config.gateWeave}
              onCheckedChange={(v) => updateAnimation({ gateWeave: v })}
            />
          </div>
        </div>
      </section>

      {/* Color grading */}
      <section className="glass rounded-xl p-3">
        <header className="mb-2.5 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Palette className="h-3.5 w-3.5" />
          </span>
          <h3 className="flex-1 text-sm font-medium tracking-tight">Color grading</h3>
          {/* v3 INTELLIGENCE: palette-driven auto color grade */}
          {analysis?.palette && analysis.palette.length > 0 && (
            <button
              onClick={() => {
                const grade = recommendColorGrade(analysis.palette);
                updateAnimation({ colorGrade: grade });
              }}
              className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary transition-colors hover:bg-primary/20"
              title={explainColorGrade(recommendColorGrade(analysis.palette), analysis.palette)}
            >
              <Brain className="h-2.5 w-2.5" />
              Auto
            </button>
          )}
        </header>
        <div className="grid grid-cols-3 gap-1.5">
          {GRADES.map((g) => (
            <button
              key={g.id}
              onClick={() => updateAnimation({ colorGrade: g.id })}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-all",
                config.colorGrade === g.id
                  ? "border-primary bg-primary/10"
                  : "border-white/5 bg-white/[0.02] hover:border-white/15"
              )}
            >
              <span
                className="h-6 w-full rounded-sm ring-1 ring-white/10"
                style={{ background: g.swatch }}
              />
              <span className="text-[9px] leading-tight text-muted-foreground">
                {g.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Text overlay */}
      <section className="glass rounded-xl p-3">
        <header className="mb-2.5 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Type className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-medium tracking-tight">Texto</h3>
          <Switch
            className="ml-auto"
            checked={overlay.enabled ?? false}
            onCheckedChange={(v) => setTextOverlay({ enabled: v })}
          />
        </header>

        {overlay.enabled && (
          <div className="space-y-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Titular</Label>
              <input
                value={overlay.headline}
                onChange={(e) => setTextOverlay({ headline: e.target.value })}
                placeholder="Tu héroe vivo"
                className="w-full rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-xs outline-none focus:border-primary/40"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Subtítulo</Label>
              <input
                value={overlay.subheadline}
                onChange={(e) => setTextOverlay({ subheadline: e.target.value })}
                placeholder="Una frase que acompañe"
                className="w-full rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-xs outline-none focus:border-primary/40"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">CTA</Label>
              <input
                value={overlay.cta}
                onChange={(e) => setTextOverlay({ cta: e.target.value })}
                placeholder="Empezar"
                className="w-full rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-xs outline-none focus:border-primary/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Posición</Label>
                <Select
                  value={overlay.position}
                  onValueChange={(v) => setTextOverlay({ position: v as any })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Arriba</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                    <SelectItem value="bottom">Abajo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Alineación</Label>
                <Select
                  value={overlay.align}
                  onValueChange={(v) => setTextOverlay({ align: v as any })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Izquierda</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
