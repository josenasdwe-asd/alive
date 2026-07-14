"use client";

import { useEffect, useRef } from "react";

interface AliveWebGLProps {
  imageUrl: string;
  depthUrl: string;
  intensity: number;
  speed: number;
  chromaticAberration: number;
  vignette: number;
  parallaxEnabled: boolean;
  reducedMotion: boolean;
}

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y; // flip Y for image coords
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uMouse;       // smoothed, -1..1
uniform float uTime;
uniform float uIntensity;
uniform float uChroma;
uniform float uVignette;

// simple hash noise for subtle organic shimmer
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 d = texture(uDepth, vUv);
  float depth = d.r;

  // parallax offset
  vec2 mouseOff = uMouse * depth * 0.07 * uIntensity;
  float breath = sin(uTime * 0.6) * 0.004 * uIntensity * (0.5 + depth);
  vec2 offset = mouseOff + vec2(breath, breath * 0.6);

  // sample image
  vec4 imgColor = texture(uImage, vUv + offset);
  vec3 color = imgColor.rgb;
  float a = imgColor.a;

  // vignette
  if (uVignette > 0.0) {
    vec2 d2 = vUv - 0.5;
    float vig = 1.0 - dot(d2, d2) * (1.4 * uVignette);
    color *= clamp(vig, 0.0, 1.0);
  }

  fragColor = vec4(color, a);
}`;

export function AliveWebGL({
  imageUrl,
  depthUrl,
  intensity,
  speed,
  chromaticAberration,
  vignette,
  parallaxEnabled,
  reducedMotion,
}: AliveWebGLProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // refs for live-updated uniforms (avoid re-creating GL context on prop change)
  const propsRef = useRef({
    intensity,
    speed,
    chromaticAberration,
    vignette,
    parallaxEnabled,
    reducedMotion,
  });
  propsRef.current = {
    intensity,
    speed,
    chromaticAberration,
    vignette,
    parallaxEnabled,
    reducedMotion,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: true,
    });
    if (!gl) {
      console.warn("WebGL2 not available");
      return;
    }

    // compile shaders
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // fullscreen quad
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // uniforms
    const uImage = gl.getUniformLocation(prog, "uImage");
    const uDepth = gl.getUniformLocation(prog, "uDepth");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uIntensity = gl.getUniformLocation(prog, "uIntensity");
    const uChroma = gl.getUniformLocation(prog, "uChroma");
    const uVignette = gl.getUniformLocation(prog, "uVignette");

    // textures
    const makeTex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255])
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    const imageTex = makeTex();
    const depthTex = makeTex();

    // track if textures are loaded to avoid drawing black frames
    let imageLoaded = false;
    let depthLoaded = false;

    const loadTex = (
      url: string,
      tex: WebGLTexture,
      done: () => void
    ) => {
      const img = new Image();
      let cancelled = false;
      img.onload = () => {
        if (cancelled) return;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        done();
      };
      img.onerror = () => {};
      img.src = url;
      return () => { cancelled = true; };
    };

    // load textures
    const cancelImage = loadTex(imageUrl, imageTex, () => { imageLoaded = true; });
    const cancelDepth = loadTex(depthUrl, depthTex, () => { depthLoaded = true; });

    // mouse tracking (smoothed)
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      if (!propsRef.current.parallaxEnabled || propsRef.current.reducedMotion)
        return;
      const rect = container.getBoundingClientRect();
      mouse.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouse.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    const onLeave = () => {
      mouse.tx = 0;
      mouse.ty = 0;
    };
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);

    // resize
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

    // render loop
    let raf = 0;
    let start = performance.now();
    const render = () => {
      resize();
      // smooth mouse
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;

      const p = propsRef.current;
      const t = (performance.now() - start) / 1000;

      gl.clearColor(0, 0, 0, 1); // opaque black background
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imageTex);
      gl.uniform1i(uImage, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, depthTex);
      gl.uniform1i(uDepth, 1);

      gl.uniform2f(
        uMouse,
        p.reducedMotion ? 0 : mouse.x,
        p.reducedMotion ? 0 : mouse.y
      );
      gl.uniform1f(uTime, p.reducedMotion ? 0 : t * p.speed);
      gl.uniform1f(uIntensity, p.intensity);
      gl.uniform1f(uChroma, p.chromaticAberration);
      gl.uniform1f(uVignette, p.vignette);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      cancelImage();
      cancelDepth();
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(vbo);
      gl.deleteTexture(imageTex);
      gl.deleteTexture(depthTex);
    };
  }, [imageUrl, depthUrl]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ display: "block" }}
      />
      {/* fallback: show original image behind canvas while textures load */}
      { }
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full -z-10 object-cover opacity-0"
      />
    </div>
  );
}
