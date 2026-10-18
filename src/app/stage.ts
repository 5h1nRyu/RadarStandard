import {
  DESIGN,
  type Dataset,
  type Layout,
  type AssetSource,
  type TimelineState,
} from '../model/types.ts';
import { ComponentView } from '../components/view.ts';
import { getTheme, loadFonts } from '../themes/index.ts';
import { createBackground } from '../themes/background.ts';
import type { Background, Theme } from '../themes/types.ts';

export class Stage {
  readonly surface = document.createElement('div');
  private backgroundHost = document.createElement('div');
  private componentHost = document.createElement('div');
  private views = new Map<string, ComponentView>();
  private background: Background;
  theme: Theme = getTheme('classic');
  scale = 1;
  pixelScale = 1;
  private resizeObserver: ResizeObserver;
  private exportScale: number | null = null;
  constructor(
    readonly host: HTMLElement,
    private onResize: () => void,
  ) {
    this.surface.className = 'stage';
    this.surface.dataset.theme = this.theme.id;
    this.backgroundHost.className = 'theme-background';
    this.componentHost.className = 'component-host';
    this.surface.append(this.backgroundHost, this.componentHost);
    host.append(this.surface);
    this.background = createBackground(this.backgroundHost, this.theme.background);
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.onResize();
    });
    this.resizeObserver.observe(host);
    this.resize();
  }
  resize(): void {
    this.scale = Math.min(
      this.host.clientWidth / DESIGN.width,
      this.host.clientHeight / DESIGN.height,
    );
    this.surface.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
    this.pixelScale = this.scale * (this.exportScale ?? window.devicePixelRatio);
  }
  configureExport(dpr: number | null): void {
    this.exportScale = dpr;
    this.resize();
  }
  async setTheme(id: string, seed: number): Promise<void> {
    const theme = getTheme(id);
    await loadFonts(theme);
    const detached = document.createElement('div');
    const background = createBackground(detached, theme.background);
    try {
      await background.prepare(seed);
    } catch (error) {
      background.dispose();
      throw error;
    }
    this.background.dispose();
    this.backgroundHost.replaceChildren(...Array.from(detached.childNodes));
    this.backgroundHost.style.background = detached.style.background;
    this.background = background;
    this.theme = theme;
    this.surface.dataset.theme = id;
    // Recreate faces so a different theme cannot reuse stale text fitting.
    this.views.forEach((view) => view.el.remove());
    this.views.clear();
  }
  async render(
    layout: Layout,
    data: Dataset | null,
    state: TimelineState | null,
    assets: AssetSource | null,
    presentation: boolean,
    selected: string | null,
    seedTime = 0,
  ): Promise<void> {
    this.surface.classList.toggle('editing', !presentation);
    const ids = new Set(layout.components.map((c) => c.id));
    for (const [id, view] of this.views)
      if (!ids.has(id)) {
        view.el.remove();
        this.views.delete(id);
      }
    layout.components.forEach((c, order) => {
      let view = this.views.get(c.id);
      if (!view) {
        view = new ComponentView(c.id, c.type);
        this.views.set(c.id, view);
        this.componentHost.append(view.el);
      }
      view.render(
        c,
        order,
        state,
        data,
        assets,
        this.theme,
        presentation,
        this.pixelScale,
        selected === c.id,
      );
    });
    await this.background.render(
      presentation ? (state?.timeMs ?? seedTime) : 0,
      DESIGN.width,
      DESIGN.height,
      this.pixelScale,
    );
    // Completion means visible images are decoded; no image-load callback changes layout.
    await Promise.all(
      Array.from(this.componentHost.querySelectorAll('img[src]')).map((i) =>
        (i as HTMLImageElement).decode(),
      ),
    );
  }
  dispose(): void {
    this.resizeObserver.disconnect();
    this.background.dispose();
    this.surface.remove();
  }
}
