"""Read public park boundaries and outdoor parking surfaces from a local OSM XML extract."""
import argparse
import json
from pathlib import Path
from xml.etree import ElementTree as ET


def land_kind(tags):
    if tags.get("leisure") in ("park", "garden") or tags.get("landuse") == "grass":
        return "park"
    if tags.get("amenity") == "parking" and tags.get("parking", "surface") in ("surface", "street_side"):
        if tags.get("covered") != "yes" and tags.get("location") not in ("underground", "roof") and "building" not in tags:
            return "parking"
    return None


def join_rings(parts):
    pending = [p.copy() for p in parts if len(p) >= 2]
    rings = []
    while pending:
        ring = pending.pop()
        while ring[-1] != ring[0]:
            for i, part in enumerate(pending):
                if part[0] == ring[-1] or part[-1] == ring[-1]:
                    if part[-1] == ring[-1]:
                        part.reverse()
                    ring.extend(part[1:])
                    pending.pop(i)
                    break
            else:
                break
        if len(ring) >= 4 and ring[-1] == ring[0]:
            rings.append(ring[:-1])
    return rings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    doc = ET.parse(args.source).getroot()
    layout = json.loads(Path("assets/shiba-layout.json").read_text())
    nodes = {n.get("id"): [round((float(n.get("lon"))-layout["lon"])*layout["east"], 2),
                           round((float(n.get("lat"))-layout["lat"])*layout["north"], 2)] for n in doc.findall("node")}
    ways = {w.get("id"): [n.get("ref") for n in w.findall("nd")] for w in doc.findall("way")}
    shapes = []
    for element in [*doc.findall("way"), *doc.findall("relation")]:
        tags = {t.get("k"): t.get("v") for t in element.findall("tag")}
        kind = land_kind(tags)
        if not kind:
            continue
        if element.tag == "way":
            rings = join_rings([ways[element.get("id")]])
        else:
            rings = []
            for role in ("outer", "inner"):
                rings += join_rings([ways.get(m.get("ref"), []) for m in element.findall("member") if m.get("role") == role])
        polygons = [[nodes[k] for k in ring] for ring in rings if all(k in nodes for k in ring)]
        if polygons:
            shapes.append({"kind": kind, "rings": polygons})
    Path("assets/shiba-game/land.json").write_text(json.dumps(shapes, separators=(",", ":"))+"\n")
    print(f"{len(shapes)} open-space and parking boundaries")


if __name__ == "__main__":
    main()
