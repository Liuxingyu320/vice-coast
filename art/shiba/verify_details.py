"""Check the details against delivered roof triangles, tessellated paving, and occupied ground space."""

from collections import defaultdict
import json
import numpy as np
import shapely as sh
from shapely import Polygon, Point
from station_sites import bounds_rect, TOWER, BASIN
from grade import sample


def check(assets, d, mesh, paving, road, walk, buildings, region):
    city = json.loads((assets / "shiba-city-detail.json").read_text())
    grounds = defaultdict(list)
    roofs = defaultdict(list)
    for v, f, mat, attrs in mesh.meshes("Survey buildings"):
        if "_SURVEY_ROLE" not in attrs:
            continue
        role = mesh.read(attrs["_SURVEY_ROLE"]).ravel()[f[:, 0]]
        ids = mesh.read(attrs["_FEATURE_ID"]).ravel()[f[:, 0]].astype(int)
        tri = v[f]
        N = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        flat = (
            (role == 1)
            & (N[:, 2] > 0.99969 * np.linalg.norm(N, axis=1))
            & (np.ptp(tri[:, :, 2], axis=1) < 0.029)
        )
        for k in np.unique(ids[flat]):
            roofs[int(k)].extend(tri[flat & (ids == k)])
    shapes = {}
    protected = (
        set(d["templePrecinctIds"])
        | set(d["verifiedBuildings"].values())
        | {TOWER, BASIN}
    )
    layouts = defaultdict(list)
    checks = 0
    for owner, kind, x, y, z, dx, dy, w, length, h in city["roofs"]:
        assert d["footprints"][owner]["id"] not in protected
        key = (owner, round(z, 3))
        if key not in shapes:
            tri = np.asarray(roofs[owner])
            same = tri[np.max(abs(tri[:, :, 2] - z), axis=1) < 0.073]
            assert len(same), (owner, "roof support elevation")
            shapes[key] = sh.union_all(sh.polygons(same[:, :, :2])).buffer(0.003)
        base = bounds_rect((x, y), (dx, dy), -w / 2, w / 2, -length / 2, length / 2)
        assert shapes[key].covers(base), (owner, kind, "roof footprint")
        assert all(base.intersection(other).area < 0.0005 for other in layouts[key]), (
            owner,
            kind,
            "overlapping roof furniture",
        )
        layouts[key].append(base)
        checks += 1
    assert {"chiller", "tank", "duct", "parapet", "penthouse", "beacon"} == {
        q[1] for q in city["roofs"]
    }
    active = []
    solid_bases = []
    for key, names in [("street", None), ("plantings", None)]:
        for kind, x, y, nx, ny, w, depth, lift, idx in city[key]:
            base = bounds_rect((x, y), (nx, ny), -w / 2, w / 2, -depth / 2, depth / 2)
            assert (
                base.disjoint(road) and base.disjoint(buildings) and region.covers(base)
            ), (kind, x, y)
            assert (
                walk.buffer(0.001).covers(base)
                if lift
                else not walk.buffer(-0.001).intersects(base)
            ), (kind, x, y, "slab height")
            assert all(base.intersection(p).area < 0.0003 for p in active), (
                "overlapping props",
                kind,
            )
            active.append(base)
            if kind not in ("mulch", "understory", "treeGrate"):
                solid_bases.append(base)
    for station in d["stations"]:
        well = Polygon(station["well"])
        assert not road.intersects(well)
        assert all(q.disjoint(well) for q in active)
    for k in ["tactile", "tactileWarn", "inlet", "manhole"]:
        for v, f, mat, _ in paving.meshes("paving-" + k):
            grounds[k].extend(sh.polygons(v[f, :2]))
    warnings = sh.union_all(grounds["tactileWarn"])
    guide = sh.union_all(grounds["tactile"])
    for x, y, z, *_ in (
        d["fixtures"]["lamps"] + d["fixtures"]["signals"] + d["fixtures"]["gantries"]
    ):
        foot = Point(x, y).buffer(0.11)
        assert foot.disjoint(warnings) and foot.disjoint(guide), ("tactile/mast", x, y)
    indices = {typ: sh.STRtree(grounds[typ]) for typ in ["inlet", "manhole"]}
    for typ, x, y, dx, dy, w, length in d["drains"]:
        assert len(indices[typ].query(Point(x, y), predicate="intersects")), (
            "missing ironwork insert",
            x,
            y,
        )
    for x, y, nx, ny, w, _, fid, lobby in json.loads(
        (assets / "shiba-frontages.json").read_text()
    ):
        assert fid not in protected
        base = bounds_rect((x, y), (nx, ny), -w / 2, w / 2, 0.09, 1.31)
        assert base.disjoint(warnings) and base.disjoint(guide), (
            "frontage crosses tactile",
            x,
            y,
        )
        assert all(base.disjoint(Polygon(s["well"])) for s in d["stations"])
    soffits = []
    for fid, x, y, z, dx, dy in city["bridgeLights"]:
        q = Point(x, y)
        hit = False
        for v, f, mat, attrs in mesh.meshes(fid):
            tri = v[f]
            N = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            ns = np.flatnonzero(
                (N[:, 2] < 0)
                & (tri[:, :, 0].min(1) <= x)
                & (tri[:, :, 0].max(1) >= x)
                & (tri[:, :, 1].min(1) <= y)
                & (tri[:, :, 1].max(1) >= y)
            )
            for i in ns:
                if Polygon(tri[i, :, :2]).buffer(0.0002).covers(q):
                    p = tri[i, 0]
                    zz = p[2] - (N[i, :2] @ (np.array([x, y]) - p[:2])) / N[i, 2]
                    if abs(zz - z) < 0.02:
                        hit = True
        assert hit, (fid, "lamp off actual soffit")
        h = z - sample(d["height"], np.array([[x, y]]))[0] - 0.11
        assert h > 4.35, (fid, "vehicle clearance")
        soffits.append(h)
    water = sh.union_all([Polygon(w["rings"][0], w["rings"][1:]) for w in d["waters"]])
    assert all(not water.intersects(Point(t[:2])) for t in d["trees"])
    lawn = Point(451.72, -135.83)
    assert not road.intersects(lawn) and not walk.intersects(lawn)
    ground = []
    for v, f, _, _ in mesh.meshes("shiba-ground"):
        ground.extend(sh.polygons(v[f, :2]))
    assert len(sh.STRtree(ground).query(lawn, predicate="intersects"))
    from PIL import Image

    mask = np.asarray(Image.open(assets / "shiba-land-cover.png"))
    hh, ww = mask.shape[:2]
    g = d["height"]
    u = int((lawn.x - g["x"]) / (g["w"] - 1) / g["step"] * ww)
    v = int((1 - (lawn.y - g["y"]) / (g["h"] - 1) / g["step"]) * hh)
    assert mask[v, u, 1] > 210, "driving endpoint outside surveyed park cover"
    barriers = city["templeWalls"]
    for id, ax, ay, bx, by, h in barriers:
        line = sh.LineString([(ax, ay), (bx, by)]).buffer(0.12)
        assert line.disjoint(road) and line.disjoint(buildings) and 0 < h <= 1.65
    return dict(
        surveyedTempleWallSegments=len(barriers),
        waterBodies=len(d["waters"]),
        treesInWater=0,
        roofFixtures=checks,
        roofOwners=len(set(k[0] for k in shapes)),
        roofFixturesOnSlopesOrProtectedBuildings=0,
        verifiedStreetDetails=len(active),
        tactileApproaches=len(d["tactileApproaches"]),
        directionArrows=len(d["arrows"]),
        flushIronwork=len(d["drains"]),
        metroStairwells=len(d["stations"]),
        surveyedSoffitLights=len(soffits),
        minLitSoffitClearanceM=round(float(min(soffits)), 3),
    )


