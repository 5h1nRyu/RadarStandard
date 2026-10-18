import type { Application } from '../app/application.ts';
import { DESIGN, type ExportOptions, type VideoExportAPI } from '../model/types.ts';
import { durationOf } from '../model/timeline.ts';

function validateOptions(options: ExportOptions): void {
  if (
    options.fps !== 60 ||
    !Number.isInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 4294967295
  )
    throw new Error('协议要求 60 fps 和 uint32 seed');
  const values = [
    options.viewport.width,
    options.viewport.height,
    options.output.width,
    options.output.height,
    options.deviceScaleFactor,
  ];
  if (values.some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error('导出尺寸和 DPR 必须为正数');
  if (
    Math.abs(options.viewport.width * options.deviceScaleFactor - options.output.width) > 1 ||
    Math.abs(options.viewport.height * options.deviceScaleFactor - options.output.height) > 1
  )
    throw new Error('输出尺寸必须等于视口尺寸乘 DPR');
}
export function installProtocol(app: Application): void {
  let prepared = false,
    disposed = false,
    previousFrame = -1;
  let configuration: ExportOptions | null = null;
  const api: VideoExportAPI = {
    version: 1,
    async getManifest() {
      await app.ready;
      if (!app.project) throw new Error('请使用带 ?work=作品ID 的 URL 导出已发布作品');
      return {
        name: app.project.manifest.name,
        durationMs: durationOf(app.project.data),
        recommendedViewport: DESIGN,
        supportsSeeking: false,
      };
    },
    async prepare(options) {
      if (disposed) throw new Error('导出接口已释放');
      validateOptions(options);
      app.pause();
      app.exporting = true;
      document.body.classList.add('exporting');
      await app.ready;
      app.pause();
      await app.settle();
      if (!app.project) throw new Error('尚未加载作品');
      configuration = options;
      app.seed = options.seed;
      app.setPresentation(true);
      app.stage.configureExport(options.deviceScaleFactor);
      await app.setTheme(app.stage.theme.id);
      await document.fonts.ready;
      prepared = true;
      previousFrame = -1;
    },
    async reset() {
      if (!prepared || !configuration || disposed) throw new Error('请先 prepare');
      app.pause();
      await app.settle();
      app.timeMs = 0;
      previousFrame = -1;
      // Recreate background state so seeded simulations and history are reset as well.
      await app.setTheme(app.stage.theme.id);
      await app.render();
    },
    async renderFrame(frame) {
      if (!prepared || disposed) throw new Error('请先 prepare');
      if (
        !Number.isInteger(frame.index) ||
        frame.index < 0 ||
        !Number.isFinite(frame.timeMs) ||
        !Number.isFinite(frame.deltaMs) ||
        Math.abs(frame.timeMs - (frame.index * 1000) / 60) > 0.00001 ||
        Math.abs(frame.deltaMs - (frame.index === 0 ? 0 : 1000 / 60)) > 0.00001
      )
        throw new Error('帧参数不符合协议 v1');
      if (frame.index !== previousFrame + 1)
        throw new Error('当前主题使用顺序逐帧模式，请 reset 后从第 0 帧开始');
      app.timeMs = frame.timeMs;
      await app.render();
      previousFrame = frame.index;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      prepared = false;
      app.dispose();
    },
  };
  window.__VIDEO_EXPORT__ = api;
}
