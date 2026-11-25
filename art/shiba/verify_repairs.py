"""Regression measurements against the shipped survey-space meshes and shop envelopes."""

from hashlib import sha256
import json
import numpy as np
import shapely as sh
from station_sites import station_envelope, bounds_rect, TOWER
from foottown import bearings, tower_plan


def panel_bounds(mesh, vertices, faces, material, attrs):
    """Recover the rendered chart edges from glTF attributes and independently check their atlas phase."""
    fit = np.column_stack(
        [mesh.read(attrs[key]).ravel() for key in ("_PANEL_U", "_PANEL_V")]
    )
    tile = mesh.read(attrs["TEXCOORD_0"]).astype(float)
    tile[:, 1] = 1 - tile[:, 1]
    if material not in ("Park joinery", "Temple joinery"):
        tile *= 8
    above = vertices[:, 2] - mesh.read(attrs["_PLINTH"]).ravel()

    def endpoints(axis, value):
        coordinates = fit[faces, axis].astype(float)
        span = np.ptp(coordinates, axis=1)
        # A second triangle spanning the same chart supplies the edge value for narrow/degenerate slivers.
        valid = span > 0.25
        samples, triangles = coordinates[valid], faces[valid]
        row = np.arange(len(triangles))
        lo = triangles[row, samples.argmin(axis=1)]
        hi = triangles[row, samples.argmax(axis=1)]
        slope = (value[hi] - value[lo]) / span[valid]
        bottom = value[lo] - fit[lo, axis] * slope
        return np.stack([bottom, bottom + slope])

    bays = [endpoints(axis, tile[:, axis]) for axis in (0, 1)]
    deviation = max(float(abs(b - b.round()).max()) for b in bays)
    sill = float(endpoints(1, above)[0].min())
    assert deviation < 0.0001 and sill > 0.5998, (material, deviation, sill)
    return deviation, sill


