"""Read the delivered glTF buffers, never the generator's counters. Units are survey metres."""

from collections import Counter, defaultdict
from pathlib import Path
import json, os, io
from PIL import Image
import numpy as np
import shapely as sh
from shapely.ops import unary_union
from shapely.geometry import LineString, Polygon
from grade import sample

ROOT = Path(__file__).resolve().parents[2]
assets = ROOT / "assets"
data = json.loads((assets / "shiba-layout.json").read_text())
g = dict(data["height"])
g["cm"] = np.array(g["cm"])
g["gradeCm"] = np.array(g["gradeCm"])
EPS = 0.00023  # glTF float32 at a ~1 km origin and the 0.1 mm planar lattice
counts = {}


from gltf_reader import GLB

district = GLB(assets / "shiba-park.glb")
paving = GLB(assets / "shiba-pavement.glb")
horizon = (
    GLB(assets / "shiba-horizon.glb")
    if (assets / "shiba-horizon.glb").exists()
    else district
)
region = Polygon(data["boundary"])
buildings = unary_union(
    [Polygon(b["rings"][0], b["rings"][1:]).buffer(0) for b in data["footprints"]]
)
road = unary_union(
    [
        LineString(pts).buffer(info[0] / 2, quad_segs=12)
        for (kind, pts), info in zip(data["roads"], data["roadInfo"])
        if kind == "road"
    ]
).intersection(region)
road = unary_union([p for p in sh.get_parts(road) if p.geom_type == "Polygon"])
walk = (
    road.buffer(3.2, quad_segs=12)
    .difference(road)
    .difference(buildings)
    .intersection(region)
)
walk = unary_union([p for p in sh.get_parts(walk) if p.geom_type == "Polygon"])
motor = road.buffer(-EPS)
outside = road.buffer(EPS)
outside_walk = walk.buffer(EPS)
for p in [road, walk, motor, outside, outside_walk, buildings]:
    sh.prepare(p)
areas = defaultdict(float)
patches = []
bins = []
asphalt_cover = []
walk_cover = []
road_slopes = []
curb_segments = None
marked_bands = sh.union_all([Polygon(p) for p in data["crosswalkBands"]])
stop_exclusion = marked_bands.buffer(0.90 - EPS)
sh.prepare(stop_exclusion)
for name in [*paving.nodes, "shiba-ground"]:
    key = name.removeprefix("paving-")
    file = district if key == "shiba-ground" else paving
    for v, f, mat, attrs in file.meshes(name):
        if key == "channel":
            deck_water = sh.union_all(sh.polygons(v[f, :2]))
            assert deck_water.area > 100 and np.ptp(v[:, 2]) < 0.001
            assert deck_water.intersection(road).area > 20
            counts["waterUnderRoadDecksM2"] = round(deck_water.area, 2)
            continue
        if key == "bank":
            assert len(f) > 25 and np.isfinite(v).all()
            continue
        z = sample(g, v[:, :2])
        delta = v[:, 2] - z
        if key in ("asphaltSkirt", "walkSkirt", "curbFace"):
            top = 0.0 if key == "asphaltSkirt" else 0.14
            bottom = top - (0.14 if key == "curbFace" else 0.40)
            assert np.minimum(abs(delta - top), abs(delta - bottom)).max() < EPS, (
                key,
                delta.min(),
                delta.max(),
            )
            on_top = np.abs(delta - top) < EPS
            edge_faces = f[np.sum(on_top[f], axis=1) == 2]
            edge_pairs = edge_faces[on_top[edge_faces]].reshape(-1, 2)
            lines = sh.linestrings(v[edge_pairs, :2])
            assert len(lines) > 50 and len(edge_faces) * 2 == len(f), key
            if key == "curbFace":
                curb_segments = lines
                intrusion = sh.intersects(motor, lines)
                assert not intrusion.any(), (
                    "curb crosses carriageway",
                    lines[intrusion][:2],
                )
                bounds = road.boundary.buffer(EPS)
                sh.prepare(bounds)
                assert sh.covers(bounds, lines).all(), (
                    "curbs outside the actual road edge"
                )
                counts["curbSegments"] = len(lines)
                counts["curbsInsideCarriageway"] = int(intrusion.sum())
            continue
        raised = key in ("sidewalk", "curb", "tactile", "tactileWarn")
        if key == "water":
            levels = np.array([p["z"] for p in data["waters"]])
            assert np.min(abs(v[:, 2, None] - levels), axis=1).max() < EPS
            assert np.ptp(v[f, 2], axis=1).max() < EPS
        else:
            assert np.max(abs(delta - (0.14 if raised else 0))) < EPS, (
                key,
                "vertex grade",
            )
        tri = v[f]
        mid = tri.mean(1)
        assert key == "water" or (
            np.max(abs(mid[:, 2] - sample(g, mid[:, :2]) - (0.14 if raised else 0)))
            < EPS
        ), (key, "triangle crossed a DEM crease")
        poly = sh.polygons(tri[:, :, :2])
        area = sh.area(poly)
        nondegenerate = area > 1e-10
        poly = poly[nondegenerate]
        mid = mid[nondegenerate]
        areas[key] += float(sh.area(poly).sum())
        if key == "stop":
            assert not sh.intersects(stop_exclusion, poly).any(), (
                "Stop line touches the pedestrian crossing"
            )
        if key == "zebra":
            assert sh.covers(marked_bands.buffer(EPS), poly).all(), (
                "Zebra stripe outside mapped band"
            )
        if raised:
            walk_cover.extend(poly)
            assert not sh.intersects(motor, poly).any(), (key, "paving in road")
            assert sh.covers(outside_walk, poly).all(), (key, "outside actual sidewalk")
        if key in ("asphalt", "zebra", "stop", "white", "yellow", "inlet", "manhole"):
            assert sh.covers(outside, poly).all(), (key, "outside road")
            asphalt_cover.extend(poly)
            normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            normals = normals[np.abs(normals[:, 2]) > 0.02]
            road_slopes.extend(
                np.linalg.norm(normals[:, :2], axis=1) / np.abs(normals[:, 2])
            )
        patches.append(poly)
        bins.append(
            np.floor((mid[:, 0] - g["x"]) / 5).astype(int)
            + g["w"] * np.floor((mid[:, 1] - g["y"]) / 5).astype(int)
        )
