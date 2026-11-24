"""Blender 4.5 LTS. Read prepared survey data and create the editable and runtime scenes."""

from pathlib import Path
import sys, json, pickle, math
from collections import defaultdict
import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from tower import make_tower

CACHE = Path(sys.argv[sys.argv.index("--") + 1])
DEST = HERE.parents[1] / "assets"
scene = bpy.context.scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
blocks, names = pickle.load(open(CACHE / "meshes.pkl", "rb"))
layout = json.loads((CACHE / "layout.json").read_text())
bridges, backdrop = pickle.load(open(CACHE / "context.pkl", "rb"))
blocks.extend(bridges)
blocks.extend(backdrop)
pages, facades, far_ground = pickle.load(open(CACHE / "context/detailed.pkl", "rb"))
sky_mat = len(names)
names.append("Backdrop ortho")
names.extend(f"Backdrop facade {k:02}" for k in range(pages))
for fid, title, arr in [
    ("skyline-photofacades", "街区周辺 · 実写立面", facades),
    ("skyline-ground", "街区周辺 · 航空写真", far_ground),
]:
    v, f, uv, mi = arr
    mi = np.where(mi >= 2, mi + sky_mat - 2, mi)
    blocks.append(("Backdrop", fid, title, (v, f, uv, mi)))
blocks.append(
    ("Tower", "tower-lattice", "東京タワー · 鉄骨と展望台", make_tower(names))
)


def tube(a, b, r, top, sides):
    a = np.float64(a)
    b = np.float64(b)
    d = b - a
    d /= np.linalg.norm(d)
    u = np.cross(d, [0, 0, 1] if abs(d[2]) < 0.9 else [0, 1, 0])
    u /= np.linalg.norm(u)
    v = np.cross(d, u)
    pts = [
        o
        + rr * (u * math.cos(i * math.tau / sides) + v * math.sin(i * math.tau / sides))
        for o, rr in [(a, r), (b, top)]
        for i in range(sides)
    ]
    fs = []
    for i in range(sides):
        j = (i + 1) % sides
        fs.extend([(i, j, i + sides), (j, j + sides, i + sides)])
    return pts, fs


if (CACHE / "canopy.npz").exists():
    a = np.load(CACHE / "canopy.npz")
    v = a["v"]
    f = a["f"]
    uv = a["uv"]
    # Extend only exposed crown edges, retaining the measured surface on top.
    edges = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    _, idx, count = np.unique(
        np.sort(edges, axis=1), axis=0, return_index=True, return_counts=True
    )
    rim = edges[idx[count == 1]]
    ids, inverse = np.unique(rim, return_inverse=True)
    lower = v[ids].copy()
    lower[:, 2] -= 1.4 + 0.45 * np.sin(lower[:, 0] * 0.37 + lower[:, 1] * 0.16)
    mapped = inverse.reshape(-1, 2) + len(v)
    sides = np.vstack(
        [
            np.column_stack([rim[:, 1], rim[:, 0], mapped[:, 0]]),
            np.column_stack([rim[:, 1], mapped[:, 0], mapped[:, 1]]),
        ]
    )
    v = np.vstack([v, lower])
    uv = np.vstack([uv, uv[ids]])
    f = np.vstack([f, sides])
    blocks.append(
        (
            "Landscape",
            "laser-crowns",
            "芝公園 · レーザー樹冠",
            (v, f, uv, np.zeros(len(f), "i2")),
        )
    )
    trunk = len(names)
    names.append("Bark")
    v = []
    f = []
    for k, (x, y, z, h, r, *_) in enumerate(
        json.loads((CACHE / "trees.json").read_text())
    ):
        angle = k * 2.39996
        stem = (x + 0.17 * math.sin(angle), y + 0.17 * math.cos(angle), z + h * 0.57)
        for b, c, rs, re in [
            ((x, y, z), stem, max(0.10, h * 0.016), max(0.09, h * 0.011)),
            (
                stem,
                (
                    x + math.sin(angle) * r * 0.57,
                    y + math.cos(angle) * r * 0.57,
                    z + h * 0.84,
                ),
                0.14,
                0.07,
            ),
            (
                stem,
                (
                    x - math.sin(angle) * r * 0.57,
                    y - math.cos(angle) * r * 0.57,
                    z + h * 0.8,
                ),
                0.14,
                0.07,
            ),
        ]:
            points, faces = tube(b, c, rs, re, 6)
            f.extend(np.asarray(faces) + len(v))
            v.extend(points)
    blocks.append(
        (
            "Landscape",
            "canopy-trunks",
            "樹冠に基づく幹・枝",
            (
                np.float32(v),
                np.int32(f),
                np.zeros((len(v), 2), "f4"),
                np.full(len(f), trunk, "i2"),
            ),
        )
    )
