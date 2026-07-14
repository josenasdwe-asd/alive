"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "framer-motion";

interface AliveKenBurns3DProps {
  imageUrl: string;
  depthUrl: string;
  backgroundUrl?: string;
  intensity: number;
  speed: number;
  chromaticAberration: number;
  vignette: number;
  parallaxEnabled: boolean;
  reducedMotion: boolean;
  /** scroll progress 0..1 for scroll-driven camera dolly (MotionValue or number) */
  scrollProgress?: MotionValue<number> | number;
}

const GRID_SIZE = 128; // 128x128 = 16K vertices, manageable

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;        // -1..1 grid position
in vec2 aUv;         // 0..1 texture coordinate
out vec2 vUv;

uniform mat4 uProj;
uniform mat4 uView;
uniform sampler2D uDepth;
uniform float uTime;
uniform float uIntensity;
uniform float uScroll;    // 0..1 scroll progress
uniform float uReducedMotion;

void main() {
  vUv = aUv;
  // sample depth at this vertex's UV
  float depth = texture(uDepth, aUv).r;
  // invert: white=near in our depth maps, but for Z we want far=negative
  float z = (depth - 0.5) * -2.0; // -1 (near) .. +1 (far)

  // breathing: subtle scale pulse
  float breath = sin(uTime * 0.6) * 0.01 * uIntensity * (1.0 - uReducedMotion);

  // camera dolly: move towards the scene as scroll progresses
  float dolly = uScroll * 0.8 * uIntensity;

  // vertex position in 3D
  vec3 pos = vec3(aPos * (1.0 + breath), z * 0.5 - dolly);

  gl_Position = uProj * uView * vec4(pos, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform float uTime;
uniform float uChroma;
uniform float uVignette;

void main() {
  // chromatic aberration: sample R/G/B at slightly different UVs based on depth
  float depth = texture(uDepth, vUv).r;
  float chromaAmt = uChroma * 0.002 * (0.5 + depth * 0.5);

  float r = texture(uImage, vUv + vec2(chromaAmt, 0.0)).r;
  float g = texture(uImage, vUv).g;
  float b = texture(uImage, vUv - vec2(chromaAmt, 0.0)).b;
  float a = texture(uImage, vUv).a;

  vec3 color = vec3(r, g, b);

  // subtle organic shimmer
  float shimmer = sin(uTime * 0.3 + vUv.x * 10.0) * 0.005;
  color += shimmer;

  // vignette
  if (uVignette > 0.0) {
    vec2 d = vUv - 0.5;
    float vig = 1.0 - dot(d, d) * (1.4 * uVignette);
    color *= clamp(vig, 0.0, 1.0);
  }

  fragColor = vec4(color, a);
}`;

/**
 * 3D Ken Burns effect with point cloud projection.
 *
 * Architecture (from technical documents):
 * 1. Subdivided plane mesh (128x128 = 16K vertices)
 * 2. Each vertex displaced in Z by depth map value (point cloud projection)
 * 3. Virtual camera moves in Z (dolly) driven by scroll
 * 4. Depth buffer handles occlusion automatically
 * 5. Background plate rendered as second plane behind for disocclusion fill
 *
 * This is "Variant B — Vertex-displaced mesh" which handles occlusion
 * correctly via the depth buffer, unlike fragment shader UV offset.
 */
export function AliveKenBurns3D({
  imageUrl,
  depthUrl,
  backgroundUrl,
  intensity,
  speed,
  chromaticAberration,
  vignette,
  parallaxEnabled,
  reducedMotion,
  scrollProgress = 0,
}: AliveKenBurns3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      alpha: true,
      premultipliedAlpha: false,
    });
    if (!gl) return;

    // compile shaders
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh));
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

    // build subdivided plane geometry
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let y = 0; y <= GRID_SIZE; y++) {
      for (let x = 0; x <= GRID_SIZE; x++) {
        const u = x / GRID_SIZE;
        const v = y / GRID_SIZE;
        positions.push(u * 2 - 1, v * 2 - 1);
        uvs.push(u, 1 - v);
      }
    }
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const i = y * (GRID_SIZE + 1) + x;
        indices.push(i, i + 1, i + GRID_SIZE + 1);
        indices.push(i + 1, i + GRID_SIZE + 2, i + GRID_SIZE + 1);
      }
    }

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
    const aUv = gl.getAttribLocation(prog, "aUv");
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(indices),
      gl.STATIC_DRAW
    );

    // uniforms
    const uProj = gl.getUniformLocation(prog, "uProj");
    const uView = gl.getUniformLocation(prog, "uView");
    const uDepth = gl.getUniformLocation(prog, "uDepth");
    const uImage = gl.getUniformLocation(prog, "uImage");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uIntensity = gl.getUniformLocation(prog, "uIntensity");
    const uScroll = gl.getUniformLocation(prog, "uScroll");
    const uReducedMotion = gl.getUniformLocation(prog, "uReducedMotion");
    const uChroma = gl.getUniformLocation(prog, "uChroma");
    const uVignette = gl.getUniformLocation(prog, "uVignette");

    // textures
    const makeTex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
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


    const loadTex = (url: string, tex: WebGLTexture, done: () => void) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        done();
      };
      img.onerror = () => console.warn("tex load failed", url);
      img.src = url;
    };

    // mouse for subtle parallax tilt
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

    // projection matrix (perspective)
    const proj = perspective(45, canvas.width / canvas.height, 0.01, 10);

    // render loop
    let raf = 0;
    let start = performance.now();
    const render = () => {
      resize();
      const p = propsRef.current;
      const t = (performance.now() - start) / 1000;

      // smooth mouse
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      // read scroll progress from MotionValue (defensive — may be undefined or a number)
      const scrollVal =
        scrollProgress && typeof scrollProgress.get === "function"
          ? scrollProgress.get()
          : typeof scrollProgress === "number"
            ? scrollProgress
            : 0;

      // view matrix: camera at Z = 1.5, looking at origin
      // scroll dolly moves camera forward
      // BUG FIX: intensity is already applied in the shader dolly — don't double-apply
      const camZ = 1.5 - scrollVal * 1.0;
      const tiltX = p.reducedMotion ? 0 : mouse.y * 0.05;
      const tiltY = p.reducedMotion ? 0 : mouse.x * 0.05;
      const view = lookAt(
        [0, 0, camZ],
        [0, 0, 0],
        [0, 1, 0],
        tiltX,
        tiltY
      );

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imageTex);
      gl.uniform1i(uImage, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, depthTex);
      gl.uniform1i(uDepth, 1);

      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.uniform1f(uTime, p.reducedMotion ? 0 : t * p.speed);
      gl.uniform1f(uIntensity, p.intensity);
      gl.uniform1f(uScroll, scrollVal);
      gl.uniform1f(uReducedMotion, p.reducedMotion ? 1 : 0);
      gl.uniform1f(uChroma, p.chromaticAberration);
      gl.uniform1f(uVignette, p.vignette);

      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(uvBuf);
      gl.deleteBuffer(idxBuf);
      gl.deleteTexture(imageTex);
      gl.deleteTexture(depthTex);
    };
  }, [imageUrl, depthUrl, backgroundUrl]);

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

// ===== Matrix utilities (column-major, WebGL convention) =====

function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fovy * Math.PI) / 180 / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAt(
  eye: number[],
  center: number[],
  up: number[],
  tiltX: number,
  tiltY: number
): Float32Array {
  // apply tilt
  const ex = eye[0] + tiltY * 0.3;
  const ey = eye[1] - tiltX * 0.3;
  const ez = eye[2];

  const z0 = ex - center[0];
  const z1 = ey - center[1];
  const z2 = ez - center[2];
  let len = Math.hypot(z0, z1, z2);
  const zx = z0 / len, zy = z1 / len, zz = z2 / len;

  const x0 = up[1] * zz - up[2] * zy;
  const x1 = up[2] * zx - up[0] * zz;
  const x2 = up[0] * zy - up[1] * zx;
  len = Math.hypot(x0, x1, x2);
  const xx = x0 / len, xy = x1 / len, xz = x2 / len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez),
    1,
  ]);
}
