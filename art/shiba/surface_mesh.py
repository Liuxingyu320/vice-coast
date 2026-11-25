"""Turn the Boolean partition into the same indexed mesh for Blender and glTF."""

import gzip, json
import numpy as np
from grade import sample
from materials import SURFACE, METRES


def blocks_for_site(path, data, aerial, names):
    pack = json.loads(gzip.decompress(path.read_bytes()))
    blocks = []
    grid = dict(data["height"])
    grid["gradeCm"] = np.asarray(grid["gradeCm"])

    def emit(k, xy, z, faces, uv):
        mat = "Photo" if k == "ground" else SURFACE[k]
        if mat not in names:
            names.append(mat)
        fid = "shiba-ground" if k == "ground" else "paving-" + k
        blocks.append(
            (
                "Terrain",
                fid,
                fid,
                (
                    np.column_stack([xy, z]).astype("f4"),
                    np.asarray(faces, "i4").reshape(-1, 3),
                    np.asarray(uv, "f4"),
                    np.full(len(faces), names.index(mat), "i2"),
                ),
            )
        )

    for key, (coords, indices) in pack["surfaces"].items():
        xy = np.asarray(coords).reshape(-1, 2) / pack["scale"]
        level = 0.14 if key in ("sidewalk", "curb", "tactile", "tactileWarn") else 0.0
        z = sample(grid, xy) + level
        uv = xy / METRES.get(key, 1.0)
        if key == "water":
            # Each disconnected pond or river reach uses one horizontal water table.
            # An earcut partition can share a vertex between reaches only along a continuous surface.
            levels = np.zeros(len(xy), dtype=float)
            best = np.full(len(xy), np.inf)
            for lake in data["waters"]:
                rim = np.asarray(lake["rings"][0])
                lo = rim.min(0) - 0.002
                hi = rim.max(0) + 0.002
                near = np.flatnonzero((xy >= lo).all(1) & (xy <= hi).all(1))
                if not len(near):
                    continue
                q = xy[near]
                u, w = q.T
                inside = np.zeros(len(q), bool)
                edge = np.full(len(q), np.inf)
                for ring in lake["rings"]:
                    coords = np.asarray(ring)
                    for a, b in zip(coords, np.roll(coords, -1, axis=0)):
                        delta = b - a
                        ll = delta @ delta
                        if ll < 1e-12:
                            continue
                        off = q - a
                        fraction = np.clip(np.sum(off * delta, axis=1) / ll, 0, 1)
                        edge = np.minimum(
                            edge, np.sum((off - fraction[:, None] * delta) ** 2, axis=1)
                        )
                        if abs(delta[1]) > 1e-12:
                            inside ^= ((a[1] > w) != (b[1] > w)) & (
                                u < (w - a[1]) * delta[0] / delta[1] + a[0]
                            )
                distance = np.where(inside, 0, edge)
                use = distance < best[near]
                best[near[use]] = distance[use]
                levels[near[use]] = lake["z"]
            assert np.all(best < 0.00001), "water vertex outside source shoreline"
            z = levels
        if key in ("inlet", "manhole"):
            rows = np.asarray([p[1:] for p in data["drains"] if p[0] == key])
            # Each inserted component is disjoint and has an explicit local tangent.
            uv = []
            for vertices in np.array_split(xy, max(1, len(xy) // 512)):
                delta = vertices[:, None, :] - rows[None, :, :2]
                at = np.argmin(np.sum(delta**2, axis=2), axis=1)
                diff = vertices - rows[at, :2]
                n = rows[at, 2:4]
                t = np.column_stack([-n[:, 1], n[:, 0]])
                uv.extend(
                    np.column_stack(
                        (
                            0.5 + np.sum(diff * t, axis=1) / rows[at, 5],
                            0.5 + np.sum(diff * n, axis=1) / rows[at, 4],
                        )
                    )
                )
            uv = np.asarray(uv)
        if key == "ground":
            lon = data["lon"] + xy[:, 0] / data["east"]
            lat = np.radians(data["lat"] + xy[:, 1] / data["north"])
            scale = 256 * 2 ** aerial["zoom"]
            pixel = np.column_stack(
                [
                    (lon + 180) / 360 * scale,
                    (1 - np.arcsinh(np.tan(lat)) / np.pi) * scale / 2,
                ]
            )
            uv = (pixel - aerial["pixelOrigin"]) / aerial["size"]
            uv[:, 1] = 1 - uv[:, 1]
        emit(key, xy, z, np.asarray(indices).reshape(-1, 3), uv)
    for key, segments in pack["walls"].items():
        ab = np.asarray(segments).reshape(-1, 2, 2) / pack["scale"]
        top = 0.14 if key != "asphaltSkirt" else 0
        depth = 0.14 if key == "curbFace" else 0.4
        xy = ab[:, [0, 1, 1, 0], :].reshape(-1, 2)
        z = sample(grid, xy) + np.tile([top, top, top - depth, top - depth], len(ab))
        uv = np.column_stack(
            [
                np.repeat(np.linalg.norm(ab[:, 1] - ab[:, 0], axis=1), 4)
                * np.tile([0, 1, 1, 0], len(ab)),
                z,
            ]
        )
        indices = (np.arange(len(ab))[:, None] * 4 + [0, 1, 2, 0, 2, 3]).reshape(-1, 3)
        emit(key, xy, z, indices, uv)
    return blocks