poly = np.concatenate(patches)
codes = np.concatenate(bins)
ids = np.argsort(codes)
# Each face belongs to one DEM cell. Dissolving per cell detects double paint and internal holes;
# validate total coverage against the independent surveyed boundary and road union.
unique, starts = np.unique(codes[ids], return_index=True)
unions = [sh.union_all(poly[chunk]) for chunk in np.split(ids, starts[1:])]
complete = sh.union_all(unions)
overlap = sum(areas.values()) - complete.area
wells = unary_union([Polygon(s["well"]) for s in data["stations"]])
expected = region.difference(wells)
outside_band = expected.buffer(-EPS).difference(complete).area
assert (
    complete.geom_type == "Polygon"
    and len(complete.interiors) == len(data["stations"]) == 3
)
assert wells.buffer(-EPS).intersection(complete).is_empty
assert complete.difference(expected.buffer(EPS)).is_empty
assert (
    abs(overlap) < 1e-7
    and outside_band < 1e-8
    and complete.difference(region.buffer(EPS)).is_empty
)
assert (
    abs(
        sum(
            areas[k]
            for k in ("asphalt", "zebra", "stop", "white", "yellow", "inlet", "manhole")
        )
        - road.area
    )
    < 0.12
)
assert max(road_slopes) < 0.17, ("road grade", max(road_slopes))


def dissolve(triangles):
    return (
        sh.coverage_union_all(triangles)
        if sh.coverage_is_valid(triangles)
        else sh.union_all(triangles)
    )


asphalt_surface = dissolve(asphalt_cover)
raised_surface = dissolve(walk_cover)
# Compare both sides of the actual exported kerb to the complete shared material interface.
edge = asphalt_surface.boundary.intersection(raised_surface.boundary)
kerbs = sh.union_all(curb_segments)
assert edge.symmetric_difference(kerbs).length < 0.001, (
    "unmatched kerb m",
    edge.symmetric_difference(kerbs).length,
)
counts.update(
    surfaceTriangles=len(poly),
    overlapAreaM2=round(overlap, 8),
    crossingBands=len(data["crosswalkBands"]),
    stopLinesInPedestrianBands=0,
    unintendedInteriorHoles=0,
    surveyedStairOpenings=len(complete.interiors),
    boundaryToleranceM=EPS,
    sharedCurbBoundaryM=round(edge.length, 2),
    maximumRoadSlopePercent=round(100 * max(road_slopes), 2),
)

