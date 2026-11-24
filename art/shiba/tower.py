"""Open steelwork fitted to the Minato survey, with the published observation elevations."""

import math
import numpy as np


def make_tower(materials):
    white = len(materials)
    materials.extend(
        [
            "Ivory steel",
            "International orange",
            "Deck glazing",
            "Antenna steel",
            "Warm windows",
        ]
    )
    red, glass, steel, lamp = white + 1, white + 2, white + 3, white + 4
    verts = []
    faces = []
    mi = []
    base = 18.391
    az = math.radians(-33.72)
    co, si = math.cos(az), math.sin(az)

    def pos(x, y, z):
        return (x * co - y * si, x * si + y * co, z + base)

    def poly(points, idx, m):
        idx0 = len(verts)
        verts.extend(points)
        for f in idx:
            for j in range(1, len(f) - 1):
                faces.append([idx0 + f[0], idx0 + f[j], idx0 + f[j + 1]])
                mi.append(m)

    def beam(a, b, r, m, top=None, sides=5):
        a = np.array(a)
        b = np.array(b)
        v = b - a
        v /= np.linalg.norm(v)
        n = np.cross(v, [0, 0, 1] if abs(v[2]) < 0.93 else [0, 1, 0])
        n /= np.linalg.norm(n)
        q = np.cross(v, n)
        pts = [
            tuple(
                c
                + rad
                * (
                    n * math.cos(j * math.tau / sides)
                    + q * math.sin(j * math.tau / sides)
                )
            )
            for c, rad in [(a, r), (b, r if top is None else top)]
            for j in range(sides)
        ]
        poly(
            pts,
            [
                (j, (j + 1) % sides, (j + 1) % sides + sides, j + sides)
                for j in range(sides)
            ]
            + [tuple(range(sides - 1, -1, -1)), tuple(range(sides, 2 * sides))],
            m,
        )

    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    # Half-spans of the supporting frame, checked against the 2024 laser sections.
    profile = [
        (0, 40.5),
        (12, 36.9),
        (26, 32.0),
        (42, 24.25),
        (58, 18.0),
        (75, 14.2),
        (91, 12.0),
        (104, 10.85),
        (118, 9.95),
        (130, 9.35),
        (150, 7.9),
        (166, 7.1),
        (182, 6.25),
        (209, 5.05),
        (230, 4.18),
        (251, 3.3),
        (256, 2.1),
        (275, 1.95),
        (300, 1.59),
        (314, 0.92),
    ]

    def width(h):
        return np.interp(h, *zip(*profile))

    def coat(h):
        return (
            red
            if h < 151
            or 176 < h < 207
            or 231 < h < 251
            or 272 < h < 291
            or 306 < h < 317
            or h > 327
            else white
        )

    # Each lower leg is a four-chord tapered truss; its horizontal orientation comes from the survey.
    stages = [0, 7, 15, 24, 32, 38, 46, 53, 62, 65, 76, 85, 97, 108, 119, 129]
    for sx, sy in corners:
        last = None
        for h in stages:
            rad = width(h)
            thick = np.interp(h, [0, 42, 92, 147], [3.0, 2.25, 1.26, 0.65])
            nodes = [
                pos(sx * rad + u * thick, sy * rad + v * thick, h) for u, v in corners
            ]
            for j in range(4):
                k = (j + 1) % 4
                beam(nodes[j], nodes[k], 0.21 if h < 81 else 0.16, red)
                if last:
                    beam(last[j], nodes[j], 0.39 if h < 61 else 0.23, red)
                    beam(last[j], nodes[k], 0.17 if h < 61 else 0.115, red)
                    beam(last[k], nodes[j], 0.16 if h < 61 else 0.11, red)
            last = nodes
    # Four characteristic curved steel portals at the base.
    for side in range(4):

        def face(t, span, h, inset=0):
            if side == 0:
                return pos(t * span, -width(h) + inset, h)
            if side == 1:
                return pos(width(h) - inset, t * span, h)
            if side == 2:
                return pos(-t * span, width(h) - inset, h)
            return pos(-width(h) + inset, -t * span, h)

        prev = None
        for t in np.linspace(-1, 1, 21):
            h = 19 + 42 * math.sqrt(max(0, 1 - abs(t) ** 1.65))
            a = face(t, 33, h)
            b = face(t, 33, h + 3.05)
            beam(a, b, 0.18, red)
            if prev:
                beam(prev[0], a, 0.37, red)
                beam(prev[1], b, 0.29, red)
                beam(prev[0], b, 0.18, red)
            prev = (a, b)
    # The upper shaft has smaller bays and alternates orange and aviation white.
    levels = [
        38,
        53,
        65,
        76,
        85,
        97,
        108,
        119,
        130,
        141,
        152,
        161,
        170,
        180,
        191,
        202,
        213,
        225,
        236,
        246,
        254,
        263,
        272,
        281,
        291,
        300,
        308,
        314,
    ]
    for h, H in zip(levels, levels[1:]):
        ra, rb = width(h), width(H)
        m = coat((h + H) / 2)
        for j, (sx, sy) in enumerate(corners):
            u, v = corners[(j + 1) % 4]
            a = pos(sx * ra, sy * ra, h)
            b = pos(sx * rb, sy * rb, H)
            c = pos(u * rb, v * rb, H)
            d = pos(u * ra, v * ra, h)
            beam(a, b, max(0.22, 0.052 * ra), m)
            beam(b, c, max(0.15, 0.034 * ra), m)
            beam(a, c, max(0.13, ra * 0.033), m)
            beam(d, b, max(0.13, ra * 0.033), m)

    def deck(h, r, H, m, sides=8, upper=None, bevel=0.23):
        # Chamfered square viewing gallery.
        pairs = [
            (-1, -1 + bevel),
            (-1 + bevel, -1),
            (1 - bevel, -1),
            (1, -1 + bevel),
            (1, 1 - bevel),
            (1 - bevel, 1),
            (-1 + bevel, 1),
            (-1, 1 - bevel),
        ]
        R = r if upper is None else upper
        pts = [
            pos(x * rad, y * rad, z)
            for rad, z in [(r, h), (R, h + H)]
            for x, y in pairs
        ]
        poly(
            pts,
            [(j, (j + 1) % 8, 8 + (j + 1) % 8, 8 + j) for j in range(8)]
            + [tuple(range(7, -1, -1)), tuple(range(8, 16))],
            m,
        )

    # The enclosed viewing galleries and antenna housings come directly from the
    # textured CityGML surfaces in prepare_mesh.py, in their measured positions.
    # Inner elevator shaft, antenna mast and broadcast equipment read through the open lattice.
    deck(130, 2.25, 93.8, white, upper=1.48, bevel=0.08)
    for h, H, r, R in [
        (251, 272, 2.1, 1.9),
        (272, 291, 1.9, 1.55),
        (291, 306, 1.55, 1.26),
        (306, 314, 1.26, 1.03),
    ]:
        beam(pos(0, 0, h), pos(0, 0, H), r, coat((h + H) / 2), top=R, sides=12)
    # Elevator enclosure and service stair run inside the open lattice.
    deck(20, 1.8, 99, steel, bevel=0.05)
    for j in range(35):
        h = 25 + j * 3.22
        beam(pos(-3, -0.8, h), pos(3, -0.8, h + 3), 0.13, steel)
        beam(pos(-3, 0.25, h), pos(3, 0.25, h + 3), 0.13, steel)
        for n in range(6):
            t = n / 6
            beam(
                pos(-3 + 6 * t, -0.8, h + 3 * t),
                pos(-3 + 6 * t, 0.25, h + 3 * t),
                0.09,
                steel,
            )
    levels = [
        (307, 1.18),
        (314, 0.98),
        (320, 0.72),
        (325, 0.51),
        (330, 0.31),
        (333, 0.12),
    ]
    for (h, r), (H, R) in zip(levels, levels[1:]):
        beam(pos(0, 0, h), pos(0, 0, H), r, coat((h + H) / 2), top=R, sides=10)
    for h in [263, 268, 274, 280, 286, 292, 297, 303, 309, 315]:
        for j in range(4):
            a = j * math.pi / 2
            rr = width(min(h, 314)) + 0.41
            x, y = math.cos(a) * rr, math.sin(a) * rr
            beam(pos(x, y, h), pos(x * 0.98, y * 0.98, h + 2.3), 0.31, coat(h), sides=6)
    return (
        np.float32(verts),
        np.int32(faces),
        np.zeros((len(verts), 2), "f4"),
        np.int16(mi),
    )
