"use client";

import { useEffect, useRef, useState } from "react";
import Moveable from "react-moveable";
import type { OnDrag, OnResize, OnRotate } from "react-moveable";
import { useAliveStore } from "@/lib/store";

interface LayerEditorProps {
  /** the stage container that the editor overlays on top of */
  stageRef: React.RefObject<HTMLDivElement>;
  selectedLayerId?: string;
}

/**
 * Visual transform handles for the selected layer.
 * Renders on top of the AliveStage and lets the user drag/resize/rotate
 * the layer directly on the canvas.
 */
export function LayerEditor({ stageRef, selectedLayerId }: LayerEditorProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const layers = useAliveStore((s) => s.layers);
  const updateLayerTransform = useAliveStore((s) => s.updateLayerTransform);
  const rafRef = useRef<number>(0);

  // find the DOM element for the selected layer via rAF (deferred setState)
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!selectedLayerId || !stageRef.current) {
        setTarget(null);
        return;
      }
      const planes = stageRef.current.querySelectorAll(".alive-layer");
      let found: HTMLElement | null = null;
      planes.forEach((p) => {
        const el = p as HTMLElement;
        if (el.dataset.layerId === selectedLayerId) found = el;
      });
      setTarget(found);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [selectedLayerId, layers, stageRef]);

  if (!target) return null;

  const onDrag = ({ beforeTranslate }: OnDrag) => {
    if (!selectedLayerId) return;
    const layer = layers.find((l) => l.id === selectedLayerId);
    if (!layer) return;
    updateLayerTransform(selectedLayerId, {
      x: layer.transform.x + beforeTranslate[0],
      y: layer.transform.y + beforeTranslate[1],
    });
  };

  const onResize = ({ delta }: OnResize) => {
    if (!selectedLayerId) return;
    const layer = layers.find((l) => l.id === selectedLayerId);
    if (!layer) return;
    const newScale = Math.max(
      0.1,
      layer.transform.scale * (delta[0] / 100 + 1)
    );
    updateLayerTransform(selectedLayerId, { scale: newScale });
  };

  const onRotate = ({ rotation }: OnRotate) => {
    if (!selectedLayerId) return;
    const layer = layers.find((l) => l.id === selectedLayerId);
    if (!layer) return;
    updateLayerTransform(selectedLayerId, {
      rotation: layer.transform.rotation + rotation,
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
      onDrag={onDrag}
      onResize={onResize}
      onRotate={onRotate}
      renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
      rotationPosition="top"
      className="z-50"
    />
  );
}
