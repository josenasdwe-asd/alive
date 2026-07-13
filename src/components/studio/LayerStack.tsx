"use client";

import { Layers as LayersIcon, Eye, EyeOff, MoveDiagonal } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ImageLayer } from "@/lib/types";

const ROLE_LABELS: Record<string, string> = {
  background: "Fondo",
  midground: "Medio",
  subject: "Sujeto",
  foreground: "Frente",
  depth: "Profundidad",
};

const ROLE_COLORS: Record<string, string> = {
  background: "bg-sky-500/20 text-sky-300",
  midground: "bg-emerald-500/20 text-emerald-300",
  subject: "bg-primary/20 text-primary",
  foreground: "bg-amber-500/20 text-amber-300",
  depth: "bg-fuchsia-500/20 text-fuchsia-300",
};

export function LayerStack() {
  const { layers, originalUrl, backgroundUrl, depthUrl, foregroundUrl } =
    useAliveStore();

  if (layers.length === 0) return null;

  // ordered closest → farthest for display
  const sorted = [...layers].sort((a, b) => b.depth - a.depth);

  return (
    <section className="glass rounded-xl p-4">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <LayersIcon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-medium tracking-tight">Capas</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {layers.length} capas
        </span>
      </header>

      <ul className="space-y-1.5">
        {sorted.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            url={resolveLayerUrl(
              layer,
              originalUrl,
              backgroundUrl,
              depthUrl,
              foregroundUrl
            )}
          />
        ))}
      </ul>
    </section>
  );
}

function resolveLayerUrl(
  layer: ImageLayer,
  original: string,
  bg?: string,
  depth?: string,
  fg?: string
): string | undefined {
  if (layer.role === "background") return bg ?? original;
  if (layer.role === "depth") return depth;
  if (layer.role === "foreground") return fg ?? original;
  return original;
}

function LayerRow({ layer, url }: { layer: ImageLayer; url?: string }) {
  return (
    <li
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-2 transition-colors hover:bg-white/[0.04]"
      )}
    >
      <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-md ring-1 ring-white/10 checker">
        {url ? (
           
          <img
            src={url}
            alt={layer.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <LayersIcon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
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
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <MoveDiagonal className="h-2.5 w-2.5" />
          <span>depth {(layer.depth * 100).toFixed(0)}%</span>
          {layer.description && (
            <span className="truncate">· {layer.description}</span>
          )}
        </div>
        {/* depth bar */}
        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-primary/40 to-primary"
            style={{ width: `${Math.max(4, layer.depth * 100)}%` }}
          />
        </div>
      </div>

      <button
        className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label="Toggle visibilidad"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
