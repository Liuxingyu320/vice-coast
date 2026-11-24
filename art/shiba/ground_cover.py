"""Land-use and contact-occlusion atlas in the survey frame; red=ambient light, green=park, blue=street illuminance."""

from pathlib import Path
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import distance_transform_edt
from shapely import Polygon
from shiba_site import roads_and_boundary

root = Path(__file__).resolve().parents[2]


def build(cache):
    data = json.loads((root / "assets/shiba-layout.json").read_text())
    grid = data["height"]
    _, _, _, parks = roads_and_boundary(cache)
    xmin, ymin = grid["x"], grid["y"]
    width = (grid["w"] - 1) * grid["step"]
    height = (grid["h"] - 1) * grid["step"]
    scale = 2048 / width
    size = (2048, round(height * scale))

    def coords(r):
        return [((x - xmin) * scale, (ymin + height - y) * scale) for x, y in r]

    base = Image.new("L", size)
    mask = Image.new("L", size)

    def paint(geometry, target):
        draw = ImageDraw.Draw(target)
        for poly in getattr(geometry, "geoms", [geometry]):
            if poly.geom_type != "Polygon":
                continue
            draw.polygon(coords(poly.exterior.coords), fill=255)
            for hole in poly.interiors:
                draw.polygon(coords(hole.coords), fill=0)

    for f in data["footprints"]:
        paint(Polygon(f["rings"][0], f["rings"][1:]).buffer(0), base)
    paint(parks, mask)
    # Distances in metres: contact darkening at a wall, with a short and a broad penumbra.
    d = distance_transform_edt(np.asarray(base) == 0) / scale
    ao = 1 - 0.26 * np.exp(-d / 0.85) - 0.13 * np.exp(-d / 4.5)
    for x, y, z, h, r in data["trees"]:
        px = (x - xmin) * scale
        py = (ymin + height - y) * scale
        radius = (r + 1) * scale
        x0 = max(0, int(px - radius))
        x1 = min(size[0], int(px + radius + 1))
        y0 = max(0, int(py - radius))
        y1 = min(size[1], int(py + radius + 1))
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dist = np.hypot(xx - px, yy - py) / scale
        ao[y0:y1, x0:x1] *= 1 - 0.27 * np.maximum(1 - dist / (r + 0.1), 0) ** 1.4
    pools = np.zeros_like(ao)
    for x, y, z, dx, dy in data["fixtures"]["lamps"]:
        px = (x - dy * 2.85 - xmin) * scale
        py = (ymin + height - y - dx * 2.85) * scale
        rad = 13 * scale
        x0 = max(0, int(px - rad))
        x1 = min(size[0], int(px + rad + 1))
        y0 = max(0, int(py - rad))
        y1 = min(size[1], int(py + rad + 1))
        yy, xx = np.mgrid[y0:y1, x0:x1]
        along = ((xx - px) * dx - (yy - py) * dy) / scale
        across = (-(xx - px) * dy - (yy - py) * dx) / scale
        pools[y0:y1, x0:x1] += np.exp(-0.5 * ((along / 5.2) ** 2 + (across / 3.4) ** 2))
    image = Image.merge(
        "RGB",
        (
            Image.fromarray(np.uint8(255 * ao)),
            mask.filter(ImageFilter.GaussianBlur(2)),
            Image.fromarray(np.uint8(255 * np.clip(pools, 0, 1))),
        ),
    )
    image.save(root / "assets/shiba-land-cover.png", optimize=True)


if __name__ == "__main__":
    build(Path(sys.argv[1]))
