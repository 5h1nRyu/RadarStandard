import type { Background } from '../types.ts';

/** Optional classic background. To use, set classic.background to { kind: 'code', create: createParticles }. */
export function createParticles(host: HTMLElement): Background {
  const canvas = document.createElement('canvas');
  canvas.className = 'theme-background-media';
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let particles: { x: number; y: number; radius: number; speed: number }[] = [];
  return {
    async prepare(seed) {
      let n = seed >>> 0;
      const random = () => {
        n = (Math.imul(1664525, n) + 1013904223) >>> 0;
        return n / 4294967296;
      };
      particles = Array.from({ length: 60 }, () => ({
        x: random(),
        y: random(),
        radius: 1 + random() * 3,
        speed: 0.005 + random() * 0.02,
      }));
    },
    async render(timeMs, width, height, pixelScale) {
      const w = Math.max(1, Math.round(width * pixelScale)),
        h = Math.max(1, Math.round(height * pixelScale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#a4baff';
      ctx.globalAlpha = 0.25;
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(
          ((p.x + (timeMs / 1000) * p.speed) % 1) * width,
          p.y * height,
          p.radius,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    dispose() {
      particles = [];
      canvas.remove();
    },
  };
}
