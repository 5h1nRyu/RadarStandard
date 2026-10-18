import { DESIGN, type ComponentConfig } from '../model/types.ts';
import type { Stage } from '../app/stage.ts';

interface Callbacks {
  enabled(): boolean;
  selected(id: string | null): void;
  get(id: string): ComponentConfig | undefined;
  update(id: string, patch: Partial<ComponentConfig>, end: boolean): void;
}
const snap = (v: number) => Math.round(v / 10) * 10;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export function bindInteractions(stage: Stage, callbacks: Callbacks): void {
  stage.surface.addEventListener('pointerdown', (event) => {
    if (!callbacks.enabled() || event.button !== 0) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('.component');
    const id = target?.dataset.id;
    if (!target || !id) {
      callbacks.selected(null);
      return;
    }
    const config = callbacks.get(id);
    if (!config) return;
    const initial = { ...config },
      startX = event.clientX,
      startY = event.clientY;
    const resizing = !!(event.target as HTMLElement).closest('[data-resize]');
    const scale = stage.scale;
    callbacks.selected(id);
    event.preventDefault();
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - startX) / scale,
        dy = (e.clientY - startY) / scale;
      const patch = resizing
        ? {
            width: clamp(snap(initial.width + dx), 10, DESIGN.width - initial.x),
            height: clamp(snap(initial.height + dy), 10, DESIGN.height - initial.y),
          }
        : {
            x: clamp(snap(initial.x + dx), 0, DESIGN.width - initial.width),
            y: clamp(snap(initial.y + dy), 0, DESIGN.height - initial.height),
          };
      callbacks.update(id, patch, false);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      callbacks.update(id, {}, true);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end, { once: true });
    target.addEventListener('pointercancel', end, { once: true });
  });
}
export function bindSplitter(splitter: HTMLElement, host: HTMLElement): void {
  function setWidth(width: number): void {
    host.style.setProperty(
      '--sidebar',
      `${Math.min(Math.max(280, width), Math.max(280, window.innerWidth - 240))}px`,
    );
  }
  splitter.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    splitter.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (event: PointerEvent) => setWidth(window.innerWidth - event.clientX);
    const end = () => {
      document.body.classList.remove('resizing');
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', end);
      splitter.removeEventListener('pointercancel', end);
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', end, { once: true });
    splitter.addEventListener('pointercancel', end, { once: true });
  });
  splitter.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const width = parseFloat(getComputedStyle(host).getPropertyValue('--sidebar'));
    setWidth(width + (e.key === 'ArrowLeft' ? 20 : -20));
  });
}
