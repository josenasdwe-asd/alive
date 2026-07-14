"use client";

import { useRef, useEffect, useId } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { useAliveStore } from "@/lib/store";
import { AliveLayers } from "./AliveLayers";
import { AliveCSS3D } from "./AliveCSS3D";
import { AliveKenBurns3D } from "./AliveKenBurns3D";
import { LiquidFilter } from "./LiquidFilter";
import { EffectOverlays } from "./EffectOverlays";
import { ParticleCanvas } from "./ParticleCanvas";
import { ShimmerOverlay } from "./ShimmerOverlay";
import { ColorGrading } from "./ColorGrading";
import { DepthFog } from "./DepthFog";
import { BloomACES } from "./BloomACES";
import { DynamicRelighting } from "./DynamicRelighting";
import { ColorScript } from "./ColorScript";
import { TextOverlayView } from "./TextOverlay";
import { Particles } from "./Particles";

interface HeroModeProps {
  onExit: () => void;
}

/**
 * Full-viewport hero with scroll-driven parallax.
 * - Sticky container: hero stays fixed while a spacer scrolls past it.
 * - Each layer's Y offset is bound to scroll progress (back layers move less,
 *   front layers move more — classic depth parallax).
 * - Text overlay with word-by-word reveal.
 * - Color grading + letterbox + gate weave for cinematic feel.
 */