for v, f, mat, attrs in district.meshes("building-foundations"):
    ids = district.read(attrs["_FEATURE_ID"]).ravel().astype(int)
    assert np.all(ids[f] == ids[f][:, :1])
    ground = sample(g, v[:, :2])
    raw = sample(g, v[:, :2], raw=True)
    pts = np.round(v[:, :2] * 10000).astype("i8")
    _, inverse = np.unique(np.column_stack([ids, pts]), axis=0, return_inverse=True)
    low = np.full(inverse.max() + 1, np.inf)
    high = np.full_like(low, -np.inf)
    np.minimum.at(low, inverse, v[:, 2])
    np.maximum.at(high, inverse, v[:, 2])
    vertical = (high - low)[inverse] > 0.5
    base = vertical & (np.abs(v[:, 2] - low[inverse]) < 0.0001)
    minimum = (
        np.minimum.reduce([ground[base], raw[base], high[inverse[base]]]) - v[base, 2]
    )
    assert len(set(ids[base])) == len(data["footprints"]) == 636
    assert minimum.min() >= 3.5 - EPS, (minimum.min(), "foundation depth")
    # Midpoints of every bottom segment catch rings that pass above the terrain between corners.
    bottoms = f[base[f].sum(1) == 2]
    pairs = bottoms[base[bottoms]].reshape(-1, 2)
    m = v[pairs].mean(1)
    depth = np.minimum(sample(g, m[:, :2]), sample(g, m[:, :2], raw=True)) - m[:, 2]
    assert depth.min() >= 3.5 - EPS, ("footing span", depth.min())
    counts.update(
        buildingsWithFootings=len(set(ids[base])),
        floatingBuildings=int(np.sum(minimum < 3.5 - EPS)),
        footingBottomSegments=len(pairs),
        minimumBurialM=round(min(minimum.min(), depth.min()), 4),
    )

roof_ids = set()
chart_set = set()
envelope = defaultdict(list)
footprint = defaultdict(list)
roof_up = defaultdict(float)
temple = []
step_layout = json.loads((assets / "shiba-hall-steps.json").read_text())
step_counts = 0
for file, name in [
    (district, "Survey buildings"),
    (horizon, "surveyed-skyline"),
    (horizon, "skyline-photofacades"),
]:
    for v, f, mat, attrs in file.meshes(name):
        file.texture(mat)
        if mat["name"] in (
            "Curtain wall",
            "Ribbon office",
            "Porcelain tile",
            "Metal sash",
        ):
            if mat["name"] not in chart_set:
                for texture in (
                    mat["pbrMetallicRoughness"]["baseColorTexture"],
                    mat["emissiveTexture"],
                ):
                    index = file.g["textures"][texture["index"]]["source"]
                    view = file.g["bufferViews"][file.g["images"][index]["bufferView"]]
                    offset = view.get("byteOffset", 0)
                    pixels = Image.open(
                        io.BytesIO(file.bin[offset : offset + view["byteLength"]])
                    )
                    assert pixels.size == (1024, 1024), mat["name"]
                    assert (
                        np.ptp(np.asarray(pixels.convert("RGB")), axis=(0, 1)).min()
                        > 65
                    ), mat["name"]
            chart_set.add(mat["name"])
            assert "emissiveTexture" in mat and "TEXCOORD_0" in attrs
            uv = file.read(attrs["TEXCOORD_0"])
            tri = v[f]
            normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            wall = (abs(normal[:, 2]) < 0.1 * np.linalg.norm(normal, axis=1)) & (
                np.ptp(tri[:, :, 2], axis=1) > 0.5
            )
            vertical = np.ptp(tri[wall, :, 2], axis=1)
            tex = np.ptp(uv[f[wall], 1], axis=1) * 26.4
            assert np.allclose(vertical, tex, atol=0.00012), "stretched cladding"
        if mat["name"] == "Stair nosing":
            tops = np.unique(v[:, 2])
            assert len(tops) == step_layout["count"] == 25
            assert np.allclose(
                tops,
                np.linspace(step_layout["bottom"], step_layout["landing"], 26)[1:],
                atol=0.00001,
            )
            for i, z in enumerate(tops):
                pts = v[v[:, 2] == z, :2] - np.array(step_layout["center"])
                edge = np.max(pts @ step_layout["front"])
                assert (
                    abs(edge - (step_layout["outer"] - i * step_layout["tread"]))
                    < 0.0001
                )
            step_counts = len(tops)
        if "_SURVEY_ROLE" in attrs:
            role = file.read(attrs["_SURVEY_ROLE"]).ravel()[f[:, 0]].astype(int)
            owner = file.read(attrs["_FEATURE_ID"]).ravel()[f[:, 0]].astype(int)
            roof_ids.update(owner[role == 1].tolist())
            tri = v[f]
            normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            for i in np.unique(owner):
                roof_up[i] += normal[(owner == i) & (role == 1), 2].sum() * 0.5
                if (
                    data["footprints"][i]["id"]
                    == data["verifiedBuildings"]["增上寺大殿"]
                ):
                    temple.append(tri[owner == i].reshape(-1, 3))
            valid = np.abs(normal[:, 2]) > 2e-8
            for role_id, target in [(3, footprint), (1, envelope), (2, envelope)]:
                select = valid & (role == role_id)
                for i in np.unique(owner[select]):
                    target[i].extend(sh.polygons(tri[select & (owner == i), :, :2]))
