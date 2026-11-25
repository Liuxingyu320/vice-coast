"""Continue surveyed pier faces to the lower of the two terrain surfaces."""

import numpy as np
from grade import sample


def embed(arr, grid):
    v, f, uv, mi = arr
    grid = dict(grid)
    grid["cm"] = np.asarray(grid["cm"])
    grid["gradeCm"] = np.asarray(grid["gradeCm"])
    tri = v[f]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    altitude = tri[:, :, 2] - sample(grid, tri[:, :, :2])
    # Only downward caps at the foot of a vertical pier are eligible.
    cap = (
        (n[:, 2] < -0.94 * np.linalg.norm(n, axis=1))
        & (altitude.max(1) < 2.40)
        & (np.ptp(tri[:, :, 2], axis=1) < 0.22)
    )
    _, weld = np.unique(np.round(v * 100).astype("i8"), axis=0, return_inverse=True)
    side = (abs(n[:, 2]) < 0.24 * np.linalg.norm(n, axis=1)) & (
        np.ptp(tri[:, :, 2], axis=1) > 2.1
    )
    roots = set(weld[f[side]].ravel())
    chosen = np.flatnonzero(cap & np.all(np.isin(weld[f], list(roots)), axis=1))
    if not len(chosen):
        return arr, []
    verts = []
    faces = []
    tex = []
    materials = []
    edges = {}
    records = []
    for face in f[chosen]:
        for a, b in zip(face, np.roll(face, -1)):
            key = tuple(sorted((int(weld[a]), int(weld[b]))))
            if key in edges:
                del edges[key]
            else:
                edges[key] = (a, b)
    for a, b in edges.values():
        x = v[[a, b]]
        ground = np.minimum(sample(grid, x[:, :2]), sample(grid, x[:, :2], raw=True))
        low = np.minimum(x[:, 2], ground - 0.48)
        records.append([*x[0, :2].astype(float), float(low[0])])
        if np.max(x[:, 2] - low) < 0.0001:
            continue
        i = len(verts)
        length = np.linalg.norm(x[1, :2] - x[0, :2])
        verts.extend([x[0], x[1], [*x[1, :2], low[1]], [*x[0, :2], low[0]]])
        tex.extend(
            [
                [0, x[0, 2] / 2.4],
                [length / 2.4, x[1, 2] / 2.4],
                [length / 2.4, low[1] / 2.4],
                [0, low[0] / 2.4],
            ]
        )
        faces.extend([[i, i + 1, i + 2], [i, i + 2, i + 3]])
        materials.extend([1, 1])
    if not verts:
        return arr, records
    return (
        np.vstack((v, np.float32(verts))),
        np.vstack((f, np.int32(faces) + len(v))),
        np.vstack((uv, np.float32(tex))),
        np.r_[mi, np.int16(materials)],
    ), records
