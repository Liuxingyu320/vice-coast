"""Build a watertight Shiba street surface in survey metres, including its DEM breaklines."""

from collections import defaultdict
from pathlib import Path
import gzip
import json
import math
import sys
import mapbox_earcut as ear
import numpy as np
import shapely as sh
from scipy.ndimage import gaussian_filter
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points, substring, unary_union
from grade import sample

ROOT = Path(__file__).resolve().parents[2]
WALK_WIDTH = 3.2
SCALE = 8192  # binary metre grid: every XY coordinate survives glTF float32 exactly


def parts(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, "geoms"):
        for member in geometry.geoms:
            yield from parts(member, kind)


def frame(line, t):
    t = max(0, min(t, line.length))
    a = line.interpolate(max(0, t - 0.55))
    b = line.interpolate(min(line.length, t + 0.55))
    tangent = np.array([b.x - a.x, b.y - a.y])
    tangent /= max(1e-8, np.linalg.norm(tangent))
    return (
        np.asarray(line.interpolate(t).coords[0]),
        tangent,
        np.array([-tangent[1], tangent[0]]),
    )


def rectangle(o, along, left, a, b, c, d):
    return Polygon(
        [o + u * along + v * left for u, v in [(a, c), (b, c), (b, d), (a, d)]]
    )


