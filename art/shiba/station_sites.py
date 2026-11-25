"""Fit public street entrances to the OSM mouth, approach and the measured shelter footprint."""

import xml.etree.ElementTree as ET
import numpy as np


DAIMON_A6 = "bldg_5d373872-ec43-42b5-bb15-6488d60629a4"
SHIBA_A3 = "bldg_82cf50d2-cce9-4c2e-8c62-5deccfb164e2"
BASIN = "bldg_bfa552b9-de15-46b6-b9e9-92c27f1fb74a"
TOWER = "bldg_7aff4a51-be8b-405b-abe4-ac489697cbc8"


def bounds_rect(origin, direction, x0, x1, y0, y1):
    from shapely import Polygon

    n = np.asarray(direction)
    t = np.array([-n[1], n[0]])
    return Polygon(
        [
            np.asarray(origin) + t * x + n * y
            for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        ]
    )


def station_envelope(station, clearance=0):
    half = station["width"] / 2 + 0.21
    return bounds_rect(
        station["mouth"], station["down"], -half, half, -0.25, station["length"] + 0.18
    ).buffer(clearance)


def station_sites(cache, data):
    from shapely import Polygon
    from shiba_site import en

    osm = ET.parse(cache / "streets.osm")
    nodes = {
        n.get("id"): np.array(en(float(n.get("lat")), float(n.get("lon"))))
        for n in osm.iterfind("node")
    }
    buildings = {
        f["id"]: Polygon(f["rings"][0], f["rings"][1:]).buffer(0)
        for f in data["footprints"]
    }
    rows = []
    for name, code, node, down, shell in [
        ("大門", "A6", "1668435668", "6279194289", DAIMON_A6),
        ("芝公園", "A3", "1482491130", "6233834714", SHIBA_A3),
        ("芝公園", "A4", "2144966342", "6233834715", None),
    ]:
        p = nodes[node]
        n = nodes[down] - p
        n /= np.linalg.norm(n)
        if shell:
            outline = buildings[shell].minimum_rotated_rectangle
            xy = np.array(outline.exterior.coords)[:4]
            edge = np.roll(xy, -1, axis=0) - xy
            nfit = edge[np.argmax(np.linalg.norm(edge, axis=1))]
            nfit /= np.linalg.norm(nfit)
            if nfit @ n < 0:
                nfit = -nfit
            n = nfit
            t = np.array([-n[1], n[0]])
            length = np.ptp(xy @ n)
            width = np.ptp(xy @ t)
            mouth = xy.mean(0) - n * (length / 2 - 0.20)
        else:
            length, width = 7.8, 2.55
            mouth = p
        usable = min(2.38, width - 0.42)
        hole = bounds_rect(mouth, n, -usable / 2, usable / 2, 0.08, length - 0.54)
        rows.append(
            dict(
                station=name,
                exit=code,
                osm=node,
                source=p.round(5).tolist(),
                mouth=mouth.round(5).tolist(),
                down=n.round(8).tolist(),
                width=round(float(width), 5),
                length=round(float(length), 5),
                shell=shell,
                well=np.asarray(hole.exterior.coords)[:-1].round(6).tolist(),
            )
        )
    return rows
