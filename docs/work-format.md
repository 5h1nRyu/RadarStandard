# 作品文件格式 v1

作品文件夹只包含内容、通用图片和可选布局。主题在项目内管理，不从外部文件夹加载。可复制 `public/works/example/` 作为完整模板。

## 作品清单 work.json

```json
{
  "version": 1,
  "name": "我的赛季",
  "data": "data.json",
  "layout": "layout.json",
  "theme": "classic"
}
```

`layout` 可省略，导入时将得到零组件的空白画布。导入选择的是 **直接包含 work.json 的文件夹**，而非它的上级目录。文件夹可以有子目录。

所有文件路径相对于作品文件夹根目录，使用 `/`。支持中文和空格；不允许绝对路径、URL、`.`、`..`、`%`、`?`、`#` 或反斜杠。JSON 不支持注释或尾随逗号。字段名区分大小写。

## 数据 data.json

```json
{
  "version": 1,
  "name": "选手数据",
  "defaultDuration": 5000,
  "fields": {
    "name": { "label": "姓名", "kind": "text" },
    "teamname": { "label": "队名", "kind": "text" },
    "title": { "label": "标题", "kind": "text" },
    "photo": { "label": "照片", "kind": "image" },
    "points": { "label": "能力值", "kind": "numbers" },
    "rank": { "label": "排名", "kind": "numbers" },
    "rankImages": { "label": "阶段图", "kind": "images" }
  },
  "dimensions": [
    { "label": "得分", "min": 0, "max": 100, "average": 50, "format": "number", "decimals": 1 },
    { "label": "胜率", "min": 0, "max": 1, "average": 0.5, "format": "percent", "decimals": 0 },
    { "label": "场次", "min": 0, "max": 50, "average": 25, "format": "number", "decimals": 0 }
  ],
  "rankStages": [{ "label": "常规赛", "total": 40 }],
  "records": [
    {
      "id": "player-a",
      "name": "选手甲",
      "teamname": "队伍甲",
      "title": "赛季统计",
      "photo": "images/player-a.png",
      "points": [75, 0.65, 30],
      "rank": [3],
      "rankImages": ["images/stage-1.png"],
      "duration": 6000,
      "playEntranceAnimation": true
    }
  ]
}
```

`fields` 定义可绑定字段及类型，名字可自定义。`id`、`duration`、`playEntranceAnimation`、`noAnimation`、`hideAvg` 为播放元数据，不应定义为普通字段。`name` 在选手信息面板中兼作标题；其他文字也可创建独立组件绑定。

字段与组件对应：

| kind | 组件 | 每条记录的内容 |
| --- | --- | --- |
| text | 横排／竖排文字 | 字符串；`/` 表示固定换行 |
| image | 图片／图标 | 单个静态图片路径 |
| numbers | 雷达图／信息面板 | 与 dimensions 等长的数字数组 |
| numbers | 阶段排名 | 与 rankStages 等长的数字数组 |
| images | 阶段图片 | 与 rankStages 等长的图片路径数组 |

所有组件共用一个 `records` 序列。绑定 `name` 代表持续显示当前记录的 `name`，不需要分别为每位选手配置组件。重复添加同类组件时可以选择不同字段。

至少需要三个雷达维度。`min < max`；原始分数可以超出这个范围，并保留越界图形和高值高亮。排名 `0` 显示为 `-`。小数位数取 0～8 的整数。时长单位为毫秒，单项时长必须大于 0，总时长不超过 24 小时。

`playEntranceAnimation: true` 触发完整入场，并使雷达从各维度最小值开始形变；否则从前一条记录的值过渡。`noAnimation: true` 关闭默认内容切换动画，保留数值形变。`hideAvg: true` 隐藏均值轮廓。竖排文字绑定 `title` 时，空标题在演示中隐藏。

图片字段可以省略或留空，表示该记录没有这张图片。已绑定的雷达、信息、排名和阶段图片数组必须在所有记录中提供，且长度正确。所有非空图片路径都会预加载，缺少文件或无法解码时导入失败，并保留先前作品。

通用素材支持静态 PNG、JPEG、WebP、SVG。GIF、APNG、动态 WebP、含 SMIL／CSS 动画的 SVG 不允许自行播放，应转换成静态素材，或由主题的视频／代码背景明确控制时间。这样普通演示和离线逐帧导出才能共用同一画面。

## 布局 layout.json

```json
{
  "version": 1,
  "canvas": { "width": 1920, "height": 1080 },
  "components": [
    {
      "id": "player-name",
      "type": "text",
      "binding": { "source": "field", "field": "name" },
      "x": 80, "y": 80,
      "width": 460, "height": 110,
      "z": 5
    }
  ]
}
```

`components: []` 就是空白布局。组件 ID 唯一；类型为 `radar`、`info`、`ranks`、`rankImages`、`image`、`icon`、`text`、`verticalText`、`progress`、`verticalProgress`。允许同类的多个实例，最多 200 个。

绑定有三种：

```json
{ "source": "field", "field": "photo" }
{ "source": "fixed", "value": "固定标题/第二行" }
{ "source": "timeline", "scope": "global" }
```

固定内容用于文字、图片、图标，固定图片的 value 为作品内的相对路径。进度条只能绑定时间轴，scope 为 `item` 或 `global`。

位置、宽高均为设计像素，与编辑器显示比例无关。最小尺寸 10×10，组件边界必须在画布内，z 为非负整数。导入完整替换组件列表，包含绑定和层级；主题字号及背景不写进布局。不同主题使用同一个布局。

编辑器的本地布局缓存以作品名称区分。为不同作品使用不同名称；本地缓存只保存布局，不保存本地图片和数据。重新打开网页后需先加载相应作品，再点击「恢复本地布局」。