def markings(roads, paved, road, data):
    lines = [line for line, _ in roads]
    tree, belts = sh.STRtree(lines), sh.STRtree(paved)
    zebra, stops, clearance, used, sites = [], [], [], [], []
    crossing_bands = []

    def approach(i, station):
        line = lines[i]
        if 0 <= station <= line.length:
            return (*frame(line, station), paved[i])
        # OSM can start or end a way exactly on the pedestrian crossing. Continue along
        # the same carriageway for the whole setback instead of clamping to that endpoint.
        end = 0 if station < 0 else line.length
        p, axis, _ = frame(line, end)
        sign = -1 if station < 0 else 1
        outward = axis * sign
        distance = abs(station - end)
        node = Point(p)
        choices = []
        for j in tree.query(node.buffer(0.12)):
            if j == i or lines[j].distance(node) > 0.12:
                continue
            at = lines[j].project(node)
            for travel in (-1, 1):
                target = at + travel * distance
                if target < 0 or target > lines[j].length:
                    continue
                xy, d, _ = frame(lines[j], target)
                alignment = (xy - p) @ outward / max(np.linalg.norm(xy - p), 0.001)
                if alignment < 0.86:
                    continue
                tangent = d * (travel * sign)
                choices.append((alignment, xy, tangent, paved[j]))
        if not choices:
            return None
        _, xy, d, body = max(choices, key=lambda c: c[0])
        return xy, d, np.array([-d[1], d[0]]), body

    # Sidewalk crossing nodes and mast nodes never create duplicate crossings on the asphalt.
    crossing_nodes = sorted(data["crossings"], key=lambda row: row[0] != "crossing")
    for kind, x, y in crossing_nodes:
        p = Point(x, y)
        i = int(tree.nearest(p))
        line, (width, _, oneway, _) = roads[i]
        station = line.project(p)
        q, direction, left = frame(line, station)
        gap = p.distance(line)
        if kind == "traffic_signals":
            if gap <= 9:
                sites.append((q, direction, width))
            continue
        if width < 3 or gap > 1.25 or any(np.linalg.norm(k - q) < 5.4 for k in used):
            continue
        half = width / 2 - 0.12
        cross = rectangle(q, direction, left, -1.85, 1.85, -half, half)
        if kind == "crossing":
            if cross.intersection(road).area < cross.area * 0.96:
                continue
            if any(cross.intersection(other).area > 0.02 for other in crossing_bands):
                continue
            crossing_bands.append(cross)
            for v in np.arange(-half + 0.18, half - 0.12, 0.86):
                zebra.append(
                    rectangle(
                        q, direction, left, -1.85, 1.85, v, min(v + 0.48, half)
                    ).intersection(road)
                )
        # Japan drives on the left. Make one transverse line per incoming lane group.
        for sign in [-1] if oneway == "-1" else [1] if oneway == "yes" else [1, -1]:
            offset = 3.4 if kind == "crossing" else 0.2
            arm = approach(i, station - sign * offset)
            if arm is None:
                continue
            s, t, n, body = arm
            low, high = (
                (-half, half)
                if oneway != "no"
                else ((0.08, half) if sign == 1 else (-half, -0.08))
            )
            stops.append(rectangle(s, t, n, -0.19, 0.19, low, high).intersection(body))
        clearance.append(
            rectangle(q, direction, left, -3.95, 3.95, -half - 0.5, half + 0.5)
        )
        used.append(q)
    white, yellow = [], []
    for i, (line, (width, _, oneway, lanes)) in enumerate(roads):
        if width < 4.8:
            continue
        body = paved[i]
        others = []
        for j in belts.query(body, predicate="intersects"):
            if j == i:
                continue
            other = lines[j]
            # A divider through a junction is a false marking. Collinear OSM way splits remain continuous.
            a, b = nearest_points(line, other)
            _, va, _ = frame(line, line.project(a))
            _, vb, _ = frame(other, other.project(b))
            if abs(va @ vb) < 0.93:
                others.append(paved[j].buffer(0.55))
        usable = body.difference(unary_union(others))

        def stripe(path, half, output):
            if not path.is_empty:
                output.append(
                    path.buffer(half, cap_style="flat", quad_segs=5).intersection(
                        usable
                    )
                )

        for side in [-1, 1]:
            stripe(line.offset_curve(side * (width / 2 - 0.26)), 0.075, white)
        lanes = max(1, int(lanes))
        if oneway == "no" and width >= 8:
            stripe(line, 0.075, yellow)
        for lane in range(1, lanes):
            off = width * (lane / lanes - 0.5)
            if abs(off) < 0.1 and oneway == "no" and width >= 8:
                continue
            for path in parts(line.offset_curve(off) if off else line, "LineString"):
                for start in np.arange(0, path.length, 8):
                    if path.length - start > 0.12:
                        stripe(
                            substring(path, start, min(start + 3, path.length)),
                            0.075,
                            white,
                        )
    reserved = unary_union(clearance)
    z = unary_union(zebra).intersection(road)
    crossing_space = unary_union(crossing_bands).buffer(0.90)
    s = unary_union(
        [line for line in stops if line.disjoint(crossing_space)]
    ).intersection(road)
    data["crosswalkBands"] = [
        np.asarray(p.exterior.coords[:-1]).round(6).tolist() for p in crossing_bands
    ]
    y = (
        unary_union(yellow)
        .difference(reserved)
        .intersection(road)
        .difference(z.union(s))
    )
    w = (
        unary_union(white)
        .difference(reserved)
        .intersection(road)
        .difference(unary_union([z, s, y]))
    )
    return {"zebra": z, "stop": s, "white": w, "yellow": y}, sites


