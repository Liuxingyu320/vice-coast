"""Rebuild the distant building outlines from Minato's 2025 CityGML building tiles."""
import argparse
import gzip
import json
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"b": "http://www.opengis.net/citygml/building/2.0", "g": "http://www.opengis.net/gml"}
GID = "{%s}id" % NS["g"]
BUILDING = "{%s}Building" % NS["b"]


def triples(element):
    numbers = iter(map(float, element.text.split()))
    return list(zip(numbers, numbers, numbers, strict=True))


def extract(building, layout):
    # The elevation of lod0RoofEdge is often zero. Take both altitudes from the solid.
    solid = building.find("b:lod1Solid", NS)
    if solid is None:
        return []
    elevations = [p[2] for coords in solid.findall(".//g:posList", NS) for p in triples(coords)]
    if not elevations or max(elevations) - min(elevations) < 1:
        return []
    polygons = building.findall("b:lod0RoofEdge//g:Polygon", NS) or building.findall("b:lod0FootPrint//g:Polygon", NS)
    if not polygons:
        polygons = [p for p in solid.findall(".//g:Polygon", NS)
                    if all(abs(v[2] - min(elevations)) < 0.15 for v in triples(p.find(".//g:posList", NS)))]
    result = []
    for polygon in polygons:
        rings = []
        for side in [*polygon.findall("g:exterior", NS), *polygon.findall("g:interior", NS)]:
            coords = side.find(".//g:posList", NS)
            if coords is None:
                continue
            ring = []
            for lat, lon, _ in triples(coords):
                point = [round((lon-layout["lon"])*layout["east"]*10), round((layout["lat"]-lat)*layout["north"]*10)]
                if not ring or ring[-1] != point:
                    ring.append(point)
            if len(ring) > 1 and ring[0] == ring[-1]:
                ring.pop()
            if len(ring) >= 3:
                rings.append(ring)
        if rings and max(abs(a) for point in rings[0] for a in point) <= 23300:
            result.append([round(min(elevations)*10), round(max(elevations)*10), rings])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directories", nargs="+", type=Path, help="Directories of *_bldg_*.gml tiles")
    parser.add_argument("--output", default="assets/shiba-game/skyline.json.gz", type=Path)
    args = parser.parse_args()
    layout = json.loads(Path("assets/shiba-layout.json").read_text())
    skip = set(layout["excludedSurveyBuildings"]) | set(layout["verifiedBuildings"].values())
    skip.add("bldg_7aff4a51-be8b-405b-abe4-ac489697cbc8")  # tower is drawn at all distances
    records, seen = [], set()
    files = sorted({p for d in args.directories for p in d.glob("*_bldg_*.gml")})
    if not files:
        parser.error("No building tiles found in the supplied directories")
    for p in files:
        # Discard each finished cityObjectMember and its textures before reading the next.
        events = ET.iterparse(p, events=("start", "end"))
        _, root = next(events)
        for event, node in events:
            if event != "end":
                continue
            if node.tag == BUILDING:
                key = node.get(GID)
                if key not in seen and key not in skip:
                    records.extend(extract(node, layout))
                    seen.add(key)
            if node.tag.endswith("}cityObjectMember") or node.tag.endswith("}appearanceMember"):
                node.clear()
                root.clear()
    if not records:
        raise ValueError("No buildings inside the district extent")
    with args.output.open("wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as out:
        out.write(json.dumps(records, separators=(",", ":")).encode())
    print(f"{len(records):,} surveyed building outlines from {len(files)} tiles")


if __name__ == "__main__":
    main()
