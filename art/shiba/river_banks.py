"""Model open water below road crossings and revetments only along actual GSI shorelines."""

from pathlib import Path
import json, pickle, sys
import numpy as np
import shapely as sh
from shapely import Point, Polygon, LineString
from waterways import water_plan
from grade import sample
from prepare_mesh import Mesh


def build(cache):
    d = json.loads(
        (Path(__file__).resolve().parents[2] / "assets/shiba-layout.json").read_text()
    )
    domain = Polygon(d["boundary"])
    wet = water_plan(cache, d, domain.buffer(10))
    exposed = [(Polygon(w["rings"][0], w["rings"][1:]), w["z"]) for w in d["waters"]]
    roads = sh.union_all(
        [
            LineString(p).buffer(i[0] / 2, quad_segs=12)
            for (k, p), i in zip(d["roads"], d["roadInfo"])
            if k == "road"
        ]
    )
    built = sh.union_all(
        [Polygon(b["rings"][0], b["rings"][1:]).buffer(0.3) for b in d["footprints"]]
    )
    clear = roads.buffer(3.52).union(built)
    bank = Mesh()
    channel = Mesh()
    rails = Mesh()

    def bar(a, b, r):
        a, b = np.array(a), np.array(b)
        d = b - a
        length = np.linalg.norm(d)
        if length < 0.001:
            return
        axis = d / length
        n = np.cross(axis, [0, 0, 1] if abs(axis[2]) < 0.9 else [1, 0, 0])
        n /= np.linalg.norm(n)
        t = np.cross(axis, n)
        rim = np.array(
            [
                r * (n * np.cos(k * np.pi / 3) + t * np.sin(k * np.pi / 3))
                for k in range(6)
            ]
        )
        start = len(rails.v)
        rails.v.extend(np.vstack((a + rim, b + rim)))
        rails.uv.extend([(k / 6, s) for s in (0, length) for k in range(6)])
        for k in range(6):
            j = (k + 1) % 6
            rails.f.extend(
                [
                    (start + k, start + j, start + 6 + j),
                    (start + k, start + 6 + j, start + 6 + k),
                ]
            )
            rails.mi.extend([0, 0])

    def quad(a, b, c, e, u0, u1, vertical=True):
        v = np.array([a, b, c, e])
        uv = (
            np.array([[u0, a[2]], [u1, b[2]], [u1, c[2]], [u0, e[2]]]) * 0.5
            if vertical
            else v[:, :2] / 2
        )
        i = len(bank.v)
        bank.v.extend(v)
        bank.uv.extend(uv)
        bank.f.extend([[i, i + 1, i + 2], [i, i + 2, i + 3]])
        bank.mi.extend([0, 0])

    for body in sh.get_parts(wet):
        matches = [
            (body.intersection(q).area, h) for q, h in exposed if body.intersects(q)
        ]
        if not matches:
            continue
        stage = max(matches)[1]
        river = body.area > 2200 and body.centroid.y < -400
        visible = sh.union_all(
            [q for q, h in exposed if body.intersection(q).area > 0.01]
        )
        shore = sh.orient_polygons(visible if river else body).boundary.intersection(
            domain.buffer(-0.005)
        )
        if not river:
            shore = shore.difference(clear)
        for line in sh.get_parts(shore):
            if line.geom_type != "LineString" or line.length < 0.25:
                continue
            # Keep every surveyed bend; intermediate supports sample the landward side every 1.5 m.
            xy = np.asarray(sh.segmentize(line, 1.5).coords)
            direction = np.gradient(xy, axis=0)
            norm = np.maximum(0.00001, np.linalg.norm(direction, axis=1))
            n = np.column_stack((direction[:, 1], -direction[:, 0])) / norm[:, None]
            mid = len(xy) // 2
            if (visible if river else body).contains(Point(xy[mid] + n[mid] * 0.29)):
                n = -n
            outside = xy + n * (0.42 if river else 0.32)
            land = sample(d["height"], outside)
            level = np.maximum(land, sample(d["height"], xy))
            lip = np.maximum(stage + 0.17, level + 0.26) if river else level
            if river:
                # A continuous coping grade bridges raster pits. A 4% longitudinal grade envelope
                # meets the high bank without folding the handrail into every sampled DEM triangle.
                distance = np.r_[
                    0.0, np.cumsum(np.linalg.norm(np.diff(xy, axis=0), axis=1))
                ]
                lip = np.maximum.accumulate(lip + 0.04 * distance) - 0.04 * distance
                lip = (
                    np.maximum.accumulate((lip - 0.04 * distance)[::-1])[::-1]
                    + 0.04 * distance
                )
                railxy = xy + n * 0.21
                for i, (p, z) in enumerate(zip(railxy, lip)):
                    bar([*p, z - 0.025], [*p, z + 0.065], 0.095)
                    bar([*p, z + 0.045], [*p, z + 1.08], 0.045)
                    if i:
                        for h, r in ((0.34, 0.023), (0.68, 0.025), (1.04, 0.040)):
                            bar([*railxy[i - 1], lip[i - 1] + h], [*p, z + h], r)
            along = np.r_[0, np.cumsum(np.linalg.norm(np.diff(xy, axis=0), axis=1))]
            for i in range(len(xy) - 1):
                a, b = xy[i : i + 2]
                A, B = outside[i : i + 2]
                h, H = lip[i : i + 2]
                u, U = along[i : i + 2]
                if max(h, H) <= stage + 0.012:
                    continue
                # Faces on the water side point toward the water; the dry-side return meets the actual DEM.
                normal = np.r_[n[i], 0]
                bottom = stage - 0.19
                verts = [[*a, h], [*b, H], [*b, bottom], [*a, bottom]]
                if (
                    np.dot(
                        np.cross(
                            np.subtract(verts[1], verts[0]),
                            np.subtract(verts[2], verts[0]),
                        ),
                        normal,
                    )
                    > 0
                ):
                    verts = verts[::-1]
                quad(*verts, u, U)
                if river:
                    top = [[*a, h], [*A, h], [*B, H], [*b, H]]
                    if (
                        np.cross(
                            np.subtract(top[1], top[0]), np.subtract(top[2], top[0])
                        )[2]
                        < 0
                    ):
                        top = top[::-1]
                    quad(*top, u, U, False)
                    verts = [
                        [*A, land[i] - 0.18],
                        [*B, land[i + 1] - 0.18],
                        [*B, H],
                        [*A, h],
                    ]
                    if (
                        np.dot(
                            np.cross(
                                np.subtract(verts[1], verts[0]),
                                np.subtract(verts[2], verts[0]),
                            ),
                            normal,
                        )
                        < 0
                    ):
                        verts = verts[::-1]
                    quad(*verts, u, U)
        # The deck surface stays at the road grade above the water. Leave its cross-section open.
        if river:
            below = (
                body.intersection(domain)
                .intersection(roads.buffer(3.2))
                .difference(sh.union_all([q for q, _ in exposed]))
            )
            for part in sh.get_parts(below):
                if part.geom_type != "Polygon" or part.area < 0.02:
                    continue
                part = sh.orient_polygons(part)
                rings = [
                    np.asarray(r.coords)[:-1] for r in [part.exterior, *part.interiors]
                ]
                channel.add(
                    [np.column_stack((p, np.full(len(p), stage))) for p in rings],
                    [p / 2.4 for p in rings],
                    0,
                )
    pickle.dump(
        {"bank": bank.pack(), "channel": channel.pack(), "bank-rail": rails.pack()},
        open(cache / "river-joinery.pkl", "wb"),
        protocol=4,
    )
    print("Survey bank / underside water triangles", len(bank.f), len(channel.f))


if __name__ == "__main__":
    build(Path(sys.argv[1]))
