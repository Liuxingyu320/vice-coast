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
from foundations import foundation_mesh
from gates import make_gate, PALETTE
from materials import FACADE
from surface_mesh import blocks_for_site
from trees import prototype
from main_hall import sanctuary
from foottown import open_shelter, foottown
from station_sites import DAIMON_A6, SHIBA_A3, BASIN
from street_reference import add_street_reference
from native_materials import detail_materials

CACHE = Path(sys.argv[sys.argv.index("--") + 1])
DEST = HERE.parents[1] / "assets"
scene = bpy.context.scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
blocks, names = pickle.load(open(CACHE / "meshes.pkl", "rb"))
layout = json.loads((DEST / "shiba-layout.json").read_text())
blocks = [b for b in blocks if b[1] != "shiba-ground"]
surface_roles = pickle.load(open(CACHE / "roof-flags.pkl", "rb"))
bridges, backdrop = pickle.load(open(CACHE / "context.pkl", "rb"))
bridges = pickle.load(open(CACHE / "viaducts.pkl", "rb"))
from bridge_feet import embed

pier_tips = []
for group, fid, title, arr in bridges:
    geometry, buried = embed(arr, layout["height"])
    blocks.append((group, fid, title, geometry))
    if fid != "skyline-viaduct":
        pier_tips.extend([[fid, *p] for p in buried])
(CACHE / "bridge-bases.json").write_text(json.dumps(pier_tips))
blocks.extend(backdrop)
pages, facades, far_ground = pickle.load(open(CACHE / "context/detailed.pkl", "rb"))
far_ground, horizon = pickle.load(open(CACHE / "horizon-grade.pkl", "rb"))
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


foundation_index = len(names)
names.append("Foundation concrete")
for mat_name in PALETTE:
    if mat_name not in names:
        names.append(mat_name)
gate_ids = {
    layout["verifiedBuildings"]["三解脱门"]: "sangedatsumon-gate",
    layout["verifiedBuildings"]["增上寺大门"]: "daimon-gate",
}
supports, gate_bases, facade_styles = {}, {}, {}
for key in [
    *FACADE,
    "Basalt shop base",
    "Roof membrane",
    "Bridge concrete",
    "Bark",
    "Leaf sprays",
    "Kerb granite",
    "Hall window",
    "Hall gilt",
    "FootTown glazing",
    "FootTown panel",
    "FootTown frame",
    "Hall handrail",
    "Stair nosing",
    "Stair riser",
    "Viaduct deck",
]:
    if key not in names:
        names.append(key)
city_materials = np.asarray([names.index(k) for k in FACADE])
temple = layout["verifiedBuildings"]["增上寺大殿"]
tower_id = "bldg_7aff4a51-be8b-405b-abe4-ac489697cbc8"
from passages import open_drive

