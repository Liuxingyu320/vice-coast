"""Seamless metric material charts for the Blender file and the offline GLB."""

from pathlib import Path
import sys
import numpy as np

FACADE = ("Curtain wall", "Ribbon office", "Porcelain tile", "Metal sash")
SURFACE = {
    "asphalt": "Cold asphalt",
    "sidewalk": "Permeable pavers",
    "forecourt": "Granite setts",
    "curb": "Kerb granite",
    "tactile": "Tenji yellow",
    "white": "White paint",
    "yellow": "Amber paint",
    "zebra": "White paint",
    "stop": "White paint",
    "curbFace": "Kerb granite",
    "asphaltSkirt": "Asphalt section",
    "walkSkirt": "Kerb granite",
}
METRES = {
    "asphalt": 2.4,
    "sidewalk": 2.4,
    "forecourt": 2.4,
    "curb": 1.2,
    "tactile": 0.30,
}


def create_materials(dest):
    from PIL import Image, ImageDraw
    from scipy.ndimage import gaussian_filter

    dest.mkdir(exist_ok=True)
    random = np.random.default_rng(66218)

    def mineral(base, grain, size=512):
        n = random.normal(size=(size, size))
        fine = n * grain + gaussian_filter(n, 2, mode="wrap") * grain * 3
        return np.uint8(
            np.clip(np.array(base)[None, None, :] + fine[:, :, None], 0, 255)
        )

    def save(name, img, quality=92):
        Image.fromarray(img).save(
            dest / (name + ".jpg"), quality=quality, subsampling=0, optimize=True
        )

    asphalt = mineral((44, 49, 59), 7, 1024)
    flecks = random.random((1024, 1024))
    asphalt = np.clip(
        asphalt.astype(float)
        + ((flecks > 0.976) * 17 - (flecks < 0.035) * 12)[:, :, None],
        0,
        255,
    ).astype("u1")
    save("Cold asphalt", asphalt)
    deck = asphalt.copy()
    for i in (36, 982):
        deck[:, i : i + 14] = np.clip(
            asphalt[:, i : i + 14].astype(float) * 0.24 + 194, 0, 255
        )
    deck[:350, 505:520] = np.clip(
        asphalt[:350, 505:520].astype(float) * 0.24 + 195, 0, 255
    )
    save("Viaduct deck", deck, 91)
    for name, base, grain, side in [
        ("Permeable pavers", (165, 169, 169), 5, 8),
        ("Granite setts", (155, 152, 144), 7, 8),
        ("Foundation concrete", (81, 86, 88), 6, 4),
        ("Kerb granite", (158, 161, 159), 7, 2),
        ("Roof membrane", (105, 114, 116), 5, 4),
        ("Basalt shop base", (72, 78, 80), 5, 4),
    ]:
        size = 512
        p = mineral(base, grain, size).astype(float)
        yy, xx = np.indices((size, size))
        cell = size // side
        cx = (
            xx + (yy // cell % 2) * (cell // 2)
            if name in ("Granite setts", "Basalt shop base")
            else xx
        ) % cell
        cy = yy % cell
        cell_colors = random.uniform(-5, 5, (side, side))
        p += cell_colors[yy // cell, xx // cell][:, :, None]
        if name == "Kerb granite":
            edge = cx
        else:
            edge = np.minimum(cx, cy)
        p *= np.where(
            edge < 1, 0.64, np.where(edge < 2, 0.83, np.where(edge < 3, 1.055, 1))
        )[:, :, None]
        save(name, p.clip(0, 255).astype("u1"))
    y, x = np.indices((256, 256))
    out = mineral((222, 174, 53), 3, 256).astype(float)
    a = (x / 256 * 5) % 1 - 0.5
    b = (y / 256 * 5) % 1 - 0.5
    dist = np.hypot(a, b)
    out += np.where(
        dist < 0.208, (0.205 - dist) * 67 - (a + b) * 65, np.where(dist < 0.255, -17, 0)
    )[:, :, None]
    out[:2] *= 0.64
    out[:, :2] *= 0.64
    save("Tenji yellow", out.clip(0, 255).astype("u1"))
    for style, name in enumerate(FACADE):
        # Each tile spans eight bays by eight 3.3 m storeys. Frames, sills and night apertures are co-registered.
        image = Image.new("RGB", (1024, 1024))
        light = Image.new("RGB", image.size)
        db, dl = ImageDraw.Draw(image), ImageDraw.Draw(light)
        for row in range(8):
            floor_lit = random.uniform(0.12, 0.73)
            for col in range(8):
                x, y = 128 * col, 128 * row

                def rect(dx, dy, ex, ey, color, emission=False):
                    (dl if emission else db).rectangle(
                        (x + dx, y + dy, x + ex, y + ey),
                        fill=tuple(int(k) for k in color),
                    )

                def shift(color, delta):
                    return np.clip(np.array(color) + delta, 0, 255)

                base = [
                    (92, 112, 122),
                    (183, 178, 164),
                    (182, 155, 136),
                    (108, 117, 121),
                ][style]
                rect(0, 0, 127, 127, shift(base, random.uniform(-5, 5)))
                if style == 2:
                    for j in range(0, 128, 8):
                        rect(0, j, 127, j, (124, 122, 118))
                        for i in range(-6, 128, 18):
                            k = i + (j // 8 % 2) * 9
                            if 0 <= k < 128:
                                rect(k, j, k, min(j + 7, 127), (127, 125, 120))
                lower = [97, 90, 91, 99][style]
                top = [4, 23, 22, 12][style]
                margin = [3, 2, 13, 8][style]
                rect(margin, top, 127 - margin, lower, (56, 65, 68))
                for sash in range(2):
                    left = margin + 3 + sash * (64 - margin)
                    right = left + 60 - margin
                    topglass = top + 3
                    bottom = lower - 3
                    glass = [
                        (76, 108, 126),
                        (97, 117, 120),
                        (87, 99, 96),
                        (85, 104, 115),
                    ][style]
                    variation = random.uniform(-18, 16)
                    islit = random.random() < floor_lit
                    tint = [(246, 213, 169), (212, 226, 227), (249, 232, 194)][
                        random.integers(3)
                    ]
                    for j in range(topglass, bottom + 1):
                        t = (j - topglass) / (bottom - topglass)
                        reflection = (
                            (1 - t) * 19 - t * 9 + 7 * np.sin(t * 5 + col * 0.65)
                        )
                        rect(left, j, right, j, shift(glass, variation + reflection))
                        if islit:
                            rect(
                                left,
                                j,
                                right,
                                j,
                                shift(tint, -30 * t + variation),
                                True,
                            )
                    if random.random() < 0.57:
                        end = topglass + int(
                            (bottom - topglass) * random.uniform(0.14, 0.77)
                        )
                        rect(
                            left,
                            topglass,
                            right,
                            end,
                            shift((155, 160, 154), variation),
                        )
                        rect(
                            left,
                            topglass,
                            right,
                            end,
                            shift((99, 99, 84), variation) if islit else (0, 0, 0),
                            True,
                        )
                        for k in range(topglass + 2, end, 4):
                            rect(left, k, right, k, shift((135, 142, 140), variation))
                    rect(left, topglass, left, bottom, (164, 175, 174))
                    if style in (0, 3):
                        rect(left, lower - 21, right, lower - 19, (73, 82, 85))
                        rect(left, lower - 21, right, lower - 19, (0, 0, 0), True)
                rect(0, lower + 2, 127, lower + 4, shift(base, 22))
                rect(0, 123, 127, 126, shift(base, -36))
                if style == 0:
                    rect(5, lower + 9, 122, 119, shift((77, 103, 118), variation))
                    rect(2, 0, 3, 127, (176, 187, 186))
                if style == 3:
                    for i in range(8, 128, 9):
                        rect(i, lower + 9, i + 1, 120, shift(base, -27))
        albedo = np.asarray(image).astype(float) + random.normal(
            0, 1.5, (1024, 1024, 1)
        )
        save(name, np.uint8(np.clip(albedo, 0, 255)))
        save(name + " night", np.asarray(light), 90)
    for name, base in [
        ("Temple timber", (129, 91, 68)),
        ("Ibushi ceramic", (131, 136, 139)),
        ("Leaf litter", (126, 117, 91)),
    ]:
        a = mineral(base, 11).astype(float)
        y, x = np.indices(a.shape[:2])
        if name == "Temple timber":
            a += np.sin(x * 0.35 + np.sin(y * 0.028) * 2)[:, :, None] * 6
        if name == "Ibushi ceramic":
            a += (np.cos(x / 512 * 8 * 2 * np.pi) * 11 - ((y % 64) < 3) * 20)[
                :, :, None
            ]
        save(name, a.clip(0, 255).astype("u1"))

    save("Stair nosing", mineral((113, 114, 108), 5))
    risers = mineral((149, 149, 141), 7).astype(float)
    ry, rx = np.indices((512, 512))
    mortar = (rx + (ry // 35 % 2) * 116) % 242
    risers += (-36 * (mortar < 2) + 7 * (mortar == 2))[:, :, None]
    save("Stair riser", risers.clip(0, 255).astype("u1"))
    rail = mineral((177, 177, 168), 2, 256).astype(float)
    rail += random.normal(0, 1.5, (256, 1, 1))
    save("Hall handrail", rail.clip(0, 255).astype("u1"))
    save("Hall gilt", mineral((172, 141, 72), 5))
    pane = mineral((60, 77, 80), 2).astype(float)
    yy, xx = np.indices((512, 512))
    pane += ((yy / 512 - 0.5) * 15 + np.sin(xx / 96 + yy / 65) * 2.4)[:, :, None]
    save("Hall window", pane.clip(0, 255).astype("u1"))

    # Screen, plaster and vertical-board infill in four 1.8 m bays. The survey
    # supplies the building outline and colour beneath this metre-scaled joinery.
    y, x = np.indices((512, 1024))
    col, bx = x // 256, x % 256
    panel = np.tile(np.array([186.0, 179.0, 160.0]), (512, 1024, 1))
    plaster_noise = random.normal(0, 1.8, y.shape)
    panel += plaster_noise[:, :, None]
    timber_noise = (
        4.7 * np.sin(x * 0.46 + 1.8 * np.sin(y * 0.026))
        + 3.0 * np.sin(x * 0.91 + y * 0.004)
        + plaster_noise
    )
    timber = np.array([83.0, 67.0, 53.0]) + timber_noise[:, :, None]
    planks = (
        np.array([119.0, 99.0, 76.0])
        + (timber_noise + 8 * np.sin((x // 14) * 3.1))[:, :, None]
    )
    board = (y > 359) | (col == 3)
    panel[board] = planks[board]
    panel[board & (x % 14 <= 1)] *= 0.65
    opening = ((col == 1) | (col == 2)) & (bx > 16) & (bx < 239) & (y > 92) & (y < 360)
    panel[opening] = (
        np.array([102.0, 107.0, 99.0])
        + (18 * np.cos(x * 0.009 + y * 0.007) + plaster_noise)[opening, None]
    )
    sash = opening & (((bx - 18) % 29 < 3) | ((y - 91) % 56 < 4))
    panel[sash] = timber[sash]
    louver = (col == 3) & (y > 104) & (y < 359) & (bx > 18) & (bx < 239)
    panel[louver] *= np.where((bx[louver] % 11) < 4, 0.34, 0.94)[:, None]
    frames = (
        (bx < 8)
        | (bx > 247)
        | (y < 11)
        | (y > 502)
        | ((y > 78) & (y < 91))
        | ((y > 358) & (y < 369))
    )
    panel[frames] = timber[frames]
    panel[(bx > 7) & (bx < 13)] *= 0.77
    panel[(y > 90) & (y < 98)] *= 0.77
    joinery = Image.fromarray(np.uint8(np.clip(panel, 0, 255)))
    joinery.save(
        Path(__file__).resolve().parents[2] / "assets/shiba-temple-joinery.jpg",
        quality=93,
        subsampling=0,
        optimize=True,
    )
    # Baked albedos keep painted grain and aggregate in viewers without shader extensions.
    Y, X = np.indices((512, 512))
    fibres = np.asarray(Image.open(dest / "Temple timber.jpg"), float).mean(2)
    for name, base in [
        ("Gate timber", (101, 68, 49)),
        ("Gate vermilion", (152, 58, 42)),
        ("Gate plaster", (212, 206, 184)),
        ("Gate painted concrete", (102, 76, 64)),
        ("Bark", (85, 78, 62)),
    ]:
        grain = (fibres - fibres.mean()) * (0.72 if name != "Gate plaster" else 0.26)
        if name == "Bark":
            grain += (
                np.sin(X * 0.11 + np.sin(Y * 0.021) * 2) * 12
                + np.cos(X * 0.35 + np.sin(Y * 0.036)) * 5
            )
        if name == "Gate painted concrete":
            grain = random.normal(0, 3, grain.shape)
        if name == "Gate vermilion":
            grain += 3.4 * np.sin(X * 0.048 + np.sin(Y * 0.025)) + 2 * np.sin(
                Y * 0.026 + 1.7 * np.sin(X * 0.022)
            )
        save(name, (np.array(base) + grain[:, :, None]).clip(0, 255).astype("u1"))
    size = 768
    terrain_tiles = []
    for kind, base in enumerate([(89, 100, 64), (111, 94, 73), (143, 142, 129)]):
        n = random.normal(0, 1, (size, size))
        lo = gaussian_filter(n, 11, mode="wrap")
        lo /= lo.std()
        broad = gaussian_filter(n, 3, mode="wrap")
        broad /= broad.std()
        array = np.array(base) + (lo * 6 + broad * 4 + n * 5)[:, :, None]
        tile = Image.fromarray(array.clip(0, 255).astype("u1"))
        dr = ImageDraw.Draw(tile)
        if kind == 0:
            for _ in range(78000):
                x, y = random.integers(0, size, 2)
                h = random.uniform(3, 13)
                t = random.uniform(0, 6.28)
                color = np.clip(
                    np.array(base) * random.uniform(0.66, 1.40) + [3, 4, -3], 0, 255
                ).astype(int)
                dr.line(
                    (x, y, x + np.cos(t) * h, y + np.sin(t) * h),
                    fill=tuple(color),
                    width=1 + int(h > 9),
                )
        else:
            for _ in range(19000 if kind == 2 else 8500):
                x, y = random.integers(0, size, 2)
                r = random.uniform(0.6, 2.9 if kind == 2 else 2)
                color = (np.array(base) * random.uniform(0.57, 1.40)).astype(int)
                dr.ellipse((x - r, y - r * 0.7, x + r, y + r * 0.7), fill=tuple(color))
                if r > 1.65:
                    dr.point(
                        (x - r / 2, y - r / 2), fill=tuple(np.minimum(color + 22, 255))
                    )
        terrain_tiles.append(np.asarray(tile))
    save("Ground micro", np.concatenate(terrain_tiles, axis=1), 94)
    from shutil import copyfile

    copyfile(
        dest / "Ground micro.jpg",
        Path(__file__).resolve().parents[2] / "assets/shiba-ground-detail.jpg",
    )


if __name__ == "__main__":
    create_materials(Path(sys.argv[1]) / "surface")
