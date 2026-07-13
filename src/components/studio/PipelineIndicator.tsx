"use client";

import { Check, Loader2 } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import type { PipelineStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS: Array<{ id: PipelineStep; label: string; n: number }> = [
  { id: "upload", label: "Subir", n: 1 },
  { id: "analyze", label: "Analizar", n: 2 },
  { id: "decompose", label: "Desacoplar", n: 3 },
  { id: "animate", label: "Animar", n: 4 },
];

const ORDER: Record<PipelineStep, number> = {
  upload: 0,
  analyze: 1,
  decompose: 2,
  animate: 3,
};

export function PipelineIndicator() {
  const status = useAliveStore((s) => s.status);
  const pipelineStep = useAliveStore((s) => s.pipelineStep);
  const hasImage = useAliveStore((s) => !!s.originalUrl);

  if (!hasImage) return null;

  const currentOrder = pipelineStep ? ORDER[pipelineStep] : status === "idle" ? -1 : 0;

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2 py-1">
      {STEPS.map((step, i) => {
        const stepOrder = ORDER[step.id];
        const isDone = stepOrder < currentOrder;
        const isActive = stepOrder === currentOrder;
        const isFuture = stepOrder > currentOrder;

        return (
          <div key={step.id} className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-all",
                isDone && "text-primary",
                isActive && "bg-primary/15 text-primary",
                isFuture && "text-muted-foreground/50"
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium transition-all",
                  isDone && "bg-primary text-primary-foreground",
                  isActive && "bg-primary/20 ring-1 ring-primary/40",
                  isFuture && "bg-white/5"
                )}
              >
                {isDone ? (
                  <Check className="h-2.5 w-2.5" />
                ) : isActive ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  step.n
                )}
              </span>
              <span className="text-[11px] font-medium">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-3 transition-colors",
                  isDone ? "bg-primary/40" : "bg-white/10"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
