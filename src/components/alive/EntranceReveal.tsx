"use client";

import { motion } from "framer-motion";
import type { ImageLayer } from "@/lib/types";

interface EntranceRevealProps {
  layers: ImageLayer[];
  enabled: boolean;
  children: React.ReactNode;
}

/**
 * Staggered layer entrance reveal — back-to-front, expo.out easing.
 * Wraps the AliveStage; when enabled, each layer animates in with
 * blur 8px→0 + scale 1.08→1 + opacity 0→1, staggered ~120ms by depth.
 *
 * This is the single highest-impact change for "Awwwards jump" feel.
 */
export function EntranceReveal({ layers, enabled, children }: EntranceRevealProps) {
  // we expose the stagger timing via CSS vars consumed by AliveLayers inner divs
  // but for simplicity we animate a wrapper overlay that fades out,
  // and set a CSS class that triggers per-layer entrance via :nth-child delays

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="alive-entrance-wrap relative h-full w-full">
      {children}
      {/* invisible — the actual entrance is handled by AliveLayers via the
          .alive-entrance class + per-layer nth-child delay set below */}
      <style>{`
        .alive-entrance-wrap .alive-layer {
          animation-name: alive-entrance, var(--alive-anim-name, none);
          animation-duration: 1.2s, var(--alive-anim-dur, 0s);
          animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1), ease-in-out;
          animation-delay: var(--alive-entrance-delay, 0s), var(--alive-anim-delay, 0s);
          animation-fill-mode: both, none;
          animation-iteration-count: 1, infinite;
        }
        @keyframes alive-entrance {
          0% { opacity: 0; filter: blur(8px) brightness(1.3); transform: var(--alive-entrance-from, scale(1.08)); }
          100% { opacity: 1; filter: blur(0) brightness(1); }
        }
      `}</style>
    </div>
  );
}

/**
 * Compute the entrance delay for a layer based on its depth (back first).
 * Returns a CSS time string.
 */
export function entranceDelayForLayer(depth: number, total: number): string {
  // back layers (depth 0) reveal first, front layers (depth 1) last
  // stagger ~0.12s between layers
  const order = depth; // 0..1
  return `${(order * 0.12 * Math.min(total, 6)).toFixed(2)}s`;
}
