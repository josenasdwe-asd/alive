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
uniform float uImgAspect;   // image width / height
uniform float uStageAspect; // canvas width / height

// simple hash noise for subtle organic shimmer
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// CRITICAL FIX (C1): remap UV with "cover" semantics so the image fills the stage
// without stretching. Computes the visible UV range and scales offset accordingly.
vec2 coverUv(vec2 uv, float imgA, float stageA) {
  if (imgA <= 0.0 || stageA <= 0.0) return uv;
  float scale;
  vec2 offset;
  if (imgA > stageA) {
    // image is wider than stage — crop horizontally (pillarbox)
    scale = stageA / imgA;
    offset = vec2((1.0 - scale) * 0.5, 0.0);
  } else {
    // image is taller than stage — crop vertically (letterbox)
    scale = imgA / stageA;
    offset = vec2(0.0, (1.0 - scale) * 0.5);
  }
  return uv * scale + offset;
}

void main() {
  // remap UV to cover the stage (prevents stretching on non-square images)
  vec2 imgUv = coverUv(vUv, uImgAspect, uStageAspect);

  vec4 d = texture(uDepth, imgUv);
  float depth = d.r;

  // parallax offset (in cover-UV space — scaled by the cover factor)
  float coverScale = (uImgAspect > uStageAspect) ? (uStageAspect / uImgAspect) : (uImgAspect / uStageAspect);
  vec2 mouseOff = uMouse * depth * 0.07 * uIntensity * coverScale;
  float breath = sin(uTime * 0.6) * 0.004 * uIntensity * (0.5 + depth) * coverScale;
  vec2 offset = mouseOff + vec2(breath, breath * 0.6);

  // CRITICAL FIX (M4): clamp the effective UV to prevent edge smearing
  vec2 sampleUv = clamp(imgUv + offset, vec2(0.001), vec2(0.999));

  // CRITICAL FIX (H2): chromatic aberration — RGB split scaled by depth (more on near objects)
  vec3 color;
  if (uChroma > 0.0) {
    float chromaAmt = uChroma * 0.002 * (0.5 + depth * 0.5);
    float r = texture(uImage, sampleUv + vec2(chromaAmt, 0.0)).r;
    float g = texture(uImage, sampleUv).g;
    float b = texture(uImage, sampleUv - vec2(chromaAmt, 0.0)).b;
    color = vec3(r, g, b);
  } else {
    vec4 imgColor = texture(uImage, sampleUv);
    color = imgColor.rgb;
  }
  float a = texture(uImage, sampleUv).a;

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
    // CRITICAL FIX (C1): aspect-ratio uniforms for cover-UV mapping
    const uImgAspect = gl.getUniformLocation(prog, "uImgAspect");
    const uStageAspect = gl.getUniformLocation(prog, "uStageAspect");

    // track image natural dimensions (set when texture loads)
    let imgAspect = 1.0;

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
        // CRITICAL FIX (C1): capture natural dimensions for aspect-ratio-aware UV mapping
        if (img.naturalWidth && img.naturalHeight) {
          imgAspect = img.naturalWidth / img.naturalHeight;
        }
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
      // CRITICAL FIX (C1): set aspect-ratio uniforms for cover-UV mapping
      gl.uniform1f(uImgAspect, imgAspect);
      gl.uniform1f(uStageAspect, canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 1.0);

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
    </div>
  );
}
