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
            if not road.buffer(0.012).covers(cross):
                continue
            if any(cross.intersection(other).area > 0.02 for other in crossing_bands):
                continue
            crossing_bands.append(cross)
            for v in np.arange(-half + 0.18, half - 0.48, 0.86):
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
    # Construct one junction surface across all arms including acute forks and T junctions.
    # Work from centreline intersections: merely adjacent parallel carriageways are separate.
    junctions = []
    junction_nodes = []
    for i, line in enumerate(lines):
        for j in tree.query(line.buffer(0.10), predicate="intersects"):
            if j <= i:
                continue
            other = lines[j]
            a, b = nearest_points(line, other)
            if a.distance(b) > 0.11:
                continue
            sa, sb = line.project(a), other.project(b)
            _, va, _ = frame(line, sa)
            _, vb, _ = frame(other, sb)
            if abs(va @ vb) > 0.955:
                continue
            radius = max(roads[i][1][0], roads[j][1][0]) * 0.80 + 0.65
            conflict = paved[i].intersection(paved[j]).intersection(a.buffer(radius))
            if not conflict.is_empty:
                # A divided avenue has several centreline nodes in the same junction. Cover both
                # lanes up to their tangent approaches, including the space between its two crossings.
                junction_nodes.append(a)
                junctions.append(
                    a.buffer(radius, quad_segs=12).intersection(
                        paved[i].union(paved[j])
                    )
                )
    # The two one-way connectors between a divided avenue's carriageways are the
    # centre of one intersection. Circular masks alone leave paint on those connectors.
    nodes = sh.STRtree(junction_nodes)
    for (line, info), body in zip(roads, paved):
        if info[2] == "no" or line.length > 29 or info[0] < 4.8:
            continue
        if all(
            len(nodes.query(Point(xy), predicate="dwithin", distance=0.16))
            for xy in (line.coords[0], line.coords[-1])
        ):
            junctions.append(body)
    junction = unary_union(junctions).intersection(road)
    data["junctionMasks"] = [
        [list(r.coords)[:-1] for r in [p.exterior, *p.interiors]]
        for p in parts(junction, "Polygon")
    ]
    reserved = unary_union(clearance)
    white, yellow = [], []
    for i, (line, (width, _, oneway, lanes)) in enumerate(roads):
        if width < 4.8:
            continue
        body = paved[i]
        usable = body.difference(junction)

        def stripe(path, half, output):
            if not path.is_empty:
                output.append(
                    path.buffer(half, cap_style="flat", quad_segs=5).intersection(
                        usable
                    )
                )

        # Derive both edge stripes from the united asphalt boundary, never from a way's round end caps.
        lanes = max(1, int(lanes))
        if oneway == "no" and width >= 8:
            stripe(line, 0.075, yellow)
        for lane in range(1, lanes):
            off = width * (lane / lanes - 0.5)
            if abs(off) < 0.1 and oneway == "no" and width >= 8:
                continue
            for path in parts(line.offset_curve(off) if off else line, "LineString"):
                for start in np.arange(0, path.length, 8):
                    if path.length - start < 3.0:
                        continue
                    dash = substring(path, start, start + 3).buffer(
                        0.075, cap_style="flat", quad_segs=5
                    )
                    # End a dashed lane with a complete stencil before a pedestrian crossing
                    # or a junction. Clipping the last dash would leave a floating white chip.
                    if usable.covers(dash) and reserved.disjoint(dash):
                        white.append(dash)
    # Through arrows are allowed only on multi-lane approaches that continue straight.
    # Fit the entire painted outline on an incoming lane with a clear setback.
    arrows = []
    for q, d, width in sites:
        if width < 8:
            continue
        i = int(belts.nearest(Point(q)))
        line, info = roads[i]
        station = line.project(Point(q))
        for sign in [1, -1] if info[2] == "no" else [-1] if info[2] == "-1" else [1]:
            s0 = station - sign * 13.8
            if s0 < 2 or s0 > line.length - 2:
                continue
            o, t, n = frame(line, s0)
            _, t2, _ = frame(line, max(0, min(line.length, s0 + sign * 4)))
            if t @ t2 < 0.98:
                continue
            t = t * sign
            n = n * sign
            o = o + n * (width * 0.25 if info[2] == "no" else 0)
            shape = Polygon(
                [
                    o + t * v + n * u
                    for u, v in [
                        (-0.14, -1.54),
                        (0.14, -1.54),
                        (0.14, 0.28),
                        (0.53, 0.20),
                        (0, 1.57),
                        (-0.53, 0.20),
                        (-0.14, 0.28),
                    ]
                ]
            )
            if paved[i].covers(shape) and all(shape.distance(p) > 0.30 for p in arrows):
                arrows.append(shape)
    major = unary_union([p for p, (_, info) in zip(paved, roads) if info[0] >= 4.8])
    edge = (
        unary_union(paved)
        .buffer(-0.28, quad_segs=12)
        .boundary.buffer(0.068, quad_segs=4)
    )
    white.append(edge.intersection(major).difference(junction))
    arrows = [a for a in arrows if a.disjoint(junction)]
    white.extend(arrows)
    data["arrows"] = [
        np.asarray(p.exterior.coords)[:-1].round(5).tolist() for p in arrows
    ]
    z = unary_union(zebra).intersection(road)
    crossing_space = unary_union(crossing_bands).buffer(0.90)
    s = unary_union(
        [
            line
            for line in stops
            if line.disjoint(crossing_space) and line.disjoint(junction)
        ]
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

    def usable_paint(shape):
        components = sh.get_parts(shape)
        bounds = sh.bounds(components)
        span = np.linalg.norm(bounds[:, 2:] - bounds[:, :2], axis=1)
        return sh.union_all(components[(span >= 1.10) & (sh.area(components) >= 0.065)])

    return {
        "zebra": z,
        "stop": s,
        "white": usable_paint(w),
        "yellow": usable_paint(y),
    }, sites


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
    # Suppress isolated single-cell LiDAR peaks on pedestrian ground; preserve continuous hillsides.
    local = median_filter(result, 3)
    spike = (~mask) & (result - local > 1.15) & (raw - median_filter(raw, 3) > 1.15)
    result[spike] = local[spike]
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
    motor = {"asphalt", "white", "yellow", "stop", "zebra", "inlet", "manhole"}
    raised = {"curb", "sidewalk", "tactile", "tactileWarn"}
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


def plant_and_furnish(cache, data, roads, road, walk, buildings, signals, water):
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
    # A laser return can be the crown overhanging a pond. Replace a wet trunk position only
    # with a separately mapped, previously unrepresented tree on solid ground.
    from xml.etree.ElementTree import parse
    from shiba_site import en

    area = Polygon(data["boundary"])
    recorded = []
    for node in parse(cache / "streets.osm").iterfind("node"):
        tags = {a.get("k"): a.get("v") for a in node.iterfind("tag")}
        if tags.get("natural") != "tree":
            continue
        p = Point(en(float(node.get("lat")), float(node.get("lon"))))
        if (
            area.covers(p)
            and water.distance(p) > 0.6
            and road.distance(p) > 1.5
            and buildings.distance(p) > 3.3
            and not walk.intersects(p.buffer(1.22))
        ):
            recorded.append((p, node.get("id")))
    changes = []
    for row in trees:
        pt = Point(row[:2])
        if water.distance(pt) > 0.25:
            continue
        nearby = [
            (p, id)
            for p, id in recorded
            if all(p.distance(Point(t[:2])) > 3.8 for t in trees)
        ]
        if not nearby:
            raise ValueError("No mapped bank tree with adequate clearance")
        p, id = min(nearby, key=lambda item: item[0].distance(pt))
        recorded.remove((p, id))
        x, y = np.round(p.coords[0], 3)
        changes.append({"source": id, "replacedLaserCenter": row[:2], "xy": [x, y]})
        row[:3] = [x, y, round(float(sample(grid, [x, y])), 4)]
        row[4] = round(min(row[4], (buildings.distance(p) - 0.36) / 1.65), 3)
    data["mappedBankTrees"] = changes
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


from station_sites import station_sites


def main(cache):
    path = ROOT / "assets/shiba-layout.json"
    data = json.loads(path.read_text())
    region = Polygon(data["boundary"])
    base_count = len(json.loads((cache / "layout.json").read_text())["roads"])
    data["roads"] = data["roads"][:base_count]
    data["roadInfo"] = data["roadInfo"][:base_count]
    roads = [
        (LineString(pts), info)
        for (kind, pts), info in zip(data["roads"], data["roadInfo"])
        if kind == "road"
    ]
    paved = [line.buffer(info[0] / 2, quad_segs=12) for line, info in roads]
    # The survey cut follows several road centrelines. Include the carriageway and
    # both pavements at that seam, with room for a complete vehicle at junctions.
    survey = Polygon(json.loads((cache / "layout.json").read_text())["boundary"])
    full_road = unary_union(paved)
    region = survey.union(full_road.buffer(WALK_WIDTH + 1.2, quad_segs=6))
    region = Polygon(np.round(np.asarray(region.exterior.coords)[:-1], 4))
    from context_streets import connections

    connections(cache, data, survey, region)
    for (kind, p), info in zip(
        data["roads"][base_count:], data["roadInfo"][base_count:]
    ):
        line = LineString(p)
        roads.append((line, info))
        paved.append(line.buffer(info[0] / 2, quad_segs=12))
    full_road = unary_union(paved)
    data["boundary"] = np.asarray(region.exterior.coords)[:-1].tolist()
    data["areaM2"] = round(region.area, 2)
    road = unary_union(list(parts(full_road.intersection(region), "Polygon")))
    from extract import public_realm

    public_realm(cache, data, road)
    buildings = unary_union(
        [Polygon(f["rings"][0], f["rings"][1:]).buffer(0) for f in data["footprints"]]
    )
    from foottown import bearings, tower_plan

    u, n, _ = tower_plan()
    feet = unary_union(
        [
            Polygon(foot[:, 0, None] * u + foot[:, 1, None] * n)
            for _, _, _, foot, _, _ in bearings(data["height"])
        ]
    )
    data["bearingFootprints"] = [
        list(p.exterior.coords)[:-1] for p in parts(feet, "Polygon")
    ]
    buildings = buildings.union(feet)
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
    from waterways import water_plan

    hydrology = water_plan(cache, data, region)
    plant_and_furnish(cache, data, roads, road, walk, buildings, signals, hydrology)
    curb = road.buffer(0.19, quad_segs=12).intersection(walk)
    data["stations"] = station_sites(cache, data)
    for station in data["stations"]:
        station["sillLift"] = 0.14 if walk.covers(Point(station["mouth"])) else 0.0
    wells = unary_union([Polygon(s["well"]) for s in data["stations"]])
    # Trace the safe side of obstructions instead of clipping the markings at the building corner.
    # Stations include the post footprint, handrail and approach, not just the below-grade opening.
    from station_sites import station_envelope

    intrusion = buildings.union(
        unary_union([station_envelope(s) for s in data["stations"]])
    )
    # The difference boundary follows the narrowed strip between a bearing and the kerb,
    # rejoining the same guide at both ends without introducing a branch.
    spine = (
        road.buffer(0.67, quad_segs=16)
        .difference(intrusion.buffer(0.25, quad_segs=8))
        .boundary
    )
    guide_space = walk.difference(
        unary_union([road.buffer(0.27), intrusion.buffer(0.065)])
    )
    tactile = spine.buffer(0.15, quad_segs=6).intersection(guide_space)
    # Each marked approach receives a warning pad behind the kerb and a short
    # link to the longitudinal guide. Ray cast to the final union at junctions.
    warnings = []
    for guide in parts(spine, "LineString"):
        # Identify actual bends on the simplified guide, then replace the bend with domed warning paving.
        coords = np.asarray(guide.simplify(0.14).coords)
        for a, b, c in zip(coords, coords[1:], coords[2:]):
            v, w = b - a, c - b
            v /= max(0.001, np.linalg.norm(v))
            w /= max(0.001, np.linalg.norm(w))
            if v @ w < 0.68:
                pad = rectangle(b, v, np.array([-v[1], v[0]]), -0.30, 0.30, -0.30, 0.30)
                if guide_space.covers(pad):
                    warnings.append(pad)
    guides = []
    vectors = []
    for ring in data["crosswalkBands"]:
        r = np.asarray(ring)
        center = r.mean(0)
        along = r[1] - r[0]
        across = r[3] - r[0]
        for side in (-1, 1):
            direction = side * across / np.linalg.norm(across)
            tx = np.array([-direction[1], direction[0]])
            candidates = list(
                parts(
                    LineString([center, center + direction * 35]).intersection(
                        road.boundary
                    ),
                    "Point",
                )
            )
            if not candidates:
                continue
            edge = np.array(
                min(candidates, key=lambda p: p.distance(Point(center))).coords[0]
            )
            warning = rectangle(
                edge, tx, direction, -0.90, 0.90, 0.2, 0.80
            ).intersection(walk)
            if warning.area < 0.18:
                continue
            warnings.append(warning)
            guides.append(
                rectangle(edge, tx, direction, -0.15, 0.15, 0.2, 0.69).intersection(
                    walk
                )
            )
            vectors.append([*np.round(edge, 4), *np.round(direction, 6)])
    data["tactileApproaches"] = vectors
    mast_space = unary_union(
        [
            Point(q[:2]).buffer(0.24)
            for kind in ("signals", "lamps", "gantries")
            for q in data["fixtures"][kind]
        ]
    )
    warning = unary_union(warnings).difference(mast_space)
    tactile = unary_union([tactile, *guides]).difference(warning).difference(mast_space)
    # Mapped pedestrian links and shop thresholds cover the orthophoto at human eye level.
    paths = unary_union(
        [
            LineString(p).buffer(min(info[0], 4) / 2, quad_segs=5)
            for (kind, p), info in zip(data["roads"], data["roadInfo"])
            if kind == "path"
        ]
    )
    park_ids = set(data["parkBuildingIds"]).intersection(data["parkSiteIds"])
    cabins = [
        Polygon(b["rings"][0], b["rings"][1:]).buffer(0)
        for b in data["footprints"]
        if b["id"] in park_ids
    ]
    compact = unary_union(cabins)
    aprons = (
        buildings.difference(compact)
        .buffer(2.5, quad_segs=4)
        .intersection(outer.buffer(5))
    )
    for cabin in cabins:
        if cabin.distance(walk) > 8:
            continue
        p, q = nearest_points(cabin, walk)
        apron = LineString([p, q]).buffer(0.74, cap_style="square")
        aprons = aprons.union(cabin.buffer(0.28, join_style="mitre").union(apron))
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
    # The paved apron on the public northeast side of FootTown follows the aerial outline.
    entry_plaza = Polygon(
        [(-16, 46), (6, 50), (32, 38), (59, 17), (64, 8), (50, 8), (24, 24), (-12, 39)]
    )
    forecourt = forecourt.union(
        entry_plaza.intersection(region).difference(
            unary_union([road, walk, buildings])
        )
    )
    warning = warning.difference(curb)
    tactile = tactile.difference(curb)
    # Fit each recessed shop apron to its real facade and follow its normal all the way to the sidewalk.
    from prepare_frontages import plan as frontage_plan
    from station_sites import bounds_rect

    bays = frontage_plan(cache, data, tactile.union(warning))
    landings = []
    for x, y, nx, ny, w, *_ in bays:
        t = np.array([-ny, nx])
        n = np.array([nx, ny])
        o = np.array([x, y])
        depths = []
        for along in [-w / 2, 0.0, w / 2]:
            a = o + t * along
            hit = LineString([a, a + n * 24]).intersection(walk)
            if not hit.is_empty:
                depths.append(sh.distance(Point(a), hit))
        if depths:
            landings.append(
                bounds_rect(
                    o, n, -w / 2 - 0.15, w / 2 + 0.15, -0.08, max(depths) + 0.60
                )
            )
    for s in data["stations"]:
        landing = station_envelope(s, 0.48)
        mouth = Point(s["mouth"])
        dest = nearest_points(mouth, walk)[1]
        if mouth.distance(dest) < 15:
            landing = landing.union(
                LineString([mouth, dest]).buffer(0.94, cap_style="square")
            )
        landings.append(landing)
    hardstand = (
        unary_union(landings).intersection(region).difference(road.union(buildings))
    )
    # Survey canopy shells are retained as ground holes. The mouth and its lip share the public landing.
    for s in data["stations"]:
        hardstand = hardstand.union(
            station_envelope(s, 0.48).intersection(region).difference(road)
        )
    data["entranceLandings"] = [
        [list(r.coords)[:-1] for r in [p.exterior, *p.interiors]]
        for p in parts(hardstand, "Polygon")
    ]
    support = walk.union(hardstand)
    # Continue the level pedestrian-side edge around adjacent shop corners. The outer band
    # grades down into each setback, including the narrow wedges between staggered shop fronts.
    apron_width = 1.68
    shop_sidewalk = walk.intersection(hardstand.buffer(10, quad_segs=8))
    plaza_edge = hardstand.union(shop_sidewalk)
    forecourt = forecourt.union(
        plaza_edge.buffer(apron_width, quad_segs=8)
        .intersection(region)
        .difference(unary_union([road, walk, buildings]))
    )
    # Fill the measured canopy annulus with paving. The opening itself stays cut through all layers.
    station_aprons = unary_union([station_envelope(s, 0.48) for s in data["stations"]])
    forecourt = forecourt.union(
        station_aprons.intersection(region).difference(road.union(walk))
    )
    ground = region.difference(unary_union([road, walk, forecourt]))
    from ironwork import plan, shapes

    data["drains"] = plan(roads, road, data, markings_geom, frame)
    iron = {kind: shapes(data["drains"], kind) for kind in ["inlet", "manhole"]}
    surfaces = {
        "asphalt": road.difference(
            unary_union([*markings_geom.values(), *iron.values()])
        ),
        **iron,
        **markings_geom,
        "sidewalk": walk.difference(unary_union([curb, tactile, warning])),
        "tactileWarn": warning,
        "curb": curb,
        "tactile": tactile,
        "forecourt": forecourt,
        "ground": ground,
    }
    wet = hydrology.intersection(ground).difference(buildings)
    water_parts = [q for q in parts(wet, "Polygon") if q.area > 3]
    water = unary_union(water_parts)
    data["waters"] = []
    river_shores = []
    bodies = list(parts(hydrology, "Polygon"))
    for q in water_parts:
        whole = max(bodies, key=lambda body: body.intersection(q).area)
        if whole.area > 2200 and whole.centroid.y < -400:
            river_shores.append(q.boundary)
        xx, yy = whole.bounds[:2]
        X, Y = whole.bounds[2:]
        gridpts = np.array(
            [
                (x, y)
                for x in np.arange(xx, X, 2.0)
                for y in np.arange(yy, Y, 2.0)
                if whole.covers(Point(x, y))
            ]
        )
        if len(gridpts) == 0:
            gridpts = np.asarray(q.representative_point().coords)
        # Fix the stage from low DEM samples under the watercourse; never tilt water up the bank.
        stage = round(
            float(np.quantile(sample(data["height"], gridpts, raw=True), 0.12)) - 0.18,
            3,
        )
        data["waters"].append(
            {
                "rings": [
                    np.round(np.asarray(r.coords)[:-1], 5).tolist()
                    for r in [q.exterior, *q.interiors]
                ],
                "z": stage,
            }
        )
    surfaces["ground"] = ground.difference(water)
    surfaces["water"] = water
    region = region.difference(wells)
    surfaces = {k: s.difference(wells) for k, s in surfaces.items()}
    assert abs(sum(s.area for s in surfaces.values()) - region.area) < 0.002
    # Divide the apron at the end of the 1:12 transition. Its outer edge meets the sidewalk at +14 cm.
    ramp = forecourt.intersection(support.buffer(apron_width)).difference(wells)
    surfaces["forecourt"] = surfaces["forecourt"].difference(ramp)
    surfaces["apron"] = ramp
    packed, walls = partition(surfaces, region, data["height"])
    # The river wall closes the full depth here, including the bridge cut. A second
    # coplanar sidewalk/road skirt at the same XY flickers in front of the masonry.
    if river_shores:
        shoreline = unary_union(river_shores)
        for name in ("walkSkirt", "asphaltSkirt"):
            coords = np.array(walls[name]).reshape(-1, 2, 2)
            near = sh.dwithin(
                sh.points(coords.reshape(-1, 2) / SCALE), shoreline, 0.00025
            ).reshape(-1, 2)
            mid = sh.dwithin(sh.points(coords.mean(axis=1) / SCALE), shoreline, 0.00025)
            walls[name] = coords[~(near.all(axis=1) & mid)].ravel().tolist()
    for s in data["stations"]:
        p = Point(s["mouth"])
        s["sillLift"] = round(
            0.14 * max(0.0, 1.0 - p.distance(support) / apron_width), 6
        )
    xy = np.asarray(packed["apron"][0]).reshape(-1, 2) / SCALE
    ramp_lifts = (
        (0.14 * np.maximum(0.0, 1 - sh.distance(sh.points(xy), support) / apron_width))
        .round(6)
        .tolist()
    )
    payload = {
        "scale": SCALE,
        "apronLift": ramp_lifts,
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
