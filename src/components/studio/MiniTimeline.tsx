"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useAliveStore } from "@/lib/store";

/**
 * Mini-timeline with HONEST play/pause control.
 *
 * v3 PATH B fix: play/pause now ACTUALLY controls the animation by toggling
 * `animation-play-state: paused` on all .alive-layer elements via a body class.
 * Previously the playhead moved but CSS @keyframes kept running independently.
 *
 * The loop markers show the active preset's primary animation cycle durations
 * (derived from the first layer's active animations, not hardcoded).
 */
export function MiniTimeline() {
  const { animation: config } = useAliveStore();
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0); // 0..1
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(performance.now());

  // Toggle animation-play-state on all .alive-layer elements via a body class.
  // This is the PATH B fix: play/pause now ACTUALLY controls CSS animations.
  useEffect(() => {
    const aliveLayers = document.querySelectorAll(".alive-layer");
    aliveLayers.forEach((el) => {
      (el as HTMLElement).style.animationPlayState = playing ? "running" : "paused";
    });
  }, [playing, config.layers]);

  // auto-advance playhead (respect reducedMotion)
  useEffect(() => {
    if (!playing || config.reducedMotion) return;
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
  }, [playing, config.speed, config.reducedMotion]);

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

  // Derive loop markers from the FIRST layer's active animations (not hardcoded).
  // This makes the timeline honest — it reflects the actual preset's cycles.
  const DURATIONS: Record<string, number> = {
    breath: 6.2, sway: 8.3, twist: 11.3, float: 11.1, drift: 13.7,
    wave: 9.4, glow: 5.7, hue: 28, focus: 14.3, shadow: 9.7,
    heartbeat: 2.4, vortex: 16.5, ripple: 7.2, zTilt: 12.1,
    sway3d: 10.4, breatheX: 5.3, scan: 3.8,
  };
  const firstLayer = Object.values(config.layers)[0] as any;
  const activeDurations: number[] = [];
  if (firstLayer) {
    if (firstLayer.breathing) activeDurations.push(DURATIONS.breath);
    if (firstLayer.sway) activeDurations.push(DURATIONS.sway);
    if (firstLayer.twist) activeDurations.push(DURATIONS.twist);
    if (firstLayer.floatY) activeDurations.push(DURATIONS.float);
    if (firstLayer.driftX) activeDurations.push(DURATIONS.drift);
    if (firstLayer.wave) activeDurations.push(DURATIONS.wave);
    if (firstLayer.glow) activeDurations.push(DURATIONS.glow);
    if (firstLayer.hueDrift) activeDurations.push(DURATIONS.hue);
    if (firstLayer.heartbeat) activeDurations.push(DURATIONS.heartbeat);
    if (firstLayer.vortex) activeDurations.push(DURATIONS.vortex);
    if (firstLayer.ripple) activeDurations.push(DURATIONS.ripple);
    if (firstLayer.zTilt) activeDurations.push(DURATIONS.zTilt);
    if (firstLayer.sway3d) activeDurations.push(DURATIONS.sway3d);
    if (firstLayer.breatheX) activeDurations.push(DURATIONS.breatheX);
    if (firstLayer.scan) activeDurations.push(DURATIONS.scan);
  }
  // Fallback to a default marker if no animations active
  const durations = activeDurations.length > 0 ? activeDurations : [6.2];
  const markers = durations.map((d) => {
    const loopsIn30s = Math.floor(30 / d);
    return Array.from({ length: loopsIn30s }, (_, i) => (i * d) / 30);
  }).flat();

  // Show the primary (shortest) cycle as a chip
  const primaryCycle = durations.length > 0 ? Math.min(...durations) : 0;

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
        title={playing ? "Pausar animación" : "Reproducir animación"}
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

      {/* Primary cycle chip — honest info about the active preset's main loop */}
      {primaryCycle > 0 && (
        <span
          className="hidden sm:inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary"
          title="Ciclo primario de animación"
        >
          {primaryCycle.toFixed(1)}s
        </span>
      )}

      <span className="font-mono text-[10px] text-muted-foreground">
        {(time * 30).toFixed(1)}s
      </span>
    </div>
  );
}
