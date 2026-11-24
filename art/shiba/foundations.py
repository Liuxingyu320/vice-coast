"""Extend the actual CityGML GroundSurface rings beneath the sampled terrain."""

import math, pickle
import numpy as np


def foundation_mesh(cache, ids, grid, material):
    v, f = [], []
    features, _, _ = pickle.load(open(cache / "surfaces.pkl", "rb"))
    heights = np.array(grid["cm"]).reshape(grid["h"], grid["w"]) / 100

    def elevation(p):
        xx, yy = (p[:2] - [grid["x"], grid["y"]]) / grid["step"]
        xx = np.clip(xx, 0, grid["w"] - 1.001)
        yy = np.clip(yy, 0, grid["h"] - 1.001)
        i, j = int(xx), int(yy)
        a, b = xx - i, yy - j
        return (heights[j, i] * (1 - a) + heights[j, i + 1] * a) * (1 - b) + (
            heights[j + 1, i] * (1 - a) + heights[j + 1, i + 1] * a
        ) * b

    covered = set()
    for fid, _, _, surfaces in features:
        if fid not in ids:
            continue
        for role, rings in surfaces:
            if role != "GroundSurface":
                continue
            covered.add(fid)
            for _, ring in rings:
                for a, b in zip(ring, np.roll(ring, -1, axis=0)):
                    count = math.ceil(np.linalg.norm((b - a)[:2]) / 2.5)
                    if not count:
                        continue
                    offset = len(v)
                    for j in range(count + 1):
                        p = a + (b - a) * (j / count)
                        v.extend(
                            [
                                (*p[:2], p[2] + 0.025),
                                (*p[:2], min(p[2] - 2.5, elevation(p) - 0.40)),
                            ]
                        )
                        if j:
                            k = offset + 2 * j
                            f.extend([(k - 2, k - 1, k + 1), (k - 2, k + 1, k)])
    assert covered == ids, (len(covered), len(ids))
    return (
        np.float32(v),
        np.int32(f),
        np.zeros((len(v), 2), "f4"),
        np.full(len(f), material, "i2"),
    )
