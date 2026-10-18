import type { Background, BackgroundSpec } from './types.ts';
import { decodeImage } from '../assets/project.ts';
import { checkStaticImage } from '../assets/static-image.ts';

export function createBackground(host: HTMLElement, spec: BackgroundSpec): Background {
  host.replaceChildren();
  host.style.background = '';
  if (spec.kind === 'code') return spec.create(host);
  if (spec.kind === 'color') {
    host.style.background = spec.color;
    return {
      async prepare() {},
      async render() {},
      dispose() {
        host.replaceChildren();
        host.style.background = '';
      },
    };
  }
  if (spec.kind === 'image') {
    const image = new Image();
    image.className = 'theme-background-media';
    host.append(image);
    return {
      async prepare() {
        await checkStaticImage(spec.src, '主题背景');
        const loaded = await decodeImage(spec.src);
        image.src = loaded.src;
        await image.decode();
      },
      async render() {},
      dispose() {
        image.remove();
      },
    };
  }
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  // Present a decoded frame on Canvas, so the video compositor cannot advance it.
  const canvas = document.createElement('canvas');
  canvas.className = 'theme-background-media';
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let objectURL: string | null = null;
  return {
    async prepare() {
      // A complete local Blob makes seeking independent of a host's Range support.
      const response = await fetch(spec.src);
      if (!response.ok) throw new Error(`主题背景视频无法读取：${spec.src}`);
      objectURL = URL.createObjectURL(await response.blob());
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => {
          video.onloadeddata = null;
          video.onerror = null;
          resolve();
        };
        video.onerror = () => reject(new Error(`主题背景视频无法加载：${spec.src}`));
        video.src = objectURL!;
        video.load();
      });
      video.pause();
      if (!Number.isFinite(video.duration) || video.duration <= 0)
        throw new Error('主题视频必须有有限的时长');
    },
    async render(timeMs, width, height, pixelScale) {
      // Never play a video in real time. Every visible frame is decoded for the timeline.
      const duration = video.duration;
      if (!Number.isFinite(duration)) return;
      const seconds = spec.loop
        ? (timeMs / 1000) % duration
        : Math.min(timeMs / 1000, Math.max(0, duration - 0.000001));
      if (Math.abs(video.currentTime - seconds) >= 0.000001 || video.seeking) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            video.removeEventListener('seeked', done);
            video.removeEventListener('error', failed);
          };
          const done = () => {
            cleanup();
            resolve();
          };
          const failed = () => {
            cleanup();
            reject(new Error('背景视频逐帧解码失败'));
          };
          video.addEventListener('seeked', done, { once: true });
          video.addEventListener('error', failed, { once: true });
          video.currentTime = seconds;
        });
      }
      const w = Math.max(1, Math.round(width * pixelScale)),
        h = Math.max(1, Math.round(height * pixelScale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const cover = Math.max(w / video.videoWidth, h / video.videoHeight);
      ctx.drawImage(
        video,
        (w - video.videoWidth * cover) / 2,
        (h - video.videoHeight * cover) / 2,
        video.videoWidth * cover,
        video.videoHeight * cover,
      );
    },
    dispose() {
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (objectURL) URL.revokeObjectURL(objectURL);
      objectURL = null;
      canvas.remove();
    },
  };
}
