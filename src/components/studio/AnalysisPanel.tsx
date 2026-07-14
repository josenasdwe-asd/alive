"use client";

import { useEffect, useState } from "react";
import { AutoSetup } from "./AutoSetup";
import {
  ScanSearch,
  Layers as LayersIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Palette,
  Eye,
  Zap,
  Cpu,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PRESET_MAP } from "@/lib/presets";
import type { DecompositionStrategy } from "@/lib/types";

type Stage =
  | "idle"
  | "analyzing"
  | "choose-strategy"
  | "decomposing"
  | "ready"
  | "error";

export function AnalysisPanel() {
  const {
    originalUrl,
    originalDataUrl,
    analysis,
    layers,
    backgroundUrl,
    depthMapUrl,
    status,
    error,
    strategy,
    setAnalysis,
    setLayers,
    setDepthMap,
    setBackground,
    setStatus,
    applyPreset,
    setStrategy,
    setPipelineStep,
    setSlicedLayers,
  } = useAliveStore();

  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [kLayers, setKLayers] = useState(6);

  const previewUrl = originalDataUrl ?? originalUrl;

  // auto-run analysis when image uploaded
  useEffect(() => {
    if (status === "uploaded" && stage === "idle") {
      void runAnalyze();
    }
     
  }, [status]);

  async function fetchWithRetry(
    url: string,
    opts: RequestInit,
    maxRetries = 3
  ): Promise<any> {
    let lastErr: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, opts);
        // Only retry on gateway errors and rate limiting — NOT on 4xx client errors
        if (res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429) {
          throw new Error(`Gateway ${res.status} — reintentando…`);
        }
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Request failed");
        return data;
      } catch (err: any) {
        lastErr = err;
        // Don't retry on 4xx (except 429) — these are permanent failures
        const isRetryable = err?.message?.includes("Gateway") || err?.message?.includes("502") || err?.message?.includes("503") || err?.message?.includes("504") || err?.message?.includes("429") || err?.name === "TypeError"; // network errors
        if (attempt < maxRetries && isRetryable) {
          const delay = (attempt + 1) * 3000 + Math.random() * 2000;
          setProgress((p) => Math.max(p, 15 + attempt * 10));
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr ?? new Error("Request failed after retries");
  }

  async function runAnalyze() {
    setStage("analyzing");
    setStatus("analyzing");
    setPipelineStep("analyze");
    setProgress(15);
    try {
      const data = await fetchWithRetry("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: originalUrl }),
      });
      setProgress(50);
      setAnalysis(data.analysis);
      setStage("choose-strategy");
      setStatus("analyzed");
      setPipelineStep("decompose");
      setProgress(60);
      toast.success("Análisis completo — elige cómo desacoplar");
    } catch (err: any) {
      setStage("error");
      setStatus("error", err?.message);
      toast.error(err?.message ?? "Error en el análisis");
    }
  }

  /** Phase 1 (shared): generate depth map + inpainted background */
  async function generateBaseAssets() {
    if (!analysis) throw new Error("No analysis");
    const res = await fetchWithRetry("/api/separate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: originalUrl,
        subject: analysis.subject,
        layers: analysis.layers,
        // signal that we only want base assets (bg + depth), no per-element extraction
        baseOnly: true,
      }),
    });
    if (res.background) setBackground(res.background.url);
    if (res.depth) setDepthMap(res.depth.url);
    return res;
  }

  async function runDepthSlice() {
    setStage("decomposing");
    setStrategy("depth-slice");
    setProgress(70);
    try {
      // first ensure we have depth map + bg
      if (!depthMapUrl) {
        setProgress(75);
        await generateBaseAssets();
      }
      const depthUrl = useAliveStore.getState().depthMapUrl;
      if (!depthUrl) throw new Error("No depth map available");

      setProgress(85);
      const res = await fetch("/api/slice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalUrl,
          depthUrl,
          k: kLayers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Slice failed");

      setSlicedLayers(data.layers);
      setProgress(100);
      setStage("ready");
      setPipelineStep("animate");
      toast.success(`¡${data.layers.length} capas generadas!`);
      const preset = useAliveStore.getState().analysis?.recommendedPreset;
      if (preset) applyPreset(preset as any);
    } catch (err: any) {
      setStage("error");
      setStatus("error", err?.message);
      toast.error(err?.message ?? "Error en el slicing");
    }
  }

  async function runSlic() {
    setStage("decomposing");
    setStrategy("depth-slice");
    setProgress(70);
    try {
      if (!depthMapUrl) {
        setProgress(75);
        await generateBaseAssets();
      }
      const depthUrl = useAliveStore.getState().depthMapUrl;
      if (!depthUrl) throw new Error("No depth map available");

      setProgress(85);
      const res = await fetch("/api/slic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalUrl,
          depthUrl,
          k: kLayers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SLIC failed");

      setSlicedLayers(data.layers);
      setProgress(100);
      setStage("ready");
      setPipelineStep("animate");
      toast.success(`¡${data.layers.length} capas semánticas (SLIC)!`);
      const preset = useAliveStore.getState().analysis?.recommendedPreset;
      if (preset) applyPreset(preset as any);
    } catch (err: any) {
      setStage("error");
      setStatus("error", err?.message);
      toast.error(err?.message ?? "Error en SLIC");
    }
  }

  async function runAiExtract() {
    setStage("decomposing");
    setStrategy("ai-extract");
    setProgress(70);
    try {
      if (!analysis) throw new Error("No analysis");

      // PRO MODE: 2 AI calls (depth + bg) then mathematical K-means slice
      // instead of 5+ individual extractions that fail with 429
      const res = await fetchWithRetry("/api/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: originalUrl,
          subject: analysis.subject,
          layers: analysis.layers,
          baseOnly: true, // only bg + depth, no per-element extraction
        }),
      });
      setProgress(85);
      if (res.background) setBackground(res.background.url);
      if (res.depth) setDepthMap(res.depth.url);

      const depthUrl = useAliveStore.getState().depthMapUrl;
      if (!depthUrl) throw new Error("No depth map available");

      // slice with AI-generated depth map (better quality than deterministic)
      setProgress(92);
      const sliceRes = await fetch("/api/slice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalUrl,
          depthUrl,
          k: 6,
        }),
      });
      const sliceData = await sliceRes.json();
      if (!sliceRes.ok) throw new Error(sliceData.error || "Slice failed");

      setSlicedLayers(sliceData.layers);
      setProgress(100);
      setStage("ready");
      setPipelineStep("animate");
      toast.success(`¡${sliceData.layers.length} capas PRO generadas!`);
      const preset = useAliveStore.getState().analysis?.recommendedPreset;
      if (preset) applyPreset(preset as any);
    } catch (err: any) {
      setStage("error");
      setStatus("error", err?.message);
      toast.error(err?.message ?? "Error en la extracción");
    }
  }

  // ===== Render states =====

  if (stage === "idle" || stage === "analyzing") {
    return (
      <PanelShell title="Analizando imagen" icon={<ScanSearch className="h-4 w-4" />}>
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg">
            <img
              src={previewUrl}
              alt="Analizando"
              className="aspect-video w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-xs text-white/90">
              <Loader2 className="h-3 w-3 animate-spin" />
              VLM entendiendo la escena…
            </div>
          </div>
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            Identificando sujeto, planos de profundidad y paleta de color.
          </p>
        </div>
      </PanelShell>
    );
  }

  if (stage === "error") {
    return (
      <PanelShell title="Error" icon={<AlertCircle className="h-4 w-4 text-destructive" />}>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={runAnalyze} className="mt-2">
          Reintentar
        </Button>
      </PanelShell>
    );
  }

  if (stage === "decomposing") {
    return (
      <PanelShell title="Desacoplando capas" icon={<LayersIcon className="h-4 w-4" />}>
        <div className="space-y-3">
          <Progress value={progress} className="h-1.5" />
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-primary" /> Análisis VLM
            </li>
            <li className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              {strategy === "depth-slice"
                ? "K-means 1D + dilatación morfológica…"
                : "Extrayendo elementos con IA…"}
            </li>
          </ul>
          <p className="text-[11px] text-muted-foreground/70">
            {strategy === "depth-slice"
              ? "Rebanando el mapa de profundidad en bandas con clustering matemático. Determinístico y rápido."
              : "Cada elemento se aísla individualmente con image-edit. Más lento pero semánticamente preciso."}
          </p>
        </div>
      </PanelShell>
    );
  }

  if (stage === "choose-strategy") {
    return (
      <PanelShell title="Elige desacoplo" icon={<LayersIcon className="h-4 w-4" />}>
        {analysis && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-foreground/90">
              {analysis.sceneDescription}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Zap className="h-3 w-3" />
                {analysis.mood || "—"}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                {analysis.subject}
              </Badge>
              {analysis.palette.length > 0 && (
                <div className="flex items-center gap-1">
                  <Palette className="h-3 w-3 text-muted-foreground" />
                  {analysis.palette.slice(0, 4).map((c, i) => (
                    <span
                      key={i}
                      className="h-3.5 w-3.5 rounded-sm ring-1 ring-white/10"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Estrategia de desacoplo
              </p>

              <StrategyCard
                active={false}
                onClick={runDepthSlice}
                disabled={stage === "decomposing"}
                icon={<Cpu className="h-4 w-4" />}
                title="Quick Mode"
                badge="⚡ Validación · 3s"
                desc="Depth map determinístico (luminancia + gradiente) + K-means 1D. Para previz y bloqueo rápido de animación."
                extra={
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-muted-foreground">
                      Capas:
                    </span>
                    <input
                      type="range"
                      min={4}
                      max={10}
                      value={kLayers}
                      onChange={(e) => setKLayers(parseInt(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="h-1 flex-1 accent-primary"
                    />
                    <span className="w-6 text-center font-mono text-xs text-foreground">
                      {kLayers}
                    </span>
                  </div>
                }
              />

              <StrategyCard
                active={false}
                onClick={runAiExtract}
                disabled={stage === "decomposing"}
                icon={<Sparkles className="h-4 w-4" />}
                title="PRO Mode"
                badge="🎯 Producción · 15s"
                desc="Depth map IA + K-means con conciencia semántica. Separación limpia para rigging y sprites. Bordes refinados."
              />

              <StrategyCard
                active={false}
                onClick={runSlic}
                disabled={stage === "decomposing"}
                icon={<LayersIcon className="h-4 w-4" />}
                title="SLIC Semántico"
                badge="🧬 Superpixels · 5s"
                desc="Segmentación por color+posición+profundidad. Capas semánticas reales: solo nubes, solo montañas, solo suelo."
              />
            </div>
          </div>
        )}
      </PanelShell>
    );
  }

  // ready — show analysis summary
  return (
    <PanelShell title="Análisis" icon={<Eye className="h-4 w-4" />}>
      {analysis && (
        <div className="space-y-2.5">
          <p className="text-sm leading-relaxed text-foreground/90">
            {analysis.sceneDescription}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="gap-1 text-[11px]">
              <Zap className="h-3 w-3" />
              {analysis.mood || "—"}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {analysis.subject}
            </Badge>
            <Badge variant="outline" className="gap-1 text-[11px]">
              {PRESET_MAP[analysis.recommendedPreset as keyof typeof PRESET_MAP]?.emoji}{" "}
              {PRESET_MAP[analysis.recommendedPreset as keyof typeof PRESET_MAP]?.name}
            </Badge>
          </div>
          {analysis.palette.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Palette className="h-3 w-3 text-muted-foreground" />
              <div className="flex gap-1">
                {analysis.palette.map((c, i) => (
                  <span
                    key={i}
                    className="h-4 w-4 rounded-sm ring-1 ring-white/10"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-primary" />
            <span>
              {layers.length} capas · estrategia{" "}
              {strategy === "depth-slice" ? "Depth Slice" : "AI Extract"}
            </span>
          </div>
          <div className="pt-1">
            <AutoSetup />
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function PanelShell({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          {icon}
        </span>
        <h3 className="text-sm font-medium tracking-tight">{title}</h3>
      </header>
      {children}
    </section>
  );
}

function StrategyCard({
  active,
  onClick,
  icon,
  title,
  badge,
  desc,
  extra,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  badge: string;
  desc: string;
  extra?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5",
        active ? "border-primary bg-primary/10" : "border-white/8 bg-white/[0.02]"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
            {icon}
          </span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
          {badge}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
      {extra}
      <div className="flex items-center gap-1 pt-0.5 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Ejecutar
        <ArrowRight className="h-3 w-3" />
      </div>
    </button>
  );
}
