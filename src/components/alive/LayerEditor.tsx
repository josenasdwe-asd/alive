"use client";

import { useEffect, useRef, useState } from "react";
import Moveable from "react-moveable";
import type { OnDrag, OnResize, OnRotate, OnDragStart } from "react-moveable";
import { useAliveStore } from "@/lib/store";
import type { LayerTransform } from "@/lib/types";

interface LayerEditorProps {
  stageRef: React.RefObject<HTMLDivElement>;
  selectedLayerId?: string;
}

/**
 * Visual transform handles for the selected layer.
 * Uses react-moveable for drag/resize/rotate.
 *
 * BUG FIX: react-moveable's `beforeTranslate` is cumulative from drag start,
 * NOT per-frame. So we capture the transform at onDragStart and set absolute
 * values (start + delta) instead of accumulating.
 */
export function LayerEditor({ stageRef, selectedLayerId }: LayerEditorProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const layers = useAliveStore((s) => s.layers);
  const updateLayerTransform = useAliveStore((s) => s.updateLayerTransform);
  const rafRef = useRef<number>(0);
  const startTransformRef = useRef<LayerTransform | null>(null);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!selectedLayerId || !stageRef.current) {
        setTarget(null);
        return;
      }
      const planes = stageRef.current.querySelectorAll("[data-layer-id]");
      let found: HTMLElement | null = null;
      planes.forEach((p) => {
        const el = p as HTMLElement;
        if (el.dataset.layerId === selectedLayerId) found = el;
      });
      setTarget(found);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [selectedLayerId, layers, stageRef]);

  if (!target || !selectedLayerId) return null;

  const layer = layers.find((l) => l.id === selectedLayerId);
  if (!layer) return null;

  const onDragStart: OnDragStart = () => {
    // capture the starting transform so we can compute absolute positions
    startTransformRef.current = { ...layer.transform };
  };

  const onDrag = ({ beforeTranslate }: OnDrag) => {
    if (!selectedLayerId || !startTransformRef.current) return;
    // absolute: start + cumulative delta (NOT accumulating on top of current)
    updateLayerTransform(selectedLayerId, {
      x: startTransformRef.current.x + beforeTranslate[0],
      y: startTransformRef.current.y + beforeTranslate[1],
    });
  };

  const onResize = ({ delta, drag }: OnResize) => {
    if (!selectedLayerId || !startTransformRef.current) return;
    // delta[0] is the total width change ratio from drag start
    const newScale = Math.max(
      0.1,
      startTransformRef.current.scale * (1 + delta[0] / 200)
    );
    updateLayerTransform(selectedLayerId, {
      scale: newScale,
      x: startTransformRef.current.x + (drag.beforeTranslate?.[0] ?? 0),
      y: startTransformRef.current.y + (drag.beforeTranslate?.[1] ?? 0),
    });
  };

  const onRotate = ({ rotation }: OnRotate) => {
    if (!selectedLayerId || !startTransformRef.current) return;
    updateLayerTransform(selectedLayerId, {
      rotation: startTransformRef.current.rotation + rotation,
    });
  };

  return (
    <Moveable
      target={target}
      draggable={true}
      resizable={true}
      rotatable={true}
      throttleDrag={0}
      throttleResize={0}
      throttleRotate={0}
      keepRatio={false}
      origin={false}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onResize={onResize}
      onRotate={onRotate}
      renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
      rotationPosition="top"
      className="z-50"
    />
  );
}
