"""Survey-oriented, level ironwork inserts clipped into the asphalt mesh."""

import numpy as np
import shapely as sh
from shapely import Point, Polygon
from station_sites import bounds_rect


def plan(roads, road, data, markings_geom, frame):
    drains = []
    used = []
    markings = sh.union_all(
        list(markings_geom.values())
        + [Polygon(r).buffer(0.85) for r in data["crosswalkBands"]]
    )
    sh.prepare(markings)
    # Put covers and inlets on suitable through stretches rather than scattering flat decals across junctions.
    for line, info in roads:
        width = info[0]
        if width < 5 or line.length < 13:
            continue
        for j, s in enumerate(np.arange(8.0, line.length - 4.0, 23.7)):
            q, n, left = frame(line, s)
            for typ, shift, w, l in [
                ("inlet", width * 0.5 - 0.37, 0.47, 0.30),
                ("manhole", min(1.32, width * 0.21), 0.65, 0.65),
            ]:
                if typ == "manhole" and j % 2:
                    continue
                pt = q + left * shift
                foot = bounds_rect(pt, n, -l / 2, l / 2, -w / 2, w / 2)
                if (
                    not road.covers(foot)
                    or markings.intersects(foot)
                    or any(foot.distance(v) < 2.2 for v in used)
                ):
                    continue
                if typ == "inlet" and road.boundary.distance(Point(pt)) > 0.6:
                    continue
                drains.append([typ, *np.round(pt, 4), *np.round(n, 7), w, l])
                used.append(foot)
    return drains


def shapes(rows, kind):
    return sh.union_all(
        [
            Point(x, y).buffer(w / 2, quad_segs=10)
            if kind == "manhole"
            else bounds_rect((x, y), (nx, ny), -d / 2, d / 2, -w / 2, w / 2)
            for key, x, y, nx, ny, w, d in rows
            if key == kind
        ]
    )
