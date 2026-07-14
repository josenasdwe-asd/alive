"use client";

import { useEffect, useRef } from "react";

interface DynamicRelightingProps {
  enabled: boolean;
  /** light azimuth 0..360 deg */
  azimuth: number;
  /** light elevation 0..90 deg */
  elevation: number;
  /** light intensity 0..1 */
  intensity: number;
  /** light color temp 0=warm..1=cool */
  colorTemp: number;
  depthUrl?: string;
}

/**
 * Dynamic relighting overlay.
 *
 * Uses the depth map as an approximation of surface normals:
 * - normal.x = dFdx(depth) (horizontal gradient)
 * - normal.y = dFdy(depth) (vertical gradient)
 * - normal.z = 1 (facing camera)
 *
 * A virtual light at (azimuth, elevation) illuminates each pixel via
 * Lambertian shading: N·L. The result is a light/dark overlay that
 * makes the scene feel like it's being relit in real-time.
 *
 * Implementation: canvas-based, samples the depth map and computes
 * per-pixel lighting, then composites as a screen-blend overlay.
 */
export function DynamicRelighting({
  enabled,
  azimuth,
  elevation,
  intensity,
  colorTemp,
  depthUrl,
}: DynamicRelightingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ azimuth, elevation, intensity, colorTemp });

  useEffect(() => {
    propsRef.current = { azimuth, elevation, intensity, colorTemp };
  });

  useEffect(() => {
    if (!enabled || !depthUrl || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let depthImg: HTMLImageElement | null = null;
    let raf = 0;
    let startT = performance.now();

    const setup = () => {
      depthImg = new Image();
      depthImg.crossOrigin = "anonymous";
      depthImg.onload = () => {
        resize();
        render();
      };
      depthImg.src = depthUrl;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };

    const render = () => {
      if (!depthImg || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const W = Math.floor(rect.width);
      const H = Math.floor(rect.height);
      const p = propsRef.current;
      const t = (performance.now() - startT) / 1000;

      // subtle light movement: azimuth drifts slowly
      const lightAz = (p.azimuth + Math.sin(t * 0.2) * 15) * (Math.PI / 180);
      const lightEl = (p.elevation + Math.cos(t * 0.15) * 5) * (Math.PI / 180);

      // light direction vector
      const lx = Math.cos(lightEl) * Math.cos(lightAz);
      const ly = Math.cos(lightEl) * Math.sin(lightAz);
      const lz = Math.sin(lightEl);

      // draw depth map to a temp canvas at higher res for sampling
      // CALIBRATED: was 128, now 256 (less pixelated when upscaled)
      const sampleW = 256;
      const sampleH = Math.round((H / W) * 256);
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = sampleW;
      tempCanvas.height = sampleH;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;
      tempCtx.drawImage(depthImg, 0, 0, sampleW, sampleH);
      const depthData = tempCtx.getImageData(0, 0, sampleW, sampleH);

      // compute lighting
      const lightData = tempCtx.createImageData(sampleW, sampleH);
      const warmR = 255, warmG = 220, warmB = 160;
      const coolR = 180, coolG = 200, coolB = 255;
      const lr = warmR + (coolR - warmR) * p.colorTemp;
      const lg = warmG + (coolG - warmG) * p.colorTemp;
      const lb = warmB + (coolB - warmB) * p.colorTemp;

      for (let y = 1; y < sampleH - 1; y++) {
        for (let x = 1; x < sampleW - 1; x++) {
          const idx = (y * sampleW + x) * 4;
          // depth gradient = approximate normal
          const dL = depthData.data[(y * sampleW + x - 1) * 4] / 255;
          const dR = depthData.data[(y * sampleW + x + 1) * 4] / 255;
          const dU = depthData.data[((y - 1) * sampleW + x) * 4] / 255;
          const dD = depthData.data[((y + 1) * sampleW + x) * 4] / 255;
          const nx = (dL - dR) * 2;
          const ny = (dU - dD) * 2;
          const nz = 1;
          const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
          // Lambertian: N·L
          const dot = (nx * lx + ny * ly + nz * lz) / nLen;
          const light = Math.max(0, dot) * p.intensity;
          // ambient
          const ambient = 0.3;
          const total = ambient + light * 0.7;
          lightData.data[idx] = lr * total;
          lightData.data[idx + 1] = lg * total;
          lightData.data[idx + 2] = lb * total;
          lightData.data[idx + 3] = 255 * (total - 0.3) * 0.6; // alpha based on light contribution
        }
      }

      // upscale light map to canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      tempCtx.putImageData(lightData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);

      raf = requestAnimationFrame(render);
    };

    setup();

    const onResize = () => {
      resize();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [enabled, depthUrl]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ mixBlendMode: "soft-light", zIndex: 15 }}
      aria-hidden
    />
  );
}
