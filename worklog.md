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
