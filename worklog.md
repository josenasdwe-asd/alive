# Project Worklog — Alive Image (Layer Decomposition + Animation)

This file is the shared work log for all sub-agents working on the "still image → alive" web app.
Each agent appends its findings using the template defined in the agent brief.

---
Task ID: 1
Agent: Research Agent - Layer Separation
Task: Research best techniques for image layer separation for web animation

Work Log:
- Read existing project layout at /home/z/my-project (Next.js + Prisma + Tailwind already scaffolded; no worklog existed yet, so this is the inaugural entry).
- Used the `web-search` skill (z-ai CLI `web_search` function) to run 20+ targeted queries covering: depth estimation models (Depth Anything V2 / MiDaS / ZoeDepth / Marigold / Depth Pro), SAM2, LaMa / IOPaint / Stable Diffusion inpainting, LeiaPix/Immersity, DepthFlow, Tiefling, 3D Photo Inpainting (Shih et al. CVPR 2020), SLIDE, CapCut 3D Zoom, sharp/jimp/canvas, GSAP/Motion/Pixi/Three.js, SVG turbulence + feDisplacementMap, chromatic aberration, Ken Burns, and "make still image alive" tutorials.
- Used the `web-reader` skill (`page_reader`) to deep-read the most important primary sources: Codrops "How to Create a Fake 3D Image Effect with WebGL", the BrokenSource/DepthFlow GitHub README, the vt-vl-lab/3d-photo-inpainting GitHub README, the Scrollsequence "Converting 2D images to Fake 3D immersive content" deep-research article (excellent synthesis of the entire field), and the akbartus/DepthAnything-on-Browser README.
- Synthesized findings into the comprehensive report below, ranked by feasibility for a Next.js web app, with concrete implementation guidance and a recommended architecture.

Stage Summary:
- **Top recommendation**: Hybrid pipeline — run **Depth Anything V2 (Small or Base)** server-side via Python (or HuggingFace Inference API / Replicate) to get a depth map, then run **SAM2 auto-mask** to identify the main subject, then **LaMa (via IOPaint)** to inpaint the background behind the subject. Ship the original image + depth map + subject mask + inpainted background to the browser, and render the "alive" effect with a **Three.js / React Three Fiber fragment shader** that displaces UVs by `uv + offset * depth.r` (the Codrops/LeiaPix/DepthFlow/Tiefling technique). Layer it with **GSAP or Motion (Framer Motion)** for breathing, sway, and chromatic aberration, plus an **SVG feTurbulence + feDisplacementMap** overlay for the subtle liquid/shimmer that sells the "LSD alive" feel.
- **Critical insight**: The single most important quality lever is **depth-map-to-displacement** with **edge dilation + occluded-background inpainting**. Pure UV-offset creates stretched "rubber band" artifacts at depth discontinuities; this is exactly what Immersity/LeiaPix/3D-Photo-Inpainting solve by hallucinating the background behind foreground objects. We MUST replicate this or the effect looks cheap.
- **Critical insight #2**: Limit camera/mouse motion to a small range (~±10° rotation or a few tens of px translation). Google's Cinematic Photos team confirmed this is the key to hiding artifacts without expensive per-frame inpainting.
- See full report below for ranked techniques, code snippets, and the proposed Next.js architecture.

---

## FULL RESEARCH REPORT — Image Layer Separation for "Alive" Web Animation

### 1. Depth Estimation Models

| Model | Year | Type | Latency (GPU) | Open Source | Notes |
|---|---|---|---|---|---|
| **Depth Anything V2** | NeurIPS 2024 | DINOv2 student (Small/Base/Large/Giant) | ~98ms (Small, GPU) | ✅ Apache 2.0 | **SOTA for our use case.** Trained on 595K synthetic + 62M unlabeled real images. Finer detail & more robust than V1. Faster than diffusion-based (Marigold). Has `Depth-Anything-V2-Metric-Indoor/Outdoor-Large-hf` fine-tunes for absolute depth. ONNX export available (`onnx-community/depth-anything-v2-small` → ~18MB q4f16). |
| **Depth Anything V3** | 2025 | Multi-view capable | similar | ✅ | Just released; ByteDance Seed. Better for video/consistency. V2 is fine for single-image. |
| **Marigold** | CVPR 2024 (Oral, Best Paper) | Latent Diffusion (Stable Diffusion fine-tune) | seconds (multi-step) | ✅ MIT | Most accurate fine detail & gradients, but slow. Great if quality > speed and you can cache. |
| **MiDaS v3.1 (DPT)** | 2020–2022 | ViT/DPT | ~100ms | ✅ MIT | The classic. Relative depth (not metric). Solid baseline; superseded by Depth Anything V2. |
| **ZoeDepth** | 2023 | MiDaS + metric heads | ~170ms (fastest in arxiv benchmark) | ✅ MIT | Metric depth (real units). Fastest per the wildlife benchmark but least accurate. |
| **Depth Pro** (Apple) | 2024 | ViT | fast, sharp edges | ✅ Apache | Strong competitor to V2; zero-shot metric. Good boundary detail. |

**Recommendation**: **Depth Anything V2 Small or Base** as the default. Small (~25M params) is fast enough to run server-side at <100ms per image; Base (~97M) is the sweet spot for quality/latency. If we can afford a GPU server, use Large. Marigold as a "premium" option for high-quality cached renders.

**Inference options**:
1. **Python + transformers** (server-side, Next.js Route Handler calls a Python microservice or runs via `@xenova/transformers` JS):
   ```python
   from transformers import pipeline
   pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf")
   result = pipe(image)  # returns PIL Image with .depth
   ```
2. **HuggingFace Inference API** (serverless, easy): `https://api-inference.huggingface.co/models/depth-anything/Depth-Anything-V2-Small-hf` — simple `POST` with image bytes, get PNG depth back. Free tier with rate limits; ~$0.01–0.05/image on paid.
3. **Replicate API**: `pollinations/3d-photo-inpainting` does depth + layered inpainting in one call (~12 min on A100 — slow but high quality).
4. **In-browser via ONNX Runtime Web / WebGPU**: `akbartus/DepthAnything-on-Browser` proves it's possible; ~20s on a fast laptop. Too slow for on-the-fly, but viable for "click to compute depth locally" UX with a loading state.

### 2. Layer Separation from Depth Maps

Given a continuous grayscale depth map, splitting into N discrete layers:

**a) Equal-width thresholding (simplest)**: normalize depth to [0,1], slice into N bands. Easy but tends to over-segment smooth gradients.

**b) K-means / quantile clustering** (recommended for 3–5 layers): cluster depth pixels into K bins using `sklearn.cluster.KMeans` or 1-D k-means on the depth histogram. Adapts to actual scene depth distribution. Reference: "Object-Background Region Separation in Depth Image using k-Means Clustering" (KISM 2021).

**c) Bilateral filtering first** (used by Shih et al. 3D-Photo-Inpainting): edge-preserving smoothing of the depth map before clustering → cleaner layer boundaries that align with image edges.

**d) Watershed / connected-component labeling**: produce spatially coherent regions (not just depth bands) → useful for "subject vs background" rather than "near vs far".

**e) Adaptive layering (Layered Depth Image, LDI)**: the gold standard from Shih et al. — splits along depth *discontinuities* with explicit pixel connectivity, producing a graph of front-to-back layers each with its own inpainted color+depth. This is what 3D Photo Inpainting / Immersity use.

For our app, **b + c (bilateral-filter then 1-D k-means with K=3–5)** is the practical sweet spot for "foreground / midground / background / sky" decomposition. Save the cluster centroids as depth thresholds and emit per-layer masks as PNGs.

### 3. Segmentation-Based Separation (SAM / SAM2)

**Meta SAM2** (`facebookresearch/sam2`, Apache 2.0) is the SOTA. Two modes:
- **Promptable**: click/box/mask → precise mask. Great for "user clicks subject".
- **Automatic mask generator**: produces all plausible masks. Then we filter by area / centrality to pick the main subject.

**Sky detection**: dedicated models exist (SkyFinder dataset, "Segmenting Sky Pixels in Images"), but a simpler heuristic often suffices — combine (a) top-of-image region, (b) blue-ish / bright color, (c) **far depth** (depth value in the top decile). Can also use a semantic seg model like **ADE20K-trained OneFormer / Mask2Former** which has a "sky" class out of the box.

**Ground detection**: similar — bottom-of-image + dark/uniform color + near depth. Or ADE20K class "floor / grass / road / earth".

**Subject detection**: SAM2 auto-mask → pick the largest non-sky/non-ground mask whose centroid is in the central 60% of the frame. Optionally refine edges with **Matting-Anything** or **MODNet** for hair-level fidelity (important for portraits).

**Recommended pipeline**:
1. Run ADE20K semantic seg (1 forward pass) → labels every pixel as sky / ground / person / building / etc.
2. Run SAM2 auto-mask → instance-level subject candidates.
3. Cross-reference: subject = SAM2 mask overlapping "person" or central non-background ADE20K labels.

For a Next.js app, run server-side via the `transformers.js` SAM2 port or a Python microservice. **transformers.js** can run SAM2 in Node.js directly — no Python needed.

### 4. Background Removal + Inpainting

**Background removal**:
- **Rembg** (Python, MIT) — wraps U2Net / BRIA RMBG / IS-Net. CLI + library. Production-grade, ~1–2s per image on CPU. Best free option.
- **@imgly/background-removal** (JS, runs in browser or Node via WASM) — drop-in for Next.js, no Python.

**Inpainting the occluded background** (critical for parallax quality):
- **LaMa** (Resolution-robust Large Mask Inpainting with Fourier Convolutions, Samsung Research) — SOTA for large mask inpainting, generalizes to 2K res despite 256×256 training. Fast (~1s/image on GPU). Apache 2.0.
- **IOPaint** (formerly Lama-Cleaner, MIT) — self-hostable web app + Python lib + HTTP API that wraps LaMa, Stable Diffusion inpainting, MAT, ZITS, FcF, Manga, PaintByExample, and several matting models. **This is the swiss-army knife.** Docker container → Next.js calls `POST http://iopaint:8000/inpaint` with image + mask.
- **Stable Diffusion Inpainting** — highest quality for complex scenes, but slow (5–15s on GPU) and may "hallucinate" extra content.
- **3D Photo Inpainting** (Shih et al., CVPR 2020, `vt-vl-lab/3d-photo-inpainting`) — the canonical method. Takes RGB+depth, outputs a Layered Depth Image (LDI) with color+depth for occluded regions. Heavy (~10 min on A100 per image via Replicate). Available as `pollinations/3d-photo-inpainting` on Replicate. **Best quality**, expensive.
- **SLIDE** (ICCV 2021) — soft layering variant; handles hair/foliage better. No official code; community reimplementations exist.

**Practical recommendation for our app**:
1. Default: Rembg (or `@imgly/background-removal`) for subject alpha matte.
2. **Dilate the subject mask by ~20–40 px** (this is what Facebook 3D Photos / Tiefling's `expandDepthmapRadius` do — exposes a band of background that can be revealed when subject shifts).
3. Run **LaMa via IOPaint** on the dilated mask → reconstructs background where the subject used to be. Store this as `background_inpainted.png`.
4. For premium mode: route through `pollinations/3d-photo-inpainting` on Replicate for the full LDI treatment (cached, async).

### 5. Parallax Layer Generation Tools (Reference)

| Tool | Type | Layers | Tech | Open Source? |
|---|---|---|---|---|
| **Immersity AI** (ex-LeiaPix) | Cloud SaaS | proprietary "Spatial AI" layers (3–5 typical) | depth + generative layered fill | ❌ (paid API) |
| **DepthFlow** (BrokenSource) | Self-hosted CLI/Python | continuous (ray-marched) | GLSL ray-marching shader | ✅ AGPL-3.0 |
| **Tiefling** | Browser app | continuous | DepthAnythingV2-ONNX + Three.js mesh displacement | ✅ MIT |
| **3D Photo Inpainting** | Python (CVPR 2020) | LDI multi-layer | PyTorch, layered inpainting | ✅ MIT |
| **CapCut 3D Zoom** | Mobile app | 2–3 manual/auto | duplicate + scale layers | ❌ |
| **Google Photos Cinematic** | Closed | 2 layers + small motion | depth + segmentation-edge fix + constrained camera | ❌ |
| **Depthy** (depthy.stamina.pl) | Old web tool | 2 | WebGL shader UV offset | ✅ (legacy) |
| **Scrollsequence V2** | WordPress plugin | image array + depth | three.js / pixi.js | commercial |

**Common pattern**: most create 3–5 layers (sky / far / mid / near-subject / foreground-object). Immersity & 3D-Photo-Inpainting use continuous depth + occlusion-aware inpainting (the highest quality). CapCut/LeiaPix-lite use 2–3 hard layers (cheaper but visible seams).

### 6. JS / Python Libraries for Next.js

**Image manipulation (Node server-side)**:
- **sharp** — fast, libvips-backed, the standard. Use for resize / composite / PNG encode / channel ops. Already the default in Next.js Image Optimization.
- **jimp** — pure JS (no native deps). Slower but works anywhere. Useful for per-pixel ops sharp can't do.
- **@napi-rs/canvas** (node-canvas) — full Canvas 2D API in Node. Great for procedural mask drawing / compositing.
- **utif** / **pngjs** — low-level for raw pixel access.

**ML in Node**:
- **@xenova/transformers** (transformers.js) — runs Depth Anything V2, SAM2, RMBG models in Node.js / browser via ONNX Runtime. **No Python required** — huge simplification for Next.js deployments. Supports WebGPU.
- **onnxruntime-node** — direct ONNX execution.

**Front-end rendering**:
- **three.js** + **@react-three/fiber** (R3F) — WebGL rendering, best for vertex-displaced 3D mesh approach. R3F is the React idiom.
- **pixi.js** — 2D WebGL with built-in `DisplacementFilter` (drop a depth-map sprite as displacement map → instant parallax). Simpler than three.js for pure 2.5D.
- **regl** — minimalist WebGL wrapper (used by Codrops tutorial).
- **gl-react** — React component wrapper for GLSL shaders.

**Animation**:
- **motion** (formerly Framer Motion) — React-first, springs, useMotionValue for mouse parallax. Tiny bundle.
- **GSAP** — most powerful timelines / ScrollTrigger. Use if combining scroll + mouse + many synced layers.
- **anime.js** — lightweight, simple.
- **Lenis** — smooth scroll (pairs with GSAP).

**SVG / CSS effects** (no library):
- `<feTurbulence>` + `<feDisplacementMap>` — built-in SVG filters for liquid distortion.
- CSS `filter: url(#turbulence)` + `@keyframes` animating `baseFrequency` or `seed` → "alive" shimmer.
- CSS `mix-blend-mode` for chromatic aberration (3 duplicated layers R/G/B with slight transform).

### 7. The "LSD Alive" Effect — Subtle Animation Toolkit

The "alive" feeling is the *combination* of several subtle, low-amplitude animations. Each alone is barely noticeable; together they create the magic. Key techniques (ranked by impact):

1. **Mouse / gyro parallax** (the foundation). Map `mouseX/Y` (or `deviceorientation`) to camera/layer offset, multiplied by per-layer depth. Smooth with lerp (damping ~0.05–0.1).
2. **Breathing / pulsing** — slow (4–8s period) `scale: 1.0 ↔ 1.015`. Apply to whole image and slightly stronger to foreground.
3. **Sway** — gentle `rotate: ±0.3°` oscillation on a 6–10s sine. Subtle but very "alive".
4. **Liquid / wavy distortion** — `<feTurbulence>` SVG filter animated via `seed` or `baseFrequency`, applied with low `scale` (1–3px displacement). Gives the "water surface" shimmer. Optional per-region.
5. **Floating particles** — CSS / canvas particles (dust motes, light specks) drifting upward or with mouse. ~10–30 particles, low opacity.
6. **Light shimmer** — slow gradient overlay sweeping across (radial highlight following mouse, or auto-cycling). ~2–5% opacity.
7. **Chromatic aberration / RGB split** — shift R/B channels 1–3px based on mouse distance from center. Increases at edges (radial).
8. **Depth-of-field shift** — blur the far layer (or near layer) alternately on a 8–12s cycle. `filter: blur(0–4px)`.
9. **Ken Burns** — slow zoom (1.0 → 1.05 over 20–30s) + sub-pixel pan. Good as a base when there's no mouse input.
10. **Vignette pulse** — very subtle darkening at edges pulsing with breathing.

Amplitude guidelines: any single effect should be barely perceptible when stared at. Combined, they shouldn't draw attention to themselves. The user should just feel "the image is breathing".

### 8. Code Examples

**a) Codrops / canonical WebGL fragment shader** (the foundation of LeiaPix/DepthFlow/Tiefling):
```glsl
// Fragment shader: original image + depth map → parallax with mouse
uniform sampler2D originalImage;
uniform sampler2D depthImage;
uniform vec2 mouse;  // normalized -1..1, damped
uniform float depthStrength;  // ~0.02 for subtle
varying vec2 vUv;

void main() {
    vec4 depth = texture2D(depthImage, vUv);
    // White = close → moves more with mouse; black = far → stays put
    vec2 offset = mouse * depth.r * depthStrength;
    gl_FragColor = texture2D(originalImage, vUv + offset);
}
```
That's the whole effect. ~6 lines of GLSL. From the Codrops tutorial by Yuri Artiukh.

