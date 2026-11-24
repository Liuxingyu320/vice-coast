"""Choose directions on the mapped, directed carriageway graph at the next junction."""

from collections import defaultdict
import heapq
import numpy as np
from scipy.spatial import cKDTree


def guide_signs(layout):
    nodes = {}
    forward = defaultdict(dict)
    backward = defaultdict(dict)
    neighbours = defaultdict(set)

    def vertex(point):
        key = tuple(np.round(point, 2))
        if key not in nodes:
            nodes[key] = len(nodes)
        return nodes[key]

    def edge(a, b, length):
        forward[a][b] = length
        backward[b][a] = length
        neighbours[a].add(b)
        neighbours[b].add(a)

    for (kind, pts), (_, _, way, _) in zip(layout["roads"], layout["roadInfo"]):
        if kind != "road":
            continue
        for p, q in zip(pts, pts[1:]):
            a, b = vertex(p), vertex(q)
            if a == b:
                continue
            length = np.linalg.norm(np.subtract(q, p))
            if way != "-1":
                edge(a, b, length)
            if way != "yes":
                edge(b, a, length)
    coords = np.array(list(nodes))
    lookup = cKDTree(coords)

    def costs(point):
        end = int(lookup.query(point)[1])
        best = {end: 0.0}
        queue = [(0.0, end)]
        while queue:
            length, u = heapq.heappop(queue)
            if length > best[u]:
                continue
            for v, w in backward[u].items():
                if length + w < best.get(v, np.inf):
                    best[v] = length + w
                    heapq.heappush(queue, (length + w, v))
        return best

    destinations = [
        ("東京タワー", "Tokyo Tower", (45, -43)),
        ("増上寺", "Zojoji", (433, -152)),
        ("大門駅", "Daimon Sta.", (831, -191)),
        ("芝公園駅", "Shibakoen Sta.", (407, -476)),
    ]
    routes = [(ja, en, costs(p)) for ja, en, p in destinations]

    def panel(head, travel):
        # Pick the actual incoming leg, then follow bends to the first decision.
        candidates = []
        for u in np.atleast_1d(lookup.query(head, k=12)[1]):
            for v in forward[u]:
                segment = coords[v] - coords[u]
                length = np.linalg.norm(segment)
                t = np.clip((head - coords[u]) @ segment / length**2, 0, 1)
                dot = travel @ segment / length
                if dot > 0.74:
                    candidates.append(
                        (
                            np.linalg.norm(coords[u] + segment * t - head)
                            + 2 * (1 - dot),
                            int(u),
                            v,
                        )
                    )
        if not candidates:
            return []
        _, prev, u = min(candidates)
        seen = {prev}
        while len(neighbours[u]) == 2 and u not in seen:
            options = set(forward[u]) - {prev}
            if not options:
                break
            seen.add(u)
            prev, u = u, next(iter(options))
        travel = coords[u] - coords[prev]
        travel /= np.linalg.norm(travel)
        rows = []
        for ja, en, best in routes:
            if u not in best or best[u] < 12:
                continue
            options = [
                (w + best[v], v)
                for v, w in forward[u].items()
                if v != prev and v in best
            ]
            if not options:
                continue
            length, v = min(options)
            if length > best[u] + 10:
                continue
            d = coords[v] - coords[u]
            d /= np.linalg.norm(d)
            if travel @ d < -0.6:
                continue
            cross = travel[0] * d[1] - travel[1] * d[0]
            arrow = "↑" if travel @ d > 0.76 else "←" if cross > 0 else "→"
            rows.append((length, arrow, ja, en))
        return [[arrow, ja, en] for _, arrow, ja, en in sorted(rows)[:2]]

    signs = []
    for x, y, z, dx, dy in layout["fixtures"]["gantries"]:
        center = np.array([x - 3.3 * dy, y + 3.3 * dx])
        travel = np.array([dx, dy])
        signs.append([panel(center, travel), panel(center, -travel)])
    return signs
