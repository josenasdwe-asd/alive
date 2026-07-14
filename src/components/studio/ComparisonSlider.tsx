"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { GitCompare, X } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Before/After comparison slider.
 *
 * v3 FIXES:
 * - Edge clamping: position clamped to [2, 98] so handle never half-off-screen
 * - Wider grab area: 16px invisible hit strip around the 2px visible divider
 * - Keyboard support: arrow keys move 1%, Shift+arrow 10%, Home/End to 0/100
 * - Touch targets: 44×44px minimum (HIG compliant) for handle + close button
 * - Alignment: original uses same object-cover as animated stage
 *
 * Overlays the stage with a draggable divider:
 * - Left side: original static image (no animation)
 * - Right side: animated image (with all effects)
 */
export function ComparisonSlider() {
  const originalUrl = useAliveStore((s) => s.originalUrl);
  const [enabled, setEnabled] = useState(false);
  const [position, setPosition] = useState(50); // 2..98
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const clampPosition = useCallback((x: number) => Math.max(2, Math.min(98, x)), []);

  const handleDown = useCallback((e: React.PointerEvent) => {
    const onMove = (ev: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      setPosition(clampPosition(x));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    onMove(e.nativeEvent);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [clampPosition]);

  // Keyboard support: arrow keys move 1%, Shift+arrow 10%
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        setPosition((p) => clampPosition(p - step));
        break;
      case "ArrowRight":
        e.preventDefault();
        setPosition((p) => clampPosition(p + step));
        break;
      case "Home":
        e.preventDefault();
        setPosition(2);
        break;
      case "End":
        e.preventDefault();
        setPosition(98);
        break;
    }
  }, [clampPosition]);

  if (!originalUrl) return null;

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
          {/* Original image on the left — same object-cover as animated stage */}
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

          {/* Divider handle — wider invisible grab area (16px) + visible 2px line */}
          <div
            ref={handleRef}
            className="pointer-events-auto absolute top-0 bottom-0 flex cursor-ew-resize items-center justify-center"
            style={{ left: `${position}%`, width: "32px", transform: "translateX(-50%)" }}
            onPointerDown={handleDown}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="slider"
            aria-label="Comparación antes/después"
            aria-valuemin={2}
            aria-valuemax={98}
            aria-valuenow={Math.round(position)}
          >
            {/* Visible divider line */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg" />
            {/* 44×44 HIG-compliant handle */}
            <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-xl">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L2 8l4 4M10 4l4 4-4 4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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

          {/* Close button — 44×44 HIG compliant */}
          <button
            onClick={() => setEnabled(false)}
            className="pointer-events-auto absolute right-2 top-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
            aria-label="Cerrar comparación"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