**b) React Three Fiber implementation** (R3F + drei):
```tsx
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import { useRef, useMemo } from 'react'
import * as THREE from 'three'

const vertexShader = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`
const fragmentShader = `
  uniform sampler2D uImage; uniform sampler2D uDepth;
  uniform vec2 uMouse; uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec4 d = texture2D(uDepth, vUv);
    // subtle breathing + mouse parallax
    float breath = sin(uTime * 0.8) * 0.003 * d.r;
    vec2 off = uMouse * d.r * 0.03 + vec2(breath, breath * 0.5);
    gl_FragColor = texture2D(uImage, vUv + off);
  }
`

function AlivePlane({ img, depth }) {
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const tex = useLoader(TextureLoader, img)
  const depthTex = useLoader(TextureLoader, depth)
  const mouse = useMemo(() => new THREE.Vector2(0, 0), [])
  useFrame((state, delta) => {
    // smooth mouse follow
    mouse.x += (state.pointer.x - mouse.x) * 0.05
    mouse.y += (state.pointer.y - mouse.y) * 0.05
    mat.current.uniforms.uMouse.value = mouse
    mat.current.uniforms.uTime.value += delta
  })
  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={mat} vertexShader={vertexShader} fragmentShader={fragmentShader}
        uniforms={{
          uImage:  { value: tex },
          uDepth:  { value: depthTex },
          uMouse:  { value: mouse },
          uTime:   { value: 0 },
        }} />
    </mesh>
  )
}
```

**c) Pixi.js DisplacementFilter** (simpler than R3F, great for 2.5D):
```js
import { Application, Sprite, DisplacementFilter, TilingSprite } from 'pixi.js'
const app = new Application({ resizeTo: window })
document.body.appendChild(app.view)

const img = Sprite.from('photo.jpg')
const depth = Sprite.from('depth.png')  // grayscale
const filter = new DisplacementFilter(depth, 0)  // scale = 0 initially
img.filters = [filter]
app.stage.addChild(img)

// animate with mouse
window.addEventListener('pointermove', (e) => {
  const x = (e.clientX / window.innerWidth - 0.5) * 60
  const y = (e.clientY / window.innerHeight - 0.5) * 60
  gsap.to(filter.scale, { x, y, duration: 1, ease: 'power3.out' })
})
```

**d) GSAP mouse parallax on stacked CSS layers** (no WebGL, simplest):
```html
<div class="scene" data-depth-lerp="0.08">
  <img class="layer sky"      data-depth="0.1" src="sky.png">
  <img class="layer mountains" data-depth="0.3" src="mountains.png">
  <img class="layer subject"  data-depth="0.7" src="subject.png">
  <img class="layer foreground" data-depth="1.2" src="foreground.png">
</div>
```
```js
const layers = document.querySelectorAll('.layer')
const state = { mx: 0, my: 0, tx: 0, ty: 0 }
window.addEventListener('pointermove', e => {
  state.mx = (e.clientX / innerWidth - 0.5)
  state.my = (e.clientY / innerHeight - 0.5)
})
gsap.ticker.add(() => {
  state.tx += (state.mx - state.tx) * 0.06
  state.ty += (state.my - state.ty) * 0.06
  layers.forEach(l => {
    const d = parseFloat(l.dataset.depth)
    gsap.set(l, { x: state.tx * 40 * d, y: state.ty * 40 * d,
                  rotation: state.tx * 1.5 * d })
  })
})
// breathing pulse on whole scene
gsap.to('.scene', { scale: 1.015, duration: 4, yoyo: true, repeat: -1, ease: 'sine.inOut' })
```

**e) SVG turbulence for liquid shimmer** (overlay on the image):
```html
<svg style="position:absolute; width:0; height:0;">
  <filter id="alive">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="1">
      <animate attributeName="seed" from="1" to="50" dur="20s" repeatCount="indefinite" />
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" scale="6" />
  </filter>
