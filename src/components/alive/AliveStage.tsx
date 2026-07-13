"use client";

import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import type { AnimationConfig, ImageLayer } from "@/lib/types";
import { AliveLayers } from "./AliveLayers";
import { AliveCSS3D } from "./AliveCSS3D";
import { AliveWebGL } from "./AliveWebGL";
import { LiquidFilter } from "./LiquidFilter";
import { Particles } from "./Particles";
import { ShimmerOverlay } from "./ShimmerOverlay";
import { EffectOverlays } from "./EffectOverlays";
import { ParticleCanvas } from "./ParticleCanvas";

interface AliveStageProps {
  layers: ImageLayer[];
  config: AnimationConfig;
  originalUrl: string;
  backgroundUrl?: string;
  depthUrl?: string;
  framed?: boolean;
  aspectClass?: string;
  editorMode?: boolean;
  selectedLayerId?: string;
  onSelectLayer?: (id: string) => void;
  onLayerTransform?: (
    id: string,
    transform: Partial<ImageLayer["transform"]>
  ) => void;
}

export function AliveStage({
  layers,
  config,
  originalUrl,
  backgroundUrl,
  depthUrl,
  framed = false,
  aspectClass = "aspect-[16/10]",
  editorMode = false,
  selectedLayerId,
  onSelectLayer,
  onLayerTransform,
}: AliveStageProps) {
  const liquidId = useId().replace(/:/g, "");
  const liquidFilterId = `liquid-${liquidId}`;

  const isKenBurns = config.preset === "kenburns" && !config.reducedMotion;

  const vignetteStyle = useMemo(
    () => ({
      background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${config.vignette}) 100%)`,
      opacity: config.vignette > 0 ? 1 : 0,
    }),
    [config.vignette]
  );

  const canWebGL = config.renderMode === "webgl" && !!depthUrl;
  const foregroundUrl = layers.find(
    (l) => l.role === "foreground" && l.url
  )?.url;

  // Determine if any canvas-particle effects are active
  const hasCanvasParticles =
    config.effects.smoke || config.effects.fire || config.effects.embers;

  return (
    <div
      className={`relative w-full ${aspectClass} overflow-hidden rounded-xl bg-black ${
        framed ? "ring-1 ring-white/10" : ""
      }`}
    >
      <div className="absolute inset-0 checker opacity-30" />

      <motion.div
        className="absolute inset-0"
        animate={
          isKenBurns
            ? { scale: [1.0, 1.08, 1.02, 1.06, 1.0], x: [0, -12, 8, -6, 0], y: [0, 6, -8, 4, 0] }
            : { scale: 1, x: 0, y: 0 }
        }
        transition={
          isKenBurns
            ? { duration: 30 / Math.max(0.2, config.speed), ease: "easeInOut", repeat: Infinity }
            : { duration: 0.3 }
        }
      >
        {canWebGL ? (
          <AliveWebGL
            imageUrl={originalUrl}
            depthUrl={depthUrl!}
            intensity={config.intensity}
            speed={config.speed}
            chromaticAberration={config.chromaticAberration}
            vignette={config.vignette}
            parallaxEnabled={config.parallaxEnabled}
            reducedMotion={config.reducedMotion}
          />
        ) : config.renderMode === "css3d" ? (
          <AliveCSS3D
            layers={layers}
            config={config}
            backgroundUrl={backgroundUrl}
            originalUrl={originalUrl}
            foregroundUrl={foregroundUrl}
            liquidFilterId={config.liquidEnabled ? liquidFilterId : undefined}
            editorMode={editorMode}
            selectedLayerId={selectedLayerId}
            onSelectLayer={onSelectLayer}
            onLayerTransform={onLayerTransform}
          />
        ) : (
          <AliveLayers
            layers={layers}
            config={config}
            backgroundUrl={backgroundUrl}
            originalUrl={originalUrl}
            foregroundUrl={foregroundUrl}
            liquidFilterId={config.liquidEnabled ? liquidFilterId : undefined}
            editorMode={editorMode}
            selectedLayerId={selectedLayerId}
            onSelectLayer={onSelectLayer}
            onLayerTransform={onLayerTransform}
          />
        )}
      </motion.div>

      {config.liquidEnabled && (
        <LiquidFilter
          id={liquidFilterId}
          scale={config.preset === "liquid" ? 16 : config.preset === "boil" ? 6 : 8}
          speed={config.speed}
        />
      )}

      {/* CSS-based particles (dust motes) */}
      {config.particlesEnabled && !config.reducedMotion && !hasCanvasParticles && (
        <Particles
          count={config.preset === "dream" ? 20 : 14}
          speed={config.speed}
        />
      )}

      {/* Canvas 2D particle systems (Nivel 4) */}
      {hasCanvasParticles && !config.reducedMotion && (
        <ParticleCanvas
          systems={{
            smoke: config.effects.smoke,
            fire: config.effects.fire,
            embers: config.effects.embers,
            dust: config.effects.dust,
            snow: config.effects.snow,
            rain: config.effects.rain,
          }}
          intensity={config.intensity}
          speed={config.speed}
          spawnPoint={{ x: 0.5, y: 0.85 }}
        />
      )}

      <ShimmerOverlay
        enabled={config.shimmerEnabled && !config.reducedMotion}
        speed={config.speed}
        intensity={config.intensity}
      />

      {/* CSS-based effect overlays (fog, godrays, bokeh, etc) */}
      <EffectOverlays effects={config.effects} speed={config.speed} />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={vignetteStyle}
      />

      {/* chromatic aberration overlay */}
      {config.chromaticAberration > 0 && !canWebGL && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{
            background:
              "radial-gradient(circle at center, transparent 30%, rgba(255,0,80,0.15) 70%, rgba(0,80,255,0.15) 100%)",
            opacity: Math.min(0.5, config.chromaticAberration / 12),
          }}
        />
      )}
    </div>
  );
}
