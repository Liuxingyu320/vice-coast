# 芝公园与东京塔 · SHIBA PARK

主菜单的「进入芝公园实景」打开东京港区的米制街景。可以从芝公园步行看东京塔、到增上寺，再沿街向东到大门路口或向南到芝公园站。用「街区地图」可跳转六处地标，按 V 切换街道和全域俯瞰，按 F 切换驾驶，拖动可环视。默认以黄金黄昏进入，可即时切换蓝调初夜和晴朗午后。按 H 查看键位。

[打开 Blender 工程](assets/芝公园与东京塔.blend) · [查看街区范围](芝公园地图.webp) · [查看数据来源与建模精度](art/shiba/sources.md)

主菜单的「东京湾 · 原作剧情」和「东京湾原作漫游」保留虚构的东京湾地图及原作任务。原作地图的[可编辑工程](assets/东京湾街区.blend)包含高架电车动画。

## 本地试玩

从 Git 下载本分支后，在项目目录运行下面两条命令生成离线游戏。

```sh
npm ci
npm run build
```

用浏览器打开生成的 `index.html`。游戏资源已经打包进该文件，可以离线玩。进度保存在当前浏览器里。

- **WASD / 方向键**移动或开车。原作剧情中按 **E** 交谈和互动，**F** 上下车。
- **M** 查看地图。原作剧情中 **J** 查看工作，**G** 打开车库，**Esc** 暂停。
- 手机上可以用游戏里的触屏按键。

## 实景场景验收

`npm run check:shiba` 校验原点、建筑数量、塔尖、边界、树位、地标入口和车辆沿墙滑移。`npm run check:shiba-browser` 使用本机 Chrome 和 Playwright WebKit，对桌面、移动横屏和移动竖屏执行实际交互，记录帧时间、绘制调用与浏览器错误，并重新生成[实测截图和数据](验收/)。首次运行浏览器检查需安装 Chrome，并执行 `npx playwright install webkit`。桌面测试视口为 1280 × 800，移动 WebKit 是浏览器模拟。

道路和树位来源见[测绘说明](art/shiba/sources.md)。全图路缘、人行道、盲道与机动车道的三角面经过相交检查。主轴包含 194 个沿建筑实测底边布置的首层开间、两座复原的寺门、30 辆 AI 车辆和 66 名行人。可拖动分界线查看[三组同机位对比](验收/街景近景/同机位对比.html)。

## 修改项目

| 文件 | 用途 |
| --- | --- |
| [src/](src/) | 任务与对话、城市、车辆和人物行为、界面 |
| [assets/](assets/) | 游戏用的 GLB 模型、封面和可在 Blender 打开的工程 |
| [art/shiba/](art/shiba/) | 芝公园测绘数据处理、植被提取和 Blender 建模脚本 |
| [art/tokyo/build.py](art/tokyo/build.py) | 从 Blender 重建东京街区、游戏模型和碰撞数据 |
| [art/build_street_studio.py](art/build_street_studio.py) | 生成街头车辆与人物的 Blender 脚本 |
| [checks/](checks/) | 路口、人物路线和车辆停车点的场景检查 |

实景地图可用 `npm run check:shiba` 核对边界、六处入口、塔尖高度和离线贴图。改动后重新运行 `npm run build`。修改街景或停车点时，可用 `npm run check:city` 验证。检查需要 Chrome 或 Chromium，非默认安装位置可用 `CHROME_BIN` 指定浏览器路径。

提交时更新源码与相关模型文件。生成的 `index.html` 由本地构建产出。

[街头车型录](棕榈海岸-街头车型录.webp) · [街头人物志](棕榈海岸-街头人物志.webp)
