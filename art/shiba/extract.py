"""Extract surveyed surfaces with original ring UVs; register all layers in the same metre frame."""

import argparse
from collections import Counter
import concurrent.futures
import json
from pathlib import Path
import pickle
import zlib
import struct
import numpy as np
from lxml import etree as E
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
from shiba_site import en, EAST, NORTH, LAT, LON, PINS, roads_and_boundary
from fetch_city import directory, byte_range

GID = "{http://www.opengis.net/gml}id"
TOWER = "bldg_7aff4a51-be8b-405b-abe4-ac489697cbc8"


def tag(el):
    return E.QName(el).localname


def points(q):
    if q is None or not q.text:
        return None
    a = np.fromstring(q.text, sep=" ").reshape(-1, 3)
    return np.column_stack(((a[:, 1] - LON) * EAST, (a[:, 0] - LAT) * NORTH, a[:, 2]))


def polygon_rings(poly):
    result = []
    for ring in poly.findall(".//{*}LinearRing"):
        ar = points(ring.find("{*}posList"))
        if ar is not None and len(ar) >= 4:
            result.append((ring.get(GID), ar[:-1]))
    return result


def geompolys(geom):
    if geom.geom_type == "Polygon":
        return [geom]
    return [p for p in getattr(geom, "geoms", []) if p.geom_type == "Polygon"]


def height_grid(cache, area):
    bounds = area.bounds
    coords = []
    for f in sorted((cache / "udx/dem").glob("*.gml")):
        for _, pos in E.iterparse(
            str(f), events=("end",), tag="{*}posList", huge_tree=True
        ):
            # Reject distant grid cells before converting the full triangle.
            ab = pos.text.split(None, 2)
            x, y = en(float(ab[0]), float(ab[1]))
            if (
                bounds[0] - 130 < x < bounds[2] + 130
                and bounds[1] - 130 < y < bounds[3] + 130
            ):
                coords.extend(points(pos)[:-1])
            pos.clear()
            parent = pos.getparent()
            if parent is not None and parent.getparent() is not None:
                tri = parent.getparent().getparent()
                if tri is not None and tag(tri) == "Triangle":
                    while tri.getprevious() is not None:
                        del tri.getparent()[0]
    cloud = np.unique(np.round(np.array(coords), 3), axis=0)
    print("DEM samples", len(cloud), flush=True)
    xy = cloud[:, :2]
    start = np.floor(np.array(bounds[:2]) / 5) * 5 - 10
    end = np.ceil(np.array(bounds[2:]) / 5) * 5 + 10
    gx = np.arange(start[0], end[0] + 1, 5)
    gy = np.arange(start[1], end[1] + 1, 5)
    X, Y = np.meshgrid(gx, gy)
    height = LinearNDInterpolator(xy, cloud[:, 2])(X, Y)
    bad = np.isnan(height)
    if bad.any():
        height[bad] = NearestNDInterpolator(xy, cloud[:, 2])(X[bad], Y[bad])
    return dict(
        x=float(gx[0]),
        y=float(gy[0]),
        step=5,
        w=len(gx),
        h=len(gy),
        cm=np.rint(height * 100).astype("int32").ravel().tolist(),
    )


def primary(obj, level):
    # Surface geometries own the polygons. The corresponding Solid references them.
    polys = []
    seen = set()
    for holder in obj.iter():
        name = tag(holder)
        if not name.startswith("lod" + str(level)) or name not in {
            f"lod{level}MultiSurface",
            f"lod{level}Geometry",
            f"lod{level}Solid",
        }:
            continue
        for po in holder.iterfind(".//{*}Polygon"):
            key = po.get(GID) or id(po)
            if key not in seen:
                polys.append(po)
                seen.add(key)
    return polys


def temple_precinct(cache, footprints):
    import xml.etree.ElementTree as ET
    from shapely import union_all

    osm = ET.parse(cache / "streets.osm")
    osm_nodes = {
        p.get("id"): en(float(p.get("lat")), float(p.get("lon")))
        for p in osm.iterfind("node")
    }
    precinct = []
    for way in osm.iterfind("way"):
        tags = {tag.get("k"): tag.get("v") for tag in way.iterfind("tag")}
        if tags.get("name") == "増上寺" and tags.get("amenity") == "place_of_worship":
            precinct.append(
                Polygon(
                    [
                        osm_nodes[q.get("ref")]
                        for q in way.iterfind("nd")
                        if q.get("ref") in osm_nodes
                    ]
                ).buffer(0)
            )
    sacred = union_all(precinct)
    return [
        b["id"]
        for b in footprints
        if sacred.covers(
            Polygon(b["rings"][0], b["rings"][1:]).buffer(0).representative_point()
        )
    ]