passages = json.loads((CACHE / "passages.json").read_text())
for i, (group, fid, label, arr) in enumerate(list(blocks)):
    v, f, uv, mi = arr
    if group == "Building" and fid in gate_ids:
        reconstructed, supports[fid] = make_gate(
            arr, gate_ids[fid] == "sangedatsumon-gate", names
        )
        gate_bases[fid] = float(v[:, 2].min())
        blocks.append(("Reference", fid, label + " · PLATEAU LOD2", arr))
        blocks[i] = (group, fid, label + " · 建築復元", reconstructed)
        continue
    if group not in ("Building", "Backdrop", "Bridge") or fid == "skyline-ground":
        continue
    new = mi.copy()
    if group == "Bridge":
        new[mi == 1] = names.index("Bridge concrete")
        new[mi == 0] = names.index("Viaduct deck")
    else:
        tri = v[f]
        n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        vertical = abs(n[:, 2]) < 0.64 * np.linalg.norm(n, axis=1)
        blank = (mi == 1) | (mi == 3)
        if group == "Backdrop":
            style, (sv, sf) = horizon[0 if fid == "surveyed-skyline" else 1]
            blocks.append(
                (
                    "Backdrop",
                    fid + "-foundations",
                    label + " · 基礎",
                    (
                        sv,
                        sf,
                        np.zeros((len(sv), 2), "f4"),
                        np.full(len(sf), foundation_index, "i2"),
                    ),
                )
            )
        else:
            h = np.ptp(v[:, 2])
            style = 0 if h > 42 else 1 if h > 18 else 3 if v[:, 0].mean() > 430 else 2
        face_style = np.broadcast_to(style, (len(f),))
        style_per_vertex = np.zeros(len(v), "f4")
        style_per_vertex[f] = face_style[:, None]
        facade_styles[fid] = style_per_vertex
        new = np.where(blank & vertical, city_materials[style], new)
        new[(blank & ~vertical) | (mi == 2)] = names.index("Roof membrane")
        worship = (
            fid == temple or (fid in layout["templePrecinctIds"] and h < 24)
            if group == "Building"
            else False
        )
        if worship or fid == tower_id:
            for m in np.unique(mi):
                if not names[m].startswith("Facade "):
                    continue
                prefix = "Temple " if worship else "Tower "
                key = prefix + names[m]
                if key not in names:
                    names.append(key)
                new[mi == m] = names.index(key)
            if worship:
                new[blank & vertical] = names.index("Gate plaster")
                new[(blank & ~vertical) | (mi == 2)] = names.index("Ibushi roof tiles")
    updated = (v, f, uv, new.astype("i2"))
    if group == "Building" and fid in (DAIMON_A6, SHIBA_A3, BASIN):
        blocks.append(("Reference", fid, label + " · 測量外殻", arr))
        updated, surface_roles[fid] = open_shelter(
            updated, surface_roles[fid], fid, names
        )
    if group == "Building" and fid == tower_id:
        updated, surface_roles[fid] = foottown(
            updated, surface_roles[fid], names, layout["height"]
        )
        facade_styles[fid] = np.pad(facade_styles[fid], (0, len(updated[0]) - len(v)))
    if fid == temple and group == "Building":
        blocks.append(("Reference", fid, "大殿 · PLATEAU LOD2", arr))
        updated, surface_roles[fid], stairs = sanctuary(
            updated, surface_roles[fid], names, layout["height"]
        )
        (DEST / "shiba-hall-steps.json").write_text(
            json.dumps(stairs, separators=(",", ":")) + "\n"
        )
        facade_styles[fid] = np.pad(facade_styles[fid], (0, len(updated[0]) - len(v)))
    if group == "Building" and fid in passages:
        updated, surface_roles[fid] = open_drive(
            updated,
            surface_roles[fid],
            passages[fid],
            names.index("Bridge concrete"),
            layout["height"],
        )
        facade_styles[fid] = np.full(len(updated[0]), style, "f4")
    blocks[i] = (group, fid, label, updated)
(DEST / "shiba-gate-supports.json").write_text(
    json.dumps(supports, separators=(",", ":"))
)
foundations, foundation_owners = foundation_mesh(
    CACHE, layout, supports, gate_bases, foundation_index
)
blocks.append(("Terrain", "building-foundations", "建物 · 接地基礎", foundations))
blocks.extend(
    blocks_for_site(
        DEST / "shiba-pavement.gz",
        layout,
        json.loads((CACHE / "aerial.json").read_text()),
        names,
    )
)
from materials import SURFACE

for k, (v, f, uv, _) in pickle.load(open(CACHE / "edge-streets.pkl", "rb")).items():
    blocks.append(
        (
            "Backdrop",
            "skyline-street-" + k,
            "街区周辺 · " + k,
            (v, f, uv, np.full(len(f), names.index(SURFACE[k]), "i2")),
        )
    )
for key, (v, f, uv, _) in pickle.load(open(CACHE / "river-joinery.pkl", "rb")).items():
    material = SURFACE["water" if key == "channel" else "bank"]
    if material not in names:
        names.append(material)
    blocks.append(
        (
            "Terrain",
            "paving-" + key,
            "古川 · " + key,
            (v, f, uv, np.full(len(f), names.index(material), "i2")),
        )
    )
