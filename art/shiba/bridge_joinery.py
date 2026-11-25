"""Seat each surveyed pier on the motorway soffit, and follow that same surface with ribs and lights."""

import numpy as np
import shapely as sh
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from grade import sample


def connect(arr, roads, grid):
    v, faces, uv, mi = arr
    _, welded = np.unique(np.round(v, 2), axis=0, return_inverse=True)
    edges = welded[faces[:, [0, 1, 1, 2, 2, 0]]].reshape(-1, 2)
    graph = coo_matrix((np.ones(len(edges)), edges.T), shape=(welded.max() + 1,) * 2)
    _, labels = connected_components(graph, directed=False)
    groups = labels[welded]
    parts = groups[faces[:, 0]]
    girder = np.bincount(parts).argmax()
    tri = v[faces].astype(float)
    normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nz = normals[:, 2] / np.maximum(1e-8, np.linalg.norm(normals, axis=1))
    selected = (parts == girder) & (nz < -0.70)
    deck = tri[selected]
    normals = normals[selected]
    polygons = sh.polygons(deck[:, :, :2])
    index = sh.STRtree(polygons)
    outline = sh.union_all(polygons)
    road_index = sh.STRtree(roads)

    def underside(p, reference):
        candidates = index.query(sh.Point(p), predicate="intersects")
        if not len(candidates):
            return None
        a, n = deck[candidates, 0], normals[candidates]
        z = a[:, 2] - np.sum((p - a[:, :2]) * n[:, :2], axis=1) / n[:, 2]
        return float(z[np.argmin(abs(z - reference))])

    added, tex, ff, material = [], [], [], []

    def prism(xy, low, high, mat):
        off = len(added)
        pts = np.vstack(
            (
                np.column_stack((xy, np.broadcast_to(low, 4))),
                np.column_stack((xy, np.broadcast_to(high, 4))),
            )
        )
        added.extend(pts)
        tex.extend(pts[:, :2] / 1.5)
        for polygon in [
            (3, 2, 1, 0),
            (4, 5, 6, 7),
            (0, 1, 5, 4),
            (1, 2, 6, 5),
            (2, 3, 7, 6),
            (3, 0, 4, 7),
        ]:
            a, b, c, d = polygon
            ff.extend([(off + a, off + b, off + c), (off + a, off + c, off + d)])
            material.extend([mat, mat])

    def rectangle(center, axis, normal, half_width, half_length):
        return np.asarray(
            [
                center + axis * u + normal * w
                for u, w in [
                    (-half_width, -half_length),
                    (half_width, -half_length),
                    (half_width, half_length),
                    (-half_width, half_length),
                ]
            ]
        )

    v = v.copy()
    seats = []
    portal_centres = []
    for group in np.unique(parts):
        if group == girder:
            continue
        owner = groups == group
        high = float(v[owner, 2].max())
        low = float(v[owner, 2].min())
        if high - low < 2.4:
            continue
        cap = sh.union_all(
            sh.polygons(
                tri[
                    (parts == group)
                    & (nz > 0.70)
                    & (tri[:, :, 2].min(1) > high - 0.42),
                    :,
                    :2,
                ]
            )
        )
        if cap.is_empty:
            continue
        p = np.asarray(cap.centroid.coords[0])
        line = roads[int(road_index.nearest(sh.Point(p)))]
        s = line.project(sh.Point(p))
        t = (
            np.asarray(line.interpolate(min(line.length, s + 1)).coords[0])
            - line.interpolate(max(0, s - 1)).coords[0]
        )
        t /= np.linalg.norm(t)
        n = np.array([-t[1], t[0]])
        offsets = []
        for distance in np.arange(-18, 18.01, 0.40):
            center = p + n * distance
            xy = rectangle(center, t, n, 0.46, 0.58)
            zh = [underside(q, high) for q in xy]
            if any(h is None or abs(h - high) > 2.7 for h in zh):
                continue
            offsets.append((distance, xy, np.asarray(zh)))
        if not offsets:
            raise ValueError(("pier without box girder", p, high))
        coord = sh.get_coordinates(cap)
        span = (coord - p) @ n
        wanted = np.clip(
            [span.min() + 1.1, span.max() - 1.1], offsets[0][0], offsets[-1][0]
        )
        pads = [min(offsets, key=lambda q: abs(q[0] - w)) for w in sorted(wanted)]
        if pads[1][0] - pads[0][0] < 1.8:
            pads = [min(offsets, key=lambda q: abs(q[0]))]
        portal_centres.append(p + n * np.mean([q[0] for q in pads]))
        bearing_z = min(pad[2].min() for pad in pads) - 0.31
        # Lower only the top tier of the measured pier to make room for its concrete crosshead.
        top = owner & (v[:, 2] > high - 0.68)
        v[top, 2] += bearing_z - 0.46 - high
        a = min(span.min(), pads[0][0] - 0.81)
        b = max(span.max(), pads[-1][0] + 0.81)
        prism(
            rectangle(p + n * ((a + b) / 2), t, n, 1.04, (b - a) / 2),
            bearing_z - 0.46,
            bearing_z,
            1,
        )
        for _, xy, zh in pads:
            prism(xy, bearing_z, bearing_z + 0.065, 2)
            prism(xy, bearing_z + 0.065, zh - 0.055, 3)
            prism(xy, zh - 0.055, zh, 2)
            seats.append([xy.round(5).tolist(), zh.round(6).tolist()])
    lights = []
    lit_points = []
    # Follow the centres of successive crossheads. OSM has additional roads crossing beneath this deck.
    spine = np.asarray(sorted(portal_centres, key=lambda q: q[0]))
    start = spine[0] - 95 * (spine[1] - spine[0]) / np.linalg.norm(spine[1] - spine[0])
    end = spine[-1] + 95 * (spine[-1] - spine[-2]) / np.linalg.norm(
        spine[-1] - spine[-2]
    )
    for line in [sh.LineString(np.vstack((start, spine, end)))]:
        if not line.intersects(outline):
            continue
        for segment in sh.get_parts(line.intersection(outline)):
            if segment.geom_type != "LineString" or segment.length < 2:
                continue
            for sign in [-1, 1]:
                for route in sh.get_parts(segment.offset_curve(sign * 2.05)):
                    if route.geom_type != "LineString":
                        continue
                    xy = np.asarray(sh.segmentize(route, 3.6).coords)
                    for a, b in zip(xy, xy[1:]):
                        axis = b - a
                        length = np.linalg.norm(axis)
                        if length < 0.04:
                            continue
                        axis /= length
                        n = np.array([-axis[1], axis[0]])
                        ring = rectangle((a + b) / 2, axis, n, length / 2, 0.115)
                        z = [underside(q, 11.0) for q in ring]
                        if any(h is None for h in z):
                            continue
                        z = np.asarray(z)
                        if (
                            z.min() - np.max(sample(grid, ring)) < 4.56
                            or np.ptp(z) > 0.65
                        ):
                            continue
                        prism(ring, z - 0.24, z + 0.008, 2)
            for s in np.arange(3.0, segment.length, 15.0):
                pos = np.array(segment.interpolate(s).coords[0])
                z = underside(pos, 11.0)
                if (
                    z is None
                    or z - sample(grid, pos) < 4.53
                    or any(np.linalg.norm(pos - q) < 9.0 for q in lit_points)
                ):
                    continue
                t = (
                    np.array(
                        segment.interpolate(min(s + 0.3, segment.length)).coords[0]
                    )
                    - segment.interpolate(s - 0.3).coords[0]
                )
                t /= np.linalg.norm(t)
                lights.append([*pos.round(5), round(z, 5), *t.round(6)])
                lit_points.append(pos)
    assert seats and len(lights) > 4
    return (
        (
            np.vstack((v, np.float32(added))),
            np.vstack((faces, np.int32(ff) + len(v))),
            np.vstack((uv, np.float32(tex))),
            np.r_[mi, np.int16(material)],
        ),
        seats,
        lights,
    )
