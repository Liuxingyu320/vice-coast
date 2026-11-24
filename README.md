# 棕榈海岸 · VICE COAST

原创 3D 海滨城市浏览器游戏。玩家可以在街区步行、开车、和街坊交谈，完成《海浪账本》与《午夜暗频》的分支剧情，也可以自由漫游。

## 本地试玩

用 Git 克隆仓库，或从 GitHub 的 **Code → Download ZIP** 下载项目。安装 Node.js 后，在项目目录依次执行下面两条命令。

```sh
npm ci
npm run build
```

用浏览器打开生成的 `index.html`。游戏资源已经打包进该文件，可以离线玩。进度保存在当前浏览器里。

- **WASD / 方向键**移动或开车，**空格**跳跃或手刹，**E** 交谈和互动，**F** 就近上车或下车。
- **M** 查看地图，**J** 查看工作，**G** 打开车库，**Esc** 暂停。
- 手机上可以用游戏里的触屏按键。

## 修改项目

| 文件 | 用途 |
| --- | --- |
| [src/](src/) | 任务与对话、城市、车辆和人物行为、界面 |
| [assets/](assets/) | 游戏用的 GLB 模型、封面和可在 Blender 打开的工程 |
| [art/build_street_studio.py](art/build_street_studio.py) | 生成街头车辆与人物的 Blender 脚本 |
| [checks/](checks/) | 路口、人物路线和车辆停车点的场景检查 |

改动后重新运行 `npm run build`。修改街景或停车点时，可用 `npm run check:city` 验证。检查需要 Chrome 或 Chromium，非默认安装位置可用 `CHROME_BIN` 指定浏览器路径。

碰撞音频取自 Freesound 的 CC0 素材。轻碰使用 qubodup 的 [Clank Car Crash Collision](https://freesound.org/people/qubodup/sounds/151624/)，基于 moxobna 的 [crash.wav](https://freesound.org/people/moxobna/sounds/40158/)。重撞和擦碰分别使用 magnuswaker 的 [Car Crash (with Glass)](https://freesound.org/people/magnuswaker/sounds/592388/) 和 [Metal Scrape](https://freesound.org/people/magnuswaker/sounds/530075/)。音频已裁剪、混为单声道并嵌入构建产物。

提交时更新源码与相关模型文件。生成的 `index.html` 由本地构建产出。

[街头车型录](棕榈海岸-街头车型录.webp) · [街头人物志](棕榈海岸-街头人物志.webp)
