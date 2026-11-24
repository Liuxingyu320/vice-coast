"""Orient surveyed shells across UV seams and close digitisation gaps at the roofline."""

from collections import defaultdict
import numpy as np
from shapely import Polygon, union_all
from shapely.strtree import STRtree
from shapely.geometry import Point


def close_roof(mesh, roles, surfaces, roof_material):
    def planar(rings):
        return Polygon(rings[0][1][:, :2], [q[:, :2] for _, q in rings[1:]]).buffer(0)

    ground = union_all([planar(r) for t, r in surfaces if t == "GroundSurface"])
    projected = union_all(
        [planar(r) for t, r in surfaces if t in ("RoofSurface", "WallSurface")]
    )
    missing = ground.difference(projected)
    if missing.area < 1e-7:
        return 0
    roof_edges = []
    from shapely.geometry import LineString

    for role, rings in surfaces:
        if role != "RoofSurface":
            continue
        for _, ring in rings:
            roof_edges.extend(
                (LineString([a[:2], b[:2]]), a, b)
                for a, b in zip(ring, np.roll(ring, -1, axis=0))
                if np.linalg.norm(a[:2] - b[:2]) > 0.0001
            )
    if not roof_edges:
        return 0
    lookup = STRtree([v[0] for v in roof_edges])

    def xyz(x, y):
        p = Point(x, y)
        e, a, b = roof_edges[int(lookup.nearest(p))]
        return [x, y, a[2] + (b[2] - a[2]) * e.project(p, normalized=True)]

    for poly in getattr(missing, "geoms", [missing]):
        if poly.geom_type != "Polygon" or poly.area < 1e-9:
            continue
        rings = [
            np.asarray([xyz(x, y) for x, y in r.coords[:-1]])
            for r in [poly.exterior, *poly.interiors]
        ]
        start = len(mesh.v)
        mesh.add(rings, [r[:, :2] / 3.3 for r in rings], roof_material)
        roles.extend([1] * (len(mesh.v) - start))
    return missing.area


def orient(mesh, roles):
    points = np.asarray(mesh.v)
    faces = np.asarray(mesh.f)
    _, welded = np.unique(
        np.rint(points * 1000).astype("i8"), axis=0, return_inverse=True
    )
    sides = defaultdict(list)
    for idx, (a, b, c) in enumerate(welded[faces]):
        for u, v in ((a, b), (b, c), (c, a)):
            if u != v:
                sides[(min(u, v), max(u, v))].append((idx, 1 if u < v else -1))
    adjacent = defaultdict(list)
    for incident in sides.values():
        if len(incident) == 2:
            (a, i), (b, j) = incident
            adjacent[a].append((b, -i * j))
            adjacent[b].append((a, -i * j))
    signs = np.zeros(len(faces), "i1")
    normals = np.cross(
        points[faces[:, 1]] - points[faces[:, 0]],
        points[faces[:, 2]] - points[faces[:, 0]],
    )
    kinds = np.asarray(roles)[faces[:, 0]]
    for root in range(len(faces)):
        if signs[root]:
            continue
        signs[root] = 1
        component = [root]
        for f in component:
            for g, r in adjacent[f]:
                if signs[g]:
                    continue
                signs[g] = signs[f] * r
                component.append(g)
        group = np.array(component)
        # Source ground and upper roof surfaces give the exterior sign on open shells too.
        priority = np.where(kinds[group] == 1, 1, np.where(kinds[group] == 3, -1, 0))
        vote = np.sum(normals[group, 2] * signs[group] * priority)
        if abs(vote) < 1e-8:
            q = points[faces[group]]
            center = q.reshape(-1, 3).mean(0)
            vote = np.sum(
                np.sum((q[:, 0] - center) * normals[group], axis=1) * signs[group]
            )
        if vote < -1e-8:
            signs[group] *= -1
    flipped = signs < 0
    faces[flipped] = faces[flipped][:, ::-1]
    mesh.f = faces.tolist()
    return int(flipped.sum())
