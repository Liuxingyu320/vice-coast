"""Preserve surveyed bridges inside the boundary and a separate distant skyline for street views."""

from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json, pickle, sys
import numpy as np
from lxml import etree as E
from shapely.geometry import Point, Polygon
from prepare_mesh import Mesh
from shiba_site import geo
from fetch_city import directory, unpack, mesh
from extract import primary, polygon_rings, GID
from photo import pixel


def build(cache, fetch_only=False):
    data = json.loads((cache / "layout.json").read_text())
    area = Polygon(data["boundary"])
    selected = {p["id"] for p in data["footprints"]}
    fine = cache / "context/fine_ids.json"
    if fine.exists():
        selected.update(json.loads(fine.read_text()))
    core = {p.name[:8] for p in (cache / "udx/bldg").glob("*.gml")}
    horizon = {
        mesh(*geo(x, y))
        for x in range(-1700, 1401, 150)
        for y in range(-1450, 1551, 150)
        if x * x + y * y < 1650**2
    }
    directory_items = directory(cache)
    targets = [
        i
        for i in directory_items
        if i.filename.endswith(".gml")
        and (
            ("/brid/" in i.filename and Path(i.filename).name[:8] in core)
            or ("/bldg/" in i.filename and Path(i.filename).name[:8] in horizon - core)
        )
    ]
    extension = cache / "context"
    with ThreadPoolExecutor(6) as pool:
        list(
            pool.map(
                lambda i: unpack(cache if "/brid/" in i.filename else extension, i),
                targets,
            )
        )
    if fetch_only:
        return
    am = json.loads((cache / "aerial.json").read_text())

    def projected(q):
        lat, lon = geo(*q[:2])
        u, v = pixel(lon, lat)
        return [
            (u - am["pixelOrigin"][0]) / am["size"][0],
            1 - (v - am["pixelOrigin"][1]) / am["size"][1],
        ]

    bridges = []
    for path in sorted((cache / "udx/brid").glob("*.gml")):
        for _, ob in E.iterparse(
            str(path), events=("end",), tag="{*}Bridge", huge_tree=True
        ):
            part = Mesh()
            for po in primary(ob, 3) or primary(ob, 2) or primary(ob, 1):
                rr = [q for _, q in polygon_rings(po)]
                if not rr:
                    continue
                a = rr[0]
                mid = a.mean(0)
                if not area.covers(Point(mid[:2])):
                    continue
                normal = np.cross(a, np.roll(a, -1, axis=0)).sum(0)
                flat = normal[2] > 0.6 * np.linalg.norm(normal)
                part.add(
                    rr,
                    [np.float64([projected(v) for v in r]) for r in rr],
                    0 if flat else 1,
                )
            if part.f:
                bridges.append(
                    (
                        "Bridge",
                        ob.get(GID),
                        ob.findtext("{*}name") or ob.get(GID),
                        part.pack(),
                    )
                )
            ob.clear()
    sky = Mesh()
    n = 0
    sources = [
        *(cache / "udx/bldg").glob("*.gml"),
        *(extension / "udx/bldg").glob("*.gml"),
    ]
    for path in sorted(sources):
        for _, ob in E.iterparse(
            str(path), events=("end",), tag="{*}Building", huge_tree=True
        ):
            fid = ob.get(GID)
            if fid in selected:
                ob.clear()
                continue
            polys = primary(ob, 1)
            rings = [[q for _, q in polygon_rings(p)] for p in polys]
            rings = [r for r in rings if r]
            if rings:
                allv = np.vstack([r[0] for r in rings])
                mid = allv.mean(0)
                elevation = np.ptp(allv[:, 2])
                dist = area.distance(Point(mid[:2]))
                if (
                    dist > 1
                    and np.hypot(*mid[:2]) < 1650
                    and (dist < 350 or elevation > 18)
                ):
                    before = len(sky.f)
                    for rr in rings:
                        if (
                            np.ptp(rr[0][:, 2]) < 0.02
                            and rr[0][:, 2].max() < allv[:, 2].min() + 0.1
                        ):
                            continue
                        sky.add(
                            rr,
                            [np.zeros((len(q), 2)) for q in rr],
                            2 if np.ptp(rr[0][:, 2]) < 1 else 1,
                        )
                    if len(sky.f) > before:
                        n += 1
            ob.clear()
    with (cache / "context.pkl").open("wb") as f:
        pickle.dump(
            (
                bridges,
                [
                    (
                        "Backdrop",
                        "surveyed-skyline",
                        "街区周辺 · PLATEAU LOD1",
                        sky.pack(),
                    )
                ],
            ),
            f,
            protocol=4,
        )
    print(
        "Measured bridges",
        len(bridges),
        "skyline buildings",
        n,
        "faces",
        len(sky.f),
        flush=True,
    )


if __name__ == "__main__":
    build(Path(sys.argv[1]), "--fetch-only" in sys.argv[2:])