def check_daimon_seam(d, core, edge, region):
    # Follow the two physical carriageways of Daiichi Keihin over the old crop on both sides.
    tracks = [[(830.6, -182), (842.8, -83)], [(848, -182), (859.2, -83)]]
    types = ("asphalt", "white", "stop", "zebra", "yellow", "manhole", "inlet")
    triangles = []
    for model, prefix, keys in [
        (core, "paving-", types),
        (edge, "skyline-street-", ("asphalt", "white")),
    ]:
        for key in keys:
            for v, f, _, _ in model.meshes(prefix + key):
                tri = v[f]
                low = tri[:, :, :2].min(1)
                high = tri[:, :, :2].max(1)
                mask = (
                    (low[:, 0] < 863)
                    & (high[:, 0] > 825)
                    & (high[:, 1] > -186)
                    & (low[:, 1] < -78)
                )
                triangles.extend(tri[mask])
    tri = np.asarray(triangles)
    index = sh.STRtree(sh.polygons(tri[:, :, :2]))
    count = outer = 0
    maximum = 0
    for endpoints in tracks:
        for xy in np.linspace(*endpoints, 201):
            p = Point(xy)
            hits = index.query(p, predicate="intersects")
            assert len(hits), (
                "missing rendered through lane at former survey edge",
                xy,
            )
            t = tri[hits[0]]
            n = np.cross(t[1] - t[0], t[2] - t[0])
            h = t[0, 2] - (n[:2] @ (xy - t[0, :2])) / n[2]
            maximum = max(maximum, abs(h - sample(d["height"], xy)))
            count += 1
            outer += int(not region.covers(p))
    assert outer >= 95 and maximum < 0.025, (outer, maximum)
    return dict(
        daimonLaneSamples=count,
        samplesBeyondFormerBoundary=outer,
        maximumSeamHeightErrorM=round(float(maximum), 5),
    )
