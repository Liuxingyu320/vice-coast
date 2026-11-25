"""Linked zelkova, black pine and cherry crowns with cutout sprays and unified normals."""

import math
import numpy as np


def prototype(kind, wood, leaf):
    rng = np.random.default_rng(243 + kind)
    v, uv, faces, materials, normals = [], [], [], [], []

    def bough(path, radii, sides=7):
        path = np.array(path)
        first = len(v)
        along = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
        around = None
        for i, (p, r) in enumerate(zip(path, radii)):
            axis = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
            axis /= np.linalg.norm(axis)
            if around is None:
                reference = [0, 0, 1] if abs(axis[2]) < 0.85 else [1, 0, 0]
                around = np.cross(axis, reference)
            around -= axis * (around @ axis)
            around /= np.linalg.norm(around)
            across = np.cross(axis, around)
            for j in range(sides + 1):
                theta = math.tau * j / sides
                normal = around * math.cos(theta) + across * math.sin(theta)
                v.append(p + r * normal)
                normals.append(normal)
                uv.append((j / sides, along[i] * 2.4))
                if i and j < sides:
                    a = first + (i - 1) * (sides + 1) + j
                    b = a + sides + 1
                    faces.extend([(a, a + 1, b + 1), (a, b + 1, b)])
                    materials.extend([wood, wood])
        # Slender terminal rings close around a bud, never on an abrupt open pipe.
        cap = len(v)
        v.append(path[-1])
        normals.append(axis)
        uv.append((0.5, along[-1] * 2.4))
        last = cap - sides - 1
        for j in range(sides):
            faces.append((last + j, last + j + 1, cap))
            materials.append(wood)

    def spray(center, angle, span, drop):
        outward = np.array([math.cos(angle), math.sin(angle), 0.0])
        across = np.array([-outward[1], outward[0], 0.0])
        offset = len(v)
        overhang = rng.uniform(0.11, 0.26) if kind != 1 else rng.uniform(0.21, 0.32)
        bank = rng.uniform(-0.065, 0.065)
        # Divide each spray into curved flanks; no flat card runs right across a crown.
        for j in range(3):
            t = j / 2
            for i in range(4):
                s = i / 3 - 0.5
                p = (
                    center
                    + across * s * span
                    + outward
                    * (0.13 * span * (1 - (2 * s) ** 2) + overhang * (0.61 - t))
                )
                p = p + np.array(
                    [0, 0, (t - 0.5) * drop + bank * s + 0.039 * (1 - (2 * s) ** 2)]
                )
                n = p * np.array([1, 1, 2.5]) + np.array([0, 0, -1.43])
                n /= np.linalg.norm(n)
                normals.append(n)
                v.append(p)
                uv.append((s + 0.5, t))
        for j in range(2):
            for i in range(3):
                q = offset + j * 4 + i
                faces.extend([(q, q + 1, q + 5), (q, q + 5, q + 4)])
                materials.extend([leaf, leaf])

    root = np.array([0.0, 0.0, -0.019])
    fork = np.array(
        [
            (0.036, -0.115, 0.085)[kind],
            (-0.024, 0.048, 0.07)[kind],
            (0.34, 0.44, 0.285)[kind],
        ]
    )
    leader = fork + np.array(
        [(-0.035, 0.14, -0.11)[kind], (0.035, -0.045, 0.065)[kind], 0.37]
    )
    heel = (root + fork) * 0.48 + np.array([0.019, -0.012, 0.0])
    bough(
        [root, heel, fork, leader],
        [(0.060, 0.050, 0.055)[kind], 0.042, 0.028, 0.006],
        10,
    )
    # Distinct architecture: vase-form elm, layered black pine and spreading cherry.
    main = (14, 14, 15)[kind]
    for j in range(main):
        phase = j * 2.39996 + rng.uniform(-0.22, 0.22)
        t = j / (main - 1)
        direction = np.array([math.cos(phase), math.sin(phase)])
        radius = (
            (0.89 - 0.55 * t)
            if kind == 1
            else 0.99 * math.sqrt(max(0.07, 1 - (2 * t - 1) ** 2)) + 0.12
        )
        radius *= (1.0, 0.94, 0.94)[kind] * (
            1.0 + (0.06, 0.15, 0.16)[kind] * math.sin(phase + 0.7)
        )
        start = fork * (1 - 0.63 * t) + leader * (0.63 * t)
        crownZ = (0.49, 0.50, 0.52)[kind] + (0.42, 0.40, 0.37)[kind] * t
        if kind == 1:
            crownZ = 0.43 + 0.42 * (j // 3) / 4
            radius *= 1.10 if j < 9 else 0.85
        if kind == 2:
            crownZ = 0.55 + 0.22 * t + 0.070 * math.sin(phase)
            radius *= 1.10
        elbow = np.r_[
            direction * radius * (0.31, 0.58, 0.54)[kind],
            (start[2] + crownZ) * 0.5 + (0.035, -0.05, -0.03)[kind],
        ]
        tip = np.r_[direction * radius * 0.74, crownZ]
        # Bend a single tapered section through the elbow. All rings share vertices, with
        # a transported frame. The root is embedded in the continuous trunk centreline.
        mid = (start + tip) * 0.5
        control = mid + 1.48 * (elbow - mid)
        curve = []
        crosswise = np.array([-direction[1], direction[0], 0])
        for h in (0, 0.23, 0.48, 0.73, 1):
            curve.append(
                (1 - h) ** 2 * start
                + 2 * (1 - h) * h * control
                + h * h * tip
                + crosswise * (math.sin(math.pi * h) * 0.035 * math.sin(phase))
            )
        strength = (0.019 - 0.010 * t) * (0.83 + 0.22 * math.sin(phase) ** 2)
        bough(
            curve,
            [strength, strength * 0.77, strength * 0.58, strength * 0.37, 0.0024],
            7,
        )
        for k in range(3):
            a = phase + (k - 1) * 0.80 + rng.uniform(-0.18, 0.18)
            length = (0.08 + 0.19 * (1 - t * 0.40)) if k != 1 else 0.12
            center = tip + np.array(
                [math.cos(a) * length, math.sin(a) * length, (k % 2) * 0.053]
            )
            joint = curve[-2] * 0.28 + tip * 0.72
            twig = (joint + center) * 0.5 + np.array(
                [-0.007 * math.sin(a), 0.007 * math.cos(a), 0.018]
            )
            bough([joint, twig, center], [0.0045, 0.0025, 0.0007], 5)
            for az in (a - 0.94, a + 0.74, a + 2.75):
                span = rng.uniform(0.63, 0.94) * (1 - 0.20 * t)
                drop = rng.uniform(0.09, 0.15) if kind == 1 else rng.uniform(0.15, 0.23)
                p = center + np.array(
                    [
                        math.cos(az) * 0.064,
                        math.sin(az) * 0.064,
                        rng.uniform(-0.018, 0.018),
                    ]
                )
                spray(
                    p,
                    az,
                    span * (1.0, 0.83, 1.00)[kind],
                    drop * (1.05, 0.90, 1.10)[kind],
                )
    positions = np.float32(v)
    measured_top = positions[:, 2].max()
    positions[:, 2] /= measured_top
    smooth = np.float32(normals)
    smooth[:, 2] *= measured_top
    smooth /= np.linalg.norm(smooth, axis=1)[:, None]
    return (
        positions,
        np.int32(faces),
        np.float32(uv),
        np.int16(materials),
    ), smooth
