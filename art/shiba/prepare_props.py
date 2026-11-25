"""Anchor static amenities at recorded OSM features, with room for their complete footprint."""

from pathlib import Path
import json, sys, xml.etree.ElementTree as ET
import numpy as np
from shapely import Point, Polygon, LineString, union_all
from grade import sample
from guide_signs import guide_signs
from prepare_pavement import frame, rectangle
from shiba_site import en

ROOT = Path(__file__).resolve().parents[2]


def build(cache):
    path = ROOT / "assets/shiba-layout.json"
    d = json.loads(path.read_text())
    g = dict(d["height"])
    g["gradeCm"] = np.array(g["gradeCm"])
    region = Polygon(d["boundary"])
    buildings = union_all(
        [Polygon(f["rings"][0], f["rings"][1:]).buffer(0) for f in d["footprints"]]
    )
    buildings = buildings.union(union_all([Polygon(p) for p in d["bearingFootprints"]]))
    roads = [
        (LineString(p), i[0])
        for (k, p), i in zip(d["roads"], d["roadInfo"])
        if k == "road"
    ]
    road = union_all([l.buffer(w / 2, quad_segs=12) for l, w in roads]).intersection(
        region
    )
    walk = (
        road.buffer(3.2, quad_segs=12)
        .difference(road)
        .difference(buildings)
        .intersection(region)
    )
    obstacle = [
        buildings,
        road.buffer(1.05),
        union_all([Point(row[:2]).buffer(0.65) for row in d["trees"]]),
    ]
    f = d["fixtures"]
    for kind in ["signals", "lamps", "gantries"]:
        obstacle.extend(Point(row[:2]).buffer(0.33) for row in f[kind])
    obstacle.extend(
        LineString([q[:2] for q in line]).buffer(0.18) for line in f["rails"]
    )
    for x, y, nx, ny, w, *_ in json.loads(
        (ROOT / "assets/shiba-frontages.json").read_text()
    ):
        obstacle.append(
            rectangle(
                np.array([x, y]),
                np.array([-ny, nx]),
                np.array([nx, ny]),
                -w / 2,
                w / 2,
                0,
                1.36,
            )
        )
    obstacle = union_all(obstacle)
    sizes = {
        "shelter": (5.12, 1.98),
        "stopPole": (0.54, 0.45),
        "bench": (1.82, 0.63),
        "bikes": (5.65, 0.70),
        "vending": (1.22, 0.85),
        "post": (0.58, 0.55),
    }
    placed = []
    items = []
    osm = ET.parse(cache / "streets.osm")
    named = []
    for node in osm.iterfind("node"):
        t = {k.get("k"): k.get("v") for k in node.iterfind("tag")}
        if t.get("highway") == "traffic_signals" and t.get("name"):
            xy = en(float(node.get("lat")), float(node.get("lon")))
            named.append((np.array(xy), t["name"]))
        if t.get("access") in ("private", "customers"):
            continue
        kind = {
            "bench": "bench",
            "vending_machine": "vending",
            "bicycle_parking": "bikes",
            "post_box": "post",
        }.get(t.get("amenity"))
        if t.get("highway") == "bus_stop":
            kind = "shelter" if t.get("shelter") == "yes" else "stopPole"
        if not kind:
            continue
        xy = np.array(en(float(node.get("lat")), float(node.get("lon"))))
        q = Point(xy)
        if not region.covers(q):
            continue
        line, w = min(roads, key=lambda p: p[0].distance(q))
        pos, tx, n = frame(line, line.project(q))
        if np.dot(n, pos - xy) < 0:
            n = -n
        tx = np.array([-n[1], n[0]])

        def locate(label):
            width, depth = sizes[label]
            choices = [
                (a, b)
                for a in [0, 0.7, -0.7, 1.5, -1.5, 2.5, -2.5]
                for b in [0, -0.55, 0.55, -1.2, 1.2, -2.2, 2.2]
            ]
            for a, b in sorted(choices, key=lambda ab: ab[0] ** 2 + ab[1] ** 2):
                pt = xy + tx * a + n * b
                box = rectangle(pt, tx, n, -width / 2, width / 2, -depth / 2, depth / 2)
                if (
                    not region.covers(box)
                    or obstacle.intersects(box)
                    or any(box.distance(x) < 0.22 for x in placed)
                ):
                    continue
                raised = walk.covers(box)
                if not raised and box.intersects(walk):
                    continue
                if np.ptp(sample(g, np.array(box.exterior.coords))) > (
                    0.28 if label == "shelter" else 0.18
                ):
                    continue
                return [
                    label,
                    str(node.get("id")),
                    *np.round(pt, 4),
                    *np.round(n, 7),
                    0.14 if raised else 0,
                    t.get("name", ""),
                    t.get("bench") == "yes",
                    width,
                    depth,
                ], box

        site = locate(kind)
        if not site and kind == "shelter":
            site = locate("stopPole")
        if site:
            items.append(site[0])
            placed.append(site[1])
    f["junctionNames"] = []
    for x, y, g, dx, dy in f["signals"]:
        head = np.array([x - 4.55 * dy, y + 4.55 * dx])
        distance, title = min(
            ((np.linalg.norm(xy - head), title) for xy, title in named),
            default=(np.inf, ""),
        )
        f["junctionNames"].append(
            title if distance < 50 else ("芝公園" if x < 430 else "芝大門")
        )
    f["guideFaces"] = guide_signs(d)
    f["amenities"] = items
    path.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n")
    from collections import Counter

    print(dict(Counter(row[0] for row in items)))


if __name__ == "__main__":
    build(Path(sys.argv[1]))