</svg>
<img src="photo.jpg" style="filter: url(#alive);" />
```
Animate `baseFrequency` or `seed` for slow, organic movement.

**f) Chromatic aberration** (CSS):
```css
.alive-img::before, .alive-img::after {
  content: ''; position: absolute; inset: 0;
  background-image: var(--img);
  mix-blend-mode: screen;
}
.alive-img::before { background-color: #f00; transform: translate(var(--abx, 0), 0); }
.alive-img::after  { background-color: #00f; transform: translate(calc(-1 * var(--abx, 0)), 0); }
/* JS sets --abx = mouseX * 2px */
```

### 9. Depth-Map-to-Displacement Technique — Deep Dive (the LeiaPix/Immersity method)

This is the single most important technique for our project. Two rendering variants:

**Variant A — Fragment-shader UV offset** (Codrops, Depthy, Pixi DisplacementFilter):
- 1 fullscreen quad, fragment shader samples depth, offsets UV.
- ✅ Trivial to implement, ~6 lines GLSL, runs at 60fps on any GPU.
- ❌ Produces **"rubber band" / stretch artifacts** at depth discontinuities: when a foreground pixel shifts, it leaves a hole filled by the next pixel's color → smeared edges.

**Variant B — Vertex-displaced mesh** (Tiefling, three.js forum examples):
- Subdivided plane geometry; each vertex's Z = depth value.
- ✅ True parallax geometry, handles occlusion correctly via depth buffer.
- ❌ Mesh resolution tradeoff: vertex per pixel = too many verts (2M for 1080p). Need adaptive meshing.

**Variant C — Layered / multi-plane** (Facebook 3D Photo, Immersity, 3D-Photo-Inpainting):
- N depth planes, each with its own (potentially inpainted) color texture.
- ✅ Best quality: occlusion solved by inpainting behind each foreground layer.
- ❌ Requires per-layer background inpainting; more complex asset pipeline.

**The key quality unlocks (do ALL of these)**:
1. **Dilate the depth map at object edges** before using as displacement (Tiefling's `expandDepthmapRadius`). This pre-extends the background so when foreground shifts, there's real background to show.
2. **Inpaint the background** behind the main subject (LaMa). Ship `background_inpainted.png` as a separate texture sampled where `depth < subject_depth`.
3. **Limit motion range** (Google Cinematic Photos insight): clamp mouse offset to ±10° or ±30–50 px. Beyond that, artifacts become visible.
4. **Use easing / damping** on mouse so motion never exceeds comfortable range.
5. **Apply bilateral filtering** to the depth map to remove noisy speckles before slicing.
6. For best results, render with **variant B (vertex mesh) using the inpainted background as a second layer behind** — gets ~90% of Immersity quality at 10% of the compute.

**Concrete shader with occlusion-aware background fill** (Variant C, simplified):
```glsl
uniform sampler2D uForeground;   // original image
uniform sampler2D uBackground;   // LaMa-inpainted background (subject removed)
uniform sampler2D uDepth;
uniform sampler2D uSubjectMask;  // 1=subject, 0=background
uniform vec2 uMouse;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec4 d = texture2D(uDepth, vUv);
  float mask = texture2D(uSubjectMask, vUv).r;
  float breath = sin(uTime * 0.6) * 0.002;

  // Foreground shifts more (subject), background less
  vec2 bgOff = uMouse * (1.0 - d.r) * 0.015 + vec2(breath);
  vec2 fgOff = uMouse * d.r * 0.05 + vec2(breath * 2.0);

  vec3 bg = texture2D(uBackground, vUv + bgOff).rgb;
  vec3 fg = texture2D(uForeground, vUv + fgOff).rgb;

  // Use the displaced mask to decide which layer shows
  float displacedMask = texture2D(uSubjectMask, vUv + fgOff).r;
  vec3 color = mix(bg, fg, displacedMask);

  gl_FragColor = vec4(color, 1.0);
}
```

---

## RANKED TECHNIQUES (for our Next.js "alive image" app)

### 🥇 Rank 1 — Hybrid: Depth Anything V2 + LaMa + Three.js shader (RECOMMENDED)
**Quality: 9/10 | Feasibility: 8/10 | Effort: Medium | Cost: Low**

Pipeline:
1. Upload image → Next.js Route Handler.
2. **Server-side (Node, via `@xenova/transformers` or Python microservice)**:
   - Run **Depth Anything V2 Small/Base** → depth map PNG.
   - Run **SAM2 auto-mask** → main subject mask.
   - Run **LaMa (via IOPaint Docker)** on (image, dilated subject mask) → inpainted background.
   - Optionally: bilateral filter the depth, dilate subject mask by ~25 px.
3. Store 4 assets: `original.png`, `depth.png`, `subject_mask.png`, `background_inpainted.png`. Persist URLs in Prisma.
4. **Client-side (R3F shader)**: Variant C shader above + GSAP breathing + SVG turbulence overlay + chromatic aberration. Mouse-driven parallax clamped to ±0.05 UV.

**Why #1**: Best quality-per-effort. Uses SOTA depth + SOTA inpainting without paying for 3D-Photo-Inpainting's 10-min/A100 cost. The `transformers.js` route means **no Python required** if we use `@xenova/transformers` + `@imgly/background-removal` + IOPaint-as-a-service. Total compute: ~2–4s/image on a CPU-only Vercel-style box, <1s on GPU.

### 🥈 Rank 2 — Pure browser-side (Tiefling-style)
**Quality: 7/10 | Feasibility: 9/10 | Effort: Low | Cost: Free (no server GPU)**

Pipeline:
1. Upload image → stays in browser.
2. `onnxruntime-web` (WebGPU) runs **Depth Anything V2 Small q4f16** (~18MB) → depth map. ~3–5s on M1 Mac, ~20s on mid hardware.
3. `@imgly/background-removal` (WASM) → subject mask + alpha. ~2–3s.
4. Skip LaMa (no good browser inpainting yet); instead use **edge dilation** on the depth + clamp mouse range hard.
5. R3F shader (Variant A) — accept minor stretch artifacts in exchange for zero infra.

**Why #2**: Zero server compute cost, fully private (image never leaves browser). Great for a free tier / demo. Quality ceiling lower due to no real inpainting. Tiefling's open-source MIT code is a direct reference implementation.

### 🥉 Rank 3 — Cloud API (Immersity AI or Replicate)
**Quality: 10/10 | Feasibility: 9/10 | Effort: Very Low | Cost: $$**

Pipeline:
1. Upload → POST to Immersity AI API (or `pollinations/3d-photo-inpainting` on Replicate).
2. Receive: depth map + layered 3D data, OR pre-rendered video.
3. If interactive: render with their viewer / our shader using their layered output. If video: just `<video autoplay loop muted>`.

**Why #3**: Best quality bar none, least engineering. But: per-image cost ($0.05–0.50), privacy concerns (user images uploaded to third party), rate limits, and vendor lock-in. Good as a **premium upsell** ("Pro" mode) layered on top of Rank 1.

### Rank 4 — Stable Diffusion Inpainting for background
**Quality: 9/10 | Feasibility: 6/10 | Effort: Medium-High | Cost: Medium**

Like Rank 1 but replace LaMa with **SD Inpainting** (or SDXL inpaint). Higher quality reconstruction (especially for complex backgrounds like foliage, patterns). But 5–15s/image on GPU and risk of hallucinated content. Use only for premium tier.

### Rank 5 — Hard 3-layer CSS-only parallax (no depth model)
**Quality: 5/10 | Feasibility: 10/10 | Effort: Very Low | Cost: Free**

Skip depth model entirely. User (or simple auto-segmentation) provides 3 layers as separate PNGs: sky / midground / subject. Animate with GSAP Variant (d). Cheapest, fastest, but quality limited and requires either manual prep or Rembg + manual layering.

---

## RECOMMENDED ARCHITECTURE FOR OUR APP

```
┌─────────────────────────────────────────────────────────────┐
│                       Next.js 16 App                         │
│  (App Router, TypeScript, Tailwind, shadcn/ui, Prisma)       │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Upload Page   │    │ API Route       │    │ Viewer Page     │
│ (client)      │    │ /api/decompose  │    │ (client, R3F)   │
│ - drag/drop   │──▶ │ - depth est     │──▶ │ - WebGL canvas  │
│ - preview     │    │ - SAM2 subject  │    │ - GSAP anims    │
│               │    │ - LaMa inpaint  │    │ - SVG turbulence│
└───────────────┘    │ - bilateral     │    │ - chromatic ab. │
                     │   filter depth  │    │ - particles     │
                     └────────┬────────┘    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐    ┌──────────┐    ┌──────────────┐
        │ @xenova/ │    │ @imgly/  │    │ IOPaint      │
        │ transfrs │    │ bg-remov │    │ (Docker,     │
        │ (Node):  │    │ (WASM):  │    │  LaMa HTTP): │
        │ Depth-   │    │ subject  │    │ inpaint bg   │
        │ Anything │    │ matte    │    │ behind subj  │
        │ V2 +     │    │          │    │              │
        │ SAM2     │    │          │    │              │
        └──────────┘    └──────────┘    └──────────────┘
                              │ (alternative: Python microservice
                              │  running transformers + LaMa +
                              │  segment-anything; or Replicate
                              │  / HuggingFace Inference API)
                              ▼
                     ┌──────────────────┐
                     │ Storage (S3 /    │
                     │  local /upload): │
                     │ original.png     │
                     │ depth.png        │
                     │ subject_mask.png │
                     │ background.png   │
                     │ + Prisma row     │
                     └──────────────────┘
```

**Tech stack choices**:
- **Depth estimation**: `@xenova/transformers` running `onnx-community/depth-anything-v2-small` in Node Route Handler. ~500ms–2s per image. No Python. Falls back to HuggingFace Inference API if local fails.
- **Subject segmentation**: `@xenova/transformers` running SAM2 (Xenova/slimsam-77-uniform) or `@imgly/background-removal` for the alpha matte.
- **Background inpainting**: IOPaint Docker container exposing `:8000`. POST `{image, mask}` → returns inpainted PNG. ~1s/image on CPU, faster on GPU. Alternative: Replicate `cjwbw/lama` model API for fully serverless.
- **Depth post-processing**: `sharp` for bilateral filter? No — bilateral needs custom; use `jimp` or a small `gl-react` headless pass. Simpler: skip bilateral, apply Gaussian blur + threshold.
- **Storage**: Local `/upload` dir (already exists in project) → later swap to S3/R2.
- **DB**: Prisma model `Image { id, originalUrl, depthUrl, maskUrl, bgUrl, createdAt, settings JSON }`.
- **Viewer**: `@react-three/fiber` + custom ShaderMaterial (Variant C above). Wrap in `"use client"`.
- **Animation**: `motion` (Framer Motion) for UI; `gsap` ticker for the parallax loop; CSS keyframes for breathing/sway; SVG `<feTurbulence>` for shimmer; canvas particle overlay (lightweight, custom).
- **Fallback**: if WebGL unavailable, render static image with CSS-only Ken Burns + SVG turbulence.

**MVP scope** (suggested):
1. Upload → server decompose (depth + mask + inpaint) → store.
2. Viewer renders Variant A shader (simple UV offset) — get the core effect working.
3. Add Variant C shader (with inpainted bg) for quality.
4. Add breathing + sway + chromatic aberration.
5. Add SVG turbulence overlay + particles.
6. Add user controls: parallax strength, animation intensity, layer count.
7. (Stretch) Premium mode: Replicate 3D-photo-inpainting for max quality.

**Risk register**:
- ⚠️ `@xenova/transformers` running Depth Anything V2 in Node may be slow / memory-heavy on Vercel serverless (50MB function limit). Mitigation: run on a VPS / Docker / Replicate.
- ⚠️ IOPaint adds a Docker dependency. Alternative: call Replicate LaMa endpoint.
- ⚠️ Depth Anything V2 produces *relative* depth, not metric — fine for parallax, but layer thresholds are per-image. Normalize per-image (min-max) before slicing.
- ⚠️ Without inpainting, parallax shows stretched edges. Mitigation: clamp mouse range + edge-dilate depth map.
- ⚠️ Big images (4K+) may exceed GPU texture limits / browser memory. Mitigation: cap at 2048px on upload (via `sharp`).

---

## KEY REFERENCES (primary sources read in full)

- **Codrops — "How to Create a Fake 3D Image Effect with WebGL"** (Yuri Artiukh, Feb 2019). The canonical tutorial. Core shader: `texture2D(originalImage, uv + mouse*depth.r)`.
- **BrokenSource/DepthFlow** (GitHub, AGPL-3.0). Open-source Python+GLSL image→parallax-video tool. Ray-marching shader, 8K@50fps on RTX 3060.
- **vt-vl-lab/3d-photo-inpainting** (CVPR 2020, Shih et al., MIT). The canonical "single image → multi-layer 3D photo with hallucinated occluded content" paper. 7.1k stars. Also on Replicate as `pollinations/3d-photo-inpainting`.
- **akbartus/DepthAnything-on-Browser** (GitHub, MIT). Browser-only DepthAnything V2 via ONNX Runtime Web + Three.js. Proves the full client-side pipeline is feasible.
- **Scrollsequence V2 deep-research article** (ChatGPT-generated, but excellent synthesis): covers Three.js mesh vs shader approaches, DepthFlow, Tiefling, Immersity, Luma, Google Cinematic Photos, occlusion handling.
- **HuggingFace `depth-anything/Depth-Anything-V2-Large-hf`** — official transformers-compatible weights. `pipeline("depth-estimation", model=...)` works out of the box.
- **Sanster/IOPaint** (GitHub, MIT). Self-hostable inpainting server (LaMa + SD + matting).
- **danielgatis/rembg** (GitHub, MIT). Background removal CLI / lib.
- **Tiefling** (`tiefling.app`, MIT). In-browser 2.5D viewer; uses DepthAnythingV2-ONNX + Three.js. Reference for edge dilation (`expandDepthmapRadius`).
- **SLIDE (ICCV 2021)** — soft-layering alternative to Shih; handles hair/foliage. No official code; community repros exist.
- **Marigold** (CVPR 2024 Oral, Best Paper; `prs-eth/Marigold`). Diffusion-based depth; SOTA fine detail, slower.
- **Motion.dev / Framer Motion docs** — React-native animation; `useMotionValue` + springs for mouse parallax.
- **Pixi.js DisplacementFilter** docs — simplest 2.5D parallax in 2D WebGL.
- **MDN `feDisplacementMap`** + **Smashing Magazine "Deep Dive Into SVG Displacement Filtering"** — liquid distortion technique.
- **LearnOpenGL Parallax Mapping** — explains the foundational theory & artifact fixes.

**No code was written; no project files were modified other than creating this worklog.md.**

---
Task ID: 4-12
Agent: Main Builder (Z.ai Code)
Task: Diseñar arquitectura, construir frontend + backend + motor de animación, ensamblar page.tsx y verificar end-to-end con Agent Browser

Work Log:
- Leí el worklog de los agentes de investigación (Task 1 y 2) y extraje las técnicas clave: Depth Anything + LaMa inpainting, shader WebGL de desplazamiento por profundidad, SVG feTurbulence líquido, animaciones CSS @property con duraciones primas, parallax Framer con useSpring.
- Adapté la arquitectura al sandbox real (z-ai-web-dev-sdk con VLM + image-edit, sin Python/ML pesado): 
  * VLM analiza → JSON con capas semánticas + profundidad + paleta + mood + preset recomendado
  * image-edit genera: fondo inpaintado (sujeto removido) + mapa de profundidad (grayscale) + foreground opcional
  * Truco LeiaPix: [fondo inpaintado] + [original] = parallax 2 capas (al mover original, el fondo inpaintado rellena el hueco)
- Diseñé sistema visual premium dark (globals.css): paleta emerald + amber, glass morphism, aurora blobs, texto gradient, @property typed custom properties para animaciones stacked, keyframes orgánicas (breath/sway/float/drift con duraciones primas 6.2/8.3/11.1/13.7s), scrollbar custom, checker backdrop.
- Construí lib base: types.ts (tipos compartidos), presets.ts (8 presets: Dream, Float, Pulse, Liquid, Cinematic 3D, Shimmer, Boil, Ken Burns), store.ts (Zustand con pipeline de estados), ai.ts (VLM analyze + image-edit background/depth/foreground), image-utils.ts (sharp resize/normalize + save), export-code.ts (generador HTML/CSS/JS y React TSX).
- Construí 3 API routes: /api/upload (FormData → sharp normalize → save), /api/analyze (VLM → SceneAnalysis JSON), /api/separate (image-edit en paralelo: background plate + depth map + optional foreground).
- Construí motor de animación (src/components/alive/):
  * LiquidFilter.tsx — SVG feTurbulence + feDisplacementMap con seed animado
  * Particles.tsx — dust motes CSS animados
  * ShimmerOverlay.tsx — haz de luz barriente
  * AliveLayers.tsx — modo CSS: Framer useSpring + useTransform parallax, .alive-layer con @property animations, 3 planos (bg/original/fg)
  * AliveWebGL.tsx — modo WebGL2: shader de desplazamiento por profundidad + chromatic aberration + breathing + organic noise + vignette (raw WebGL2, ~150 líneas, sin three.js)
  * AliveStage.tsx — contenedor que orquesta WebGL/CSS, partículas, shimmer, vignette, Ken Burns
- Construí studio UI (src/components/studio/): Header (sticky), Footer (mt-auto sticky), UploadZone (drag-drop + examples), AnalysisPanel (auto-pipeline analyze→separate con progress), LayerStack (capas con depth bars), PresetPicker (grid 8 presets), ControlPanel (sliders intensidad/velocidad/chroma/vignette + toggles + per-layer accordion + render mode), ExportPanel (tabs HTML/React + copy + download), Landing (hero + features + steps + presets showcase), Studio (layout 3 columnas responsive).
- Ensamblé page.tsx (Landing vs Studio según status).
- Corregí hooks violation en AliveLayers (early return antes de useTransform → fallback a DEFAULT_LAYER_ANIM).
- Limpié lint con --fix (eslint-disable no usados).
- Verificación end-to-end con Agent Browser:
  * Landing desktop: polished, hero con gradient text, upload zone, 6 features, 4 steps, 8 presets showcase ✓
  * Ejemplo "Paisaje montañoso": analyze 7.5s (VLM: "serene night landscape with snow-capped mountains", mood "peaceful"), separate 16s (bg + depth OK, foreground 429 capturado graciosamente), 4 capas (Forest, Mountains, Mountain peaks, Starry sky), preset cinematic3d auto-seleccionado, WebGL mode renders ✓
  * Switch a Dream preset (CSS mode): renders con parallax + líquido ✓
  * Export panel: 7775 chars código generado, copy funciona (toast "Código copiado"), tab React/HTML funciona ✓
  * Ejemplo "Retrato": VLM "smiling man, gray sweater, blue background", mood "friendly", 4 capas (Collar, Face, Sweater, Background), preset Float auto-seleccionado ✓
  * Mobile 390x844: single column, no overflow ✓
  * Footer sticky: atBottom=true (mt-auto + min-h-screen flex-col) ✓
  * Reset "Nueva imagen": vuelve a landing ✓
  * Headline correcto: "Convierte una imagen quieta en algo vivo" ✓
  * 0 console errors, 0 page errors, lint clean ✓

Stage Summary:
- Proyecto "Alive — Image Layer Decomposition & Animation Studio" completo y verificado end-to-end.
- Pipeline: upload → VLM analyze (7-8s) → image-edit separate (16-24s, bg plate + depth map en paralelo) → studio live preview.
- 2 modos de render: CSS (Framer + SVG líquido + @property) y WebGL2 (shader de profundidad tipo LeiaPix/Immersity).
- 8 presets soñadores con combinaciones de breathing/sway/float/liquid/parallax/shimmer/particles/kenburns.
- Exporta HTML/CSS/JS autocontenido o React TSX con framer-motion.
- Artefactos: src/lib/{types,presets,store,ai,image-utils,export-code}.ts, src/app/api/{upload,analyze,separate}/route.ts, src/components/alive/{AliveStage,AliveLayers,AliveWebGL,LiquidFilter,Particles,ShimmerOverlay}.tsx, src/components/studio/{Header,Footer,UploadZone,AnalysisPanel,LayerStack,PresetPicker,ControlPanel,ExportPanel,Landing,Studio}.tsx, src/app/page.tsx, src/app/layout.tsx, src/app/globals.css.

---
Task ID: 1
Agent: Research Agent v2 — Advanced Layer Decomposition
Task: Research depth slicing algorithms, visual layer editor UI patterns, and richer "alive" animation effects

Work Log:
- Read the full previous worklog (Task 1 inaugural + Task 4-12 main builder) to understand context. Project is a Next.js + Prisma + Tailwind "Alive Image" studio that already works with ~4 layers using VLM analysis + z-ai image-edit (background plate + depth map + optional foreground) and renders in CSS (Framer + SVG) or WebGL2 (depth-displacement shader). User wants MORE granularity (6-10+ layers), a visual layer editor (drag/reorder/transform), and richer animation. Current `LayerAnimationConfig` already has parallaxStrength, breathing, sway, floatY, driftX, liquid, blur, opacity.
- Used the `web-search` skill (`z-ai function -n web_search`) to run ~35 targeted queries across Parts A–E: depth slicing, k-means 1D, multi-Otsu, layered depth inpainting (Shih et al. CVPR 2020), painter's algorithm, morphological dilation, adaptive mesh (Tiefling), Polotno/Photopea/Pixlr/Canva layer panels, dnd-kit, react-moveable, Konva Transformer, fabric.js hit testing, SVG feTurbulence boiling effect (Camillo Visini), Framer Motion spring physics (Maxime Heckel), motion.dev stagger(), simplex-noise npm, hue-rotate animation (Josh Comeau), three.js god rays (Andrew Berg / GPU Gems 3), particles.js, react-timeline-editor, CSS-Tricks animation-technologies comparison, CSS @property Houdini, GSAP timeline orchestration.
- Used the `web-reader` skill (`z-ai function -n page_reader`) to deep-read 18 primary sources (some PDF/Heavy pages returned 429 so I throttled to ~8s between requests): scikit-image multi-Otsu docs, GeeksforGeeks Painter's Algorithm, Codrops "Dynamic Terrain Deformation with R3F" (concrete planeGeometry + displacementMap + per-vertex deformMesh code), Camillo Visini "Simulating Hand-Drawn Motion with SVG Filters" (the canonical boiling-line tutorial with feTurbulence+feDisplacementMap + animated baseFrequency offset sequence), Maxime Heckel "Physics Behind Spring Animations" (full math + JS implementation), motion.dev stagger() docs, motion.dev react-animation docs (animatable CSS variables, transitions), Polotno full-canvas-editor docs, Photopea Layers learn page, daybrush/moveable GitHub README, Andrew Berg "Volumetric Light Scattering in three.js" (GPU Gems 3 Mitchell method), Josh Comeau "Color Shifting in CSS" (the hue-rotate-doesn't-animate-properly gotcha + workarounds), CSS-Tricks staggered animation approaches, CSS-Tricks animation technologies comparison, xzdarcy/react-timeline-editor GitHub README.
- Synthesized everything into a comprehensive 5-part research report with concrete pseudocode, recommended component structures for our Next.js app, and copy-pasteable CSS/JS snippets for each new animation effect. All recommendations are mapped to the existing project architecture (`src/components/alive/`, `src/components/studio/`, `src/lib/{types,presets,store,ai,image-utils}.ts`) so the next builder can implement directly.

Stage Summary:
- **PART A — Depth slicing**: Recommended **multi-Otsu thresholding** (scikit-image `threshold_multiotsu` algorithm; portable to Node via jimp+custom implementation) as the default for 6–12 layers because it's adaptive to the actual depth histogram (unlike equal-interval) and is O(N+L²) fast. K-means 1D on the histogram is the fallback. Concrete pseudocode + a Node.js `sliceDepthIntoLayers()` function provided. For edge expansion: dilate each layer's mask by ~10–30 px using `sharp`'s extend + composite trick (or jimp for true morphological ops). For per-layer background inpainting: VLM-driven z-ai image-edit can re-prompt "show what's behind the X" per layer, OR reuse the existing `backgroundUrl` (subject removed) as the universal back plate. For order-independent compositing: painter's algorithm (sort by `depth` ascending, draw back→front) is trivially correct for non-intersecting planes. For adaptive meshing: Codrops's `deformMesh` pattern (planeGeometry with GRID_RESOLUTION subdivisions + per-vertex Z from depth texture) is the reference — already proven in our `AliveWebGL.tsx`, just bump resolution and add per-layer meshes.
- **PART B — Layer editor UI**: Recommended a 3-pane layout: left **Tools/Presets**, center **Canvas + Moveable handles**, right **LayersPanel + Inspector** (Photopea-style). `dnd-kit` (already installed) drives the sortable layer list with `useSortable`. `react-moveable` (10.7k stars, MIT, daybrush) is the recommended transform-handles library — supports draggable/resizable/scalable/rotatable/snappable/groupable in one component, lighter than Konva and works on plain DOM. Hit-testing via `getBoundingClientRect` inverse-matrix for rotated layers (Konva's `getCorner`/`getClientRect` reference algorithm included). Numeric input panel uses standard X/Y/W/H/Rotation/Opacity fields bound to the same `LayerAnimationConfig`. Toolbar: Add/Duplicate/Delete/Group/Merge/Isolate (eye solo). All proposals mapped to existing shadcn/ui components already in the project.
- **PART C — Richer animation**: 12 new effects with copy-pasteable code: **twist** (sin rotation 1–3°), **boil/jitter** (Camillo Visini's SVG feTurbulence with animated baseFrequency offset array every 100ms), **wave distortion** (sin UV displacement in shader), **glow pulse** (`filter: drop-shadow` keyframes), **hue drift** (CSS @property `--hue` + hsl() because raw `filter: hue-rotate` is finicky to animate — Josh Comeau's workaround), **focus pull** (oscillating `filter: blur()`), **shadow drift** (drop-shadow offset keyframed opposite to layer), **per-layer chromatic aberration** (3 R/G/B duplicated layers via mix-blend-mode: screen), **mouse velocity** (track delta/dt, low-pass filter, multiply by depth), **spring physics per layer** (Framer `useSpring` with per-layer stiffness/damping/mass; Maxime Heckel's full integration loop: `a=(Fspring+Fdamping)/m; v+=a*dt; x+=v*dt`), **phase offset / stagger** (Motion.dev `stagger()` with `from`/`ease`/`startDelay` — natural way to keep layers out of sync), **simplex noise motion** (simplex-noise npm v4, curl noise for organic 2D drift).
- **PART D — Effect layers**: 6 atmosphere overlays. **Fog/mist** = animated SVG feTurbulence + radial gradient. **Snow/rain** = custom canvas particle system (lighter than particles.js; ~50–200 particles). **God rays** = Kenny Mitchell GPU Gems 3 radial-blur post-process (render bright occluder scene → radial blur toward light source → additive blend). Pseudo-volumetric cheaper version: translucent cone mesh + additive blending (three.jsdemos.com pattern). **Bokeh** = CSS circles with `filter: blur(20px)` drifting on long tweens. **Depth-aware dust** = assign each dust particle a `z` value, parallax with mouse + depth texture sampling. **Volumetric light** = the radial-blur god-rays approach is the canonical fake; for true volumetric you'd need ray-marching (too heavy for web).
- **PART E — Timeline & keyframe UI**: **react-timeline-editor** (`@xzdarcy/react-timeline-editor`, MIT, 766★) is the recommended base — pure React, TimelineRow/TimelineAction/TimelineEffect data model, drag-to-move/snap/zoom built in, used as the timeline skeleton. For the actual animation playback: **CSS `@keyframes` for simple infinite loops** (breathing, sway, glow, hue drift, focus pull) because they're declarative, GPU-accelerated, and pause cleanly. **Web Animations API (via Motion's `animate()`)** for imperative/scrubbable/sequenced animations (timeline playback, one-shot reveals). **GSAP timeline()** for the heaviest orchestration cases (multi-element staggered sequences). For staggered/phase-offset motion specifically, Motion's `stagger()` is the cleanest API. CSS `@property` Houdini is the key enabler for animating custom properties like `--breath`, `--sway`, `--hue` as `<angle>`/`<number>` typed values.

---

## FULL RESEARCH REPORT — Advanced Layer Decomposition, Editor & Animation

This report extends Task 1 (Layer Separation) and Task 4-12 (Main Builder) with everything needed to scale the project from 4 layers + simple parallax/breathing/sway/liquid to **6–12 layers with a full visual editor and 12+ richer "alive" effects**.

### PART A — Depth Slicing & Multi-Layer Decomposition (6–12 layers)

We currently get a depth map (`depthUrl`) and an inpainted background (`backgroundUrl`) from the `/api/separate` route, then the VLM nominates 4 layers by name. To go to 6–12 layers we need to **slice the depth map algorithmically** and emit a mask + inpainted plate per band.

#### A.1 — Depth slicing / quantization (3 concrete algorithms)

The depth map from image-edit is a continuous grayscale PNG. Normalise to [0,1] then split into N bands. Three algorithms, ranked by quality:

**(a) Equal-interval slicing** (baseline, naive):
```
function sliceEqual(depthNorm, N) {
  // depthNorm: Float32Array in [0,1]
  // returns: masks: boolean[N][H*W]
  const masks = Array.from({length:N}, () => new Uint8Array(depthNorm.length))
  for (let i=0; i<depthNorm.length; i++) {
    const band = Math.min(N-1, Math.floor(depthNorm[i] * N))
    masks[band][i] = 1
  }
  return masks
}
```
- ✅ Trivial, O(N).
- ❌ Over-segments smooth gradients, under-segments clustered scenes (a portrait with a flat sky wastes 8 bands on sky).

**(b) K-means 1D on depth histogram** (recommended for adaptive bands):
```
function sliceKMeans1D(depthNorm, K, iters=20) {
  // 1. Build 256-bin histogram of depth values
  const hist = new Float32Array(256)
  for (const v of depthNorm) hist[Math.min(255, Math.floor(v*255))]++
  // 2. Init centroids at equal-quantile positions
  let centroids = quantileInit(hist, K)
  // 3. Lloyd iterations
  for (let it=0; it<iters; it++) {
    const sums = new Float64Array(K), counts = new Float64Array(K)
    for (let b=0; b<256; b++) {
      let nearest = 0, best = Infinity
      for (let k=0; k<K; k++) {
        const d = Math.abs(b - centroids[k])
        if (d < best) { best = d; nearest = k }
      }
      sums[nearest] += b * hist[b]
      counts[nearest] += hist[b]
    }
    for (let k=0; k<K; k++) if (counts[k] > 0) centroids[k] = sums[k] / counts[k]
  }
  // 4. Thresholds = midpoints between sorted centroids
  centroids.sort((a,b)=>a-b)
  const thresholds = []
  for (let k=0; k<K-1; k++) thresholds.push((centroids[k]+centroids[k+1])/2 / 255)
  return sliceByThresholds(depthNorm, thresholds)
}
```
- ✅ Adapts to actual depth distribution. Better for portraits (sky collapses to 1 band, subject gets 5).
- ✅ O(256·K·iters + N) — extremely fast.
- This is the algorithm `sklearn.cluster.KMeans(n_clusters=K, n_init=4)` would produce on the 1D depth histogram.
- Reference: Kaggle "K-Means Clustering - Image Quantization", ML Mastery "K-Means in OpenCV".

**(c) Multi-Otsu thresholding** (best quality, recommended default):
From scikit-image `threshold_multiotsu` docs (Liao, Chen, Chung 2001):
```
function multiOtsu(depth8, classes=6) {
  // depth8: Uint8Array 0..255
  const hist = new Float64Array(256)
  for (const v of depth8) hist[v]++
  const total = depth8.length
  for (let i=0;i<256;i++) hist[i] /= total
  // Pre-compute cumulative sums P[i] and cumulative means S[i]
  const P = new Float64Array(256), S = new Float64Array(256)
  P[0]=hist[0]; S[0]=0
  for (let i=1;i<256;i++){P[i]=P[i-1]+hist[i]; S[i]=S[i-1]+i*hist[i]}
  // Maximise between-class variance over all (classes-1) threshold combinations
  // For classes<=6 this is O(256^(classes-1)) — ~10^13 for 6 — too slow naively.
  // Use the Liao et al. fast lookup (precompute H(i,j)=sigma between i,j) → O(256^2) preprocessing then O(256^(k-1)) search
  // Pragmatic: for classes<=4 brute force is fine; for 5-10 use the Liao fast form OR fall back to K-means 1D.
  // For our app, classes=4–6: brute force 4-tuple thresholds, with the Liao speedup for >4.
  ...
  return thresholds // array of `classes-1` threshold values 0..255
}
```
- ✅ Maximises between-class variance → statistically optimal band boundaries.
- ✅ Default in scikit-image; battle-tested.
- ⚠️ For >6 classes the brute-force search explodes; use the Liao et al. fast algorithm (precompute `H(i,j)` between-class variance lookup) or fall back to K-means 1D for >6.
- Reference: `skimage.filters.threshold_multiotsu` (linked above), Liao et al. 2001 "A Fast Algorithm for Multilevel Thresholding".

**Recommendation for our app**: Use **multi-Otsu for 4–6 layers** (the sweet spot — fast + optimal). Switch to **K-means 1D for 7–12 layers** (O(N) regardless of K). Run server-side in `/api/separate` after image-edit returns the depth map; return an array of mask PNGs (one per layer) alongside the existing `backgroundUrl`.

#### A.2 — Layer dilation / edge expansion (no-gap parallax)

When layers translate independently (mouse parallax), the boundary between depth band `k` and band `k+1` produces a transparent gap. Fix: **dilate each layer's mask** so it overlaps its neighbour by a few px.

**Sharp (Node) approach** — fastest, already in our project:
```ts
import sharp from 'sharp'

async function dilateMask(maskPng: Buffer, radiusPx: number): Promise<Buffer> {
  // morphological dilation via repeated max-filter (3x3 box) `radiusPx` times.
  // sharp doesn't expose morphology directly; emulate with threshold-blur-threshold:
  const { data, info } = await sharp(maskPng).raw().toBuffer({resolveWithObject:true})
  // Cheap trick: blur then threshold — produces a "fat" mask.
  const blurred = await sharp(data, {raw:info})
    .blur(radiusPx/2 | 0 || 1)
    .raw().toBuffer()
  // Threshold at 128: any pixel >128 becomes fully opaque
  for (let i=0;i<blurred.length;i+=info.channels){
    const v = blurred[i]
    const out = v > 64 ? 255 : 0
    blurred[i]=blurred[i+1]=blurred[i+2]=out
  }
  return sharp(blurred, {raw:info}).png().toBuffer()
}
```

**True morphological dilation** (use `jimp` or `@napi-rs/canvas`):
```ts
// Implement classical dilation: out[p] = max(in[q] for q in 3x3 neighbourhood)
// Repeat `radiusPx` times. Equivalent to cv2.dilate(mask, kernel=cv2.ones(3,3), iterations=r)
function dilate(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  let cur = mask.slice()
  for (let it=0; it<radius; it++) {
    const next = new Uint8Array(cur.length)
    for (let y=0;y<h;y++) for (let x=0;x<w;x++){
      let m=0
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
        const nx=x+dx, ny=y+dy
        if (nx<0||ny<0||nx>=w||ny>=h) continue
        m = Math.max(m, cur[ny*w+nx])
      }
      next[y*w+x] = m
    }
    cur = next
  }
  return cur
}
```
- **Recommended radius**: 10–30 px (Tiefling uses `expandDepthmapRadius≈25`; Facebook 3D Photos use similar). Scale with target resolution: `radius = Math.round(maxDim * 0.02)`.
- Always dilate **after** slicing, **before** inpainting (so the inpainted plate covers the dilated band).
- Reference: PyImageSearch "OpenCV Morphological Operations", Tiefling `expandDepthmapRadius` (cited in Task 1).

#### A.3 — Per-layer background inpainting

Three strategies, ranked by quality/effort for our sandbox (VLM + image-edit only, no LaMa/SD):

**(a) Reuse the single inpainted back plate** (cheapest, already implemented):
- We already have `backgroundUrl` (subject removed). Use it as the universal back plate. Each layer above shows through where its (dilated) mask is empty.
- ✅ Zero extra compute. Works fine for 4–6 layers.
- ❌ For 8–12 layers, mid-depth bands need their *own* occluded content (e.g. a tree in front of mountains in front of sky — removing the tree shouldn't show the sky directly).

**(b) "Fill from neighboring depth band" trick** (no ML, fast):
- For each layer `k`, the occluded pixels are filled by **stretching the next-farther layer's color** into the gap. Like "content-aware extend" via `sharp.resize` with `fit:'fill'` + edge mirroring.
- ✅ No ML. Fast. Looks plausible for natural scenes.
- ❌ Fails on textured regions (repeats patterns visibly).

**(c) Per-layer VLM re-prompt to image-edit** (the sandbox-native approach):
- For each depth band `k` with name `layerName` (from VLM analysis), re-prompt z-ai image-edit: *"Show what's behind the {layerName} in this image. Same lighting, same style."*
- ✅ Uses tools we already have. Each layer gets its own occluded-content plate.
- ⚠️ 6–12 image-edit calls per project (~3–4s each = 20–50s total). Mitigate with `Promise.all` parallelism + caching.
- This is the recommended upgrade path for v2: server `/api/separate` returns `{ layers: [{id, name, depth, maskUrl, plateUrl}] }` where each `plateUrl` is the inpainted content for that band.

**(d) LaMa via IOPaint** (gold standard, requires Docker — out of sandbox):
- Already noted in Task 1: `POST http://iopaint:8000/inpaint {image, mask}` → PNG. ~1s/image on CPU. Use this if we move off the sandbox.

