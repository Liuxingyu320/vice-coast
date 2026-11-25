"""Bake ground-level physical occupancy from the same exported meshes used by Chrome."""

from pathlib import Path
import json, sys
import numpy as np
import shapely as sh
from shapely import Point, LineString, Polygon, MultiPoint
from gltf_reader import GLB
from grade import sample

ROOT = Path(__file__).resolve().parents[2]
LOW, HIGH = 0.20, 1.61


def build(cache):
    assets = ROOT / "assets"
    d = json.loads((assets / "shiba-layout.json").read_text())
    core = Polygon(d["boundary"])
    edge = json.loads((cache / "edge-travel.json").read_text())
    region = Polygon(edge["boundary"])
    grid = dict(d["height"])
    grid["gradeCm"] = np.array(grid["gradeCm"])
    district = GLB(assets / "shiba-park.glb")
    supports = json.loads((assets / "shiba-gate-supports.json").read_text())
    step = json.loads((assets / "shiba-hall-steps.json").read_text())
    wells = [Polygon(s["well"]) for s in d["stations"]]
    stairvoid = sh.union_all(wells)
    pieces = []

    def projected(xy):
        if len(xy) < 2:
            return
        g = MultiPoint(xy).convex_hull
        if g.geom_type != "Polygon" or g.area < 1e-6:
            g = g.buffer(0.018, quad_segs=2)
        if not g.is_empty:
            pieces.append(g)

    def slab(pts):
        # Linear interpolation in the local DEM frame, retaining only metal/masonry in reach.
        for h, sign in [(LOW, 1), (HIGH, -1)]:
            out = []
            for a, b in zip(pts, np.roll(pts, -1, axis=0)):
                da = (a[2] - h) * sign
                db = (b[2] - h) * sign
                if da >= 0:
                    out.append(a)
                if (da >= 0) != (db >= 0):
                    out.append(a + (b - a) * da / (da - db))
            pts = np.asarray(out)
            if len(pts) < 2:
                break
        return pts

    hallidx = next(
        i
        for i, f in enumerate(d["footprints"])
        if f["id"] == d["verifiedBuildings"]["增上寺大殿"]
    )
    # Neighbouring survey objects crossing the playable outline still have physical walls and bridge feet.
    horizon = GLB(assets / "shiba-horizon.glb")
    core_objects = [
        "Survey buildings",
        "building-foundations",
        "daimon-gate",
        "sangedatsumon-gate",
        "tower-lattice",
    ]
    names = [
        (district, n)
        for n in district.nodes
        if n in core_objects or n.startswith("brid_")
    ]
    banks = GLB(assets / "shiba-pavement.glb")
    names.extend((banks, name) for name in ("paving-bank", "paving-bank-rail"))
    names.extend(
        (horizon, n)
        for n, node in horizon.nodes.items()
        if "mesh" in node
        and n != "skyline-ground"
        and not n.startswith("skyline-street-")
    )
    x0, y0, x1, y1 = region.bounds
    for model, name in names:
        for v, f, mat, attrs in model.meshes(name):
            if mat["name"].startswith(("Stair nosing", "Stair riser", "Hall handrail")):
                continue
            pos = v.copy()
            pos[:, 2] -= sample(grid, v[:, :2])
            rel = pos[f]
            eligible = (rel[:, :, 2].min(1) < HIGH) & (rel[:, :, 2].max(1) > LOW)
            if model is horizon:
                low = v[f, :2].min(axis=1)
                high = v[f, :2].max(axis=1)
                eligible &= (
                    (low[:, 0] <= x1)
                    & (high[:, 0] >= x0)
                    & (low[:, 1] <= y1)
                    & (high[:, 1] >= y0)
                )
                idx = np.flatnonzero(eligible)
                eligible[idx] = sh.intersects(
                    region,
                    sh.box(
                        low[idx, 0] - 0.02,
                        low[idx, 1] - 0.02,
                        high[idx, 0] + 0.02,
                        high[idx, 1] + 0.02,
                    ),
                )
            if model is district and "_FEATURE_ID" in attrs:
                owners = (
                    district.read(attrs["_FEATURE_ID"]).ravel()[f[:, 0]].astype(int)
                )
                # Only the staircase itself is a walkable raised surface.
                hall = owners == hallidx
                center = v[f[hall], :2].mean(1) - step["center"]
                mask = (np.abs(center @ step["along"]) < step["halfWidth"] + 0.15) & (
                    center @ step["front"]
                    > step["outer"] - step["count"] * step["tread"] - 0.3
                )
                eligible[np.flatnonzero(hall)[mask]] = False
            for tri in rel[eligible]:
                pts = slab(tri)
                if len(pts) >= 2:
                    projected(pts[:, :2])
    for group in supports.values():
        for ring in group:
            pieces.append(Polygon(ring))
    # A canopy, roof-mounted plant, traffic-signal arm or even an entire elevated bridge contributes
    # no contact unless its *visible* geometry reaches this height above the local graded surface.
    ignored = (
        "Signal bulbs",
        "Downward streetlight",
        "Park low evergreen sprays",
        "Avenue • ironwork",
        "printed signs",
        "recessed luminaires",
        "interior glazing",
    )
    for row in json.loads((cache / "street-reference.json").read_text()):
        if any(t in row["name"] for t in ignored):
            continue
        v = np.array(row["pos"]).reshape(-1, 3)
        M = np.array(row["matrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
        pos = v @ M[:, :3, :3].transpose(0, 2, 1) + M[:, None, :3, 3]
        xy = pos[:, :, [0, 2]].copy()
        xy[:, :, 1] *= -1
        # Each instance is a single fitting. Small feet, poles, seats and bike wheels retain their own shape.
        z = pos[:, :, 1] - sample(grid, xy)
        keep = (z.min(1) < HIGH) & (z.max(1) > LOW)
        fs = np.asarray(row["indices"]).reshape(-1, 3)
        for i in np.flatnonzero(keep):
            if z[i].min() >= LOW and z[i].max() <= HIGH:
                projected(xy[i])
                continue
            verts = np.column_stack((xy[i], z[i]))
            ed = np.unique(
                np.sort(
                    np.concatenate((fs[:, [0, 1]], fs[:, [1, 2]], fs[:, [2, 0]])),
                    axis=1,
                ),
                axis=0,
            )
            a, b = verts[ed[:, 0]], verts[ed[:, 1]]
            pts = [verts[(z[i] >= LOW) & (z[i] <= HIGH), :2]]
            for h in [LOW, HIGH]:
                crossing = (a[:, 2] < h) != (b[:, 2] < h)
                A = a[crossing]
                B = b[crossing]
                pts.append(
                    A[:, :2]
                    + (B[:, :2] - A[:, :2])
                    * ((h - A[:, 2]) / (B[:, 2] - A[:, 2]))[:, None]
                )
            projected(np.vstack(pts))
    for x, y, z, h, r in d["trees"]:
        pieces.append(Point(x, y).buffer(max(0.09, min(0.42, r * 0.09)), quad_segs=6))
    pieces.extend(Polygon(s["rings"][0], s["rings"][1:]) for s in d["waters"])
    pieces.extend(Polygon(r[0], r[1:]) for r in edge["waters"])
    solid = sh.union_all(sh.set_precision(pieces, 0.001)).intersection(region)
    polys = [
        p.simplify(0.004, preserve_topology=True)
        for p in sh.get_parts(solid)
        if p.geom_type == "Polygon" and p.area > 0.0002
    ]
    roads = sh.union_all(
        [
            LineString(p).buffer(info[0] / 2, quad_segs=12)
            for (k, p), info in zip(d["roads"], d["roadInfo"])
            if k == "road"
        ]
    )
    buildings = sh.union_all(
        [Polygon(f["rings"][0], f["rings"][1:]).buffer(0) for f in d["footprints"]]
    )
    buildings = buildings.union(
        sh.union_all([Polygon(q) for q in d["bearingFootprints"]])
    )
    walks = (
        roads.buffer(3.2, quad_segs=12)
        .difference(sh.union_all([roads, buildings, stairvoid]))
        .intersection(core)
    )

    def encode(poly):
        return [
            np.round(np.asarray(r.coords)[:-1], 3).tolist()
            for r in [poly.exterior, *poly.interiors]
        ]

    # Store the already tessellated 1:12 apron so wheels and feet follow exactly the rendered triangles.
    import gzip

    paving = json.loads(gzip.decompress((assets / "shiba-pavement.gz").read_bytes()))
    xy, triangles = paving["surfaces"]["apron"]
    apron = {
        "scale": paving["scale"],
        "xy": xy,
        "tenthsMm": [int(round(q * 10000)) for q in paving["apronLift"]],
        "triangles": triangles,
    }
    payload = dict(
        aprons=apron,
        travelBoundary=edge["boundary"],
        solids=[encode(p) for p in polys],
        wells=[encode(p) for p in wells],
        walks=[
            encode(p.simplify(0.009))
            for p in sh.get_parts(walks)
            if p.geom_type == "Polygon"
        ]
        + edge["walks"],
    )
    (assets / "shiba-solids.json").write_text(
        json.dumps(payload, separators=(",", ":"))
    )
    print(
        "Physical geometry",
        len(polys),
        "ground-level parts,",
        len(pieces),
        "actual intersected components",
    )


if __name__ == "__main__":
    build(Path(sys.argv[1]))
