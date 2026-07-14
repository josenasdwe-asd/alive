"use client";

import { Wand2, Sparkles } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { PRESET_MAP } from "@/lib/presets";
import { SCENE_MAP } from "@/lib/scene-compositions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { PresetId, SceneCompositionId } from "@/lib/types";

/**
 * Auto-setup inteligente — one click "Dar vida" that configures:
 * 1. The recommended preset from VLM analysis
 * 2. The best scene composition based on layer count
 * 3. Optimal intensity, speed, and effects
 *
 * This is the "make it look amazing in one click" button.
 */
export function AutoSetup() {
  const {
    analysis,
    layers,
    animation,
    applyPreset,
    applySceneComp,
    updateAnimation,
  } = useAliveStore();

  if (!analysis || layers.length === 0) return null;

  const handleAutoSetup = () => {
    // 1. Apply recommended preset
    const presetId = (analysis.recommendedPreset as PresetId) ?? "dream";
    applyPreset(presetId);

    // 2. Pick best scene composition based on layer count and roles
    const hasForeground = layers.some((l) => l.role === "foreground");
    const hasBackground = layers.some((l) => l.role === "background");
    const layerCount = layers.length;

    let sceneId: SceneCompositionId = "free";
    if (layerCount >= 5 && hasBackground) {
      sceneId = "horizon"; // landscapes with depth
    } else if (layers.some((l) => l.role === "subject")) {
      sceneId = "subject-focus"; // portraits / subjects
    } else if (layerCount <= 4) {
      sceneId = "anchor-midground"; // few layers = balanced
    }
    applySceneComp(sceneId);

    // 3. Optimal global settings based on preset type
    const isCinematic = presetId === "cinematic3d" || presetId === "cosmic";
    const isDreamy = presetId === "dream" || presetId === "ethereal" || presetId === "aurora";

    updateAnimation({
      intensity: isCinematic ? 1.3 : isDreamy ? 0.9 : 1.0,
      speed: isCinematic ? 0.85 : isDreamy ? 0.8 : 1.0,
      // auto-enable some effects for maximum "alive" feel
      entranceEnabled: true,
      parallaxEnabled: true,
      // don't auto-enable heavy effects — let user discover them
    });

    const presetName = PRESET_MAP[presetId]?.name ?? presetId;
    const sceneName = SCENE_MAP[sceneId]?.name ?? sceneId;
    toast.success(`✨ Configurado: ${presetName} + ${sceneName}`, {
      description: "La imagen está viva. Mueve el mouse para sentir el parallax.",
    });
  };

  return (
    <Button
      onClick={handleAutoSetup}
      className="w-full gap-2"
      size="sm"
    >
      <Wand2 className="h-3.5 w-3.5" />
      Dar vida
      <Sparkles className="h-3 w-3 opacity-60" />
    </Button>
  );
}
