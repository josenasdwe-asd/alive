"use client";

import { create } from "zustand";
import type {
  AnimationConfig,
  ImageLayer,
  ProjectState,
  PresetId,
  SceneAnalysis,
} from "./types";
import { buildAnimationFromPreset } from "./presets";

interface AliveStore extends ProjectState {
  // actions
  reset: () => void;
  setOriginal: (data: {
    id: string;
    url: string;
    width: number;
    height: number;
    dataUrl?: string;
  }) => void;
  setStatus: (status: ProjectState["status"], error?: string) => void;
  setAnalysis: (analysis: SceneAnalysis) => void;
  setLayers: (layers: ImageLayer[]) => void;
  setDepthMap: (url: string) => void;
  setBackground: (url: string) => void;
  applyPreset: (presetId: PresetId) => void;
  updateAnimation: (patch: Partial<AnimationConfig>) => void;
  updateLayerAnim: (
    layerId: string,
    patch: Partial<AnimationConfig["layers"][string]>
  ) => void;
  setReducedMotion: (v: boolean) => void;
}

const emptyAnim: AnimationConfig = {
  preset: "dream",
  intensity: 1,
  speed: 1,
  parallaxEnabled: true,
  liquidEnabled: true,
  particlesEnabled: true,
  shimmerEnabled: true,
  chromaticAberration: 1.2,
  vignette: 0.25,
  reducedMotion: false,
  renderMode: "css",
  layers: {},
};

const initialState: ProjectState = {
  id: "",
  originalUrl: "",
  width: 0,
  height: 0,
  layers: [],
  animation: emptyAnim,
  status: "idle",
};

export const useAliveStore = create<AliveStore>((set, get) => ({
  ...initialState,

  reset: () => set({ ...initialState }),

  setOriginal: ({ id, url, width, height, dataUrl }) =>
    set({
      id,
      originalUrl: url,
      originalDataUrl: dataUrl,
      width,
      height,
      status: "uploaded",
      layers: [],
      analysis: undefined,
      depthMapUrl: undefined,
      backgroundUrl: undefined,
    }),

  setStatus: (status, error) => set({ status, error }),

  setAnalysis: (analysis) => {
    set({ analysis, status: "analyzed" });
    // auto-build layer list from analysis
    const layers: ImageLayer[] = analysis.layers.map((l) => ({
      id: `${l.role}-${l.name}`.replace(/\s+/g, "-").toLowerCase(),
      name: l.name,
      role: l.role,
      depth: l.depth,
      url: "",
      description: l.description,
      parallax: l.role !== "background" || l.depth > 0.1,
    }));
    set({ layers });
  },

  setLayers: (layers) => {
    set({ layers });
    // build animation config from current preset
    const preset = get().animation.preset;
    const depths: Record<string, number> = {};
    layers.forEach((l) => (depths[l.id] = l.depth));
    set({
      animation: buildAnimationFromPreset(preset, layers.map((l) => l.id), depths),
    });
  },

  setDepthMap: (url) => set({ depthMapUrl: url }),
  setBackground: (url) => set({ backgroundUrl: url }),

  applyPreset: (presetId) => {
    const layers = get().layers;
    const depths: Record<string, number> = {};
    layers.forEach((l) => (depths[l.id] = l.depth));
    const anim = buildAnimationFromPreset(
      presetId,
      layers.map((l) => l.id),
      depths
    );
    // preserve reduced motion + custom intensity if user set it
    anim.reducedMotion = get().animation.reducedMotion;
    set({ animation: anim });
  },

  updateAnimation: (patch) =>
    set((s) => ({ animation: { ...s.animation, ...patch } })),

  updateLayerAnim: (layerId, patch) =>
    set((s) => ({
      animation: {
        ...s.animation,
        layers: {
          ...s.animation.layers,
          [layerId]: { ...s.animation.layers[layerId], ...patch },
        },
      },
    })),

  setReducedMotion: (v) =>
    set((s) => ({ animation: { ...s.animation, reducedMotion: v } })),
}));
