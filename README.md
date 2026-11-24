# 东京湾街区 · TOKYO BAY

东京湾沿岸的虚构街区。打开 [Blender 场景](assets/东京湾街区.blend) 可编辑街区模型，按空格可预览高架电车。玩家可以在街区步行、开车、和街坊交谈，完成《海浪账本》与《午夜暗频》的分支剧情，也可以自由漫游。

## 本地试玩

从 Git 下载本分支后，在项目目录运行下面两条命令生成离线游戏。

```sh
npm ci
npm run build
```

用浏览器打开生成的 `index.html`。游戏资源已经打包进该文件，可以离线玩。进度保存在当前浏览器里。

- **WASD / 方向键**移动或开车，**E** 交谈和互动，**F** 上下车。
- **M** 查看地图，**J** 查看工作，**G** 打开车库，**Esc** 暂停。
- 手机上可以用游戏里的触屏按键。

## 修改项目

| 文件 | 用途 |
| --- | --- |
| [src/](src/) | 任务与对话、城市、车辆和人物行为、界面 |
| [assets/](assets/) | 游戏用的 GLB 模型、封面和可在 Blender 打开的工程 |
| [art/tokyo/build.py](art/tokyo/build.py) | 从 Blender 重建东京街区、游戏模型和碰撞数据 |
| [art/build_street_studio.py](art/build_street_studio.py) | 生成街头车辆与人物的 Blender 脚本 |
| [checks/](checks/) | 路口、人物路线和车辆停车点的场景检查 |

改动后重新运行 `npm run build`。修改街景或停车点时，可用 `npm run check:city` 验证。检查需要 Chrome 或 Chromium，非默认安装位置可用 `CHROME_BIN` 指定浏览器路径。

提交时更新源码与相关模型文件。生成的 `index.html` 由本地构建产出。

[街头车型录](棕榈海岸-街头车型录.webp) · [街头人物志](棕榈海岸-街头人物志.webp)
