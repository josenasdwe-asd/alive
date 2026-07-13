"use client";

import { useAliveStore } from "@/lib/store";
import { AliveStage } from "@/components/alive/AliveStage";
import { AnalysisPanel } from "./AnalysisPanel";
import { LayerStack } from "./LayerStack";
import { PresetPicker } from "./PresetPicker";
import { ControlPanel } from "./ControlPanel";
import { ExportPanel } from "./ExportPanel";
import { Loader2, AlertCircle, ImageOff } from "lucide-react";

export function Studio() {
  const {
    status,
    layers,
    animation,
    originalUrl,
    originalDataUrl,
    backgroundUrl,
    depthMapUrl,
    error,
  } = useAliveStore();

  const previewUrl = originalDataUrl ?? originalUrl;
  const isReady = status === "ready";
  const showStage = !!previewUrl;

  // Determine foreground URL
  const foregroundUrl = layers.find((l) => l.role === "foreground")?.url;

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* Left column: analysis + layers */}
        <aside className="space-y-4 lg:sticky lg:top-[4.5rem] lg:self-start">
          <AnalysisPanel />
          {layers.length > 0 && <LayerStack />}
        </aside>

        {/* Center: live preview stage */}
        <main className="space-y-3">
          <div className="relative">
            {showStage ? (
              isReady ? (
                <AliveStage
                  layers={layers}
                  config={animation}
                  originalUrl={originalUrl}
                  backgroundUrl={backgroundUrl}
                  depthUrl={depthMapUrl}
                  foregroundUrl={foregroundUrl}
                  framed
                  aspectClass="aspect-[16/10]"
                />
              ) : (
                <PreviewLoading previewUrl={previewUrl} status={status} />
              )
            ) : (
              <PreviewEmpty />
            )}
          </div>

          {/* Status / error row */}
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              {status === "error" ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-destructive">{error || "Error"}</span>
                </>
              ) : isReady ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    Listo · preset{" "}
                    <span className="text-foreground">{animation.preset}</span> ·
                    modo{" "}
                    <span className="text-foreground">{animation.renderMode}</span>
                  </span>
                </>
              ) : (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Procesando…</span>
                </>
              )}
            </div>
            {isReady && (
              <div className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
                <span>
                  {layers.length} capas
                </span>
                <span>·</span>
                <span>{animation.intensity.toFixed(2)}× intensidad</span>
                <span>·</span>
                <span>{animation.speed.toFixed(2)}× velocidad</span>
              </div>
            )}
          </div>

          {/* Mobile: panels below stage */}
          <div className="space-y-4 lg:hidden">
            <PresetPicker />
            <ControlPanel />
            <ExportPanel />
          </div>
        </main>

        {/* Right column: presets + controls + export (desktop) */}
        <aside className="hidden space-y-4 lg:block lg:sticky lg:top-[4.5rem] lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto scroll-thin lg:pr-1">
          <PresetPicker />
          <ControlPanel />
          {isReady && <ExportPanel />}
        </aside>
      </div>
    </div>
  );
}

function PreviewLoading({
  previewUrl,
  status,
}: {
  previewUrl: string;
  status: string;
}) {
  const labels: Record<string, string> = {
    uploaded: "Iniciando análisis…",
    analyzing: "VLM entendiendo la escena…",
    analyzed: "Generando capas…",
    separating: "Generando fondo inpaintado + depth map…",
  };
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
      { }
      <img
        src={previewUrl}
        alt="Procesando"
        className="h-full w-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/40" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-white/90">
          {labels[status] ?? "Procesando…"}
        </p>
        <p className="text-xs text-white/50">
          La IA está desacoplando tu imagen en capas
        </p>
      </div>
    </div>
  );
}

function PreviewEmpty() {
  return (
    <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-muted-foreground">
      <ImageOff className="h-8 w-8" />
      <p className="text-sm">No hay imagen cargada</p>
    </div>
  );
}