tree_models = {}
for kind in range(3):
    fid = "tree-prototype-" + str(kind)
    arr, normals = prototype(kind, names.index("Bark"), names.index("Leaf sprays"))
    tree_models[fid] = normals
    blocks.append(("Prototype", fid, fid, arr))
mats = []


def lin(t):
    return t / 12.92 if t <= 0.04045 else ((t + 0.055) / 1.055) ** 2.4


def rgb(h):
    return tuple(lin(int(h[i : i + 2], 16) / 255) for i in [0, 2, 4]) + (1,)


colors = {
    "Warm plaster": "b3aba0",
    **PALETTE,
    "Roof": "676b6c",
    "Glass": "64828e",
    "Ivory steel": "eff0e7",
    "International orange": "dc4c21",
    "Deck glazing": "314955",
    "Antenna steel": "a6a79f",
    "Warm windows": "c6a27a",
    "Bark": "645c4c",
    "Bridge concrete": "89918e",
    "White paint": "f2f3eb",
    "Amber paint": "eab743",
    "Asphalt section": "353c43",
    "Leaf sprays": "ffffff",
}
for idx, name in enumerate(names):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = nt.nodes.get("Principled BSDF")
    bs.inputs["Roughness"].default_value = 0.86
    if name == "Photo" or name.startswith(
        ("Facade ", "Temple Facade", "Tower Facade", "Backdrop ")
    ):
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
        filename = {
            "Roof": "Roof membrane",
            "Warm plaster": "Porcelain tile",
            "Glass": "Curtain wall",
            "Ibushi roof tiles": "Ibushi ceramic",
        }.get(name, name)
        path = (
            HERE / "leaf-spray.png"
            if name == "Leaf sprays"
            else CACHE / "surface" / (filename + ".jpg")
        )
        if path.exists():
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(str(path), check_existing=True)
            if name in ("Gate vermilion", "Gate plaster", "Gate timber"):
                nt.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
                bump = nt.nodes.new("ShaderNodeBump")
                bump.inputs["Strength"].default_value = 0.18
                bump.inputs["Distance"].default_value = 0.012
                nt.links.new(tex.outputs["Color"], bump.inputs["Height"])
                nt.links.new(bump.outputs["Normal"], bs.inputs["Normal"])
            else:
                nt.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
            if name == "Leaf sprays":
                nt.links.new(tex.outputs["Alpha"], bs.inputs["Alpha"])
                mat.surface_render_method = "DITHERED"
            if name in FACADE:
                emission = nt.nodes.new("ShaderNodeTexImage")
                emission.image = bpy.data.images.load(
                    str(CACHE / "surface" / (name + " night.jpg")), check_existing=True
                )
                nt.links.new(emission.outputs["Color"], bs.inputs["Emission Color"])
                bs.inputs["Emission Strength"].default_value = 0.16
                bs.inputs["Roughness"].default_value = 0.54
                bs.inputs["Metallic"].default_value = 0.12
            if name in ("FootTown glazing", "FootTown frame"):
                bs.inputs["Roughness"].default_value = (
                    0.24 if name == "FootTown glazing" else 0.45
                )
                bs.inputs["Metallic"].default_value = (
                    0.27 if name == "FootTown glazing" else 0.58
                )
            if name == "Hall handrail":
                bs.inputs["Roughness"].default_value = 0.37
                bs.inputs["Metallic"].default_value = 0.74
        else:
            col = rgb(colors[name])
            bs.inputs["Base Color"].default_value = col
            mat.diffuse_color = col
        if name == "Deck glazing":
            bs.inputs["Roughness"].default_value = 0.35
            bs.inputs["Metallic"].default_value = 0.22
    if name == "Gate inscription":
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(
            str(CACHE / "gate-lettering.png"), check_existing=True
        )
        nt.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
    mats.append(mat)

