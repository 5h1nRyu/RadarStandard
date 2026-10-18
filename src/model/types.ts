export const DESIGN = { width: 1920, height: 1080 } as const;
export type ComponentType =
  | 'radar'
  | 'info'
  | 'ranks'
  | 'rankImages'
  | 'image'
  | 'icon'
  | 'text'
  | 'verticalText'
  | 'progress'
  | 'verticalProgress';
export type FieldKind = 'text' | 'image' | 'numbers' | 'images';
export interface FieldDefinition {
  label: string;
  kind: FieldKind;
}
export interface Dimension {
  label: string;
  min: number;
  max: number;
  average: number;
  format?: 'number' | 'percent';
  decimals?: number;
}
export interface PlayerRecord {
  id: string;
  duration?: number;
  playEntranceAnimation?: boolean;
  noAnimation?: boolean;
  hideAvg?: boolean;
  [field: string]: unknown;
}
export interface Dataset {
  version: 1;
  name: string;
  defaultDuration: number;
  fields: Record<string, FieldDefinition>;
  dimensions: Dimension[];
  rankStages: { label: string; total: number }[];
  records: PlayerRecord[];
}
export type Binding =
  | { source: 'field'; field: string }
  | { source: 'fixed'; value: string }
  | { source: 'timeline'; scope: 'item' | 'global' };
export interface ComponentConfig {
  id: string;
  type: ComponentType;
  binding: Binding;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}
export interface Layout {
  version: 1;
  canvas: { width: 1920; height: 1080 };
  components: ComponentConfig[];
}
export interface WorkManifest {
  version: 1;
  name: string;
  data: string;
  layout?: string;
  theme: string;
}
export interface TimelineState {
  index: number;
  record: PlayerRecord;
  previous: PlayerRecord;
  localMs: number;
  timeMs: number;
  durationMs: number;
  itemProgress: number;
  globalProgress: number;
}
export interface AssetSource {
  resolve(path: string): string;
  dispose(): void;
}
export interface Project {
  manifest: WorkManifest;
  data: Dataset;
  layout: Layout;
  assets: AssetSource;
}
export interface ExportOptions {
  fps: 60;
  viewport: { width: number; height: number };
  output: { width: number; height: number };
  deviceScaleFactor: number;
  seed: number;
}
export interface Frame {
  index: number;
  timeMs: number;
  deltaMs: number;
}
export interface VideoExportAPI {
  version: 1;
  getManifest():
    | {
        name: string;
        durationMs: number;
        recommendedViewport: typeof DESIGN;
        supportsSeeking: boolean;
      }
    | Promise<{
        name: string;
        durationMs: number;
        recommendedViewport: typeof DESIGN;
        supportsSeeking: boolean;
      }>;
  prepare(options: ExportOptions): Promise<void>;
  reset(): Promise<void>;
  renderFrame(frame: Frame): Promise<void>;
  dispose(): void;
}
declare global {
  interface Window {
    __VIDEO_EXPORT_REQUEST__?: Readonly<ExportOptions>;
    __VIDEO_EXPORT__?: VideoExportAPI;
  }
}
