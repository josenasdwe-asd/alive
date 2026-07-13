"use client";

import { useRef, useState } from "react";
import { useAliveStore } from "@/lib/store";
import { AliveStage } from "@/components/alive/AliveStage";
import { LayerEditor } from "@/components/alive/LayerEditor";
import { AnalysisPanel } from "./AnalysisPanel";
import { LayersPanel } from "./LayersPanel";
import { LayerInspector } from "./LayerInspector";
import { PresetPicker } from "./PresetPicker";
import { ControlPanel } from "./ControlPanel";
import { EffectsPanel } from "./EffectsPanel";
import { ExportPanel } from "./ExportPanel";
import {
  Loader2,
  AlertCircle,
  ImageOff,
  MousePointer2,
  Hand,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    selectedLayerId,
    selectLayer,
    updateLayerTransform,
  } = useAliveStore();

  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const [editorMode, setEditorMode] = useState(false);

  const previewUrl = originalDataUrl ?? originalUrl;
  const isReady = status === "ready";
  const showStage = !!previewUrl;

  const foregroundUrl = layers.find(
    (l) => l.role === "foreground" && l.url
  )?.url;

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        {/* Left column */}
        <aside className="space-y-3 lg:sticky lg:top-[4.5rem] lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto scroll-thin lg:pr-1">
          <AnalysisPanel />
          {isReady && <LayersPanel />}
          {isReady && selectedLayerId && <LayerInspector />}
        </aside>

        {/* Center: live preview stage */}
        <main className="space-y-3">
          <div ref={stageWrapperRef} className="relative">
            {showStage ? (
              isReady ? (
                <>
                  <AliveStage
                    layers={layers}
                    config={animation}
                    originalUrl={originalUrl}
                    backgroundUrl={backgroundUrl}
                    depthUrl={depthMapUrl}
                    foregroundUrl={foregroundUrl}
                    framed
                    aspectClass="aspect-[16/10]"
                    editorMode={editorMode}
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={(id) => selectLayer(id || undefined)}
                    onLayerTransform={updateLayerTransform}
                  />
                  {editorMode && selectedLayerId && (
                    <LayerEditor
                      stageRef={stageWrapperRef}
                      selectedLayerId={selectedLayerId}
                    />
                  )}
                </>
              ) : (
                <PreviewLoading previewUrl={previewUrl} status={status} />
              )
            ) : (
              <PreviewEmpty />
            )}
          </div>

          {/* Toolbar */}
          {isReady && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <button
                onClick={() => setEditorMode(!editorMode)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                  editorMode
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-white/5 text-muted-foreground hover:text-foreground"
                )}
              >
                {editorMode ? (
                  <MousePointer2 className="h-3 w-3" />
                ) : (
                  <Hand className="h-3 w-3" />
                )}
                {editorMode ? "Editar capas" : "Mover capas"}
              </button>

              <div className="h-4 w-px bg-white/10" />

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {status === "error" ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-destructive">{error || "Error"}</span>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>
                      preset <span className="text-foreground">{animation.preset}</span>
                    </span>
                    <span>·</span>
                    <span>
                      modo <span className="text-foreground">{animation.renderMode}</span>
                    </span>
                    <span>·</span>
                    <span>
                      {layers.length} capas
                    </span>
                    <span>·</span>
                    <span>{animation.intensity.toFixed(2)}×</span>
                  </>
                )}
              </div>

              {editorMode && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  Clic en una capa para seleccionarla · arrastra para mover
                </span>
              )}
            </div>
          )}

          {/* Mobile: panels below stage */}
          <div className="space-y-3 lg:hidden">
            <PresetPicker />
            <EffectsPanel />
            <ControlPanel />
            <ExportPanel />
          </div>
        </main>

        {/* Right column */}
        <aside className="hidden space-y-3 lg:block lg:sticky lg:top-[4.5rem] lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto scroll-thin lg:pr-1">
          <PresetPicker />
          <EffectsPanel />
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
    analyzing: "VLM entendiendo la escena (6-8 capas)…",
    analyzed: "Generando capas (fondo + depth + extracciones)…",
    separating: "Extrayendo elementos con IA…",
  };
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
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
          La IA está desacoplando tu imagen en múltiples capas
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