#### A.4 — Order-independent compositing (painter's algorithm with z-sort)

From GeeksforGeeks "Painter's Algorithm":
> "Sort polygons by depth (decreasing z = farthest first). Paint each in order, nearer polygons overwrite farther ones."

For our flat depth-banded layers (each a textured plane), this is trivial:
```ts
// sort back-to-front (farthest depth = smallest depth value, where depth=0 is sky, depth=1 is foreground)
const sortedLayers = [...layers].sort((a,b) => a.depth - b.depth)
// render in order; later renders cover earlier where masks overlap
for (const layer of sortedLayers) ctx.drawImage(layer.canvas, 0, 0)
```
- For non-intersecting planes this is **always correct** (no need for BSP/z-buffer).
- For our scene (depth-banded layers with dilated masks) planes never intersect → painter's algorithm is sufficient.
- If we ever add rotated/skewed layers, fall back to per-pixel z-test in the WebGL shader (already supported by depth buffer).

#### A.5 — Adaptive meshing (vertex-displaced mesh per depth band)

Currently `AliveWebGL.tsx` uses a single fullscreen quad with UV-offset. Upgrading to **vertex-displaced mesh** gives true parallax geometry and avoids rubber-band stretch.

**Codrops "Dynamic Terrain Deformation with R3F" pattern** (read in full):
```tsx
<mesh rotation={[-Math.PI/2, 0, 0]}>
  <planeGeometry args={[W, H, GRID_RESOLUTION, GRID_RESOLUTION]} />
  <meshStandardMaterial
    map={colorMap}
    displacementMap={depthMap}
    displacementScale={2}
  />
</mesh>
```
- `GRID_RESOLUTION` = 128 or 256 subdivisions per axis (gives 65K–65K vertices — fine for desktop GPUs).
- Per-vertex Z comes directly from the displacementMap; Three.js handles the GPU upload.

