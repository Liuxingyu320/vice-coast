"""Measure the park canopy from Tokyo's 2024 ward aerial laser survey."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json, math, sys, time, zipfile
import numpy as np
import mapbox_vector_tile as mvt
import requests, laspy
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import maximum_filter, gaussian_filter, binary_closing, label
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely import contains_xy
from shiba_site import en, roads_and_boundary, EAST, NORTH, LAT, LON


def fetch(url):
    for attempt in range(4):
        try:
            r = requests.get(url, timeout=(10, 65))
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)


def main(cache):
    area, ways, trees, greens = roads_and_boundary(cache)
    folder = cache / "laser"
    folder.mkdir(exist_ok=True)
    z = 13
    n = 2**z

    def indices(lon, lat):
        return int((lon + 180) / 360 * n), int(
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) * n / 2
        )

    def to_model(x, y):
        lon = x / n * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
        return en(lat, lon)

    x0, y0 = indices(139.7405, 35.6612)
    x1, y1 = indices(139.7563, 35.6515)
    urls = {}
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            b = fetch(
                f"https://gic-tokyo.s3.ap-northeast-1.amazonaws.com/2024/dig/Vectortile/23ku/lp/{z}/{x}/{y}.pbf"
            )
            for layer in mvt.decode(b, default_options={"y_coord_down": True}).values():
                scale = layer["extent"]
                for ft in layer["features"]:
                    coords = ft["geometry"]["coordinates"]
                    if ft["geometry"]["type"] == "MultiPolygon":
                        coords = coords[0]
                    shp = Polygon(
                        [to_model(x + u / scale, y + v / scale) for u, v in coords[0]]
                    )
                    if shp.intersects(area):
                        urls[ft["properties"]["MESH_NO"]] = ft["properties"]["URL"]
    print("Matched laser tiles", sorted(urls), flush=True)
    # Public S3 archives are large. Range caching makes interrupted downloads resumable.
    jobs = []
    archives = []
    for name, url in urls.items():
        p = folder / (name + ".zip")
        archives.append(p)
        if p.exists():
            continue
        for retry in range(4):
            try:
                head = requests.head(url, timeout=16)
                head.raise_for_status()
                size = int(head.headers["Content-Length"])
                break
            except requests.RequestException:
                if retry == 3:
                    raise
        chunk = 2 * 1024 * 1024
        segments = []
        for first in range(0, size, chunk):
            last = min(first + chunk, size) - 1
            out = folder / f"{name}-{first}.part"
            segments.append(out)
            if not out.exists() or out.stat().st_size != last - first + 1:
                jobs.append((url, first, last, out))
        (folder / (name + ".parts")).write_text("\n".join(str(q) for q in segments))

    def download(job):
        url, start, end, out = job
        for attempt in range(6):
            try:
                res = requests.get(
                    url, headers={"Range": f"bytes={start}-{end}"}, timeout=(12, 40)
                )
                res.raise_for_status()
                if (
                    res.status_code != 206
                    or not res.headers.get("Content-Range", "").startswith(
                        f"bytes {start}-{end}/"
                    )
                    or len(res.content) != end - start + 1
                ):
                    raise IOError("Wrong laser byte range")
                out.write_bytes(res.content)
                return
            except (OSError, requests.RequestException):
                if attempt == 5:
                    raise
                time.sleep(1 + attempt * 0.5)

    print("Remaining laser chunks", len(jobs), flush=True)
    from concurrent.futures import as_completed

    with ThreadPoolExecutor(16) as ex:
        work = [ex.submit(download, j) for j in jobs]
        for i, future in enumerate(as_completed(work), 1):
            future.result()
            if i % 75 == 0:
                print("Laser chunks verified", i, "/", len(jobs), flush=True)
    for p in archives:
        if p.exists():
            continue
        parts = [Path(q) for q in p.with_suffix(".parts").read_text().splitlines()]
        with p.with_suffix(".assembling").open("wb") as dest:
            for part in parts:
                dest.write(part.read_bytes())
        p.with_suffix(".assembling").replace(p)
    # Source uses Japan Plane Rectangular CS IX (JGD2011), in metres.
    tr = Transformer.from_crs("EPSG:6677", "EPSG:4326", always_xy=True)
    layout = json.loads((cache / "layout.json").read_text())
    h = layout["height"]
    elev = np.array(h["cm"]).reshape(h["h"], h["w"]) / 100
    step = 1.5
    minx, miny, maxx, maxy = area.bounds
    width = int(math.ceil((maxx - minx) / step)) + 1
    height = int(math.ceil((maxy - miny) / step)) + 1
    dsm = np.full((height, width), -1.0, "f4")
    towercloud = []
    for path in archives:
        with zipfile.ZipFile(path) as zipf:
            lasname = next(p for p in zipf.namelist() if p.lower().endswith(".las"))
            with zipf.open(lasname) as raw, laspy.open(raw) as src:
                for pts in src.chunk_iterator(300000):
                    lon, lat = tr.transform(np.asarray(pts.x), np.asarray(pts.y))
                    x = (lon - LON) * EAST
                    y = (lat - LAT) * NORTH
                    v = np.asarray(pts.z)
                    gx = np.floor((x - minx) / step).astype(int)
                    gy = np.floor((y - miny) / step).astype(int)
                    ok = (gx >= 0) & (gx < width) & (gy >= 0) & (gy < height)
                    np.maximum.at(dsm, (gy[ok], gx[ok]), v[ok])
                    keep = (x * x + y * y < 48**2) & (v > 44)
                    if keep.any():
                        towercloud.append(
                            np.float32(np.column_stack((x[keep], y[keep], v[keep])))
                        )
    xs = minx + (np.arange(width) + 0.5) * step
    ys = miny + (np.arange(height) + 0.5) * step
    X, Y = np.meshgrid(xs, ys)
    gx = np.clip(np.rint((X - h["x"]) / 5).astype(int), 0, h["w"] - 1)
    gy = np.clip(np.rint((Y - h["y"]) / 5).astype(int), 0, h["h"] - 1)
    ground = elev[gy, gx]
    canopy = dsm - ground
    # Aerial green spectrum identifies foliage; laser returns supply the actual top elevation.
    am = json.loads((cache / "aerial.json").read_text())
    image = np.asarray(Image.open(cache / "aerial.jpg")).astype("f4")
    lat = LAT + Y / NORTH
    lon = LON + X / EAST
    s = 256 * 2 ** am["zoom"]
    u = np.clip(
        ((lon + 180) / 360 * s - am["pixelOrigin"][0]).astype(int),
        0,
        image.shape[1] - 1,
    )
    v = np.clip(
        (
            (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * s
            - am["pixelOrigin"][1]
        ).astype(int),
        0,
        image.shape[0] - 1,
    )
    rgb = image[v, u]
    R, G, B = rgb.transpose(2, 0, 1)
    fp = unary_union(
        [
            Polygon(q["rings"][0], q["rings"][1:]).buffer(0.9)
            for q in layout["footprints"]
        ]
    )
    green = (G > R * 0.96) & (G > B * 1.07) & (G > (R + B) * 0.515)
    mask = (
        contains_xy(area, X, Y)
        & ~contains_xy(fp, X, Y)
        & (canopy > 3.2)
        & (canopy < 35)
        & green
    )
    # The visible crown surface follows actual laser elevations, textured with the ortho.
    # Fill small sampling gaps inside each crown. Discard isolated returns.
    coverage = (
        binary_closing(mask, iterations=1)
        & ~contains_xy(fp, X, Y)
        & contains_xy(area, X, Y)
    )
    components, nc = label(coverage)
    counts = np.bincount(components.ravel())
    coverage &= counts[components] >= 8
    weight = gaussian_filter(mask.astype("f4"), 0.86)
    heights = (
        gaussian_filter(np.where(mask, canopy, 0), 0.86) / np.maximum(weight, 0.01)
        + ground
    )
    ids = np.full(coverage.shape, -1, "i4")
    ids[coverage] = np.arange(coverage.sum())
    vertex = np.float32(np.column_stack((X[coverage], Y[coverage], heights[coverage])))
    uv = np.float32(
        np.column_stack(
            (
                (u[coverage] + 0.5) / image.shape[1],
                1 - (v[coverage] + 0.5) / image.shape[0],
            )
        )
    )
    tri = []
    for aa, bb, cc in [
        (ids[:-1, :-1], ids[:-1, 1:], ids[1:, 1:]),
        (ids[:-1, :-1], ids[1:, 1:], ids[1:, :-1]),
    ]:
        good = (aa >= 0) & (bb >= 0) & (cc >= 0)
        tri.append(np.column_stack((aa[good], bb[good], cc[good])))
    faces = np.int32(np.vstack(tri))
    np.savez_compressed(cache / "canopy.npz", v=vertex, uv=uv, f=faces)
    smooth = gaussian_filter(np.where(mask, canopy, 0), 1.1)
    peaks = (maximum_filter(smooth, size=7) == smooth) & mask & (smooth > 4.0)
    iy, ix = np.where(peaks)
    order = np.argsort(-smooth[iy, ix])
    centres = []
    for k in order:
        i = iy[k]
        j = ix[k]
        x = xs[j]
        y = ys[i]
        ht = float(canopy[i, j])
        radius = min(5.8, max(2.15, ht * 0.27))
        if any(
            (x - a[0]) ** 2 + (y - a[1]) ** 2 < (radius * 0.96) ** 2 for a in centres
        ):
            continue
        c = np.median(
            rgb[max(0, i - 1) : i + 2, max(0, j - 1) : j + 2], axis=(0, 1)
        ).astype(int)
        centres.append(
            [
                round(x, 2),
                round(y, 2),
                round(float(ground[i, j]), 2),
                round(ht, 2),
                round(radius, 2),
                *[int(v) for v in c],
            ]
        )
    print(
        "Laser point files",
        len(archives),
        "canopy peaks",
        len(centres),
        "tower returns",
        sum(map(len, towercloud)),
        flush=True,
    )
    assert len(centres) > 50
    (cache / "trees.json").write_text(json.dumps(centres, separators=(",", ":")))
    cloud = np.concatenate(towercloud)
    np.save(cache / "tower-laser.npy", cloud)
    (cache / "laser-record.json").write_text(
        json.dumps(
            {
                "tiles": sorted(urls),
                "treePeaks": len(centres),
                "towerReturns": len(cloud),
                "heightRange": np.percentile(cloud[:, 2], [0, 50, 99, 100]).tolist(),
            }
        )
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]))
