"use client";

import { Wand2, Sparkles, Brain } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { PRESET_MAP } from "@/lib/presets";
import { SCENE_MAP } from "@/lib/scene-compositions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { PresetId, SceneCompositionId } from "@/lib/types";

/**
 * Auto-setup inteligente v3 — now applies the FULL AI-recommended config bundle:
 * 1. The recommended preset from VLM analysis
 * 2. The full recommendedConfig (renderMode, colorGrade, effects, DOF, relighting, etc.)
 * 3. Per-layer animation suggestions based on content (trees sway, water waves, etc.)
 * 4. Optimal intensity, speed
 *
 * This is the "make it look amazing in one click" button — now truly intelligent.
 */
export function AutoSetup() {
  const {
    analysis,
    layers,
    animation,
    applyPreset,
    applySceneComp,
    applyIntelligentConfig,
    applyLayerAnimSuggestions,
    updateAnimation,
  } = useAliveStore();

  if (!analysis || layers.length === 0) return null;

  const handleAutoSetup = () => {
    // 1. Apply recommended preset
    const presetId = (analysis.recommendedPreset as PresetId) ?? "dream";
    applyPreset(presetId);

    // 2. Apply the FULL AI-recommended config bundle (v3 INTELLIGENCE)
    if (analysis.recommendedConfig) {
      applyIntelligentConfig(analysis.recommendedConfig);
    } else {
      // Fallback: legacy scene composition detection
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
    }

    // 3. Apply per-layer animation suggestions (v3 INTELLIGENCE)
    // Map analysis.layers[i].suggestedAnimations to store layers by index
    if (analysis.layers.some((l: any) => l.suggestedAnimations?.length)) {
      const suggestions = layers.map((storeLayer, i) => ({
        layerId: storeLayer.id,
        animations: (analysis.layers[i]?.suggestedAnimations as string[]) ?? [],
      }));
      applyLayerAnimSuggestions(suggestions);
    }

    // 4. Ensure entrance + parallax enabled
    updateAnimation({ entranceEnabled: true, parallaxEnabled: true });

    const presetName = PRESET_MAP[presetId]?.name ?? presetId;
    const hasIntelligentConfig = !!analysis.recommendedConfig;
    toast.success(
      hasIntelligentConfig
        ? `🧠 Configuración inteligente: ${presetName}`
        : `✨ Configurado: ${presetName}`,
      {
        description: hasIntelligentConfig
          ? "IA aplicó preset + color grade + effects + DOF + animaciones por capa. Mueve el mouse para sentirlo."
          : "La imagen está viva. Mueve el mouse para sentir el parallax.",
      }
    );
  };

  const hasIntelligentConfig = !!analysis.recommendedConfig;

  return (
    <Button
      onClick={handleAutoSetup}
      className="w-full gap-2"
      size="sm"
      variant={hasIntelligentConfig ? "default" : "secondary"}
    >
      {hasIntelligentConfig ? (
        <Brain className="h-3.5 w-3.5" />
      ) : (
        <Wand2 className="h-3.5 w-3.5" />
      )}
      {hasIntelligentConfig ? "Dar vida (IA)" : "Dar vida"}
      <Sparkles className="h-3 w-3 opacity-60" />
    </Button>
  );
}
