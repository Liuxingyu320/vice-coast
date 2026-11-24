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
        level = 0.14 if key in ("sidewalk", "curb", "tactile") else 0.0
        z = sample(grid, xy) + level
        uv = xy / METRES.get(key, 1.0)
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
