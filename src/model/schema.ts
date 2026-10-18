import { COMPONENTS } from './registry.ts';
import {
  DESIGN,
  type Dataset,
  type Layout,
  type WorkManifest,
  type ComponentType,
  type Binding,
} from './types.ts';

function fail(message: string): never {
  throw new Error(message);
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} 必须是对象`);
  return value as Record<string, unknown>;
}
function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${name} 必须是非空字符串`);
  return value;
}
function number(value: unknown, name: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    fail(`${name} 必须是 ${min} 到 ${max} 之间的有限数字`);
  return value;
}
export function assetPath(value: string): string {
  if (
    !value ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /[?#:%\u0000-\u001f]/.test(value) ||
    value.split('/').some((p) => !p || p === '..' || p === '.')
  )
    fail(`素材路径必须是文件夹内的相对路径：${value}`);
  return value;
}
export function parseManifest(input: unknown): WorkManifest {
  const m = object(input, 'work.json');
  if (m.version !== 1) fail('作品版本必须为 1');
  const theme = string(m.theme, 'theme');
  return {
    version: 1,
    name: string(m.name, '作品名称'),
    data: assetPath(string(m.data, 'data')),
    layout: m.layout === undefined ? undefined : assetPath(string(m.layout, 'layout')),
    theme,
  };
}
export function parseDataset(input: unknown): Dataset {
  const d = object(input, '数据');
  if (d.version !== 1) fail('数据版本必须为 1');
  const fields = object(d.fields, 'fields');
  if (!Object.keys(fields).length) fail('请至少定义一个字段');
  for (const [key, value] of Object.entries(fields)) {
    const f = object(value, `字段 ${key}`);
    string(f.label, `${key}.label`);
    if (!['text', 'image', 'numbers', 'images'].includes(String(f.kind))) fail(`${key}.kind 无效`);
  }
  if (!Array.isArray(d.dimensions) || d.dimensions.length < 3) fail('dimensions 至少需要三个维度');
  d.dimensions.forEach((value, i) => {
    const v = object(value, `维度 ${i + 1}`);
    string(v.label, '维度名称');
    if (number(v.max, '维度最大值') <= number(v.min, '维度最小值'))
      fail('维度最大值必须大于最小值');
    number(v.average, '均值');
    if (v.format !== undefined && !['number', 'percent'].includes(String(v.format)))
      fail('维度 format 无效');
    if (v.decimals !== undefined && !Number.isInteger(number(v.decimals, '小数位数', 0, 8)))
      fail('小数位数必须是整数');
  });
  if (!Array.isArray(d.rankStages)) fail('rankStages 必须是数组');
  d.rankStages.forEach((v) => {
    const s = object(v, '排名阶段');
    string(s.label, '阶段名称');
    number(s.total, '阶段总人数', 1);
  });
  const duration = number(d.defaultDuration, 'defaultDuration', 1, 86400000);
  if (!Array.isArray(d.records) || !d.records.length) fail('records 不能为空');
  const ids = new Set<string>();
  let total = 0;
  d.records.forEach((value, index) => {
    const r = object(value, `记录 ${index + 1}`);
    const id = string(r.id, '记录 ID');
    if (ids.has(id)) fail(`重复的记录 ID：${id}`);
    ids.add(id);
    total +=
      r.duration === undefined ? duration : number(r.duration, `${id}.duration`, 1, 86400000);
    for (const flag of ['playEntranceAnimation', 'noAnimation', 'hideAvg'])
      if (r[flag] !== undefined && typeof r[flag] !== 'boolean') fail(`${id}.${flag} 必须是布尔值`);
    for (const [key, definition] of Object.entries(fields)) {
      const kind = object(definition, key).kind;
      const v = r[key];
      if (v === undefined || v === null || v === '') continue;
      if ((kind === 'text' || kind === 'image') && typeof v !== 'string')
        fail(`${id}.${key} 必须是字符串`);
      if (kind === 'image') assetPath(v as string);
      if (
        kind === 'numbers' &&
        (!Array.isArray(v) || v.some((n) => typeof n !== 'number' || !Number.isFinite(n)))
      )
        fail(`${id}.${key} 必须是数字数组`);
      if (kind === 'images') {
        if (!Array.isArray(v) || v.some((p) => typeof p !== 'string'))
          fail(`${id}.${key} 必须是图片路径数组`);
        (v as string[]).forEach(assetPath);
      }
    }
  });
  if (total > 86400000) fail('完整时间轴不能超过 24 小时');
  return structuredClone(d) as unknown as Dataset;
}
export function emptyLayout(): Layout {
  return { version: 1, canvas: { ...DESIGN }, components: [] };
}
export function parseLayout(input: unknown): Layout {
  const l = object(input, '布局');
  const c = object(l.canvas, 'canvas');
  if (
    l.version !== 1 ||
    c.width !== DESIGN.width ||
    c.height !== DESIGN.height ||
    !Array.isArray(l.components)
  )
    fail('需要新版 version: 1、1920×1080 画布与 components 数组');
  if (l.components.length > 200) fail('最多支持 200 个组件');
  const ids = new Set<string>();
  const components = l.components.map((value, index) => {
    const p = object(value, `组件 ${index + 1}`);
    const id = string(p.id, '组件 ID');
    if (ids.has(id)) fail(`重复组件 ID：${id}`);
    ids.add(id);
    if (!Object.hasOwn(COMPONENTS, String(p.type))) fail(`未知组件类型：${p.type}`);
    const type = p.type as ComponentType;
    const b = object(p.binding, `${id}.binding`);
    let binding: Binding;
    if (b.source === 'field' && !COMPONENTS[type].timeline)
      binding = { source: 'field', field: string(b.field, '绑定字段') };
    else if (
      b.source === 'fixed' &&
      ['text', 'verticalText', 'image', 'icon'].includes(type) &&
      typeof b.value === 'string'
    )
      binding = { source: 'fixed', value: b.value };
    else if (
      b.source === 'timeline' &&
      COMPONENTS[type].timeline &&
      ['item', 'global'].includes(String(b.scope))
    )
      binding = { source: 'timeline', scope: b.scope as 'item' | 'global' };
    else fail(`${id} 的绑定不适用于该组件`);
    if (binding.source === 'fixed' && ['image', 'icon'].includes(type) && binding.value)
      assetPath(binding.value);
    const width = number(p.width, '组件宽度', 10, DESIGN.width);
    const height = number(p.height, '组件高度', 10, DESIGN.height);
    const z = number(p.z, '层级', 0, 1000000);
    if (!Number.isInteger(z)) fail('层级必须是整数');
    return {
      id,
      type,
      binding,
      width,
      height,
      x: number(p.x, 'x', 0, DESIGN.width - width),
      y: number(p.y, 'y', 0, DESIGN.height - height),
      z,
    };
  });
  return { version: 1, canvas: { ...DESIGN }, components };
}
export function validateBindings(layout: Layout, data: Dataset): void {
  for (const c of layout.components) {
    if (c.binding.source !== 'field') continue;
    const field = data.fields[c.binding.field];
    if (!field || field.kind !== COMPONENTS[c.type].kind)
      fail(`${COMPONENTS[c.type].label} 的绑定字段「${c.binding.field}」不存在或类型不匹配`);
    if (c.type === 'radar' || c.type === 'info' || c.type === 'ranks' || c.type === 'rankImages') {
      const expected =
        c.type === 'radar' || c.type === 'info' ? data.dimensions.length : data.rankStages.length;
      for (const r of data.records)
        if (
          !Array.isArray(r[c.binding.field]) ||
          (r[c.binding.field] as unknown[]).length !== expected
        )
          fail(`记录 ${r.id} 的 ${c.binding.field} 需要 ${expected} 项`);
    }
  }
}
