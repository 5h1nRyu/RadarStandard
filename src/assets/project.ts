import {
  assetPath,
  emptyLayout,
  parseDataset,
  parseLayout,
  parseManifest,
  validateBindings,
} from '../model/schema.ts';
import type { AssetSource, Dataset, Layout, Project } from '../model/types.ts';
import { checkStaticImage } from './static-image.ts';

async function jsonResponse(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`读取失败（${r.status}）：${url}`);
  try {
    return await r.json();
  } catch {
    throw new Error(`JSON 格式不正确：${url}`);
  }
}
class FolderAssets implements AssetSource {
  private urls = new Map<string, string>();
  constructor(private files: Map<string, File>) {}
  resolve(path: string): string {
    assetPath(path);
    const file = this.files.get(path);
    if (!file) throw new Error(`文件夹缺少素材：${path}`);
    let url = this.urls.get(path);
    if (!url) {
      url = URL.createObjectURL(file);
      this.urls.set(path, url);
    }
    return url;
  }
  dispose(): void {
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
  }
}
class RemoteAssets implements AssetSource {
  constructor(private base: URL) {}
  resolve(path: string): string {
    return new URL(assetPath(path).split('/').map(encodeURIComponent).join('/'), this.base).href;
  }
  dispose(): void {}
}
export function imagePaths(data: Dataset, layout: Layout): string[] {
  const paths = new Set<string>();
  for (const r of data.records)
    for (const [field, definition] of Object.entries(data.fields)) {
      const value = r[field];
      if (definition.kind === 'image' && typeof value === 'string' && value) paths.add(value);
      if (definition.kind === 'images' && Array.isArray(value)) value.forEach((p) => paths.add(p));
    }
  for (const c of layout.components)
    if (['image', 'icon'].includes(c.type) && c.binding.source === 'fixed' && c.binding.value)
      paths.add(c.binding.value);
  return [...paths];
}
export async function decodeImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new Error(`图片无法加载或解码：${url.startsWith('blob:') ? '本地素材' : url}`);
  }
  return image;
}
const preparedImages = new WeakMap<AssetSource, Map<string, Promise<void>>>();
export async function preloadAssets(
  assets: AssetSource,
  data: Dataset,
  layout: Layout,
): Promise<void> {
  // Decode everything before playback: record changes never introduce late image loads.
  let cache = preparedImages.get(assets);
  if (!cache) {
    cache = new Map();
    preparedImages.set(assets, cache);
  }
  await Promise.all(
    imagePaths(data, layout).map((path) => {
      let ready = cache!.get(path);
      if (!ready) {
        const url = assets.resolve(path);
        ready = checkStaticImage(url, path)
          .then(() => decodeImage(url))
          .then(() => {});
        cache!.set(path, ready);
      }
      return ready;
    }),
  );
}
export async function importFolder(files: File[]): Promise<Project> {
  if (!files.length) throw new Error('未选择文件夹');
  const map = new Map<string, File>();
  for (const file of files) {
    const parts = file.webkitRelativePath.split('/');
    if (parts.length < 2) throw new Error('请选择包含 work.json 的作品文件夹');
    map.set(parts.slice(1).join('/'), file);
  }
  async function read(path: string): Promise<unknown> {
    const file = map.get(assetPath(path));
    if (!file) throw new Error(`作品文件夹缺少 ${path}`);
    try {
      return JSON.parse(await file.text());
    } catch {
      throw new Error(`${path} 不是有效的 JSON`);
    }
  }
  const manifest = parseManifest(await read('work.json'));
  const data = parseDataset(await read(manifest.data));
  const layout = manifest.layout ? parseLayout(await read(manifest.layout)) : emptyLayout();
  validateBindings(layout, data);
  const assets = new FolderAssets(map);
  try {
    await preloadAssets(assets, data, layout);
    return { manifest, data, layout, assets };
  } catch (error) {
    assets.dispose();
    throw error;
  }
}
export async function loadWork(id: string): Promise<Project> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('作品 ID 只能包含字母、数字、下划线和连字符');
  const base = new URL(
    `${import.meta.env.BASE_URL}works/${encodeURIComponent(id)}/`,
    document.baseURI,
  );
  const manifest = parseManifest(await jsonResponse(new URL('work.json', base).href));
  const assets = new RemoteAssets(base);
  const data = parseDataset(await jsonResponse(assets.resolve(manifest.data)));
  const layout = manifest.layout
    ? parseLayout(await jsonResponse(assets.resolve(manifest.layout)))
    : emptyLayout();
  validateBindings(layout, data);
  await preloadAssets(assets, data, layout);
  return { manifest, data, layout, assets };
}
export function downloadJSON(name: string, value: unknown): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
