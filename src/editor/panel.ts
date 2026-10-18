import { COMPONENTS } from '../model/registry.ts';
import { THEMES } from '../themes/index.ts';
import {
  DESIGN,
  type Binding,
  type ComponentConfig,
  type ComponentType,
  type Dataset,
  type Layout,
} from '../model/types.ts';
import { bindingControl } from './binding.ts';

export interface EditorActions {
  importFolder(files: File[]): Promise<void>;
  importLayout(file: File): Promise<void>;
  exportLayout(): void;
  clear(): void;
  restore(): void;
  example(): Promise<void>;
  present(): void;
  togglePlay(): void;
  seek(time: number): void;
  selectRecord(index: number): void;
  theme(id: string): Promise<void>;
  add(type: ComponentType, binding: Binding): Promise<void>;
  select(id: string): void;
  update(id: string, patch: Partial<ComponentConfig>): Promise<void>;
  remove(id: string): void;
  front(id: string): void;
  back(id: string): void;
  report(error: unknown): void;
}
export class EditorPanel {
  private fields: HTMLElement;
  private list: HTMLElement;
  private inspector: HTMLElement;
  private type: HTMLSelectElement;
  private binding: ReturnType<typeof bindingControl>;
  private data: Dataset | null = null;
  private record: HTMLSelectElement;
  private timeline: HTMLInputElement;
  private clock: HTMLElement;
  private play: HTMLButtonElement;
  private projectName: HTMLElement;
  private themeSelect: HTMLSelectElement;
  constructor(
    readonly el: HTMLElement,
    private actions: EditorActions,
  ) {
    el.innerHTML = `
      <header class="editor-header"><div class="eyebrow">RADAR STANDARD</div><h1>动画工作台 <span>v1</span></h1><p id="project-name">空白作品</p></header>
      <section><h2>作品与布局</h2><div class="button-grid"><button id="folder-btn" class="primary">导入作品文件夹</button><button id="example-btn">加载示例作品</button><button id="layout-import-btn">导入布局</button><button id="layout-export-btn">导出布局</button><button id="restore-btn">恢复本地布局</button><button id="clear-btn">清空画布</button></div><p class="hint">文件夹包含 work.json、数据与图片。布局可单独导入、导出。</p><input id="folder-input" type="file" webkitdirectory multiple hidden><input id="layout-input" type="file" accept=".json,application/json" hidden></section>
      <section><h2>播放与主题</h2><div class="button-grid"><button id="play-btn">暂停轮播</button><button id="present-btn" class="primary">进入演示</button></div><label>当前记录<select id="record-select" aria-label="当前记录"><option>尚未导入数据</option></select></label><input id="timeline" aria-label="播放时间" type="range" min="0" max="1" value="0" step="1"><div id="clock" class="time-label">00:00.0 / 00:00.0</div><label>主题<select id="theme-select" aria-label="主题"></select></label><p class="hint">编辑时简化入场与背景动画。演示时播放完整效果。</p></section>
      <section><h2>添加组件</h2><label>组件类型<select id="component-type" aria-label="组件类型"></select></label><label>绑定内容<div id="add-binding"></div></label><button id="add-btn" class="wide primary">＋ 添加到画布</button></section>
      <section><h2>画布组件 <span id="component-count">0</span></h2><div id="component-list" class="component-list"></div></section>
      <section><h2>组件属性</h2><div id="inspector"><p class="hint">在画布或列表中选择组件。</p></div></section>
      <footer>1920 × 1080 · 拖动定位 · 右下角缩放<br>位置与尺寸吸附 10 px 网格</footer>`;
    const find = <T extends HTMLElement>(id: string) => el.querySelector<T>(`#${id}`)!;
    this.fields = find('add-binding');
    this.list = find('component-list');
    this.inspector = find('inspector');
    this.type = find('component-type');
    this.record = find('record-select');
    this.timeline = find('timeline');
    this.clock = find('clock');
    this.play = find('play-btn');
    this.projectName = find('project-name');
    this.themeSelect = find('theme-select');
    for (const [type, def] of Object.entries(COMPONENTS))
      this.type.add(new Option(def.label, type));
    for (const theme of Object.values(THEMES))
      this.themeSelect.add(new Option(theme.label, theme.id));
    this.binding = bindingControl('radar', null);
    this.fields.append(this.binding.el);
    this.type.addEventListener('change', () => this.refreshBinding());
    const run = (fn: () => unknown) => {
      Promise.resolve().then(fn).catch(actions.report);
    };
    const on = (id: string, fn: () => unknown) => find(id).addEventListener('click', () => run(fn));
    const folder = find<HTMLInputElement>('folder-input'),
      layout = find<HTMLInputElement>('layout-input');
    on('folder-btn', () => folder.click());
    on('layout-import-btn', () => layout.click());
    folder.addEventListener('change', () => {
      const files = Array.from(folder.files ?? []);
      folder.value = '';
      if (files.length) run(() => actions.importFolder(files));
    });
    layout.addEventListener('change', () => {
      const file = layout.files?.[0];
      layout.value = '';
      if (file) run(() => actions.importLayout(file));
    });
    on('example-btn', actions.example);
    on('layout-export-btn', actions.exportLayout);
    on('clear-btn', actions.clear);
    on('restore-btn', actions.restore);
    on('play-btn', actions.togglePlay);
    on('present-btn', actions.present);
    on('add-btn', () => actions.add(this.type.value as ComponentType, this.binding.value()));
    this.record.addEventListener('change', () => actions.selectRecord(Number(this.record.value)));
    this.timeline.addEventListener('input', () => actions.seek(Number(this.timeline.value)));
    this.themeSelect.addEventListener('change', () =>
      run(() => actions.theme(this.themeSelect.value)),
    );
    this.list.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
      if (button) actions.select(button.dataset.id!);
    });
  }
  private refreshBinding(): void {
    this.binding = bindingControl(this.type.value as ComponentType, this.data);
    this.fields.replaceChildren(this.binding.el);
  }
  setProject(name: string, data: Dataset | null, theme: string): void {
    this.projectName.textContent = name;
    this.data = data;
    this.themeSelect.value = theme;
    this.refreshBinding();
    this.record.replaceChildren();
    if (data)
      data.records.forEach((r, i) =>
        this.record.add(new Option(`${i + 1}. ${r.name ?? r.id}`, String(i))),
      );
    else this.record.add(new Option('尚未导入数据', '0'));
    this.record.disabled = !data;
    this.timeline.disabled = !data;
  }
  updateTime(time: number, duration: number, index: number, playing: boolean): void {
    const format = (v: number) =>
      `${String(Math.floor(v / 60000)).padStart(2, '0')}:${((v % 60000) / 1000).toFixed(1).padStart(4, '0')}`;
    this.timeline.max = String(duration || 1);
    this.timeline.value = String(time);
    this.record.value = String(index);
    this.clock.textContent = `${format(time)} / ${format(duration)}`;
    this.play.textContent = playing ? '暂停轮播' : '继续轮播';
  }
  updateLayout(layout: Layout, selected: string | null): void {
    this.el.querySelector('#component-count')!.textContent = String(layout.components.length);
    this.list.replaceChildren();
    if (!layout.components.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '画布为空，从上方添加第一个组件。';
      this.list.append(p);
    }
    [...layout.components]
      .sort((a, b) => b.z - a.z)
      .forEach((c) => {
        const button = document.createElement('button');
        button.dataset.id = c.id;
        button.className = `component-list-item ${c.id === selected ? 'active' : ''}`;
        const binding =
          c.binding.source === 'field'
            ? c.binding.field
            : c.binding.source === 'timeline'
              ? c.binding.scope === 'item'
                ? '当前进度'
                : '全局进度'
              : '固定内容';
        button.textContent = `${COMPONENTS[c.type].label} · ${binding}`;
        this.list.append(button);
      });
    this.inspect(layout.components.find((c) => c.id === selected));
  }
  private inspect(c?: ComponentConfig): void {
    this.inspector.replaceChildren();
    if (!c) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '在画布或列表中选择组件。';
      this.inspector.append(p);
      return;
    }
    const run = (fn: () => unknown) => {
      Promise.resolve().then(fn).catch(this.actions.report);
    };
    const meta = document.createElement('p');
    meta.className = 'hint';
    meta.textContent = `${COMPONENTS[c.type].label} · ${c.id}`;
    this.inspector.append(meta);
    this.inspector.append(
      bindingControl(c.type, this.data, c.binding, (binding) =>
        run(() => this.actions.update(c.id, { binding })),
      ).el,
    );
    const grid = document.createElement('div');
    grid.className = 'property-grid';
    for (const [key, name] of Object.entries({
      x: 'X',
      y: 'Y',
      width: '宽度',
      height: '高度',
      z: '层级',
    })) {
      const label = document.createElement('label');
      label.textContent = name;
      const input = document.createElement('input');
      input.type = 'number';
      input.value = String(c[key as keyof ComponentConfig]);
      input.step = key === 'z' ? '1' : '10';
      input.min = key === 'width' || key === 'height' ? '10' : '0';
      input.max = String(
        key === 'z' ? 1000000 : key === 'width' || key === 'x' ? DESIGN.width : DESIGN.height,
      );
      input.setAttribute('aria-label', `组件${name}`);
      input.addEventListener('change', () =>
        run(() => this.actions.update(c.id, { [key]: Number(input.value) })),
      );
      label.append(input);
      grid.append(label);
    }
    this.inspector.append(grid);
    const buttons = document.createElement('div');
    buttons.className = 'button-grid';
    for (const [label, fn] of [
      ['置顶', () => this.actions.front(c.id)],
      ['置底', () => this.actions.back(c.id)],
      ['删除组件', () => this.actions.remove(c.id)],
    ] as const) {
      const button = document.createElement('button');
      button.textContent = label;
      if (label === '删除组件') button.className = 'danger';
      button.addEventListener('click', () => run(fn));
      buttons.append(button);
    }
    this.inspector.append(buttons);
  }
}
