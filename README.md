# 东京湾街区 · 芝公园

[下载游戏与地图编译器源码](https://github.com/Liuxingyu320/vice-coast/releases/download/shiba-open-city-2026-11-26/tokyo-bay-source.zip) · [下载可离线游玩的游戏整合包](https://github.com/Liuxingyu320/vice-coast/releases/download/shiba-open-city-2026-11-26/tokyo-bay-shiba.zip)。解压后双击包内的 `index.html`。

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

## 地图与构建

街区以东京塔为原点。陆侧边界内约 11.98 平方公里，港湾一侧沿岸线收拢。芝公园、六本木、麻布十番、虎之门、新桥、三田和竹芝由同一张可步行和驾驶的道路网连接。近景使用测绘建筑、分层路面和项目建模的地标。地图编译器将场景切成 160 米的区块，保留门洞、路缘和台阶的原始顶点。远处的楼房按测绘屋顶轮廓和高度绘制。按 M 显示全域道路图、街区名称和比例尺。点「定位里科」或放大地图可查看附近的 3D 街景。虚线标出地图边界，建筑和水道各自有碰撞。街区中的私家车辆由玩家从车库呼叫。

用 Node.js 22.12 或更新版本安装依赖和构建。源码包提供程序与界面文件。重建时将整合包中的 `assets/` 放在项目根目录。

```sh
npm ci
npm run build
npm run check:shiba
npm run check:shiba-browser
npm run check:region-browser
```

- `art/shiba-map/compile.mjs` 编译纹理、街面、桥面和远景，`src/shiba/district/` 负责场景加载、导航和游戏接入。
- 如需从原始数据重建远景轮廓，用 Python 3.10 或更新版本执行 `python3 art/shiba-map/read-city.py <建筑GML目录> ...`。用 `python3 art/shiba-map/read-land.py <街区.osm>` 更新公园与室外停车场边界。[测绘资料](art/shiba/sources.md)
- `art/shiba-map/read-region.py <OSM分片目录>` 将覆盖东京塔东西南北各 1,820 米的相邻 `.osm` 或 `.osm.gz` 分片与现有测绘模型融合，生成外围路面、步道、桥头、树木及建筑碰撞数据。生成器使用 Python、NumPy、SciPy、Shapely 2.1+ 和 mapbox-earcut。游戏和常规构建均直接使用包内的编译数据。道路与步道来自 © OpenStreetMap contributors。[地图数据说明](https://www.openstreetmap.org/copyright)
- `check:shiba` 检查打包后的几何、碰撞、任务位置与六条外围路线。`check:region-browser` 用真实按键步行越过旧边界，在外围叫车并驾驶。`check:shiba-browser` 在本机 Chrome 的离线临时档案里验证剧情、驾驶、存档和触屏输入。可用 `CHROME_BIN` 指定浏览器，`GAME_SCREENSHOTS` 指定截图目录。
- `npm run pack:source` 打包离线网页、游戏源码及构建数据。`npm run pack:code` 导出纯源码。
