# 芝公园、东京塔与大门

场景采用米制局部坐标。X 轴朝东，Y 轴朝北，高度采用测绘数据的海拔。局部原点取东京塔测绘模型塔尖所在经纬度，东经 139.74544604°、北纬 35.65858857°。

- 建筑几何、原始立面影像、地形采自东京都公开的港区 2025 年度 CityGML。游览区内截取 636 栋 LOD2 建筑和实测桥梁，保留建筑 ID 和原有贴图坐标，将贴图合并为图集。边界外围的近邻建筑和高楼保留同批资料的 LOD2 立面；更远处使用 LOD1 轮廓。全域俯瞰时隐藏外围模型。按 CC BY 4.0 使用和加工。 [港区数据目录](https://www.geospatial.jp/ckan/dataset/plateau-13103-minato-ku-2025) · [PLATEAU 开放许可](https://www.mlit.go.jp/plateau/faq/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- 地表使用日本国土地理院「全国最新写真（シームレス）」航拍瓦片。航拍图按经纬度投影到地形和树冠表面。来源为地理院タイル，影像随采集时间分片。 [地理院瓦片目录](https://maps.gsi.go.jp/development/ichiran.html)
- 树冠外形取自东京都 2024 年公开的区部航空激光点云。结合航拍颜色识别植被，提取树冠高度。树干与枝条是按树冠估计的简化几何。东京塔的原始测量点和官方建筑外壳保存在 Blender 隐藏参考集合中。 [东京都区部点云](https://www.geospatial.jp/ckan/dataset/tokyopc-23ku-2024)
- 道路中心线、步道、路口和兴趣点来自 © OpenStreetMap contributors，按 ODbL 1.0 使用。地图边界沿道路截取，在大门路口和芝公园站展开。可再次使用的道路数据位于场景布局文件。 [OpenStreetMap 版权与许可](https://www.openstreetmap.org/copyright)
- 东京塔保留原测绘塔基、主展望台和上部封闭结构的原始几何与照片贴图。开放式钢架与弧形拱按激光截面重建，塔尖按官方塔高 333 米校准。官方将两处展望台标作 150 米和 250 米；几何位置采用测绘数据的海拔坐标。单根杆件与个别街面细节属于近似外观。 [东京塔官方资料](https://www.tokyotower.co.jp/plan/towerpedia/) · [增上寺境内图](https://www.zojoji.or.jp/keidai/)

建筑和航拍来自不同年度，外立面、广告、临时施工、人流和车辆会变化。三解脱门按采集时外观表达，寺方另有近期修缮公告。 [三解脱门修缮公告](https://www.zojoji.or.jp/news/1339.html)

游戏版使用 635 组点云树位与冠高、冠幅生成实例化乔木。榉树、黑松和樱花树的造型按美术规则分配。信号灯、过街点和道路宽度优先采用 OSM 属性，缺失宽度按道路等级估算。路侧设施、车流、行人、时段灯光和湿路反光均是运行时表现。Blender 中可查看原始树冠、建筑和塔体测量参考。

## 从公开数据重建

已打包的 Blender 工程可直接打开。时间轴第 1、2、3 帧分别切换增上寺方向、街区全域与公园步行视角。公开数据重建需要 Blender 4.5、Python 和数 GB 临时空间。在仓库根目录执行以下命令，缓存目录可复用。OSM 和国土地理院影像会随发布更新，未来下载可能与本版不同。

```sh
python3 -m venv /tmp/shiba-build-env
. /tmp/shiba-build-env/bin/activate
pip install requests numpy scipy shapely lxml pillow mapbox-earcut laspy pyproj mapbox-vector-tile
SHIBA_CACHE=/tmp/shiba-build
mkdir -p "$SHIBA_CACHE"
curl --fail 'https://api.openstreetmap.org/api/0.6/map?bbox=139.7405,35.6515,139.7563,35.6612' -o "$SHIBA_CACHE/streets.osm"
python art/shiba/fetch_city.py "$SHIBA_CACHE"
python art/shiba/photo.py "$SHIBA_CACHE"
python art/shiba/extract.py "$SHIBA_CACHE"
python art/shiba/prepare_mesh.py "$SHIBA_CACHE"
python art/shiba/canopy.py "$SHIBA_CACHE"
python art/shiba/prepare_navigation.py "$SHIBA_CACHE"
python art/shiba/context.py "$SHIBA_CACHE" --fetch-only
python art/shiba/skyline.py "$SHIBA_CACHE"
python art/shiba/context.py "$SHIBA_CACHE"
blender -b -P art/shiba/build_blender.py -- "$SHIBA_CACHE"
npm run check:shiba
npm run build
```
