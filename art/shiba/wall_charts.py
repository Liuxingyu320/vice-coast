"""Fit complete storeys and bays inside the measured wall ring, including interior holes.

The same fitted UVs, unclamped rectangle coordinates and horizontal footing datum are used
in the editable model and the game. A fragment outside the rectangle is solid masonry.
"""

import json
import pickle
import sys
from pathlib import Path
import numpy as np
import shapely as sh
from grade import sample
from station_sites import TOWER, BASIN, DAIMON_A6, SHIBA_A3
from passages import open_drive

STOREY = 3.3
MARGIN = 0.565


def ranges(faces):
    # Earcut emits a consecutive set of faces for each source polygon, without sharing
    # indices between polygons. Adjacent triangles of a single face share an index.
    ends = np.maximum.accumulate(faces.max(axis=1))
    starts = np.minimum.accumulate(faces.min(axis=1)[::-1])[::-1]
    return np.split(np.arange(len(faces)), np.flatnonzero(ends[:-1] < starts[1:]) + 1)


def charts(
    arr, *, datum=None, park=False, sacred=False, roles=None, bracing=None, omit=None
):
    v, f, source_uv, _ = arr
    tex = source_uv.copy()
    fit = np.full((len(v), 2), -2, "f4")
    base = np.zeros(len(v), "f4")
    face_xyz = v[f]
    normals = np.cross(face_xyz[:, 1] - face_xyz[:, 0], face_xyz[:, 2] - face_xyz[:, 0])
    vertical = abs(normals[:, 2]) < 0.18 * np.linalg.norm(normals, axis=1)
    if roles is not None:
        vertical &= roles[f[:, 0]] != 3
    assigned = np.zeros(len(f), dtype=bool)
    for chunk in ranges(f):
        if not np.all(vertical[chunk]):
            continue
        faces = f[chunk]
        ids = np.unique(faces)
        points = v[ids].astype(float)
        normal = normals[chunk].sum(axis=0)
        if np.linalg.norm(normal[:2]) < 0.001:
            continue
        tangent = np.array([-normal[1], normal[0]]) / np.linalg.norm(normal[:2])
        assigned[chunk] = True
        s = (points[:, :2] - points[0, :2]) @ tangent
        z = points[:, 2]
        xy = np.column_stack((s, z))
        floor = (datum if datum is not None else z.min()) + (
            0.12 if park or sacred else 0.65
        )
        base[ids] = floor
        tex[ids] = np.column_stack((s / 16.0, (z - floor - 0.60) / 26.4))
        # Stop at the springing of the gable. Its inclined triangular portion remains plaster.
        projected = xy[np.searchsorted(ids, faces)]
        shape = sh.union_all(sh.polygons(projected))
        if not shape.is_valid:
            shape = shape.buffer(0)
        eaves = [z.max()]
        gable_edges = []
        for edge in sh.get_parts(shape):
            if edge.geom_type != "Polygon":
                continue
            ring = np.asarray(edge.exterior.coords)
            for p, q in zip(ring, ring[1:]):
                ds, dz = abs(q - p)
                mid = (p + q) / 2
                if (
                    ds > 0.20
                    and dz > 0.20
                    and not shape.covers(sh.Point(mid + [0, 0.04]))
                    and shape.covers(sh.Point(mid - [0, 0.04]))
                ):
                    eaves.append(min(p[1], q[1]))
                    if ds > 1.2 and 0.17 < dz / ds < 1.35:
                        low, high = sorted([p, q], key=lambda v: v[1])
                        gable_edges.append((low, high))
        if (
            bracing is not None
            and gable_edges
            and (omit is None or not omit(points.mean(0)))
        ):
            outward = normal[:2] / np.linalg.norm(normal[:2])

            def anchor(x, h):
                return [*(points[0, :2] + tangent * x + outward * 0.039), h]

            # Both pitches must actually meet at the ridge. A sloping party-wall join
            # or a single survey return beside a lower roof is not an exposed gable.
            for i, (left, ridge) in enumerate(gable_edges):
                for right, other in gable_edges[i + 1 :]:
                    if (
                        np.linalg.norm(ridge - other) > 0.12
                        or (left[0] - ridge[0]) * (right[0] - ridge[0]) >= 0
                    ):
                        continue
                    base_height = max(left[1], right[1]) + 0.20
                    top_height = min(ridge[1], other[1]) - 0.25
                    if top_height - base_height < 0.45:
                        continue
                    ends = []
                    for foot, peak in [(left, ridge), (right, other)]:
                        slope = (peak[0] - foot[0]) / (peak[1] - foot[1])
                        x = foot[0] + (base_height - foot[1]) * slope
                        end = peak[0] - 0.25 * slope
                        bracing.append(
                            [
                                anchor(x, base_height),
                                anchor(end, top_height),
                                outward.tolist(),
                                0.15,
                            ]
                        )
                        ends.append(x)
                    lo, hi = sorted(ends)
                    bracing.append(
                        [
                            anchor(lo, base_height),
                            anchor(hi, base_height),
                            outward.tolist(),
                            0.14,
                        ]
                    )
                    for x in np.linspace(lo, hi, max(3, round((hi - lo) / 1.8) + 1))[
                        1:-1
                    ]:
                        foot, peak = (
                            (left, ridge)
                            if (x - ridge[0]) * (left[0] - ridge[0]) >= 0
                            else (right, other)
                        )
                        tip = (
                            foot[1]
                            + (peak[1] - foot[1]) * (x - foot[0]) / (peak[0] - foot[0])
                            - 0.12
                        )
                        if tip > base_height + 0.12:
                            bracing.append(
                                [
                                    anchor(x, base_height),
                                    anchor(x, tip),
                                    outward.tolist(),
                                    0.125,
                                ]
                            )
        top = min(eaves) - MARGIN
        sill = max(floor + 0.60, z.min() + MARGIN)
        pitch = 2.45 if park or sacred else STOREY
        rows = int(np.floor((top - sill) / pitch))
        # A shallow single-storey eave can still contain a complete clerestory bay.
        if (park or sacred) and top - sill >= 0.78:
            rows = max(rows, 1)
            pitch = min(pitch, top - sill)
        if rows <= 0:
            continue
        bottom, ceiling = sill, sill + rows * pitch
        lo, hi = s.min() + MARGIN, s.max() - MARGIN
        if hi - lo < 1.05:
            continue
        # Check the entire filled rectangle against the eroded source polygon, not triangle bounding boxes.
        safe = shape.buffer(-0.551, join_style="mitre")
        if safe.is_empty:
            continue
        slot = None
        for course in range(rows, 0, -1):
            ceiling = bottom + course * pitch
            if safe.covers(sh.box(lo, bottom, hi, ceiling)):
                slot = lo, hi
                rows = course
                break
        if slot is None:
            ceiling = bottom + rows * pitch
        for fraction in () if slot else (0.90, 0.78, 0.56, 0.32):
            for center in (0.5, fraction / 2, 1 - fraction / 2):
                span = (hi - lo) * fraction
                a = lo + (hi - lo) * center - span / 2
                b = a + span
                if span >= 1.05 and safe.covers(sh.box(a, bottom, b, ceiling)):
                    slot = a, b
                    break
            if slot:
                break
        if not slot:
            continue
        a, b = slot
        columns = max(1, round((b - a) / (2.8 if park else 1.92)))
        u = (s - a) / (b - a)
        h = (z - bottom) / (ceiling - bottom)
        fit[ids] = np.column_stack((u, h))
        # Origin on a whole chart bay, offset the printed finishes between neighbouring walls.
        phase = int(abs(points[0, 0] * 13 + points[0, 1] * 7)) % 8
        if sacred:
            tex[ids] = np.column_stack((u * max(1, round((b - a) / 7.2)), h * rows))
        elif park:
            tex[ids] = np.column_stack((u * columns, h * rows))
        else:
            tex[ids] = np.column_stack(((u * columns + phase) / 8, (z - bottom) / 26.4))
    return tex, fit, base, assigned


