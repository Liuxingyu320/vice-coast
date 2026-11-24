"""Retain official photographed façades for the tall and near buildings visible behind the park."""

from pathlib import Path
import json, pickle, sys, math, shutil
import numpy as np
from lxml import etree as E
from shapely.geometry import Polygon, Point
from scipy.spatial import cKDTree
from PIL import Image
from extract import primary, polygon_rings, GID, get_images
from prepare_mesh import Mesh
from shiba_site import geo, en
import photo


def build(cache):
    ctx = cache / "context"
    ctx.mkdir(exist_ok=True)
    paths = [*(cache / "udx/bldg").glob("*.gml"), *(ctx / "udx/bldg").glob("*.gml")]
    data = json.loads((cache / "layout.json").read_text())
    area = Polygon(data["boundary"])
    omit = {f["id"] for f in data["footprints"]}
    buildings = []
    usedrings = set()
    ids = []
    floors = []
    for path in sorted(paths):
        for _, ob in E.iterparse(
            str(path), events=("end",), tag="{*}Building", huge_tree=True
        ):
            fid = ob.get(GID)
            if fid in omit:
                ob.clear()
                continue
            base = ob.find(".//{*}lod0RoofEdge//{*}posList")
            if base is None:
                ob.clear()
                continue
            a = np.fromstring(base.text, sep=" ").reshape(-1, 3)
            x, y = en(*a[:, :2].mean(0))
            d = area.distance(Point(x, y))
            h = float(ob.findtext("{*}measuredHeight", "0"))
            if not d or math.hypot(x, y) > 1650:
                ob.clear()
                continue
            if d > 140 and h < 45:
                ob.clear()
                continue
            surfaces = []
            for po in primary(ob, 2):
                rings = polygon_rings(po)
                if not rings:
                    continue
                surfaces.append(rings)
                usedrings.update(k for k, _ in rings if k)
            if surfaces:
                buildings.append(surfaces)
                ids.append(fid)
                z = min(a[:, 2].min() for rr in surfaces for _, a in rr)
                if -2 < z < 65:
                    floors.append([x, y, z])
            ob.clear()
    charts = {}
    for path in sorted(paths):
        for _, ob in E.iterparse(
            str(path), events=("end",), tag="{*}ParameterizedTexture", huge_tree=True
        ):
            uri = ob.findtext("{*}imageURI")
            for q in ob.iterfind(".//{*}textureCoordinates"):
                key = q.get("ring", "").lstrip("#")
                if key in usedrings:
                    charts[key] = uri, np.fromstring(q.text, sep=" ").reshape(-1, 2)
            ob.clear()
    wanted = sorted({u for u, _ in charts.values()})
    print("Context photographed buildings", len(ids), "images", len(wanted), flush=True)
    (ctx / "needed.json").write_text(json.dumps(wanted))
    shutil.copyfile(cache / "central.zip", ctx / "central.zip")
    for uri in wanted:
        dest = ctx / "udx/bldg" / uri
        src = cache / "udx/bldg" / uri
        if src.exists() and not dest.exists():
            dest.parent.mkdir(exist_ok=True, parents=True)
            dest.hardlink_to(src)
    get_images(ctx)
    # Distant facades use smaller charts than the walkable district.
    imgs = []
    for uri in wanted:
        im = Image.open(ctx / "udx/bldg" / uri).convert("RGB")
        im.thumbnail((192, 192), Image.Resampling.LANCZOS)
        imgs.append((uri, im))
    side = 2048
    x = y = row = 0
    locations = {}
    pages = []
    for uri, im in sorted(imgs, key=lambda q: -q[1].height):
        w, h = im.size
        if x + w + 4 > side:
            x = 0
            y += row
            row = 0
        if not pages or y + h + 4 > side:
            pages.append(Image.new("RGB", (side, side), (136, 140, 142)))
            x = y = row = 0
        px = x + 2
        py = y + 2
        p = pages[-1]
        p.paste(im, (px, py))
        p.paste(im.crop((0, 0, 1, h)).resize((2, h)), (x, py))
        p.paste(im.crop((w - 1, 0, w, h)).resize((2, h)), (px + w, py))
        p.paste(p.crop((x, py, px + w + 2, py + 1)).resize((w + 4, 2)), (x, y))
        p.paste(
            p.crop((x, py + h - 1, px + w + 2, py + h)).resize((w + 4, 2)), (x, py + h)
        )
        locations[uri] = (len(pages) - 1, px, py, w, h)
        x += w + 4
        row = max(row, h + 4)
    for k, p in enumerate(pages):
        p.save(ctx / f"far-{k:02}.jpg", quality=87)
        p.resize((768, 768), Image.Resampling.LANCZOS).save(
            ctx / f"runtime-far-{k:02}.jpg", quality=88
        )
    structure = Mesh()
    ground = Mesh()
    for surfaces in buildings:
        for rr in surfaces:
            rings = [a for _, a in rr]
            maps = [charts.get(key) for key, _ in rr]
            if maps[0] and all(
                m and m[0] == maps[0][0] and len(m[1]) >= len(a)
                for m, a in zip(maps, rings)
            ):
                k, px, py, w, h = locations[maps[0][0]]
                uv = [
                    (np.clip(m[1][: len(a)], 0, 1) * [w, h] + [px, side - py - h])
                    / side
                    for a, m in zip(rings, maps)
                ]
                structure.add(rings, uv, 3 + k)
            else:
                structure.add(rings, [np.zeros((len(a), 2)) for a in rings], 1)
    # Context ground is used only in street views. Sample nearby surveyed base
    # elevations for the distant terrain and project a lower resolution GSI orthophoto.
    if not (ctx / "aerial.jpg").exists():
        photo.ZOOM = 16
        lat0, lon0 = geo(-1850, -1850)
        lat1, lon1 = geo(1850, 1850)
        photo.BOUNDS = (lon0, lat0, lon1, lat1)
        photo.build(ctx)
    photo.ZOOM = 16
    am = json.loads((ctx / "aerial.json").read_text())
    coords = np.array(floors)
    tree = cKDTree(coords[:, :2])
    hgrid = data["height"]

    def pt(x, y):
        lat, lon = geo(x, y)
        u, v = photo.pixel(lon, lat)
        uv = [
            (u - am["pixelOrigin"][0]) / am["size"][0],
            1 - (v - am["pixelOrigin"][1]) / am["size"][1],
        ]
        gx, gy = round((x - hgrid["x"]) / 5), round((y - hgrid["y"]) / 5)
        if 0 <= gx < hgrid["w"] and 0 <= gy < hgrid["h"]:
            z = hgrid["cm"][gy * hgrid["w"] + gx] / 100
        else:
            d, i = tree.query([x, y], k=5)
            w = 1 / np.maximum(8, d)
            z = np.dot(coords[i, 2], w) / w.sum()
        return [x, y, z - 1.9], uv

    for y in range(-1820, 1820, 35):
        for x in range(-1820, 1820, 35):
            if (
                x * x + y * y > 1800**2
                or area.covers(Point(x + 17.5, y + 17.5))
                and area.boundary.distance(Point(x + 17.5, y + 17.5)) > 42
            ):
                continue
            v, uv = zip(
                *[
                    pt(a, b)
                    for a, b in [(x, y), (x + 35, y), (x + 35, y + 35), (x, y + 35)]
                ]
            )
            ground.add([np.asarray(v)], [np.asarray(uv)], 2)
    (ctx / "fine_ids.json").write_text(json.dumps(ids))
    with (ctx / "detailed.pkl").open("wb") as f:
        pickle.dump((len(pages), structure.pack(), ground.pack()), f, protocol=4)
    print(
        "Finished backdrop", len(ids), "buildings,", len(pages), "atlases", flush=True
    )


if __name__ == "__main__":
    build(Path(sys.argv[1]))
