"""Continue the same OSM streets through the survey cut and into the surrounding PLATEAU terrain."""

import xml.etree.ElementTree as ET
import json, re
import numpy as np
import shapely as sh
from shapely import LineString, Polygon
from shiba_site import en
from grade import sample


def road_info(tags):
    category = tags["highway"]
    count = re.search(r"\d+", tags.get("lanes", ""))
    lanes = int(count.group()) if count else 0
    span = re.search(r"[\d.]+", tags.get("width", ""))
    default = {
        "primary": 13,
        "secondary": 10,
        "tertiary": 8,
        "residential": 5.2,
        "service": 3.6,
    }.get(category, 5.6)
    width = float(span.group()) if span else max(lanes * 2.9, default)
    return [
        round(min(24, max(1.2, width)), 1),
        category,
        tags.get("oneway", "no"),
        lanes or (2 if width > 5 else 1),
    ]


def mapped_roads(cache):
    osm = ET.parse(cache / "streets.osm")
    nodes = {
        n.get("id"): en(float(n.get("lat")), float(n.get("lon")))
        for n in osm.iterfind("node")
    }
    excluded = {
        "construction",
        "proposed",
        "motorway",
        "motorway_link",
        "platform",
        "raceway",
        "elevator",
        "steps",
        "footway",
        "pedestrian",
        "path",
        "cycleway",
        "bridleway",
    }
    for way in osm.iterfind("way"):
        tags = {t.get("k"): t.get("v") for t in way.iterfind("tag")}
        if tags.get("highway") in excluded or not tags.get("highway"):
            continue
        if (
            tags.get("access") == "private"
            or tags.get("tunnel") == "yes"
            or int(tags.get("layer", "0").split(";")[0] or 0) < 0
        ):
            continue
        coords = [
            nodes[n.get("ref")] for n in way.iterfind("nd") if n.get("ref") in nodes
        ]
        if len(coords) > 1:
            yield LineString(coords), road_info(tags)


def connections(cache, data, survey, region):
    count = len(json.loads((cache / "layout.json").read_text())["roads"])
    del data["roads"][count:]
    del data["roadInfo"][count:]
    # The core centreline source was clipped before buffering. Restore the portion of
    # the same mapped way on the far side so that end caps cannot close a through street.
    extension = region.buffer(18)
    for line, info in mapped_roads(cache):
        if not line.intersects(survey) or not line.intersects(
            region.boundary.buffer(12)
        ):
            continue
        for seg in sh.get_parts(line.difference(survey).intersection(extension)):
            if (
                seg.geom_type != "LineString"
                or seg.length < 0.25
                or seg.distance(survey) > 0.14
            ):
                continue
            data["roads"].append(["road", np.asarray(seg.coords).round(3).tolist()])
            data["roadInfo"].append(info)
    return len(data["roads"]) - count


