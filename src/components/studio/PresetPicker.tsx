"use client";

import { useState, useMemo, useRef, useEffect, forwardRef } from "react";
import { useAliveStore } from "@/lib/store";
import {
  PRESETS,
  PRESET_CATEGORIES,
  type PresetCategory,
} from "@/lib/presets";
import type { PresetId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check, Search, X, Sparkles } from "lucide-react";

type Filter = "all" | PresetCategory;

export function PresetPicker() {
  const currentPreset = useAliveStore((s) => s.animation.preset);
  const analysis = useAliveStore((s) => s.analysis);
  const applyPreset = useAliveStore((s) => s.applyPreset);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const recommendedPreset = analysis?.recommendedPreset;

  // Filter presets by category + search query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRESETS.filter((p) => {
      if (filter !== "all" && p.category !== filter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [filter, query]);

  // Scroll active preset into view when filter/query changes
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [filter, query]);

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-medium tracking-tight">Presets</h3>
        <span className="text-[11px] text-muted-foreground">
          {filtered.length}/{PRESETS.length}
        </span>
      </header>

      {/* Search input */}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar preset…"
          className="h-7 w-full rounded-md border border-white/5 bg-white/[0.02] pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="mb-2.5 flex flex-wrap gap-1">
        <Chip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="Todos"
          emoji="✨"
        />
        {PRESET_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={filter === c.id}
            onClick={() => setFilter(c.id)}
            label={c.label}
            emoji={c.emoji}
          />
        ))}
      </div>

      {/* Preset grid — scrollable when many results */}
      <div
        ref={scrollRef}
        className="max-h-[420px] overflow-y-auto scroll-thin pr-0.5"
      >
        {filtered.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-muted-foreground">
              No hay presets que coincidan
            </p>
            <button
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="mt-2 text-[11px] text-primary hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map((p) => {
              const isActive = currentPreset === p.id;
              const isRecommended = recommendedPreset === p.id;
              return (
                <PresetCard
                  key={p.id}
                  ref={isActive ? activeRef : undefined}
                  preset={p}
                  active={isActive}
                  recommended={isRecommended}
                  onClick={() => applyPreset(p.id as PresetId)}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Chip({
  active,
  onClick,
  label,
  emoji,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  emoji: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-white/5 text-muted-foreground hover:border-white/15 hover:text-foreground"
      )}
    >
      <span className="text-[9px]">{emoji}</span>
      {label}
    </button>
  );
}

const CATEGORY_DOT: Record<PresetCategory, string> = {
  calm: "oklch(0.7 0.12 220)",
  cinematic: "oklch(0.7 0.13 150)",
  dramatic: "oklch(0.7 0.18 30)",
  retro: "oklch(0.7 0.1 70)",
  cyberpunk: "oklch(0.7 0.2 310)",
  abstract: "oklch(0.7 0.15 180)",
};

interface PresetCardProps {
  preset: (typeof PRESETS)[number];
  active: boolean;
  recommended: boolean;
  onClick: () => void;
}

const PresetCard = forwardRef<HTMLButtonElement, PresetCardProps>(
  function PresetCard({ preset: p, active, recommended, onClick }, ref) {
    return (
      <button
        ref={ref}
        onClick={onClick}
        title={p.description}
        className={cn(
          "group relative flex flex-col items-start gap-0.5 overflow-hidden rounded-lg border p-2 text-left transition-all",
          active
            ? "border-primary bg-primary/10"
            : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
        )}
      >
        {active && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-2.5 w-2.5" />
          </span>
        )}
        {recommended && !active && (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-primary/20 px-1 py-0.5 text-[7px] font-medium text-primary">
            <Sparkles className="h-2 w-2" />
            REC
          </span>
        )}
        <div className="flex items-center gap-1">
          <span className="text-sm leading-none">{p.emoji}</span>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: CATEGORY_DOT[p.category] }}
            title={p.category}
          />
        </div>
        <span className="mt-0.5 text-[11px] font-medium">{p.name}</span>
        <span className="text-[9px] leading-tight text-muted-foreground">
          {p.tagline}
        </span>
      </button>
    );
  }
);
