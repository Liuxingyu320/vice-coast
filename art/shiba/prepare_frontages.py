"""Choose ground-floor frontage modules on street-facing measured building walls."""

import json, pickle, sys, math
from pathlib import Path
from shapely import Polygon, LineString, Point, union_all, STRtree
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
AXIS = LineString(
    [
        (891, -204),
        (836, -197),
        (645, -173),
        (411, -145),
        (401, -235),
        (379, -332),
        (236, -353),
        (122, -340),
        (27, -320),
        (55, -229),
        (87, -136),
        (65, -77),
        (0, 0),
    ]
)


def main(cache):
    d = json.loads((ROOT / "assets/shiba-layout.json").read_text())
    roads = [
        (LineString(p), i[0])
        for (k, p), i in zip(d["roads"], d["roadInfo"])
        if k == "road" and i[0] >= 5.5
    ]
    surfaces, _, _ = pickle.load(open(cache / "surfaces.pkl", "rb"))
    ids = {f["id"] for f in d["footprints"]} - set(d["verifiedBuildings"].values())
    polygons = {}
    for fid, _, _, ss in surfaces:
        if fid not in ids:
            continue
        gg = [
            Polygon(r[0][1][:, :2], [a[:, :2] for _, a in r[1:]]).buffer(0)
            for role, r in ss
            if role == "GroundSurface"
        ]
        polygons[fid] = union_all(gg)
    obs = list(polygons.values())
    index = STRtree(obs)
    out = []
    for idx, (fid, mp) in enumerate(polygons.items()):
        for poly in getattr(mp, "geoms", [mp]):
            if poly.is_empty or poly.geom_type != "Polygon":
                continue
            if poly.distance(AXIS) > 54 or poly.area < 18:
                continue
            ring = list(poly.exterior.simplify(0.16).coords)
            for a, b in zip(ring, ring[1:]):
                dx, dy = b[0] - a[0], b[1] - a[1]
                length = math.hypot(dx, dy)
                if length < 3.2:
                    continue
                tx, ty = dx / length, dy / length
                nx, ny = ty, -tx
                mid = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                if poly.contains(Point(mid.x + nx * 0.08, mid.y + ny * 0.08)):
                    nx, ny = -nx, -ny
                if mid.x < 425 and not (-50 < mid.x < 92 and -372 < mid.y < -186):
                    continue
                candidates = []
                for road, width in roads:
                    distance = road.distance(mid)
                    if distance > width / 2 + 17:
                        continue
                    q = road.interpolate(road.project(mid))
                    if (q.x - mid.x) * nx + (q.y - mid.y) * ny < 0.52 * distance:
                        continue
                    sight = LineString(
                        [(mid.x + nx * 0.2, mid.y + ny * 0.2), q.coords[0]]
                    )
                    if any(
                        i != idx for i in index.query(sight, predicate="intersects")
                    ):
                        continue
                    candidates.append(distance - width / 2)
                if not candidates or min(candidates) < 0.68:
                    continue
                count = max(1, round(length / 6.8))
                for j in range(count):
                    t = (j + 0.5) / count
                    x = a[0] + dx * t
                    y = a[1] + dy * t
                    if AXIS.distance(Point(x, y)) > 54:
                        continue
                    out.append(
                        [
                            round(x, 3),
                            round(y, 3),
                            round(nx, 5),
                            round(ny, 5),
                            round(length / count - 0.18, 2),
                            idx % 7,
                        ]
                    )
    (ROOT / "assets/shiba-frontages.json").write_text(
        json.dumps(out, separators=(",", ":"))
    )
    print(len(out), "wall-mounted bays")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
