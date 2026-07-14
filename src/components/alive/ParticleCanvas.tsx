"use client";

import { useEffect, useRef } from "react";
import { createNoise3D } from "simplex-noise";

interface ParticleCanvasProps {
  systems: {
    smoke?: boolean;
    fire?: boolean;
    embers?: boolean;
    dust?: boolean;
    snow?: boolean;
    rain?: boolean;
  };
  intensity: number;
  speed: number;
  spawnPoint?: { x: number; y: number };
  mouseInfluence?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  alpha: number;
  type: "smoke" | "fire" | "ember" | "dust" | "snow" | "rain";
}

const noise3D = createNoise3D(() => 0.42);

function spawnParticle(
  particles: Particle[],
  systems: ParticleCanvasProps["systems"],
  sp: { x: number; y: number },
  W: number,
  H: number
) {
  const activeTypes = Object.entries(systems)
    .filter(([, v]) => v)
    .map(([k]) => k as Particle["type"]);
  if (activeTypes.length === 0) return;
  const type = activeTypes[Math.floor(Math.random() * activeTypes.length)];

  // spread spawn across a wider area for fire/embers (campfire line effect)
  const spreadX = (type === "fire" || type === "ember" || type === "smoke") ? 0.3 : 0;
  const px = (sp.x + (Math.random() - 0.5) * spreadX) * W;
  const py = sp.y * H;

  switch (type) {
    case "smoke":
      particles.push({
        x: px + (Math.random() - 0.5) * 40,
        y: py + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 10,
        vy: -20 - Math.random() * 30,
        life: 1, maxLife: 3 + Math.random() * 2,
        size: 15 + Math.random() * 25, hue: 0,
        alpha: 0.15 + Math.random() * 0.15, type,
      });
      break;
    case "fire":
      particles.push({
        x: px + (Math.random() - 0.5) * 50,
        y: py + (Math.random() - 0.5) * 15,
        vx: (Math.random() - 0.5) * 20,
        vy: -50 - Math.random() * 80,
        life: 1, maxLife: 0.8 + Math.random() * 0.6,
        size: 15 + Math.random() * 25, hue: 15 + Math.random() * 35,
        alpha: 0.7 + Math.random() * 0.3, type,
      });
      break;
    case "ember":
      particles.push({
        x: px + (Math.random() - 0.5) * 80, y: py,
        vx: (Math.random() - 0.5) * 25, vy: -40 - Math.random() * 70,
        life: 1, maxLife: 3 + Math.random() * 4,
        size: 2 + Math.random() * 3, hue: 20 + Math.random() * 30,
        alpha: 0.9 + Math.random() * 0.1, type,
      });
      break;
    case "dust":
      particles.push({
        x: Math.random() * W, y: H + 10,
        vx: (Math.random() - 0.5) * 8, vy: -5 - Math.random() * 15,
        life: 1, maxLife: 8 + Math.random() * 8,
        size: 1 + Math.random() * 2, hue: 50,
        alpha: 0.3 + Math.random() * 0.4, type,
      });
      break;
    case "snow":
      particles.push({
        x: Math.random() * W, y: -10,
        vx: (Math.random() - 0.5) * 10, vy: 30 + Math.random() * 40,
        life: 1, maxLife: 10, size: 2 + Math.random() * 4,
        hue: 0, alpha: 0.5 + Math.random() * 0.4, type,
      });
      break;
    case "rain":
      particles.push({
        x: Math.random() * W, y: -20,
        vx: -15, vy: 200 + Math.random() * 200,
        life: 1, maxLife: 3, size: 1, hue: 200,
        alpha: 0.3 + Math.random() * 0.2, type,
      });
      break;
  }
}

