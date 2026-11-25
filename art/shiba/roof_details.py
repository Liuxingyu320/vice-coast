"""Place plant on exposed, level surveyed roof faces with room to service each unit."""

from collections import defaultdict
import pickle
import numpy as np
import shapely as sh
from shapely import Polygon, Point
from station_sites import bounds_rect, TOWER, BASIN, DAIMON_A6, SHIBA_A3


def planes(v, f, roles):
    tri = v[f]
    normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    length = np.linalg.norm(normal, axis=1)
    ids = np.flatnonzero(
        (roles[f[:, 0]] == 1)
        & (normal[:, 2] > 0.9997 * length)
        & (np.ptp(tri[:, :, 2], axis=1) < 0.028)
        & (length > 0.04)
    )
    group = defaultdict(list)
    for j in ids:
        group[round(float(tri[j, :, 2].mean()), 2)].append(j)
    for z, jj in group.items():
        roof = sh.union_all(sh.polygons(tri[jj, :, :2]))
        above = tri[(tri[:, :, 2].max(1) > z + 0.14) & (length > 0.05)]
        if len(above):
            occupied = sh.union_all([Polygon(q[:, :2]).convex_hull for q in above])
            roof = roof.difference(occupied.buffer(0.36))
        for piece in sh.get_parts(roof.buffer(0)):
            if piece.geom_type == "Polygon" and piece.area >= 45:
                triangles = tri[jj]
                nearby = sh.intersects(piece, sh.points(triangles.mean(axis=1)[:, :2]))
                if not nearby.any():
                    continue
                yield piece, float(np.median(triangles[nearby, :, 2]))


def plan(cache, data):
    blocks, _ = pickle.load(open(cache / "meshes.pkl", "rb"))
    roles = pickle.load(open(cache / "roof-flags.pkl", "rb"))
    exclude = (
        set(data["templePrecinctIds"])
        | set(data["parkBuildingIds"])
        | set(data["excludedSurveyBuildings"])
        | set(data["verifiedBuildings"].values())
        | {TOWER, BASIN, DAIMON_A6, SHIBA_A3}
    )
    owners = {f["id"]: i for i, f in enumerate(data["footprints"])}
    shapes = [
        Polygon(b["rings"][0], b["rings"][1:]).buffer(0) for b in data["footprints"]
    ]
    index = sh.STRtree(shapes)
    tops = {
        owners[fid]: float(v[:, 2].max())
        for group, fid, _, (v, _, _, _) in blocks
        if group == "Building" and fid in owners
    }
    rows = []
    roof_count = 0
    for gr, fid, _, (v, f, uv, mi) in blocks:
        if gr != "Building" or fid in exclude or np.ptp(v[:, 2]) < 7.5:
            continue
        owner = owners[fid]
        if shapes[owner].area < 54:
            continue
        patches = sorted(
            planes(v, f, roles[fid]), key=lambda p: p[0].area, reverse=True
        )
        made = False
        for poly, z in patches[:3]:
            blocked = [
                shapes[j].buffer(0.28)
                for j in index.query(poly)
                if j != owner and tops[int(j)] > z + 0.12
            ]
            safe = poly.difference(sh.union_all(blocked)).buffer(
                -0.28, join_style="mitre"
            )
            if safe.is_empty or safe.area < 35:
                continue
            rim = np.asarray(poly.minimum_rotated_rectangle.exterior.coords)[:4]
            edges = np.roll(rim, -1, axis=0) - rim
            n = edges[np.argmax(np.linalg.norm(edges, axis=1))]
            n = n / np.linalg.norm(n)
            if n[0] < 0:
                n = -n
            t = np.array([-n[1], n[0]])
            placed = []

            def record(kind, c, w, d, h, direction=n):
                shape = bounds_rect(c, direction, -w / 2, w / 2, -d / 2, d / 2)
                if not safe.covers(shape.buffer(0.06)) or any(
                    shape.distance(used) < 0.27 for used in placed
                ):
                    return False
                placed.append(shape)
                rows.append(
                    [
                        owner,
                        kind,
                        *np.round(c, 4),
                        round(z, 5),
                        *np.round(direction, 7),
                        round(w, 3),
                        round(d, 3),
                        round(h, 3),
                    ]
                )
                return True

            ring = np.array(poly.exterior.simplify(0.18).coords)
            if len(ring) < 40:
                for p, q in zip(ring, ring[1:]):
                    l = np.linalg.norm(q - p)
                    if l < 4 or l > 65:
                        continue
                    tn = (q - p) / l
                    inward = np.array([-tn[1], tn[0]])
                    c = (p + q) * 0.5
                    if not poly.covers(Point(c + inward * 0.25)):
                        inward = -inward
                    record(
                        "parapet",
                        c + inward * 0.52,
                        l - 0.98,
                        0.145,
                        0.38 if z < 55 else 0.58,
                        inward,
                    )
            center = np.array(poly.representative_point().coords[0])
            coords = np.array(poly.exterior.coords) - center
            lo, hi = (
                (np.min(coords @ v0) for v0 in (t, n)),
                (np.max(coords @ v0) for v0 in (t, n)),
            )
            a, b = lo
            A, B = hi
            grid = [
                center + t * i + n * j
                for i in np.arange(a + 1.25, A, 2.15)
                for j in np.arange(b + 1.35, B, 3.15)
            ]
            grid.sort(key=lambda c: np.linalg.norm((c - center) - t * 1.1))
            specs = []
            if poly.area > 185 and np.ptp(v[:, 2]) > 14:
                specs.append(("penthouse", 2.95, 3.65, 2.55))
            if poly.area > 133 and owner % 4 == 0:
                specs.append(("tank", 2.32, 2.25, 2.42))
            count = min(9, max(1, int(poly.area / 66)))
            specs.extend([("chiller", 1.28, 2.13, 1.22)] * count)
            if poly.area > 100:
                specs.append(("duct", 0.61, 3.12, 0.46))
            if z - float(v[:, 2].min()) > 60 and not made:
                specs.append(("beacon", 0.34, 0.34, 0.85))
            for spec in specs:
                for c in grid:
                    if record(spec[0], c, *spec[1:]):
                        break
            made |= bool(placed)
        roof_count += made
    return rows
