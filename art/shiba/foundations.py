"""Construct the visible plinth from the measured ground rings, down to 3.5 m below both grades."""

import math
import pickle
import numpy as np
from grade import sample, breaks


def foundation_mesh(cache, data, supports, gate_bases, material):
    features, _, _ = pickle.load(open(cache / "surfaces.pkl", "rb"))
    grid = dict(data["height"])
    for field in ["cm", "gradeCm"]:
        grid[field] = np.asarray(grid[field])
    lookup = {f["id"]: i for i, f in enumerate(data["footprints"])}
    vertices, faces, owners = [], [], []
    found = set()

    def ring(fid, rim):
        path = []
        for a, b in zip(rim, np.roll(rim, -1, axis=0)):
            path.extend(a + (b - a) * t for t in breaks(a, b, grid)[:-1])
        p = np.asarray(path)
        if len(p) < 3:
            return
        # GroundSurface rings point down, giving the outside winding in the exported vertical quads.
        low = (
            np.minimum.reduce(
                [p[:, 2], sample(grid, p[:, :2]), sample(grid, p[:, :2], raw=True)]
            )
            - 3.5
        )
        pts = np.repeat(p, 2, axis=0)
        pts[1::2, 2] = low
        idx = np.arange(0, len(pts), 2) + len(vertices)
        for a, b in zip(idx, np.roll(idx, -1)):
            faces.extend([(a, b + 1, a + 1), (a, b, b + 1)])
        vertices.extend(pts)
        owners.extend([lookup[fid]] * len(pts))
        found.add(fid)

    import json

    passages = json.loads((cache / "passages.json").read_text())
    for fid, _, _, surfaces in features:
        from station_sites import TOWER, BASIN
        from foottown import tower_plan

        stations = {s["shell"]: s for s in data["stations"] if s["shell"]}
        if fid == TOWER:
            u, n, xy = tower_plan()
            world = xy[:, 0, None] * u + xy[:, 1, None] * n
            ring(fid, np.column_stack([world[::-1], np.full(len(xy), 18.391)]))
        elif fid in stations or fid == BASIN:
            # The original solid shell wrapped the mouth in a retaining wall.
            # Only the actual support shoes reach grade after opening the pavilion.
            if fid in stations:
                st = stations[fid]
                o = np.array(st["mouth"])
                n = np.array(st["down"])
                t = np.array([-n[1], n[0]])
                half = min(2.38, st["width"] - 0.42) / 2 + 0.058
                anchors = [
                    o + sign * t * half + n * v
                    for sign in [-1, 1]
                    for v in [0.19, st["length"] - 0.65]
                ]
                size = 0.055
            else:
                rim = next(r[0][1] for role, r in surfaces if role == "GroundSurface")
                o = np.mean(rim[:, :2], axis=0)
                n = np.array([0.993, -0.119])
                t = np.array([-n[1], n[0]])
                anchors = [
                    o + t * u + n * v for u in [-1.76, 1.76] for v in [-1.48, 1.48]
                ]
                size = 0.19
            for anchor in anchors:
                xy = anchor + np.array(
                    [[-size, -size], [-size, size], [size, size], [size, -size]]
                )
                ring(fid, np.column_stack([xy, sample(grid, xy)]))
        elif fid in passages:
            for coordinates in passages[fid]["foundations"]:
                xy = np.array(coordinates)
                if (
                    np.sum(
                        xy[:, 0] * np.roll(xy[:, 1], -1)
                        - np.roll(xy[:, 0], -1) * xy[:, 1]
                    )
                    > 0
                ):
                    xy = xy[::-1]
                ring(fid, np.column_stack((xy, sample(grid, xy))))
        elif fid in supports:
            for points in supports[fid]:
                xy = np.asarray(points)
                if np.cross(xy, np.roll(xy, -1, axis=0)).sum() > 0:
                    xy = xy[::-1]
                ring(fid, np.column_stack([xy, np.full(len(xy), gate_bases[fid])]))
        else:
            for role, rings in surfaces:
                if role == "GroundSurface":
                    for _, rim in rings:
                        ring(fid, rim)
        if fid == "bldg_7aff4a51-be8b-405b-abe4-ac489697cbc8":
            a = math.radians(-33.72)
            rotation = np.array(
                [[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]]
            )
            for x in [-40.5, 40.5]:
                for y in [-40.5, 40.5]:
                    xy = (
                        np.array(
                            [[-3.85, -3.85], [-3.85, 3.85], [3.85, 3.85], [3.85, -3.85]]
                        )
                        + [x, y]
                    ) @ rotation
                    ring(fid, np.column_stack([xy, np.full(4, 18.391)]))
                    # Bearing plate spans the four steel chords at the top of each concrete pier.
                    o = len(vertices)
                    vertices.extend([(*p, 18.391) for p in xy])
                    owners.extend([lookup[fid]] * 4)
                    faces.extend([(o, o + 2, o + 1), (o, o + 3, o + 2)])
    assert found == set(lookup), len(found)
    return (
        (
            np.float32(vertices),
            np.int32(faces),
            np.zeros((len(vertices), 2), "f4"),
            np.full(len(faces), material, "i2"),
        ),
        np.float32(owners),
    )
