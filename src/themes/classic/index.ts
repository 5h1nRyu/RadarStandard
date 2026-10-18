import './style.css';
import type { Theme } from '../types.ts';
import { smooth } from '../../model/timeline.ts';

export const classic: Theme = {
  id: 'classic',
  label: '经典玻璃',
  fonts: [],
  // The source repository did not include pic/bg.jpg. This is the original fallback.
  background: { kind: 'color', color: '#0a0a0a' },
  radar: {
    font: '"PingFang SC", "Microsoft YaHei", sans-serif',
    mono: '"Consolas", monospace',
    grid: 'rgba(255,255,255,.20)',
    average: 'rgba(255,74,74,.95)',
    fill: 'rgba(255,255,255,.15)',
    stroke: 'rgba(255,255,255,.90)',
    text: '#fff',
    highlight: '#ffd976',
    labelSize: 26,
    valueSize: 22,
  },
  morphMs: 1200,
  animate(component, order, state, target) {
    let opacity = 1,
      x = 0,
      y = 0,
      scale = 1,
      blur = 0;
    const special = state.record.playEntranceAnimation === true;
    if (special && component.type !== 'verticalProgress') {
      const delay =
        component.type === 'radar' ||
        component.type.includes('Progress') ||
        component.type === 'progress'
          ? 0
          : component.type === 'image' || component.type === 'icon'
            ? 220 + order * 120
            : 500 + order * 120;
      const p = smooth((state.localMs - delay) / 800);
      opacity = p;
      if (component.type !== 'radar' && component.type !== 'progress')
        x = (component.x + component.width / 2 < 960 ? -80 : 80) * (1 - p);
    } else if (
      !state.record.noAnimation &&
      ['image', 'text', 'verticalText', 'ranks', 'rankImages'].includes(component.type)
    ) {
      const p = 1 - (1 - Math.min(1, state.localMs / 380)) ** 3;
      opacity = 0.45 + p * 0.55;
      y = 8 * (1 - p);
      scale = 0.985 + 0.015 * p;
      blur = 1.5 * (1 - p);
    }
    if (
      component.type === 'verticalText' &&
      component.binding.source === 'field' &&
      component.binding.field === 'title' &&
      state.record.title
    ) {
      const p = smooth((state.localMs - 500) / 800);
      opacity = p;
      x = (component.x + component.width / 2 < 960 ? -80 : 80) * (1 - p);
    }
    target.style.opacity = String(opacity);
    target.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    target.style.filter = blur ? `blur(${blur}px)` : '';
  },
};