assert len(roof_ids) == 634 and len(chart_set) == 4, (len(roof_ids), chart_set)
closed = 0
uncovered = 0
for i in roof_ids:
    if data["footprints"][i]["id"] == "bldg_7aff4a51-be8b-405b-abe4-ac489697cbc8":
        continue
    assert roof_up[i] > 0.01, ("inverted roof", i)
    perimeter = sh.union_all(footprint[i])
    cover = sh.union_all(envelope[i])
    aperture = perimeter.difference(cover.buffer(EPS))
    assert aperture.area < 0.0001, ("uncovered roof", i, aperture.area)
    closed += 1
    uncovered += aperture.area
assert step_counts == 25
counts["mainHallRisers"] = step_counts
hall = np.concatenate(temple)
local = hall.reshape(-1, 3, 3).copy()
en = local[:, :, :2] - step_layout["center"]
local[:, :, 0], local[:, :, 1] = en @ step_layout["along"], en @ step_layout["front"]
lo, hi = np.min(local[:, :, :2], axis=1), np.max(local[:, :, :2], axis=1)


def det(p, q):
    return p[:, 0] * q[:, 1] - p[:, 1] * q[:, 0]


for j in range(step_counts):
    y = step_layout["outer"] - (j + 0.5) * step_layout["tread"]
    z = (
        step_layout["bottom"]
        + (j + 1) * (step_layout["landing"] - step_layout["bottom"]) / step_counts
    )
    for x in (-9.7, 0.13, 9.7):
        xy = np.array([x, y])
        tri = local[np.all((xy >= lo) & (xy <= hi), axis=1)]
        a, b, c = tri.transpose(1, 0, 2)
        d, e = b - a, c - a

        denom = det(d, e)
        valid = abs(denom) > 1e-8
        denom = np.where(valid, denom, 1.0)
        u, v = det(xy - a[:, :2], e) / denom, det(d, xy - a[:, :2]) / denom
        inside = valid & (u >= 0) & (v >= 0) & (u + v <= 1)
        hits = (a[:, 2] + u * d[:, 2] + v * e[:, 2])[inside]
        assert (
            len(hits)
            and np.min(abs(hits - z)) < EPS
            and not ((hits > z + EPS) & (hits <= z + 2)).any()
        ), ("Blocked step", j, x, hits)
counts["clearStairWalkSamples"] = step_counts * 3
span = np.ptp(hall, axis=0)
assert max(span[:2]) > 40 and span[2] > 27, ("main hall scale", span)
counts.update(
    surveyRoofOwners=len(roof_ids),
    closedOrdinaryRoofEnvelopes=closed,
    uncoveredRoofAreaM2=round(uncovered, 6),
    mainHallEnvelopeM=np.round(span, 2).tolist(),
    untexturedUrbanMaterials=0,
    facadeFamilies=len(chart_set),
)

