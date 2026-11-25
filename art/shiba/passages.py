"""Open two OSM covered drives in the measured solid shells; preserve photo UVs at the cuts."""

import json
from pathlib import Path
import numpy as np
from grade import sample


def prepare(cache, data):
    from shapely import Polygon, LineString
    from shapely.ops import triangulate
    from station_sites import bounds_rect
    import xml.etree.ElementTree as ET
    from shiba_site import en

    osm = ET.parse(cache / "streets.osm")
    nodes = {
        n.get("id"): en(float(n.get("lat")), float(n.get("lon")))
        for n in osm.iterfind("node")
    }
    buildings = {
        f["id"]: Polygon(f["rings"][0], f["rings"][1:]).buffer(0)
        for f in data["footprints"]
    }
    chosen = {
        "134192181": "bldg_553c5d77-9194-40b2-9dc5-0f9271145ed3",
        "411388986": "bldg_8a064973-0f05-4c1f-875a-392171667c95",
        "988197906": "bldg_af317291-1ef0-496e-a5ce-11ec01e0383e",
    }
    result = {}
    for way in osm.iterfind("way"):
        id = way.get("id")
        if id not in chosen:
            continue
        tags = {t.get("k"): t.get("v") for t in way.iterfind("tag")}
        civic = (
            id == "134192181"
        )  # The two wings of Minato City Hall bridge the measured through street.
        assert (
            civic
            or tags.get("tunnel") == "building_passage"
            or tags.get("covered") == "yes"
        )
        pts = np.array([nodes[n.get("ref")] for n in way.iterfind("nd")])
        n = pts[-1] - pts[0]
        n /= np.linalg.norm(n)
        outline = buildings[chosen[id]]
        o = pts.mean(axis=0)
        half = 4.70 if civic else 1.82
        # Extend the mapped centreline to the two visible portals, independent of OSM way splits.
        t = np.array([-n[1], n[0]])
        q = np.asarray(outline.exterior.coords) - o
        lo = float(np.min(q @ n) - 0.25)
        hi = float(np.max(q @ n) + 0.25)
        cut = bounds_rect(o, n, -half, half, lo, hi)
        section = outline.intersection(cut)
        clear = (
            float(
                np.max(
                    sample(data["height"], np.array(section.envelope.exterior.coords))
                )
            )
            + 3.6
        )
        if civic:
            clear = 12.18  # surveyed lower edge of the upper enclosed gallery
        walls = []
        for side in [-1, 1]:
            a = o + side * t * half
            line = LineString([a + n * lo, a + n * hi]).intersection(outline)
            for edge in getattr(line, "geoms", [line]):
                if edge.geom_type == "LineString" and edge.length > 0.002:
                    xy = list(edge.coords)
                    if side < 0:
                        xy.reverse()
                    walls.extend([[*a, *b] for a, b in zip(xy, xy[1:])])
        foundation = outline.difference(cut)
        rings = [
            list(r.coords)[:-1]
            for p in getattr(foundation, "geoms", [foundation])
            for r in [p.exterior, *p.interiors]
        ]
        ceiling = [
            list(p.exterior.coords)[:3]
            for p in triangulate(section)
            if section.covers(p)
        ]
        result[chosen[id]] = dict(
            osm=id,
            origin=o.tolist(),
            sides=[t.tolist(), n.tolist()],
            half=half,
            lo=lo,
            hi=hi,
            ceilingZ=clear,
            walls=walls,
            ceiling=ceiling,
            foundations=rings,
        )
    assert len(result) == 3
    (cache / "passages.json").write_text(json.dumps(result))


def open_drive(arr, roles, spec, concrete, grid):
    v, f, uv, mi = arr
    origin = np.array(spec["origin"])
    t, n = np.array(spec["sides"])

    def cut(poly, dist):
        yes = []
        no = []
        for a, b in zip(poly, np.roll(poly, -1, axis=0)):
            da, db = dist(a), dist(b)
            (yes if da >= 0 else no).append(a)
            if (da < 0) != (db < 0):
                q = a + (b - a) * da / (da - db)
                yes.append(q)
                no.append(q)
        return np.asarray(yes), np.asarray(no)

    points = []
    indices = []
    tex = []
    mats = []
    kinds = []

    def emit(poly, mat, kind):
        if len(poly) < 3:
            return
        first = len(points)
        points.extend(poly[:, :3])
        tex.extend(poly[:, 3:])
        kinds.extend([kind] * len(poly))
        for i in range(1, len(poly) - 1):
            if (
                np.linalg.norm(
                    np.cross(poly[i, :3] - poly[0, :3], poly[i + 1, :3] - poly[0, :3])
                )
                > 1e-8
            ):
                indices.append((first, first + i, first + i + 1))
                mats.append(mat)

    h = spec["half"]
    ceiling = spec["ceilingZ"]
    planes = [
        lambda p: h - (p[:2] - origin) @ t,
        lambda p: h + (p[:2] - origin) @ t,
        lambda p: ceiling - p[2],
    ]
    for tri, mat in zip(f, mi):
        poly = np.column_stack((v[tri], uv[tri]))
        kind = roles[tri[0]]
        for plane in planes:
            if len(poly) < 3:
                break
            poly, out = cut(poly, plane)
            emit(out, mat, kind)
    for ax, ay, bx, by in spec["walls"]:
        a = np.array([ax, ay])
        b = np.array([bx, by])
        z0, z1 = sample(grid, [a, b]) - 0.17
        p = np.array([[*a, z0], [*b, z1], [*b, ceiling], [*a, ceiling]])
        emit(np.column_stack((p, p[:, :2] @ n / 2, p[:, 2] / 2)), concrete, 2)
    for triangle in spec["ceiling"]:
        p = np.array(triangle)
        if np.linalg.det(np.stack([p[1] - p[0], p[2] - p[0]])) > 0:
            p = p[::-1]
        emit(np.column_stack((p, np.full(3, ceiling), p / 2.4)), concrete, 2)
    return (
        np.float32(points),
        np.int32(indices),
        np.float32(tex),
        np.int16(mats),
    ), np.asarray(kinds, dtype="u1")


if __name__ == "__main__":
    import sys

    root = Path(__file__).resolve().parents[2]
    prepare(
        Path(sys.argv[1]), json.loads((root / "assets/shiba-layout.json").read_text())
    )