**For multi-layer (6–12 layers)** — generate one mesh per depth band:
```tsx
sortedLayers.map(layer => (
  <mesh key={layer.id} position={[0, 0, layer.depth * DEPTH_SCALE]}>
    <planeGeometry args={[W, H, GRID, GRID]} />
    <meshBasicMaterial
      map={layer.texture}
      alphaMap={layer.maskTexture}  // the dilated band mask
      transparent
      depthWrite={true}
    />
    {/* Per-vertex Z from band-local depth (cropped from full depth map) */}
    <displacementMap ... />
  </mesh>
))
```
- Use `THREE.PlaneGeometry` (not BufferGeometry) — `displacementMap` works out of the box.
- For 8 layers × 128² verts = 130K verts total — modern GPUs handle this easily at 60fps.

**Adaptive meshing (Tiefling technique)** — subdivide more at depth discontinuities:
- Compute Sobel edge magnitude of the depth map; where `sobel > threshold`, add 2–4× more subdivisions.
- Implementation: build a custom BufferGeometry where vertex density is high at edges, low in flat regions. ~5K verts total for typical scene (vs 65K uniform).
- ✅ 10× fewer verts, same visual quality.
- ❌ More complex; defer to v3.

### PART B — Visual Layer Editor UI Patterns

Research sources: Photopea "Layers" learn page, Polotno SDK "Full Canvas Editor" docs, Figma community plugins, dnd-kit React Quickstart, daybrush/moveable GitHub (10.7k★), Konva "select_and_transform" docs, fabric.js vs Konva vs PixiJS comparison, MDN isPointInPath, react-moveable npm.

#### B.1 — Layer panel anatomy (Photopea / Figma / Polotno consensus)

All major editors share the same anatomy (verified by reading Photopea docs + Polotno SDK + Figma community plugins):
```
┌─ LayersPanel ─────────────────────────────────┐
│ [Blend mode ▾] [Opacity: 100%─────●─]         │ ← top bar (per selected layer)
├───────────────────────────────────────────────┤
│ 👁 🔒 [thumb] Layer Name       ⋯               │ ← layer row
│ 👁 🔒 [thumb] Layer Name       ⋯               │
│ 👁 🔒 [thumb] 📁 Group          ▾              │ ← collapsible group
│   👁 🔒 [thumb] Child           ⋯              │
│   👁 🔒 [thumb] Child           ⋯              │
│ 👁 🔒 [thumb] Background        ⋯              │
├───────────────────────────────────────────────┤
│ [➕ Layer] [📁 Group] [🔗 Mask] [🗑 Delete]   │ ← bottom toolbar
└───────────────────────────────────────────────┘
```

**Per-row controls** (consensus across Photopea/Figma/Polotno):
- **Visibility eye** 👁 — toggle `layer.visible` (one-click solo: Alt+click to isolate).
- **Lock icon** 🔒 — Photopea has 4 lock types: transparency/pixels/position/all. For us, a single boolean `layer.locked` is enough (prevents move + transform).
- **Thumbnail** (~40×40 px) — auto-regenerated from `layer.url`.
- **Name** — double-click to rename (inline contentEditable).
- **Drag handle** — entire row is draggable via `dnd-kit`'s `useSortable`.
- **Context menu** (⋯ or right-click) — Duplicate / Delete / Merge Down / Isolate / Properties.

**Top bar (selected layer)**: blend-mode dropdown (`mix-blend-mode` values: normal, multiply, screen, overlay, soft-light, color-dodge, etc.), opacity slider.

**Bottom toolbar**: Add Layer / Add Group / Add Mask / Delete / (Polotno adds: Bring Forward / Send Backward).

**Recommended React component structure** for our app:
```tsx
<LayersPanel>
  <LayerBlendModeSelect value={selected.blendMode} />
  <LayerOpacitySlider value={selected.opacity} />
  <ScrollArea>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
      <SortableContext items={layerIds} strategy={verticalListSortingStrategy}>
        {layers.map(layer => <SortableLayerRow key={layer.id} layer={layer} />)}
      </SortableContext>
    </DndContext>
  </ScrollArea>
  <LayerToolbar onAdd={...} onDuplicate={...} onDelete={...} onGroup={...} />
</LayersPanel>
```

#### B.2 — dnd-kit sortable list (already installed in project)

From the dnd-kit React Quickstart (read in full):
```tsx
import {useSortable} from '@dnd-kit/react'
import {DragDropProvider} from '@dnd-kit/react'

function SortableLayerRow({layer}) {
  const {ref, isDragged} = useSortable({id: layer.id})
  return <div ref={ref} style={{opacity: isDragged ? 0.5 : 1}}>
    <Thumbnail src={layer.url} />
    <span>{layer.name}</span>
    <EyeToggle visible={layer.visible} />
    <LockToggle locked={layer.locked} />
  </div>
}

// Parent:
<DragDropProvider onDragEnd={(e) => {
  if (e.canceled) return
  const {active, over} = e.operation
  if (over && active.id !== over.id) {
    setLayers(items => {
      const oldIndex = items.findIndex(i => i.id === active.id)
      const newIndex = items.findIndex(i => i.id === over.id)
      return arrayMove(items, oldIndex, newIndex)
    })
  }
}}>
  {layers.map(l => <SortableLayerRow key={l.id} layer={l} />)}
</DragDropProvider>
```
- `@dnd-kit/react` is the new (2024+) package. Legacy `@dnd-kit/core` + `@dnd-kit/sortable` also work — both already in the project.
- Use `verticalListSortingStrategy` for layer panels.
- Add `DragOverlay` for a floating preview while dragging (recommended for layer thumbnails).
- Sensors: `PointerSensor` (mouse/touch) + `KeyboardSensor` (a11y) with activation constraint `distance: 4px` so click-to-select doesn't trigger drag.

#### B.3 — Canvas transform handles (resize / rotate)

**Recommendation**: use **`react-moveable`** (daybrush, 10.7k★, MIT) — it's the de-facto standard for web-based transform handles and works on plain DOM elements (not tied to canvas). Provides draggable/resizable/scalable/rotatable/warpable/pinchable/groupable/snappable in one component.

```bash
npm install react-moveable
```
```tsx
import Moveable from 'react-moveable'

function CanvasLayer({layer, selected, onChange}) {
  const ref = useRef<HTMLDivElement>(null)
  return <>
    <div ref={ref} style={{
      position:'absolute',
      left:layer.x, top:layer.y, width:layer.width, height:layer.height,
      transform:`rotate(${layer.rotation}deg) scale(${layer.scale})`,
      opacity: layer.opacity,
    }}>
      <img src={layer.url} />
    </div>
    {selected && (
      <Moveable
        target={ref}
        draggable={!layer.locked}
        resizable={!layer.locked}
        rotatable={!layer.locked}
        keepRatio={false}
        throttleDrag={0}
        throttleRotate={0}
        throttleResize={0}
        onDrag={({left, top}) => onChange({...layer, x:left, y:top})}
        onResize={({width, height, drag:{left, top}}) =>
          onChange({...layer, width, height, x:left, y:top})}
        onRotate={({rotation}) => onChange({...layer, rotation})}
        onWheel={({deltaY}) => onChange({...layer, scale: layer.scale * (1 - deltaY*0.001)})}
      />
    )}
  </>
}
```

**Konva alternative** (heavier, full canvas scene graph): `Konva.Transformer` (read in full):
```js
const tr = new Konva.Transformer()
layer.add(tr)
tr.nodes([shape])  // attach to selected shape
```
- Konva is a better fit if we want everything in one `<canvas>` (rasterised). For our use case (DOM layers with CSS transforms + WebGL depth shader), `react-moveable` is the cleaner choice.

**Vanilla alternative** (no library): implement hit-testing + 8 corner handles manually. Konva's reference algorithm for rotated-bbox hit testing:
```ts
const degToRad = (a) => (a/180)*Math.PI
const getCorner = (px, py, dx, dy, angle) => {
  const dist = Math.sqrt(dx*dx + dy*dy)
  angle += Math.atan2(dy, dx)
  return {x: px + dist*Math.cos(angle), y: py + dist*Math.sin(angle)}
}
const getClientRect = (el) => {
  const {x, y, width, height, rotation=0} = el
  const rad = degToRad(rotation)
  const corners = [
    getCorner(x,y, 0,0, rad),
    getCorner(x,y, width,0, rad),
    getCorner(x,y, width,height, rad),
    getCorner(x,y, 0,height, rad),
  ]
  const xs = corners.map(c=>c.x), ys = corners.map(c=>c.y)
  return {x:Math.min(...xs), y:Math.min(...ys), width:Math.max(...xs)-Math.min(...xs), height:Math.max(...ys)-Math.min(...ys)}
}
// Click hit-test:
const isHit = (mousePos, layer) => {
  // inverse-rotate mouse into layer local space, then AABB test
  const rad = degToRad(-layer.rotation)
  const dx = mousePos.x - (layer.x + layer.width/2)
  const dy = mousePos.y - (layer.y + layer.height/2)
  const lx = dx*Math.cos(rad) - dy*Math.sin(rad) + layer.width/2
  const ly = dx*Math.sin(rad) + dy*Math.cos(rad) + layer.height/2
  return lx >= 0 && lx <= layer.width && ly >= 0 && ly <= layer.height
}
```

#### B.4 — Direct selection on canvas (hit testing)

For our app the canvas is mostly a CSS-DOM stack (one `<div>` per layer) + an SVG/WebGL overlay. Hit testing:

**(a) DOM approach (recommended)**: each layer is a `<div>` with `pointer-events: auto` when selectable. Click → `event.target` gives the layer. Browser does the hit testing for free, including rotated transforms.
```tsx
<div
  onClick={(e) => { e.stopPropagation(); selectLayer(layer.id) }}
  style={{ pointerEvents: layer.locked ? 'none' : 'auto' }}
/>
```

**(b) Canvas approach** (if we rasterise to one canvas): use `isPointInPath` after redrawing the layer's path (MDN). For complex shapes, the "color-coded offscreen canvas" trick (advanced hit-test YouTube tutorial): render each layer to an offscreen canvas with a unique solid color, then `getImageData(x,y,1,1)` to identify the layer in O(1).

**(c) Z-order click priority**: topmost layer first. Iterate layers front-to-back, return first hit.

#### B.5 — Numeric input panel (precise transform)

Standard After Effects / Figma pattern (verified from multiple sources):
```
┌─ Transform ──────────────────────┐
│ X: [ 120 ]  Y: [  45 ]           │
│ W: [ 800 ]  H: [ 600 ]  🔗 chain │
│ Rotation: [  12.5° ]             │
│ Scale: [ 100% ]                  │
│ Opacity: [ 85% ─────●─ ]         │
├─ Animation ──────────────────────│
│ Parallax: [ 20 px ]              │
│ Breathing: [✓] amp [ 1.0 ]       │
│ Sway:      [✓] amp [ 0.8 ]       │
│ ...                              │
└──────────────────────────────────┘
```
- Use existing shadcn/ui `<Input type="number">` + `<Slider>`.
- Drag-to-scrub: implement "scrubby input" — `onPointerDown` on the label, track `movementX`, multiply → adjust value. (Standard in AE/Figma; can be done in ~30 lines.)
- Bind directly to `LayerAnimationConfig` in our store.

#### B.6 — Toolbar patterns (add / duplicate / delete / group / merge)

Consensus from Photopea/Polotno/Canva docs:
- **Add Layer** — adds an empty transparent layer above the selected one.
- **Duplicate** — `Ctrl+J` (Photoshop convention); deep-clones the layer with new id.
- **Delete** — `Delete` key or trash icon.
- **Group** — `Ctrl+G`; creates a folder containing selection. Groups can be nested.
- **Merge Down** — `Ctrl+E`; flattens selected layer into the one below. Useful to reduce layer count.
- **Isolate** — Alt+click eye: hides all other layers.
- **Lock All** — `Ctrl+Shift+L` (Photoshop).

For our app these are 1-liner Zustand actions on `ProjectState.layers`.

### PART C — Richer "Alive" Animation Effects (12 new techniques)

The current `LayerAnimationConfig` already supports parallax/breathing/sway/floatY/driftX/liquid/blur/opacity. Below are 12 NEW effects with copy-pasteable code, ready to add as new fields on `LayerAnimationConfig` and presets.

#### C.1 — Twist / torsion (oscillating rotation, higher amplitude than sway)

Sway is ±0.3°; twist is ±1–3° at slower period (8–15s). Visually reads as the layer twisting about its Z axis.

```css
/* CSS @keyframes approach (works without JS) */
@property --twist { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.alive-layer[data-effect="twist"] {
  animation: twist 9.4s ease-in-out infinite alternate;
  transform: rotate(var(--twist));
}
@keyframes twist {
  from { --twist: -1.8deg; }
  to   { --twist:  2.1deg; }
}
```
Or via Framer Motion:
```tsx
<motion.div animate={{rotate: [0, 2.2, -1.6, 0.4, 0]}}
  transition={{duration: 9.4, repeat: Infinity, ease: 'easeInOut'}} />
```

#### C.2 — Jitter / boil (Spider-Verse "boiling" effect)