trees = np.asarray(data["trees"])
points = sh.points(trees[:, :2])
on_walk = sh.covers(walk, points)
assert (
    not sh.intersects(road, points).any() and not sh.intersects(buildings, points).any()
)
assert not sh.intersects(road, sh.buffer(points, 0.70)).any()
assert sh.covers(walk, sh.buffer(points[on_walk], 1.15)).all()
assert np.min(sh.distance(buildings, points) - trees[:, 4] * 1.65) > 0.32
assert np.max(abs(trees[:, 2] - sample(g, trees[:, :2]) - 0.14 * on_walk)) < 0.001
counts.update(treeInstances=len(trees), treesInsideRoadOrBuildings=0)
for k in range(3):
    for v, f, mat, attr in district.meshes("tree-prototype-" + str(k)):
        if mat["name"] == "Leaf sprays":
            district.texture(mat)
            assert np.max(np.linalg.norm(v[:, :2], axis=1)) <= 1.65, (
                "Crown outside its collision envelope"
            )
            assert 0.31 <= v[:, 2].min() < 0.5 and abs(v[:, 2].max() - 1.0) < EPS, (
                "LiDAR crown height"
            )
            normals = district.read(attr["NORMAL"])
            assert len(np.unique(np.round(normals, 2), axis=0)) > 150

fx = data["fixtures"]
for kind in ("signals", "lamps", "gantries", "rails"):
    arr = np.asarray(fx[kind])
    pos = arr[:, :, :3].reshape(-1, 3) if kind == "rails" else arr[:, :3]
    p = sh.points(pos[:, :2])
    assert (
        sh.covers(walk, sh.buffer(p, 0.095)).all()
        and not sh.intersects(buildings, p).any()
    ), kind
    assert np.max(abs(pos[:, 2] - sample(g, pos[:, :2]) - 0.14)) < 0.0001, kind
    if kind != "rails":
        assert np.max(abs(sh.distance(road, p) - 2.88)) < 0.012, (kind, "outer edge")
    else:
        assert sh.covers(walk, sh.buffer(sh.linestrings(arr[:, :, :2]), 0.075)).all()
    counts[kind] = len(arr)
masts = []
canopies = sh.buffer(points, trees[:, 4] * 1.65, quad_segs=16)
crown_index = sh.STRtree(canopies)
for kind, length, half, h in [
    ("signals", 4.55, 0.77, 4.99),
    ("lamps", 2.85, 0.31, 6.11),
    ("gantries", 5.55, 0.25, 6.22),
]:
    for x, y, z, dx, dy in fx[kind]:
        reach = LineString([(x, y), (x - length * dy, y + length * dx)]).buffer(half)
        assert reach.disjoint(buildings), ("Mast arm enters building", kind, x, y)
        crossing = crown_index.query(reach, predicate="intersects")
        assert not any(
            trees[i, 2] + 0.31 * trees[i, 3] < z + h + 0.82
            and trees[i, 2] + 1.03 * trees[i, 3] > z + h - 0.82
            for i in crossing
        ), "Tree obstructs light"
        masts.append(sh.Point(x, y).buffer(0.13))
rails = [LineString([p[:2] for p in run]).buffer(0.095) for run in fx["rails"]]
assert not sh.intersects(sh.union_all(masts), rails).any(), "Guardrail intersects mast"
counts["armsInBuildingsOrCrowns"] = 0
counts["railMastCollisions"] = 0
bays = json.loads((assets / "shiba-frontages.json").read_text())
for x, y, nx, ny, w, kind, *metadata in bays:
    p = np.array([x, y])
    n = np.array([nx, ny])
    t = np.array([-ny, nx])
    face = Polygon(
        [
            p + t * u + n * v
            for u, v in [(-w / 2, 0.08), (w / 2, 0.08), (w / 2, 1.35), (-w / 2, 1.35)]
        ]
    )
    assert face.disjoint(motor), "Storefront over carriageway"
counts["frontageBays"] = len(bays)
for row in fx["amenities"]:
    kind, osm, x, y, nx, ny, lift, name, bench, w, d = row
    p = np.array([x, y])
    n = np.array([nx, ny])
    t = np.array([-ny, nx])
    box = Polygon(
        [
            p + t * u * w / 2 + n * v * d / 2
            for u, v in [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        ]
    )
    assert box.disjoint(road) and box.disjoint(buildings) and region.covers(box), osm
    assert abs(lift - (0.14 if walk.covers(box) else 0)) < EPS, osm
counts["mappedAmenities"] = dict(Counter(p[0] for p in fx["amenities"]))
counts["floatingOrObstructingFixtureBases"] = 0
from verify_details import check

counts.update(check(assets, data, district, paving, road, walk, buildings, region))
from verify_details import check_daimon_seam

counts.update(check_daimon_seam(data, paving, horizon, region))
report = json.dumps(counts, indent=2)
if path := os.environ.get("SHIBA_GEOMETRY_REPORT"):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(report + "\n")
print(report)