def split_backdrop(cache, terrain, region, data):
    from prepare_mesh import Mesh
    from waterways import water_plan

    band = region.buffer(385)
    bodies = [
        line.buffer(info[0] / 2, quad_segs=10)
        for line, info in mapped_roads(cache)
        if line.intersects(band)
    ]
    road = sh.union_all(bodies).intersection(band)
    # Honour the complete measured core widths where a divided street straddles its cut.
    core = sh.union_all(
        [
            LineString(p).buffer(i[0] / 2, quad_segs=12)
            for (k, p), i in zip(data["roads"], data["roadInfo"])
            if k == "road"
        ]
    )
    road = road.union(core)
    walk = road.buffer(3.2, quad_segs=8).difference(road)
    # Carry the same continuous white edge marking around the true union. Minor streets stay unmarked.
    major = sh.union_all(
        [
            line.buffer(info[0] / 2 + 1)
            for line, info in mapped_roads(cache)
            if info[0] >= 6.8 and line.intersects(band)
        ]
    )
    edge = road.buffer(-0.46).boundary.buffer(0.065, quad_segs=3).intersection(major)
    waters = (
        water_plan(cache, data, region.buffer(95))
        .difference(road.union(walk))
        .difference(region)
    )
    shapes = {
        "asphalt": road.difference(edge),
        "white": edge,
        "sidewalk": walk,
        "water": waters,
    }
    drive = region.buffer(74, quad_segs=8)

    def encode(poly):
        return [
            np.round(np.asarray(r.coords)[:-1], 3).tolist()
            for r in [poly.exterior, *poly.interiors]
        ]

    def near(shape):
        return [
            encode(p)
            for p in sh.get_parts(shape.intersection(drive).difference(region))
            if p.geom_type == "Polygon" and p.area > 0.002
        ]

    (cache / "edge-travel.json").write_text(
        json.dumps(
            {"boundary": encode(drive)[0], "walks": near(walk), "waters": near(waters)},
            separators=(",", ":"),
        )
    )
    x0, y0, x1, y1 = band.bounds
    grid = [
        sh.box(x, y, x + 72, y + 72)
        for x in np.arange(np.floor(x0 / 72) * 72, x1, 72)
        for y in np.arange(np.floor(y0 / 72) * 72, y1, 72)
    ]
    fragments = []
    types = []
    for key, shape in shapes.items():
        portions = sh.get_parts(sh.intersection(grid, shape.difference(region)))
        for p in portions:
            if p.geom_type == "Polygon" and p.area > 1e-6:
                fragments.append(p)
                types.append(key)
    spatial = sh.STRtree(fragments)
    v, f, uv, mi = terrain
    tri = v[f].astype(float)
    polys = sh.polygons(tri[:, :, :2])
    ids, which = spatial.query(polys, predicate="intersects")
    from collections import defaultdict

    overlaps = defaultdict(list)
    for i, j in zip(ids, which):
        overlaps[int(i)].append(int(j))
    base = Mesh()
    paved = {key: Mesh() for key in shapes}
    skirts = Mesh()
    from materials import METRES

    stages = [p for p in sh.get_parts(waters) if p.geom_type == "Polygon"]
    stage_index = sh.STRtree(stages)
    core_waters = [
        (Polygon(w["rings"][0], w["rings"][1:]), w["z"]) for w in data["waters"]
    ]
    water_z = [
        float(
            np.percentile(sample(data["height"], np.asarray(p.exterior.coords)), 12)
            - 0.28
        )
        for p in stages
        if p.geom_type == "Polygon"
    ]
    for i, p in enumerate(stages):
        joins = [z for q, z in core_waters if p.distance(q) < 0.08]
        if joins:
            water_z[i] = float(np.median(joins))
    for i, poly in enumerate(polys):
        if i not in overlaps:
            at = len(base.v)
            base.v.extend(tri[i])
            base.uv.extend(uv[f[i]])
            base.f.append(np.arange(3) + at)
            base.mi.append(2)
            continue
        indices = overlaps[i]
        hits = sh.intersection([fragments[j] for j in indices], poly)
        parts = [("base", p) for p in sh.get_parts(poly.difference(sh.union_all(hits)))]
        for j, hit in zip(indices, hits):
            parts.extend((types[j], p) for p in sh.get_parts(hit))
        xy = tri[i, :, :2]
        if abs(np.linalg.det((xy[1:] - xy[0]).T)) < 1e-11:
            continue
        inv = np.linalg.inv((xy[1:] - xy[0]).T)
        for typ, p in parts:
            if p.geom_type != "Polygon" or p.area < 1e-7:
                continue
            p = sh.orient_polygons(p)
            rings = []
            charts = []
            for r in [p.exterior, *p.interiors]:
                q = np.asarray(r.coords)[:-1]
                b = (q - xy[0]) @ inv.T
                bary = np.column_stack((1 - b.sum(1), b))
                z = bary @ tri[i, :, 2]
                if typ == "sidewalk":
                    z += 0.14
                if typ == "water":
                    z[:] = water_z[int(stage_index.nearest(p.representative_point()))]
                rings.append(np.column_stack((q, z)))
                charts.append(
                    bary @ uv[f[i]] if typ == "base" else q / METRES.get(typ, 2.4)
                )
            (base if typ == "base" else paved[typ]).add(
                rings, charts, 2 if typ == "base" else 0
            )
    # Skirt heights at the shared seam follow the same triangle planes as the road.
    mesh = paved["sidewalk"].pack()
    vv, ff = mesh[:2]
    if len(ff):
        coord, ids = np.unique(np.round(vv, 4), axis=0, return_inverse=True)
        e = ids[ff][:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
        _, ii, counts = np.unique(
            np.sort(e, axis=1), axis=0, return_index=True, return_counts=True
        )
        candidates = e[ii[counts == 1]]
        edge_segments = []
        for ring in sh.get_parts(walk.boundary):
            pts = np.asarray(ring.coords)
            edge_segments.extend(sh.linestrings(np.stack([pts[:-1], pts[1:]], axis=1)))
        midpoint = coord[candidates, :2].mean(1)
        match = sh.STRtree(edge_segments).query_nearest(
            sh.points(midpoint), max_distance=0.0015, all_matches=False
        )[0]
        for ia, ib in candidates[match]:
            a, b = coord[[ia, ib]]
            verts = np.array([a, b, b - [0, 0, 0.40], a - [0, 0, 0.40]])
            if np.linalg.norm(a - b) < 0.0008:
                continue
            n = len(skirts.v)
            skirts.v.extend(verts)
            skirts.uv.extend(
                (
                    (0, 0.4),
                    (np.linalg.norm(a - b), 0.4),
                    (np.linalg.norm(a - b), 0),
                    (0, 0),
                )
            )
            skirts.f.extend([[n, n + 2, n + 1], [n, n + 3, n + 2]])
            skirts.mi.extend([0, 0])
    result = {k: m.pack() for k, m in paved.items() if m.f}
    if skirts.f:
        result["curbFace"] = skirts.pack()

    def weld(mesh):
        v, f, uv, mi = mesh
        _, first, ids = np.unique(
            np.column_stack(
                (np.round(v.astype(float), 5), np.round(uv.astype(float), 6))
            ),
            axis=0,
            return_index=True,
            return_inverse=True,
        )
        faces = ids[f].astype("i4")
        valid = (
            (faces[:, 0] != faces[:, 1])
            & (faces[:, 1] != faces[:, 2])
            & (faces[:, 2] != faces[:, 0])
        )
        return v[first], faces[valid], uv[first], mi[valid]

    return weld(base.pack()), {k: weld(v) for k, v in result.items()}