def door_face(arr, roles, grid, roads):
    # Seat a single entry on a measured ground-storey wall, at the approach elevation.
    v, f, _, _ = arr
    best = None
    for chunk in ranges(f):
        faces = f[chunk]
        xyz = v[faces].astype(float)
        if not np.all(roles[faces[:, 0]] == 2):
            continue
        cross = np.cross(xyz[:, 1] - xyz[:, 0], xyz[:, 2] - xyz[:, 0]).sum(0)
        if (
            abs(cross[2]) > 0.05 * np.linalg.norm(cross)
            or np.linalg.norm(cross[:2]) < 0.01
        ):
            continue
        n = cross[:2] / np.linalg.norm(cross[:2])
        t = np.array([-n[1], n[0]])
        vertices = v[np.unique(faces)]
        origin = vertices[0, :2]
        s = (xyz[:, :, :2] - origin) @ t
        shape = sh.union_all(sh.polygons(np.stack((s, xyz[:, :, 2]), axis=2)))
        if not shape.is_valid:
            shape = shape.buffer(0)
        span = np.ptp(s)
        if span < 1.40:
            continue
        for fraction in (0.50, 0.28, 0.72):
            at = s.min() + span * fraction
            p = origin + t * at
            z = max(
                float(sample(grid, p + n * 0.23)) + 0.105,
                float(v[roles == 3, 2].min()) + 0.015,
            )
            if not shape.covers(sh.box(at - 0.52, z, at + 0.52, z + 2.04)):
                continue
            j = int(roads.nearest(sh.Point(p)))
            road = roads.geometries[j]
            q = np.asarray(road.interpolate(road.project(sh.Point(p))).coords[0])
            toward = (q - p) @ n / max(0.1, np.linalg.norm(q - p))
            score = 7 * toward - 0.10 * np.linalg.norm(q - p) - abs(fraction - 0.5)
            if best is None or score > best[0]:
                edge = p + n * 0.042
                a, b = edge - t * 0.49, edge + t * 0.49
                best = score, [[*a, z], [*b, z], [*b, z + 2.02], [*a, z + 2.02]]
    return best[1] if best else None


