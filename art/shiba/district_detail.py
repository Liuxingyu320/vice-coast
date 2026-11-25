"""Survey anchors, roof support planes, and non-obstructing street and park furnishings."""

import json, pickle, sys, xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
import shapely as sh
from shapely import Point, Polygon, LineString
from roof_details import plan
from station_sites import bounds_rect, BASIN
from shiba_site import en, roads_and_boundary
from grade import sample
from prepare_pavement import frame

ROOT = Path(__file__).resolve().parents[2]


def build(cache):
    d = json.loads((ROOT / "assets/shiba-layout.json").read_text())
    g = d["height"]
    area = Polygon(d["boundary"])
    buildings = [
        Polygon(f["rings"][0], f["rings"][1:]).buffer(0) for f in d["footprints"]
    ]
    solid = sh.union_all([*buildings, *[Polygon(p) for p in d["bearingFootprints"]]])
    roads = [
        (LineString(p), i)
        for (k, p), i in zip(d["roads"], d["roadInfo"])
        if k == "road"
    ]
    paths = sh.union_all(
        [
            LineString(p).buffer(min(i[0], 4) / 2)
            for (k, p), i in zip(d["roads"], d["roadInfo"])
            if k == "path"
        ]
    )
    road = sh.union_all(
        [s.buffer(i[0] / 2, quad_segs=12) for s, i in roads]
    ).intersection(area)
    walk = (
        road.buffer(3.2, quad_segs=12)
        .difference(road)
        .difference(solid)
        .intersection(area)
    )
    tactile = road.buffer(0.86, quad_segs=12).difference(
        road.buffer(0.49, quad_segs=12)
    )
    tactile = sh.union_all(
        [tactile]
        + [
            bounds_rect(q[:2], q[2:], -0.94, 0.94, 0.16, 1.10)
            for q in d["tactileApproaches"]
        ]
    )
    fx = d["fixtures"]
    fronts = json.loads((ROOT / "assets/shiba-frontages.json").read_text())
    water = sh.union_all([Polygon(q["rings"][0], q["rings"][1:]) for q in d["waters"]])
    site_obstacles = [solid, road, tactile, water] + [
        bounds_rect(q[:2], q[2:4], -q[4] / 2, q[4] / 2, 0, 1.37) for q in fronts
    ]
    site_obstacles.extend(
        Point(q[:2]).buffer(0.27)
        for key in ("lamps", "signals", "gantries")
        for q in fx[key]
    )
    site_obstacles.extend(
        LineString([q[:2] for q in row]).buffer(0.19) for row in fx["rails"]
    )
    site_obstacles.extend(
        bounds_rect(q[2:4], q[4:6], -q[9] / 2, q[9] / 2, -q[10] / 2, q[10] / 2)
        for q in fx["amenities"]
    )
    site_obstacles.extend(
        bounds_rect(
            s["mouth"],
            s["down"],
            -s["width"] / 2 - 0.12,
            s["width"] / 2 + 0.12,
            -1.6,
            s["length"],
        )
        for s in d["stations"]
    )
    excluded = sh.union_all(site_obstacles)
    sh.prepare(excluded)
    drains = d["drains"]
    osm = ET.parse(cache / "streets.osm")
    nodes = [
        (
            n.get("id"),
            np.array(en(float(n.get("lat")), float(n.get("lon")))),
            {t.get("k"): t.get("v") for t in n.iterfind("tag")},
        )
        for n in osm.iterfind("node")
    ]
    _, _, _, parks = roads_and_boundary(cache)
    plantings = []
    streetbuild = []
    placed = []
    treepoints = np.array([t[:2] for t in d["trees"]])

    def install(kind, xy, vec, w, l, permit_path=False, tree=-1, offsets=(0,)):
        n = np.asarray(vec)
        n = n / np.linalg.norm(n)
        t = np.array([-n[1], n[0]])
        for a in offsets:
            pt = xy + t * a
            footprint = bounds_rect(pt, n, -w / 2, w / 2, -l / 2, l / 2)
            if (
                not area.covers(footprint)
                or excluded.intersects(footprint)
                or any(footprint.distance(q) < 0.26 for q in placed)
            ):
                continue
            if not permit_path and paths.intersects(footprint):
                continue
            if any(
                j != tree
                for j in np.flatnonzero(
                    np.linalg.norm(treepoints - pt, axis=1) < np.hypot(w, l) / 2 + 0.22
                )
            ):
                continue
            raised = walk.covers(footprint)
            if not raised and walk.intersects(footprint):
                continue
            ground = sample(g, np.array(footprint.exterior.coords))
            if np.ptp(ground) > (0.30 if tree >= 0 else 0.17):
                continue
            row = [
                kind,
                *np.round(pt, 4),
                *np.round(n, 7),
                w,
                l,
                0.14 if raised else 0,
                tree,
            ]
            (plantings if tree >= 0 else streetbuild).append(row)
            placed.append(footprint)
            return True
        return False

    for id, xy, tags in nodes:
        if not area.covers(Point(xy)):
            continue
        if tags.get("historic") in ("toro", "stone_lantern"):
            install("lantern", xy, [0.12, 0.993], 0.86, 0.86, True)
        if (
            tags.get("tourism") == "information"
            and tags.get("information") in ("map", "guidepost", "board")
            and parks.buffer(0.8).covers(Point(xy))
            and len([r for r in streetbuild if r[0] == "parkMap"]) < 9
        ):
            near = (
                sh.ops.nearest_points(Point(xy), paths.boundary)[1]
                if not paths.is_empty
                else Point(xy + [1, 0])
            )
            n = np.array(near.coords[0]) - xy
            if np.linalg.norm(n) > 0.05:
                install("parkMap", xy, n, 1.32, 0.42, True, offsets=(0, 1.4, -1.4))
    for q in fx["amenities"]:
        kind, _, x, y, nx, ny, lift, _, _, w, l = q
        p = np.array([x, y])
        n = np.array([nx, ny])
        if kind == "vending":
            install(
                "recycle", p, n, 0.48, 0.46, True, offsets=(0.99, -0.99, 1.26, -1.26)
            )
        elif kind == "shelter" or (
            kind == "bench" and parks.covers(Point(p)) and int(q[1]) % 7 == 0
        ):
            install(
                "sorting",
                p,
                n,
                1.04,
                0.51,
                False,
                offsets=(w / 2 + 0.94, -w / 2 - 0.94, w / 2 + 1.30),
            )
    for i, q in enumerate(fx["signals"]):
        x, y, z, dx, dy = q
        n = np.array([dy, -dx])
        p = np.array([x, y])
        if i % 3 == 0:
            install(
                "utility", p, n, 0.66, 0.42, True, offsets=(0.92, -0.92, 1.34, -1.34)
            )
    for i, q in enumerate(d["trees"]):
        x, y, z, h, r = q
        p = np.array([x, y])
        pt = Point(p)
        if walk.covers(pt):
            line, _ = min(roads, key=lambda row: row[0].distance(pt))
            _, axis, n = frame(line, line.project(pt))
            for size in (1.26, 1.00, 0.77):
                if install("treeGrate", p, n, size, size, True, i):
                    break
        elif parks.covers(pt) or (220 < x < 407 and -205 < y < -65):
            rad = min(1.53, max(0.70, r * 0.62))
            install(
                "understory" if i % 4 != 0 else "mulch",
                p,
                [np.cos(i * 2.4), np.sin(i * 2.4)],
                2 * rad,
                2 * rad,
                False,
                i,
            )
    # Capture the actual measured underside where a lamp bolts to a span.
    br = pickle.load(open(cache / "viaducts.pkl", "rb"))
    bridgeLights = []
    bridgeAreas = []
    joints = json.loads((cache / "bridge-joinery.json").read_text())
    for group, fid, name, (v, f, uv, mi) in br:
        if fid.startswith("skyline"):
            continue
        tri = v[f].astype(float)
        norm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        lens = np.linalg.norm(norm, axis=1)
        mid = tri.mean(1)
        sel = (
            (norm[:, 2] < -0.68 * lens)
            & (lens > 0.2)
            & (mid[:, 2] - sample(g, mid[:, :2]) > 3.25)
        )
        q = tri[sel]
        points = q.mean(1)
        spans = sh.union_all(sh.polygons(q[:, :, :2])) if len(q) else Polygon()
        if spans.is_empty:
            continue
        bridgeAreas.append((fid, spans.area))
        if fid in joints:
            bridgeLights.extend([[fid, *row] for row in joints[fid]["lights"]])
            continue
        for ix in np.argsort(-np.abs(norm[sel, 2])):
            c = points[ix]
            p = Point(c[:2])
            if not area.covers(p) or any(
                np.linalg.norm(c[:2] - r[1:3]) < 13 for r in bridgeLights
            ):
                continue
            if road.distance(p) > 5 or c[2] - float(sample(g, c[:2])) < 4.50:
                continue
            e = q[ix][1, :2] - q[ix][0, :2]
            e = e / max(0.001, np.linalg.norm(e))
            bridgeLights.append([fid, *np.round(c, 4), *np.round(e, 6)])
    # Dedicated roadside gardens, bollards and bicycle bays occupy only verified residual space.
    for i, q in enumerate(fx["lamps"]):
        x, y, z, dx, dy = q
        p = np.array([x, y])
        n = np.array([-dy, dx])
        if i % 3 == 0 and parks.distance(Point(p)) < 12:
            install("hedge", p, n, 2.14, 0.66, False, offsets=(2.3, -2.3, 4.0, -4.0))
        if i % 7 == 2:
            install("bollard", p, n, 0.22, 0.22, True, offsets=(1.22, -1.22, 1.65))
    for i, (x, y, nx, ny, w, seed, *_) in enumerate(fronts):
        if i % 19 or x < 540:
            continue
        p = np.array([x, y])
        n = np.array([nx, ny])
        install(
            "cityBike",
            p + n * 1.84,
            n,
            1.79,
            0.62,
            True,
            offsets=(w / 2 + 1.4, -w / 2 - 1.4),
        )
    templeWalls = []
    precinct = Polygon([(242, -207), (419, -207), (419, -59), (242, -59)])
    coords = {a: xy for a, xy, _ in nodes}
    # Preserve the ends and gates of the measured low masonry enclosure. Clip where a live
    # building, pavement crossing or tree trunk occupies the OSM line.
    barrier_keepout = sh.union_all(
        [solid.buffer(0.25), road.buffer(0.35), paths.buffer(0.20), water, *placed]
        + [Point(t[:2]).buffer(0.48) for t in d["trees"]]
    )
    for way in osm.iterfind("way"):
        tags = {v.get("k"): v.get("v") for v in way.iterfind("tag")}
        if tags.get("barrier") not in ("wall", "retaining_wall"):
            continue
        pts = [
            coords[n.get("ref")] for n in way.iterfind("nd") if n.get("ref") in coords
        ]
        if len(pts) < 2:
            continue
        line = LineString(pts)
        if not precinct.covers(line.centroid):
            continue
        try:
            height = float(tags.get("height", "1.05"))
        except ValueError:
            continue
        if not 0.45 <= height <= 1.65:
            continue
        for piece in sh.get_parts(
            line.intersection(precinct).difference(barrier_keepout.buffer(0.18))
        ):
            if piece.geom_type != "LineString":
                continue
            for a, b in zip(piece.coords, piece.coords[1:]):
                if np.linalg.norm(np.subtract(a, b)) > 0.65:
                    templeWalls.append(
                        [way.get("id"), *np.round(a, 4), *np.round(b, 4), height]
                    )
    data = dict(
        templeWalls=templeWalls,
        roofs=plan(cache, d),
        street=streetbuild,
        plantings=plantings,
        drains=drains,
        sceneryLamps=json.loads((cache / "scenery-lamps.json").read_text()),
        bridgeLights=bridgeLights,
        bridgeBearings={fid: q["bearings"] for fid, q in joints.items()},
        basinId=BASIN,
    )
    path = ROOT / "assets/shiba-city-detail.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    from collections import Counter

    print(
        {k: len(v) for k, v in data.items() if isinstance(v, list)},
        Counter(q[0] for q in streetbuild + plantings),
        Counter(r[1] for r in data["roofs"]),
        flush=True,
    )


if __name__ == "__main__":
    build(Path(sys.argv[1]))
