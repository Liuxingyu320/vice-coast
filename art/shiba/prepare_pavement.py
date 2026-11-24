"""Clip the entire pedestrian realm against the union of surveyed motor roads, in metres."""

from pathlib import Path
import gzip, json, math, sys
import mapbox_earcut as ear
import numpy as np
from shapely import STRtree, union_all, intersection, box
from shapely.geometry import Polygon, LineString
from shapely.ops import substring

ROOT = Path(__file__).resolve().parents[2]


def polygons(shape):
    if shape.geom_type == "Polygon":
        if shape.area > 0.0002:
            yield shape
    elif hasattr(shape, "geoms"):
        for part in shape.geoms:
            yield from polygons(part)


def main():
    data = json.loads((ROOT / "assets/shiba-layout.json").read_text())
    region = Polygon(data["boundary"])
    buildings = union_all(
        [Polygon(f["rings"][0], f["rings"][1:]).buffer(0) for f in data["footprints"]]
    )
    lines, widths, paved, outer = [], [], [], []
    for (kind, pts), info in zip(data["roads"], data["roadInfo"]):
        if kind != "road":
            continue
        line = LineString(pts)
        width = info[0]
        lines.append(line)
        widths.append(width)
        paved.append(line.buffer(width / 2, cap_style="flat", quad_segs=5))
        outer.append(
            line.buffer(
                width / 2 + min(3.5, 2.8 + max(0, width - 5) * 0.09),
                cap_style="flat",
                quad_segs=5,
            )
        )
    road = union_all(paved).intersection(region)
    # One Boolean operation for every intersection, irrespective of OSM node sharing or road angle.
    envelope = union_all(outer).intersection(region)
    walk = envelope.difference(buildings).difference(road)
    # Narrow median gaps between divided ways and shallow forecourts get their own finish.
    medians = (
        envelope.buffer(2.5, quad_segs=4).buffer(-2.5, quad_segs=4).difference(envelope)
    )
    aprons = buildings.buffer(2.6, quad_segs=3).intersection(
        envelope.buffer(4.2, quad_segs=3)
    )
    infill = (
        medians.union(aprons)
        .intersection(region)
        .difference(buildings)
        .difference(envelope)
    )

    curb = (
        road.buffer(0.205, quad_segs=3)
        .difference(road.buffer(0.012))
        .intersection(walk)
    )
    tactile = (
        road.buffer(0.84, quad_segs=3)
        .difference(road.buffer(0.53, quad_segs=3))
        .intersection(walk)
    )
    paints = {"white": [], "yellow": []}
    tree = STRtree(paved)
    for idx, (line, width, surface) in enumerate(zip(lines, widths, paved)):
        if width < 5.5:
            continue
        others = union_all(
            [
                paved[j]
                for j in tree.query(surface.buffer(0.6), predicate="intersects")
                if j != idx
            ]
        )

        def stripe(shape, color):
            paints[color].append(
                shape.intersection(surface).difference(others.buffer(0.32))
            )

        for sign in [-1, 1]:
            stripe(
                line.offset_curve(sign * (width / 2 - 0.35)).buffer(
                    0.095, cap_style="flat"
                ),
                "white",
            )
        if width >= 9:
            stripe(line.buffer(0.11, cap_style="flat"), "yellow")
        if width >= 6.2:
            if width >= 11:
                offsets = [-width * 0.245, width * 0.245]
            elif width < 9:
                offsets = [0]
            else:
                offsets = []
            for offset in offsets:
                path = line.offset_curve(offset) if offset else line
                for t in np.arange(0, path.length, 8):
                    stripe(
                        substring(path, t, min(t + 3.35, path.length)).buffer(
                            0.105, cap_style="flat"
                        ),
                        "white",
                    )
    layers = dict(
        asphalt=road,
        sidewalk=walk,
        forecourt=infill,
        curb=curb,
        tactile=tactile,
        **{k: union_all(v).intersection(region) for k, v in paints.items()},
    )
    packed = {}
    for name, region_mesh in layers.items():
        # Subdivide before triangulation: even a long straight curb follows each 5 m DEM cell.
        pts, triangles, lut = [], [], {}

        def index(point):
            q = tuple(int(round(c * 1000)) for c in point)
            if q not in lut:
                lut[q] = len(pts) // 2
                pts.extend(q)
            return lut[q]

        for poly in polygons(region_mesh):
            x0, y0, x1, y1 = poly.bounds
            xx, yy = np.meshgrid(
                np.arange(math.floor(x0 / 5) * 5, x1, 5),
                np.arange(math.floor(y0 / 5) * 5, y1, 5),
            )
            for clipped in intersection(
                box(xx.ravel(), yy.ravel(), xx.ravel() + 5, yy.ravel() + 5), poly
            ):
                for p in polygons(clipped):
                    rings = [
                        np.array(r.coords)[:-1] for r in [p.exterior, *p.interiors]
                    ]
                    xy = np.concatenate(rings)
                    ids = [index(q) for q in xy]
                    faces = ear.triangulate_float64(
                        xy, np.uint32(np.cumsum([len(r) for r in rings]))
                    ).reshape(-1, 3)
                    for a, b, c in faces:
                        if len({ids[a], ids[b], ids[c]}) == 3:
                            triangles.extend([ids[a], ids[b], ids[c]])
        packed[name] = [pts, triangles]
        print(
            name,
            len(pts) // 2,
            len(triangles) // 3,
            round(region_mesh.area, 2),
            flush=True,
        )
    for label, shape in [
        ("curb", curb),
        ("sidewalk", walk),
        ("tactile", tactile),
        ("forecourt", infill),
    ]:
        assert shape.intersection(road).area < 0.0001, label
    payload = json.dumps(packed, separators=(",", ":")).encode()
    (ROOT / "assets/shiba-pavement.gz").write_bytes(
        gzip.compress(payload, compresslevel=9, mtime=0)
    )


if __name__ == "__main__":
    main()
