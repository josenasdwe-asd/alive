"use client";

interface LiquidFilterProps {
  id: string;
  /** displacement scale in px */
  scale: number;
  /** animation speed multiplier */
  speed: number;
  /** base frequency of the turbulence */
  baseFrequency?: number;
}

/**
 * SVG turbulence + displacement filter for the "liquid / dream" distortion.
 * Animated `seed` produces slow organic movement.
 * Render this once near the root; reference it via CSS `filter: url(#id)`.
 */
export function LiquidFilter({
  id,
  scale,
  speed,
  baseFrequency = 0.014,
}: LiquidFilterProps) {
  const dur = `${(18 / Math.max(0.2, speed)).toFixed(2)}s`;

  return (
    <svg
      aria-hidden
      style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
    >
      <defs>
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={`${baseFrequency} ${baseFrequency * 1.3}`}
            numOctaves={2}
            seed="1"
            result="noise"
          >
            <animate
              attributeName="seed"
              from="1"
              to="60"
              dur={dur}
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
