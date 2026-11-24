"""Zojoji's main sanctuary. Keep the surveyed annexes and rebuild the central roof and porch on their measured axes."""

import numpy as np
from grade import sample


def sanctuary(arr, roles, names, grid):
    v, f, uv, mi = arr
    ridge = v[v[:, 2] > v[:, 2].max() - 0.11, :2]
    a, b = ridge[ridge[:, 1].argmin()], ridge[ridge[:, 1].argmax()]
    c = (a + b) / 2
    u = (b - a) / np.linalg.norm(b - a)
    n = np.array([u[1], -u[0]])
    local = np.column_stack(((v[:, :2] - c) @ u, (v[:, :2] - c) @ n, v[:, 2]))
    center = local[f].mean(1)
    main = (
        (abs(center[:, 0] + 0.24) < 26)
        & (abs(center[:, 1] + 0.15) < 27.24)
        & (roles[f[:, 0]] != 3)
    )
    floor = float(v[:, 2].min())
    peak = float(v[:, 2].max())
    verts = []
    faces = []
    mats = []
    kinds = []
    tex = []
    timber = names.index("Gate timber")
    wall = names.index("Gate plaster")
    ceramic = names.index("Ibushi roof tiles")
    stone = names.index("Kerb granite")
    glass = names.index("Hall window")
    brass = names.index("Hall gilt")

    def face(q, mat, role=2, axis=None):
        q = np.array(q, float)
        normal = np.cross(q[1] - q[0], q[2] - q[0])
        if axis is not None and normal @ axis < 0:
            q = q[::-1]
        raw = np.column_stack((c + q[:, 0, None] * u + q[:, 1, None] * n, q[:, 2]))
        first = len(verts)
        verts.extend(raw)
        kinds.extend([role] * len(q))
        if abs(normal[2]) > np.linalg.norm(normal) * 0.5:
            tex.extend(q[:, :2] / 2.4)
        else:
            tex.extend(
                np.c_[
                    q[:, :2]
                    @ (
                        np.array([1, 0]) if abs(normal[1]) >= abs(normal[0]) else [0, 1]
                    ),
                    q[:, 2],
                ]
                / 2.4
            )
        for i in range(1, len(q) - 1):
            # North axis x east axis is the local reflection.
            faces.append((first, first + i + 1, first + i))
            mats.append(mat)

    def box(x, y, z, w, d, h, mat, upper=2):
        rim = np.array(
            [
                [x - w / 2, y - d / 2],
                [x + w / 2, y - d / 2],
                [x + w / 2, y + d / 2],
                [x - w / 2, y + d / 2],
            ]
        )
        bottom = np.c_[rim, np.full(4, z)]
        top = bottom + [0, 0, h]
        face(top, mat, upper, [0, 0, 1])
        for i in range(4):
            j = (i + 1) % 4
            face([bottom[i], bottom[j], top[j], top[i]], mat)

    def rail(start, end, radius):
        a, b = np.asarray(start), np.asarray(end)
        axis = (b - a) / np.linalg.norm(b - a)
        e = np.array([1.0, 0.0, 0.0])
        f = np.cross(axis, e)
        angles = np.arange(10) * (2 * np.pi / 10)
        ring = radius * (np.cos(angles)[:, None] * e + np.sin(angles)[:, None] * f)
        for i, offset in enumerate(ring):
            other = ring[(i + 1) % len(ring)]
            face(
                [a + offset, a + other, b + other, b + offset],
                handrail,
                2,
                offset + other,
            )
        face(a + ring, handrail, 2, -axis)
        face(b + ring, handrail, 2, axis)

    def roof(z, w, d, topw, topd, rise, hip):
        def rim(t):
            # The full gable roof has a short hipped skirt and a long, steeper upper pitch.
            hw = (w + (topw - w) * (min(t / 0.58, 1) if hip else t)) / 2
            hd = (d + (topd - d) * t) / 2
            return np.array([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]])

        for side in range(4):

            def pos(t, s):
                r = rim(t)
                xy = r[side] * (1 - s) + r[(side + 1) % 4] * s
                return np.r_[
                    xy,
                    z
                    + rise * (0.58 * t + 0.42 * t * t)
                    + 0.82 * abs(2 * s - 1) ** 5 * (1 - t) ** 2,
                ]

            length = w if side % 2 == 0 else d
            count = round(length / 0.34)
            for k in range(count):
                t0 = k / count
                t1 = (k + 1) / count
                for j in range(5):
                    h, H = j / 5, (j + 1) / 5
                    l, r, R, L = pos(h, t0), pos(h, t1), pos(H, t1), pos(H, t0)
                    face([l, r, R, L], ceramic, 1, [0, 0, 1])
                    # Convex roll tile, including sidewalls. Each roll follows the hip.
                    mid = pos(h, t0 + 0.20 / count) + [0, 0, 0.084]
                    hi = pos(H, t0 + 0.20 / count) + [0, 0, 0.084]
                    edge = pos(h, t0 + 0.40 / count)
                    end = pos(H, t0 + 0.40 / count)
                    face([l, mid, hi, L], ceramic, 1, [0, 0, 1])
                    face([mid, edge, end, hi], ceramic, 1, [0, 0, 1])
                l, r = pos(0, t0), pos(0, t1)
                outer = [l - [0, 0, 0.20], r - [0, 0, 0.20]]
                face([l, r, *outer[::-1]], timber)
                inset = [p * np.array([0.83, 0.83, 1]) - [0, 0, 1.16] for p in outer]
                face([*outer, *inset[::-1]], timber, 2, [0, 0, -1])
                if k % 2 == 0:
                    p = (l + r) / 2
                    box(p[0], p[1], p[2] - 0.20, 0.095, 0.095, 0.125, wall)
        if topd > 1:
            box(0, 0, z + rise - 0.11, topw, topd, 0.11, ceramic, 1)

    # Core envelope and gallery on the existing terrace. The attached wings keep their CityGML surfaces.
    box(0, -0.1, floor, 42.0, 39.0, 8.0 - floor, stone)
    box(0, 0, 7.98, 41.25, 36.6, 10.45, wall)
    box(0, 0, 19.33, 40.5, 34, 9.0, wall)
    for side in [-1, 1]:
        for level, width, depth, h in [
            (11.52, 39.8, 19.25, 7.0),
            (24.1, 36.6, 17.7, 4.1),
        ]:
            span = width / 7
            for k in range(7):
                x = (k - 3) * span
                box(
                    x,
                    side * (depth + 0.09),
                    level + 0.13,
                    span - 0.23,
                    0.33,
                    h - 0.32,
                    timber,
                )
                if level > 20 or abs(k - 3) > 2:
                    box(
                        x,
                        side * (depth + 0.29),
                        level + 0.36,
                        span - 0.57,
                        0.095,
                        h - 1.02,
                        wall,
                    )
                else:
                    box(
                        x,
                        side * (depth + 0.29),
                        level + 0.34,
                        span - 0.60,
                        0.102,
                        h - 0.94,
                        glass,
                    )
                for j in [-1.5, -0.5, 0.5, 1.5]:
                    box(
                        x + j * span / 5,
                        side * (depth + 0.36),
                        level + 0.31,
                        0.085,
                        0.13,
                        h - 0.78,
                        timber,
                    )
                box(
                    x,
                    side * (depth + 0.38),
                    level + h * 0.69,
                    span - 0.46,
                    0.14,
                    0.15,
                    timber,
                )
            for k in range(8):
                x = (k - 3.5) * span
                box(x, side * (depth + 1.10), level, 0.64, 0.68, h, timber)
                box(
                    x, side * (depth + 1.10), level + h - 0.43, 1.34, 0.97, 0.31, timber
                )
            box(
                0,
                side * (depth + 0.93),
                level + h - 0.28,
                width + 1.4,
                0.89,
                0.43,
                timber,
            )
        for k in range(25):
            x = (k - 12) * 1.55
            box(x, side * 19.1, 24.06, 0.115, 0.15, 1.16, timber)
        for z in [24.36, 24.86, 25.14]:
            box(0, side * 19.1, z, 39, 0.17, 0.11, timber)
    roof(19.0, 52.6, 55.0, 40.3, 35.8, 5.16, False)
    roof(28.9, 47.0, 39.8, 31.9, 0.16, peak - 29.45, True)
    box(0, 0, peak - 0.55, 32.4, 0.53, 0.51, ceramic, 1)
    for sign in [-1, 1]:
        for j in range(7):
            x = sign * (15.8 + j * 0.12)
            box(
                x,
                0,
                peak - 0.22 + j * 0.08,
                0.72 - j * 0.059,
                0.42 - j * 0.032,
                0.25,
                brass,
                1,
            )
    # The temple records 25 risers to the main hall. Fit the bottom tread to the actual courtyard DEM.
    grid = dict(grid)
    grid["gradeCm"] = np.asarray(grid["gradeCm"])
    bottom = float(sample(grid, c + n * 36.1)) - 0.04
    landing = bottom + 4.10
    handrail = names.index("Hall handrail")
    riser = names.index("Stair riser")
    nosing = names.index("Stair nosing")
    box(0, 22.15, floor, 36.28, 9.35, landing - floor, stone, 1)
    for j in range(25):
        y = 35.84 - j * 0.364
        step = bottom + (j + 1) * (landing - bottom) / 25
        prev = bottom + j * (landing - bottom) / 25
        near, back = y + 0.182, y - 0.182
        left, right = -12.10, 12.10

        def rectangle(x0, x1, y0, y1, z):
            return [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]

        face(rectangle(left, right, back, near - 0.045, step), stone, 1, [0, 0, 1])
        face(
            rectangle(left, right, near - 0.045, near, step),
            nosing,
            1,
            [0, 0, 1],
        )
        # The light exposed arris and the short sheltered return stay visible from
        # below the first tread, where the upper faces are hidden by perspective.
        for (y0, z0), (y1, z1), mat in [
            ((near - 0.014, prev), (near - 0.014, step - 0.035), riser),
            ((near - 0.014, step - 0.035), (near, step - 0.025), riser),
            ((near, step - 0.025), (near, step), stone),
        ]:
            face(
                [(left, y0, z0), (right, y0, z0), (right, y1, z1), (left, y1, z1)],
                mat,
                2,
                [0, 1, 0],
            )
        for side in (left, right):
            face(
                [
                    (side, near, floor),
                    (side, back, floor),
                    (side, back, step),
                    (side, near, step),
                ],
                stone,
                2,
                [np.sign(side), 0, 0],
            )
    for x in (-5.9, 5.9):
        # Two stainless assistance rails leave the central approach and outside aisles clear.
        for j in (0, 5, 10, 15, 20, 24):
            y = 35.84 - j * 0.364
            z = bottom + (j + 1) * (landing - bottom) / 25
            rail((x, y, z), (x, y, z + 0.88), 0.024)
            rail((x, y, z), (x, y, z + 0.023), 0.078)
        low = (x, 35.84, bottom + (landing - bottom) / 25 + 0.88)
        high = (x, 35.84 - 24 * 0.364, landing + 0.88)
        rail(low, high, 0.031)
        for end, offset in [(low, 0.31), (high, -0.31)]:
            tip = (x, end[1] + offset, end[2])
            rail(end, tip, 0.031)
            rail(tip, (x, tip[1], tip[2] - 0.13), 0.031)
    for sign in [-1, 1]:
        box(sign * 16.6, 26.52, landing, 0.27, 0.27, 0.98, timber)
        for j in range(4):
            box(sign * (12.7 + j * 1.28), 26.52, landing, 0.16, 0.16, 1.0, timber)
        for z in [0.39, 0.92]:
            box(sign * 14.9, 26.52, landing + z, 4.74, 0.15, 0.105, timber)
    new = (
        np.concatenate([v, np.array(verts, "f4")]),
        np.concatenate([f[~main], np.array(faces, "i4") + len(v)]),
        np.concatenate([uv, np.array(tex, "f4")]),
        np.concatenate([mi[~main], np.array(mats, "i2")]),
    )
    steps = {
        "center": c.tolist(),
        "along": u.tolist(),
        "front": n.tolist(),
        "bottom": bottom,
        "landing": landing,
        "outer": 35.84 + 0.364 / 2,
        "tread": 0.364,
        "count": 25,
        "halfWidth": 12.10,
    }
    return new, np.r_[roles, np.asarray(kinds, dtype="u1")], steps
