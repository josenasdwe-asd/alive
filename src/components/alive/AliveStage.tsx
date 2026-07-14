"use client";

import { useId, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import type { AnimationConfig, ImageLayer } from "@/lib/types";
import { AliveLayers } from "./AliveLayers";
import { AliveLayersMath } from "./AliveLayersMath";
import { AliveCSS3D } from "./AliveCSS3D";
import { AliveWebGL } from "./AliveWebGL";
import { AliveKenBurns3D } from "./AliveKenBurns3D";
import { LiquidFilter } from "./LiquidFilter";
import { Particles } from "./Particles";
import { ShimmerOverlay } from "./ShimmerOverlay";
import { EffectOverlays } from "./EffectOverlays";
import { ParticleCanvas } from "./ParticleCanvas";
import { ColorGrading } from "./ColorGrading";
import { FlowFieldRenderer } from "./FlowFieldRenderer";
import { AtmosphericAnimation } from "./AtmosphericAnimation";
import { DepthFog } from "./DepthFog";
import { BloomACES } from "./BloomACES";
import { DynamicRelighting } from "./DynamicRelighting";
import { ColorScript } from "./ColorScript";
import { MotionBlur } from "./MotionBlur";
import { useDeviceTier, usePauseWhenOffscreen, getQualitySettings } from "@/hooks/use-adaptive-quality";

interface AliveStageProps {
  layers: ImageLayer[];
  config: AnimationConfig;
  originalUrl: string;
  backgroundUrl?: string;
  depthUrl?: string;
  framed?: boolean;
  /** Tailwind aspect class (e.g. "aspect-[16/10]"). Ignored if aspectRatio is set. */
  aspectClass?: string;
  /** Numeric aspect ratio (width/height). Takes precedence over aspectClass. */
  aspectRatio?: number;
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
  aspectRatio,
  editorMode = false,
  selectedLayerId,
  onSelectLayer,
  onLayerTransform,
}: AliveStageProps) {
  const liquidId = useId().replace(/:/g, "");
  const liquidFilterId = `liquid-${liquidId}`;

  // v3 ADAPTIVE QUALITY: detect device tier + pause when off-screen
  const stageRef = useRef<HTMLDivElement>(null);
  const deviceCaps = useDeviceTier();
  const isOffscreen = usePauseWhenOffscreen(stageRef, 0.05);
  const qualitySettings = getQualitySettings(deviceCaps.tier);

  // Auto-reduce quality if FPS drops (handled via config flags)
  const isLowQuality = deviceCaps.tier === "low" || isOffscreen;

  const isKenBurns = config.preset === "kenburns" && !config.reducedMotion;

  const vignetteStyle = useMemo(
    () => ({
      background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${config.vignette}) 100%)`,
      opacity: config.vignette > 0 ? 1 : 0,
    }),
    [config.vignette]
  );

  const canWebGL = config.renderMode === "webgl" && !!depthUrl;
  const canKenBurns3D = config.renderMode === "kenburns3d" && !!depthUrl;

  const hasCanvasParticles =
    config.effects.smoke || config.effects.fire || config.effects.embers;

  // v3 ADAPTIVE: gate expensive effects by device tier + off-screen
  const showRelighting = config.relightingEnabled && !config.reducedMotion && !isLowQuality && qualitySettings.relightingEnabled;
  const showMotionBlur = config.motionBlurEnabled && !config.reducedMotion && !isLowQuality && qualitySettings.motionBlurEnabled;
  const showDepthFog = config.depthFogEnabled && !config.reducedMotion && !isLowQuality && qualitySettings.depthFogEnabled;
  const showBloom = config.bloomEnabled && !isLowQuality && qualitySettings.bloomEnabled;
  // v3 VANGUARDIA: Flow field is always available (not gated by quality — it's a user-drawn feature)
  const showFlowField = !isLowQuality && ((window as any).__aliveFlowField != null);
  const showParticles = config.particlesEnabled && !config.reducedMotion && !isLowQuality;
  const showLiquid = config.liquidEnabled && !isLowQuality && qualitySettings.liquidEnabled;

  return (
    <div
      ref={stageRef}
      data-alive-stage="true"
      className={`relative w-full ${aspectRatio ? "" : aspectClass} overflow-hidden rounded-xl bg-black ${
        framed ? "ring-1 ring-white/10" : ""
      }`}
      style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
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
        {canKenBurns3D ? (
          <AliveKenBurns3D
            imageUrl={originalUrl}
            depthUrl={depthUrl!}
            backgroundUrl={backgroundUrl}
            intensity={config.intensity}
            speed={config.speed}
            chromaticAberration={config.chromaticAberration}
            vignette={config.vignette}
            parallaxEnabled={config.parallaxEnabled}
            reducedMotion={config.reducedMotion}
          />
        ) : canWebGL ? (
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
            liquidFilterId={config.liquidEnabled ? liquidFilterId : undefined}
            editorMode={editorMode}
            selectedLayerId={selectedLayerId}
            onSelectLayer={onSelectLayer}
            onLayerTransform={onLayerTransform}
          />
        ) : config.useMathEngine ? (
          // v3 MATHEMATICAL MOTION ENGINE: exact, non-deforming, harmonic
          <AliveLayersMath
            layers={layers}
            config={config}
            liquidFilterId={showLiquid ? liquidFilterId : undefined}
            editorMode={editorMode}
            selectedLayerId={selectedLayerId}
            onSelectLayer={onSelectLayer}
            onLayerTransform={onLayerTransform}
          />
        ) : (
          <AliveLayers
            layers={layers}
            config={config}
            liquidFilterId={showLiquid ? liquidFilterId : undefined}
            editorMode={editorMode}
            selectedLayerId={selectedLayerId}
            onSelectLayer={onSelectLayer}
            onLayerTransform={onLayerTransform}
          />
        )}
      </motion.div>

      {showLiquid && (
        <LiquidFilter
          id={liquidFilterId}
          scale={config.preset === "liquid" ? 16 : config.preset === "boil" ? 6 : 8}
          speed={config.speed}
        />
      )}

      {showParticles && !hasCanvasParticles && (
        <Particles
          count={Math.min(config.preset === "dream" ? 20 : 14, qualitySettings.maxParticles)}
          speed={config.speed}
        />
      )}

      {hasCanvasParticles && showParticles && (
        <ParticleCanvas
          systems={{
            smoke: config.effects?.smoke ?? false,
            fire: config.effects?.fire ?? false,
            embers: config.effects?.embers ?? false,
            dust: config.effects?.dust ?? false,
            snow: config.effects?.snow ?? false,
            rain: config.effects?.rain ?? false,
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

      <EffectOverlays effects={config.effects ?? {}} speed={config.speed} />

      {/* v3 VANGUARDIA: Flow field motion — directional pixel flow from drawn arrows */}
      <FlowFieldRenderer imageUrl={originalUrl} enabled={showFlowField} />

      <ColorGrading grade={config.colorGrade} intensity={1} />

      {/* Depth fog volumétrico + Bloom/ACES — gated by adaptive quality */}
      <DepthFog
        enabled={showDepthFog}
        density={config.depthFogDensity}
        layers={layers}
      />
      <BloomACES
        enabled={showBloom}
        intensity={config.bloomIntensity}
        toneMap={config.toneMapStrength}
      />

      {/* Phase 3: relighting + color script + motion blur — gated by adaptive quality */}
      <DynamicRelighting
        enabled={showRelighting}
        azimuth={config.relightingAzimuth}
        elevation={config.relightingElevation}
        intensity={config.relightingIntensity}
        colorTemp={config.relightingColorTemp}
        depthUrl={depthUrl}
      />
      <ColorScript
        enabled={config.colorScriptEnabled && !config.reducedMotion && !isLowQuality}
        act={config.colorScriptAct}
        speed={config.speed}
      />
      <MotionBlur
        enabled={showMotionBlur}
        strength={config.motionBlurStrength}
      />

      {/* Atmospheric animations — gated by off-screen + low quality */}
      <AtmosphericAnimation type="light-cycle" enabled={config.atmoLightCycle && !config.reducedMotion && !isLowQuality} speed={config.speed} intensity={config.intensity} />
      <AtmosphericAnimation type="fog-drift" enabled={config.atmoFogDrift && !config.reducedMotion && !isLowQuality} speed={config.speed} intensity={config.intensity} />
      <AtmosphericAnimation type="timelapse" enabled={config.atmoTimelapse && !config.reducedMotion && !isLowQuality} speed={config.speed} intensity={config.intensity} />
      <AtmosphericAnimation type="seasonal" enabled={config.atmoSeasonal && !config.reducedMotion && !isLowQuality} speed={config.speed} intensity={config.intensity} />

      {/* CRITICAL FIX (H3, H4): vignette and chromatic overlays are ALREADY applied
       * inside the WebGL/KenBurns3D shaders. Skip the CSS overlays to prevent doubling. */}
      {!canWebGL && !canKenBurns3D && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={vignetteStyle}
        />
      )}

      {config.chromaticAberration > 0 && !canWebGL && !canKenBurns3D && (
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