def build(cache):
    root = Path(__file__).resolve().parents[2]
    d = json.loads((root / "assets/shiba-layout.json").read_text())
    blocks, _ = pickle.load(open(cache / "meshes.pkl", "rb"))
    flags = pickle.load(open(cache / "roof-flags.pkl", "rb"))
    passages = json.loads((cache / "passages.json").read_text())
    footprints = {q["id"]: q for q in d["footprints"]}
    grid = dict(d["height"])
    grid["gradeCm"] = np.asarray(grid["gradeCm"])
    roads = sh.STRtree(
        [sh.LineString(p) for (kind, p) in d["roads"] if kind in ("road", "path")]
    )
    shops = {
        row[6] for row in json.loads((root / "assets/shiba-frontages.json").read_text())
    }
    doors, bracing = [], []
    from foundations import park_level, seat_park

    result = {}
    for group, fid, _, arr in blocks:
        if (
            group != "Building"
            or fid not in footprints
            or fid in (TOWER, BASIN, DAIMON_A6, SHIBA_A3)
        ):
            continue
        flags_here = flags[fid]
        if fid in passages:
            arr, flags_here = open_drive(arr, flags_here, passages[fid], 1, grid)
        coordinates = np.asarray(footprints[fid]["rings"][0])
        park = fid in d["parkBuildingIds"] and fid not in d["templePrecinctIds"]
        datum = float(
            np.min(sample(grid, coordinates))
            if park
            else np.quantile(sample(grid, coordinates), 0.80)
        )
        if park and fid not in passages:
            levels = park_level(grid, footprints[fid]["rings"])
            arr = seat_park(arr, flags_here, levels)
            datum = levels[0]
            door = door_face(arr, flags_here, grid, roads) if fid not in shops else None
            if door:
                doors.append(door)
        sacred = fid in d["templePrecinctIds"]
        omit = None
        if fid == d["verifiedBuildings"]["增上寺大殿"]:
            v = arr[0]
            ridge = v[v[:, 2] > v[:, 2].max() - 0.11, :2]
            a, b = ridge[ridge[:, 1].argmin()], ridge[ridge[:, 1].argmax()]
            u = (b - a) / np.linalg.norm(b - a)
            n = np.array([u[1], -u[0]])
            center = (a + b) / 2

            def omit(pt):
                xy = pt[:2] - center
                return abs(xy @ u + 0.24) < 26 and abs(xy @ n + 0.15) < 27.24

        result[fid] = charts(
            arr,
            datum=datum,
            park=park,
            sacred=sacred,
            roles=flags_here,
            bracing=bracing if sacred else None,
            omit=omit,
        )
    (cache / "park-doors.json").write_text(json.dumps(doors))
    (cache / "gable-timber.json").write_text(json.dumps(bracing))
    skyline, detailed = pickle.load(open(cache / "skyline-walls.pkl", "rb"))
    for name, arr in [
        ("surveyed-skyline", skyline),
        ("skyline-photofacades", detailed),
    ]:
        result[name] = charts(arr)
    with (cache / "wall-charts.pkl").open("wb") as dest:
        pickle.dump(result, dest, protocol=4)


if __name__ == "__main__":
    build(Path(sys.argv[1]))