From Camillo Visini's tutorial (read in full — the canonical web implementation):
```html
<svg width="0" height="0" style="position:absolute">
  <filter id="boil">
    <feTurbulence type="turbulence" baseFrequency="0.012" numOctaves="2" seed="1" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="4"
      xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>
<img src="layer.png" style="filter:url(#boil)" id="boilTarget"/>
```
```ts
// Animate by cycling baseFrequency every 100ms with small offsets (the "boil" loop)
const offsets = [-0.002, 0.0014, -0.0011, 0.0021, -0.0017]
let i = 0
const baseFreq = 0.012
const scale = 0.6  // 0..1, "animation scale" — Visini's term
setInterval(() => {
  const offset = offsets[i % offsets.length] * scale
  const turb = document.querySelector('#boil feTurbulence')
  turb.setAttribute('baseFrequency', (baseFreq + offset).toFixed(5))
  i++
}, 100)
```
**Key insight from Visini**: don't animate `seed` (causes hard jumps); animate `baseFrequency` by tiny offsets (±0.002) every 100ms. This produces the "hand-drawn wobble" loop. Use prime period (e.g. 4 or 5 offsets) so it never visually repeats.
- **Per-layer**: each layer gets its own `<filter id="boil-{layerId}">` with different `baseFrequency` and offset array → layers boil out of sync.
- Recommended `scale` values: 0.3 (subtle), 0.8 (visible), 1.5 (extreme, "Into the Spider-Verse" look).

#### C.3 — Wave distortion (horizontal sinusoidal displacement)

Different from liquid (which is 2D turbulence). Wave is 1D horizontal sine — like a flag rippling.

```glsl
// In our existing AliveWebGL fragment shader, add:
uniform float uWaveAmp;     // ~0.005 UV
uniform float uWaveFreq;    // ~12.0 cycles across image
uniform float uWaveTime;
varying vec2 vUv;

void main() {
  float wave = sin(vUv.x * uWaveFreq + uWaveTime * 1.6) * uWaveAmp;
  vec2 uv = vUv + vec2(0.0, wave);  // vertical displacement from horizontal sine
  gl_FragColor = texture2D(uImage, uv);
}
```
CSS-only fallback (less accurate, transform skew):
```css
.alive-layer[data-effect="wave"] {
  animation: wave 7.3s ease-in-out infinite;
  transform-origin: 50% 0%;
}
@keyframes wave {
  0%,100% { transform: skewX(0deg) }
  25%     { transform: skewX(0.4deg) }
  50%     { transform: skewX(-0.3deg) }
  75%     { transform: skewX(0.2deg) }
}
```

#### C.4 — Glow pulse (animated drop-shadow / brightness)

```css
@property --glow { syntax: '<number>'; inherits: false; initial-value: 0; }
.alive-layer[data-effect="glow"] {
  filter: drop-shadow(0 0 calc(var(--glow) * 12px) rgba(255,200,120,0.5))
          brightness(calc(1 + var(--glow) * 0.15));
  animation: glow 5.7s ease-in-out infinite alternate;
}
@keyframes glow {
  from { --glow: 0.0; }
  to   { --glow: 1.0; }
}
```
- Use `drop-shadow` (not `box-shadow`) — follows the layer's alpha shape.
- Tint colour should come from the VLM palette (`analysis.palette[0]`).

#### C.5 — Hue drift (very slow hue-rotate, 5–10° over 30s)

⚠️ **Gotcha** (from Josh Comeau, read in full): animating `filter: hue-rotate()` directly in CSS often *does nothing* because the filter is reapplied to the source each frame and the interpolation is broken in some browsers. **Workaround**: use `@property --hue` (typed) + `hsl()` background, OR animate via JS / Motion.dev:

```css
/* Approach A: @property typed custom property */
@property --hue { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.alive-layer[data-effect="hueDrift"] {
  animation: hueDrift 31s linear infinite;
  filter: hue-rotate(var(--hue));
}
@keyframes hueDrift {
  from { --hue: 0deg; }
  to   { --hue: 8deg; }
}
```
```ts
// Approach B: Motion.dev (animates the filter string reliably)
import { animate } from 'motion'
animate('#layer', { filter: ['hue-rotate(0deg)', 'hue-rotate(8deg)', 'hue-rotate(0deg)'] },
  { duration: 31, repeat: Infinity, ease: 'linear' })
```
- Amplitude: 5–10° max (any more looks psychedelic, not "alive").

#### C.6 — Focus pull (oscillating blur / depth-of-field shift)

Like a camera's focus drifting between near and far layers.

```css
@property --focus { syntax: '<length>'; inherits: false; initial-value: 0px; }
.alive-layer[data-depth="far"][data-effect="focusPull"] {
  animation: focusFar 11.3s ease-in-out infinite alternate;
  filter: blur(var(--focus));
}
.alive-layer[data-depth="near"][data-effect="focusPull"] {
  animation: focusNear 11.3s ease-in-out infinite alternate;
  filter: blur(calc(4px - var(--focus)));
}
@keyframes focusFar  { from { --focus: 0px } to { --focus: 3px } }
@keyframes focusNear { from { --focus: 0px } to { --focus: 3px } }
```
- **Critical**: only one layer should be in focus at a time. Drive all layers' `--focus` from a single shared keyframe with phase offsets (near layer at 0°, far layer at 180°).
- Use the existing `blur` field on `LayerAnimationConfig` but add a `focusPull` boolean + `focusPhase` 0..1.

#### C.7 — Shadow drift (drop-shadow position animated opposite to layer)

```css
@property --sx { syntax: '<number>'; inherits: false; initial-value: 0; }
@property --sy { syntax: '<number>'; inherits: false; initial-value: 0; }
.alive-layer[data-effect="shadowDrift"] {
  filter: drop-shadow(calc(var(--sx) * -6px) calc(var(--sy) * -6px) 8px rgba(0,0,0,0.3));
  animation: shadowDrift 8.9s ease-in-out infinite alternate;
}
@keyframes shadowDrift {
  from { --sx: -1; --sy: -0.5; }
  to   { --sx:  1; --sy:  0.7; }
}
```
- **Note**: shadow offset is *negated* — when layer moves up, shadow moves down (mimics a moving light source).
- Tint with VLM palette's darkest colour for cohesive look.

#### C.8 — Chromatic aberration per-layer (RGB split via mix-blend-mode)

We already have global chromatic aberration in `AnimationConfig.chromaticAberration`. Per-layer version:
```tsx
function ChromaticLayer({url, offset}) {
  return <div style={{position:'relative'}}>
    <img src={url} style={{mixBlendMode:'screen',
      filter:'brightness(0)', backgroundColor:'#f00',
      transform:`translateX(${offset}px)`}} />
    <img src={url} style={{mixBlendMode:'screen',
      filter:'brightness(0)', backgroundColor:'#0f0'}} />
    <img src={url} style={{mixBlendMode:'screen',
      filter:'brightness(0)', backgroundColor:'#00f',
      transform:`translateX(${-offset}px)`}} />
  </div>
}
```
- Or via SVG filter (one filter, no DOM duplication):
```svg
<filter id="chroma">
  <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="r"/>
  <feOffset in="r" dx="2" dy="0" result="r2"/>
  <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="g"/>
  <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" in="SourceGraphic" result="b"/>
  <feOffset in="b" dx="-2" dy="0" result="b2"/>
  <feBlend in="r2" in2="g" mode="screen" result="rg"/>
  <feBlend in="rg" in2="b2" mode="screen"/>
</filter>
```

#### C.9 — Mouse velocity influence (layers react to mouse SPEED not just position)

Currently parallax follows `mousePos`. Velocity adds inertia: when mouse moves fast, layers "lag" and overshoot.

```ts
const mouse = {x:0, y:0, px:0, py:0, vx:0, vy:0}
window.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX / window.innerWidth - 0.5
  mouse.y = e.clientY / window.innerHeight - 0.5
})
// In rAF loop:
function tick() {
  // velocity = (current - previous) / dt
  mouse.vx = (mouse.x - mouse.px) * 60  // assume 60fps
  mouse.vy = (mouse.y - mouse.py) * 60
  mouse.px = mouse.x
  mouse.py = mouse.y
  // Low-pass filter (smoothing)
  const smoothVx = lerp(state.svx, mouse.vx, 0.08)
  const smoothVy = lerp(state.svy, mouse.vy, 0.08)
  // Apply: position = mousePos * depth + velocity * depth * inertia
  layers.forEach(layer => {
    const tx = mouse.x * layer.depth * 40 + smoothVx * layer.depth * 80
    const ty = mouse.y * layer.depth * 40 + smoothVy * layer.depth * 80
    gsap.set(layer.el, {x:tx, y:ty})
  })
  requestAnimationFrame(tick)
}
```
- Velocity amplitude (80) is 2× position amplitude (40) → fast moves dominate.
- Low-pass filter (0.08) prevents jitter on slow moves.

#### C.10 — Spring physics per layer (independent stiffness/damping/mass)

