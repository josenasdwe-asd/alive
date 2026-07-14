"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Mini-timeline visual with scrubbing.
 *
 * Shows a 30s horizontal bar with loop markers for each animation cycle.
 * The playhead auto-advances when playing, showing where the animation
 * is in its cycle. Loop markers indicate when each animation type
 * (breathing, sway, float, etc.) completes a full cycle.
 */
export function MiniTimeline() {
  const { animation: config } = useAliveStore();
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0); // 0..1
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(performance.now());

  // auto-advance playhead
  useEffect(() => {
    if (!playing) return;
    lastTRef.current = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - lastTRef.current) / 1000;
      lastTRef.current = now;
      setTime((t) => {
        const next = t + (dt * config.speed) / 30; // 30s loop
        return next > 1 ? next - 1 : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, config.speed]);

  // scrubbing
  const onPointerDown = (e: React.PointerEvent) => {
    setPlaying(false);
    const onMove = (ev: PointerEvent) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (ev.clientX - rect.left) / rect.width;
      setTime(Math.max(0, Math.min(1, x)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    onMove(e.nativeEvent);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // loop markers: breathing (6.2s), sway (8.3s), float (11.1s), drift (13.7s)
  const loopDurations = [6.2, 8.3, 11.1, 13.7, 9.4, 5.7, 14.3, 9.7];
  const markers = loopDurations.map((d) => {
    const loopsIn30s = Math.floor(30 / d);
    return Array.from({ length: loopsIn30s }, (_, i) => (i * d) / 30);
  }).flat();

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5">
      <button
        onClick={() => setTime(0)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Inicio"
      >
        <SkipBack className="h-3 w-3" />
      </button>
      <button
        onClick={() => setPlaying(!playing)}
        className="text-primary"
        aria-label={playing ? "Pausar" : "Reproducir"}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => setTime(1)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Final"
      >
        <SkipForward className="h-3 w-3" />
      </button>

      {/* timeline bar */}
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        className="relative h-6 flex-1 cursor-pointer overflow-hidden rounded"
        style={{ background: "rgba(255,255,255,0.03)" }}
      >
        {/* loop markers */}
        {markers.map((m, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-px bg-white/10"
            style={{ left: `${m * 100}%` }}
          />
        ))}

        {/* progress fill */}
        <div
          className="absolute top-0 h-full bg-primary/20"
          style={{ width: `${time * 100}%` }}
        />

        {/* playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-primary"
          style={{ left: `${time * 100}%` }}
        >
          <div className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary" />
        </div>

        {/* time labels */}
        <div className="absolute bottom-0 left-1 text-[8px] text-muted-foreground">
          0s
        </div>
        <div className="absolute bottom-0 right-1 text-[8px] text-muted-foreground">
          30s
        </div>
      </div>

      <span className="font-mono text-[10px] text-muted-foreground">
        {(time * 30).toFixed(1)}s
      </span>
    </div>
  );
}
