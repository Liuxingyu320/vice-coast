"""Triangulate CityGML rings and pack original charts for Blender and the offline game."""

from collections import Counter
from pathlib import Path
import json, math, pickle, sys
import numpy as np
import mapbox_earcut as ear
from PIL import Image
from shapely.geometry import Polygon, Point, box
from shapely.prepared import prep
from shiba_site import geo
from extract import geompolys, TOWER
from photo import pixel


class Mesh:
    def __init__(self):
        self.v = []
        self.uv = []
        self.f = []
        self.mi = []

    def add(self, rings, uvs, mat):
        pts = np.concatenate(rings)
        normal = np.cross(rings[0], np.roll(rings[0], -1, axis=0)).sum(0)
        drop = np.argmax(np.abs(normal))
        if abs(normal[drop]) < 1e-8:
            return
        xy = np.ascontiguousarray(np.delete(pts, drop, axis=1))
        fs = ear.triangulate_float64(
            xy, np.uint32(np.cumsum([len(q) for q in rings]))
        ).reshape(-1, 3)
        if not len(fs):
            return
        aa, bb, cc = pts[fs[0]]
        back = np.dot(np.cross(bb - aa, cc - aa), normal) < 0
        if back:
            fs = fs[:, ::-1]
        self.f.extend(fs + len(self.v))
        self.v.extend(pts)
        self.uv.extend(np.concatenate(uvs))
        self.mi.extend([mat] * len(fs))

    def pack(self):
        return tuple(
            np.asarray(v, dtype=t)
            for v, t in [
                (self.v, "f4"),
                (self.f, "i4"),
                (self.uv, "f4"),
                (self.mi, "i2"),
            ]
        )


