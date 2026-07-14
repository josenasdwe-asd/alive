"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Layers as LayersIcon,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Trash2,
  GripVertical,
  Plus,
  Wand2,
  Loader2,
} from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ImageLayer, BlendMode } from "@/lib/types";

const ROLE_LABELS: Record<string, string> = {
  background: "Fondo",
  midground: "Medio",
  subject: "Sujeto",
  foreground: "Frente",
  depth: "Depth",
  effect: "Efecto",
  custom: "Custom",
};

const ROLE_COLORS: Record<string, string> = {
  background: "bg-sky-500/20 text-sky-300",
  midground: "bg-emerald-500/20 text-emerald-300",
  subject: "bg-primary/20 text-primary",
  foreground: "bg-amber-500/20 text-amber-300",
  depth: "bg-fuchsia-500/20 text-fuchsia-300",
  effect: "bg-violet-500/20 text-violet-300",
  custom: "bg-rose-500/20 text-rose-300",
};

const BLEND_MODES: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
  "hard-light",
  "color-dodge",
  "lighten",
  "darken",
  "difference",
];

export function LayersPanel() {
  const {
    layers,
    selectedLayerId,
    selectLayer,
    removeLayer,
    duplicateLayer,
    reorderLayers,
    updateLayerTransform,
    addLayer,
    originalUrl,
  } = useAliveStore();

  const [extracting, setExtracting] = useState(false);
  const [extractInput, setExtractInput] = useState("");
  const [showExtract, setShowExtract] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // display: closest first (top of list = closest to viewer)
  const sorted = [...layers].sort((a, b) => b.depth - a.depth);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    reorderLayers(String(active.id), String(over.id));
  };

  const handleExtract = async () => {
    if (!extractInput.trim()) return;
    setExtracting(true);
    try {
      const res = await fetch("/api/extract-element", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: originalUrl, element: extractInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      const newLayer: ImageLayer = {
        id: `custom-${Date.now().toString(36)}`,
        name: extractInput.trim().slice(0, 24),
        role: "custom",
        depth: 0.7,
        url: data.url,
        description: "Capa extraída por el usuario",
        source: "custom",
        transform: {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          blur: 0,
          blendMode: "normal",
          visible: true,
          locked: false,
        },
      };
      addLayer(newLayer);
      setExtractInput("");
      setShowExtract(false);
      toast.success(`Capa "${newLayer.name}" añadida`);
    } catch (err: any) {
      toast.error(err?.message ?? "Error extrayendo capa");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <LayersIcon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-medium tracking-tight">Capas</h3>
        <span className="text-[11px] text-muted-foreground">{layers.length}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            title="Añadir capa (extraer elemento con IA)"
            onClick={() => setShowExtract(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {/* Extract element input */}
      {showExtract && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
          <Wand2 className="h-3 w-3 flex-shrink-0 text-primary" />
          <input
            autoFocus
            value={extractInput}
            onChange={(e) => setExtractInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleExtract();
              if (e.key === "Escape") { setShowExtract(false); setExtractInput(""); }
            }}
            placeholder="ej: el perro, las flores…"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          <Button
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={handleExtract}
            disabled={extracting || !extractInput.trim()}
          >
            {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Extraer"}
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sorted.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="scroll-thin max-h-[280px] space-y-1 overflow-y-auto pr-0.5">
            {sorted.map((layer) => (
              <SortableLayerRow
                key={layer.id}
                layer={layer}
                selected={selectedLayerId === layer.id}
                onSelect={() => selectLayer(layer.id)}
                onToggleVisible={() =>
                  updateLayerTransform(layer.id, {
                    visible: !layer.transform.visible,
                  })
                }
                onToggleLock={() =>
                  updateLayerTransform(layer.id, {
                    locked: !layer.transform.locked,
                  })
                }
                onDuplicate={() => duplicateLayer(layer.id)}
                onRemove={() => removeLayer(layer.id)}
                onOpacity={(v) =>
                  updateLayerTransform(layer.id, { opacity: v })
                }
                onBlur={(v) => updateLayerTransform(layer.id, { blur: v })}
                onBlend={(v) =>
                  updateLayerTransform(layer.id, { blendMode: v as BlendMode })
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {layers.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Sin capas todavía
        </p>
      )}
    </section>
  );
}

interface RowProps {
  layer: ImageLayer;
  selected: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onOpacity: (v: number) => void;
  onBlur: (v: number) => void;
  onBlend: (v: string) => void;
}

function SortableLayerRow(props: RowProps) {
  const { layer, selected } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  } as React.CSSProperties;

  return (
    <li ref={setNodeRef} style={style}>
      <div
        onClick={props.onSelect}
        className={cn(
          "group flex cursor-pointer items-center gap-1.5 rounded-lg border p-1.5 transition-colors",
          selected
            ? "border-primary/50 bg-primary/10"
            : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]",
          !layer.transform.visible && "opacity-50",
          isDragging && "shadow-2xl"
        )}
      >
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
          aria-label="Arrastrar"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-md ring-1 ring-white/10 checker">
          {layer.url ? (
            <img
              src={layer.url}
              alt={layer.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <LayersIcon className="h-3.5 w-3.5" />
            </div>
          )}
          {/* live indicator — pulsing dot when layer is visible */}
          {layer.transform.visible && (
            <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-xs font-medium">{layer.name}</span>
            <span
              className={cn(
                "rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide",
                ROLE_COLORS[layer.role]
              )}
            >
              {ROLE_LABELS[layer.role] ?? layer.role}
            </span>
          </div>
          <div className="mt-0.5 h-0.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full bg-gradient-to-r from-primary/40 to-primary"
              style={{ width: `${Math.max(4, layer.depth * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-0.5">
          <IconBtn
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleVisible();
            }}
            title={layer.transform.visible ? "Ocultar" : "Mostrar"}
          >
            {layer.transform.visible ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
          </IconBtn>
          <IconBtn
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleLock();
            }}
            title={layer.transform.locked ? "Desbloquear" : "Bloquear"}
            active={layer.transform.locked}
          >
            {layer.transform.locked ? (
              <Lock className="h-3 w-3" />
            ) : (
              <Unlock className="h-3 w-3" />
            )}
          </IconBtn>
          <IconBtn
            onClick={(e) => {
              e.stopPropagation();
              props.onDuplicate();
            }}
            title="Duplicar"
          >
            <Copy className="h-3 w-3" />
          </IconBtn>
          <IconBtn
            onClick={(e) => {
              e.stopPropagation();
              props.onRemove();
            }}
            title="Eliminar"
            className="hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </IconBtn>
        </div>
      </div>

      {/* expanded controls when selected */}
      {selected && (
        <div className="mt-1 grid grid-cols-2 gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Opacidad</label>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={layer.transform.opacity}
                onChange={(e) => props.onOpacity(parseFloat(e.target.value))}
                className="h-1 flex-1 accent-primary"
              />
              <span className="w-7 text-right font-mono text-[10px] text-muted-foreground">
                {(layer.transform.opacity * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Blur</label>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={0}
                max={12}
                step={0.5}
                value={layer.transform.blur}
                onChange={(e) => props.onBlur(parseFloat(e.target.value))}
                className="h-1 flex-1 accent-primary"
              />
              <span className="w-7 text-right font-mono text-[10px] text-muted-foreground">
                {layer.transform.blur.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-[10px] text-muted-foreground">Blend mode</label>
            <Select
              value={layer.transform.blendMode}
              onValueChange={props.onBlend}
            >
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLEND_MODES.map((m) => (
                  <SelectItem key={m} value={m} className="text-[11px]">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </li>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  className,
  active,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  className?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground",
        active && "bg-primary/15 text-primary",
        className
      )}
    >
      {children}
    </button>
  );
}
