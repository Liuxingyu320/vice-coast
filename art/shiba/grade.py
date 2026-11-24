"""The survey grid is triangulated SW–NE. All map layers share this exact surface."""

import numpy as np


def sample(grid, xy, raw=False):
    points = np.asarray(xy, dtype=float)
    u = np.clip((points[..., 0] - grid["x"]) / grid["step"], 0, grid["w"] - 1.000001)
    v = np.clip((points[..., 1] - grid["y"]) / grid["step"], 0, grid["h"] - 1.000001)
    i, j = u.astype(int), v.astype(int)
    a, b = u - i, v - j
    values = grid["cm"] if raw else grid.get("gradeCm", grid["cm"])
    h = np.asarray(values).reshape(grid["h"], grid["w"])
    return (
        (1 - np.maximum(a, b)) * h[j, i]
        + np.maximum(a - b, 0) * h[j, i + 1]
        + np.maximum(b - a, 0) * h[j + 1, i]
        + np.minimum(a, b) * h[j + 1, i + 1]
    ) / 100


def breaks(a, b, grid):
    """Parameters at every horizontal, vertical and diagonal DEM edge."""
    p = (np.array(a[:2]) - [grid["x"], grid["y"]]) / grid["step"]
    q = (np.array(b[:2]) - [grid["x"], grid["y"]]) / grid["step"]
    cuts = {0.0, 1.0}
    for u, v in zip([*p, p[0] - p[1]], [*q, q[0] - q[1]]):
        for k in range(int(np.floor(min(u, v))) + 1, int(np.ceil(max(u, v)))):
            t = (k - u) / (v - u)
            if 1e-8 < t < 1 - 1e-8:
                cuts.add(round(t, 10))
    return sorted(cuts)
