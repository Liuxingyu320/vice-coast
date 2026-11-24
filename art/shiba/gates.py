"""Architectural reconstructions located from each measured roof ridge and ground surface."""

import math
import numpy as np

PALETTE = {
    "Gate vermilion": "a63b2d",
    "Gate timber": "503429",
    "Ibushi roof tiles": "53585a",
    "Gate plaster": "dfd2b6",
    "Foundation concrete": "525960",
    "Gate gilding": "ba9256",
    "Gate inscription": "efe9dd",
    "Aged copper ridge": "728a80",
    "Gate painted concrete": "694b41",
}


def make_gate(arr, large, names):
    vertices = arr[0]
    peak = vertices[:, 2].max()
    ridge = vertices[vertices[:, 2] > peak - 0.08]
    # The east-facing fronts are nearly north–south; orient from the real ridge endpoints.
    a = ridge[ridge[:, 1].argmin(), :2]
    b = ridge[ridge[:, 1].argmax(), :2]
    u = (b - a) / np.linalg.norm(b - a)
    front = np.array([u[1], -u[0]])
    center = (a + b) * 0.5
    base = vertices[:, 2].min()
    vs, fs, ms, obstacles = [], [], [], []
    red, timber, tile, plaster, stone, gold, letters, copper, concrete = [
        names.index(k) for k in PALETTE
    ]

    mapped = {}

    def world(x, y):
        return center + u * x + front * y

    def shape(points, faces, mat, reverse=False):
        begin = len(vs)
        vs.extend([(*world(x, y), base + z) for x, y, z in points])
        for face in faces:
            if reverse:
                face = face[::-1]
            for k in range(1, len(face) - 1):
                fs.append([begin + face[0], begin + face[k], begin + face[k + 1]])
                ms.append(mat)

    def inscription(x, y, z, w, h, half):
        begin = len(vs)
        shape(
            [
                (x - w / 2, y, z - h / 2),
                (x + w / 2, y, z - h / 2),
                (x + w / 2, y, z + h / 2),
                (x - w / 2, y, z + h / 2),
            ],
            [(0, 1, 2, 3)],
            letters,
        )
        for i, (a, b) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
            mapped[begin + i] = ((half + a * 0.992 + 0.004) / 2, b * 0.992 + 0.004)

    def rect(x, y, w, d):
        return [
            (x - w / 2, y - d / 2),
            (x + w / 2, y - d / 2),
            (x + w / 2, y + d / 2),
            (x - w / 2, y + d / 2),
        ]

    def box(x, y, z, w, d, h, mat):
        rim = rect(x, y, w, d)
        shape(
            [(a, b, c) for c in [z - h / 2, z + h / 2] for a, b in rim],
            [(0, 1, 2, 3), (7, 6, 5, 4)]
            + [(i, i + 4, (i + 1) % 4 + 4, (i + 1) % 4) for i in range(4)],
            mat,
        )

    def drum(x, y, bottom, h, r, R, mat, sides=12):
        shape(
            [
                (
                    x + rad * math.cos(i * math.tau / sides),
                    y + rad * math.sin(i * math.tau / sides),
                    z,
                )
                for z, rad in [(bottom, r), (bottom + h, R)]
                for i in range(sides)
            ],
            [tuple(reversed(range(sides))), tuple(range(sides, 2 * sides))]
            + [
                (i, (i + 1) % sides, (i + 1) % sides + sides, i + sides)
                for i in range(sides)
            ],
            mat,
            True,
        )

    def block_collision(x, y, w, d):
        obstacles.append([world(a, b).round(3).tolist() for a, b in rect(x, y, w, d)])

    def post(x, y, h, r):
        block_collision(x, y, 2.65 * r, 2.65 * r)
        box(x, y, 0.19, 2.65 * r, 2.65 * r, 0.38, stone)
        drum(x, y, 0.28, 0.19, r * 1.35, r * 1.12, stone)
        drum(x, y, 0.43, h - 0.43, r, r * 0.96, red, 24)
        for z, w in [(h - 0.65, 2.7), (h - 0.4, 3.4), (h - 0.15, 3.9)]:
            box(x, y, z, w * r, 2.6 * r, 0.22, timber if w == 2.7 else red)

    def roof(x, y, z, w, d, rise):
        # Curved hips built as four connected rings; a second narrow ridge sits above the upper gables.
        def ring(t):
            halfw = w / 2 - (d * 0.32) * t
            halfd = d / 2 * (1 - t) + 0.07 * t
            return halfw, halfd, z + rise * (0.46 * t + 0.54 * t * t)

        for side in range(4):

            def pt(t, s):
                X, Y, Z = ring(t)
                a, b = [(-X, -Y), (X, -Y), (X, Y), (-X, Y)][side]
                c, e = [(X, -Y), (X, Y), (-X, Y), (-X, -Y)][side]
                return (
                    x + a + (c - a) * s,
                    y + b + (e - b) * s,
                    Z + 0.48 * abs(2 * s - 1) ** 5 * (1 - t) ** 2,
                )

            cols = max(4, round((w if side % 2 == 0 else d) / 0.55))
            for j in range(cols):
                for k in range(4):
                    t = k / 4
                    s = j / cols
                    shape(
                        [
                            pt(t, s),
                            pt(t, (j + 1) / cols),
                            pt(t + 0.25, (j + 1) / cols),
                            pt(t + 0.25, s),
                        ],
                        [(0, 1, 2, 3)],
                        tile,
                    )
                # Raised ceramic roll from the eave to the ridge, tapering with the hip.
                for k in range(4):
                    t = k / 4
                    s = j / cols
                    l, r = pt(t, s), pt(t + 0.25, s)
                    l2, r2 = (
                        pt(t, min(1, s + 0.09 / cols)),
                        pt(t + 0.25, min(1, s + 0.09 / cols)),
                    )
                    shape(
                        [
                            l,
                            (l2[0], l2[1], l2[2] + 0.085),
                            (r2[0], r2[1], r2[2] + 0.085),
                            r,
                        ],
                        [(0, 1, 2, 3)],
                        stone,
                    )
                l, r = pt(0, j / cols), pt(0, (j + 1) / cols)
                lip = [(*p[:2], p[2] - 0.18) for p in [l, r]]
                shape([l, r, lip[1], lip[0]], [(0, 1, 2, 3)], timber)

                # The underside of an irimoya eave rises toward the outer tips.
                # Exposed rafters and transverse battens follow that plane.
                def soffit(p, t):
                    return (
                        x + (p[0] - x) * (1 - 0.23 * t),
                        y + (p[1] - y) * (1 - 0.36 * t),
                        p[2] - 0.18 - t * min(0.98, d * 0.075),
                    )

                shape([*lip, soffit(r, 1), soffit(l, 1)], [(0, 1, 2, 3)], timber)

                def batten(p, q, r, s, depth):
                    top = [p, q, r, s]
                    lower = [(a, b, c - depth) for a, b, c in top]
                    shape(
                        top + lower,
                        [
                            (4, 7, 6, 5),
                            (0, 4, 5, 1),
                            (1, 5, 6, 2),
                            (2, 6, 7, 3),
                            (3, 7, 4, 0),
                        ],
                        red,
                    )

                if large and w > 18:
                    end = pt(0, min(1, (j + 0.14) / cols))
                    mid = tuple((np.array(l) + end) / 2)
                    batten(
                        soffit(l, 0.02),
                        soffit(end, 0.02),
                        soffit(end, 1),
                        soffit(l, 1),
                        0.052,
                    )
                    for t in [0.36, 0.67, 0.94]:
                        batten(
                            soffit(l, t),
                            soffit(r, t),
                            soffit(r, t + 0.023),
                            soffit(l, t + 0.023),
                            0.038,
                        )
                    box(mid[0], mid[1], mid[2] - 0.10, 0.080, 0.078, 0.094, red)
        # A raised gable above each hip creates the characteristic irimoya end profile.
        if large and w > 22 and rise < 4:
            for side in [-1, 1]:
                X = x + side * (w * 0.5 - d * 0.27)
                shape(
                    [
                        (X, y - d * 0.22, z + rise * 0.40),
                        (X, y + d * 0.22, z + rise * 0.40),
                        (X, y, z + rise - 0.07),
                    ],
                    [(0, 1, 2)],
                    timber,
                )
                shape(
                    [
                        (X + side * 0.03, y - d * 0.155, z + rise * 0.48),
                        (X + side * 0.03, y + d * 0.155, z + rise * 0.48),
                        (X + side * 0.03, y, z + rise * 0.86),
                    ],
                    [(0, 1, 2)],
                    plaster,
                )
        box(x, y, z - 0.18 - min(0.98, d * 0.075), w * 0.77, d * 0.64, 0.12, timber)
        box(x, y, z + rise + 0.09, w - d * 0.64 + 0.45, 0.48, 0.3, tile)
        if large and w > 22:
            box(x, y, z + rise + 0.252, w - d * 0.64 + 0.62, 0.52, 0.065, copper)
        for sign in [-1, 1]:
            box(x + sign * (w - d * 0.64) / 2, y, z + rise + 0.3, 0.45, 0.55, 0.5, tile)

    def lantern(x, y, z, r):
        drum(x, y, z + 0.42, 0.42, 0.035, 0.035, timber)
        drum(x, y, z - 0.29, 0.58, r, r, plaster)
        for f in [-0.31, -0.20, 0.20, 0.31]:
            drum(x, y, z + f, 0.04, r * 1.04, r * 1.04, timber)

    if large:
        # Five bays, the central three open. The annexes account for the rest of the surveyed 55 m outline.
        for x in [-9.75, -5.9, -2, 2, 5.9, 9.75]:
            for y in [-4.5, 0, 4.5]:
                post(x, y, 7, 0.45)
        for side in [-1, 1]:
            x = side * 7.8
            box(x, 0, 3.15, 3.3, 8.8, 5.7, red)
            box(x, 0, 0.20, 3.45, 8.92, 0.40, stone)
            block_collision(x, 0, 3.45, 8.92)
            for face in [-1, 1]:
                box(x, face * 4.42, 3.55, 2.97, 0.12, 2.52, timber)
                for j in range(12):
                    box(x - 1.38 + j * 0.25, face * 4.51, 3.55, 0.09, 0.11, 2.5, red)
                for z in [2.21, 4.88]:
                    box(x, face * 4.52, z, 3.16, 0.2, 0.14, red)
                for xx in [-1.56, 1.56]:
                    box(x + xx, face * 4.52, 3.55, 0.14, 0.21, 2.78, red)
            for z in [5.65, 6.85, 7.4]:
                box(0, side * 4.52, z, 21, 0.46, 0.43, red)
            for x in [-9.75, -5.9, -2, 2, 5.9, 9.75]:
                for j in range(3):
                    box(
                        x,
                        side * (4.87 + j * 0.28),
                        6.58 + j * 0.30,
                        0.86 + j * 0.49,
                        0.80,
                        0.21,
                        timber,
                    )
                    for k in [-1, 1]:
                        box(
                            x + k * (0.31 + j * 0.2),
                            side * (4.94 + j * 0.28),
                            6.74 + j * 0.3,
                            0.29,
                            0.56,
                            0.25,
                            red,
                        )
            for x in np.arange(-11, 11.1, 0.55):
                box(x, side * 5.45, 7.62, 0.16, 2.1, 0.27, red)
        roof(0, 0, 7.9, 25, 14, 3.7)
        box(0, 0, -1.24, 19.9, 10.9, 2.72, stone)
        box(0, 0, 11.4, 21.7, 11.2, 0.68, red)
        for side in [-1, 1]:
            box(0, side * 5.52, 12.47, 21.8, 0.12, 0.14, red)
            for x in np.arange(-10.5, 10.6, 0.72):
                box(x, side * 5.52, 12, 0.11, 0.12, 0.95, red)
        box(0, 0, 13.96, 18.1, 7.5, 4.75, red)
        for side in [-1, 1]:
            for x in np.arange(-8.66, 8.70, 0.255):
                box(x, side * 3.77, 13.25, 0.022, 0.045, 2.53, timber)
            for h in [12.36, 12.53, 13.04, 15.54, 16.03]:
                box(0, side * 3.87, h, 18.0, 0.22, 0.106, timber if h < 12.42 else red)
            for x in np.arange(-7.8, 8, 2.6):
                box(x, side * 3.78, 14.14, 2.05, 0.16, 2.4, timber)
                for k in range(7):
                    box(x - 0.9 + k * 0.30, side * 3.9, 14.14, 0.08, 0.12, 2.4, red)
        for z, w in [(16.25, 19.5), (16.65, 20.3), (17.05, 21.2)]:
            box(0, 0, z, w, 9.5, 0.32, red)
        roof(0, 0, 17.28, 25.4, 13.5, 3.28)
        for side in [-1, 1]:
            for x in [-4, 4]:
                lantern(x, side * 4.6, 5.25, 0.34)
            for k in range(3):
                box(
                    0,
                    side * (5.15 + k * 0.38),
                    0.25 - k * 0.08,
                    19.9,
                    0.5,
                    0.42 - k * 0.11,
                    stone,
                )
            # Wing gate, white infill, tiled connecting wall.
            x = side * 18.8
            box(x, -1.6, 2.1, 12, 3.5, 4.2, plaster)
            box(x, -1.6, 0.1225, 12.15, 3.66, 0.245, stone)
            for xx in [-3, 3]:
                box(x + xx, 0.2, 2.15, 5.6, 0.16, 3.58, red)
                for j in range(13):
                    box(x + xx - 2.52 + j * 0.42, 0.3, 2.12, 0.058, 0.06, 3.3, timber)
            block_collision(x, -1.6, 12.15, 3.66)
            roof(x, -1.6, 4.22, 13.1, 4.8, 1.2)
            for xx in [-4.8, 0, 4.8]:
                box(x + xx, 0.19, 2.2, 0.28, 0.22, 4.4, timber)
        box(0, 4.02, 15.48, 2.3, 0.24, 0.91, gold)
        inscription(0, 4.156, 15.48, 2.14, 0.78, 0)
    else:
        for x in [-4.85, 4.85]:
            block_collision(x, 0, 1.28, 1.28)
            box(x, 0, 0.415, 1.28, 1.28, 0.83, stone)
            box(x, 0, 3.62, 1.05, 1.05, 5.58, concrete)
            box(x, 0.56, 3.34, 0.68, 0.10, 3.62, gold)
            inscription(x, 0.62, 3.34, 0.61, 3.54, 1)
            post(x, -4.12, 3.90, 0.33)
            box(x, -2.1, 3.8, 0.38, 4.6, 0.38, concrete)
            roof(x, -3, 4.13, 2.05, 5.5, 0.84)
        box(0, 0, 5.28, 12.35, 0.85, 0.76, concrete)
        box(0, 0, 6.11, 11.2, 0.73, 0.92, plaster)
        for x in [-4.85, 0, 4.85]:
            box(x, 0, 6.14, 0.45, 0.93, 1.03, concrete)
        box(0, 0, 6.64, 13.3, 1.62, 0.28, plaster)
        for x in np.arange(-6, 6.1, 0.43):
            box(x, 0, 6.79, 0.18, 2.88, 0.18, plaster)
        roof(0, 0, 6.98, 14.5, 4.6, 1.67)
    uv = np.zeros((len(vs), 2), "f4")
    for i, pair in mapped.items():
        uv[i] = pair
    vertices, faces = np.float32(vs), np.int32(fs)
    tri = vertices[faces]
    normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    wrong = ((np.asarray(ms) == tile) & (normals[:, 2] < -0.0001)) | (
        (np.asarray(ms) == letters) & (np.sum(normals[:, :2] * front, axis=1) < 0)
    )
    faces[wrong] = faces[wrong][:, ::-1]
    return (
        vertices,
        faces,
        uv,
        np.int16(ms),
    ), obstacles
