"use client";

import { useEffect, useRef } from "react";

/**
 * v3 RADICAL: Audio-reactive overlay.
 *
 * Reads audio data from window.__aliveAudio (set by AudioReactivePanel)
 * and applies real-time CSS variable overrides to all .alive-layer elements.
 *
 * Effects:
 * - Bass → increases --breath-amp (layers pulse with bass)
 * - Beat → sharp scale spike via transform scale override
 * - Mid → increases --sway-amp (layers wiggle with rhythm)
 * - Treble → increases --glow-amp (layers shimmer with highs)
 * - Volume → overall brightness boost
 *
 * This component runs a RAF loop and writes CSS vars directly to DOM elements
 * (bypassing React) for zero-latency audio reaction.
 */
export function AudioReactiveOverlay() {
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const audio = (window as any).__aliveAudio as
        | { bass: number; mid: number; treble: number; volume: number; beat: boolean; beatIntensity: number; sensitivity: number }
        | null;

      if (audio) {
        const layers = document.querySelectorAll(".alive-layer, [class*='alive-layer']");
        layers.forEach((el) => {
          const htmlEl = el as HTMLElement;
          const depth = parseFloat(htmlEl.dataset.depth || "0.5");
          const depthWeight = 0.5 + depth * 0.5;
          const s = audio.sensitivity || 1;

          // Bass → breath amp boost
          const breathBoost = audio.bass * 0.5 * s * depthWeight;
          htmlEl.style.setProperty("--audio-breath", String(breathBoost));

          // Beat → scale spike (transform override happens via CSS var)
          const beatScale = audio.beatIntensity * 0.04 * s * depthWeight;
          htmlEl.style.setProperty("--audio-scale", String(1 + beatScale));

          // Mid → sway boost
          const swayBoost = audio.mid * 0.3 * s * depthWeight;
          htmlEl.style.setProperty("--audio-sway", `${swayBoost}deg`);

          // Treble → glow boost
          const glowBoost = audio.treble * 0.4 * s * depthWeight;
          htmlEl.style.setProperty("--audio-glow", String(glowBoost));

          // Volume → brightness
          const brightnessBoost = 1 + audio.volume * 0.15 * s * depthWeight;
          htmlEl.style.setProperty("--audio-brightness", String(brightnessBoost));
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return null;
}