export function HeroMode({ onExit }: HeroModeProps) {
  const {
    layers,
    animation: config,
    originalUrl,
    backgroundUrl,
    depthMapUrl,
    textOverlay,
  } = useAliveStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const liquidId = useId().replace(/:/g, "");
  const liquidFilterId = `liquid-${liquidId}`;

  // track scroll progress with MotionValue (more reliable than useScroll with target)
  const scrollMV = useMotionValue(0);
  const scrollNumRef = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.body.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      const clamped = Math.max(0, Math.min(1, progress));
      scrollMV.set(clamped);
      scrollNumRef.current = clamped;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [scrollMV]);

  const stageScale = useTransform(scrollMV, [0, 1], [1, 1.3]);
  const stageOpacity = useTransform(scrollMV, [0, 0.7, 1], [1, 0.8, 0.2]);
  const textOpacity = useTransform(scrollMV, [0, 0.3], [1, 0]);
  const textY = useTransform(scrollMV, [0, 1], [0, -200]);

  const canWebGL = config.renderMode === "webgl" && !!depthMapUrl;
  const canKenBurns3D = config.renderMode === "kenburns3d" && !!depthMapUrl;
  // in hero mode, prefer KenBurns3D whenever a depth map is available
  const useKenBurnsInHero = config.renderMode === "kenburns3d" && !!depthMapUrl;
  const hasCanvasParticles =
    (config.effects?.smoke || config.effects?.fire || config.effects?.embers);

  // pass scroll progress to AliveLayers via a prop — we need a modified version
  // that accepts scrollY. For now, HeroMode wraps AliveLayers and applies
  // a scroll-driven Y offset to the whole stage via the sticky wrapper.

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ height: "200vh" }} // 2 viewport heights = scroll range
    >
      {/* Sticky hero — stays fixed while scrolling */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <motion.button
          onClick={onExit}
          className="absolute right-4 top-4 z-50 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:bg-black/60 hover:text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          ✕ Salir del hero
        </motion.button>

        <motion.div
          className="absolute inset-0"
          style={{ scale: stageScale, opacity: stageOpacity }}
        >
          {canKenBurns3D || useKenBurnsInHero ? (
            <AliveKenBurns3D
              imageUrl={originalUrl}
              depthUrl={depthMapUrl!}
              backgroundUrl={backgroundUrl}
              intensity={config.intensity}
              speed={config.speed}
              chromaticAberration={config.chromaticAberration}
              vignette={config.vignette}
              parallaxEnabled={config.parallaxEnabled}
              reducedMotion={config.reducedMotion}
              scrollProgress={scrollMV}
            />
          ) : config.renderMode === "css3d" ? (
            <AliveCSS3D
              layers={layers}
              config={config}
              liquidFilterId={config.liquidEnabled ? liquidFilterId : undefined}
            />
          ) : (
            <AliveLayers
              layers={layers}
              config={config}
              liquidFilterId={config.liquidEnabled ? liquidFilterId : undefined}
            />
          )}
        </motion.div>

        {config.liquidEnabled && (
          <LiquidFilter
            id={liquidFilterId}
            scale={config.preset === "liquid" ? 16 : 8}
            speed={config.speed}
          />
        )}

        {config.particlesEnabled && !config.reducedMotion && !hasCanvasParticles && (
          <Particles count={24} speed={config.speed} />
        )}

        {hasCanvasParticles && !config.reducedMotion && (
          <ParticleCanvas
            systems={{
              smoke: config.effects?.smoke,
              fire: config.effects?.fire,
              embers: config.effects?.embers,
              dust: config.effects?.dust,
              snow: config.effects?.snow,
              rain: config.effects?.rain,
            }}
            intensity={config.intensity}
            speed={config.speed}
            spawnPoint={{ x: 0.5, y: 0.9 }}
          />
        )}

        <ShimmerOverlay
          enabled={config.shimmerEnabled && !config.reducedMotion}
          speed={config.speed}
          intensity={config.intensity}
        />

        <EffectOverlays effects={config.effects} speed={config.speed} />

        <ColorGrading grade={config.colorGrade} intensity={1} />

        {/* Phase 2-3 cinematic effects */}
        <DepthFog
          enabled={config.depthFogEnabled && !config.reducedMotion}
          density={config.depthFogDensity}
          layers={layers}
        />
        <BloomACES
          enabled={config.bloomEnabled}
          intensity={config.bloomIntensity}
          toneMap={config.toneMapStrength}
        />
        <DynamicRelighting
          enabled={config.relightingEnabled && !config.reducedMotion}
          azimuth={config.relightingAzimuth}
          elevation={config.relightingElevation}
          intensity={config.relightingIntensity}
          colorTemp={config.relightingColorTemp}
          depthUrl={depthMapUrl}
        />
        <ColorScript
          enabled={config.colorScriptEnabled && !config.reducedMotion}
          act={config.colorScriptAct}
          speed={config.speed}
        />

        {/* Vignette */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${config.vignette}) 100%)`,
          }}
        />

        {/* Gate weave (sub-pixel film jitter) */}
        {config.gateWeave && !config.reducedMotion && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              animation: "alive-jitter 0.3s steps(1) infinite",
              ["--jitter-x" as any]: "0.5px",
              ["--jitter-y" as any]: "0.5px",
            }}
          />
        )}

        {/* Text overlay with scroll parallax */}
        {textOverlay?.enabled && (
          <motion.div style={{ opacity: textOpacity, y: textY }} className="absolute inset-0">
            <TextOverlayView overlay={textOverlay} scrollProgress={0} />
          </motion.div>
        )}

        {/* Letterbox bars (cinematic 2.39:1) */}
        {config.letterbox && (
          <>
            <motion.div
              className="absolute inset-x-0 top-0 z-40 bg-black"
              initial={{ height: "12vh" }}
              animate={{ height: "12vh" }}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 z-40 bg-black"
              initial={{ height: "12vh" }}
              animate={{ height: "12vh" }}
            />
          </>
        )}

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-[14vh] left-1/2 z-30 -translate-x-1/2 text-white/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          style={{ opacity: textOpacity }}
        >
          <div className="flex flex-col items-center gap-1 text-[10px] uppercase tracking-widest">
            <span>Scroll</span>
            <motion.div
              className="h-8 w-px bg-white/30"
              animate={{ scaleY: [0.3, 1, 0.3] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
