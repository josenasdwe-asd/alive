"use client";

import { create } from "zustand";
import type {
  AnimationConfig,
  ImageLayer,
  ProjectState,
  PresetId,
  SceneAnalysis,
  LayerTransform,
  EffectType,
  DecompositionStrategy,
  PipelineStep,
} from "./types";
import {
  DEFAULT_TRANSFORM,
  DEFAULT_LAYER_ANIM,
  ALL_EFFECTS,
} from "./types";
import { buildAnimationFromPreset, PRESET_MAP } from "./presets";

interface AliveStore extends ProjectState {
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
  addLayer: (layer: ImageLayer) => void;
  updateLayer: (id: string, patch: Partial<ImageLayer>) => void;
  updateLayerTransform: (id: string, patch: Partial<LayerTransform>) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayers: (fromId: string, toId: string) => void;
  selectLayer: (id?: string) => void;
  setDepthMap: (url: string) => void;
  setBackground: (url: string) => void;
  applyPreset: (presetId: PresetId) => void;
  updateAnimation: (patch: Partial<AnimationConfig>) => void;
  updateLayerAnim: (
    layerId: string,
    patch: Partial<AnimationConfig["layers"][string]>
  ) => void;
  toggleEffect: (effect: EffectType) => void;
  setReducedMotion: (v: boolean) => void;
  setStrategy: (s: DecompositionStrategy) => void;
  setPipelineStep: (s: PipelineStep) => void;
  /** set layers from depth-slicing (back→front, with depth centroids) */
  setSlicedLayers: (layers: Array<{ url: string; name: string; depth: number }>) => void;
}

const emptyEffects = ALL_EFFECTS.reduce(
  (acc, e) => {
    acc[e] = false;
    return acc;
  },
  {} as Record<EffectType, boolean>
);

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
  mouseSmoothing: 0.06,
  perspective: 1000,
  rotate3dStrength: 8,
  layers: {},
  effects: emptyEffects,
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

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

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
      selectedLayerId: undefined,
    }),

  setStatus: (status, error) => set({ status, error }),

  setAnalysis: (analysis) => {
    set({ analysis, status: "analyzed" });
    const layers: ImageLayer[] = analysis.layers.map((l) => ({
      id: makeId(l.role),
      name: l.name,
      role: l.role,
      depth: l.depth,
      url: "",
      description: l.description,
      source: "ai",
      transform: { ...DEFAULT_TRANSFORM },
    }));
    set({ layers });
  },

  setLayers: (layers) => {
    set({ layers });
    const preset = get().animation.preset;
    const depths: Record<string, number> = {};
    layers.forEach((l) => (depths[l.id] = l.depth));
    set({
      animation: buildAnimationFromPreset(
        preset,
        layers.map((l) => l.id),
        depths
      ),
    });
  },

  addLayer: (layer) => {
    const layers = [...get().layers, layer];
    set({ layers, selectedLayerId: layer.id });
    // add default anim config for this layer
    const anim = get().animation;
    const depth = layer.depth;
    const preset = PRESET_MAP[anim.preset];
    const layerAnim = preset
      ? { layerId: layer.id, ...preset.buildLayer(depth, layers.length - 1, layers.length) }
      : { layerId: layer.id, ...DEFAULT_LAYER_ANIM };
    set({
      animation: {
        ...anim,
        layers: { ...anim.layers, [layer.id]: layerAnim },
      },
    });
  },

  updateLayer: (id, patch) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),

  updateLayerTransform: (id, patch) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id ? { ...l, transform: { ...l.transform, ...patch } } : l
      ),
    })),

  removeLayer: (id) => {
    const layers = get().layers.filter((l) => l.id !== id);
    const anim = get().animation;
    const newLayers = { ...anim.layers };
    delete newLayers[id];
    set({
      layers,
      animation: { ...anim, layers: newLayers },
      selectedLayerId:
        get().selectedLayerId === id ? undefined : get().selectedLayerId,
    });
  },

  duplicateLayer: (id) => {
    const layer = get().layers.find((l) => l.id === id);
    if (!layer) return;
    const newId = makeId(layer.role);
    const newLayer: ImageLayer = {
      ...layer,
      id: newId,
      name: `${layer.name} copy`,
      transform: { ...layer.transform, x: layer.transform.x + 20, y: layer.transform.y + 20 },
    };
    const layers = [...get().layers, newLayer];
    const anim = get().animation;
    const srcAnim = anim.layers[id];
    set({
      layers,
      selectedLayerId: newId,
      animation: {
        ...anim,
        layers: {
          ...anim.layers,
          [newId]: srcAnim ? { ...srcAnim, layerId: newId } : { layerId: newId, ...DEFAULT_LAYER_ANIM },
        },
      },
    });
  },

  reorderLayers: (fromId, toId) => {
    const layers = [...get().layers];
    const fromIdx = layers.findIndex((l) => l.id === fromId);
    const toIdx = layers.findIndex((l) => l.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const [moved] = layers.splice(fromIdx, 1);
    layers.splice(toIdx, 0, moved);
    set({ layers });
  },

  selectLayer: (id) => set({ selectedLayerId: id }),

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
    anim.reducedMotion = get().animation.reducedMotion;
    // preserve per-layer transform visibility/locked from existing layers
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

  toggleEffect: (effect) =>
    set((s) => ({
      animation: {
        ...s.animation,
        effects: {
          ...s.animation.effects,
          [effect]: !s.animation.effects[effect],
        },
      },
    })),

  setReducedMotion: (v) =>
    set((s) => ({ animation: { ...s.animation, reducedMotion: v } })),

  setStrategy: (s) => set({ strategy: s }),

  setPipelineStep: (s) => set({ pipelineStep: s }),

  setSlicedLayers: (sliced) => {
    // build ImageLayer[] from sliced layers (already back→front with depth centroids)
    const layers: ImageLayer[] = sliced.map((s, i) => ({
      id: `slice-${i}-${Math.random().toString(36).slice(2, 7)}`,
      name: s.name,
      role:
        i === 0
          ? "background"
          : i === sliced.length - 1
            ? "foreground"
            : i === Math.floor(sliced.length / 2)
              ? "subject"
              : "midground",
      depth: s.depth,
      url: s.url,
      description: `Depth band ${i + 1}`,
      source: "depth-slice",
      transform: { ...DEFAULT_TRANSFORM },
    }));
    set({ layers, pipelineStep: "animate", status: "ready" });
    // build animation config from current preset
    const preset = get().animation.preset;
    const depths: Record<string, number> = {};
    layers.forEach((l) => (depths[l.id] = l.depth));
    set({
      animation: buildAnimationFromPreset(
        preset,
        layers.map((l) => l.id),
        depths
      ),
    });
  },
}));
