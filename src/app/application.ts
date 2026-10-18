import { Stage } from './stage.ts';
import { EditorPanel } from '../editor/panel.ts';
import { bindInteractions, bindSplitter } from '../editor/interactions.ts';
import { importFolder, loadWork, downloadJSON, preloadAssets } from '../assets/project.ts';
import { emptyLayout, parseLayout, validateBindings } from '../model/schema.ts';
import { COMPONENTS } from '../model/registry.ts';
import { atTime, durationOf, recordStart } from '../model/timeline.ts';
import {
  DESIGN,
  type Project,
  type Layout,
  type ComponentConfig,
  type Binding,
  type ComponentType,
} from '../model/types.ts';

export class Application {
  readonly ready: Promise<void>;
  readonly stage: Stage;
  readonly editor: EditorPanel;
  project: Project | null = null;
  layout: Layout = emptyLayout();
  timeMs = 0;
  playing = !window.__VIDEO_EXPORT_REQUEST__;
  presentation = !!window.__VIDEO_EXPORT_REQUEST__;
  exporting = !!window.__VIDEO_EXPORT_REQUEST__;
  seed = 12345;
  private selected: string | null = null;
  private raf = 0;
  private lastTs: number | null = null;
  private disposed = false;
  private busy = false;
  private renderTail: Promise<void> = Promise.resolve();
  private notice: HTMLElement;
  private noticeTimer = 0;
  constructor(root: HTMLElement) {
    root.innerHTML = `<main class="workspace"><div class="screen"><div class="screen-toolbar"><strong>画布预览</strong><span>16:9 · 1920 × 1080</span></div><div class="stage-host" aria-label="16:9 画布"></div></div><div class="splitter" role="separator" aria-label="调整预览与操作区域宽度" aria-orientation="vertical" tabindex="0"></div><aside class="sidebar" aria-label="操作区域"></aside></main><button class="return-edit">返回编辑</button><div class="notice" role="status" aria-live="polite" hidden></div>`;
    this.notice = root.querySelector('.notice')!;
    this.stage = new Stage(root.querySelector('.stage-host')!, () => {
      if (!this.disposed) void this.render().catch(this.report);
    });
    this.editor = new EditorPanel(root.querySelector('.sidebar')!, {
      importFolder: (files) => this.load(() => importFolder(files)),
      importLayout: (file) => this.importLayout(file),
      exportLayout: () => {
        downloadJSON('layout.json', this.layout);
        this.message('布局已导出。放入作品文件夹，并在 work.json 中设置 layout。');
      },
      clear: () => {
        this.layout = emptyLayout();
        this.selected = null;
        this.changed();
      },
      restore: () => this.restore(),
      example: () => this.load(() => loadWork('example')),
      present: () => this.setPresentation(true),
      togglePlay: () => this.togglePlay(),
      seek: (t) => this.seek(t),
      selectRecord: (i) => {
        if (this.project) this.seek(recordStart(this.project.data, i));
      },
      theme: (id) => this.setTheme(id),
      add: (type, binding) => this.add(type, binding),
      select: (id) => this.select(id),
      update: (id, patch) => this.update(id, patch),
      remove: (id) => {
        this.layout.components = this.layout.components.filter((c) => c.id !== id);
        this.selected = null;
        this.changed();
      },
      front: (id) => this.layer(id, true),
      back: (id) => this.layer(id, false),
      report: this.report,
    });
    bindSplitter(root.querySelector('.splitter')!, root.querySelector('.workspace')!);
    bindInteractions(this.stage, {
      enabled: () => !this.presentation && !this.busy,
      selected: (id) => this.select(id, true),
      get: (id) => this.layout.components.find((c) => c.id === id),
      update: (id, patch, end) => {
        const c = this.layout.components.find((c) => c.id === id);
        if (c) Object.assign(c, patch);
        if (end) this.changed();
        else void this.render().catch(this.report);
      },
    });
    root
      .querySelector('.return-edit')!
      .addEventListener('click', () => this.setPresentation(false));
    root.addEventListener('dragover', (e) => {
      if (!this.presentation && !this.busy) e.preventDefault();
    });
    root.addEventListener('drop', (e) => {
      if (this.presentation || this.busy) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void this.importLayout(file).catch(this.report);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.exporting) this.setPresentation(false);
      if (
        e.key === 'Delete' &&
        this.selected &&
        !this.presentation &&
        !(e.target as HTMLElement).closest('input,textarea,select')
      ) {
        this.layout.components = this.layout.components.filter((c) => c.id !== this.selected);
        this.selected = null;
        this.changed();
      }
    });
    document.body.classList.toggle('exporting', this.exporting);
    this.setPresentation(this.presentation);
    this.editor.setProject('空白作品', null, 'classic');
    this.editor.updateLayout(this.layout, null);
    this.ready = this.init();
    // Keep a rejected ready Promise for the exporter, while reporting it in the UI.
    void this.ready.catch(this.report);
  }
  private async init(): Promise<void> {
    await this.stage.setTheme('classic', this.seed);
    const id = new URLSearchParams(location.search).get('work');
    if (id) await this.load(() => loadWork(id));
    else await this.render();
    if (new URLSearchParams(location.search).get('mode') === 'present') this.setPresentation(true);
    this.startLoop();
  }
  report = (error: unknown): void => {
    this.message(error instanceof Error ? error.message : String(error), true);
  };
  message(text: string, error = false): void {
    window.clearTimeout(this.noticeTimer);
    this.notice.textContent = text;
    this.notice.hidden = false;
    this.notice.classList.toggle('error', error);
    if (!this.exporting && !error)
      this.noticeTimer = window.setTimeout(() => {
        this.notice.hidden = true;
      }, 6000);
  }
  private async load(loader: () => Promise<Project>): Promise<void> {
    if (this.busy) throw new Error('正在加载，请稍候');
    this.busy = true;
    this.editor.el.inert = true;
    const wasPlaying = this.playing;
    this.pause();
    this.message('正在读取作品并检查素材…');
    let next: Project | null = null;
    try {
      next = await loader();
      await this.renderTail;
      await this.stage.setTheme(next.manifest.theme, this.seed);
      const old = this.project;
      this.project = next;
      this.layout = structuredClone(next.layout);
      this.timeMs = 0;
      this.selected = null;
      old?.assets.dispose();
      this.editor.setProject(next.manifest.name, next.data, next.manifest.theme);
      this.editor.updateLayout(this.layout, null);
      await this.render();
      this.message(
        `已加载「${next.manifest.name}」：${next.data.records.length} 条记录，${this.layout.components.length} 个组件。`,
      );
    } catch (error) {
      if (next && next !== this.project) next.assets.dispose();
      throw error;
    } finally {
      this.busy = false;
      this.editor.el.inert = false;
      this.playing = wasPlaying;
      this.startLoop();
    }
  }
  render(): Promise<void> {
    const job = this.renderTail.then(async () => {
      if (this.disposed) return;
      const state = this.project ? atTime(this.project.data, this.timeMs) : null;
      await this.stage.render(
        this.layout,
        this.project?.data ?? null,
        state,
        this.project?.assets ?? null,
        this.presentation,
        this.selected,
      );
      this.editor?.updateTime(
        this.timeMs,
        this.project ? durationOf(this.project.data) : 0,
        state?.index ?? 0,
        this.playing,
      );
    });
    this.renderTail = job.catch(() => {});
    return job;
  }
  private startLoop(): void {
    if (!this.playing || this.exporting || this.disposed || this.raf || this.busy || !this.project)
      return;
    this.raf = requestAnimationFrame(this.tick);
  }
  private tick = async (now: number): Promise<void> => {
    this.raf = 0;
    if (!this.playing || this.exporting || this.disposed) return;
    if (this.lastTs !== null && this.project)
      this.timeMs = (this.timeMs + now - this.lastTs) % durationOf(this.project.data);
    this.lastTs = now;
    try {
      await this.render();
      this.startLoop();
    } catch (error) {
      this.pause();
      this.report(error);
    }
  };
  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastTs = null;
  }
  private togglePlay(): void {
    if (this.playing) this.pause();
    else {
      this.playing = true;
      this.lastTs = null;
      this.startLoop();
    }
    void this.render().catch(this.report);
  }
  seek(time: number): void {
    this.timeMs = Math.max(0, Math.min(time, this.project ? durationOf(this.project.data) : 0));
    this.lastTs = null;
    void this.render().catch(this.report);
  }
  setPresentation(value: boolean): void {
    this.presentation = value;
    document.body.classList.toggle('presentation', value);
    this.stage.resize();
    void this.render().catch(this.report);
  }
  async setTheme(id: string): Promise<void> {
    const playing = this.playing;
    this.pause();
    try {
      await this.renderTail;
      await this.stage.setTheme(id, this.seed);
      if (this.project) this.project.manifest.theme = id;
      await this.render();
    } finally {
      this.playing = playing;
      this.startLoop();
    }
  }
  private select(id: string | null, front = false): void {
    this.selected = id;
    if (front && id) this.reorder(id, true);
    this.editor.updateLayout(this.layout, id);
    void this.render().catch(this.report);
  }
  private async add(type: ComponentType, binding: Binding): Promise<void> {
    const def = COMPONENTS[type];
    const config: ComponentConfig = {
      id: crypto.randomUUID(),
      type,
      binding,
      x: 100,
      y: 100,
      width: def.width,
      height: def.height,
      z: this.layout.components.length + 5,
    };
    const next = { ...this.layout, components: [...this.layout.components, config] };
    await this.validate(next);
    this.layout = next;
    this.reorder(config.id, true);
    this.selected = config.id;
    this.changed();
  }
  private async validate(layout: Layout): Promise<void> {
    parseLayout(layout);
    if (this.project) {
      validateBindings(layout, this.project.data);
      await preloadAssets(this.project.assets, this.project.data, layout);
    } else if (
      layout.components.some(
        (c) =>
          c.binding.source === 'field' ||
          (c.binding.source === 'fixed' && ['image', 'icon'].includes(c.type) && c.binding.value),
      )
    )
      throw new Error('请先导入作品数据和素材');
  }
  private async update(id: string, patch: Partial<ComponentConfig>): Promise<void> {
    const next = structuredClone(this.layout);
    const component = next.components.find((c) => c.id === id);
    if (!component) return;
    Object.assign(component, patch);
    try {
      await this.validate(next);
      this.layout = next;
      this.changed();
    } catch (error) {
      this.editor.updateLayout(this.layout, this.selected);
      throw error;
    }
  }
  private reorder(id: string, front: boolean): void {
    const c = this.layout.components.find((c) => c.id === id);
    if (!c) return;
    const ordered = this.layout.components.filter((c) => c.id !== id).sort((a, b) => a.z - b.z);
    if (front) ordered.push(c);
    else ordered.unshift(c);
    ordered.forEach((p, i) => {
      p.z = i + 5;
    });
  }
  private layer(id: string, front: boolean): void {
    this.reorder(id, front);
    this.changed();
  }
  private storageKey(): string {
    return `radar-standard:v1:${this.project?.manifest.name ?? 'blank'}`;
  }
  private changed(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this.layout));
    } catch {
      this.message('浏览器不允许保存本地布局，请使用导出布局。', true);
    }
    this.editor.updateLayout(this.layout, this.selected);
    void this.render().catch(this.report);
  }
  private restore(): void {
    const value = localStorage.getItem(this.storageKey());
    if (!value) {
      this.message('当前作品没有本地布局。');
      return;
    }
    void this.acceptLayout(JSON.parse(value))
      .then(() => this.message('已恢复本地布局。'))
      .catch(this.report);
  }
  private async acceptLayout(value: unknown): Promise<void> {
    const layout = parseLayout(value);
    await this.validate(layout);
    this.layout = layout;
    this.selected = null;
    this.changed();
  }
  private async importLayout(file: File): Promise<void> {
    await this.acceptLayout(JSON.parse(await file.text()));
    this.message('布局已导入。');
  }
  async settle(): Promise<void> {
    await this.renderTail;
  }
  dispose(): void {
    this.pause();
    this.disposed = true;
    window.clearTimeout(this.noticeTimer);
    void this.renderTail.finally(() => {
      this.stage.dispose();
      this.project?.assets.dispose();
    });
  }
  get design(): typeof DESIGN {
    return DESIGN;
  }
}
