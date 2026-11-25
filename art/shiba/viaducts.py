"""Keep measured elevated decks, piers and the adjoining spans visible from the district."""

from pathlib import Path
import json, pickle, sys
import numpy as np
from lxml import etree as E
from shapely import Polygon, Point, LineString, STRtree
from shiba_site import en
from extract import primary, polygon_rings, GID
from prepare_mesh import Mesh


def build(cache):
    layout = json.loads((cache / "layout.json").read_text())
    area = Polygon(layout["boundary"])
    surroundings = area.buffer(490)
    osm = E.parse(str(cache / "streets.osm"))
    nodes = {
        n.get("id"): en(float(n.get("lat")), float(n.get("lon")))
        for n in osm.iterfind("node")
    }
    roads = []
    for way in osm.iterfind("way"):
        tags = {t.get("k"): t.get("v") for t in way.iterfind("tag")}
        if tags.get("highway") not in ("motorway", "motorway_link", "trunk"):
            continue
        xy = [nodes[n.get("ref")] for n in way.iterfind("nd") if n.get("ref") in nodes]
        if len(xy) > 1:
            roads.append(LineString(xy))
    index = STRtree(roads)
    result = []
    outside = Mesh()

    def road_uv(r, line):
        xy = np.array(r)[:, :2]
        uv = []
        for p in xy:
            s = line.project(Point(p))
            a = np.array(line.interpolate(max(0, s - 0.4)).coords[0])
            b = np.array(line.interpolate(min(line.length, s + 0.4)).coords[0])
            d = (b - a) / max(np.linalg.norm(b - a), 1e-10)
            l = p - np.array(line.interpolate(s).coords[0])
            u = np.clip(0.5 + (-d[1] * l[0] + d[0] * l[1]) / 7.65, 0.003, 0.997)
            uv.append((u, s / 9.0))
        return np.asarray(uv)

    for path in sorted((cache / "udx/brid").glob("*.gml")):
        for _, ob in E.iterparse(
            str(path), events=("end",), tag="{*}Bridge", huge_tree=True
        ):
            inside = Mesh()
            for po in primary(ob, 3) or primary(ob, 2) or primary(ob, 1):
                rings = [r for _, r in polygon_rings(po)]
                if not rings:
                    continue
                r = rings[0]
                mid = Point(r[:, :2].mean(0))
                if not surroundings.covers(mid):
                    continue
                arr = inside if area.covers(mid) else outside
                normal = np.cross(r - r[0], np.roll(r - r[0], -1, axis=0)).sum(0)
                line = roads[index.nearest(mid)] if roads else None
                if (
                    line is not None
                    and normal[2] > 0.77 * np.linalg.norm(normal)
                    and line.distance(mid) < 11
                ):
                    arr.add(rings, [road_uv(r, line) for r in rings], 0)
                else:
                    arr.add(rings, [r[:, :2] / 2.4 for r in rings], 1)
            if inside.f:
                result.append(
                    (
                        "Bridge",
                        ob.get(GID),
                        ob.findtext("{*}name") or ob.get(GID),
                        inside.pack(),
                    )
                )
            ob.clear()
    # The south motorway is delivered as one box deck and twelve separate pier objects in CityGML.
    from bridge_joinery import connect

    joins = {}
    for i, (group, fid, label, arr) in enumerate(result):
        if fid == "brid_ec2a731e-d558-41bd-a1b8-409f341db81c":
            grid = json.loads(
                (
                    Path(__file__).resolve().parents[2] / "assets/shiba-layout.json"
                ).read_text()
            )["height"]
            geometry, seats, lights = connect(arr, roads, grid)
            result[i] = group, fid, label, geometry
            joins[fid] = {"bearings": seats, "lights": lights}
    (cache / "bridge-joinery.json").write_text(json.dumps(joins))
    result.append(
        ("Bridge", "skyline-viaduct", "周辺 · 高架の連続径間", outside.pack())
    )
    pickle.dump(result, open(cache / "viaducts.pkl", "wb"), protocol=4)
    print("Bridge sections", len(result), "surrounding triangles", len(outside.f))


if __name__ == "__main__":
    build(Path(sys.argv[1]))