def check(assets, data, city_mesh, paving):
    reference = {
        "Ivory steel": "51fcc216cdeafaaf3dabf4a94edd13dff26edf082e50c98721ef6f857accb1ee",
        "International orange": "fab30961a98825acbca95f742c5e92ea317eecc634bd11d8d1e6c6ec1cfc378d",
        "Antenna steel": "91b0b60b160a28f5ca689204939db9beaafabbf917b0bf946f9f9640cc47eee1",
    }
    # Byte-exact XYZ at original glTF precision, independent of triangulation index ordering.
    # Reference geometry from liudoudou 1be87a1, above the first shared seven-metre stage.
    unchanged = 0
    for v, f, material, _ in city_mesh.meshes("tower-lattice"):
        triangles = np.ascontiguousarray(v[f].astype("<f4"))
        triangles = triangles[triangles[:, :, 2].min(1) > 25.391]
        vertices = np.sort(triangles.view("V12").reshape(-1, 3), axis=1)
        raw = np.sort(vertices.copy().view("V36").ravel()).tobytes()
        assert sha256(raw).hexdigest() == reference.pop(material["name"]), material[
            "name"
        ]
        unchanged += len(triangles)
        if material["name"] == "Antenna steel":
            shoes = v
    assert not reference
    physical = json.loads((assets / "shiba-solids.json").read_text())
    boundary = json.dumps(physical["travelBoundary"], separators=(",", ":")).encode()
    assert (
        sha256(boundary).hexdigest()
        == "b2e2f851a8e33ef0474e9d82e08855ded597cba24388a3728b61915b3f60c11f"
    )

    u, n, _ = tower_plan()
    tower = next(i for i, q in enumerate(data["footprints"]) if q["id"] == TOWER)
    for v, f, material, attrs in city_mesh.meshes("Survey buildings"):
        if material["name"] != "Bridge concrete":
            continue
        ids = city_mesh.read(attrs["_FEATURE_ID"]).ravel()
        concrete = v[f[ids[f[:, 0]] == tower]]
        if len(concrete):
            break
    guide = sh.union_all(
        [
            p
            for k in ("tactile", "tactileWarn")
            for v, f, _, _ in paving.meshes("paving-" + k)
            for p in sh.polygons(v[f, :2])
        ]
    )
    max_joint = 0.0
    for _, _, h, foot, head, _ in bearings(data["height"]):
        footprint = sh.Polygon(foot[:, 0, None] * u + foot[:, 1, None] * n)
        observed = sh.Polygon(head[:, 0, None] * u + head[:, 1, None] * n)
        expected = 18.391 + h - 0.56
        assert footprint.intersection(guide).area < 0.0001
        horizontal = np.ptp(concrete[:, :, 2], axis=1) < 0.00005
        on_grade = np.abs(concrete[:, 0, 2] - expected) < 0.00005
        top = sh.union_all(
            sh.polygons(concrete[horizontal & on_grade, :, :2])
        ).intersection(observed)
        assert top.area > observed.area - 0.001
        hits = sh.covers(observed.buffer(0.001), sh.points(shoes[:, :2]))
        gap = abs(shoes[hits, 2].min() - expected)
        assert (
            gap < 0.00005
            and sum(hits & (np.abs(shoes[:, 2] - expected) < 0.00005)) >= 4 * 8
        )
        max_joint = max(gap, max_joint)

    details = json.loads((assets / "shiba-city-detail.json").read_text())
    joints = []
    for fid, seats in details["bridgeBearings"].items():
        for v, f, mat, _ in city_mesh.meshes(fid):
            if mat["name"] != "Bridge concrete":
                continue
            tri = v[f]
            normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            below = normal[:, 2] < -0.7 * np.linalg.norm(normal, axis=1)
            tri, normal = tri[below], normal[below]
            polygons = sh.polygons(tri[:, :, :2])
            lookup = sh.STRtree(polygons)
            break
        for corners, levels in seats:
            for xy, z in zip(corners, levels):
                pt = sh.Point(xy)
                indexes = lookup.query(pt.buffer(0.00005), predicate="intersects")
                assert len(indexes)
                a = tri[indexes, 0]
                N = normal[indexes]
                heights = (
                    a[:, 2]
                    - np.sum((np.asarray(xy) - a[:, :2]) * N[:, :2], axis=1) / N[:, 2]
                )
                joints.append(float(min(abs(heights - z))))
    assert len(joints) >= 48 and max(joints) < 0.001

    rows = json.loads((assets / "shiba-frontages.json").read_text())
    sites = [station_envelope(s) for s in data["stations"]]
    gaps = []
    for i, (x, y, nx, ny, w, brand, owner, lobby) in enumerate(rows):
        bounds = bounds_rect((x, y), (nx, ny), -w / 2, w / 2, 0.08, 1.35)
        gaps.append(min(sh.distance(sites, bounds)))
        if not lobby:
            assert all(
                b[7] or brand != b[5] or np.hypot(x - b[0], y - b[1]) >= 30
                for b in rows[:i]
            )
    assert min(gaps) >= 4.0
    # Compare actual exported apron vertices with the adjacent pedestrian meshes at the same XY.
    apron, faces, _, _ = next(paving.meshes("paving-apron"))
    heights = {(x, y): z for x, y, z in apron}
    seam = {}
    for layer in ("sidewalk", "curb", "tactile", "tactileWarn"):
        for vertices, _, _, _ in paving.meshes("paving-" + layer):
            for x, y, z in vertices:
                if (x, y) in heights:
                    seam[x, y] = max(seam.get((x, y), 0), abs(z - heights[x, y]))
    assert len(seam) > 100 and max(seam.values()) < 0.00025
    # Former pointed drop between the two staggered Daimon shop fronts.
    setback = sh.Point(810.8, -205.3)
    assert sh.covered_by(setback, sh.polygons(apron[faces, :2])).any()
    junction = sh.union_all(
        [sh.Polygon(r[0], r[1:]) for r in data["junctionMasks"]]
    ).buffer(-0.001)
    # Same pixel rays as the original Daimon and Furukawa close-ups, in survey metres.
    old_dashes = sh.points([(837.83, -197.29), (836.86, -199.80), (810.55, -198.32)])
    minimum_dash_distance = float("inf")
    bank_seam = sh.Point(-22.21, -439.09)
    nearest_skirt = float("inf")
    for layer in ("walkSkirt", "asphaltSkirt"):
        for v, f, _, _ in paving.meshes("paving-" + layer):
            nearest_skirt = min(
                nearest_skirt,
                float(sh.distance(sh.linestrings(v[f, :2]), bank_seam).min()),
            )
    assert nearest_skirt > 1
    for layer in ("white", "yellow", "stop"):
        for v, f, _, _ in paving.meshes("paving-" + layer):
            triangles = sh.polygons(v[f, :2])
            assert not np.any(sh.intersects(junction, triangles)), layer
            if layer == "white":
                _, dist = sh.STRtree(triangles).query_nearest(
                    old_dashes, return_distance=True
                )
                minimum_dash_distance = min(minimum_dash_distance, float(dist.min()))
    assert minimum_dash_distance > 1.35
    return dict(
        unchangedUpperTowerTriangles=unchanged,
        playerBoundaryMatchesBaseline=True,
        towerPiers=4,
        maximumTowerSeatGapMm=round(max_joint * 1000, 5),
        motorwayBearingCorners=len(joints),
        maximumMotorwayBearingGapMm=round(max(joints) * 1000, 5),
        minimumShopToStationClearanceM=round(min(gaps), 3),
        repeatedBrandsWithin30m=0,
        sharedShopApronVertices=len(seam),
        maximumShopApronSeamGapMm=round(max(seam.values()) * 1000, 5),
        officeStyleExcludedParkShells=len(data["parkBuildingIds"]),
        sourceShellsOmitted=len(data["excludedSurveyBuildings"]),
        junctionsWithIntrudingLaneLines=0,
        daimonFormerFragmentsToNearestWhiteM=round(minimum_dash_distance, 3),
        furukawaCopingToFormerDuplicateSkirtM=round(nearest_skirt, 3),
    )
