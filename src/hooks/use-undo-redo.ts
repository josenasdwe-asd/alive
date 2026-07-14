"use client";

import { useEffect, useRef, useState } from "react";
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
 * Automatically snapshots the store state (debounced 800ms) whenever
 * layers, animation, or textOverlay change.
 *
 * Keyboard: Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo.
 */
export function useUndoRedo() {
  const historyRef = useRef<HistoryState[]>([]);
  const futureRef = useRef<HistoryState[]>([]);
  const lastSnapshotRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingRef = useRef(false);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = () => {
    setCanUndo(historyRef.current.length > 1);
    setCanRedo(futureRef.current.length > 0);
  };

  // subscribe to store changes and auto-snapshot (debounced)
  useEffect(() => {
    // take initial snapshot
    const s = useAliveStore.getState();
    const initial: HistoryState = {
      layers: JSON.parse(JSON.stringify(s.layers)),
      animation: JSON.parse(JSON.stringify(s.animation)),
      textOverlay: s.textOverlay ? JSON.parse(JSON.stringify(s.textOverlay)) : undefined,
      selectedLayerId: s.selectedLayerId,
    };
    historyRef.current = [initial];
    lastSnapshotRef.current = JSON.stringify(initial);
    updateFlags();

    // subscribe to store changes
    const unsubscribe = useAliveStore.subscribe((state, prev) => {
      if (isApplyingRef.current) return; // skip when we're applying undo/redo

      // debounce snapshot
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const current: HistoryState = {
          layers: JSON.parse(JSON.stringify(state.layers)),
          animation: JSON.parse(JSON.stringify(state.animation)),
          textOverlay: state.textOverlay ? JSON.parse(JSON.stringify(state.textOverlay)) : undefined,
          selectedLayerId: state.selectedLayerId,
        };
        const key = JSON.stringify(current);
        if (key === lastSnapshotRef.current) return;
        lastSnapshotRef.current = key;
        historyRef.current.push(current);
        if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
        futureRef.current = [];
        updateFlags();
      }, 800);
    });

    return () => unsubscribe();
  }, []);

  const undo = () => {
    if (historyRef.current.length < 2) return;
    const current = historyRef.current.pop()!;
    futureRef.current.push(current);
    const prev = historyRef.current[historyRef.current.length - 1];

    isApplyingRef.current = true;
    useAliveStore.setState({
      layers: prev.layers as any,
      animation: prev.animation as any,
      textOverlay: prev.textOverlay as any,
      selectedLayerId: prev.selectedLayerId,
    });
    setTimeout(() => { isApplyingRef.current = false; }, 100);
    updateFlags();
  };

  const redo = () => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(next);

    isApplyingRef.current = true;
    useAliveStore.setState({
      layers: next.layers as any,
      animation: next.animation as any,
      textOverlay: next.textOverlay as any,
      selectedLayerId: next.selectedLayerId,
    });
    setTimeout(() => { isApplyingRef.current = false; }, 100);
    updateFlags();
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;

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

  return { undo, redo, canUndo, canRedo };
}
