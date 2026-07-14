"use client";

import { useEffect, useRef } from "react";

/**
 * v3 VANGUARDIA: Flow Field Renderer.
 *
 * Reads flow arrows from window.__aliveFlowField and applies directional
 * motion to the stage image via a WebGL2 fragment shader.
 *
 * The shader samples the image at offset UVs, where the offset is computed
 * from the nearest flow arrow vector × time × intensity.
 *
 * This creates the "water flowing", "clouds drifting", "hair blowing" effect
 * that Motionleap is famous for.
 */
const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
uniform float uTime;
uniform float uIntensity;
uniform int uArrowCount;
uniform vec4 uArrows[16]; // xy = start, zw = direction (normalized 0..1)
uniform float uArrowStrengths[16];
uniform vec2 uResolution;

void main() {
  vec2 uv = vUv;

  // Accumulate flow offset from all arrows
  vec2 flowOffset = vec2(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= uArrowCount) break;
    vec4 arrow = uArrows[i];
    vec2 arrowStart = arrow.xy;
    vec2 arrowDir = arrow.zw;

    // Distance from current pixel to arrow line segment
    vec2 toPixel = uv - arrowStart;
    float dist = length(toPixel);

    // Weight: closer pixels are more affected (gaussian falloff)
    float radius = 0.15; // arrow influence radius
    float weight = exp(-dist * dist / (2.0 * radius * radius));
    weight *= uArrowStrengths[i];

    // Motion: oscillating along arrow direction
    float phase = uTime * 0.5 + dot(uv, vec2(1.0, 0.3)) * 3.0;
    float motion = sin(phase) * 0.5 + 0.5; // 0..1 oscillation
    // Smooth back-and-forth: sin gives -1..1, multiply by direction
    float wave = sin(uTime * 1.5 + dist * 10.0) * 0.5;

    flowOffset += arrowDir * weight * (motion * 0.02 + wave * 0.01);
    totalWeight += weight;
  }

  // Normalize by total weight
  if (totalWeight > 0.0) {
    flowOffset = flowOffset * uIntensity;
  }

  // Sample image at offset UV
  vec2 sampleUv = clamp(uv + flowOffset, vec2(0.001), vec2(0.999));
  fragColor = texture(uImage, sampleUv);
}`;

interface FlowFieldRendererProps {
  imageUrl: string;
  enabled: boolean;
}

export function FlowFieldRenderer({ imageUrl, enabled }: FlowFieldRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) return;

    // Compile shaders
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Quad
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Texture
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let loaded = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      loaded = true;
    };
    img.src = imageUrl;

    // Uniforms
    const uImage = gl.getUniformLocation(prog, "uImage");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uIntensity = gl.getUniformLocation(prog, "uIntensity");
    const uArrowCount = gl.getUniformLocation(prog, "uArrowCount");
    const uArrows = gl.getUniformLocation(prog, "uArrows");
    const uArrowStrengths = gl.getUniformLocation(prog, "uArrowStrengths");
    const uResolution = gl.getUniformLocation(prog, "uResolution");

    // Resize
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = container.clientWidth * dpr;
      const h = container.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Render loop
    let raf = 0;
    const start = performance.now();
    const render = () => {
      resize();
      const t = (performance.now() - start) / 1000;
      const flowData = (window as any).__aliveFlowField as
        | { arrows: Array<{ x1: number; y1: number; x2: number; y2: number; strength: number }>; intensity: number }
        | null;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uImage, 0);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uIntensity, flowData?.intensity ?? 0);
      gl.uniform2f(uResolution, canvas.width, canvas.height);

      // Pack arrows into uniform arrays
      const arrows = flowData?.arrows ?? [];
      const count = Math.min(arrows.length, 16);
      gl.uniform1i(uArrowCount, count);

      const arrowData: number[] = [];
      const strengthData: number[] = [];
      for (let i = 0; i < 16; i++) {
        if (i < count) {
          const a = arrows[i];
          const dx = a.x2 - a.x1;
          const dy = a.y2 - a.y1;
          const len = Math.hypot(dx, dy) || 1;
          arrowData.push(a.x1, a.y1, dx / len, dy / len);
          strengthData.push(a.strength);
        } else {
          arrowData.push(0, 0, 0, 0);
          strengthData.push(0);
        }
      }
      gl.uniform4fv(uArrows, arrowData);
      gl.uniform1fv(uArrowStrengths, strengthData);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(vbo);
      gl.deleteTexture(tex);
    };
  }, [enabled, imageUrl]);

  if (!enabled) return null;

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-30" style={{ mixBlendMode: "normal" }}>
      <canvas ref={canvasRef} className="h-full w-full" style={{ display: "block" }} />
    </div>
  );
}
