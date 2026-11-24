"""North-up plan showing the same irregular polygon and real landmarks as the game."""

import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import map_coordinates
from shiba_site import LAT, LON, NORTH, EAST


def draw(cache, dest):
    data = json.loads((cache / "layout.json").read_text())
    width, height = 1632, 1100
    boundary = np.array(data["boundary"])
    west, south = boundary.min(0)
    east, north = boundary.max(0)
    scale = min((width - 252) / (east - west), (height - 235) / (north - south))
    x0 = (width - (east - west) * scale) / 2 - west * scale
    y0 = 137 + north * scale

    def project(p):
        return (round(x0 + p[0] * scale), round(y0 - p[1] * scale))

    raster = np.asarray(Image.open(cache / "aerial.jpg"))
    am = json.loads((cache / "aerial.json").read_text())
    yy, xx = np.mgrid[0:height, 0:width]
    lat = LAT + (y0 - yy) / scale / NORTH
    lon = LON + (xx - x0) / scale / EAST
    n = 256 * 2 ** am["zoom"]
    u = (lon + 180) / 360 * n - am["pixelOrigin"][0]
    v = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n - am["pixelOrigin"][1]
    a = np.stack(
        [
            map_coordinates(raster[:, :, k], [v, u], order=1, mode="nearest")
            for k in range(3)
        ],
        axis=-1,
    )
    shape = [project(p) for p in boundary]
    mask = Image.new("L", (width, height))
    ImageDraw.Draw(mask).polygon(shape, fill=255)
    im = Image.new("RGB", (width, height), "#eeede6")
    shade = Image.new("L", im.size)
    ImageDraw.Draw(shade).polygon([(x + 1, y + 5) for x, y in shape], fill=69)
    im.paste(
        "#535b53", (0, 0, width, height), shade.filter(ImageFilter.GaussianBlur(10))
    )
    im.paste(Image.fromarray(a), mask=mask)
    pen = ImageDraw.Draw(im)
    pen.line(shape + [shape[0]], fill="#52664a", width=3, joint="curve")
    fontpath = "/System/Library/Fonts/Hiragino Sans GB.ttc"
    font = lambda size: ImageFont.truetype(fontpath, size)
    ink = "#1d302b"
    sub = "#4e6258"
    verm = "#a83d25"
    paper = "#f7f5ee"
    pen.text((60, 40), "芝公园与东京塔", font=font(50), fill=ink, anchor="lm")
    pen.text(
        (61, 90), "东京都港区   /   街区实景地图", font=font(23), fill=sub, anchor="lm"
    )
    pen.text(
        (width - 63, 48),
        "35.65859° N     139.74545° E",
        font=font(23),
        fill=ink,
        anchor="rm",
    )
    # Labels are offset from their true map control points with a short leader.
    offsets = [(-56, -40), (-70, 36), (28, -50), (8, -49), (22, 44), (51, 37)]
    for i, (name, x, y) in enumerate(data["pins"]):
        px, py = project((x, y))
        dx, dy = offsets[i]
        tx, ty = px + dx, py + dy
        f = font(21)
        tw = round(pen.textlength(name, font=f))
        anchor = "lm" if dx >= 0 else "rm"
        left = tx - 8 if dx >= 0 else tx - tw - 9
        pen.line([(px, py), (tx, ty)], fill=paper, width=5)
        pen.line([(px, py), (tx, ty)], fill=ink, width=2)
        pen.rounded_rectangle(
            (left, ty - 18, left + tw + 17, ty + 18),
            radius=6,
            fill=paper,
            outline="#6e766a",
            width=1,
        )
        pen.text((tx, ty - 1), name, font=f, fill=ink, anchor=anchor)
        pen.ellipse(
            (px - 7, py - 7, px + 7, py + 7),
            fill=verm if i == 0 else ink,
            outline=paper,
            width=3,
        )
    length = round(200 * scale)
    sx, sy = 64, height - 91
    pen.line([(sx, sy), (sx + length, sy)], fill=ink, width=3)
    for dx in (0, length // 2, length):
        pen.line([(sx + dx, sy - 5), (sx + dx, sy + 4)], fill=ink, width=2)
    pen.text((sx, sy - 11), "0", font=font(17), fill=ink, anchor="ls")
    pen.text((sx + length, sy - 11), "200 m", font=font(17), fill=ink, anchor="rs")
    px, py = width - 80, 135
    pen.polygon(
        [(px, py - 24), (px - 8, py + 8), (px, py + 3), (px + 8, py + 8)], fill=ink
    )
    pen.text((px, py - 31), "N", font=font(18), anchor="ms", fill=ink)
    pen.text(
        (64, height - 38),
        "底图：地理院タイル   ·   街道与地标：© OpenStreetMap contributors",
        font=font(17),
        fill=sub,
        anchor="lm",
    )
    pen.text(
        (width - 65, height - 38),
        "可探索区域  0.56 平方公里",
        font=font(19),
        fill=ink,
        anchor="rm",
    )
    im.save(dest, quality=90, method=6)


if __name__ == "__main__":
    draw(Path(sys.argv[1]), Path(sys.argv[2]))
