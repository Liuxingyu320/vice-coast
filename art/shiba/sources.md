# 芝公园、东京塔与大门

场景采用米制局部坐标。X 轴朝东，Y 轴朝北，高度采用测绘数据的海拔。局部原点取东京塔测绘模型塔尖所在经纬度，东经 139.74544604°、北纬 35.65858857°。

- 建筑几何、原始立面影像、地形采自东京都公开的港区 2025 年度 CityGML。游览区内截取 636 栋 LOD2 建筑和实测桥梁，保留建筑 ID 和原有贴图坐标，将贴图合并为图集。边界外围的近邻建筑和高楼保留同批资料的 LOD2 立面；更远处使用 LOD1 轮廓。全域俯瞰时隐藏外围模型。按 CC BY 4.0 使用和加工。 [港区数据目录](https://www.geospatial.jp/ckan/dataset/plateau-13103-minato-ku-2025) · [PLATEAU 开放许可](https://www.mlit.go.jp/plateau/faq/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- 地表使用日本国土地理院「全国最新写真（シームレス）」航拍瓦片。航拍图按经纬度投影到地表，近景叠加草叶、泥土或碎石肌理。来源为地理院タイル，影像随采集时间分片。 [地理院瓦片目录](https://maps.gsi.go.jp/development/ichiran.html)
- 树冠外形取自东京都 2024 年公开的区部航空激光点云。结合航拍颜色识别植被，提取树冠高度。树干与枝条是按树冠估计的简化几何。东京塔的原始测量点和官方建筑外壳保存在 Blender 隐藏参考集合中。 [东京都区部点云](https://www.geospatial.jp/ckan/dataset/tokyopc-23ku-2024)
- 道路中心线、步道、路口和兴趣点来自 © OpenStreetMap contributors，按 ODbL 1.0 使用。地图边界沿道路截取，在大门路口和芝公园站展开。可再次使用的道路数据位于场景布局文件。 [OpenStreetMap 版权与许可](https://www.openstreetmap.org/copyright)
- 东京塔保留原测绘塔基、主展望台和上部封闭结构的原始几何与照片贴图。开放式钢架与弧形拱按激光截面重建，塔尖按官方塔高 333 米校准。官方将两处展望台标作 150 米和 250 米；几何位置采用测绘数据的海拔坐标。单根杆件与个别街面细节属于近似外观。 [东京塔官方资料](https://www.tokyotower.co.jp/plan/towerpedia/) · [增上寺境内图](https://www.zojoji.or.jp/keidai/)

建筑和航拍来自不同年度，外立面、广告、临时施工、人流和车辆会变化。三解脱门按采集时外观表达，寺方另有近期修缮公告。 [三解脱门修缮公告](https://www.zojoji.or.jp/news/1339.html)

从点云提取 635 个候选树位，按车道、建筑、可用人行道宽度和冠幅净空保留 540 株。冠高和冠幅来自点云，树种、分枝及叶簇按近似外观重建。电子路口名牌取自 OSM 的具名节点，导向箭头沿街区单向路网计算。站牌、候车亭、长椅、邮筒、售货机与公共自行车位采用 OSM 点位，并按完整占地过滤。杆位、橱窗、雨棚、店名和夜间亮窗属于街景复原。店内陈列与叶簇使用生成的参考纹理。

三解脱门按寺方公布的面阔 19.5 米、进深 9 米、高 21 米，以及文化厅登记的五间三户、二层入母屋结构重建。两座门的方位和基准高度取自各自的 PLATEAU 屋脊及底面。原测绘外壳可在 Blender 的隐藏参考集合内查看。木作、瓦脊和灯笼为近景美术复原。 [增上寺公布的尺寸](https://www.zojoji.or.jp/mame/) · [文化厅登记资料](https://kunishitei.bunka.go.jp/heritage/detail/102/511)

大殿正面的双层瓦檐、柱廊、上层栏杆和石阶依实测屋脊方向、檐口高度与寺方正面照片复原。石阶随庭院高程起步，设置寺方记载的 25 级，建有独立的踏步前缘和两道金属扶手。附属建筑保留测绘构型与影像底色，木格、灰泥、板墙的细部按 1.8 米开间复原。高架单独保留测绘桥面、桥墩以及游览区外相邻桥跨，其车道纹理沿高架中心线铺设。[增上寺建筑与石阶](https://www.zojoji.or.jp/keidai/)

机动车道优先采用 OSM 的实测宽度，缺失时使用车道数及道路等级估算。Shapely 合并全部车道，切出 3.2 米人行道并扣除建筑占地。标线、盲道、路缘与 5 米 DEM 的三角形折线共同分割后使用 Earcut 三角化。路缘高 0.14 米，路面与步道外沿的裙边深 0.4 米。道路对测绘高程作受纵坡和横坡约束的拟合，外围 48 米范围内逐渐接回背景高程。售货机、候车亭和临街雨棚均按模型占地与使用方向检查。

636 栋建筑的实测底圈均延伸至原始与整平地形以下至少 3.5 米。两座寺门按柱础和侧翼下探，保留中央通道。633 栋普通建筑逐栋检查屋顶投影，东京塔的开放钢架与门楼另行核查。实拍立面保留原始 UV，缺图处使用四套 1024 像素立面，八层纹理对应真实 26.4 米。176 个临街开间增加实体门框、窗台、把手与雨棚。

## 从公开数据重建

已打包的 Blender 工程可直接打开。时间轴第 1、2、3 帧分别切换增上寺方向、街区全域与公园步行视角。公开数据重建需要 Blender 4.5、Python、本机 Chrome 和数 GB 临时空间。在仓库根目录执行以下命令，缓存目录可复用。OSM 和国土地理院影像会随发布更新，未来下载可能与本版不同。

```sh
python3 -m venv /tmp/shiba-build-env
. /tmp/shiba-build-env/bin/activate
pip install requests numpy scipy "shapely>=2.1" lxml pillow mapbox-earcut laspy pyproj mapbox-vector-tile
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
python art/shiba/materials.py "$SHIBA_CACHE"
python art/shiba/prepare_pavement.py "$SHIBA_CACHE"
python art/shiba/prepare_horizon.py "$SHIBA_CACHE"
python art/shiba/viaducts.py "$SHIBA_CACHE"
python art/shiba/prepare_frontages.py "$SHIBA_CACHE"
python art/shiba/prepare_props.py "$SHIBA_CACHE"
python art/shiba/ground_cover.py "$SHIBA_CACHE"
npm ci
node art/shiba/bake_facade.cjs "$SHIBA_CACHE"
blender -b --python-exit-code 1 -P art/shiba/build_blender.py -- "$SHIBA_CACHE"
npm run check:shiba
npm run build
node checks/shiba-map-views.cjs
```
