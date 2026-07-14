"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Wind, Eraser, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlowArrow {
  x1: number; y1: number;
  x2: number; y2: number;
  strength: number;
}

interface FlowFieldOverlayProps {
  enabled: boolean;
  onToggle: () => void;
}

/**
 * v3 VANGUARDIA: Flow Field Motion.
 *
 * El usuario dibuja flechas sobre la imagen. Cada flecha define un vector de
 * movimiento direccional. Los píxeles cercanos a cada flecha se mueven en esa
 * dirección, creando el efecto de "agua fluyendo", "nubes moviéndose", etc.
 *
 * HOW IT WORKS:
 * Instead of a separate WebGL canvas (which doesn't affect existing layers),
 * this component applies flow motion DIRECTLY to the .alive-layer elements
 * via CSS custom properties. Each frame, a RAF loop computes the flow offset
 * for each layer based on the arrows and writes it as --flow-x / --flow-y
 * CSS vars. The .alive-layer CSS transform includes these vars.
 */
export function FlowFieldOverlay({ enabled, onToggle }: FlowFieldOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<FlowArrow[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [currentArrow, setCurrentArrow] = useState<FlowArrow | null>(null);
  const [mode, setMode] = useState<"draw" | "erase">("draw");
  const [intensity, setIntensity] = useState(0.5);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);
  const arrowsRef = useRef<FlowArrow[]>([]);
  const intensityRef = useRef(0.5);

  // Keep refs in sync
  useEffect(() => { arrowsRef.current = arrows; }, [arrows]);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);

  // Draw arrows on canvas
  const drawArrows = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allArrows = currentArrow ? [...arrows, currentArrow] : arrows;
    for (const arrow of allArrows) {
      const x1 = arrow.x1 * canvas.width;
      const y1 = arrow.y1 * canvas.height;
      const x2 = arrow.x2 * canvas.width;
      const y2 = arrow.y2 * canvas.height;

      // Arrow line with glow
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.5 + arrow.strength * 0.5})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(100, 200, 255, 0.5)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 14;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();

      // Start dot
      ctx.fillStyle = "rgba(100, 200, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(x1, y1, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [arrows, currentArrow]);

  useEffect(() => { drawArrows(); }, [drawArrows]);

  // RAF loop: apply flow motion to .alive-layer elements every frame
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const currentArrows = arrowsRef.current;
      const currentIntensity = intensityRef.current;

      if (currentArrows.length > 0) {
        const stage = document.querySelector("[data-alive-stage]");
        if (stage) {
          const rect = stage.getBoundingClientRect();
          const t = performance.now() / 1000;

          // Find all .alive-layer elements
          const layers = stage.querySelectorAll(".alive-layer");
          layers.forEach((layerEl) => {
            const el = layerEl as HTMLElement;
            // Get layer position (center) relative to stage
            const layerRect = el.getBoundingClientRect();
            const cx = (layerRect.left + layerRect.width / 2 - rect.left) / rect.width;
            const cy = (layerRect.top + layerRect.height / 2 - rect.top) / rect.height;

            // Accumulate flow offset from all arrows
            let flowX = 0;
            let flowY = 0;
            let totalWeight = 0;

            for (const arrow of currentArrows) {
              // Arrow midpoint
              const mx = (arrow.x1 + arrow.x2) / 2;
              const my = (arrow.y1 + arrow.y2) / 2;
              // Distance from layer center to arrow midpoint
              const dist = Math.hypot(cx - mx, cy - my);
              // Gaussian falloff (radius 0.3 of stage)
              const radius = 0.35;
              const weight = Math.exp(-(dist * dist) / (2 * radius * radius));
              // Arrow direction (normalized)
              const dx = arrow.x2 - arrow.x1;
              const dy = arrow.y2 - arrow.y1;
              const len = Math.hypot(dx, dy) || 1;
              const dirX = dx / len;
              const dirY = dy / len;
              // Oscillating motion along arrow direction
              const phase = t * 1.5 + dist * 8;
              const oscillation = Math.sin(phase) * 0.5 + 0.5; // 0..1
              const wave = Math.sin(t * 2.0 + dist * 12) * 0.5; // -0.5..0.5

              flowX += dirX * weight * (oscillation * 15 + wave * 5) * arrow.strength * currentIntensity;
              flowY += dirY * weight * (oscillation * 15 + wave * 5) * arrow.strength * currentIntensity;
              totalWeight += weight;
            }

            // Apply as CSS vars (these are read by .alive-layer transform)
            el.style.setProperty("--flow-x", `${flowX.toFixed(2)}px`);
            el.style.setProperty("--flow-y", `${flowY.toFixed(2)}px`);
          });
        }
      } else {
        // No arrows: clear flow vars
        const layers = document.querySelectorAll(".alive-layer");
        layers.forEach((el) => {
          (el as HTMLElement).style.setProperty("--flow-x", "0px");
          (el as HTMLElement).style.setProperty("--flow-y", "0px");
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      // Clear flow vars on unmount
      const layers = document.querySelectorAll(".alive-layer");
      layers.forEach((el) => {
        (el as HTMLElement).style.setProperty("--flow-x", "0px");
        (el as HTMLElement).style.setProperty("--flow-y", "0px");
      });
    };
  }, [enabled]);

  // Pointer handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode === "erase") {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setArrows((prev) => prev.filter((a) => {
        const mx = (a.x1 + a.x2) / 2;
        const my = (a.y1 + a.y2) / 2;
        return Math.hypot(mx - x, my - y) > 0.1;
      }));
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    drawStartRef.current = { x, y };
    setDrawing(true);
    setCurrentArrow({ x1: x, y1: y, x2: x, y2: y, strength: intensity });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing || !drawStartRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentArrow({
      ...drawStartRef.current,
      x2: x,
      y2: y,
      strength: intensity,
    });
  };

  const handlePointerUp = () => {
    if (!drawing || !currentArrow) {
      setDrawing(false);
      return;
    }
    const len = Math.hypot(currentArrow.x2 - currentArrow.x1, currentArrow.y2 - currentArrow.y1);
    if (len > 0.02) {
      setArrows((prev) => [...prev, currentArrow]);
    }
    setDrawing(false);
    setCurrentArrow(null);
    drawStartRef.current = null;
  };

  if (!enabled) return null;

  return (
    <>
      {/* Drawing canvas overlay — positioned over the stage */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-40 cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* Floating toolbar — positioned at bottom of stage */}
      <div className="absolute bottom-4 left-1/2 z-[45] flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-white/10 bg-black/80 p-2 backdrop-blur-xl">
        <button
          onClick={() => setMode("draw")}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors",
            mode === "draw" ? "border-primary bg-primary/15 text-primary" : "border-white/5 text-muted-foreground"
          )}
        >
          <Wind className="h-3 w-3" />
          Dibujar
        </button>
        <button
          onClick={() => setMode("erase")}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors",
            mode === "erase" ? "border-primary bg-primary/15 text-primary" : "border-white/5 text-muted-foreground"
          )}
        >
          <Eraser className="h-3 w-3" />
          Borrar
        </button>
        <button
          onClick={() => setArrows([])}
          className="rounded-md border border-white/5 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          Limpiar
        </button>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <span className="text-[10px] text-muted-foreground">Fuerza</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={intensity}
          onChange={(e) => setIntensity(parseFloat(e.target.value))}
          className="h-1 w-16 accent-primary"
        />
        <span className="w-6 text-right font-mono text-[10px] text-muted-foreground">
          {Math.round(intensity * 100)}%
        </span>
        <span className="ml-2 text-[10px] text-muted-foreground">
          {arrows.length} flechas
        </span>
        <button
          onClick={onToggle}
          className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </>
  );
}
