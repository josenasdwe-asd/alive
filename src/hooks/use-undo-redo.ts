"use client";

import { useEffect, useRef } from "react";
import { useAliveStore } from "@/lib/store";

// Maximum history states to keep
const MAX_HISTORY = 30;

interface HistoryState {
  layers: unknown;
  animation: unknown;
  textOverlay: unknown;
  selectedLayerId: string | undefined;
}

/**
 * Undo/Redo system for the Alive Studio.
 *
 * Tracks snapshots of the store state (layers, animation, textOverlay)
 * and allows Ctrl+Z (undo) / Ctrl+Shift+Z or Ctrl+Y (redo).
 *
 * Implementation: passive observer that snapshots on meaningful changes
 * (debounced 500ms to avoid flooding history on slider drags).
 */
export function useUndoRedo() {
  const store = useAliveStore;
  const historyRef = useRef<HistoryState[]>([]);
  const futureRef = useRef<HistoryState[]>([]);
  const lastSnapshotRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(0) as unknown as ReturnType<typeof setTimeout>;

  // snapshot current state
  const snapshot = (): HistoryState => {
    const s = store.getState();
    return {
      layers: JSON.parse(JSON.stringify(s.layers)),
      animation: JSON.parse(JSON.stringify(s.animation)),
      textOverlay: s.textOverlay ? JSON.parse(JSON.stringify(s.textOverlay)) : undefined,
      selectedLayerId: s.selectedLayerId,
    };
  };

  const takeSnapshot = () => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const current = snapshot();
      const key = JSON.stringify(current);
      if (key === lastSnapshotRef.current) return;
      lastSnapshotRef.current = key;
      historyRef.current.push(current);
      if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
      futureRef.current = []; // clear redo stack
    }, 500);
  };

  const undo = () => {
    if (historyRef.current.length < 2) return;
    const current = historyRef.current.pop()!;
    futureRef.current.push(current);
    const prev = historyRef.current[historyRef.current.length - 1];
    applyState(prev);
  };

  const redo = () => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(next);
    applyState(next);
  };

  const applyState = (state: HistoryState) => {
    useAliveStore.setState({
      layers: state.layers as any,
      animation: state.animation as any,
      textOverlay: state.textOverlay as any,
      selectedLayerId: state.selectedLayerId,
    });
  };

  // keyboard shortcuts
  useEffect(() => {
    // initialize with current state
    if (historyRef.current.length === 0) {
      historyRef.current.push(snapshot());
      lastSnapshotRef.current = JSON.stringify(historyRef.current[0]);
    }

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;

      // Ctrl+Z = undo, Ctrl+Shift+Z or Ctrl+Y = redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { takeSnapshot, undo, redo, canUndo: () => historyRef.current.length > 1, canRedo: () => futureRef.current.length > 0 };
}