function updateParticle(
  part: Particle,
  dt: number,
  t: number,
  speed: number,
  intensity: number,
  W: number,
  H: number,
  mouse: { x: number; y: number },
  mouseInfluence: boolean
) {
  const dtScaled = dt * speed;
  part.life -= dtScaled / part.maxLife;

  const nx = noise3D(part.x * 0.005, part.y * 0.005, t * 0.3);
  const ny = noise3D(part.x * 0.005 + 100, part.y * 0.005 + 100, t * 0.3);

  switch (part.type) {
    case "smoke":
      part.vx += nx * 20 * dtScaled;
      part.vy += ny * 10 * dtScaled - 5 * dtScaled;
      part.vx *= 0.96;
      part.size += 8 * dtScaled;
      part.alpha *= 0.995;
      break;
    case "fire":
      part.vx += nx * 30 * dtScaled;
      part.vy -= 20 * dtScaled;
      part.size *= 0.97;
      part.alpha = part.life * 0.8;
      break;
    case "ember":
      part.vx += nx * 15 * dtScaled;
      part.vy += 5 * dtScaled;
      part.alpha = part.life > 0.3 ? 1 : part.life / 0.3;
      break;
    case "dust":
      part.vx += nx * 8 * dtScaled;
      part.vy += ny * 5 * dtScaled;
      part.alpha = Math.sin(part.life * Math.PI) * 0.5;
      break;
    case "snow":
      part.vx += nx * 12 * dtScaled;
      part.vx *= 0.98;
      break;
    case "rain":
      break;
  }

  if (mouseInfluence && part.type !== "rain") {
    const mx = mouse.x * W;
    const my = mouse.y * H;
    const dx = part.x - mx;
    const dy = part.y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 100 && dist > 0) {
      const force = (1 - dist / 100) * 30 * intensity;
      part.vx += (dx / dist) * force * dtScaled;
      part.vy += (dy / dist) * force * dtScaled;
    }
  }

  part.x += part.vx * dtScaled;
  part.y += part.vy * dtScaled;
}

function drawParticle(ctx: CanvasRenderingContext2D, part: Particle) {
  ctx.save();

  // === LIFE CYCLE: birth fade-in (0..0.15) + death fade-out (0.85..1) ===
  const lifeRatio = 1 - part.life; // 0 at birth, 1 at death
  let lifeAlpha = 1;
  if (lifeRatio < 0.15) {
    lifeAlpha = lifeRatio / 0.15; // fade in over first 15%
  } else if (lifeRatio > 0.85) {
    lifeAlpha = (1 - lifeRatio) / 0.15; // fade out over last 15%
  }
  const finalAlpha = part.alpha * lifeAlpha;
  switch (part.type) {
    case "smoke": {
      const grad = ctx.createRadialGradient(part.x, part.y, 0, part.x, part.y, part.size);
      grad.addColorStop(0, `rgba(180,180,180,${finalAlpha})`);
      grad.addColorStop(1, "rgba(180,180,180,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "fire": {
      ctx.globalCompositeOperation = "screen";
      const grad = ctx.createRadialGradient(part.x, part.y, 0, part.x, part.y, part.size);
      grad.addColorStop(0, `hsla(${part.hue}, 100%, 70%, ${finalAlpha})`);
      grad.addColorStop(0.5, `hsla(${part.hue - 10}, 100%, 50%, ${finalAlpha * 0.6})`);
      grad.addColorStop(1, `hsla(${part.hue - 20}, 100%, 30%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "ember": {
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `hsla(${part.hue}, 100%, 65%, ${finalAlpha})`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `hsla(${part.hue}, 100%, 50%, 1)`;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "dust": {
      ctx.fillStyle = `rgba(255,240,200,${finalAlpha})`;
      ctx.shadowBlur = 3;
      ctx.shadowColor = "rgba(255,240,200,0.8)";
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "snow": {
      ctx.fillStyle = `rgba(255,255,255,${finalAlpha})`;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rain": {
      ctx.strokeStyle = `rgba(180,200,255,${finalAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(part.x, part.y);
      ctx.lineTo(part.x - 4, part.y - 15);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

export function ParticleCanvas({
  systems,
  intensity,
  speed,
  spawnPoint = { x: 0.5, y: 0.85 },
  mouseInfluence = true,
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number>(0);
  const propsRef = useRef({ systems, intensity, speed, spawnPoint });

  useEffect(() => {
    propsRef.current = { systems, intensity, speed, spawnPoint };
  }, [systems, intensity, speed, spawnPoint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onMouse = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    canvas.addEventListener("pointermove", onMouse);

    let lastT = performance.now();
    let spawnAccum = 0;

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const t = now / 1000;

      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const p = propsRef.current;
      const sp = p.spawnPoint;

      ctx.clearRect(0, 0, W, H);

      spawnAccum += dt;
      const spawnRate = 120 * p.intensity * p.speed;
      while (spawnAccum > 1 / spawnRate) {
        spawnAccum -= 1 / spawnRate;
        spawnParticle(particlesRef.current, p.systems, sp, W, H);
      }

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const part = particles[i];
        updateParticle(part, dt, t, p.speed, p.intensity, W, H, mouseRef.current, mouseInfluence);

        if (part.life <= 0 || part.y < -50 || part.y > H + 50 || part.x < -50 || part.x > W + 50) {
          particles.splice(i, 1);
          continue;
        }
        drawParticle(ctx, part);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMouse);
    };
  }, [mouseInfluence]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 20 }}
      aria-hidden
    />
  );
}