else:
    raise RuntimeError("Missing measured canopy")
mats = []


def lin(t):
    return t / 12.92 if t <= 0.04045 else ((t + 0.055) / 1.055) ** 2.4


def rgb(h):
    return tuple(lin(int(h[i : i + 2], 16) / 255) for i in [0, 2, 4]) + (1,)


colors = {
    "Warm plaster": "b3aba0",
    "Roof": "676b6c",
    "Glass": "64828e",
    "Ivory steel": "eff0e7",
    "International orange": "dc4c21",
    "Deck glazing": "314955",
    "Antenna steel": "a6a79f",
    "Warm windows": "c6a27a",
    "Bark": "776c56",
}
for idx, name in enumerate(names):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = nt.nodes.get("Principled BSDF")
    bs.inputs["Roughness"].default_value = 0.86
    if name == "Photo" or name.startswith(("Facade ", "Backdrop ")):
        path = (
            CACHE / "aerial.jpg"
            if name == "Photo"
            else CACHE / "atlas" / ("plateau-" + name.split()[-1] + ".jpg")
        )
        if name == "Backdrop ortho":
            path = CACHE / "context/aerial.jpg"
        if name.startswith("Backdrop facade"):
            path = CACHE / "context" / ("far-" + name.split()[-1] + ".jpg")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(path), check_existing=True)
        tex.interpolation = "Linear"
        nt.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
        # Albedo comes from photography, with sunlight already in some textures.
        nt.links.new(tex.outputs["Color"], bs.inputs["Emission Color"])
        bs.inputs["Emission Strength"].default_value = 0.13
    else:
        col = rgb(colors[name])
        bs.inputs["Base Color"].default_value = col
        mat.diffuse_color = col
        if name == "Deck glazing":
            bs.inputs["Roughness"].default_value = 0.35
            bs.inputs["Metallic"].default_value = 0.22
    mats.append(mat)

collections = {}


def coll(key):
    if key not in collections:
        collections[key] = bpy.data.collections.new(key)
        scene.collection.children.link(collections[key])
    return collections[key]


def make(name, arr, collection, center=True):
    v, f, uv, mi = arr
    me = bpy.data.meshes.new(name)
    offset = (v.min(0) + v.max(0)) * 0.5 if center else np.zeros(3, "f4")
    coords = np.ascontiguousarray(v - offset, dtype="f4")
    me.vertices.add(len(coords))
    me.vertices.foreach_set("co", coords.ravel())
    me.loops.add(f.size)
    me.loops.foreach_set("vertex_index", np.ascontiguousarray(f, dtype="i4").ravel())
    me.polygons.add(len(f))
    me.polygons.foreach_set("loop_start", np.arange(0, f.size, 3, dtype="i4"))
    me.polygons.foreach_set("loop_total", np.full(len(f), 3, "i4"))
    used, local = np.unique(mi, return_inverse=True)
    for idx in used:
        me.materials.append(mats[idx])
    me.polygons.foreach_set("material_index", local.astype("i4"))
    u = me.uv_layers.new(name="Survey UV")
    u.data.foreach_set(
        "uv", np.ascontiguousarray(uv[f].reshape(-1, 2), dtype="f4").ravel()
    )
    me.update(calc_edges=True)
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    ob.location = offset
    return ob


groups = {
    "Building": "建物｜PLATEAU LOD2",
    "Reference": "測量参照｜非表示",
    "Terrain": "地形｜航空写真",
    "Tower": "東京タワー｜鉄骨",
    "Landscape": "植生｜航空レーザー",
    "Bridge": "橋梁｜PLATEAU",
    "Backdrop": "遠景｜周辺の街並み",
}
for group, fid, label, arr in blocks:
    ob = make(label or fid, arr, coll(groups[group]))
    ob["feature_id"] = fid
    if group == "Building":
        ob["survey_lod"] = 2
