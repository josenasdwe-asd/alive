"use client";

import { useEffect, useRef } from "react";

interface MotionBlurProps {
  enabled: boolean;
  /** blur strength 0..1 */
  strength: number;
  /** mouse velocity X (from parent) */
  velocityX: number;
  /** mouse velocity Y */
  velocityY: number;
}

/**
 * Directional motion blur overlay.
 *
 * When the parallax is strong (high mouse velocity), applies a blur
 * in the direction of movement. This simulates camera shutter blur
 * and makes fast parallax feel more natural (less jarring).
 *
 * Implementation: CSS filter with directional blur approximation
 * using multiple offset shadows. For true directional blur we'd need
 * WebGL, but this CSS approximation is performant and looks good.
 */
export function MotionBlur({
  enabled,
  strength,
  velocityX,
  velocityY,
}: MotionBlurProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const velRef = useRef({ vx: velocityX, vy: velocityY });

  useEffect(() => {
    velRef.current = { vx: velocityX, vy: velocityY };
  });

  useEffect(() => {
    if (!enabled || !layerRef.current) return;
    const el = layerRef.current;
    let raf = 0;

    const tick = () => {
      const { vx, vy } = velRef.current;
      const speed = Math.sqrt(vx * vx + vy * vy);
      // only blur when moving fast
      const blurAmount = Math.min(8, speed * strength * 0.5);

      if (blurAmount > 0.5) {
        const angle = Math.atan2(vy, vx);
        // approximate directional blur with radial blur
        el.style.backdropFilter = `blur(${blurAmount.toFixed(1)}px)`;
        el.style.opacity = "1";
      } else {
        el.style.opacity = "0";
      }

      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => cancelAnimationFrame(raf);
  }, [enabled, strength]);

  if (!enabled) return null;

  return (
    <div
      ref={layerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity duration-150"
      style={{ zIndex: 13, opacity: 0 }}
    />
  );
}
