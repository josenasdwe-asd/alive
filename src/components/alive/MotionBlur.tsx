"use client";

import { useEffect, useRef } from "react";

interface MotionBlurProps {
  enabled: boolean;
  /** blur strength 0..1 */
  strength: number;
}

/**
 * Directional motion blur overlay.
 * Tracks mouse velocity internally. When the mouse moves fast,
 * applies backdrop blur to simulate shutter blur.
 */
export function MotionBlur({ enabled, strength }: MotionBlurProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const velRef = useRef({ vx: 0, vy: 0, tx: 0, ty: 0 });
  const lastPosRef = useRef({ x: 0, y: 0, t: 0 });

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const dt = Math.max(1, now - lastPosRef.current.t);
      velRef.current.tx = ((e.clientX - lastPosRef.current.x) / dt) * 16;
      velRef.current.ty = ((e.clientY - lastPosRef.current.y) / dt) * 16;
      lastPosRef.current = { x: e.clientX, y: e.clientY, t: now };
    };
    const onLeave = () => {
      velRef.current.tx = 0;
      velRef.current.ty = 0;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const tick = () => {
      velRef.current.vx += (velRef.current.tx - velRef.current.vx) * 0.15;
      velRef.current.vy += (velRef.current.ty - velRef.current.vy) * 0.15;
      const { vx, vy } = velRef.current;
      const speed = Math.sqrt(vx * vx + vy * vy);
      const blurAmount = Math.min(8, speed * strength * 0.5);
      const el = layerRef.current;
      if (el) {
        if (blurAmount > 0.5) {
          el.style.backdropFilter = `blur(${blurAmount.toFixed(1)}px)`;
          el.style.opacity = "1";
        } else {
          el.style.opacity = "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled, strength]);

  if (!enabled) return null;

  return (
    <div
      ref={layerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 13, opacity: 0 }}
    />
  );
}

