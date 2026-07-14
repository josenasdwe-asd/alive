"use client";

import { useEffect } from "react";
import { useAliveStore } from "@/lib/store";

/**
 * Professional keyboard shortcuts for the studio.
 * V = move tool, R = rotate, S = scale
 * Cmd/Ctrl+D = duplicate layer, Delete/Backspace = remove
 * 1-9 = select layer N, [ ] = reorder back/front
 * Cmd/Ctrl+E = toggle editor mode
 */
export function useKeyboardShortcuts(
  editorMode: boolean,
  setEditorMode: (v: boolean) => void
) {
  const {
    layers,
    selectedLayerId,
    selectLayer,
    duplicateLayer,
    removeLayer,
    reorderLayers,
  } = useAliveStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ignore if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      // Cmd/Ctrl+D = duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedLayerId) {
        e.preventDefault();
        duplicateLayer(selectedLayerId);
        return;
      }

      // Cmd/Ctrl+E = toggle editor mode
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        setEditorMode(!editorMode);
        return;
      }

      // Delete/Backspace = remove layer
      if ((e.key === "Delete" || e.key === "Backspace") && selectedLayerId) {
        e.preventDefault();
        removeLayer(selectedLayerId);
        return;
      }

      // 1-9 = select layer N
      const numKey = parseInt(e.key);
      if (!isNaN(numKey) && numKey >= 1 && numKey <= 9) {
        const layer = layers[numKey - 1];
        if (layer) {
          e.preventDefault();
          selectLayer(layer.id);
        }
        return;
      }

      // [ = move layer back, ] = move layer front
      if (e.key === "[" && selectedLayerId) {
        e.preventDefault();
        const idx = layers.findIndex((l) => l.id === selectedLayerId);
        if (idx > 0) reorderLayers(selectedLayerId, layers[idx - 1].id);
        return;
      }
      if (e.key === "]" && selectedLayerId) {
        e.preventDefault();
        const idx = layers.findIndex((l) => l.id === selectedLayerId);
        if (idx < layers.length - 1)
          reorderLayers(selectedLayerId, layers[idx + 1].id);
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    layers,
    selectedLayerId,
    editorMode,
    setEditorMode,
    selectLayer,
    duplicateLayer,
    removeLayer,
    reorderLayers,
  ]);
}
