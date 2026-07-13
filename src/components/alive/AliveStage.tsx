"use client";

import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import type { AnimationConfig, ImageLayer } from "@/lib/types";
import { AliveLayers } from "./AliveLayers";
import { AliveWebGL } from "./AliveWebGL";
import { LiquidFilter } from "./LiquidFilter";
import { Particles } from "./Particles";
import { ShimmerOverlay } from "./ShimmerOverlay";

interface AliveStageProps {
  layers: ImageLayer[];
  config: AnimationConfig;
  originalUrl: string;
  backgroundUrl?: string;
  depthUrl?: string;
  foregroundUrl?: string;
  /** show a thin frame around the stage (studio mode) */
  framed?: boolean;
  /** aspect ratio class, e.g. 'aspect-video' */
  aspectClass?: string;
}

export function AliveStage({
  layers,
  config,
  originalUrl,
  backgroundUrl,
  depthUrl,
  foregroundUrl,
  framed = false,
  aspectClass = "aspect-[16/10]",
}: AliveStageProps) {
  const liquidId = useId().replace(/:/g, "");
  const liquidFilterId = `liquid-${liquidId}`;

  // ken burns is a slow zoom on the whole stage
  const isKenBurns = config.preset === "kenburns" && !config.reducedMotion;

  const vignetteStyle = useMemo(
    () => ({
      background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${config.vignette}) 100%)`,
      opacity: config.vignette > 0 ? 1 : 0,
    }),
    [config.vignette]
  );

  const canWebGL = config.renderMode === "webgl" && !!depthUrl;

  return (
    <div
      className={`relative w-full ${aspectClass} overflow-hidden rounded-xl bg-black ${
        framed ? "ring-1 ring-white/10" : ""
      }`}
    >
      {/* subtle checker behind transparent layers */}
      <div className="absolute inset-0 checker opacity-30" />

      {/* Ken Burns wrapper — slow zoom/pan on entire stage */}
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
        ) : (
          <AliveLayers
            layers={layers}
            config={config}
            backgroundUrl={backgroundUrl}
            originalUrl={originalUrl}
            foregroundUrl={foregroundUrl}
            liquidFilterId={
              config.liquidEnabled ? liquidFilterId : undefined
            }
          />
        )}
      </motion.div>

      {/* Liquid SVG filter def (rendered once, applied via CSS) */}
      {config.liquidEnabled && (
        <LiquidFilter
          id={liquidFilterId}
          scale={config.preset === "liquid" ? 16 : config.preset === "boil" ? 6 : 8}
          speed={config.speed}
        />
      )}

      {/* Particles */}
      {config.particlesEnabled && !config.reducedMotion && (
        <Particles
          count={config.preset === "dream" ? 20 : 14}
          speed={config.speed}
        />
      )}

      {/* Shimmer */}
      <ShimmerOverlay
        enabled={config.shimmerEnabled && !config.reducedMotion}
        speed={config.speed}
        intensity={config.intensity}
      />

      {/* Vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={vignetteStyle}
      />
    </div>
  );
}
