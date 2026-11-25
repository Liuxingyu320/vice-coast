"""Inspect identity-transform GLB survey meshes in local east/north/altitude metres."""

import json, struct
import numpy as np


class GLB:
    def __init__(self, path):
        blob = path.read_bytes()
        nj = struct.unpack_from("<I", blob, 12)[0]
        self.g = json.loads(blob[20 : 20 + nj])
        self.bin = memoryview(blob)[28 + nj :]
        self.nodes = {n["name"]: n for n in self.g["nodes"]}
        assert all(
            "matrix" not in n
            and not any(k in n for k in ("translation", "rotation", "scale"))
            for n in self.nodes.values()
        ), "Non-identity survey transform"

    def read(self, i):
        a = self.g["accessors"][i]
        view = self.g["bufferViews"][a["bufferView"]]
        dtype = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[a["componentType"]]
        col = {"VEC2": 2, "VEC3": 3, "VEC4": 4, "SCALAR": 1}[a["type"]]
        size = np.dtype(dtype).itemsize
        off = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        return np.ndarray(
            (a["count"], col),
            dtype,
            self.bin,
            off,
            (view.get("byteStride", size * col), size),
        )

    def meshes(self, name):
        for prim in self.g["meshes"][self.nodes[name]["mesh"]]["primitives"]:
            pos = self.read(prim["attributes"]["POSITION"]).astype("f8")
            xyz = pos[:, [0, 2, 1]]
            xyz[:, 1] *= -1
            normal = self.read(prim["attributes"]["NORMAL"])
            assert np.isfinite(xyz).all() and np.isfinite(normal).all(), name
            yield (
                xyz,
                self.read(prim["indices"]).reshape(-1, 3),
                self.g["materials"][prim["material"]],
                prim["attributes"],
            )

    def texture(self, mat):
        assert "baseColorTexture" in mat["pbrMetallicRoughness"], mat["name"]
        tex = self.g["textures"][
            mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]
        ]
        return self.g["images"][tex["source"]]
