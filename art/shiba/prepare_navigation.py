"""Choose accessible street entrances for the map and store the original road geometry."""

from pathlib import Path
import json, re, sys
import xml.etree.ElementTree as ET
from shapely import STRtree
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shiba_site import en, geo

cache = Path(sys.argv[1])
dest = Path(__file__).resolve().parents[2] / "assets"
layout = json.loads((cache / "layout.json").read_text())
area = Polygon(layout["boundary"])
obstacles = unary_union(
    [Polygon(f["rings"][0], f["rings"][1:]).buffer(0.55) for f in layout["footprints"]]
)
arrivals = [
    (35.65812, 139.746015),
    (35.65730, 139.74897),
    (35.65717, 139.75030),
    (35.65697, 139.75263),
    (35.65692, 139.75464),
    (35.65428, 139.75002),
]
segs = [(k, LineString(p)) for k, p in layout["roads"]]


def approach(lat, lon, vehicle=False):
    query = Point(en(lat, lon))
    best = None
    for kind, line in segs:
        if vehicle and kind != "road":
            continue
        projection = line.project(query)
        for step in [0, 4, -4, 8, -8]:
            p = line.interpolate(max(0, min(projection + step, line.length)))
            if not area.contains(p) or obstacles.contains(p):
                continue
            score = p.distance(query) + (6 if kind == "road" and not vehicle else 0)
            if best is None or score < best[0]:
                best = score, p, line
    _, p, line = best
    d = line.project(p)
    a = line.interpolate(max(0, d - 1))
    b = line.interpolate(min(line.length, d + 1))
    return [round(p.x, 2), round(p.y, 2), round(b.x - a.x, 3), round(b.y - a.y, 3)]


# Match source road attributes to the clipped and simplified playable centerlines.
osm = ET.parse(cache / "streets.osm").getroot()
nodes = {
    n.get("id"): en(float(n.get("lat")), float(n.get("lon")))
    for n in osm.findall("node")
}
lines, tags = [], []
for way in osm.findall("way"):
    props = {t.get("k"): t.get("v") for t in way.findall("tag")}
    coords = [nodes[n.get("ref")] for n in way.findall("nd") if n.get("ref") in nodes]
    if len(coords) > 1 and props.get("highway"):
        lines.append(LineString(coords))
        tags.append(props)
index = STRtree(lines)


def info(line, kind):
    middle = line.interpolate(0.5, normalized=True)
    matches = index.query(middle.buffer(3))
    best = (
        min(
            matches,
            key=lambda i: sum(
                lines[i].distance(line.interpolate(t, normalized=True))
                for t in [0.2, 0.5, 0.8]
            ),
        )
        if len(matches)
        else index.nearest(middle)
    )
    props = tags[best]
    category = props["highway"]
    lanes = (
        int(re.search(r"\d+", props.get("lanes", "") or "0").group())
        if re.search(r"\d+", props.get("lanes", ""))
        else 0
    )
    width = re.search(r"[\d.]+", props.get("width", ""))
    typical = {
        "primary": 13,
        "secondary": 10,
        "tertiary": 8,
        "residential": 5.2,
        "service": 3.6,
    }
    metres = (
        float(width.group())
        if width
        else max(lanes * 2.9, typical.get(category, 5.6))
        if kind == "road"
        else 2
    )
    return [
        round(min(24, max(1.2, metres)), 1),
        category,
        props.get("oneway", "no"),
        lanes or (2 if metres > 5 else 1),
    ]


layout["roadInfo"] = [info(line, kind) for kind, line in segs]
layout["crossings"] = []
for n in osm.findall("node"):
    props = {t.get("k"): t.get("v") for t in n.findall("tag")}
    kind = props.get("highway")
    if kind in ("traffic_signals", "crossing", "stop") and area.covers(
        Point(nodes[n.get("id")])
    ):
        layout["crossings"].append([kind, *[round(v, 1) for v in nodes[n.get("id")]]])
layout["trees"] = [
    [round(float(v), 1) for v in row[:5]]
    for row in json.loads((cache / "trees.json").read_text())
]
layout["arrivals"] = [approach(*p) for p in arrivals]
layout["vehicleArrivals"] = [approach(*p, True) for p in arrivals]
layout["startWalk"] = approach(*geo(29.35, -323.84), vehicle=True)
layout["startWalk"][0] += 1.4
layout["license"] = (
    "Buildings and terrain: Tokyo / PLATEAU CC BY 4.0. Road and path geometry: © OpenStreetMap contributors, ODbL 1.0. See art/shiba/sources.md."
)
(dest / "shiba-layout.json").write_text(
    json.dumps(layout, ensure_ascii=False, separators=(",", ":")) + "\n"
)
print("Street access", layout["arrivals"], "startWalk", layout["startWalk"])
