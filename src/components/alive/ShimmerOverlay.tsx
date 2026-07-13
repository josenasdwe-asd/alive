"use client";

interface ShimmerOverlayProps {
  enabled: boolean;
  speed: number;
  intensity: number;
}

/**
 * A soft diagonal light beam that sweeps across the image periodically,
 * giving a premium "shimmer" highlight. Pure CSS.
 */
export function ShimmerOverlay({
  enabled,
  speed,
  intensity,
}: ShimmerOverlayProps) {
  if (!enabled) return null;
  const dur = (8 / Math.max(0.2, speed)).toFixed(2);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -inset-y-4 -left-1/3 w-1/3 mix-blend-overlay"
        style={{
          background:
            "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.0) 35%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.0) 65%, transparent 100%)",
          opacity: intensity * 0.8,
          filter: "blur(8px)",
          animation: `shimmer-sweep ${dur}s ease-in-out infinite`,
        }}
      />
    </div>
  );
}