def main(cache):
    features, uv, extra = pickle.load(open(cache / "surfaces.pkl", "rb"))
    layout = json.loads((cache / "layout.json").read_text())
    used = json.loads((cache / "needed.json").read_text())
    imgdir = cache / "udx/bldg"
    out = cache / "atlas"
    out.mkdir(exist_ok=True)
    placements = {}
    pages = []
    side = 2048
    pad = 2
    images = []
    for uri in used:
        im = Image.open(imgdir / uri).convert("RGB")
        # Keep the larger temple/tower charts legible while bounding texture memory on phones.
        im.thumbnail((768, 768), Image.Resampling.LANCZOS)
        images.append((uri, im))
    images.sort(key=lambda k: -k[1].height)
    x = y = row = 0
    for uri, im in images:
        w, h = im.size
        if x + w + 2 * pad > side:
            x = 0
            y += row
            row = 0
        if not pages or y + h + 2 * pad > side:
            pages.append(Image.new("RGB", (side, side), (94, 98, 100)))
            x = y = row = 0
        px = x + pad
        py = y + pad
        p = pages[-1]
        p.paste(im, (px, py))
        p.paste(im.crop((0, 0, 1, h)).resize((pad, h)), (x, py))
        p.paste(im.crop((w - 1, 0, w, h)).resize((pad, h)), (px + w, py))
        p.paste(
            p.crop((x, py, px + w + pad, py + 1)).resize((w + 2 * pad, pad)), (x, y)
        )
        p.paste(
            p.crop((x, py + h - 1, px + w + pad, py + h)).resize((w + 2 * pad, pad)),
            (x, py + h),
        )
        placements[uri] = (len(pages) - 1, px, py, w, h)
        x += w + 2 * pad
        row = max(row, h + 2 * pad)
    for i, im in enumerate(pages):
        im.save(out / f"plateau-{i:02d}.jpg", quality=92, subsampling=0)
    print("Atlas pages", len(pages), flush=True)
    mats = ["Photo", "Warm plaster", "Roof", "Glass"] + [
        f"Facade {i:02d}" for i in range(len(pages))
    ]
    h = layout["height"]
    elev = np.array(h["cm"]).reshape(h["h"], h["w"]) / 100

    def floor(x, y):
        u = np.clip((x - h["x"]) / h["step"], 0, h["w"] - 1.0001)
        v = np.clip((y - h["y"]) / h["step"], 0, h["h"] - 1.0001)
        i = int(u)
        j = int(v)
        a = u - i
        b = v - j
        return (
            elev[j, i] * (1 - a) * (1 - b)
            + elev[j, i + 1] * a * (1 - b)
            + elev[j + 1, i] * (1 - a) * b
            + elev[j + 1, i + 1] * a * b
        )

    am = json.loads((cache / "aerial.json").read_text())
    origin = am["pixelOrigin"]
    size = am["size"]

    def ortho(v):
        lat, lon = geo(*v[:2])
        u, vv = pixel(lon, lat)
        return [(u - origin[0]) / size[0], 1 - (vv - origin[1]) / size[1]]

    blocks = []
    count = Counter()
    identified = {}
    for fid, name, level, surfaces in features:
        mesh = Mesh()
        reference = Mesh()
        if not surfaces:
            continue
        allpts = np.vstack([a for _, r in surfaces for _, a in r])
        # Some LOD1 proxies have no measured base elevation; identify them explicitly.
        lift = (
            floor(*allpts[:, :2].mean(0))
            if level == 1 and abs(allpts[:, 2].min()) < 0.02
            else 0
        )
        if fid == TOWER:
            name = "東京タワー"
        for role, rr in surfaces:
            rings = [a.copy() for _, a in rr]
            if lift:
                for a in rings:
                    a[:, 2] += lift
            if any(np.any(~np.isfinite(a)) for a in rings):
                continue
            if max(a[:, 2].max() for a in rings) < -100:
                continue
            charts = [uv.get(k) for k, _ in rr]
            tex = charts[0]
            if tex and all(
                q and q[0] == tex[0] and len(q[1]) >= len(a)
                for q, a in zip(charts, rings)
            ):
                page, px, py, w, ht = placements[tex[0]]
                uu = [
                    (np.clip(q[1][: len(a)], 0, 1) * [w, ht] + [px, side - py - ht])
                    / side
                    for q, a in zip(charts, rings)
                ]
                material = 4 + page
                count["textured surfaces"] += 1
            elif role == "RoofSurface":
                uu = [np.asarray([ortho(pt) for pt in a]) for a in rings]
                material = 0
            else:
                uu = [np.zeros((len(a), 2)) for a in rings]
                material = 3 if role == "Window" else 1
            if fid == TOWER:
                reference.add(rings, uu, material)
                # These enclosed sections carry the survey's own geometry and photographs.
                low = min(a[:, 2].min() for a in rings)
                high = max(a[:, 2].max() for a in rings)
                keep = (
                    high < 43
                    or (137 < low and high < 149.8)
                    or (241 < low and high < 271)
                    or low > 330
                )
                if not keep:
                    continue
            mesh.add(rings, uu, material)
        if not mesh.f:
            continue
        shape = next((q for q in layout["footprints"] if q["id"] == fid), None)
        if shape:
            poly = Polygon(shape["rings"][0], shape["rings"][1:]).buffer(0)
            for label, x, y in layout["pins"][1:4]:
                if poly.covers(Point(x, y)) and label not in identified:
                    name = label
                    identified[label] = fid
        blocks.append(("Building", fid, name, mesh.pack()))
        if reference.f:
            blocks.append(
                ("Reference", fid, "東京タワー · PLATEAU LOD2", reference.pack())
            )
    area = Polygon(layout["boundary"])
    terrain = Mesh()
    bounded = prep(area)
    step = 10
    minx, miny, maxx, maxy = area.bounds
    for yy in np.arange(math.floor(miny / step) * step, maxy, step):
        for xx in np.arange(math.floor(minx / step) * step, maxx, step):
            tile = box(xx, yy, xx + step, yy + step)
            if not bounded.intersects(tile):
                continue
            polys = (
                [tile] if bounded.covers(tile) else geompolys(area.intersection(tile))
            )
            for p in polys:
                if p.area < 0.02:
                    continue
                xy = np.asarray(p.exterior.coords)[:-1]
                if not p.exterior.is_ccw:
                    xy = xy[::-1]
                pts = np.array([[x, y, floor(x, y)] for x, y in xy])
                terrain.add([pts], [np.asarray([ortho(v) for v in pts])], 0)
    blocks.append(("Terrain", "shiba-ground", "芝公園 · 測量地形", terrain.pack()))
    layout["sourceBuildings"] = sum(1 for group, *_ in blocks if group == "Building")
    layout["verifiedBuildings"] = identified
    print("Identification", identified, "features", len(blocks), count, flush=True)
    # Elevation at control points and identical geographic transforms are retained in the .blend.
    with (cache / "meshes.pkl").open("wb") as fp:
        pickle.dump((blocks, mats), fp, protocol=4)
    (cache / "layout.json").write_text(
        json.dumps(layout, ensure_ascii=False, separators=(",", ":"))
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]))
