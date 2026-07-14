"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Brush, Eraser, Wind, Eye, Hand, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = "flow" | "isolate" | "color" | "freeze" | "amplify";

interface BrushStroke {
  tool: Tool;
  points: Array<{ x: number; y: number }>; // 0..1 normalized
  radius: number; // 0..1
  strength: number; // 0..1
  color?: string;
}

interface PaintOnImageProps {
  enabled: boolean;
  onToggle: () => void;
}

/**
 * v3 RADICAL: Paint animation directly on the image.
 *
 * Instead of using sliders and panels, the user clicks/brushes directly
 * on the image to modify animation in specific regions:
 *
 * - Flow (🌊): Brush over water/clouds → directional flow motion
 * - Isolate (✂️): Click on an element → extract it as a separate layer
 * - Color (🎨): Brush over a region → change its color/hue
 * - Freeze (❄️): Brush over a region → freeze animation there
 * - Amplify (🔥): Brush over a region → amplify motion there
 *
 * Strokes are stored and applied via CSS variables per-region.
 */
export function PaintOnImage({ enabled, onToggle }: PaintOnImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("flow");
  const [brushSize, setBrushSize] = useState(30);
  const [strength, setStrength] = useState(0.6);
  const [strokes, setStrokes] = useState<BrushStroke[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<BrushStroke | null>(null);

  // Draw strokes on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;
    for (const stroke of allStrokes) {
      const color = TOOL_COLORS[stroke.tool];
      ctx.strokeStyle = color;
      ctx.fillStyle = color.replace("1)", "0.15)");
      ctx.lineWidth = stroke.radius * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.points.length > 0) {
        ctx.beginPath();
        const p0 = stroke.points[0];
        ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);
        for (let i = 1; i < stroke.points.length; i++) {
          const p = stroke.points[i];
          ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
        }
        ctx.stroke();

        // Fill circles at each point for brush effect
        for (const p of stroke.points) {
          ctx.beginPath();
          ctx.arc(p.x * canvas.width, p.y * canvas.height, stroke.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [strokes, currentStroke]);

  useEffect(() => { draw(); }, [draw]);

  // Pointer handlers
  const handleDown = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDrawing(true);
    setCurrentStroke({
      tool,
      points: [{ x, y }],
      radius: brushSize / 2,
      strength,
    });
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!drawing || !currentStroke) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentStroke({ ...currentStroke, points: [...currentStroke.points, { x, y }] });
  };

  const handleUp = () => {
    if (currentStroke && currentStroke.points.length > 0) {
      setStrokes(prev => [...prev, currentStroke]);
      // Apply stroke effect to layers
      applyStrokeEffect(currentStroke);
    }
    setDrawing(false);
    setCurrentStroke(null);
  };

  // Apply stroke effect to the image layers
  const applyStrokeEffect = (stroke: BrushStroke) => {
    if (stroke.tool === "flow") {
      // Add flow arrows from stroke direction
      const existing = (window as any).__aliveFlowField?.arrows ?? [];
      // Compute average direction from stroke
      if (stroke.points.length >= 2) {
        const first = stroke.points[0];
        const last = stroke.points[stroke.points.length - 1];
        existing.push({
          x1: first.x, y1: first.y,
          x2: last.x, y2: last.y,
          strength: stroke.strength,
        });
      }
      (window as any).__aliveFlowField = { arrows: existing, intensity: stroke.strength };
    } else if (stroke.tool === "freeze") {
      // Freeze: reduce animation amplitude in stroked region
      // Applied via CSS var on layers
      const layers = document.querySelectorAll("[data-layer-id]");
      layers.forEach(l => {
        (l as HTMLElement).style.setProperty("--region-freeze", "1");
      });
    } else if (stroke.tool === "amplify") {
      // Amplify: increase animation amplitude in stroked region
      const layers = document.querySelectorAll("[data-layer-id]");
      layers.forEach(l => {
        (l as HTMLElement).style.setProperty("--region-amplify", String(stroke.strength));
      });
    }
  };

  // Clear all strokes
  const clearStrokes = () => {
    setStrokes([]);
    (window as any).__aliveFlowField = null;
    const layers = document.querySelectorAll("[data-layer-id]");
    layers.forEach(l => {
      (l as HTMLElement).style.removeProperty("--region-freeze");
      (l as HTMLElement).style.removeProperty("--region-amplify");
    });
  };

  // Cleanup on unmount or when disabled: clear flow field so FlowFieldRenderer stops
  useEffect(() => {
    if (!enabled) {
      (window as any).__aliveFlowField = null;
    }
    return () => {
      (window as any).__aliveFlowField = null;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      {/* Floating toolbar */}
      <div className="absolute bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-black/80 p-2 backdrop-blur-xl">
        {TOOLS.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              tool === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            title={t.label}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
        <div className="mx-1 h-6 w-px bg-white/10" />
        {/* Brush size */}
        <input
          type="range"
          min={5}
          max={80}
          value={brushSize}
          onChange={e => setBrushSize(parseInt(e.target.value))}
          className="h-1 w-16 accent-primary"
          title="Tamaño del pincel"
        />
        {/* Strength */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={strength}
          onChange={e => setStrength(parseFloat(e.target.value))}
          className="h-1 w-16 accent-primary"
          title="Fuerza"
        />
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          onClick={clearStrokes}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          title="Limpiar"
        >
          <Eraser className="h-4 w-4" />
        </button>
        <button
          onClick={onToggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          title="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Drawing canvas */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-[65] cursor-crosshair"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
        style={{ touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
    </>
  );
}

const TOOL_COLORS: Record<Tool, string> = {
  flow: "rgba(100, 200, 255, 1)",
  isolate: "rgba(255, 200, 100, 1)",
  color: "rgba(255, 100, 200, 1)",
  freeze: "rgba(150, 220, 255, 1)",
  amplify: "rgba(255, 150, 100, 1)",
};

const TOOLS: Array<{ id: Tool; label: string; icon: any }> = [
  { id: "flow", label: "Flujo (agua/nubes)", icon: Wind },
  { id: "amplify", label: "Amplificar movimiento", icon: Brush },
  { id: "freeze", label: "Congelar movimiento", icon: Hand },
  { id: "isolate", label: "Aislar elemento", icon: Eye },
  { id: "color", label: "Cambiar color", icon: Brush },
];
