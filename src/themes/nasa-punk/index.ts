import './style.css';
import type { Theme } from '../types.ts';
import { smooth } from '../../model/timeline.ts';
import { COMPONENTS } from '../../model/registry.ts';

export const nasaPunk: Theme = {
  id: 'nasa-punk',
  label: 'NASA 朋克',
  fonts: [],
  background: {
    kind: 'image',
    src: new URL('./textures/equipment.svg', import.meta.url).href,
  },
  radar: {
    font: '"Helvetica Neue", "Arial", "PingFang SC", "Microsoft YaHei", sans-serif',
    mono: '"SFMono-Regular", "Consolas", "Liberation Mono", monospace',
    grid: 'rgba(76,90,104,.28)',
    average: '#4C5A68',
    fill: 'rgba(214,58,44,.07)',
    stroke: '#D63A2C',
    text: '#252824',
    highlight: '#D63A2C',
    labelSize: 24,
    valueSize: 22,
  },
  morphMs: 900,
  animate(component, order, state, target) {
    // Absolute timeline only: paused previews and exported frames stay identical.
    const duration = state.record.playEntranceAnimation === true ? 420 : 220;
    const delay = state.record.playEntranceAnimation === true ? Math.min(order * 24, 168) : 0;
    const p = state.record.noAnimation ? 1 : smooth((state.localMs - delay) / duration);
    const base = COMPONENTS[component.type];
    const s = Math.min(component.width / base.width, component.height / base.height);
    target.style.opacity = String(p);
    target.style.transform = `translateY(${(1 - p) * 10 * s}px)`;
    target.style.filter = '';
  },
};
