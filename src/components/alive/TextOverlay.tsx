"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { TextOverlay } from "@/lib/types";

interface TextOverlayViewProps {
  overlay: TextOverlay;
  /** scroll progress 0..1 for parallax (0 = top, 1 = scrolled past) */
  scrollProgress?: number;
}

/**
 * Animated text overlay for hero mode.
 * - Headline: word-by-word blur-rise (Cruip/Linear pattern)
 * - Subheadline: fade-up after headline
 * - CTA: button with arrow, fades in last
 *
 * Easing: cubic-bezier(0.16, 1, 0.3, 1) (expo.out) for premium feel.
 */
export function TextOverlayView({ overlay, scrollProgress = 0 }: TextOverlayViewProps) {
  const words = useMemo(
    () => overlay.headline.split(/\s+/).filter(Boolean),
    [overlay.headline]
  );

  if (!overlay.enabled || (!overlay.headline && !overlay.subheadline && !overlay.cta))
    return null;

  const posClass =
    overlay.position === "top"
      ? "items-start pt-[8%]"
      : overlay.position === "center"
        ? "items-center"
        : "items-end pb-[8%]";

  const alignClass = overlay.align === "center" ? "text-center items-center" : "text-left items-start";

  // text parallax: moves up slightly as you scroll
  const textY = scrollProgress * -60;

  return (
    <motion.div
      className={`pointer-events-none absolute inset-0 z-30 flex ${posClass} justify-center`}
      style={{ y: textY }}
    >
      <div className={`flex flex-col gap-4 px-[6%] ${alignClass} max-w-4xl`}>
        {words.length > 0 && (
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            <span className="sr-only">{overlay.headline}</span>
            <span aria-hidden className="flex flex-wrap gap-x-[0.25em] gap-y-0">
              {words.map((word, i) => (
                <span key={i} className="inline-block overflow-hidden">
                  <motion.span
                    className="inline-block"
                    initial={{ y: "110%", opacity: 0, filter: "blur(8px)" }}
                    animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                    transition={{
                      delay: 0.4 + i * 0.08,
                      duration: 0.9,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
            </span>
          </h1>
        )}

        {overlay.subheadline && (
          <motion.p
            className="max-w-xl text-pretty text-base text-white/80 sm:text-lg md:text-xl"
            initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              delay: 0.4 + words.length * 0.08 + 0.2,
              duration: 0.8,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {overlay.subheadline}
          </motion.p>
        )}

        {overlay.cta && (
          <motion.div
            className="pointer-events-auto pt-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.4 + words.length * 0.08 + 0.4,
              duration: 0.7,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <button className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-all hover:bg-white/90 hover:gap-3">
              {overlay.cta}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="transition-transform group-hover:translate-x-0.5"
              >
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
