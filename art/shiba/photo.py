"""Fetch a georeferenced GSI aerial mosaic for the finite Shiba project area."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import math
from pathlib import Path
import sys
import time
import requests
from PIL import Image

ZOOM = 18
BOUNDS = (139.7405, 35.6515, 139.7563, 35.6612)


def pixel(lon, lat):
    n = 256 * (2**ZOOM)
    return (lon + 180) / 360 * n, (
        1 - math.asinh(math.tan(math.radians(lat))) / math.pi
    ) / 2 * n


def build(cache):
    left, top = pixel(BOUNDS[0], BOUNDS[3])
    right, bottom = pixel(BOUNDS[2], BOUNDS[1])
    x0, y0 = int(left // 256), int(top // 256)
    x1, y1 = int(right // 256), int(bottom // 256)
    board = Image.new("RGB", ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    tiles = cache / "ortho"
    tiles.mkdir(parents=True, exist_ok=True)

    def fetch(pos):
        x, y = pos
        p = tiles / f"{x}-{y}.jpg"
        if not p.exists():
            for attempt in range(5):
                try:
                    url = f"https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{ZOOM}/{x}/{y}.jpg"
                    res = requests.get(url, timeout=15)
                    res.raise_for_status()
                    im = Image.open(BytesIO(res.content))
                    im.load()
                    assert im.size == (256, 256)
                    p.write_bytes(res.content)
                    break
                except Exception:
                    if attempt == 4:
                        raise
                    time.sleep(1 + attempt * 0.3)
        return x, y, Image.open(p).convert("RGB")

    with ThreadPoolExecutor(6) as pool:
        for x, y, im in pool.map(
            fetch, [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
        ):
            board.paste(im, ((x - x0) * 256, (y - y0) * 256))
    board.save(cache / "aerial.jpg", quality=94, subsampling=0)
    (cache / "aerial.json").write_text(
        json.dumps(
            {"zoom": ZOOM, "pixelOrigin": [x0 * 256, y0 * 256], "size": board.size}
        )
    )
    print("GSI aerial mosaic", board.size, "tiles", (x1 - x0 + 1) * (y1 - y0 + 1))


if __name__ == "__main__":
    build(Path(sys.argv[1]))
