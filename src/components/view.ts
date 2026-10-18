import { COMPONENTS } from '../model/registry.ts';
import type { AssetSource, ComponentConfig, Dataset, TimelineState } from '../model/types.ts';
import { scoresAt } from '../model/timeline.ts';
import type { Theme } from '../themes/types.ts';
import { drawRadar, formatValue } from './radar.ts';

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = cls;
  parent.append(el);
  return el;
}
export class ComponentView {
  readonly el = document.createElement('div');
  readonly face: HTMLElement;
  private content: HTMLElement;
  private text?: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private image?: HTMLImageElement;
  private fill?: HTMLElement;
  private title?: HTMLElement;
  private cells: {
    label: HTMLElement;
    value: HTMLElement;
    total?: HTMLElement;
    image?: HTMLImageElement;
  }[] = [];
  private contentKey = '';
  constructor(
    readonly id: string,
    type: ComponentConfig['type'],
  ) {
    this.el.className = 'component';
    this.el.dataset.id = id;
    this.el.dataset.type = type;
    this.el.tabIndex = 0;
    this.el.setAttribute('aria-label', COMPONENTS[type].label);
    this.face = node('div', 'component-face', this.el);
    this.content = node('div', 'component-content', this.face);
    if (type === 'radar') this.canvas = node('canvas', 'radar-canvas', this.content);
    if (type === 'text' || type === 'verticalText')
      this.text = node('div', 'component-text', this.content);
    if (type === 'image' || type === 'icon') {
      this.image = node('img', 'component-image', this.content);
      this.image.alt = '';
    }
    if (type === 'progress' || type === 'verticalProgress') {
      const track = node('div', 'progress-track', this.content);
      this.fill = node('div', 'progress-fill', track);
    }
    const handle = node('div', 'resize-handle', this.el);
    handle.dataset.resize = 'true';
    handle.setAttribute('aria-hidden', 'true');
  }
  private setImage(image: HTMLImageElement, path: unknown, assets: AssetSource): void {
    const src = typeof path === 'string' && path ? assets.resolve(path) : '';
    if (src && image.getAttribute('src') !== src) image.src = src;
    if (!src) image.removeAttribute('src');
    image.style.visibility = src ? '' : 'hidden';
  }
  render(
    c: ComponentConfig,
    order: number,
    state: TimelineState | null,
    data: Dataset | null,
    assets: AssetSource | null,
    theme: Theme,
    presentation: boolean,
    pixelScale: number,
    selected: boolean,
  ): void {
    const def = COMPONENTS[c.type];
    const s = Math.min(c.width / def.width, c.height / def.height);
    Object.assign(this.el.style, {
      left: `${c.x}px`,
      top: `${c.y}px`,
      width: `${c.width}px`,
      height: `${c.height}px`,
      zIndex: String(c.z),
    });
    this.el.style.setProperty('--s', String(s));
    this.el.classList.toggle('selected', selected && !presentation);
    this.el.dataset.label = def.label;
    if (presentation && state) theme.animate(c, order, state, this.face);
    else {
      this.face.style.opacity = '1';
      this.face.style.transform = '';
      this.face.style.filter = '';
    }
    const value =
      c.binding.source === 'fixed'
        ? c.binding.value
        : c.binding.source === 'field'
          ? state?.record[c.binding.field]
          : null;
    this.el.style.visibility =
      presentation && c.type === 'verticalText' && c.binding.source === 'field' && !value
        ? 'hidden'
        : '';
    const key = JSON.stringify([state?.index, c.binding, c.width, c.height, value, theme.id]);
    if (this.canvas && state && data && c.binding.source === 'field') {
      drawRadar(
        this.canvas,
        scoresAt(state, data, c.binding.field, theme.morphMs),
        data,
        theme,
        state.record.hideAvg === true,
        c.width,
        c.height,
        s,
        pixelScale,
      );
    }
    if (this.text && key !== this.contentKey) {
      this.text.textContent = String(value ?? '').replaceAll('/', '\n');
      this.text.style.fontSize = '';
      this.text.style.visibility = presentation && !value ? 'hidden' : '';
      // Reset to the theme's baseline first. Resizing never compounds font sizes.
      const baseSize = parseFloat(getComputedStyle(this.text).fontSize);
      const availableW = this.content.clientWidth,
        availableH = this.content.clientHeight;
      const fit = Math.min(
        1,
        availableW / Math.max(1, this.text.scrollWidth),
        availableH / Math.max(1, this.text.scrollHeight),
      );
      this.text.style.fontSize = `${baseSize * fit}px`;
    }
    if (this.image && assets) this.setImage(this.image, value, assets);
    if (this.fill && state && c.binding.source === 'timeline') {
      const progress = c.binding.scope === 'global' ? state.globalProgress : state.itemProgress;
      this.fill.style.width = c.type === 'progress' ? `${progress * 100}%` : '100%';
      this.fill.style.height = c.type === 'verticalProgress' ? `${progress * 100}%` : '100%';
    }
    if (
      data &&
      state &&
      ['info', 'ranks', 'rankImages'].includes(c.type) &&
      c.binding.source === 'field'
    ) {
      const count = c.type === 'info' ? data.dimensions.length : data.rankStages.length;
      if (this.cells.length !== count) this.buildCells(count, c.type);
      if (this.title) this.title.textContent = String(state.record.name ?? '');
      const values =
        c.type === 'info'
          ? scoresAt(state, data, c.binding.field, theme.morphMs)
          : Array.isArray(value)
            ? value
            : [];
      this.cells.forEach((cell, i) => {
        if (c.type === 'info') {
          cell.label.textContent = data.dimensions[i].label;
          cell.value.textContent = formatValue(Number(values[i] ?? 0), data.dimensions[i]);
        } else if (c.type === 'ranks') {
          cell.label.textContent = data.rankStages[i].label;
          const rank = values[i];
          cell.value.textContent = rank ? String(rank) : '-';
          cell.value.className = `rank-value ${rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : ''}`;
          cell.total!.textContent = `/ ${data.rankStages[i].total}`;
        } else if (cell.image && assets) {
          cell.image.alt = data.rankStages[i].label;
          this.setImage(cell.image, values[i], assets);
        }
      });
    }
    this.contentKey = key;
  }
  private buildCells(count: number, type: ComponentConfig['type']): void {
    this.content.replaceChildren();
    this.cells = [];
    if (type === 'info') this.title = node('div', 'component-title', this.content);
    const grid = node('div', 'stats-grid', this.content);
    grid.style.gridTemplateColumns = `repeat(${type === 'info' ? Math.min(4, count) : count}, minmax(0, 1fr))`;
    for (let i = 0; i < count; i++) {
      const cell = node('div', 'stat-cell', grid);
      const label = node('div', 'stat-label', cell),
        value = node('div', 'stat-value', cell);
      if (type === 'rankImages') {
        label.remove();
        value.remove();
        this.cells.push({ label, value, image: node('img', 'rank-image', cell) });
      } else
        this.cells.push({
          label,
          value,
          total: type === 'ranks' ? node('div', 'rank-total', cell) : undefined,
        });
    }
  }
}