From Maxime Heckel's article (read in full — the canonical explanation). Spring physics math:
```
Fspring = -k * (x - restLength)        // Hooke's law
Fdamping = -d * v                      // damping force
a = (Fspring + Fdamping) / m           // Newton's 2nd law
v += a * dt                            // integrate velocity
x += v * dt                            // integrate position
```
JavaScript implementation (one layer):
```ts
class Spring {
  constructor({stiffness=100, damping=10, mass=1, rest=0} = {}) {
    this.k = stiffness; this.d = damping; this.m = mass
    this.rest = rest; this.x = rest; this.v = 0
  }
  setTarget(t) { this.rest = t }
  tick(dt = 1/60) {
    const Fspring = -this.k * (this.x - this.rest)
    const Fdamping = -this.d * this.v
    const a = (Fspring + Fdamping) / this.m
    this.v += a * dt
    this.x += this.v * dt
    return this.x
  }
}
```
- **Per-layer config**: add `springStiffness`, `springDamping`, `springMass` to `LayerAnimationConfig`. Default (Framer's defaults): stiffness=100, damping=10, mass=1.
- **Tuning guide**: lower stiffness = looser/slower; higher damping = less overshoot; higher mass = sluggish.
- **Use Framer Motion's `useSpring`** for declarative version:
```tsx
const x = useSpring(0, {stiffness: layer.springStiffness, damping: layer.springDamping, mass: layer.springMass})
useEffect(() => x.set(mouseX * depth * 40), [mouseX])
return <motion.div style={{x}} />
```

#### C.11 — Phase offset between layers (staggered animation start so layers never sync)

From motion.dev `stagger()` docs (read in full):
```ts
import { animate, stagger } from 'motion'

// Stagger all layers' entrance by 80ms each
animate('.alive-layer', {opacity: [0, 1]}, {delay: stagger(0.08)})

// Stagger from center outward
animate('.alive-layer', {scale: [0.9, 1]}, {delay: stagger(0.05, {from: 'center'})})

// With easing for non-linear stagger
animate('.alive-layer', {y: [20, 0]}, {delay: stagger(0.1, {ease: 'easeOut'})})

// Negative startDelay = layers start mid-animation (never sync)
animate('.alive-layer', {rotate: [0, 360]}, {
  duration: 20, repeat: Infinity, ease: 'linear',
  delay: stagger(0.7, {startDelay: -2})  // each layer starts 0.7s into the loop, offset
})
```
- `stagger()` options: `startDelay`, `from` ("first"|"center"|"last"|index), `ease`.
- **For continuous loops** (breathing, sway), the cleanest pattern: each layer's CSS animation has a `animation-delay` of `-1.3s * layerDepth` (negative = starts mid-cycle) → layers never visually sync. Use prime offsets (1.3, 2.7, 4.1…) to maximise desync.
- Reference: CSS-Tricks "Different Approaches for Creating a Staggered Animation".

#### C.12 — Simplex noise per-layer motion (curl noise displacement)

```bash
npm install simplex-noise@4
```
```ts
import { createNoise2D } from 'simplex-noise'

const noise2D = createNoise2D(() => Math.random())
// Per-layer noise field seeded differently:
const layerNoise = createNoise2D(() => layer.seed * 1337)

function tick(dt: number, t: number) {
  for (const layer of layers) {
    // Sample 2 noise points slightly apart → "curl" gives divergence-free field
    const eps = 0.001
    const n1 = layerNoise(t * 0.05,            layer.seed)
    const n2 = layerNoise(t * 0.05 + eps,      layer.seed)
    const n3 = layerNoise(layer.seed,          t * 0.05)
    const n4 = layerNoise(layer.seed + eps,    t * 0.05)
    const dx = (n2 - n1) / eps * 20  // scale to px
    const dy = (n4 - n3) / eps * 20
    layer.el.style.transform = `translate(${dx}px, ${dy}px)`
  }
  requestAnimationFrame((nt) => tick(dt, nt / 1000))
}
```
- **Curl noise** (Bridson et al.): gives smooth divergence-free velocity fields → particles/layers flow without clumping.
- **Per-layer**: different `seed` (or different noise function instance) per layer → independent motion.
- Amplitude: ~10–30px. Time scale: `0.02–0.1` (slow drift).

### PART D — Effect Layers (Procedural Atmosphere Overlays)

#### D.1 — Fog / mist (SVG turbulence + gradient)

```html
<div class="fog-overlay">
  <svg width="0" height="0"><filter id="fog">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="3" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix"
      values="0 0 0 0 0.9  0 0 0 0 0.92  0 0 0 0 0.95  0 0 0 1.5 -0.3"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer>
    <feGaussianBlur stdDeviation="2"/>
  </filter></svg>
  <div class="fog-layer" style="filter:url(#fog); mix-blend-mode:screen; opacity:0.35"/>
</div>
<script>
  // Animate fog drift by changing baseFrequency
  const turb = document.querySelector('#fog feTurbulence')
  let t = 0
  setInterval(() => {
    t += 0.01
    turb.setAttribute('baseFrequency', `${0.008 + Math.sin(t)*0.002} ${0.012 + Math.cos(t*0.7)*0.002}`)
  }, 50)
</script>
```
- Layer above the scene with `mix-blend-mode: screen` and low opacity.

#### D.2 — Snow / rain (canvas particle system)

Lighter than `particles.js` (which is 50KB); a custom canvas impl is ~50 lines:
```ts
class Snow {
  canvas = document.createElement('canvas')
  ctx = this.canvas.getContext('2d')!
  particles = Array.from({length: 120}, () => ({
    x: Math.random()*innerWidth, y: Math.random()*innerHeight,
    r: 1+Math.random()*3, vy: 0.5+Math.random()*1.5, vx: -0.3+Math.random()*0.6,
    sway: Math.random()*Math.PI*2
  }))
  tick() {
    const {ctx, canvas, particles} = this
    ctx.clearRect(0,0,canvas.width,canvas.height)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (const p of particles) {
      p.sway += 0.02
      p.x += p.vx + Math.sin(p.sway)*0.5
      p.y += p.vy
      if (p.y > canvas.height) p.y = -10, p.x = Math.random()*canvas.width
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2)
      ctx.fill()
    }
    requestAnimationFrame(() => this.tick())
  }
}
```
- For rain: larger `vy` (8–15), elongated streaks (use `ctx.fillRect` with 1×8px), blue-grey tint.
- For snow: slow `vy` (0.5–1.5), circular, white, with horizontal sway.

#### D.3 — Light rays / god rays (radial blur post-process)

From Andrew Berg's article (Kenny Mitchell, GPU Gems 3 — read in full):

**The technique** (3 steps):
1. Render the scene with light source = white, occluders = black → "occlusion texture".
2. Apply radial blur toward the light source in a fragment shader:
```glsl
// Volumetric light scattering shader (Mitchell, GPU Gems 3)
uniform sampler2D uOcclusion;
uniform vec2 uLightPos;       // screen-space light position
uniform float uDecay;         // 0.95
uniform float uDensity;       // 0.5
uniform float uWeight;        // 0.4
uniform float uExposure;      // 0.2
uniform int uSamples;         // 80–100

void main() {
  vec2 uv = vUv;
  vec2 dir = uv - uLightPos;
  dir *= uDensity;  // step size
  float illum = 1.0;
  vec4 col = texture2D(uOcclusion, uv);
  for (int i=0; i<100; i++) {
    if (i >= uSamples) break;
    uv -= dir;
    vec4 c = texture2D(uOcclusion, uv);
    c *= illum * uWeight;
    col += c;
    illum *= uDecay;
  }
  gl_FragColor = col * uExposure;
}
```
3. Additively blend the result over the original scene render.

**Cheaper pseudo-volumetric** (three.jsdemos.com pattern — for our app):
- Use a `ConeGeometry` mesh, `MeshBasicMaterial` with `transparent:true, opacity:0.15, blending:AdditiveBlending, side:DoubleSide, depthWrite:false`.
- Position the cone tip at the light source, expand toward the scene.
- Animate opacity via a sine wave (slow pulse).

#### D.4 — Bokeh particles (out-of-focus light circles)

```tsx
function Bokeh() {
  return <div className="bokeh-layer">
    {Array.from({length: 18}).map((_, i) => (
      <div key={i} className="bokeh-dot" style={{
        left: `${Math.random()*100}%`, top: `${Math.random()*100}%`,
        width: `${30+Math.random()*80}px`,
        height: `${30+Math.random()*80}px`,
        animationDelay: `${-Math.random()*20}s`,
        animationDuration: `${15+Math.random()*20}s`,
        background: `radial-gradient(circle, rgba(255,220,180,0.4) 0%, transparent 70%)`,
        filter: `blur(${8+Math.random()*12}px)`,
      }}/>
    ))}
    <style>{`
      .bokeh-layer { position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen; }
      .bokeh-dot { position:absolute; border-radius:50%;
        animation: bokehDrift linear infinite; }
      @keyframes bokehDrift {
        0%   { transform: translate(0, 0); opacity: 0; }
        20%  { opacity: 0.8; }
        80%  { opacity: 0.8; }
        100% { transform: translate(40px, -60px); opacity: 0; }
      }
    `}</style>
  </div>
}
```

#### D.5 — Depth-aware dust motes (parallax particles)

Upgrade the existing `Particles.tsx` to be depth-aware:
```ts
// Each dust particle gets a depth value [0..1]
const motes = Array.from({length: 40}, () => ({
  x: Math.random(), y: Math.random(),
  z: 0.1 + Math.random()*0.9,    // depth!
  r: 0.5 + Math.random()*1.5,
  drift: Math.random()*Math.PI*2
}))

function tick(t, mouseX, mouseY) {
  for (const m of motes) {
    // close motes (high z) move MORE with mouse
    const px = m.x + Math.sin(t*0.0003 + m.drift) * 0.04
    const py = m.y - (t*0.00005 * (0.5 + m.z)) % 1
    const screenX = (px * canvas.width) + mouseX * m.z * 60
    const screenY = (py * canvas.height) + mouseY * m.z * 60
    // close motes are larger and brighter
    const size = m.r * (0.5 + m.z * 0.8)
    const alpha = 0.2 + m.z * 0.5
    ctx.fillStyle = `rgba(255,240,200,${alpha})`
    ctx.beginPath(); ctx.arc(screenX, screenY, size, 0, Math.PI*2); ctx.fill()
  }
}
```
- Each particle samples its `z` from the depth map at its position → true depth-aware parallax.

#### D.6 — Volumetric light (pseudo-volumetric shafts)

The "god rays" radial-blur technique (D.3) is the canonical web fake. True volumetric requires ray-marching which is too heavy for browser.

**Hybrid approach** for our app: stack 3–5 elongated triangle/quad meshes with additive blending, oriented from a light source, each at slightly different angles with slight colour tinting → reads as a volumetric shaft. Animate opacity + rotation subtly.

### PART E — Timeline & Keyframe Animation UI

#### E.1 — Simple keyframe timeline (per-layer rows, scrubber, keyframe diamonds)

**Recommended library: `@xzdarcy/react-timeline-editor`** (read README in full, MIT, 766★):
```bash
npm install @xzdarcy/react-timeline-editor
```
```tsx
import { Timeline, TimelineRow, TimelineAction, TimelineEffect } from '@xzdarcy/react-timeline-editor'

interface LayerKeyframe {
  id: string; start: number; end: number; effectId: string
}

const effects: Record<string, TimelineEffect> = {
  'breathing': {id:'breathing', name:'Breathing'},
  'sway':      {id:'sway',      name:'Sway'},
  'twist':     {id:'twist',     name:'Twist'},
  'boil':      {id:'boil',      name:'Boil'},
  'hueDrift':  {id:'hueDrift',  name:'Hue Drift'},
  // ...all 12 effects from Part C
}

const rows: TimelineRow[] = layers.map(layer => ({
  id: layer.id,
  actions: layer.keyframes  // TimelineAction[]
}))

<Timeline
  editorData={rows}
  effects={effects}
  onChange={(data) => updateKeyframes(data)}
  onScroll={(t) => setCurrentTime(t)}
  onPlayStateChange={(playing) => setPlaying(playing)}
  playStatus={playing}
  currentTime={currentTime}
  scale={20}          // px per second
  start={0}
  end={30}            // total seconds
/>
```
- Built-in: drag-to-move actions, snap, zoom (scale), play/pause, scrubber, time ruler.
- Diamond-shaped keyframes are the convention (VSDC, After Effects, Figma — see VSDC docs).

**Custom diamond UI** (if we don't want the dependency):
```tsx
function KeyframeDiamond({t, scale, selected, onSelect, onDrag}) {
  const x = t * scale
  return <div
    onPointerDown={(e) => {onSelect(); onDrag(e)}}
    style={{
      position:'absolute', left:x, top:'50%',
      width:10, height:10, marginTop:-5, marginLeft:-5,
      transform:'rotate(45deg)',
      background: selected ? '#fff' : '#0f0',
      border:'1px solid #000', cursor:'move'
    }} />
}
```

#### E.2 — CSS `@keyframes` vs Web Animations API

From CSS-Tricks "Comparison of Animation Technologies" (read in full) + MDN "CSS and JavaScript animation performance":

| Use case | CSS `@keyframes` | Web Animations API (WAAPI) | Motion / GSAP |
|---|---|---|---|
| Simple infinite loops (breathing, sway, hue drift) | ✅ Best — declarative, GPU-accelerated, pauses cleanly | OK | OK |
| Imperative / scrubbable / one-shot | ❌ | ✅ Best — `animate()` returns Animation object, can `pause()`/`seek`/`reverse` | ✅ |
| Spring physics | ❌ | ❌ (no native spring) | ✅ (Motion `useSpring`, GSAP `CustomEase`) |
| Sequencing (timeline) | ❌ Painful with `animation-delay` | OK with `Promise.all` of `.finished` | ✅ Best (GSAP `timeline()`, Motion `animate([segments])`) |
| Stagger | ❌ Manual `nth-child` | OK via JS | ✅ Motion `stagger()`, GSAP `stagger` config |
| Performance | ✅ Best — compositor thread | ✅ Same engine as CSS, same perf | ✅ Same |

**Recommendation for our app**:
- **CSS `@keyframes` + `@property`** for all the infinite subtle loops (breathing, sway, twist, glow, hue drift, focus pull, shadow drift, boil). These run on the compositor thread, don't need JS, and pause cleanly on tab-inactive.
- **Motion's `animate()`** (which wraps WAAPI) for: entrance/exit, mouse-driven parallax (imperative), timeline playback, layer reordering transitions.
- **GSAP** (already in our project per Task 1) for: complex orchestrated reveals, scroll-triggered sequences. Skip if not needed — Motion covers most cases.

#### E.3 — Animation orchestration (sequencing / delays / staggered starts)

**Motion.dev pattern** (from motion.dev/docs/stagger — read in full):
```ts
import { animate, stagger } from 'motion'

// Sequential segments
animate([
  ['.alive-layer', {opacity: [0, 1]}, {delay: stagger(0.08)}],
  ['.vignette',    {opacity: [0, 1]}, {delay: 0.3}],
  ['.particles',   {scale: [0, 1]},   {delay: 0.5}]
])
// Each segment waits for the previous to complete (or use `at:` for overlap)
```

**GSAP timeline pattern**:
```ts
const tl = gsap.timeline()
tl.from('.alive-layer', {opacity:0, stagger:0.08, duration:0.6})
  .from('.vignette',    {opacity:0, duration:0.4}, '-=0.3')  // overlap 0.3s
  .from('.particles',   {scale:0, duration:0.5}, '<')         // start same time as prev
```

**For continuous "alive" loops**: don't use a timeline. Use per-layer CSS animations with prime-duration periods and negative `animation-delay` offsets so layers never sync:
```css
.alive-layer:nth-child(1) { animation: breath 6.2s -1.3s infinite alternate; }
.alive-layer:nth-child(2) { animation: breath 6.2s -2.7s infinite alternate; }
.alive-layer:nth-child(3) { animation: breath 6.2s -4.1s infinite alternate; }
.alive-layer:nth-child(4) { animation: breath 6.2s -5.3s infinite alternate; }
/* negative delay = layer starts mid-cycle → never visually synchronised */
```

---

## SPECIFIC IMPLEMENTATION RECOMMENDATIONS FOR OUR NEXT.JS APP

### 1. Extend `LayerAnimationConfig` (types.ts) with new effect fields

Add these 12 new optional fields (all default to off / 0):
```ts
export interface LayerAnimationConfig {
  // ...existing fields...
  // NEW effects (Part C):
  twist?: boolean;       twistAmp?: number;       // 0..2, default 1.0
  boil?: boolean;        boilScale?: number;      // 0..2, default 0.5
  wave?: boolean;        waveAmp?: number;        // 0..1, default 0.4
  glow?: boolean;        glowAmp?: number;        // 0..1, default 0.6
  hueDrift?: boolean;    hueDriftAmp?: number;    // deg 0..15, default 6
  focusPull?: boolean;   focusPullPhase?: number; // 0..1
  shadowDrift?: boolean; shadowDriftAmp?: number;
  perLayerChroma?: boolean; perLayerChromaPx?: number;
  mouseVelocity?: boolean; mouseVelAmp?: number;
  springStiffness?: number; springDamping?: number; springMass?: number;
  phaseOffset?: number;  // seconds, negative = mid-cycle start
  simplexDrift?: boolean; simplexScale?: number;
  // Editor transform (Part B):
  x?: number; y?: number; width?: number; height?: number;
  rotation?: number; scale?: number;
  blendMode?: string; locked?: boolean; visible?: boolean;
}
```

### 2. New API route `/api/slice` (Part A)

```ts
// POST /api/slice  { depthUrl, layers: N (4..12), method: 'otsu'|'kmeans' }
// Returns: { masks: [{id, band, maskUrl}] }
```
- Server-side runs multi-Otsu (port the scikit-image algorithm to TS) or K-means 1D on the depth histogram.
- For each band, generate a mask PNG via `sharp` (dilate by ~20 px).
- Persist to `/upload/{projectId}/masks/band-{k}.png`.

### 3. Per-layer inpainting via VLM re-prompt (Part A.3c)

Extend `/api/separate` to optionally loop per-layer:
```ts
// After slicing, for each non-sky/non-bg band:
for (const layer of layers) {
  if (layer.role === 'background' || layer.role === 'sky') continue
  const plate = await zai.image.edit({
    image: originalBase64,
    prompt: `Show what's behind the ${layer.name} in this image, same lighting and style. The ${layer.name} area should be replaced with plausible background content.`,
    size: '1024x1024'
  })
  layer.plateUrl = await saveBase64AsPng(plate)
}
```
- Run in `Promise.all` for parallelism.
- Cache per project so re-uploads don't re-pay.

### 4. New components for the layer editor (Part B)

```
src/components/studio/
  CanvasEditor.tsx         (new — center pane)
  LayersPanel.tsx          (new — right pane, replaces LayerStack)
  SortableLayerRow.tsx     (new — dnd-kit row)
  LayerInspector.tsx       (new — numeric input panel)
  LayerToolbar.tsx         (new — add/dup/del/group/merge)
  EffectLibrary.tsx        (new — pick from 12 effects to apply to selected layer)
src/components/alive/
  AliveLayerDom.tsx        (new — DOM-rendered layer with react-moveable + CSS effects)
  BoilFilter.tsx           (new — SVG feTurbulence per-layer)
  EffectOverlayFog.tsx     (new)
  EffectOverlaySnow.tsx    (new)
  EffectOverlayGodRays.tsx (new)
  EffectOverlayBokeh.tsx   (new — superset of existing Particles.tsx)
