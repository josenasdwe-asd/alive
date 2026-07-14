"use client";

import { useEffect, useState, useRef } from "react";

export type DeviceTier = "low" | "medium" | "high";

export interface DeviceCapabilities {
  tier: DeviceTier;
  cores: number;
  memory: number; // GB
  webgl2: boolean;
  reducedMotion: boolean;
  isMobile: boolean;
}

/**
 * Detect device capability tier for adaptive quality.
 *
 * Tier logic:
 * - low: <4 cores OR <4GB RAM OR no WebGL2 OR mobile with reduced motion
 *   → disable relighting, particles capped at 30, no liquid, no motion blur
 * - medium: 4-7 cores OR 4-8GB RAM
 *   → all effects but particles capped at 60, no motion blur
 * - high: 8+ cores AND 8GB+ RAM AND WebGL2 AND desktop
 *   → everything on, unlimited particles
 */
export function detectDeviceTier(): DeviceCapabilities {
  if (typeof window === "undefined") {
    return { tier: "high", cores: 8, memory: 8, webgl2: true, reducedMotion: false, isMobile: false };
  }

  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as any).deviceMemory || 4;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Test WebGL2 support
  let webgl2 = false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    webgl2 = !!gl;
  } catch {
    webgl2 = false;
  }

  let tier: DeviceTier = "high";
  if (cores < 4 || memory < 4 || !webgl2 || (isMobile && reducedMotion)) {
    tier = "low";
  } else if (cores < 8 || memory < 8 || isMobile) {
    tier = "medium";
  }

  return { tier, cores, memory, webgl2, reducedMotion, isMobile };
}

/**
 * Get quality settings for a device tier.
 */
export function getQualitySettings(tier: DeviceTier) {
  switch (tier) {
    case "low":
      return {
        maxParticles: 0,
        relightingEnabled: false,
        motionBlurEnabled: false,
        depthFogEnabled: false,
        bloomEnabled: false,
        liquidEnabled: false,
        dprCap: 1,
      };
    case "medium":
      return {
        maxParticles: 40,
        relightingEnabled: true,
        motionBlurEnabled: false,
        depthFogEnabled: true,
        bloomEnabled: true,
        liquidEnabled: true,
        dprCap: 1.5,
      };
    case "high":
    default:
      return {
        maxParticles: 120,
        relightingEnabled: true,
        motionBlurEnabled: true,
        depthFogEnabled: true,
        bloomEnabled: true,
        liquidEnabled: true,
        dprCap: 2,
      };
  }
}

/**
 * Hook: detect device tier once on mount.
 */
export function useDeviceTier(): DeviceCapabilities {
  const [caps, setCaps] = useState<DeviceCapabilities>({
    tier: "high", cores: 8, memory: 8, webgl2: true, reducedMotion: false, isMobile: false,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCaps(detectDeviceTier());
  }, []);

  return caps;
}

/**
 * Hook: pause callbacks when element is off-screen.
 * Returns `paused` boolean. Calls onPause/onResume callbacks.
 *
 * Uses IntersectionObserver — zero overhead when visible.
 */
export function usePauseWhenOffscreen(
  ref: React.RefObject<HTMLElement>,
  threshold = 0.05
): boolean {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isOffscreen = entry.intersectionRatio < threshold;
        setPaused(isOffscreen);
      },
      { threshold: [0, threshold, 0.5, 1] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return paused;
}

/**
 * Hook: FPS monitor with auto-downgrade.
 * If FPS drops below 45 for 2 seconds, calls onDowngrade.
 */
export function useFPSMonitor(onDowngrade: () => void, enabled = true) {
  const framesRef = useRef<number[]>([]);
  const downgradeFiredRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;

    const tick = () => {
      const now = performance.now();
      framesRef.current.push(now);
      // Keep only last 60 frames
      if (framesRef.current.length > 60) {
        framesRef.current.shift();
      }

      // Check every 60 frames
      if (framesRef.current.length === 60 && !downgradeFiredRef.current) {
        const oldest = framesRef.current[0];
        const elapsed = (now - oldest) / 1000;
        const fps = 60 / elapsed;
        if (fps < 45) {
          downgradeFiredRef.current = true;
          onDowngrade();
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, onDowngrade]);

  // Reset downgrade flag (call when user manually changes quality)
  const reset = () => { downgradeFiredRef.current = false; };
  return { reset };
}