def public_realm(cache, data, road):
    """Classify the source shells before sidewalks, collision and street furniture are built."""
    from station_sites import BASIN, DAIMON_A6, SHIBA_A3
    from foottown import tower_plan

    _, _, _, park = roads_and_boundary(cache)
    source = json.loads((cache / "layout.json").read_text())
    features, _, _ = pickle.load(open(cache / "surfaces.pkl", "rb"))
    heights = {
        fid: np.ptp(np.concatenate([r[:, 2] for _, rr in surfaces for _, r in rr]))
        for fid, _, _, surfaces in features
    }
    protected = {BASIN, DAIMON_A6, SHIBA_A3, TOWER, *data["verifiedBuildings"].values()}
    walkway = road.buffer(3.2, quad_segs=12)
    u, n, _ = tower_plan()
    entrance = Polygon(
        [u * x + n * y for x, y in [(-10, 28), (10, 28), (10, 44), (-10, 44)]]
    )
    paths = unary_union(
        [
            line.buffer(min(info[0], 4) / 2)
            for (kind, coords), info in zip(data["roads"], data["roadInfo"])
            if kind == "path"
            for line in [LineString(coords)]
        ]
    )
    active, omitted, park_ids, park_sites = [], {}, [], []
    from grade import sample

    grid = dict(data["height"])
    grid["cm"] = np.asarray(grid["cm"])
    low_eaves = {}
    for fid, _, _, surfaces in features:
        if heights[fid] > 12:
            continue
        roof = np.concatenate(
            [
                rim
                for role, rings in surfaces
                if role == "RoofSurface"
                for _, rim in rings
            ]
            or [np.empty((0, 3))]
        )
        if len(roof):
            low_eaves[fid] = np.min(roof[:, 2] - sample(grid, roof[:, :2]))
    for feature in source["footprints"]:
        fid = feature["id"]
        poly = Polygon(feature["rings"][0], feature["rings"][1:]).buffer(0)
        height = heights[fid]
        small = poly.area < 120
        in_park = park.covers(poly.representative_point())
        reason = None
        if small and height < 2.6:
            reason = "low survey accessory"
        elif small and height < 8 and poly.intersection(walkway).area > 0.03:
            reason = "sidewalk obstruction"
        elif small and height < 5 and poly.intersection(paths).area > poly.area * 0.35:
            reason = "pedestrian path obstruction"
        elif small and height < 8 and poly.intersects(entrance):
            reason = "FootTown entrance apron"
        if reason and fid not in protected:
            omitted[fid] = reason
            continue
        low_annex = height < 10 and low_eaves.get(fid, 20) < 0.15 and poly.area < 450
        if in_park or low_annex:
            park_sites.append(fid)
        if small or (in_park and height < 8) or low_annex:
            park_ids.append(fid)
        active.append(feature)
    data["templePrecinctIds"] = temple_precinct(cache, active)
    data.update(
        footprints=active,
        excludedSurveyBuildings=omitted,
        parkBuildingIds=park_ids,
        parkSiteIds=park_sites,
    )


