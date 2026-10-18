# RadarStandard v1

纯静态的雷达图动画编辑器，使用 TypeScript 和 Vite。支持组件字段绑定、文件夹导入、16:9 布局编辑、内部主题，以及 [VideoMaker 逐帧协议 v1](https://github.com/5h1nRyu/VideoMaker/blob/main/docs/protocol-v1.md)。

## 本地开发

需要 Node.js **22.18+**（或 24 LTS）和 npm。

```sh
npm ci
npm run dev
```

打开终端显示的地址。默认是空白画布，没有自动创建的组件；可点击「加载示例作品」熟悉功能。示例保留原 demo 的 43 条数值记录，人物图片、标志及阶段图片是明确标注的占位素材，不是真实照片。

## 使用流程

1. 按 [作品格式](docs/work-format.md) 准备包含 `work.json`、数据 JSON 和图片的文件夹，点击「导入作品文件夹」。无需修改 HTML 或编辑数据代码。
2. 选择组件类型和绑定字段，点击「添加到画布」。所有字段都跟随同一条选手序列切换。
3. 拖动组件移动位置，拖动选中组件右下角改变大小；右侧可精确输入位置、尺寸，重新绑定、调整层级或删除。位置与尺寸使用 1920×1080 坐标，鼠标操作吸附 10 px 网格。
4. 拖动左右分隔线改变工作区比例，画布保持 16:9、居中且尽可能大。分隔线获得焦点后也可用左右方向键调整。
5. 编辑模式自动轮播，但关闭入场和背景运动；支持暂停、选择选手、拖动时间轴。「进入演示」展示完整主题效果。「返回编辑」或 Esc 退出演示。空格不承担控制功能。
6. 「导出布局」保存组件类型、数量、绑定、层级、位置和尺寸。「导入布局」完整替换当前组件列表，也可在编辑模式拖入布局 JSON。「恢复本地布局」可取回当前作品上次编辑的布局。首次打开始终为空白，不自动恢复。

文字、图片、图标可以绑定字段或固定内容；固定图片仍使用作品文件夹内的相对路径。进度条可选择当前选手或完整作品进度。网页不提供数据编辑。旧 `Layout.json` 不兼容。

## 发布到 GitHub Pages

`.github/workflows/pages.yml` 已配置构建和发布：

1. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. 将 v1 合并到 main 后，推送 main 自动发布。也可以在 Actions 中选择 **GitHub Pages → Run workflow**，从 v1 手动发布；若 `github-pages` 环境限定了部署分支，需要先把 v1 加入允许列表。
3. 网站地址为 `https://5h1nRyu.github.io/RadarStandard/`。如仓库名或域名变化，构建资源仍使用相对路径，无需修改 Vite 的固定仓库前缀。

此分支默认只运行验证，不会因推送 v1 就替换现有线上页面。全部静态产物位于 `dist/`；也可部署到任何静态 HTTP 服务。直接双击 HTML 的 `file://` 方式不支持模块和作品 JSON 请求。

本地检查发布产物：

```sh
npm run build
npm run preview
```

## 发布作品和 VideoMaker

把导入的作品文件夹复制到 `public/works/<作品ID>/` 并提交到仓库。作品 ID 使用字母、数字、下划线或连字符。把网页导出的 `layout.json` 放入该文件夹，并在 `work.json` 中填写 `"layout": "layout.json"`。

```text
public/works/my-season/
  work.json
  data.json
  layout.json
  images/
```

发布后使用：

```text
https://5h1nRyu.github.io/RadarStandard/?work=my-season
https://5h1nRyu.github.io/RadarStandard/?work=my-season&mode=present
```

将第一条 URL 填入 VideoMaker 即可。导出器启动时注入的标记会禁用自动轮播并强制只显示演示画布，不会出现编辑侧栏或返回按钮。作品时长来自选手展示时长之和；每位选手的形变和入场都包含在其 `duration` 内。推荐布局 1920×1080，支持提高 DPR 的 4K 输出。

网页实现完整的 `window.__VIDEO_EXPORT__` v1 生命周期，目前声明 `supportsSeeking: false`，按协议从第 0 帧顺序推进。`reset()` 重建主题背景和随机种子。全部可见效果接受同一时间轴，`renderFrame()` 等待图像解码和 Canvas 绘制完成，返回后画面保持不变。

本地导入仅存在当前浏览器，**不会自动上传到 GitHub**；VideoMaker 新开的浏览器使用 URL 指定的仓库作品，不使用个人浏览器里的临时导入或 localStorage。VideoMaker 负责输出视频，本项目本身没有视频编码后端。

## 项目结构

```text
src/
  model/       数据、布局、绑定校验、组件定义与绝对时间轴
  assets/      文件夹和 URL 加载、素材预加载与静态图片检查
  components/  组件 DOM 渲染与雷达图 Canvas 绘制
  editor/      操作面板、绑定控件、拖拽缩放和分隔线
  app/         状态、播放调度、16:9 画布和编辑器样式
  themes/      主题注册、背景生命周期及 classic 主题目录
  export/      VideoMaker 协议适配
public/works/  通过 URL 加载的作品
tests/         模型校验与真实 Chromium 集成检查
```

新增主题参考 [主题开发](docs/themes.md)，新增组件参考 [架构说明](docs/architecture.md)。

## 验证

```sh
npm test                  # 数据格式、布局、时间轴、绑定和路径校验
npm run check             # TypeScript
npm run format:check      # 代码格式；npm run format 自动整理
npm run build             # 类型检查并构建纯静态产物
npx playwright-core install --with-deps chromium
npm run test:browser      # 先 build；真实 Chromium 检查生产产物
```

也可设置 `CHROMIUM_PATH` 使用已有浏览器。浏览器检查使用 `/RadarStandard/` 子路径，包括空白启动、全部组件、缩放拖拽、布局往返、文件夹导入、错误回滚、重复帧哈希、帧完成后静止、顺序预推进和 4K 实际位图。截图和临时文件位于忽略提交的 `test-results/`。

原 main 只包含 `Temple.html`，缺少它引用的背景、Logo 和字体文件。v1 保留玻璃面板、排名高亮、雷达形变和入场／切换效果，背景使用原 CSS 的 `#0a0a0a` 后备色，字体使用系统中文字体。补齐的主题专属素材应放到 `src/themes/classic/`，作品内容图片通过作品文件夹提供。
