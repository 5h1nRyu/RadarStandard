import type { ComponentType, FieldKind, Binding } from './types.ts';

export interface ComponentDefinition {
  label: string;
  width: number;
  height: number;
  kind?: FieldKind;
  defaultField: string;
  timeline?: boolean;
}
export const COMPONENTS: Record<ComponentType, ComponentDefinition> = {
  radar: { label: '雷达图', width: 760, height: 760, kind: 'numbers', defaultField: 'points' },
  info: { label: '选手信息', width: 620, height: 230, kind: 'numbers', defaultField: 'points' },
  ranks: { label: '阶段排名', width: 620, height: 150, kind: 'numbers', defaultField: 'rank' },
  rankImages: {
    label: '阶段图片',
    width: 620,
    height: 150,
    kind: 'images',
    defaultField: 'rankImages',
  },
  image: { label: '图片', width: 480, height: 540, kind: 'image', defaultField: 'photo' },
  icon: { label: '图标', width: 160, height: 160, kind: 'image', defaultField: 'logo' },
  text: { label: '横排文字', width: 460, height: 110, kind: 'text', defaultField: 'name' },
  verticalText: { label: '竖排文字', width: 120, height: 500, kind: 'text', defaultField: 'title' },
  progress: { label: '横向进度条', width: 620, height: 36, defaultField: '', timeline: true },
  verticalProgress: {
    label: '竖向进度条',
    width: 36,
    height: 500,
    defaultField: '',
    timeline: true,
  },
};
export function defaultBinding(type: ComponentType): Binding {
  const def = COMPONENTS[type];
  return def.timeline
    ? { source: 'timeline', scope: 'item' }
    : { source: 'field', field: def.defaultField };
}
