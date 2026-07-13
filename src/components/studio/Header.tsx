"use client";

import { Sparkles, Github, Wand2 } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { PipelineIndicator } from "./PipelineIndicator";

export function Header() {
  const status = useAliveStore((s) => s.status);
  const reset = useAliveStore((s) => s.reset);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 glass-strong">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
        <button
          onClick={reset}
          className="group flex flex-shrink-0 items-center gap-2.5"
          aria-label="Alive — volver al inicio"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 ring-1 ring-white/10">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="absolute inset-0 rounded-lg bg-primary/20 blur-md transition-opacity group-hover:opacity-100 opacity-0" />
          </span>
          <div className="flex flex-col items-start leading-none">
            <span className="text-sm font-semibold tracking-tight">Alive</span>
            <span className="text-[10px] text-muted-foreground">
              Image Layer Studio
            </span>
          </div>
        </button>

        {/* Center: pipeline indicator */}
        <div className="hidden flex-1 justify-center md:flex">
          <PipelineIndicator />
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {status !== "idle" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="text-muted-foreground hover:text-foreground"
            >
              Nueva imagen
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="hidden text-muted-foreground hover:text-foreground sm:flex"
          >
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Repositorio"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
          <Button size="sm" className="gap-1.5" disabled>
            <Wand2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pro</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
