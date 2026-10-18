import { COMPONENTS } from '../model/registry.ts';
import type { Binding, ComponentType, Dataset } from '../model/types.ts';

export function bindingControl(
  type: ComponentType,
  data: Dataset | null,
  binding?: Binding,
  changed?: (value: Binding) => void,
): { el: HTMLElement; value(): Binding } {
  const el = document.createElement('div');
  el.className = 'binding-control';
  const select = document.createElement('select');
  select.setAttribute('aria-label', '绑定数据');
  el.append(select);
  const fixed = document.createElement('textarea');
  fixed.placeholder = ['image', 'icon'].includes(type)
    ? '素材相对路径，例如 images/logo.svg'
    : '固定文字，使用 / 换行';
  fixed.setAttribute('aria-label', '固定内容');
  fixed.rows = 2;
  function option(value: string, label: string): void {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    select.append(o);
  }
  const definition = COMPONENTS[type];
  if (definition.timeline) {
    option('timeline:item', '当前选手进度');
    option('timeline:global', '完整作品进度');
  } else {
    for (const [key, f] of Object.entries(data?.fields ?? {}))
      if (f.kind === definition.kind) option(`field:${key}`, `${f.label} · ${key}`);
    if (
      binding?.source === 'field' &&
      !Array.from(select.options).some((o) => o.value === `field:${binding.field}`)
    )
      option(`field:${binding.field}`, `${binding.field}（等待数据）`);
    if (['text', 'verticalText', 'image', 'icon'].includes(type)) option('fixed', '固定内容');
  }
  if (binding) {
    select.value =
      binding.source === 'field'
        ? `field:${binding.field}`
        : binding.source === 'timeline'
          ? `timeline:${binding.scope}`
          : 'fixed';
    if (binding.source === 'fixed') fixed.value = binding.value;
  } else if (data?.fields[definition.defaultField])
    select.value = `field:${definition.defaultField}`;
  function value(): Binding {
    if (!select.value) throw new Error('请先导入数据，再选择绑定字段');
    if (select.value === 'fixed') return { source: 'fixed', value: fixed.value };
    if (select.value.startsWith('timeline:'))
      return { source: 'timeline', scope: select.value.endsWith('global') ? 'global' : 'item' };
    return { source: 'field', field: select.value.slice(6) };
  }
  function sync(): void {
    fixed.hidden = select.value !== 'fixed';
  }
  el.append(fixed);
  sync();
  select.addEventListener('change', () => {
    sync();
    changed?.(value());
  });
  fixed.addEventListener('change', () => changed?.(value()));
  return { el, value };
}
