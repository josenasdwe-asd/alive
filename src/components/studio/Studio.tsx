"use client";

import { useRef, useState } from "react";
import { useAliveStore } from "@/lib/store";
import { AliveStage } from "@/components/alive/AliveStage";
import { LayerEditor } from "@/components/alive/LayerEditor";
import { HeroMode } from "@/components/alive/HeroMode";
import { AnalysisPanel } from "./AnalysisPanel";
import { LayersPanel } from "./LayersPanel";
import { LayerInspector } from "./LayerInspector";
import { PresetPicker } from "./PresetPicker";
import { ControlPanel } from "./ControlPanel";
import { EffectsPanel } from "./EffectsPanel";
import { ExportPanel } from "./ExportPanel";
import { HeroPanel } from "./HeroPanel";
import {
  Loader2,
  AlertCircle,
  ImageOff,
  MousePointer2,
  Hand,
  SlidersHorizontal,
  Sparkles,
  Code2,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RightTab = "animate" | "atmosphere" | "hero" | "export";

export function Studio() {
  const {
    status,
    layers,
    animation,
    originalUrl,
    originalDataUrl,
    depthMapUrl,
    error,
    selectedLayerId,
    heroMode,
    selectLayer,
    updateLayerTransform,
    setHeroMode,
  } = useAliveStore();

  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const [editorMode, setEditorMode] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("animate");

  const previewUrl = originalDataUrl ?? originalUrl;
  const isReady = status === "ready";

  // Hero mode = full-viewport overlay
  if (heroMode && isReady) {
    return <HeroMode onExit={() => setHeroMode(false)} />;
  }
  const showStage = !!previewUrl;

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* Left column — layers */}
        <aside className="space-y-3 lg:sticky lg:top-[4.5rem] lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto scroll-thin lg:pr-1">
          <AnalysisPanel />
          {isReady && <LayersPanel />}
          {isReady && selectedLayerId && <LayerInspector />}
        </aside>

        {/* Center — stage */}
        <main className="space-y-3">
          <div ref={stageWrapperRef} className="relative">
            {showStage ? (
              isReady ? (
                <>
                  <AliveStage
                    layers={layers}
                    config={animation}
                    originalUrl={originalUrl}
                    depthUrl={depthMapUrl}
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
                {editorMode ? "Editando" : "Mover capas"}
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
                      <span className="text-foreground">{animation.preset}</span>
                      <span className="mx-1">·</span>
                      {animation.renderMode}
                      <span className="mx-1">·</span>
                      {layers.length} capas
                    </span>
                  </>
                )}
              </div>

              {editorMode && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  Clic en una capa para seleccionarla
                </span>
              )}
            </div>
          )}

          {/* Mobile: panels below stage */}
          <div className="space-y-3 lg:hidden">
            {isReady && (
              <RightPanelTabs
                tab={rightTab}
                setTab={setRightTab}
                isReady={isReady}
              />
            )}
          </div>
        </main>

        {/* Right column — contextual tabs (desktop) */}
        <aside className="hidden lg:block lg:sticky lg:top-[4.5rem] lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto scroll-thin lg:pr-1">
          {isReady ? (
            <RightPanelTabs
              tab={rightTab}
              setTab={setRightTab}
              isReady={isReady}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function RightPanelTabs({
  tab,
  setTab,
  isReady,
}: {
  tab: RightTab;
  setTab: (t: RightTab) => void;
  isReady: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Tab selector */}
      <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-1">
        <TabButton
          active={tab === "animate"}
          onClick={() => setTab("animate")}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          label="Animar"
        />
        <TabButton
          active={tab === "atmosphere"}
          onClick={() => setTab("atmosphere")}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Atmósfera"
        />
        <TabButton
          active={tab === "hero"}
          onClick={() => setTab("hero")}
          icon={<Maximize2 className="h-3.5 w-3.5" />}
          label="Hero"
        />
        <TabButton
          active={tab === "export"}
          onClick={() => setTab("export")}
          icon={<Code2 className="h-3.5 w-3.5" />}
          label="Exportar"
        />
      </div>

      {tab === "animate" && (
        <>
          <PresetPicker />
          <ControlPanel />
        </>
      )}
      {tab === "atmosphere" && <EffectsPanel />}
      {tab === "hero" && <HeroPanel />}
      {tab === "export" && isReady && <ExportPanel />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
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
    analyzed: "Elige estrategia de desacoplo…",
    separating: "Generando capas…",
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
          La IA está entendiendo tu imagen
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
