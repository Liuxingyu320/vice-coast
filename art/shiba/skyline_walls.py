"""Keep the measured setbacks of tall walls while fitting complete bays on each vertical wing."""

import numpy as np
import shapely as sh
from prepare_mesh import Mesh
from wall_charts import ranges


def split_setbacks(arr):
    v, f, uv, mi = arr
    blocks = []
    for chunk in ranges(f):
        faces = f[chunk]
        ids, local = np.unique(faces, return_inverse=True)
        p = v[ids].astype(float)
        local = local.reshape(-1, 3)
        original = (v[ids], local, uv[ids], mi[chunk])
        if (
            len(ids) < 5
            or np.ptp(p[:, 2]) < 8
            or len(np.unique(np.round(p[:, 2], 1))) < 3
        ):
            blocks.append(original)
            continue
        tri = p[local]
        normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]).sum(axis=0)
        length = np.linalg.norm(normal[:2])
        if length < 0.01 or abs(normal[2]) > 0.03 * length or np.ptp(mi[chunk]) != 0:
            blocks.append(original)
            continue
        tangent = np.array([-normal[1], normal[0]]) / length
        x = (p[:, :2] - p[0, :2]) @ tangent
        plane = np.column_stack((x, p[:, 2]))
        shape = sh.union_all(sh.polygons(plane[local]))
        if shape.geom_type != "Polygon" or not shape.is_valid:
            blocks.append(original)
            continue
        ring = np.array(shape.exterior.coords)
        roofs = []
        for a, b in zip(ring, ring[1:]):
            if abs(a[1] - b[1]) > 0.06 or abs(a[0] - b[0]) < 1.8:
                continue
            midpoint = (a + b) / 2
            if shape.covers(sh.Point(midpoint - [0, 0.10])) and not shape.covers(
                sh.Point(midpoint + [0, 0.10])
            ):
                roofs.append([a, b])
        if len(roofs) < 2 or np.ptp(np.array(roofs)[:, :, 1]) < 2.5:
            blocks.append(original)
            continue
        xmin, low, xmax, high = shape.bounds
        cuts = sorted(
            {
                round(pt[0], 4)
                for edge in roofs
                for pt in edge
                if xmin + 1 < pt[0] < xmax - 1
            }
        )
        if not cuts:
            blocks.append(original)
            continue
        # A subdivision adds only vertices on the surveyed wall. Reuse exact source XYZ wherever possible.
        basis = np.column_stack((plane, np.ones(len(plane))))
        affine = np.linalg.lstsq(basis, np.column_stack((p, uv[ids])), rcond=None)[0]
        mesh = Mesh()
        stops = [xmin - 0.001, *cuts, xmax + 0.001]
        for a, b in zip(stops, stops[1:]):
            for piece in sh.get_parts(
                shape.intersection(sh.box(a, low - 0.01, b, high + 0.01))
            ):
                if piece.geom_type != "Polygon" or piece.area < 0.0001:
                    continue
                outlines, textures = [], []
                for ring in [piece.exterior, *piece.interiors]:
                    q = np.asarray(ring.coords)[:-1]
                    sample = np.column_stack((q, np.ones(len(q)))) @ affine
                    distance = np.linalg.norm(q[:, None] - plane, axis=2)
                    nearest = distance.argmin(1)
                    same = distance.min(1) < 0.0001
                    sample[same, :3] = p[nearest[same]]
                    sample[same, 3:] = uv[ids[nearest[same]]]
                    outlines.append(sample[:, :3])
                    textures.append(sample[:, 3:])
                outline = outlines[0] - outlines[0][0]
                if (
                    np.cross(outline, np.roll(outline, -1, axis=0)).sum(axis=0) @ normal
                    < 0
                ):
                    outlines = [r[::-1] for r in outlines]
                    textures = [r[::-1] for r in textures]
                mesh.add(outlines, textures, int(mi[chunk[0]]))
        blocks.append(mesh.pack() if mesh.f else original)
    off = np.cumsum([0] + [len(q[0]) for q in blocks[:-1]])
    return (
        np.concatenate([q[0] for q in blocks]),
        np.concatenate([q[1] + o for q, o in zip(blocks, off)]).astype("i4"),
        np.concatenate([q[2] for q in blocks]),
        np.concatenate([q[3] for q in blocks]),
    )
