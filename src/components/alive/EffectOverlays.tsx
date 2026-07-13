"use client";

import { useMemo } from "react";
import type { EffectType } from "@/lib/types";

interface EffectOverlaysProps {
  effects: Record<EffectType, boolean>;
  speed: number;
}

export function EffectOverlays({ effects, speed }: EffectOverlaysProps) {
  return (
    <>
      {effects.fog && <FogEffect speed={speed} />}
      {effects.snow && <SnowEffect speed={speed} />}
      {effects.rain && <RainEffect speed={speed} />}
      {effects.godrays && <GodRaysEffect speed={speed} />}
      {effects.bokeh && <BokehEffect speed={speed} />}
      {effects.dust && <DustEffect speed={speed} />}
      {effects.lightleak && <LightLeakEffect speed={speed} />}
      {effects.grain && <GrainEffect />}
    </>
  );
}

/* ---------- Fog ---------- */
function FogEffect({ speed }: { speed: number }) {
  const dur = (30 / Math.max(0.2, speed)).toFixed(2);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background:
            "linear-gradient(to top, rgba(220,230,235,0.35), rgba(220,230,235,0))",
          filter: "blur(20px)",
          animation: `fog-drift ${dur}s ease-in-out infinite alternate`,
        }}
      />
      <div
        className="absolute inset-x-0 top-1/3 h-1/3"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,255,255,0.15), transparent 70%)",
          filter: "blur(30px)",
          animation: `fog-drift ${(parseFloat(dur) * 1.4).toFixed(2)}s ease-in-out infinite alternate-reverse`,
        }}
      />
    </div>
  );
}

/* ---------- Snow ---------- */
function SnowEffect({ speed }: { speed: number }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: 60 }).map(() => ({
        left: Math.random() * 100,
        size: 2 + Math.random() * 5,
        delay: Math.random() * 10,
        duration: (8 + Math.random() * 10) / Math.max(0.2, speed),
        drift: (Math.random() - 0.5) * 80,
        opacity: 0.4 + Math.random() * 0.5,
      })),
    [speed]
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {flakes.map((f, i) => (
        <span
          key={i}
          className="absolute top-0 rounded-full bg-white"
          style={{
            left: `${f.left}%`,
            width: `${f.size}px`,
            height: `${f.size}px`,
            opacity: f.opacity,
            filter: "blur(0.5px)",
            "--snow-drift": `${f.drift}px`,
            animation: `snow-fall ${f.duration.toFixed(2)}s linear ${f.delay.toFixed(2)}s infinite`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ---------- Rain ---------- */
function RainEffect({ speed }: { speed: number }) {
  const drops = useMemo(
    () =>
      Array.from({ length: 80 }).map(() => ({
        left: Math.random() * 100,
        height: 15 + Math.random() * 25,
        delay: Math.random() * 2,
        duration: (0.6 + Math.random() * 0.6) / Math.max(0.2, speed),
        drift: -30 - Math.random() * 40,
        opacity: 0.2 + Math.random() * 0.3,
      })),
    [speed]
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {drops.map((d, i) => (
        <span
          key={i}
          className="absolute top-0 w-px bg-gradient-to-b from-transparent via-white/60 to-transparent"
          style={{
            left: `${d.left}%`,
            height: `${d.height}px`,
            opacity: d.opacity,
            "--rain-drift": `${d.drift}px`,
            animation: `rain-fall ${d.duration.toFixed(2)}s linear ${d.delay.toFixed(2)}s infinite`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ---------- God rays ---------- */
function GodRaysEffect({ speed }: { speed: number }) {
  const dur = (8 / Math.max(0.2, speed)).toFixed(2);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-screen"
      style={{
        background:
          "conic-gradient(from 200deg at 30% -10%, transparent 0deg, rgba(255,240,200,0.25) 8deg, transparent 16deg, transparent 24deg, rgba(255,240,200,0.18) 32deg, transparent 40deg, transparent 60deg, rgba(255,240,200,0.15) 68deg, transparent 76deg, transparent 360deg)",
        filter: "blur(8px)",
        transformOrigin: "30% -10%",
        animation: `godray-shimmer ${dur}s ease-in-out infinite`,
      }}
    />
  );
}

/* ---------- Bokeh ---------- */
function BokehEffect({ speed }: { speed: number }) {
  const circles = useMemo(
    () =>
      Array.from({ length: 12 }).map(() => {
        const hue = Math.floor(Math.random() * 60) + 30;
        return {
          left: Math.random() * 100,
          top: Math.random() * 100,
          size: 20 + Math.random() * 60,
          delay: Math.random() * 10,
          duration: (12 + Math.random() * 10) / Math.max(0.2, speed),
          drift: (Math.random() - 0.5) * 30,
          opacity: 0.08 + Math.random() * 0.18,
          color: `hsla(${hue}, 70%, 70%, 1)`,
        };
      }),
    [speed]
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-screen"
    >
      {circles.map((c, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${c.left}%`,
            top: `${c.top}%`,
            width: `${c.size}px`,
            height: `${c.size}px`,
            background: `radial-gradient(circle, ${c.color}, transparent 70%)`,
            opacity: c.opacity,
            filter: "blur(2px)",
            "--p-drift": `${c.drift}px`,
            animation: `particle-rise ${c.duration.toFixed(2)}s ease-in-out ${c.delay.toFixed(2)}s infinite`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ---------- Dust ---------- */
function DustEffect({ speed }: { speed: number }) {
  const motes = useMemo(
    () =>
      Array.from({ length: 24 }).map(() => ({
        left: Math.random() * 100,
        size: 1 + Math.random() * 2.5,
        delay: Math.random() * 14,
        duration: (12 + Math.random() * 16) / Math.max(0.2, speed),
        drift: (Math.random() - 0.5) * 50,
        opacity: 0.3 + Math.random() * 0.5,
      })),
    [speed]
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {motes.map((m, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full"
          style={{
            left: `${m.left}%`,
            width: `${m.size}px`,
            height: `${m.size}px`,
            background: "oklch(0.95 0.05 80)",
            opacity: m.opacity,
            boxShadow: `0 0 ${m.size * 2}px oklch(0.95 0.05 80)`,
            filter: "blur(0.4px)",
            "--p-drift": `${m.drift}px`,
            animation: `particle-rise ${m.duration.toFixed(2)}s linear ${m.delay.toFixed(2)}s infinite`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ---------- Light leak ---------- */
function LightLeakEffect({ speed }: { speed: number }) {
  const dur = (18 / Math.max(0.2, speed)).toFixed(2);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-overlay"
      style={{
        background:
          "radial-gradient(ellipse at 80% 20%, rgba(255,180,100,0.35), transparent 50%), radial-gradient(ellipse at 20% 80%, rgba(255,100,150,0.25), transparent 50%)",
        animation: `alive-glow ${dur}s ease-in-out infinite`,
      }}
    />
  );
}

/* ---------- Grain ---------- */
function GrainEffect() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-overlay"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        backgroundSize: "200px 200px",
        animation: "alive-jitter 0.15s steps(1) infinite",
      }}
    />
  );
}
