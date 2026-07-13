"use client";

import { useMemo } from "react";

interface ParticlesProps {
  count?: number;
  speed?: number;
  color?: string;
}

interface Particle {
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  opacity: number;
}

/**
 * Floating dust-mote particles drifting upward. Pure CSS animation.
 */
export function Particles({
  count = 18,
  speed = 1,
  color = "oklch(0.95 0.05 80)",
}: ParticlesProps) {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }).map(() => ({
      left: Math.random() * 100,
      size: 1 + Math.random() * 3,
      delay: Math.random() * 12,
      duration: (10 + Math.random() * 14) / Math.max(0.2, speed),
      drift: (Math.random() - 0.5) * 40,
      opacity: 0.3 + Math.random() * 0.5,
    }));
  }, [count, speed]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full"
          style={
            {
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: color,
              opacity: p.opacity,
              filter: "blur(0.5px)",
              boxShadow: `0 0 ${p.size * 2}px ${color}`,
              animation: `particle-rise ${p.duration}s linear ${p.delay}s infinite`,
              "--p-drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
