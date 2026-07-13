"use client";

import { useEffect, useState } from "react";
import {
  ScanSearch,
  Layers as LayersIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Palette,
  Eye,
  Zap,
} from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PRESET_MAP } from "@/lib/presets";

type Stage = "idle" | "analyzing" | "analyzed" | "separating" | "ready" | "error";

export function AnalysisPanel() {
  const {
    originalUrl,
    originalDataUrl,
    analysis,
    layers,
    backgroundUrl,
    depthUrl,
    status,
    error,
    setAnalysis,
    setLayers,
    setDepthMap,
    setBackground,
    setStatus,
    applyPreset,
  } = useAliveStore();

  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);

  const previewUrl = originalDataUrl ?? originalUrl;

  // auto-run analysis when image uploaded
  useEffect(() => {
    if (status === "uploaded" && stage === "idle") {
      void runAnalyze();
    }
     
  }, [status]);

  async function runAnalyze() {
    setStage("analyzing");
    setStatus("analyzing");
    setProgress(15);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: originalUrl }),
      });
      setProgress(45);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Analysis failed");
      setAnalysis(data.analysis);
      setStage("analyzed");
      setStatus("analyzed");
      setProgress(60);
      toast.success("Análisis completo — generando capas…");
      // auto-run separation
      void runSeparate(data.analysis.subject, data.analysis.layers);
    } catch (err: any) {
      setStage("error");
      setStatus("error", err?.message);
      toast.error(err?.message ?? "Error en el análisis");
    }
  }

  async function runSeparate(
    subject: string,
    sceneLayers: Array<{
      name: string;
      role: string;
      description: string;
      extractPrompt?: string;
      depth: number;
    }>
  ) {
    setStage("separating");
    setStatus("separating");
    setProgress(65);
    try {
      const res = await fetch("/api/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: originalUrl,
          subject,
          layers: sceneLayers,
        }),
      });
      setProgress(90);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Separation failed");

      if (data.background) setBackground(data.background.url);
      if (data.depth) setDepthMap(data.depth.url);

      // build final layer list — use extracted assets where available, else original
      const currentLayers = useAliveStore.getState().layers;
      const extractedMap = new Map<string, string>();
      for (const ex of data.extracted ?? []) {
        extractedMap.set(ex.layerName, ex.url);
      }

      const updatedLayers = currentLayers.map((l) => {
        if (l.role === "background" && data.background)
          return { ...l, url: data.background.url };
        const exUrl = extractedMap.get(l.name);
        if (exUrl) return { ...l, url: exUrl };
        return { ...l, url: originalUrl };
      });
      setLayers(updatedLayers);

      setStage("ready");
      setStatus("ready");
      setProgress(100);
      toast.success(`¡${updatedLayers.length} capas listas! La imagen está viva.`);
      // apply recommended preset
      const preset = useAliveStore.getState().analysis?.recommendedPreset;
      if (preset) applyPreset(preset as any);
    } catch (err: any) {
      setStage("error");
      setStatus("error", err?.message);
      toast.error(err?.message ?? "Error generando capas");
    }
  }

  if (stage === "idle" || stage === "analyzing") {
    return (
      <PanelShell title="Analizando imagen" icon={<ScanSearch className="h-4 w-4" />}>
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg">
            { }
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

  if (stage === "separating" || (stage === "analyzed" && !backgroundUrl)) {
    return (
      <PanelShell
        title="Generando capas"
        icon={<LayersIcon className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <Progress value={progress} className="h-1.5" />
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-primary" /> Análisis VLM
            </li>
            <li className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              Fondo inpaintado (subject removed)
            </li>
            <li className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              Mapa de profundidad
            </li>
          </ul>
        </div>
      </PanelShell>
    );
  }

  // ready — show analysis summary
  return (
    <PanelShell
      title="Análisis & capas"
      icon={<Eye className="h-4 w-4" />}
    >
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
              Sujeto: {analysis.subject}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
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
    <section className="glass rounded-xl p-4">
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
