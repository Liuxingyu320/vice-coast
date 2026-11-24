"""Local metre frame, surveyed landmarks, and the street-following project boundary."""

from collections import defaultdict
from heapq import heappop, heappush
import math
import xml.etree.ElementTree as ET
import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union

LON, LAT = 139.74544604, 35.65858857
r = math.radians(LAT)
e2 = 0.0066943800229
w = math.sqrt(1 - e2 * math.sin(r) ** 2)
EAST = math.pi / 180 * 6378137 * math.cos(r) / w
NORTH = math.pi / 180 * 6378137 * (1 - e2) / w**3


def en(lat, lon):
    return ((lon - LON) * EAST, (lat - LAT) * NORTH)


def geo(x, y):
    return LAT + y / NORTH, LON + x / EAST


# Follow connected public streets around the tower and temple, then east to Daimon
# and south to the park station. Snapping the survey boundary retains bends and junctions.
CORNERS = [
    (35.65965, 139.74265),
    (35.66062, 139.74465),
    (35.66046, 139.7473),
    (35.65975, 139.74935),
    (35.6592, 139.7506),
    (35.65812, 139.75058),
    (35.65757, 139.75303),
    (35.65744, 139.75548),
    (35.65613, 139.75553),
    (35.65612, 139.75377),
    (35.65640, 139.75155),
    (35.65619, 139.75078),
    (35.65436, 139.75120),
    (35.65296, 139.75034),
    (35.65293, 139.74938),
    (35.65305, 139.74765),
    (35.65402, 139.74660),
    (35.65535, 139.74482),
    (35.65611, 139.74364),
    (35.65722, 139.74328),
    (35.65808, 139.74204),
]
PINS = [
    ("东京塔", 35.65858857, 139.74544604),
    ("增上寺大殿", 35.65733, 139.748376),
    ("三解脱门", 35.657275, 139.749991),
    ("增上寺大门", 35.657035, 139.752573),
    ("大门路口", 35.65681, 139.75468),
    ("芝公园站", 35.654237, 139.749892),
]


def roads_and_boundary(cache):
    root = ET.parse(cache / "streets.osm").getroot()
    nodes = {
        n.get("id"): en(float(n.get("lat")), float(n.get("lon")))
        for n in root.findall("node")
    }
    graph = defaultdict(dict)
    ways = []
    trees = []
    greens = []
    for node in root.findall("node"):
        tags = {t.get("k"): t.get("v") for t in node.findall("tag")}
        if tags.get("natural") == "tree":
            trees.append(nodes[node.get("id")])
    for way in root.findall("way"):
        tags = {t.get("k"): t.get("v") for t in way.findall("tag")}
        ids = [n.get("ref") for n in way.findall("nd") if n.get("ref") in nodes]
        if len(ids) < 2:
            continue
        path = [nodes[i] for i in ids]
        if (
            len(path) >= 4
            and ids[0] == ids[-1]
            and (
                tags.get("leisure") == "park"
                or tags.get("natural") in ("wood", "scrub")
                or tags.get("landuse") == "forest"
            )
        ):
            greens.append(Polygon(path).buffer(0))
        road = tags.get("highway")
        if (
            not road
            or road
            in [
                "construction",
                "proposed",
                "motorway",
                "motorway_link",
                "platform",
                "raceway",
                "elevator",
            ]
            or tags.get("tunnel") == "yes"
            or tags.get("access") == "private"
            or int(tags.get("layer", "0").split(";")[0] or 0) < 0
        ):
            continue
        kind = (
            "path"
            if road
            in ("steps", "footway", "pedestrian", "path", "cycleway", "bridleway")
            else "road"
        )
        ways.append((kind, LineString(path)))
        if kind == "road" and road not in ("service", "track"):
            for a, b in zip(ids, ids[1:]):
                d = math.dist(nodes[a], nodes[b])
                graph[a][b] = d
                graph[b][a] = d
    ids = list(graph)
    near = cKDTree([nodes[i] for i in ids])
    pts = [ids[near.query(en(*ll))[1]] for ll in CORNERS]

    def route(a, b):
        queue = [(0, a)]
        prev = {a: None}
        best = {a: 0}
        while queue:
            cost, q = heappop(queue)
            if q == b:
                line = []
                while q is not None:
                    line.append(nodes[q])
                    q = prev[q]
                return line[::-1]
            if cost > best[q]:
                continue
            for dest, length in graph[q].items():
                val = cost + length
                if val < best.get(dest, float("inf")):
                    best[dest] = val
                    prev[dest] = q
                    heappush(queue, (val, dest))
        raise ValueError("Disconnected boundary waypoints")

    border = []
    for a, b in zip(pts, pts[1:] + pts[:1]):
        border.extend(route(a, b)[:-1])
    area = Polygon(border).buffer(0)
    if area.geom_type == "MultiPolygon":
        area = max(area.geoms, key=lambda g: g.area)
    area = Polygon(area.exterior).simplify(0.75, preserve_topology=True)

    def street_node(lat, lon):
        return ids[near.query(en(lat, lon))[1]]

    shopping = route(street_node(35.65723, 139.75032), street_node(35.65682, 139.75493))
    area = (
        area.union(LineString(shopping).buffer(69, quad_segs=5))
        .buffer(9, quad_segs=3)
        .simplify(1.2)
    )
    assert all(area.contains(Point(en(lat, lon))) for _, lat, lon in PINS)
    print(
        "Boundary",
        round(area.area),
        "m²",
        len(area.exterior.coords),
        "edges",
        np.round(area.bounds, 1),
        flush=True,
    )
    return area, ways, trees, unary_union(greens)
