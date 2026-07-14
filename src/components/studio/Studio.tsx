"use client";

import { useEffect, useRef, useState } from "react";
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
import { Pipeline25DPanel } from "./Pipeline25DPanel";
import { ScenePanel } from "./ScenePanel";
import { CinematicPanel } from "./CinematicPanel";
import { MiniTimeline } from "./MiniTimeline";
import { ComparisonSlider } from "./ComparisonSlider";
import { NaturalLanguageAnimate } from "./NaturalLanguageAnimate";
import { QualityScore } from "./QualityScore";
import { ProjectPanel } from "./ProjectPanel";
import { ExportVideoPanel } from "./ExportVideoPanel";
import { FlowFieldOverlay } from "@/components/alive/FlowFieldOverlay";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import { useProjectPersistence } from "@/hooks/use-project-persistence";
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
  Mountain,
  Undo2,
  Redo2,
  Wand2,
  Wind,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PRESET_MAP } from "@/lib/presets";
import { SCENE_MAP } from "@/lib/scene-compositions";
import type { PresetId, SceneCompositionId } from "@/lib/types";

type RightTab = "animate" | "scene" | "atmosphere" | "hero" | "export";

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
    heroMode,
    width,
    height,
    selectLayer,
    updateLayerTransform,
    setHeroMode,
  } = useAliveStore();

  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const [editorMode, setEditorMode] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("animate");
  const [restored, setRestored] = useState(false);
  const [flowFieldEnabled, setFlowFieldEnabled] = useState(false);

  useKeyboardShortcuts(editorMode, setEditorMode);
  const undoRedo = useUndoRedo();
  const { loadCurrentSession } = useProjectPersistence();

  // v3 FEATURE: Auto-restore last session on mount (prevents losing work on refresh)
  useEffect(() => {
    if (restored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestored(true);
    const didRestore = loadCurrentSession();
    if (didRestore) {
      toast.success("Sesión restaurada", {
        description: "Tu proyecto anterior se cargó automáticamente",
      });
    }
  }, [restored, loadCurrentSession]);

  const previewUrl = originalDataUrl ?? originalUrl;
  const isReady = status === "ready";

  // BUG A1 FIX: derive stage aspect from the original image dimensions instead of
  // hardcoding 16:10. Portrait/square images no longer get cropped to landscape.
  // Clamp to reasonable bounds so extreme ratios (e.g. panoramas) don't break layout.
  const stageAspect = width > 0 && height > 0
    ? Math.max(0.5, Math.min(2.5, width / height))
    : 16 / 10;

  // Hero mode = full-viewport overlay
  if (heroMode && isReady) {
    return <HeroMode onExit={() => setHeroMode(false)} />;
  }
  const showStage = !!previewUrl;

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* Left column — layers (desktop: left, mobile: below stage) */}
        <aside className="order-2 space-y-3 lg:order-1 lg:sticky lg:top-[4.5rem] lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto scroll-thin lg:pr-1">
          <AnalysisPanel />
          {isReady && <LayersPanel />}
          {isReady && selectedLayerId && <LayerInspector />}
        </aside>

        {/* Center — stage (mobile: first, desktop: center) */}
        <main className="order-1 space-y-3 lg:order-2">
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
                    framed
                    aspectRatio={stageAspect}
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
                  {/* v3 VANGUARDIA: Flow field drawing overlay */}
                  {flowFieldEnabled && (
                    <FlowFieldOverlay enabled={flowFieldEnabled} onToggle={() => setFlowFieldEnabled(false)} />
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
              {/* P0 fix: prominent AutoSetup button as primary CTA */}
              <AutoSetupToolbar />

              <div className="h-4 w-px bg-white/10" />

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

              <ComparisonSlider />

              {/* v3 VANGUARDIA: Flow field toggle */}
              <button
                onClick={() => setFlowFieldEnabled(!flowFieldEnabled)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                  flowFieldEnabled
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-white/5 text-muted-foreground hover:text-foreground"
                )}
                title="Flow field: dibuja flechas para movimiento direccional"
              >
                <Wind className="h-3 w-3" />
                Flow
              </button>

              <div className="h-4 w-px bg-white/10" />

              <button
                onClick={() => undoRedo.undo()}
                disabled={!undoRedo.canUndo}
                className="rounded-md border border-white/5 p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                aria-label="Deshacer" title="Deshacer (Ctrl+Z)"
              >
                <Undo2 className="h-3 w-3" />
              </button>
              <button
                onClick={() => undoRedo.redo()}
                disabled={!undoRedo.canRedo}
                className="rounded-md border border-white/5 p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)"
              >
                <Redo2 className="h-3 w-3" />
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

          {/* Mini-timeline */}
          {isReady && <MiniTimeline />}

          {/* Mobile: right-panel tabs below stage (P1 fix: was before the stage on mobile) */}
          <div className="order-3 space-y-3 lg:hidden">
            {isReady && (
              <RightPanelTabs
                tab={rightTab}
                setTab={setRightTab}
                isReady={isReady}
              />
            )}
          </div>
        </main>

        {/* Right column — contextual tabs (desktop only) */}
        <aside className="order-3 hidden lg:order-3 lg:block lg:sticky lg:top-[4.5rem] lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto scroll-thin lg:pr-1">
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
      <div className="scroll-thin flex items-center gap-1 overflow-x-auto rounded-lg border border-white/5 bg-white/[0.02] p-1">
        <TabButton
          active={tab === "animate"}
          onClick={() => setTab("animate")}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          label="Animar"
        />
        <TabButton
          active={tab === "scene"}
          onClick={() => setTab("scene")}
          icon={<Mountain className="h-3.5 w-3.5" />}
          label="Escena"
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
          {/* v3 INTELLIGENCE: Natural language animation input — most prominent */}
          <NaturalLanguageAnimate />
          <PresetPicker />
          <ControlPanel />
          {/* GAP-H fix: Pipeline 2.5D + Cinematic now always visible (was collapsed in <details>) */}
          <Pipeline25DPanel />
          <CinematicPanel />
          {/* v3 INTELLIGENCE: Quality scoring + suggestions */}
          <QualityScore />
        </>
      )}
      {tab === "scene" && <ScenePanel />}
      {tab === "atmosphere" && <EffectsPanel />}
      {tab === "hero" && <HeroPanel />}
      {tab === "export" && isReady && (
        <>
          <ProjectPanel />
          <section className="glass rounded-xl p-3">
            <ExportVideoPanel />
          </section>
          <ExportPanel />
        </>
      )}
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
      role="tab"
      aria-selected={active}
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

