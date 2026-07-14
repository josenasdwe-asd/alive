"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Wind, Eraser, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlowArrow {
  x1: number; y1: number; // start (0..1)
  x2: number; y2: number; // end (0..1)
  strength: number; // 0..1
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
 * El flow field se renderiza como un canvas overlay con WebGL2 shader que
 * desplaza los UVs de la imagen base según los vectores dibujados.
 *
 * Esto es el killer feature de Motionleap/CapCut que nos faltaba.
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

  // Draw arrows on canvas
  const drawArrows = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all arrows
    const allArrows = currentArrow ? [...arrows, currentArrow] : arrows;
    for (const arrow of allArrows) {
      const x1 = arrow.x1 * canvas.width;
      const y1 = arrow.y1 * canvas.height;
      const x2 = arrow.x2 * canvas.width;
      const y2 = arrow.y2 * canvas.height;

      // Arrow line
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.4 + arrow.strength * 0.6})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 12;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();

      // Start dot
      ctx.fillStyle = "rgba(100, 200, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [arrows, currentArrow]);

  useEffect(() => {
    drawArrows();
  }, [drawArrows]);

  // Pointer handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode === "erase") {
      // Erase: remove arrows near click point
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
    // Only add if arrow has meaningful length
    const len = Math.hypot(currentArrow.x2 - currentArrow.x1, currentArrow.y2 - currentArrow.y1);
    if (len > 0.02) {
      setArrows((prev) => [...prev, currentArrow]);
    }
    setDrawing(false);
    setCurrentArrow(null);
    drawStartRef.current = null;
  };

  // Feed flow field data to window for the motion engine to read
  useEffect(() => {
    if (enabled && arrows.length > 0) {
      (window as any).__aliveFlowField = { arrows, intensity };
    } else {
      (window as any).__aliveFlowField = null;
    }
  }, [enabled, arrows, intensity]);

  if (!enabled) return null;

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5">
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
        <span className="ml-auto text-[10px] text-muted-foreground">
          {arrows.length} flechas
        </span>
      </div>

      {/* Intensity slider */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Fuerza</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={intensity}
          onChange={(e) => setIntensity(parseFloat(e.target.value))}
          className="h-1 flex-1 accent-primary"
        />
        <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">
          {Math.round(intensity * 100)}%
        </span>
      </div>

      {/* Drawing canvas overlay */}
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

      <p className="rounded-md border border-white/5 bg-white/[0.02] p-2 text-[10px] leading-relaxed text-muted-foreground">
        Dibuja flechas sobre la imagen para crear movimiento direccional.
        Ideal para agua, nubes, cabello, fuego.
      </p>
    </div>
  );
}