def extract(cache):
    area, ways, osm_trees, greens = roads_and_boundary(cache)
    height = height_grid(cache, area)
    rings_in_use = set()
    features = []
    footprints = []
    names = {}
    tower_ref = None
    for f in sorted((cache / "udx/bldg").glob("*.gml")):
        for _, obj in E.iterparse(
            str(f), events=("end",), tag="{*}Building", huge_tree=True
        ):
            featid = obj.get(GID)
            edges = obj.findall(".//{*}lod0RoofEdge//{*}Polygon")
            shapes = []
            for edge in edges:
                rr = polygon_rings(edge)
                if rr:
                    shapes.extend(
                        geompolys(
                            Polygon(
                                rr[0][1][:, :2], [v[:, :2] for _, v in rr[1:]]
                            ).buffer(0)
                        )
                    )
            if not shapes:
                q = points(obj.find(".//{*}posList"))
                if q is None or not area.contains(Point(q[0, :2])):
                    obj.clear()
                    continue
            else:
                footprint = unary_union(shapes)
                if footprint.is_empty or not area.covers(
                    footprint.representative_point()
                ):
                    obj.clear()
                    continue
                if (
                    not area.buffer(3).covers(footprint)
                    and area.intersection(footprint).area < 0.8 * footprint.area
                ):
                    obj.clear()
                    continue
                for pol in geompolys(footprint):
                    footprints.append(
                        {
                            "id": featid,
                            "rings": [
                                np.round(np.asarray(r.coords)[:-1], 2).tolist()
                                for r in [pol.exterior, *pol.interiors]
                            ],
                        }
                    )
            for level in [3, 2, 1]:
                polys = primary(obj, level)
                if polys:
                    break
            stored = []
            for poly in polys:
                rings = polygon_rings(poly)
                if not rings:
                    continue
                node = poly
                while node is not None and tag(node) not in [
                    "RoofSurface",
                    "WallSurface",
                    "GroundSurface",
                    "Door",
                    "Window",
                    "Building",
                    "OuterFloorSurface",
                    "OuterCeilingSurface",
                    "BuildingInstallation",
                ]:
                    node = node.getparent()
                role = tag(node) if node is not None else "Building"
                # Preserve the official tower mesh in its own editable reference object;
                # the open steelwork is modeled from the measured profile separately.
                stored.append((role, rings))
                rings_in_use.update(k for k, _ in rings if k)
            if stored:
                features.append((featid, obj.findtext("{*}name", ""), level, stored))
            obj.clear()
        print(f.name, len(features), "buildings so far", flush=True)
    texture_uv = {}
    needed = set()
    for f in sorted((cache / "udx/bldg").glob("*.gml")):
        for _, tex in E.iterparse(
            str(f), events=("end",), tag="{*}ParameterizedTexture", huge_tree=True
        ):
            uri = tex.findtext("{*}imageURI")
            for q in tex.iterfind(".//{*}textureCoordinates"):
                ring = q.get("ring", "").lstrip("#")
                if ring not in rings_in_use:
                    continue
                uv = np.fromstring(q.text, sep=" ").reshape(-1, 2)
                texture_uv[ring] = (uri, uv)
                needed.add(uri)
            tex.clear()
    # Street furniture and vegetation use their surveyed locations and original geometry.
    appendices = []
    for group in ["veg", "frn"]:
        for f in sorted((cache / "udx" / group).glob("*.gml")):
            for _, member in E.iterparse(
                str(f), events=("end",), tag="{*}cityObjectMember", huge_tree=True
            ):
                ob = member[0]
                p = points(ob.find(".//{*}posList"))
                if p is None or not area.contains(Point(p[0, :2])):
                    member.clear()
                    continue
                polys = primary(ob, 3) or primary(ob, 2) or primary(ob, 1)
                rr = [polygon_rings(poly) for poly in polys]
                rr = [r for r in rr if r]
                if rr:
                    appendices.append(
                        (group, ob.get(GID), ob.findtext("{*}function", ""), rr)
                    )
                member.clear()
    streets = []
    for kind, line in ways:
        if not area.intersects(line):
            continue
        cut = area.intersection(line)
        for seg in (
            [cut] if cut.geom_type == "LineString" else getattr(cut, "geoms", [])
        ):
            if seg.geom_type == "LineString" and seg.length > 2:
                streets.append(
                    [kind, np.round(np.asarray(seg.simplify(0.7).coords), 2).tolist()]
                )
    boundary = np.round(np.asarray(area.exterior.coords)[:-1], 3).tolist()
    layout = dict(
        lon=LON,
        lat=LAT,
        east=EAST,
        north=NORTH,
        boundary=boundary,
        footprints=footprints,
        roads=streets,
        height=height,
        areaM2=round(area.area),
        pins=[[k, *en(lat, lon)] for k, lat, lon in PINS],
    )
    (cache / "layout.json").write_text(
        json.dumps(layout, ensure_ascii=False, separators=(",", ":"))
    )
    with (cache / "surfaces.pkl").open("wb") as fp:
        pickle.dump((features, texture_uv, appendices), fp, protocol=4)
    (cache / "needed.json").write_text(json.dumps(sorted(needed)))
    print(
        "Buildings",
        Counter(q[2] for q in features),
        "UV rings",
        len(texture_uv),
        "images",
        len(needed),
        "other features",
        Counter(v[0] for v in appendices),
        flush=True,
    )


def get_images(cache):
    wanted = {"udx/bldg/" + v for v in json.loads((cache / "needed.json").read_text())}
    items = sorted(
        [
            i
            for i in directory(cache)
            if i.filename in wanted and not (cache / i.filename).exists()
        ],
        key=lambda i: i.header_offset,
    )
    groups = []
    for i in items:
        if (
            not groups
            or i.header_offset
            - (groups[-1][-1].header_offset + groups[-1][-1].compress_size)
            > 90000
            or i.header_offset - groups[-1][0].header_offset > 2500000
        ):
            groups.append([])
        groups[-1].append(i)
    print(
        "Fetching",
        len(items),
        "images in",
        len(groups),
        "ranges, compressed MB",
        round(sum(i.compress_size for i in items) / 1e6, 1),
        flush=True,
    )

    def fetch_group(group):
        start = group[0].header_offset
        last = group[-1]
        result = byte_range(
            start,
            last.header_offset + last.compress_size + len(last.filename.encode()) + 512,
        )
        for i in group:
            offset = i.header_offset - start
            assert result[offset : offset + 4] == b"PK\x03\x04"
            fn, extra = struct.unpack_from("<HH", result, offset + 26)
            begin = offset + 30 + fn + extra
            buf = result[begin : begin + i.compress_size]
            buf = zlib.decompress(buf, -15) if i.compress_type == 8 else buf
            assert len(buf) == i.file_size and zlib.crc32(buf) == i.CRC
            dest = cache / i.filename
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(buf)

    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        list(pool.map(fetch_group, groups))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--textures-only", action="store_true")
    args = ap.parse_args()
    if not args.textures_only:
        extract(args.cache)
    get_images(args.cache)
