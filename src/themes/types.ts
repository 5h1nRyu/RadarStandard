import type { ComponentConfig, TimelineState } from '../model/types.ts';

export interface Background {
  prepare(seed: number): Promise<void>;
  render(timeMs: number, width: number, height: number, pixelScale: number): Promise<void>;
  dispose(): void;
}
export type BackgroundSpec =
  | { kind: 'color'; color: string }
  | { kind: 'image'; src: string }
  | { kind: 'video'; src: string; loop: boolean }
  | { kind: 'code'; create: (host: HTMLElement) => Background };
export interface Theme {
  id: string;
  label: string;
  fonts: { family: string; source: string; descriptors?: FontFaceDescriptors }[];
  background: BackgroundSpec;
  radar: {
    font: string;
    mono: string;
    grid: string;
    average: string;
    fill: string;
    stroke: string;
    text: string;
    highlight: string;
    labelSize: number;
    valueSize: number;
  };
  morphMs: number;
  animate(
    component: ComponentConfig,
    order: number,
    state: TimelineState,
    target: HTMLElement,
  ): void;
}
