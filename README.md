# 东京湾街区 · 芝公园

[下载可离线游玩的游戏整合包](https://github.com/Liuxingyu320/vice-coast/releases/download/shiba-game-2026-11-26/tokyo-bay-shiba.zip)。解压后双击包内的 `index.html`。

打开 `index.html`，里科会在增上寺三解脱门对面的街边步行登场。与玛拉交谈可开始《海浪账本》。封套、演出、母带交接和续章《午夜暗频》都位于这片街区。任务选择、报酬、车库涂装和改装使用原游戏的存档。游戏会另存芝公园的位置，下次从街上步行继续。

| 操作 | 按键 |
| --- | --- |
| 步行与奔跑 | WASD 或方向键，按住 Shift 奔跑 |
| 环视 | 拖动游戏画面 |
| 交谈、调查 | E 或点击场景提示 |
| 任务手记、街区地图 | J、M，也可点击当前任务或左下角小地图 |
| 私人车库 | G，在车库选择车辆并呼叫 |
| 上车、停车后下车 | 靠近车辆按 F |
| 驾驶 | W 油门、S 刹车／倒车、A 与 D 转向、空格手刹、Shift 加速 |
| 暂停 | Esc 或 P |

暂停菜单内的「原作章节与委托」可进入原版街区，继续原来的出租车委托、计时赛车与其他活动。两个街区共享任务与余额，各自保存位置。触摸设备提供方向键、交互、车库与驾驶按钮。

## 街区来源

建筑、道路、地形和影像取自 Procedural Tokyo 的 Shiba 区域，使用上游真实地图分块。三解脱门按原门楼位置和屋脊朝向重建。近景使用详细模型，远景按建筑轮廓和高程绘制，重复顶点按完整材质属性合并。源数据已清理 2,072 个停车点。玩家叫出的车辆使用东京湾街区原有的模型和驾驶逻辑。[项目源码](https://github.com/jeantimex/tokyo/tree/1984760653e4800adeadcb3505b1e92347415dc3) · [数据来源与许可](assets/procedural-shiba/NOTICE.txt)

## 从源码构建

可直接双击随包附带的 `index.html` 离线游玩。修改源码后，用 Node.js 22.12 或更新版本在项目目录中运行以下命令。

```sh
npm ci
npm run build
npm run check:shiba
npm run check:shiba-browser
```

`check:shiba` 校验地图分块、停车点和模型索引。浏览器测试用本机 Chrome 的临时档案验证步行、任务、叫车、驾驶、存档、原作入口和触屏操作。可用 `CHROME_BIN` 指定 Chrome，用 `GAME_SCREENSHOTS` 指定实机截图输出目录。

游戏接入位于 `src/shiba/procedural/`，共用剧情和车辆动力学位于 `src/ledger-story.js`、`src/midnight.js` 和 `src/vehicle-motion.js`。街区渲染入口为 `vendor/procedural-tokyo/src/main.js`。如要编辑门楼，可使用 NumPy、Pillow 与 `art/procedural-shiba/prepare-gate.py`。`npm run pack:source` 在上一级目录导出可玩的游戏和构建源码。
