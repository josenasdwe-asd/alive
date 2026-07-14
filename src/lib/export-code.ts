import type { AnimationConfig, ImageLayer, P2_5DAsset } from "./types";
import { PRESET_MAP } from "./presets";

export type ExportFormat = "html" | "react" | "json";

interface ExportParams {
  config: AnimationConfig;
  layers: ImageLayer[];
  originalUrl: string;
  backgroundUrl?: string;
  depthUrl?: string;
  foregroundUrl?: string;
  width: number;
  height: number;
}

/**
 * Generate a self-contained HTML/CSS/JS snippet that reproduces the
 * alive-image animation. Pure string templating — runs client-side.
 */
export function generateHtml(params: ExportParams): string {
  const {
    config,
    originalUrl,
    backgroundUrl,
    foregroundUrl,
    width,
    height,
  } = params;
  const preset = PRESET_MAP[config.preset];
  const speed = config.speed;
  const breathDur = (6.2 / Math.max(0.2, speed)).toFixed(2);
  const swayDur = (8.3 / Math.max(0.2, speed)).toFixed(2);
  const floatDur = (11.1 / Math.max(0.2, speed)).toFixed(2);
  const driftDur = (13.7 / Math.max(0.2, speed)).toFixed(2);

  const planes = buildExportPlanes(params);

  const layerMarkup = planes
    .map((p, i) => {
      const la = config.layers[p.layerId];
      if (!la) return "";
      const overscale = 1.08 + p.depth * 0.04;
      const depthFactor = 0.3 + p.depth * 1.4;
      const pxToMove = la.parallaxStrength * depthFactor * config.intensity;
      const anims: string[] = [];
      if (la.breathing && !config.reducedMotion)
        anims.push(`alive-breath ${breathDur}s ease-in-out infinite`);
      if (la.sway && !config.reducedMotion)
        anims.push(`alive-sway ${swayDur}s ease-in-out infinite`);
      if (la.floatY && !config.reducedMotion)
        anims.push(`alive-float-y ${floatDur}s ease-in-out infinite`);
      if (la.driftX && !config.reducedMotion)
        anims.push(`alive-drift-x ${driftDur}s ease-in-out infinite`);
      const liquidFilter =
        la.liquid && config.liquidEnabled ? `filter: url(#alive-liquid);` : "";
      return `      <div class="alive-layer" data-depth="${depthFactor.toFixed(
        3
      )}" data-parallax="${pxToMove.toFixed(2)}" style="z-index:${
        10 + i
      }; transform: scale(${overscale.toFixed(3)}); ${liquidFilter} animation: ${
        anims.join(", ") || "none"
      };">
        <img src="${p.url}" alt="${p.alt}" />
      </div>`;
    })
    .join("\n");

  const liquidSvg = config.liquidEnabled
    ? `    <svg style="position:absolute;width:0;height:0">
      <filter id="alive-liquid" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.014 0.018" numOctaves="2" seed="1" result="n">
          <animate attributeName="seed" from="1" to="60" dur="${(18 / Math.max(0.2, speed)).toFixed(2)}s" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="${
          config.preset === "liquid" ? 16 : 8
        }" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>`
    : "";

  const particles = config.particlesEnabled && !config.reducedMotion
    ? `    <div class="alive-particles" aria-hidden="true">
${Array.from({ length: 16 })
  .map(() => {
    const left = Math.random() * 100;
    const size = 1 + Math.random() * 3;
    const delay = Math.random() * 12;
    const dur = (10 + Math.random() * 14) / Math.max(0.2, speed);
    const drift = (Math.random() - 0.5) * 40;
    const op = 0.3 + Math.random() * 0.5;
    return `      <span style="left:${left.toFixed(1)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;opacity:${op.toFixed(2)};--p-drift:${drift.toFixed(0)}px;animation:particle-rise ${dur.toFixed(2)}s linear ${delay.toFixed(2)}s infinite"></span>`;
  })
  .join("\n")}
    </div>`
    : "";

  const shimmer = config.shimmerEnabled && !config.reducedMotion
    ? `    <div class="alive-shimmer" aria-hidden="true"></div>`
    : "";

  const vignette = config.vignette > 0
    ? `    <div class="alive-vignette" style="opacity:${config.vignette.toFixed(2)}"></div>`
    : "";

  return `<!-- Alive Image · ${preset.name} preset · ${preset.emoji} -->
<!-- Generado por Alive Studio. Ajusta las URLs de las imágenes a tus assets. -->
<style>
  @property --breath { syntax: "<number>"; inherits: false; initial-value: 0; }
  @property --sway { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
  @property --float-y { syntax: "<length>"; inherits: false; initial-value: 0px; }
  @property --drift-x { syntax: "<length>"; inherits: false; initial-value: 0px; }

  .alive-stage {
    position: relative;
    width: 100%;
    aspect-ratio: ${width} / ${height};
    overflow: hidden;
    border-radius: 1rem;
    background: #000;
    perspective: 1200px;
  }
  .alive-stage .alive-layer {
    position: absolute; inset: 0;
    transform-origin: center;
    will-change: transform, filter;
    transform: translate3d(var(--px,0px), var(--py,0px), 0)
      translate3d(var(--drift-x,0px), var(--float-y,0px), 0)
      scale(calc(1 + var(--breath,0) * var(--breath-amp,0.02)))
      rotate(var(--sway,0deg));
  }
  .alive-stage .alive-layer img { width: 100%; height: 100%; object-fit: cover; display: block; }
  @keyframes alive-breath { 0%,100% { --breath: 0; } 50% { --breath: 1; } }
  @keyframes alive-sway { 0%,100% { --sway: ${(-0.4 * config.intensity).toFixed(3)}deg; } 50% { --sway: ${(0.4 * config.intensity).toFixed(3)}deg; } }
  @keyframes alive-float-y { 0%,100% { --float-y: -6px; } 50% { --float-y: 6px; } }
  @keyframes alive-drift-x { 0%,100% { --drift-x: -4px; } 50% { --drift-x: 4px; } }
  @keyframes shimmer-sweep { 0% { transform: translateX(-120%) skewX(-15deg); } 100% { transform: translateX(220%) skewX(-15deg); } }
  @keyframes particle-rise { 0% { transform: translateY(0) translateX(0); opacity: 0; } 10% { opacity: .7; } 90% { opacity: .5; } 100% { transform: translateY(-120px) translateX(var(--p-drift,10px)); opacity: 0; } }

  .alive-particles { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .alive-particles span { position: absolute; bottom: 0; border-radius: 9999px; background: oklch(0.95 0.05 80); box-shadow: 0 0 6px oklch(0.95 0.05 80); }
  .alive-shimmer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; mix-blend-mode: overlay; }
  .alive-shimmer::after { content: ""; position: absolute; inset: -20% -30%; width: 30%; background: linear-gradient(105deg, transparent, rgba(255,255,255,0) 35%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 65%, transparent); filter: blur(8px); animation: shimmer-sweep ${(8 / Math.max(0.2, speed)).toFixed(2)}s ease-in-out infinite; }
  .alive-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,1) 100%); }

  @media (prefers-reduced-motion: reduce) {
    .alive-stage .alive-layer, .alive-particles span, .alive-shimmer::after { animation: none !important; }
  }
</style>

<div class="alive-stage" id="alive-stage">
${liquidSvg}
${layerMarkup}
${particles}
${shimmer}
${vignette}
</div>

<script>
  (function () {
    var stage = document.getElementById('alive-stage');
    if (!stage) return;
    var layers = stage.querySelectorAll('.alive-layer');
    var mx = 0, my = 0, tx = 0, ty = 0;
    var enabled = ${config.parallaxEnabled && !config.reducedMotion};
    if (enabled) {
      stage.addEventListener('pointermove', function (e) {
        var r = stage.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      });
      stage.addEventListener('pointerleave', function () { tx = 0; ty = 0; });
    }
    function tick() {
      mx += (tx - mx) * 0.06; my += (ty - my) * 0.06;
      for (var i = 0; i < layers.length; i++) {
        var el = layers[i];
        var p = parseFloat(el.getAttribute('data-parallax')) || 0;
        el.style.setProperty('--px', (mx * p).toFixed(2) + 'px');
        el.style.setProperty('--py', (my * p * 0.7).toFixed(2) + 'px');
      }
      requestAnimationFrame(tick);
    }
    tick();
  })();
</script>`;
}