coll(groups["Reference"]).hide_render = True
coll(groups["Reference"]).hide_viewport = True
laser = np.load(CACHE / "tower-laser.npy")
me = bpy.data.meshes.new("東京タワー • scan returns")
me.vertices.add(len(laser))
me.vertices.foreach_set("co", laser.ravel())
me.update()
ref = bpy.data.objects.new("東京タワー · 航空レーザー照合点", me)
coll(groups["Reference"]).objects.link(ref)
credits = HERE / "sources.md"
scene["origin_longitude"] = layout["lon"]
scene["origin_latitude"] = layout["lat"]
scene["area_m2"] = layout["areaM2"]
scene["coordinates"] = "X = east, Y = north, Z = surveyed orthometric elevation, metres"
scene["attribution"] = (
    "東京都 / PLATEAU • 東京都区部航空レーザー • 地理院タイル • © OpenStreetMap contributors"
)
bpy.data.texts.new("数据来源与精度").write(credits.read_text())
scene.unit_settings.system = "METRIC"
scene.render.engine = "CYCLES"
scene.cycles.samples = 18
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 3
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world = bpy.data.worlds.new("秋空")
scene.world.use_nodes = True
world = scene.world.node_tree
bg = world.nodes.get("Background")
sky = world.nodes.new("ShaderNodeTexSky")
sky.sky_type = "NISHITA"
sky.sun_disc = False
sky.sun_elevation = math.radians(35)
sky.sun_rotation = math.radians(112)
sky.altitude = 0.02
sky.air_density = 1.2
world.links.new(sky.outputs[0], bg.inputs[0])
bg.inputs[1].default_value = 0.22
sun = bpy.data.lights.new("Sun", "SUN")
sun.energy = 2.2
sun.angle = 0.07
sun.color = (1, 0.90, 0.78)
light = bpy.data.objects.new("午後の日差し", sun)
coll("視点・照明").objects.link(light)
light.location = (400, -670, 720)
light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()


def camera(name, pos, target, lens):
    c = bpy.data.cameras.new(name)
    ob = bpy.data.objects.new(name, c)
    coll("視点・照明").objects.link(ob)
    ob.location = pos
    ob.rotation_euler = (
        (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()
    )
    c.lens = lens
    c.clip_end = 5000
    return ob


hero = camera("01｜増上寺から東京タワー", (463, -371, 123), (28, -51, 139), 30)
overview = camera("02｜芝公園・大門全域", (1070, -1435, 1270), (265, -246, 31), 42)
walking = camera("03｜芝公園から", (274, -332, 7.1), (12, -2, 148), 23)
for frame, cam in [(1, hero), (2, overview), (3, walking)]:
    marker = scene.timeline_markers.new(cam.name, frame=frame)
    marker.camera = cam
    for ob in collections[groups["Backdrop"]].objects:
        ob.hide_render = frame == 2
        ob.keyframe_insert(data_path="hide_render", frame=frame)
        ob.hide_viewport = frame == 2
        ob.keyframe_insert(data_path="hide_viewport", frame=frame)
scene.frame_start = 1
scene.frame_end = 3
scene.frame_set(1)
scene.camera = hero
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
for scr in bpy.data.screens:
    for a in scr.areas:
        if a.type == "VIEW_3D":
            s = a.spaces.active
            s.region_3d.view_perspective = "CAMERA"
            s.clip_end = 5000
            s.shading.type = "MATERIAL"
            s.shading.use_scene_world = True
            s.shading.use_scene_lights = True
            s.overlay.show_overlays = False
bpy.ops.file.pack_all()
for i in bpy.data.images:
    if i.packed_files:
        i.filepath = "//textures/" + i.name
        for p in i.packed_files:
            p.filepath = i.filepath
bpy.context.preferences.filepaths.save_version = 0
if "--runtime-only" not in sys.argv:
    bpy.ops.wm.save_as_mainfile(
        filepath=str(DEST / "芝公园与东京塔.blend"), compress=True, relative_remap=False
    )
# The distant skyline is viewed across hundreds of metres. Keep the full atlas
# inside Blender and use a smaller baked copy in the interactive renderer.
for material in mats:
    if not material.name.startswith("Backdrop facade"):
        continue
    page = material.name.split()[-1]
    small = bpy.data.images.load(str(CACHE / "context" / f"runtime-far-{page}.jpg"))
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE":
            node.image = small
# Batch only the runtime copy; the production file above retains individual editable buildings.
batches = defaultdict(list)
for group, fid, label, arr in blocks:
    if group in ("Reference", "Landscape"):
        continue
    v, f, uv, mi = arr
    if group == "Building":
        key = "Survey buildings"
    else:
        key = fid
    batches[key].append(arr)
objs = []
for k, parts in batches.items():
    vv = []
    ff = []
    uu = []
    ii = []
    off = 0
    for v, f, uv, mi in parts:
        vv.append(v)
        ff.append(f + off)
        uu.append(uv)
        ii.append(mi)
        off += len(v)
    objs.append(
        make(
            k, tuple(map(np.concatenate, (vv, ff, uu, ii))), coll("Runtime only"), False
        )
    )
objs[0]["attribution"] = scene["attribution"]
bpy.ops.object.select_all(action="DESELECT")
for ob in objs:
    ob.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(DEST / "shiba-park.glb"),
    export_format="GLB",
    use_selection=True,
    export_extras=True,
    export_normals=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
)
print(
    "SHIBA EXPORTED",
    len(blocks),
    "editable features",
    len(objs),
    "runtime batches",
    flush=True,
)
