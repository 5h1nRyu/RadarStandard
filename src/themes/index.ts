import { classic } from './classic/index.ts';
import { nasaPunk } from './nasa-punk/index.ts';
import type { Theme } from './types.ts';
export const THEMES: Record<string, Theme> = { classic, 'nasa-punk': nasaPunk };
export function getTheme(id: string): Theme {
  if (!Object.hasOwn(THEMES, id)) throw new Error(`项目中未注册主题：${id}`);
  return THEMES[id];
}
const loadedFonts = new Map<string, Promise<void>>();
export async function loadFonts(theme: Theme): Promise<void> {
  let ready = loadedFonts.get(theme.id);
  if (!ready) {
    ready = Promise.all(
      theme.fonts.map(async (f) => {
        const face = new FontFace(f.family, `url("${f.source}")`, f.descriptors);
        document.fonts.add(await face.load());
      }),
    ).then(async () => {
      await document.fonts.ready;
    });
    loadedFonts.set(theme.id, ready);
  }
  await ready;
}
