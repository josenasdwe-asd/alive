"use client";

import {
  ScanSearch,
  Layers,
  Sparkles,
  MousePointer2,
  Droplets,
  Cpu,
  ArrowRight,
  Wind,
  Flame,
} from "lucide-react";
import { UploadZone } from "./UploadZone";
import { PRESETS } from "@/lib/presets";

const FEATURES = [
  {
    icon: ScanSearch,
    title: "Análisis VLM profundo",
    desc: "La IA identifica 6-8 capas semánticas con su profundidad, paleta y mood.",
  },
  {
    icon: Layers,
    title: "Editor de capas visual",
    desc: "Arrastra, reordena, bloquea, duplica y transforma cada capa en el canvas.",
  },
  {
    icon: MousePointer2,
    title: "4 modos de render",
    desc: "CSS multiplane · CSS 3D estereoscópico · WebGL2 depth shader · 3D Ken Burns point cloud.",
  },
  {
    icon: Cpu,
    title: "WebGL2 depth shader",
    desc: "Parallax píxel-a-píxel con el mapa de profundidad. Calidad Immersity.",
  },
  {
    icon: Flame,
    title: "Partículas Canvas con física",
    desc: "Humo, fuego y brasas reales con turbulencia simplex noise y mouse interactivo.",
  },
  {
    icon: Droplets,
    title: "19 efectos orgánicos",
    desc: "Respira, balancea, twist, flota, onda, jitter, glow, hue, focus, sombra, heartbeat, vortex, ripple, z-tilt, sway-3d, breathe-x, scan…",
  },
  {
    icon: Sparkles,
    title: "Atmósfera procedural",
    desc: "Niebla, nieve, lluvia, god rays, bokeh, light leak, grano de película.",
  },
  {
    icon: Wind,
    title: "Física spring por capa",
    desc: "Inercia, velocidad del mouse y fase única — cada capa respira a su ritmo.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Sube tu imagen",
    desc: "Foto, retrato, paisaje o ilustración. La IA la normaliza y analiza.",
  },
  {
    n: "02",
    title: "IA desacopla",
    desc: "VLM identifica capas. image-edit genera fondo inpaintado + depth map.",
  },
  {
    n: "03",
    title: "Dale vida",
    desc: "Elige un preset y ajusta. Ve el resultado en tiempo real.",
  },
  {
    n: "04",
    title: "Exporta",
    desc: "Copia HTML/CSS/JS o React TSX listo para producción.",
  },
];

export function Landing() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
        <div className="aurora" />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Desacople de imágenes con IA + animación viva
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Convierte una imagen quieta en{" "}
            <span className="text-gradient">algo vivo</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Sube una foto y la IA la desacopla en capas con profundidad. Luego
            anímala sutilmente — respiración, líquido, parallax — como ese efecto
            soñador donde un cuadro parece respirar.
          </p>
        </div>

        <div className="relative mx-auto mt-10 max-w-2xl">
          <UploadZone />
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-6 text-center text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Cómo lo hace
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:border-white/15 hover:bg-white/[0.04]"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-medium">{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                  <span className="font-mono text-xs text-primary">{s.n}</span>
                  <h3 className="mt-2 text-sm font-medium">{s.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {s.desc}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-white/10 lg:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preset showcase */}
      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
            23 presets creativos
          </h2>
          <p className="mx-auto mb-8 max-w-md text-center text-sm text-muted-foreground">
            Cada preset combina múltiples animaciones sutiles con duraciones
            primas para que nunca se sincronicen — la clave del efecto "vivo".
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {PRESETS.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.04]"
              >
                <div className="text-2xl">{p.emoji}</div>
                <h3 className="mt-2 text-sm font-medium">{p.name}</h3>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                  {p.tagline}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
