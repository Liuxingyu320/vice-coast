"""Bake metre-scale tyre paths, contact shadows and static light footprints in survey space."""

from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from shapely import LineString
import json


def fields(root, data, ao, size, scale, xmin, ymax, coords):
    w, h = size
    tracks = Image.new("L", size)
    paint = ImageDraw.Draw(tracks)
    for (kind, xy), info in zip(data["roads"], data["roadInfo"]):
        if kind != "road":
            continue
        line = LineString(xy)
        width, _, _, lanes = info
        n = max(1, min(lanes, round(width / 2.55)))
        for i in range(n):
            center = width * ((i + 0.5) / n - 0.5)
            for wheel in [-0.76, 0.76]:
                curve = line.offset_curve(center + wheel)
                for p in getattr(curve, "geoms", [curve]):
                    if len(p.coords) > 1:
                        paint.line(
                            coords(p.coords),
                            fill=145 if width < 5 else 207,
                            width=max(1, round(0.53 * scale)),
                        )
    tyre = np.asarray(tracks.filter(ImageFilter.GaussianBlur(0.29 * scale))) / 255
    rng = np.random.default_rng(720)

    def noise(grid):
        return (
            np.asarray(
                Image.fromarray(
                    np.uint8(rng.random((int(h / grid) + 2, int(w / grid) + 2)) * 255)
                ).resize(size, Image.Resampling.BICUBIC)
            )
            / 255
        )

    patch = noise(20) * 0.41 + noise(8) * 0.19 + noise(49) * 0.40
    # Separate file avoids burning tyre marks or coloured illumination into daytime ortho photography.
    Image.fromarray(np.uint8(np.stack((tyre, patch, noise(46)), axis=-1) * 255)).save(
        root / "assets/shiba-road-wear.jpg", quality=89
    )
    lights = np.zeros((h, w, 3), np.float32)

    def kernel(x, y, nx, ny, along, across):
        px, py = (x - xmin) * scale, (ymax - y) * scale
        r = int(np.ceil(max(along, across) * scale * 3))
        a, A = max(0, int(px) - r), min(w, int(px) + r + 1)
        b, B = max(0, int(py) - r), min(h, int(py) + r + 1)
        if A <= a or B <= b:
            return None
        yy, xx = np.mgrid[b:B, a:A]
        xx = (xx - px) / scale
        yy = (py - yy) / scale
        an = xx * nx + yy * ny
        ac = -xx * ny + yy * nx
        return np.s_[b:B, a:A], np.exp(-0.5 * ((an / along) ** 2 + (ac / across) ** 2))

    def pool(x, y, nx, ny, l, b, color):
        k = kernel(x, y, nx, ny, l, b)
        if k:
            sl, v = k
            lights[sl] += v[:, :, None] * np.asarray(color)

    def contact(x, y, wx, wy, nx=1, ny=0):
        k = kernel(x, y, nx, ny, wx, wy)
        if k:
            sl, v = k
            ao[sl] *= 1 - v * 0.24

    for x, y, z, dx, dy in data["fixtures"]["lamps"]:
        pool(x - dy * 2.85, y + dx * 2.85, dx, dy, 4.7, 2.95, (0.80, 0.43, 0.19))
        contact(x, y, 0.36, 0.32)
    for x, y, z, dx, dy in data["fixtures"]["signals"]:
        pool(x - dy * 4.55, y + dx * 4.55, dx, dy, 2.9, 1.25, (0.23, 0.18, 0.11))
        contact(x, y, 0.42, 0.37)
    for row in data["fixtures"]["rails"]:
        for x, y, z in row:
            contact(x, y, 0.29, 0.28)
    for k, id, x, y, nx, ny, *rest in data["fixtures"]["amenities"]:
        contact(x, y, 0.43, 0.39)
        if k in ["vending", "shelter"]:
            pool(x + nx * 0.9, y + ny * 0.9, nx, ny, 1.7, 1.21, (0.62, 0.69, 0.65))
    for f in json.loads((root / "assets/shiba-frontages.json").read_text()):
        x, y, nx, ny, width, kind = f[:6]
        warm = kind in (1, 2, 3, 5, 6)
        pool(
            x + nx * 1.1,
            y + ny * 1.1,
            nx,
            ny,
            1.8,
            width * 0.46,
            (0.61, 0.32, 0.14) if warm else (0.39, 0.51, 0.54),
        )
    detail = json.loads((root / "assets/shiba-city-detail.json").read_text())
    for _, x, y, z, nx, ny in detail["bridgeLights"]:
        pool(x, y, nx, ny, 3.7, 3.0, (0.27, 0.32, 0.31))
    for _, x, y, nx, ny, width, depth, *_ in detail["street"]:
        contact(x, y, max(0.26, depth * 0.65), max(0.26, width * 0.56), nx, ny)
    for x in [-40.5, 40.5]:
        for y in [-40.5, 40.5]:
            a = -33.72 * np.pi / 180
            px = x * np.cos(a) - y * np.sin(a)
            py = x * np.sin(a) + y * np.cos(a)
            pool(px, py, 1, 0, 8.4, 7.4, (1.25, 0.45, 0.10))
    Image.fromarray(np.uint8((1 - np.exp(-lights)) * 255)).save(
        root / "assets/shiba-street-light.jpg", quality=93
    )
