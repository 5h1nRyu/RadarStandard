# 主题开发

主题代码只来自仓库内部。`src/themes/index.ts` 注册可切换的主题，第一版只有 `classic`。复制该目录、修改 ID 和配置并注册新主题后，编辑器下拉列表会自动出现。数据字段、通用图片和布局不随主题复制。

## 目录与资源

```text
src/themes/my-theme/
  index.ts
  style.css
  particles.ts
  fonts/
  textures/
  background.mp4
```

在 `index.ts` 导入 CSS。所有选择器使用 `[data-theme="my-theme"]` 隔离，避免污染编辑侧栏。图片、视频、字体的 URL 可使用 `new URL('./资源文件', import.meta.url).href`，由 Vite 处理 Pages 子路径和构建哈希。不要引用 `public/works/` 中的作品文件作为主题背景。

`Theme.fonts` 显式声明自带字体，加载失败会让准备阶段失败，不静默换字体。字体默认使用系统中文字体；若需要跨机器外观更接近，应将具有相应许可的字体文件放入主题目录，声明实际使用的字重，并在 CSS 和 Canvas 的 font 配置中使用该字体。

## 组件尺寸和字体

默认组件尺寸定义在 `src/model/registry.ts`。主题基于默认尺寸设计 CSS 字号、间距、圆角、描边和 Canvas 文字，不能改变组件保存的矩形。

```text
s = min(当前宽度 / 默认宽度, 当前高度 / 默认高度)
```

组件设置 CSS 变量 `--s`；例如 `font-size: calc(60px * var(--s))`。非等比缩放时内部布局适应新矩形，字形保持原比例。文字先恢复主题基准字号，再按可用空间收缩，避免累计误差。画布整体适配预览区的缩放独立于这个计算。

Canvas 使用主题 `radar` 配置，按组件基准和实际 DPR 绘制。主题不应在 CSS 中另设组件位置或尺寸，也不应因图片加载、字体改变而重写布局。

## 入场、切换与数值形变

`Theme.animate(component, order, state, target)` 只使用 `state.localMs` 和记录元数据计算当前帧，给组件内部的 `target` 设置 opacity、transform、filter 等属性。外层组件的定位由布局独占，因此入场不会覆盖拖拽位置。

`morphMs` 定义雷达和统计值的过渡时间。编辑模式跳过主题入场，背景固定在 0 ms；数值形变和进度依旧跟随轮播。暂停后全局时间不推进。

不要启动自己的 RAF、setInterval、setTimeout 动画，不要使用运行中的 CSS animation／transition 或 Math.random。若需要 Web Animations，必须暂停并显式设置 currentTime，且清理阶段释放资源。

## 背景

背景属于主题，通过 `Theme.background` 配置：

```ts
{ kind: 'color', color: '#0a0a0a' }
{ kind: 'image', src: new URL('./textures/background.jpg', import.meta.url).href }
{ kind: 'video', src: new URL('./background.mp4', import.meta.url).href, loop: true }
{ kind: 'code', create: createParticles }
```

图片会显式加载解码；视频先完整下载为本地 Blob，避免寻帧依赖静态服务器的 Range 支持，再保持暂停、按时间轴 seek，等待 seeked 后绘制到 Canvas，避免原生视频合成器自行改变画面。视频需要浏览器支持的编解码格式和有限时长，背景会等比填满画布并裁切多余区域。背景音频不播放。较大的视频会增加准备时间和内存占用。

代码背景实现 `Background`：

```ts
interface Background {
  prepare(seed: number): Promise<void>;
  render(timeMs: number, width: number, height: number, pixelScale: number): Promise<void>;
  dispose(): void;
}
```

`prepare()` 初始化、加载资源、使用 seed 建立自己的随机序列；`render()` 更新并完成当前时间的绘制；`dispose()` 释放资源，可以在正常生命周期结束时调用。背景应保留创建的 Canvas／DOM 引用；宿主元素只用于初次挂载。

可直接参考 classic 目录的 `particles.ts`：它按绝对时间计算位置，不会自行运行循环，内部位图响应 pixelScale。需要时在 classic 的 background 配置中使用这个工厂，仍属于同一个主题。

网页当前按 `supportsSeeking: false` 提供基础协议能力。若新增带历史积分的背景，需要确保 prepare／reset 初始化完整状态，每次 render 处理固定帧；不要因为数值图表能按绝对时间计算，就将整个网页改成 supportsSeeking: true。

主题图片也应使用静态图片；动效使用视频或代码。接入前按协议检查重复帧、返回后静止、完整／片段一致和高 DPR 绘图。