def grade_grid(grid, road, roads):
    """Fit the street formation through DEM escarpments with longitudinal and crossfall constraints."""
    from scipy.ndimage import distance_transform_edt, median_filter
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra

    raw = np.asarray(grid["cm"]).reshape(grid["h"], grid["w"]) / 100
    step = grid["step"]
    xx, yy = np.meshgrid(
        grid["x"] + np.arange(grid["w"]) * step, grid["y"] + np.arange(grid["h"]) * step
    )
    mask = sh.intersects_xy(road.buffer(WALK_WIDTH + step * 1.45), xx, yy)
    nodes = np.full(raw.shape, -1, dtype=int)
    nodes[mask] = np.arange(mask.sum())
    count = mask.sum()
    gx, gy = xx[mask], yy[mask]
    # The nearest measured segment defines the direction of travel at each grid node.
    segments = []
    direction = []
    for line, _ in roads:
        xy = np.asarray(line.coords)
        for a, b in zip(xy, xy[1:]):
            length = np.linalg.norm(b - a)
            if length > 0.01:
                segments.append(LineString([a, b]))
                direction.append((b - a) / length)
    ids = sh.STRtree(segments).nearest(sh.points(gx, gy))
    axis = np.asarray(direction)[ids]
    starts = []
    ends = []
    costs = []
    for dx, dy in [(1, 0), (0, 1), (1, 1), (1, -1)]:
        a = nodes[max(-dy, 0) : min(len(nodes) - dy, len(nodes)), : nodes.shape[1] - dx]
        b = nodes[max(dy, 0) : min(len(nodes) + dy, len(nodes)), dx:]
        valid = (a >= 0) & (b >= 0)
        a, b = a[valid], b[valid]

        def limit(vec):
            along = abs(vec[:, 0] * dx + vec[:, 1] * dy)
            across = abs(vec[:, 0] * dy - vec[:, 1] * dx)
            return (
                np.minimum(0.117 * math.hypot(dx, dy), 0.117 * along + 0.035 * across)
                * step
            )

        c = np.maximum(limit(axis[a]), limit(axis[b]))
        starts.extend((a, b))
        ends.extend((b, a))
        costs.extend((c, c))
    src = np.concatenate(starts)
    dst = np.concatenate(ends)
    cost = np.concatenate(costs)

    def envelope(values):
        offset = values.min() - 1
        graph = coo_matrix(
            (
                np.r_[cost, values - offset],
                (np.r_[src, np.full(count, count)], np.r_[dst, np.arange(count)]),
            ),
            shape=(count + 1, count + 1),
        ).tocsr()
        return dijkstra(graph, indices=count)[:count] + offset

    target = gaussian_filter(median_filter(raw, 3), 1.05)[mask]
    surface = (envelope(target) - envelope(-target)) * 0.5
    change = np.zeros_like(raw)
    change[mask] = surface - raw[mask]
    distance, nearest = distance_transform_edt(~mask, return_indices=True)
    feather = np.clip(1 - distance * step / 17, 0, 1)
    result = raw + change[tuple(nearest)] * feather**2 * (3 - 2 * feather)
    grid["gradeCm"] = np.rint(result * 100).astype(int).ravel().tolist()
    print(
        "Road grade adjustment, P95 / maximum (m)",
        np.percentile(abs(change[mask]), [95, 100]),
        flush=True,
    )