interface ExportPlane {
  layerId: string;
  depth: number;
  url: string;
  alt: string;
}

function buildExportPlanes(params: ExportParams): ExportPlane[] {
  const { layers } = params;
  // export ALL real layers (sorted back→front), skip invisible and empty
  return [...layers]
    .filter((l) => l.transform.visible && l.url)
    .sort((a, b) => a.depth - b.depth)
    .map((l) => ({
      layerId: l.id,
      depth: l.depth,
      url: l.url,
      alt: l.name,
    }));
}

/**
 * Generate a React component (TSX) that reproduces the animation using
 * framer-motion. Self-contained, drop into any React project.
 */
export function generateReact(params: ExportParams): string {
  const { config, originalUrl, backgroundUrl, foregroundUrl, width, height } =
    params;
  const preset = PRESET_MAP[config.preset];
  const planes = buildExportPlanes(params);

  const speed = config.speed;
  const breathDur = (6.2 / Math.max(0.2, speed)).toFixed(2);
  const swayDur = (8.3 / Math.max(0.2, speed)).toFixed(2);

  const planesCode = planes
    .map((p, i) => {
      const la = config.layers[p.layerId];
      if (!la) return "";
      const overscale = (1.08 + p.depth * 0.04).toFixed(3);
      const depthFactor = (0.3 + p.depth * 1.4).toFixed(3);
      const px = (la.parallaxStrength * parseFloat(depthFactor) * config.intensity).toFixed(2);
      return `      <AlivePlane
        key="${p.layerId}"
        src="${p.url}"
        alt="${p.alt}"
        parallax={${px}}
        scale={${overscale}}
        breath={${la.breathing && !config.reducedMotion ? "true" : "false"}}}
        sway={${la.sway && !config.reducedMotion ? "true" : "false"}}}
        liquid={${la.liquid && config.liquidEnabled ? "true" : "false"}}}
        breathDur={${breathDur}}
        swayDur={${swayDur}}
        zIndex={${10 + i}}
      />`;
    })
    .join("\n");

  return `// AliveImage.tsx — ${preset.name} preset · ${preset.emoji}
// Dependencias: framer-motion. Copia este archivo a tu proyecto React/Next.js.
// Reemplaza las URLs por tus assets reales.
"use client";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

interface AliveImageProps {
  width?: number;
  height?: number;
}

export function AliveImage({ width = ${width}, height = ${height} }: AliveImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 50, damping: 20, mass: 0.5 });
  const smy = useSpring(my, { stiffness: 50, damping: 20, mass: 0.5 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
      my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    const onLeave = () => { mx.set(0); my.set(0); };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [mx, my]);

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: \`\${width} / \${height}\`,
        overflow: "hidden",
        borderRadius: "1rem",
        background: "#000",
        perspective: 1200,
      }}
    >
${planesCode}
    </div>
  );
}

interface AlivePlaneProps {
  src: string;
  alt: string;
  parallax: number;
  scale: number;
  breath: boolean;
  sway: boolean;
  liquid: boolean;
  breathDur: number;
  swayDur: number;
  zIndex: number;
}

function AlivePlane({
  src, alt, parallax, scale, breath, sway, liquid, breathDur, swayDur, zIndex,
}: AlivePlaneProps) {
  const smx = useMotionValue(0);
  const smy = useMotionValue(0);
  // consume parent springs via context would be cleaner; for a self-contained
  // example we re-read from a shared module-level motion value in practice.
  const tx = useTransform(smx, (v) => v * parallax);
  const ty = useTransform(smy, (v) => v * parallax * 0.7);
  const animations: string[] = [];
  if (breath) animations.push(\`alive-breath \${breathDur}s ease-in-out infinite\`);
  if (sway) animations.push(\`alive-sway \${swayDur}s ease-in-out infinite\`);
  return (
    <motion.div
      style={{
        position: "absolute", inset: 0, x: tx, y: ty, scale, zIndex,
        filter: liquid ? "url(#alive-liquid)" : "none",
        animation: animations.join(", ") || undefined,
        willChange: "transform, filter",
      }}
    >
      <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </motion.div>
  );
}`;
}

/**
 * Generate a .2p5d container (Disguise-compatible JSON format).
 * Encapsulates plates (color + depth), camera settings, and metadata.
 */
export function generate2p5d(params: ExportParams): string {
  const { config, layers, originalUrl, backgroundUrl, depthUrl } = params;

  const plates = layers.map((l, i) => ({
    name: l.name,
    colorUrl: l.url || originalUrl,
    depthUrl: depthUrl,
    depth: l.depth,
    z: (l.depth - 0.5) * 800, // Z in px (-400..+400)
    scale: config.scaleWithDepth ? 1 + l.depth * 0.15 : 1,
    visible: l.transform.visible,
    locked: l.transform.locked,
  }));

  const asset: P2_5DAsset = {
    version: "1.0",
    origin: { x: 0, y: 0, z: 0 },
    fov: 45,
    plates,
    camera: {
      fov: 45,
      focusMode: config.focusMode,
      focusDepth: config.focusDepth,
      aperture: config.aperture,
    },
  };

  return JSON.stringify(asset, null, 2);
}
