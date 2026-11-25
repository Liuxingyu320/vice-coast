"""GSI water-area polygons in the project's metre frame, with independently drivable road decks."""

import json, sys
from pathlib import Path
from urllib.request import urlopen
import numpy as np
import shapely as sh
from shapely import Polygon, box
from shapely.geometry import shape
from shapely.ops import transform
from shiba_site import geo
from grade import sample


def water_plan(cache, data, region):
    import mapbox_vector_tile

    folder = cache / "water-tiles"
    folder.mkdir(exist_ok=True)
    N = 65536

    def tile(x, y):
        lat, lon = geo(x, y)
        return int((lon + 180) / 360 * N), int(
            (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) * N / 2
        )

    x0, y0, x1, y1 = region.bounds
    west, north = tile(x0, y1)
    east, south = tile(x1, y0)
    polygons = []
    for X in range(west, east + 1):
        for Y in range(north, south + 1):
            path = folder / f"{X}-{Y}.pbf"
            if not path.exists():
                url = f"https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/16/{X}/{Y}.pbf"
                with urlopen(url, timeout=24) as src:
                    path.write_bytes(src.read())
            layer = mapbox_vector_tile.decode(
                path.read_bytes(), default_options={"y_coord_down": True}
            ).get("waterarea")
            if not layer:
                continue
            size = layer["extent"]

            def world(x, y, z=None):
                lon = (X + np.asarray(x) / size) / N * 360 - 180
                lat = np.degrees(
                    np.arctan(np.sinh(np.pi * (1 - 2 * (Y + np.asarray(y) / size) / N)))
                )
                return (lon - data["lon"]) * data["east"], (lat - data["lat"]) * data[
                    "north"
                ]

            tilebox = transform(world, box(0, 0, size, size))
            # Tile padding is deliberately removed before union.
            for f in layer["features"]:
                p = transform(world, shape(f["geometry"])).intersection(tilebox)
                if p.intersects(region):
                    polygons.append(p)
    wet = sh.union_all(polygons).intersection(region)
    return sh.union_all(
        [p for p in sh.get_parts(wet) if p.geom_type == "Polygon" and p.area > 3]
    )


if __name__ == "__main__":
    data = json.loads(
        (Path(__file__).resolve().parents[2] / "assets/shiba-layout.json").read_text()
    )
    cache = Path(sys.argv[1])
    p = water_plan(cache, data, Polygon(data["boundary"]))
    print(
        [
            (
                round(q.area),
                np.round(q.centroid.coords[0], 1).tolist(),
                round(
                    sample(
                        data["height"],
                        np.array(q.representative_point().coords),
                        raw=True,
                    )[0],
                    2,
                ),
            )
            for q in sh.get_parts(p)
        ]
    )