/**
 * P0 fix: prominent AutoSetup toolbar button — the primary "one-click animate" CTA.
 * v3 INTELLIGENCE: now applies full AI-recommended config + per-layer animation suggestions.
 */
function AutoSetupToolbar() {
  const analysis = useAliveStore((s) => s.analysis);
  const layers = useAliveStore((s) => s.layers);
  const animation = useAliveStore((s) => s.animation);
  const applyPreset = useAliveStore((s) => s.applyPreset);
  const applySceneComp = useAliveStore((s) => s.applySceneComp);
  const applyIntelligentConfig = useAliveStore((s) => s.applyIntelligentConfig);
  const applyLayerAnimSuggestions = useAliveStore((s) => s.applyLayerAnimSuggestions);
  const updateAnimation = useAliveStore((s) => s.updateAnimation);

  if (!analysis || layers.length === 0) return null;

  const handleAutoSetup = () => {
    const presetId = (analysis.recommendedPreset as PresetId) ?? "dream";
    applyPreset(presetId);

    // v3 INTELLIGENCE: apply full AI config bundle
    if (analysis.recommendedConfig) {
      applyIntelligentConfig(analysis.recommendedConfig);
    } else {
      // Fallback: legacy scene composition
      const hasBackground = layers.some((l) => l.role === "background");
      const layerCount = layers.length;
      let sceneId: SceneCompositionId = "free";
      if (layerCount >= 5 && hasBackground) {
        sceneId = "horizon";
      } else if (layers.some((l) => l.role === "subject")) {
        sceneId = "subject-focus";
      } else if (layerCount <= 4) {
        sceneId = "anchor-midground";
      }
      applySceneComp(sceneId);

      const isCinematic = presetId === "cinematic3d" || presetId === "cosmic";
      const isDreamy = presetId === "dream" || presetId === "ethereal" || presetId === "aurora";
      const patch: Partial<typeof animation> = {};
      if (animation.intensity === 1) {
        patch.intensity = isCinematic ? 1.3 : isDreamy ? 0.9 : 1.0;
      }
      if (animation.speed === 1) {
        patch.speed = isCinematic ? 0.85 : isDreamy ? 0.8 : 1.0;
      }
      updateAnimation(patch);
    }

    // v3 INTELLIGENCE: per-layer animation suggestions
    if (analysis.layers.some((l: any) => l.suggestedAnimations?.length)) {
      const suggestions = layers.map((storeLayer, i) => ({
        layerId: storeLayer.id,
        animations: (analysis.layers[i]?.suggestedAnimations as string[]) ?? [],
      }));
      applyLayerAnimSuggestions(suggestions);
    }

    updateAnimation({ entranceEnabled: true, parallaxEnabled: true });

    const presetName = PRESET_MAP[presetId]?.name ?? presetId;
    const hasIntelligentConfig = !!analysis.recommendedConfig;
    toast.success(
      hasIntelligentConfig
        ? `🧠 IA: ${presetName}`
        : `✨ ${presetName}`,
      {
        description: hasIntelligentConfig
          ? "Configuración inteligente aplicada. Mueve el mouse para sentirlo."
          : "La imagen está viva. Mueve el mouse para sentir el parallax.",
      }
    );
  };

  const hasIntelligentConfig = !!analysis?.recommendedConfig;

  return (
    <button
      onClick={handleAutoSetup}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
        hasIntelligentConfig
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
      )}
      title={hasIntelligentConfig ? "Configuración inteligente IA" : "Auto-setup básico"}
    >
      <Wand2 className="h-3 w-3" />
      {hasIntelligentConfig ? "Dar vida (IA)" : "Dar vida"}
    </button>
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
