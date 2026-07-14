"use client";

import { useEffect, useRef } from "react";
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
  const layers = useAliveStore((s) => s.layers);
  const selectedLayerId = useAliveStore((s) => s.selectedLayerId);
  const selectLayer = useAliveStore((s) => s.selectLayer);
  const duplicateLayer = useAliveStore((s) => s.duplicateLayer);
  const removeLayer = useAliveStore((s) => s.removeLayer);
  const reorderLayers = useAliveStore((s) => s.reorderLayers);

  // use refs to avoid re-subscribing on every render
  const layersRef = useRef(layers);
  const selectedRef = useRef(selectedLayerId);

  useEffect(() => {
    layersRef.current = layers;
    selectedRef.current = selectedLayerId;
  });

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
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedRef.current) {
        e.preventDefault();
        duplicateLayer(selectedRef.current);
        return;
      }

      // Cmd/Ctrl+E = toggle editor mode
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        setEditorMode(!editorMode);
        return;
      }

      // Delete/Backspace = remove layer
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current) {
        e.preventDefault();
        removeLayer(selectedRef.current);
        return;
      }

      // 1-9 = select layer N
      const numKey = parseInt(e.key);
      if (!isNaN(numKey) && numKey >= 1 && numKey <= 9) {
        const layer = layersRef.current[numKey - 1];
        if (layer) {
          e.preventDefault();
          selectLayer(layer.id);
        }
        return;
      }

      // [ = move layer back, ] = move layer front
      if (e.key === "[" && selectedRef.current) {
        e.preventDefault();
        const idx = layersRef.current.findIndex((l) => l.id === selectedRef.current);
        if (idx > 0) reorderLayers(selectedRef.current!, layersRef.current[idx - 1].id);
        return;
      }
      if (e.key === "]" && selectedRef.current) {
        e.preventDefault();
        const idx = layersRef.current.findIndex((l) => l.id === selectedRef.current);
        if (idx < layersRef.current.length - 1)
          reorderLayers(selectedRef.current!, layersRef.current[idx + 1].id);
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorMode, setEditorMode]); // refs handle the rest
}