collections = {}


def coll(key):
    if key not in collections:
        collections[key] = bpy.data.collections.new(key)
        scene.collection.children.link(collections[key])
    return collections[key]


def make(name, arr, collection, center=True, attributes=None, radial=None, weld=False):
    v, f, uv, mi = arr
    me = bpy.data.meshes.new(name)
    offset = (v.min(0) + v.max(0)) * 0.5 if center else np.zeros(3, "f4")
    coords = np.ascontiguousarray(v - offset, dtype="f4")
    loops = f
    if weld:
        # UVs remain per face corner. Share exactly coincident survey vertices in the editable shell.
        coords, indices = np.unique(coords, axis=0, return_inverse=True)
        loops = indices[f]
    me.vertices.add(len(coords))
    me.vertices.foreach_set("co", coords.ravel())
    me.loops.add(f.size)
    me.loops.foreach_set(
        "vertex_index", np.ascontiguousarray(loops, dtype="i4").ravel()
    )
    me.polygons.add(len(f))
    me.polygons.foreach_set("loop_start", np.arange(0, f.size, 3, dtype="i4"))
    me.polygons.foreach_set("loop_total", np.full(len(f), 3, "i4"))
    used, local = np.unique(mi, return_inverse=True)
    for idx in used:
        me.materials.append(mats[idx])
    me.polygons.foreach_set("material_index", local.astype("i4"))
    u = me.uv_layers.new(name="Survey UV")
    loop_uv = uv[f].copy()
    # Box projection uses local metres on the top, and a unit horizontal tangent on diagonal walls.
    # Vertical façades retain exactly 3.3 m per storey regardless of heading or triangle aspect.
    for mat_id in used:
        mat_name = names[mat_id]
        if mat_name not in (
            *FACADE,
            "Foundation concrete",
            "Roof membrane",
            "Ibushi roof tiles",
            "Gate timber",
            "Gate vermilion",
            "Gate plaster",
            "Gate painted concrete",
            "Bridge concrete",
        ):
            continue
        subset = np.flatnonzero(mi == mat_id)
        face = v[f[subset]]
        n = np.cross(face[:, 1] - face[:, 0], face[:, 2] - face[:, 0])
        n /= np.linalg.norm(n, axis=1).clip(1e-9)[:, None]
        along = np.column_stack([-n[:, 1], n[:, 0]])
        along /= np.linalg.norm(along, axis=1).clip(1e-8)[:, None]
        along[
            (along[:, 0] < -0.0001) | ((abs(along[:, 0]) <= 0.0001) & (along[:, 1] < 0))
        ] *= -1
        scale = (
            (19.2, 26.4)
            if mat_name in FACADE
            else (2.4, 2.4)
            if mat_name != "Ibushi roof tiles"
            else (1.6, 1.12)
        )
        loop_uv[subset, :, 0] = (
            np.sum(face[:, :, :2] * along[:, None, :], axis=2) / scale[0]
        )
        loop_uv[subset, :, 1] = face[:, :, 2] / scale[1]
        top = abs(n[:, 2]) > 0.68
        loop_uv[subset[top]] = face[top, :, :2] / scale
    u.data.foreach_set(
        "uv", np.ascontiguousarray(loop_uv.reshape(-1, 2), dtype="f4").ravel()
    )
    if attributes:
        for key, values in attributes.items():
            attribute = me.attributes.new(key, "FLOAT", "POINT")
            attribute.data.foreach_set("value", np.ascontiguousarray(values, "f4"))
    if name.startswith("paving-") or name == "shiba-ground" or radial is not None:
        me.polygons.foreach_set("use_smooth", np.ones(len(f), bool))
    me.update(calc_edges=True)
    if radial is not None:
        me.normals_split_custom_set_from_vertices(radial.tolist())
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
    "Prototype": "植生｜樹形原型",
}
native_finishes = {}
for group, fid, label, arr in blocks:
    ob = make(
        (
            "原型 · "
            if group == "Prototype"
            else "地物 · "
            if group == "Terrain"
            else "測量橋梁 · "
            if group == "Bridge"
            else ""
        )
        + (label or fid),
        arr,
        coll(groups["Backdrop"] if fid == "skyline-viaduct" else groups[group]),
        center=group != "Prototype",
        weld=group
        in ("Building", "Bridge", "Backdrop", "Reference", "Tower", "Terrain"),
        radial=tree_models.get(fid),
    )
    if group in ("Terrain", "Building", "Backdrop"):
        detail_materials(ob, fid, DEST, native_finishes)
    ob["feature_id"] = fid
    if group == "Building":
        ob["survey_lod"] = 2
        if fid in gate_ids:
            ob["reconstruction"] = gate_ids[fid]
