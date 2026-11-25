"""Trim the distant ortho at the district seam and classify and ground each skyline shell."""

from pathlib import Path
import json, pickle, sys
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from shapely import Polygon, STRtree, Point
from prepare_mesh import Mesh
from grade import sample
import shapely as sh


def build(cache):
    layout = json.loads(
        (Path(__file__).resolve().parents[2] / "assets/shiba-layout.json").read_text()
    )
    region = Polygon(layout["boundary"])
    grid = layout["height"]
    grid["gradeCm"] = np.asarray(grid["gradeCm"])
    transition = region.buffer(126)
    sh.prepare(transition)

    def stitch_grade(xy, z):
        d = sh.distance(region, sh.points(xy))
        t = np.clip((d - 78) / 48, 0, 1)
        return sample(grid, xy) * (1 - t * t * (3 - 2 * t)) + z * t * t * (3 - 2 * t)

    # Subdivide the near ring at every formation breakline, including diagonal creases.
    x0, y0, x1, y1 = transition.bounds
    tiles = []
    step = grid["step"]
    for x in np.arange(np.floor(x0 / step) * step, x1, step):
        for y in np.arange(np.floor(y0 / step) * step, y1, step):
            tiles.extend(
                [
                    [(x, y), (x + step, y), (x + step, y + step)],
                    [(x, y), (x + step, y + step), (x, y + step)],
                ]
            )
    tiles = sh.polygons(tiles)
    tiles = tiles[
        sh.intersects(transition, tiles) & ~sh.contains_properly(region, tiles)
    ]
    tile_index = STRtree(tiles)
    bridges, far = pickle.load(open(cache / "context.pkl", "rb"))
    count, detail, terrain = pickle.load(open(cache / "context/detailed.pkl", "rb"))
    gv, gf, gu, gm = terrain
    tri = gv[gf].astype(float)
    polys = [Polygon(t[:, :2]) for t in tri]
    search = STRtree(polys)

    def coefficients(p, q):
        vec = q[1:, :2] - q[0, :2]
        uv = np.linalg.solve(vec.T, (p - q[0, :2]).T).T
        return np.column_stack([1 - uv.sum(1), uv])

    def ground_at(p):
        i = search.nearest(Point(p))
        xy = np.asarray([p])
        z = coefficients(xy, tri[i]) @ tri[i, :, 2]
        return (
            float(stitch_grade(xy, z)[0])
            if transition.covers(Point(p))
            else float(z[0])
        )

    clipped = Mesh()
    for i, poly in enumerate(polys):
        rest = poly.difference(region) if poly.intersects(region) else poly
        if region.covers(poly):
            continue
        if transition.intersects(poly):
            band = rest.intersection(transition)
            ids = tile_index.query(band, predicate="intersects")
            fragments = list(sh.get_parts(sh.intersection(tiles[ids], band))) + list(
                sh.get_parts(rest.difference(transition))
            )
        else:
            fragments = sh.get_parts(rest)
        for piece in fragments:
            if piece.geom_type != "Polygon" or piece.area < 1e-4:
                continue
            rings = []
            uv = []
            for ring in [piece.exterior, *piece.interiors]:
                xy = np.asarray(ring.coords)[:-1]
                w = coefficients(xy, tri[i])
                z = w @ tri[i, :, 2]
                if transition.intersects(piece):
                    z = stitch_grade(xy, z)
                rings.append(np.column_stack([xy, z]))
                uv.append(w @ gu[gf[i]])
            clipped.add(rings, uv, 2)

    def classify(arr):
        v, f, uv, mat = arr
        _, ids = np.unique(np.round(v, 2), axis=0, return_inverse=True)
        e = ids[f[:, [0, 1, 1, 2, 2, 0]]].reshape(-1, 2)
        graph = coo_matrix(
            (np.ones(len(e), "i1"), (e[:, 0], e[:, 1])), shape=(ids.max() + 1,) * 2
        )
        n, group = connected_components(graph, directed=False)
        group = group[ids]
        low = np.full(n, np.inf)
        high = np.full(n, -np.inf)
        np.minimum.at(low, group, v[:, 2])
        np.maximum.at(high, group, v[:, 2])
        h = high - low
        x = np.bincount(group, weights=v[:, 0]) / np.bincount(group)
        style = np.where(h > 45, 0, np.where(h > 21, 1, np.where(x > 430, 3, 2)))
        labels = style[group[f[:, 0]]]
        # The outside skirts also reach 3.5 m under the local backdrop surface.
        sv = []
        sf = []
        candidates = np.where((np.abs(v[f, 2] - low[group[f]]) < 0.025).sum(1) == 2)[0]
        seen = set()
        for i in candidates:
            q = f[i]
            q = q[np.abs(v[q, 2] - low[group[q]]) < 0.025]
            a, b = v[q]
            key = tuple(sorted([int(ids[q[0]]), int(ids[q[1]])]))
            if key in seen or np.linalg.norm(a[:2] - b[:2]) < 0.025:
                continue
            seen.add(key)
            j = len(sv)
            bottom = [min(p[2], ground_at(p[:2])) - 3.5 for p in (a, b)]
            sv.extend([a, b, (*b[:2], bottom[1]), (*a[:2], bottom[0])])
            sf.extend([(j, j + 1, j + 2), (j, j + 2, j + 3)])
        return labels, (np.float32(sv), np.int32(sf))

    from context_streets import split_backdrop

    background, streets = split_backdrop(
        cache, clipped.pack(), region, layout, ground_at
    )
    pickle.dump(streets, open(cache / "edge-streets.pkl", "wb"), protocol=4)
    from skyline_walls import split_setbacks

    skyline = [split_setbacks(far[0][3]), split_setbacks(detail)]
    with (cache / "skyline-walls.pkl").open("wb") as output:
        pickle.dump(skyline, output, protocol=4)
    results = [classify(shell) for shell in skyline]
    pickle.dump(
        (background, results), open(cache / "horizon-grade.pkl", "wb"), protocol=4
    )


if __name__ == "__main__":
    build(Path(sys.argv[1]))
