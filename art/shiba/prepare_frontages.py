"""Choose ground-floor frontage modules on street-facing measured building walls."""

import json, pickle, sys, math
from pathlib import Path
import xml.etree.ElementTree as ET
from station_sites import DAIMON_A6, SHIBA_A3, BASIN, TOWER, station_envelope
from shiba_site import en
from shapely import Polygon, LineString, Point, union_all, STRtree

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


def plan(cache, d, tactile):
    roads = [
        (LineString(p), i[0])
        for (k, p), i in zip(d["roads"], d["roadInfo"])
        if k == "road" and i[0] >= 5.5
    ]
    carriageways = union_all(
        [
            LineString(p).buffer(i[0] / 2, quad_segs=12)
            for (k, p), i in zip(d["roads"], d["roadInfo"])
            if k == "road"
        ]
    )
    surfaces, _, _ = pickle.load(open(cache / "surfaces.pkl", "rb"))
    ids = {f["id"] for f in d["footprints"]} - set(d["verifiedBuildings"].values())
    exempt = (
        set(d.get("templePrecinctIds", []))
        | set(d["parkSiteIds"])
        | {DAIMON_A6, SHIBA_A3, BASIN, TOWER}
    )
    entrances = []
    for node in ET.parse(cache / "streets.osm").iterfind("node"):
        tags = {t.get("k"): t.get("v") for t in node.iterfind("tag")}
        if tags.get("entrance") or tags.get("railway") == "subway_entrance":
            entrances.append(
                Point(en(float(node.get("lat")), float(node.get("lon")))).buffer(1.15)
            )
    for station in d["stations"]:
        entrances.append(station_envelope(station, 4.0))
    public_access = union_all(entrances)
    tactile = tactile.buffer(0.018)
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
        if fid in exempt:
            continue
        for poly in getattr(mp, "geoms", [mp]):
            if poly.is_empty or poly.geom_type != "Polygon":
                continue
            if (
                poly.distance(AXIS) > (129 if poly.centroid.x > 570 else 54)
                or poly.area < 18
            ):
                continue
            ring = list(poly.exterior.coords)
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
                    if AXIS.distance(Point(x, y)) > (
                        129 if poly.centroid.x > 570 else 54
                    ):
                        continue
                    # The largest awning, projecting sign and shop jamb must fit the actual bay and clear its neighbours.
                    width = length / count - 0.18

                    def envelope(w):
                        return Polygon(
                            [
                                (x + tx * u + nx * v, y + ty * u + ny * v)
                                for u, v in [
                                    (-w / 2, 0.08),
                                    (w / 2, 0.08),
                                    (w / 2, 1.35),
                                    (-w / 2, 1.35),
                                ]
                            ]
                        )

                    while width > 2.30:
                        panel = envelope(width)
                        if (
                            not carriageways.intersects(panel)
                            and not public_access.intersects(panel)
                            and not tactile.intersects(panel)
                            and not any(
                                k != idx
                                for k in index.query(panel, predicate="intersects")
                            )
                        ):
                            break
                        width -= 0.32
                    if width <= 2.30:
                        continue
                    out.append(
                        [
                            round(x, 3),
                            round(y, 3),
                            round(nx, 5),
                            round(ny, 5),
                            round(width, 2),
                            idx % 7,
                            fid,
                            int(j == count // 2 and poly.area > 195 and idx % 3 != 1),
                        ]
                    )
    # Assign a brand once, in survey space. Separate frontages across the street also share a neighbourhood.
    from collections import defaultdict
    from hashlib import blake2s

    bins = defaultdict(list)
    for row in out:
        x, y, _, _, _, _, owner, lobby = row
        if lobby:
            continue
        ix, iy = math.floor(x / 30), math.floor(y / 30)
        used = {
            r[5]
            for i in range(ix - 1, ix + 2)
            for j in range(iy - 1, iy + 2)
            for r in bins[i, j]
            if math.hypot(x - r[0], y - r[1]) <= 30.02
        }
        seed = int.from_bytes(
            blake2s(f"{owner}/{x}/{y}".encode(), digest_size=4).digest(), "little"
        )
        brand = next(
            ((seed + i) % 16 for i in range(16) if (seed + i) % 16 not in used), None
        )
        if brand is None:
            row[7] = 1
        else:
            row[5] = brand
            bins[ix, iy].append(row)
    (ROOT / "assets/shiba-frontages.json").write_text(
        json.dumps(out, separators=(",", ":"))
    )
    print(len(out), "wall-mounted bays")
    return out


if __name__ == "__main__":
    # For standalone regeneration, read the actual emitted guide polygons from the same noded mesh.
    import gzip
    import numpy as np
    import shapely as sh

    packed = json.loads(
        gzip.decompress((ROOT / "assets/shiba-pavement.gz").read_bytes())
    )
    guides = []
    for key in ("tactile", "tactileWarn"):
        v, f = packed["surfaces"][key]
        tris = (np.asarray(v).reshape(-1, 2) / packed["scale"])[
            np.asarray(f).reshape(-1, 3)
        ]
        guides.extend(sh.polygons(tris))
    plan(
        Path(sys.argv[1]),
        json.loads((ROOT / "assets/shiba-layout.json").read_text()),
        sh.union_all(guides),
    )
