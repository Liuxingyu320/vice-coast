"""Linked zelkova, black pine and cherry crowns with cutout sprays and unified normals."""

import math
import numpy as np


def prototype(kind, wood, leaf):
    rng = np.random.default_rng(243 + kind)
    v, uv, faces, materials, normals = [], [], [], [], []

    def tube(a, b, r0, r1):
        a, b = np.asarray(a), np.asarray(b)
        d = b - a
        d = d / np.linalg.norm(d)
        u = np.cross(d, [1, 0, 0] if abs(d[2]) > 0.8 else [0, 0, 1])
        u /= np.linalg.norm(u)
        w = np.cross(d, u)
        base = len(v)
        for p, r in [(a, r0), (b, r1)]:
            for j in range(8):
                n = u * math.cos(j * math.tau / 8) + w * math.sin(j * math.tau / 8)
                v.append(p + r * n)
                normals.append(n)
                uv.append((j / 8, p[2] * 3))
        for j in range(8):
            k = (j + 1) % 8
            faces.extend(
                [
                    (base + j, base + k, base + k + 8),
                    (base + j, base + k + 8, base + j + 8),
                ]
            )
            materials.extend([wood, wood])

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
    fork = np.array([0.024, -0.017, 0.34 if kind != 1 else 0.44])
    tube(root, fork, 0.061 if kind != 1 else 0.051, 0.030)
    main = (14, 11, 13)[kind]
    for j in range(main):
        phase = j * 2.39996 + rng.uniform(-0.22, 0.22)
        t = j / (main - 1)
        direction = np.array([math.cos(phase), math.sin(phase)])
        radius = (
            (0.89 - 0.55 * t)
            if kind == 1
            else 0.99 * math.sqrt(max(0.07, 1 - (2 * t - 1) ** 2)) + 0.12
        )
        start = fork + np.r_[direction * 0.02, 0.16 * t]
        crownZ = (0.49, 0.50, 0.52)[kind] + (0.42, 0.40, 0.37)[kind] * t
        elbow = np.r_[direction * radius * 0.40, (start[2] + crownZ) * 0.5]
        tip = np.r_[direction * radius * 0.74, crownZ]
        tube(start, elbow, 0.030 - 0.011 * t, 0.014)
        tube(elbow, tip, 0.014, 0.006)
        for k in range(3):
            a = phase + (k - 1) * 0.80 + rng.uniform(-0.18, 0.18)
            length = (0.08 + 0.19 * (1 - t * 0.40)) if k != 1 else 0.12
            center = tip + np.array(
                [math.cos(a) * length, math.sin(a) * length, (k % 2) * 0.053]
            )
            tube(tip, center, 0.006, 0.0025)
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
                spray(p, az, span, drop)
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
