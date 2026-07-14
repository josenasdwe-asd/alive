"use client";

import { useState, useRef } from "react";
import { GitCompare, X } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Before/After comparison slider.
 *
 * Overlays the stage with a draggable divider:
 * - Left side: original static image (no animation)
 * - Right side: animated image (with all effects)
 *
 * The user drags the handle to reveal/hide the animation effect.
 * Click X or the Comparar button again to close.
 */
export function ComparisonSlider() {
  const originalUrl = useAliveStore((s) => s.originalUrl);
  const [enabled, setEnabled] = useState(false);
  const [position, setPosition] = useState(50); // 0..100
  const containerRef = useRef<HTMLDivElement>(null);

  if (!originalUrl) return null;

  const handleDown = (e: React.PointerEvent) => {
    const onMove = (ev: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      setPosition(Math.max(0, Math.min(100, x)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    onMove(e.nativeEvent);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <button
        onClick={() => setEnabled(!enabled)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
          enabled
            ? "border-primary/50 bg-primary/15 text-primary"
            : "border-white/5 text-muted-foreground hover:text-foreground"
        )}
      >
        <GitCompare className="h-3 w-3" />
        {enabled ? "Comparando" : "Comparar"}
      </button>

      {enabled && (
        <div
          ref={containerRef}
          className="pointer-events-none absolute inset-0 z-[60]"
        >
          {/* Original image on the left — pointer-events-none so it doesn't block clicks */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <img
              src={originalUrl}
              alt="Original"
              className="h-full w-full object-cover"
              draggable={false}
            />
            <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur">
              Original
            </div>
          </div>

          {/* Divider handle — ONLY this has pointer-events-auto */}
          <div
            className="pointer-events-auto absolute top-0 bottom-0 w-0.5 cursor-ew-resize bg-white shadow-lg"
            style={{ left: `${position}%` }}
            onPointerDown={handleDown}
          >
            <div className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-xl">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3L2 7l3 4M9 3l3 4-3 4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* Animated label on the right */}
          <div
            className="absolute top-2 rounded-md bg-primary/60 px-2 py-0.5 text-[10px] text-white backdrop-blur"
            style={{ right: "8px" }}
          >
            Animado
          </div>

          {/* Close button — pointer-events-auto, top-right */}
          <button
            onClick={() => setEnabled(false)}
            className="pointer-events-auto absolute right-2 top-8 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
            aria-label="Cerrar comparación"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </>
  );
}
