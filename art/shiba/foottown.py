"""FootTown's inhabited floors, separated from the four open steel bearing bays."""

import numpy as np
from grade import sample
from station_sites import DAIMON_A6, SHIBA_A3, BASIN


def open_shelter(arr, roles, id, names):
    v, f, uv, mats = arr
    # The survey represents the canopy as an enclosed solid. Retain its surveyed
    # roof and its footprint on an underground slab. Open the walls around the stair and water basin.
    v = v.copy()
    sel = (roles[f[:, 0]] == 1) | (roles[f[:, 0]] == 3)
    v[roles == 3, 2] -= 3.8 if id in (DAIMON_A6, SHIBA_A3) else 1.4
    mi = mats[sel].copy()
    mi[roles[f[sel, 0]] == 1] = names.index(
        "Ibushi roof tiles" if id == BASIN else "Roof membrane"
    )
    mi[roles[f[sel, 0]] == 3] = names.index("Foundation concrete")
    return (v, f[sel], uv, mi), roles


def bearings(grid):
    from grade import breaks

    u, n, _ = tower_plan()
    corners = np.array([[-1, -1], [1, -1], [1, 1], [-1, 1]])
    result = []
    for sx, sy in corners:
        foot = np.array([sx, sy]) * 40.5 + corners * 4.65
        world = foot[:, 0, None] * u + foot[:, 1, None] * n
        survey = [
            a + (b - a) * t
            for a, b in zip(world, np.roll(world, -1, axis=0))
            for t in breaks(a, b, grid)
        ]
        z = sample(grid, survey)
        # Keep exactly the chord inclinations from the first laser-fitted seven-metre stage.
        h = max(1.6, float(np.max(z)) + 1.85 - 18.391)
        radius = 40.5 - 0.30 * h
        head = np.array([sx, sy]) * radius + corners * 3.94
        result.append((sx, sy, h, foot, head, float(np.min(z)) - 0.16))
    return result


def foottown(arr, roles, names, grid):
    v, f, uv, old = arr
    high = v[f]
    keep = high[:, :, 2].min(1) > 130.0
    u, n, outline = tower_plan()
    xyz = []
    uvs = []
    faces = []
    mi = []
    role = []
    panel = names.index("FootTown panel")
    metal = names.index("FootTown frame")
    glass = names.index("FootTown glazing")
    stone = names.index("Basalt shop base")
    roof = names.index("Roof membrane")

    def face(points, mat, kind, tex=None):
        start = len(xyz)
        p = np.asarray(points)
        xy = p[:, :2]
        xyz.extend(np.column_stack((xy[:, 0, None] * u + xy[:, 1, None] * n, p[:, 2])))
        if tex is None:
            delta = xy[1] - xy[0]
            dir = delta / max(1e-8, np.linalg.norm(delta))
            tex = (
                np.column_stack((xy @ dir, p[:, 2])) / [2.4, 2.4]
                if np.ptp(p[:, 2]) > 0.02
                else xy / 2.4
            )
        uvs.extend(tex)
        role.extend([kind] * len(p))
        for i in range(1, len(p) - 1):
            faces.append([start, start + i, start + i + 1])
            mi.append(mat)

    for a, b in zip(outline, np.roll(outline, -1, axis=0)):
        tangent = (b - a) / np.linalg.norm(b - a)
        norm = np.array([tangent[1], -tangent[0]])

        def side(start, end, z, Z, setback, mat):
            p = a + tangent * start + norm * setback
            q = a + tangent * end + norm * setback
            face([(*p, z), (*q, z), (*q, Z), (*p, Z)], mat, 2)

        l = np.linalg.norm(b - a)
        floor = 18.391
        base = min(
            floor - 0.4,
            float(np.min(sample(grid, np.array([u * x + n * y for x, y in [a, b]]))))
            - 0.50,
        )
        levels = [
            (base, 18.76, stone),
            (18.76, 22.52, glass),
            (22.52, 24.57, panel),
            (24.57, 27.42, glass),
            (27.42, 29.04, panel),
            (29.04, 32.07, glass),
            (32.07, 33.50, panel),
            (33.50, 36.45, glass),
            (36.45, 38.36, panel),
            (38.36, 40.63, glass),
            (40.63, 41.87, panel),
        ]
        bays = max(1, round(l / 1.82))
        for z, Z, mat in levels:
            side(0, l, z, Z, 0, mat)
            if mat == glass:
                for j in range(bays):
                    x = j * l / bays + 0.04
                    side(max(0, x - 0.047), min(l, x + 0.047), z, Z, 0.048, metal)
                side(0, l, z + 0.66, z + 0.72, 0.052, metal)
                side(0, l, Z - 0.08, Z, 0.064, metal)
            else:
                side(0, l, Z - 0.075, Z, 0.043, metal)
    # A fan over this measured star-shaped plan caps the central public building.
    for a, b in zip(outline, np.roll(outline, -1, axis=0)):
        face([(0, 0, 41.87), (*a, 41.87), (*b, 41.87)], roof, 1)
        face([(0, 0, 18.26), (*b, 18.26), (*a, 18.26)], stone, 3)
    concrete = names.index("Bridge concrete")
    for sx, sy, h, foot, head, low in bearings(grid):
        seat = 18.391 + h - 0.56
        for k in range(4):
            j = (k + 1) % 4
            face(
                [
                    (*foot[k], low),
                    (*foot[j], low),
                    (*head[j], seat - 0.17),
                    (*head[k], seat - 0.17),
                ],
                concrete,
                2,
            )
            face(
                [
                    (*head[k], seat - 0.17),
                    (*head[j], seat - 0.17),
                    (*head[j], seat),
                    (*head[k], seat),
                ],
                metal,
                2,
            )
        face([(*p, seat) for p in head], concrete, 1)
    off = len(v)
    return (
        np.concatenate([v, np.float32(xyz)]),
        np.concatenate([f[keep], np.int32(faces) + off]),
        np.concatenate([uv, np.float32(uvs)]),
        np.concatenate([old[keep], np.int16(mi)]),
    ), np.r_[roles, np.uint8(role)]


def tower_plan():
    az = np.deg2rad(-33.72)
    u = np.array([np.cos(az), np.sin(az)])
    n = np.array([-u[1], u[0]])
    outline = np.array(
        [
            [-38.4, -21.5],
            [-28.9, -21.5],
            [-23.0, -28.25],
            [22.9, -28.25],
            [28.0, -26.42],
            [37.82, -26.42],
            [37.82, 22.88],
            [28.0, 22.88],
            [20.5, 28.40],
            [-22.8, 28.40],
            [-28.7, 22.78],
            [-38.4, 22.78],
        ]
    )
    return u, n, outline