coll(groups["Reference"]).hide_render = True
coll(groups["Reference"]).hide_viewport = True
proto_collection = coll(groups["Prototype"])
for k, (x, y, z, h, r) in enumerate(layout["trees"]):
    kind = 0 if k % 11 < 6 else 1 if k % 11 < 9 else 2
    prototype_ob = proto_collection.objects["原型 · tree-prototype-" + str(kind)]
    tree = bpy.data.objects.new("樹木 %03d" % k, prototype_ob.data)
    coll(groups["Landscape"]).objects.link(tree)
    tree.location = (x, y, z)
    tree.scale = (r, r, h)
    tree.rotation_euler.z = k * 2.399963
proto_collection.hide_render = True
proto_collection.hide_viewport = True
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
if "--runtime-only" not in sys.argv:
    add_street_reference(CACHE, make, coll, names, mats)
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
if "--authoring-only" in sys.argv:
    sys.exit(0)
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
owners = {f["id"]: i for i, f in enumerate(layout["footprints"])}
batches = defaultdict(list)
for group, fid, label, arr in blocks:
    if group in ("Reference", "Landscape"):
        continue
    v, f, uv, mi = arr
    if group == "Building":
        key = gate_ids.get(fid, "Survey buildings")
    else:
        key = fid
    batches[key].append((fid, arr))
objs = []
for k, parts in batches.items():
    vv = []
    ff = []
    uu = []
    ii = []
    off = 0
    id_arrays, roof_arrays, style_arrays = [], [], []
    for fid, (v, f, uv, mi) in parts:
        if fid in facade_styles:
            style_arrays.append(facade_styles[fid])
        if fid in owners:
            id_arrays.append(np.full(len(v), owners[fid], "f4"))
            roof_arrays.append(
                surface_roles[fid] if fid not in gate_ids else np.zeros(len(v), "f4")
            )
        vv.append(v)
        ff.append(f + off)
        uu.append(uv)
        ii.append(mi)
        off += len(v)
    objs.append(
        make(
            k,
            tuple(map(np.concatenate, (vv, ff, uu, ii))),
            coll("Runtime only"),
            False,
            {
                **(
                    {
                        "_FEATURE_ID": np.concatenate(id_arrays),
                        "_SURVEY_ROLE": np.concatenate(roof_arrays),
                    }
                    if id_arrays
                    else {}
                ),
                **(
                    {"_FEATURE_ID": foundation_owners}
                    if k == "building-foundations"
                    else {}
                ),
                **(
                    {"_FACADE_STYLE": np.concatenate(style_arrays)}
                    if style_arrays
                    else {}
                ),
            },
            tree_models.get(k),
        )
    )
objs[0]["attribution"] = scene["attribution"]


def asset_group(name):
    if name.startswith("paving-"):
        return "pavement"
    if "skyline" in name:
        return "horizon"
    return "park"


for group in ("park", "pavement", "horizon"):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        if asset_group(ob.name) == group:
            ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(DEST / f"shiba-{group}.glb"),
        export_format="GLB",
        use_selection=True,
        export_attributes=True,
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