def partition(surfaces, region, grid):
    """Node the material interfaces and DEM breaklines together before triangulating any face."""
    x0, y0, x1, y1 = region.bounds
    step = grid["step"]
    x0, y0 = np.floor(np.array([x0, y0]) / step) * step - step
    x1, y1 = np.ceil(np.array([x1, y1]) / step) * step + step
    lines = [LineString([(x, y0), (x, y1)]) for x in np.arange(x0, x1 + 1, step)]
    lines.extend(LineString([(x0, y), (x1, y)]) for y in np.arange(y0, y1 + 1, step))
    for intercept in np.arange(y0 - x1, y1 - x0 + 1, step):
        x, X = max(x0, y0 - intercept), min(x1, y1 - intercept)
        if X > x:
            lines.append(LineString([(x, x + intercept), (X, X + intercept)]))
    source = []
    labels = []
    for key, shape in surfaces.items():
        for part in parts(shape, "Polygon"):
            source.append(part)
            labels.append(key)
            lines.append(part.boundary)
    network = sh.union_all(lines, grid_size=1 / SCALE)
    patches = sh.get_parts(sh.polygonize(sh.get_parts(network)))
    centers = sh.point_on_surface(patches)
    keep = sh.covers(region, centers)
    patches, centers = patches[keep], centers[keep]
    index = sh.STRtree(source)
    matches = index.query(centers, predicate="covered_by")
    owner = np.full(len(patches), -1, dtype=int)
    owner[matches[0]] = matches[1]
    absent = owner < 0
    if absent.any():
        owner[absent] = index.nearest(centers[absent])
    verts = {k: {} for k in surfaces}
    packed = {k: [[], []] for k in surfaces}
    sides = defaultdict(list)
    motor = {"asphalt", "white", "yellow", "stop", "zebra"}
    raised = {"curb", "sidewalk", "tactile"}
    for patch, i in zip(patches, owner):
        k = labels[i]
        xy, faces = packed[k]
        table = verts[k]
        rings = [
            np.rint(np.asarray(r.coords)[:-1] * SCALE).astype(np.int64)
            for r in [patch.exterior, *patch.interiors]
        ]
        allpts = np.concatenate(rings)
        ids = []
        for point in allpts:
            p = tuple(point)
            if p not in table:
                table[p] = len(xy) // 2
                xy.extend(map(int, p))
            ids.append(table[p])
        tris = ear.triangulate_int64(
            allpts, np.uint32(np.cumsum([len(r) for r in rings]))
        ).reshape(-1, 3)
        for a, b, c in tris:
            A, B, C = allpts[[a, b, c]]
            area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])
            if area:
                faces.extend(
                    [ids[a], ids[b], ids[c]] if area > 0 else [ids[a], ids[c], ids[b]]
                )
        cat = "road" if k in motor else "walk" if k in raised else "land"
        for j, ring in enumerate(rings):
            nxt = np.roll(ring, -1, axis=0)
            ccw = np.sum(ring[:, 0] * nxt[:, 1] - nxt[:, 0] * ring[:, 1]) > 0
            flip = ccw if j == 0 else not ccw
            for a, b in zip(ring, nxt):
                u, v = (tuple(b), tuple(a)) if flip else (tuple(a), tuple(b))
                edge = (u, v) if u < v else (v, u)
                sides[edge].append((cat, u, v))
    walls = {"curbFace": [], "asphaltSkirt": [], "walkSkirt": []}
    for edge, adj in sides.items():
        assert len(adj) <= 2, (edge, adj)
        if len(adj) == 2 and adj[0][0] == adj[1][0]:
            continue
        by_kind = {kind: (a, b) for kind, a, b in adj}
        if "road" in by_kind:
            a, b = by_kind["road"]
            walls["asphaltSkirt"].extend(map(int, (*a, *b)))
            if "walk" in by_kind:
                walls["curbFace"].extend(map(int, (*b, *a)))
        elif "walk" in by_kind:
            a, b = by_kind["walk"]
            walls["walkSkirt"].extend(map(int, (*a, *b)))
    for k, (_, f) in packed.items():
        print(k, len(f) // 3, "triangles", round(surfaces[k].area, 2), "m²", flush=True)
    return packed, walls


def plant_and_furnish(cache, data, roads, road, walk, buildings, signals):
    grid = data["height"]
    raw_trees = json.loads((cache / "trees.json").read_text())
    trees = []
    for x, y, _, h, r, *_ in raw_trees:
        x, y = round(x, 2), round(y, 2)
        point = Point(x, y)
        if not Polygon(data["boundary"]).covers(point) or road.distance(point) < 0.72:
            continue
        on_walk = walk.covers(point)
        if on_walk and not walk.covers(point.buffer(1.18)):
            continue
        # The fullest leaf sprays reach 1.65 crown radii. Leave clearance at the actual facade.
        r = min(r, (buildings.distance(point) - 0.35) / 1.65)
        if r < 1.25:
            continue
        trees.append(
            [
                x,
                y,
                round(float(sample(grid, [x, y])) + (0.14 if on_walk else 0), 3),
                round(h, 2),
                round(r, 2),
            ]
        )
    data["trees"] = trees
    # Inset each mast base 0.32 m from the actual outside edge, with a clear strip back to the curb.
    kerbside = road.buffer(WALK_WIDTH - 0.32, quad_segs=12).boundary.intersection(
        walk.buffer(-0.21)
    )
    tree_space = unary_union([Point(v[:2]).buffer(0.7) for v in trees])
    kerbside = kerbside.difference(tree_space).difference(buildings.buffer(0.5))
    segments = list(parts(kerbside, "LineString"))
    index = sh.STRtree(segments)
    gear = defaultdict(list)
    occupied = []
    rail_space = []
    crowns = [Point(row[:2]).buffer(row[4] * 1.65) for row in trees]
    crown_index = sh.STRtree(crowns)
    equipment = {
        "lamps": (2.85, 0.31, 6.11),
        "gantries": (5.55, 0.25, 6.22),
        "signals": (4.55, 0.77, 4.99),
    }

    def anchor(q, d, width, side, kind, reach=6):
        normal = np.array([d[1], -d[0]]) * side
        desired = Point(q + normal * (width / 2 + WALK_WIDTH - 0.32))
        choices = []
        for i in index.query(desired.buffer(reach)):
            rim = segments[i]
            p = rim.interpolate(rim.project(desired))
            xy = np.array(p.coords[0])
            if p.distance(desired) > reach or (xy - q) @ normal < width * 0.35:
                continue
            if any(p.distance(prev) < 1.55 for prev in occupied):
                continue
            foot = LineString([xy, xy - normal * 1.50]).buffer(0.15)
            arm, half, h = equipment[kind]
            sweep = LineString([xy, xy - normal * arm]).buffer(half)
            tip_height = float(sample(grid, xy)) + 0.14 + h
            if buildings.intersects(sweep) or any(
                r.distance(p) < 0.16 for r in rail_space
            ):
                continue
            if any(
                trees[k][2] + 0.31 * trees[k][3] < tip_height + 0.82
                and trees[k][2] + 1.03 * trees[k][3] > tip_height - 0.82
                for k in crown_index.query(sweep, predicate="intersects")
            ):
                continue
            if not walk.covers(foot):
                continue
            choices.append((p.distance(desired), p, xy))
        if not choices:
            return None
        _, p, xy = min(choices, key=lambda c: c[0])
        x, y = np.round(xy, 4)
        row = [
            float(x),
            float(y),
            round(float(sample(grid, [x, y])) + 0.14, 5),
            *np.round(d * side, 7),
        ]
        occupied.append(p)
        gear[kind].append(row)
        return row

    for q, d, w in signals:
        anchor(q, d, w, 1, "signals") or anchor(q, d, w, -1, "signals")
    for x, y, side in [(61, -229, 1), (495, -158, -1), (733, -181, 1)]:
        p = Point(x, y)
        line, info = min(roads, key=lambda r: r[0].distance(p))
        t = line.project(p)
        for delta in [0, 3, -3, 6, -6, 10, -10, 16, -16]:
            q, d, _ = frame(line, t + delta)
            if anchor(q, d, info[0], side, "gantries") or anchor(
                q, d, info[0], -side, "gantries"
            ):
                break
    for line, (w, *_) in roads:
        if w < 5:
            continue
        for t in np.arange(13, line.length - 3, max(29, w * 2.7)):
            q, d, _ = frame(line, t)
            row = anchor(q, d, w, 1, "lamps") or anchor(q, d, w, -1, "lamps")
            if not row or w < 7:
                continue
            v = np.array(row[3:])
            p = np.array(row[:2])
            a = p + v * 0.6
            b = p + v * 4.2
            swept = LineString([a, b]).buffer(0.10)
            if (
                walk.covers(swept)
                and not buildings.intersects(swept)
                and road.distance(swept) > 2.30
                and not tree_space.intersects(swept)
                and not any(swept.distance(other) < 0.5 for other in occupied[:-1])
            ):
                rail_space.append(swept)
                gear["rails"].append(
                    [
                        [*np.round(k, 4), round(float(sample(grid, k)) + 0.14, 5)]
                        for k in [a, (a + b) / 2, b]
                    ]
                )
    data["fixtures"] = dict(gear)
    data["treeCandidates"] = len(raw_trees)
    print(
        "Tree positions",
        len(trees),
        "of",
        len(raw_trees),
        "fixtures",
        {k: len(v) for k, v in gear.items()},
        flush=True,
    )


def main(cache):
    path = ROOT / "assets/shiba-layout.json"
    data = json.loads(path.read_text())
    region = Polygon(data["boundary"])
    buildings = unary_union(
        [Polygon(f["rings"][0], f["rings"][1:]).buffer(0) for f in data["footprints"]]
    )
    roads = [
        (LineString(pts), info)
        for (kind, pts), info in zip(data["roads"], data["roadInfo"])
        if kind == "road"
    ]
    paved = [line.buffer(info[0] / 2, quad_segs=12) for line, info in roads]
    road = unary_union(list(parts(unary_union(paved).intersection(region), "Polygon")))
    outer = road.buffer(WALK_WIDTH, quad_segs=12)
    walk = unary_union(
        list(
            parts(
                outer.difference(road).difference(buildings).intersection(region),
                "Polygon",
            )
        )
    )
    grade_grid(data["height"], road, roads)
    markings_geom, signals = markings(roads, paved, road, data)
    plant_and_furnish(cache, data, roads, road, walk, buildings, signals)
    curb = road.buffer(0.19, quad_segs=12).intersection(walk)
    tactile = (
        road.buffer(0.82, quad_segs=12)
        .difference(road.buffer(0.52, quad_segs=12))
        .intersection(walk)
    )
    # Mapped pedestrian links and shop thresholds cover the orthophoto at human eye level.
    paths = unary_union(
        [
            LineString(p).buffer(min(info[0], 4) / 2, quad_segs=5)
            for (kind, p), info in zip(data["roads"], data["roadInfo"])
            if kind == "path"
        ]
    )
    aprons = buildings.buffer(2.5, quad_segs=4).intersection(outer.buffer(5))
    # Trace the stone and aggregate forecourts on the GSI orthophoto, preserving the planted islands on either side.
    court = unary_union(
        [
            Polygon(p)
            for p in [
                [
                    (282, -125),
                    (301, -125),
                    (322, -128),
                    (345, -130),
                    (377, -127),
                    (383, -139),
                    (395, -145),
                    (405, -147),
                    (404, -153),
                    (385, -151),
                    (376, -149),
                    (350, -148),
                    (337, -145),
                    (318, -146),
                    (302, -145),
                    (286, -150),
                    (279, -149),
                ],
                [
                    (289, -87),
                    (325, -86),
                    (324, -105),
                    (318, -108),
                    (318, -125),
                    (307, -129),
                    (296, -124),
                    (296, -109),
                    (285, -107),
                ],
                [
                    (303, -120),
                    (322, -122),
                    (317, -146),
                    (311, -153),
                    (310, -172),
                    (300, -175),
                    (301, -152),
                ],
            ]
        ]
    )
    paths = paths.union(court)
    forecourt = (
        paths.union(aprons)
        .intersection(region)
        .difference(unary_union([road, walk, buildings]))
    )
    ground = region.difference(unary_union([road, walk, forecourt]))
    surfaces = {
        "asphalt": road.difference(unary_union(list(markings_geom.values()))),
        **markings_geom,
        "sidewalk": walk.difference(curb.union(tactile)),
        "curb": curb,
        "tactile": tactile,
        "forecourt": forecourt,
        "ground": ground,
    }
    assert abs(sum(s.area for s in surfaces.values()) - region.area) < 0.002
    packed, walls = partition(surfaces, region, data["height"])
    payload = {
        "scale": SCALE,
        "surfaces": packed,
        "walls": walls,
        "areas": {k: round(v.area, 5) for k, v in surfaces.items()},
    }
    (ROOT / "assets/shiba-pavement.gz").write_bytes(
        gzip.compress(json.dumps(payload, separators=(",", ":")).encode(), mtime=0)
    )
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