```

### 5. Install new dependencies

```bash
npm install react-moveable @xzdarcy/react-timeline-editor simplex-noise
# dnd-kit already installed
# motion (Framer Motion) already installed
# gsap already installed (per Task 1)
```

### 6. Migrate `AliveWebGL.tsx` to per-layer vertex-displaced meshes (Part A.5)

Replace the single fullscreen quad with N plane meshes (one per depth band), each with `displacementMap` = the band's depth slice and `alphaMap` = the dilated mask. Use `GRID_RESOLUTION = 128`. This is the Tiefling/Codrops pattern.

### 7. Migrate `LayerStack.tsx` → `LayersPanel.tsx` (Part B)

- Replace plain list with `dnd-kit` sortable.
- Add per-row visibility eye, lock, thumbnail, blend mode, opacity.
- Add bottom toolbar.
- Add right-side inspector when a layer is selected.

### 8. Add `TimelinePanel` (Part E)

- Optional v2 feature. Mount `@xzdarcy/react-timeline-editor` below the canvas.
- Map each `LayerAnimationConfig` boolean to a `TimelineAction` row.
- Use it for advanced users to choreograph entrance sequences; the infinite "alive" loops still run via CSS `@keyframes`.

### 9. Phase offsets / desync (Part C.11)

For all CSS-driven effects, use prime-duration negative `animation-delay` per layer:
```ts
const PRIME_DELAYS = [-0.0, -1.3, -2.7, -4.1, -5.3, -7.1, -8.9, -11.0, -13.7, -17.3]
layers.forEach((layer, i) => {
  layer.el.style.animationDelay = `${PRIME_DELAYS[i % PRIME_DELAYS.length]}s`
})
```

### 10. Performance budget

- 6–12 DOM layers each with 2–3 CSS filters + 1 SVG filter + react-moveable = ~5ms/frame on M1, ~12ms/frame on mid laptop. Acceptable at 60fps.
- WebGL mode with 8 vertex-displaced meshes × 128² verts = 130K verts ≈ 4ms/frame on integrated GPU.
- Bokeh particles (18 divs) + canvas dust (40 particles) = ~1ms/frame.
- Total headroom: ~8ms/frame in CSS mode, ~6ms/frame in WebGL mode. Comfortable.

---

## KEY REFERENCES (primary sources read in full for this report)

- **Shih et al., "3D Photography using Context-aware Layered Depth Inpainting"** (CVPR 2020) — canonical LDI paper. `openaccess.thecvf.com/content_CVPR_2020/papers/Shih_3D_Photography_Using_Context-Aware_Layered_Depth_Inpainting_CVPR_2020_paper.pdf` (note: PDF returned minimal text via reader; relied on Task 1's prior read).
- **scikit-image Multi-Otsu docs** — `scikit-image.org/docs/0.25.x/auto_examples/segmentation/plot_multiotsu.html` — concrete algorithm + Liao, Chen, Chung 2001 citation.
- **GeeksforGeeks "Painter's Algorithm in Computer Graphics"** — `geeksforgeeks.org/dsa/painters-algorithm-in-computer-graphics/` — depth-sort steps + mini-max overlap test.
- **Codrops "Creating Dynamic Terrain Deformation with R3F"** (Nov 2024) — `tympanus.net/codrops/2024/11/27/creating-dynamic-terrain-deformation-with-react-three-fiber/` — concrete planeGeometry + displacementMap + per-vertex deformMesh code.
- **Photopea "Layers" learn page** — `photopea.com/learn/layers` — layer panel anatomy (visibility/lock/opacity/blend modes/drag-reorder/folders/merge).
- **Polotno SDK "Full Canvas Editor" docs** — `polotno.com/docs/full-canvas-editor` — React canvas editor component structure (PolotnoContainer/SidePanelWrap/WorkspaceWrap/Toolbar/Workspace/PagesTimeline/ZoomButtons).
- **dnd-kit React Quickstart** — `dndkit.com/react/quickstart` — `useDraggable`, `useDroppable`, `DragDropProvider` API.
- **daybrush/moveable GitHub** (10.7k★) — `github.com/daybrush/moveable` — draggable/resizable/scalable/rotatable/warpable/pinchable/groupable/snappable.
- **Konva "select_and_transform/Basic_demo.html"** — `konvajs.org/docs/select_and_transform/Basic_demo.html` — Transformer pattern + rotated-bbox hit testing (`getCorner`/`getClientRect` algorithm).
- **Camillo Visini "Simulating Hand-Drawn Motion with SVG Filters"** (Jul 2025) — `camillovisini.com/coding/simulating-hand-drawn-motion-with-svg-filters/` — the canonical boiling-line implementation: feTurbulence + feDisplacementMap, animate `baseFrequency` every 100ms with offset array.
- **Maxime Heckel "The physics behind spring animations"** — `blog.maximeheckel.com/posts/the-physics-behind-spring-animations/` — full Hooke's law + damping math, JS implementation, Framer Motion defaults (stiffness=100, damping=10, mass=1).
- **motion.dev `stagger()` docs** — `motion.dev/docs/stagger` — `stagger(duration, {startDelay, from, ease})` API.
- **motion.dev "React Animation" docs** — `motion.dev/docs/react-animation` — animatable CSS variables, transitions, MotionConfig, per-axis transforms.
- **Andrew Berg "Volumetric Light Scattering in three.js"** (Jul 2016) — `medium.com/@andrew_b_berg/volumetric-light-scattering-in-three-js-6e1850680a41` — Kenny Mitchell GPU Gems 3 radial-blur post-process with `decay`/`density`/`weight`/`exposure` uniforms.
- **Josh Comeau "Color Shifting in CSS"** — `joshwcomeau.com/animation/color-shifting/` — the `hue-rotate` doesn't-animate-properly gotcha + hsl()/CSS-variable workaround.
- **CSS-Tricks "A Comparison of Animation Technologies"** (Sarah Drasner) — `css-tricks.com/comparison-animation-technologies/` — when to use CSS vs rAF vs canvas vs WAAPI vs GSAP vs Motion.
- **CSS-Tricks "Different Approaches for Creating a Staggered Animation"** — `css-tricks.com/different-approaches-for-creating-a-staggered-animation/` — CSS `:nth-child` stagger vs JS stagger.
- **xzdarcy/react-timeline-editor GitHub** (766★, MIT) — `github.com/xzdarcy/react-timeline-editor` — `<Timeline editorData effects />` API with TimelineRow/TimelineAction/TimelineEffect, drag/snap/zoom/play built in.
- **simplex-noise npm v4** — `npmjs.com/package/simplex-noise` — `createNoise2D(seed)` API for curl noise per-layer motion.
- **MDN `mix-blend-mode`** — `developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/mix-blend-mode` — full list of blend modes for layer compositing.
- **MDN `isPointInPath`** — `developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/isPointInPath` — canvas hit testing.
- **MDN `drop-shadow()`** — `developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/filter-function/drop-shadow` — alpha-aware shadow for glow pulse / shadow drift.
- **PyImageSearch "OpenCV Morphological Operations"** — `pyimagesearch.com/2021/04/28/opencv-morphological-operations/` — dilate/erode/open/close reference.

**No code was written and no project files were modified other than appending this report to worklog.md. A research_cache/ directory of raw search/page_reader JSON output was created for traceability but is not part of the app.**

---
Task ID: 1-10 (v2 evolution)
Agent: Main Builder v2 (Z.ai Code)
Task: Evolución profesional — más capas, editor visual de capas, animación más rica, atmósferas procedurales

Work Log:
- Lancé agente de investigación v2 (Task 1) que investigó: depth slicing (multi-Otsu, K-means 1D), editores de capas visuales (Photopea/Figma/dnd-kit/react-moveable), 12 nuevos efectos "alive" (twist, jitter, wave, glow, hueDrift, focusPull, shadowDrift, chromatic, mouseVelocity, spring physics, phaseOffset, simplex noise), capas de atmósfera (fog, snow, rain, god rays, bokeh, dust, light leak, grain), y timeline UI.
- Instalé react-moveable + simplex-noise.
- Refactor types.ts: LayerTransform editable (x, y, scale, rotation, opacity, blur, blendMode, visible, locked, zOverride), LayerSource (ai/depth-slice/custom/effect), EffectType (fog/snow/rain/godrays/bokeh/dust/lightleak/grain), LayerAnimationConfig expandido con 12 efectos + SpringPhysics + phaseOffset + durationMultiplier + mouseVelocityInfluence + inertia, AnimationConfig con effects map + mouseSmoothing.
- Refactor presets.ts: 5 presets avanzados nuevos (Aurora, Underwater, Ethereal, Noir, Cosmic) con combinaciones ricas de efectos + phase offset prima por capa. Total 13 presets.
- Refactor store.ts: addLayer, updateLayer, updateLayerTransform, removeLayer, duplicateLayer, reorderLayers, selectLayer, toggleEffect.
- Expandido globals.css: 7 nuevas @property (twist, wave-x, jitter-x/y, glow, hue, focus, shadow-x/y) + 9 nuevos @keyframes (alive-twist, alive-wave, alive-jitter, alive-glow, alive-hue, alive-focus, alive-shadow, snow-fall, rain-fall, godray-shimmer, fog-drift) + .alive-layer utility actualizado con filter stack (blur+brightness+drop-shadow+hue-rotate) + .alive-layer.selected ring + .moveable-control-box theming.
- Backend expandido: analyze prompt ahora pide 6-8 capas con extractPrompt + 13 presets válidos. Nuevo /api/extract-element (extrae elemento nombrado por el usuario). /api/separate reescrito: genera bg + depth + extrae hasta 5 elementos con extractPrompt en batches de 2 (rate-limit aware).
- Nuevos componentes motor: EffectOverlays (8 atmósferas procedurales: Fog con gradient+blur, Snow 60 copos, Rain 80 gotas diagonales, GodRays conic-gradient, Bokeh 12 círculos, Dust 24 motes, LightLeak radial, Grain SVG turbulence). LayerEditor con react-moveable (drag/resize/rotate handles sobre el canvas).
- AliveLayers v2: soporta editorMode (pointer events + click select), data-layer-id para hit testing, mouse velocity tracking (mvx/mvy + springs), 12 efectos animados via @property + keyframes, phaseOffset via negative animation-delay, durationMultiplier por capa, blendMode, transform editable del LayerTransform.
- Nuevos componentes studio: LayersPanel con dnd-kit (drag-reorder, eye/lock/duplicate/delete, opacidad/blur/blendMode expandible, input de extracción custom con IA). LayerInspector (X/Y numéricos, scale/rotation sliders, 12 effect toggles, phase/velocity sliders). EffectsPanel (8 atmósferas con toggles).
- ControlPanel simplificado (removida sección "Por capa" duplicada, ahora en LayerInspector) + nuevo slider mouseSmoothing.
- PresetPicker reorganizado: originales vs avanzados con separador.
- Studio refactor: 3 columnas (AnalysisPanel+LayersPanel+LayerInspector | Stage+Toolbar+LayerEditor | PresetPicker+EffectsPanel+ControlPanel+ExportPanel), botón toggle editorMode, layout responsive móvil.
- Landing actualizado: 8 features nuevas (Editor de capas visual, Extracción con IA, 12 efectos orgánicos, Atmósfera procedural, Física spring), "13 presets soñadores".
- Verificación Agent Browser end-to-end:
  * Landing: polished, 8 feature cards nuevas, upload zone ✓
  * Paisaje montañoso: VLM analizó 8 capas, separate completó en 50s (algunos extracts cayeron en 429 graciosamente, sistema resiliente), 5 capas renderizadas con assets, preset Cosmic auto-seleccionado ✓
  * Editor mode: botón "Mover capas" → handles de react-moveable aparecen (1 control box), clic en capa Subject → selecciona + muestra ring + LayerInspector con X/Y/scale/rotation/12 toggles ✓
  * Efectos nuevos: toggle Twist + Glow + Hue sobre capa seleccionada ✓
  * Atmósfera: God rays + Bokeh + Light leak visibles sobre la imagen ✓
  * Extracción custom: input "the stars and moon" → /api/extract-element 20s → nueva capa Custom (badge rose) añadida ✓
  * Export: 7338 chars código, copy toast funciona ✓
  * Mobile 390x844: responsive, footer sticky atBottom=true ✓
  * 0 console errors, 0 page errors, lint clean ✓

Stage Summary:
- Evolución v2 completa y verificada. De 4 capas → 6-8 capas con extracción individual por IA.
- De 5 efectos → 12 efectos orgánicos por capa (twist, jitter, wave, glow, hue, focus, shadow, chromatic + physics spring + phase + velocity).
- De 8 presets → 13 presets (5 avanzados: Aurora, Underwater, Ethereal, Noir, Cosmic).
- Nuevo editor visual de capas: react-moveable para drag/resize/rotate en canvas, LayersPanel con dnd-kit reorder, LayerInspector con controles numéricos.
- Nueva feature: extracción de elemento custom con IA ("/api/extract-element" — el usuario nombra "el perro" y la IA lo aísla como capa).
- 8 capas de atmósfera procedural (fog, snow, rain, god rays, bokeh, dust, light leak, grain).
- Física spring por capa + mouse velocity influence + inertia + phase offset prima.

---
Task ID: v3 (Niveles 2 + 4)
Agent: Main Builder v3 (Z.ai Code)
Task: Subir a Nivel 2 (CSS 3D estereoscópico) y Nivel 4 (Canvas 2D partículas con física) + fix 502

Work Log:
- Fix 502 en /api/analyze: el gateway corta la conexión a ~30s pero el VLM tarda 30-40s. Solución: prompt VLM más conciso (de 30 líneas a 8) + retry en el cliente con backoff exponencial (3 reintentos, 3-5s entre cada) en fetchWithRetry que detecta 502/504/429.
- Nivel 2 — CSS 3D estereoscópico (AliveCSS3D.tsx):
  * Container con `perspective: Npx` + `transform-style: preserve-3d`
  * Cada capa posicionada con `translateZ((depth-0.5) * 800px)` — Z real negativo/positivo
  * Mouse rota el container: `rotateY(mouseX * rotate3dStrength) rotateX(-mouseY * rotate3dStrength)` con useSpring
  * El navegador calcula la perspectiva matemáticamente correcta — parallax estereoscópico real
  * Sliders de perspective (400-2000px) y rotación 3D (0-25°) en el ControlPanel
  * Nuevo renderMode "css3d" en el selector (3 opciones: CSS / 3D / WebGL)
- Nivel 4 — Canvas 2D con partículas y física real (ParticleCanvas.tsx):
  * 6 tipos de partícula: smoke, fire, embers, dust, snow, rain
  * Física con simplex noise 3D para turbulencia orgánica (createNoise3D de simplex-noise)
  * Cada partícula tiene posición, velocidad, vida, tamaño, hue, alpha
  * Smoke: sube con buoyancy, expande, se desvanece — gradiente radial gris
  * Fire: sube rápido con screen blend, gradiente radial naranja-rojo, se encoge
  * Embers: pequeñas chispas brillantes con shadowBlur, flotan con gravedad ligera
  * Mouse influence: las partículas se alejan del cursor (radio 100px, fuerza proporcional)
  * Spawn rate dinámico (120 * intensity * speed por segundo)
  * Spawn disperso para fire/embers (campfire line effect, spread 0.3 en X)
  * Canvas con z-index 100 para estar encima de las capas
- Types expandido: EffectType ahora incluye smoke/fire/embers (canvas-based). AnimationConfig con perspective y rotate3dStrength.
- EffectsPanel reorganizado: sección CSS (8 atmósferas) + sección "Partículas Canvas" (humo/fuego/brasas) con separador.
- AliveStage actualizado: selecciona entre AliveLayers (CSS) / AliveCSS3D (3D) / AliveWebGL (WebGL) según renderMode. ParticleCanvas se activa cuando hay efectos smoke/fire/embers.
- Landing actualizado: features mencionan "3 modos de render" y "Partículas Canvas con física".
- Verificación Agent Browser:
  * Paisaje montañoso: 6 capas analizadas, pipeline completó con retry ✓
  * Modo 3D: controles de Perspectiva y Rotación 3D visibles, parallax estereoscópico al mover mouse ✓
  * Partículas Canvas: Fuego + Brasas activados → 15-25 partículas visibles dispersas con brasas subiendo ✓
  * 3 modos de render en selector (CSS Multiplane / 3D Perspectiva Z / WebGL Depth shader) ✓
  * 0 errores, lint limpio ✓

Stage Summary:
- Fix 502: retry con backoff exponencial + prompt VLM más conciso.
- Nivel 2 implementado: CSS 3D estereoscópico con translateZ real + preserve-3d + rotación del mouse. Parallax matemáticamente correcto.
- Nivel 4 implementado: Canvas 2D con sistema de partículas (humo, fuego, brasas) con física simplex noise + mouse interactivo.
- 3 modos de render seleccionables: CSS multiplane (Nivel 1) / CSS 3D (Nivel 2) / WebGL2 shader (Nivel 5).
