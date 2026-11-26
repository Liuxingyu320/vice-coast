"""Build the walkable Minato district from the original survey meshes and local OSM map extracts."""
import argparse
import gzip
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import shapely as sh
from shapely.ops import polygonize
from region_ground import height_field, survey_extension, ortho_frame
from region_streets import build_surfaces
from region_buildings import building_selection

MAJOR = {'trunk', 'primary', 'secondary', 'tertiary'}
DRIVE = MAJOR | {t+'_link' for t in MAJOR} | {'residential', 'service', 'unclassified', 'living_street'}
PATH = {'footway', 'cycleway', 'pedestrian', 'path', 'steps'}
WIDTH = {'trunk': 12, 'primary': 12, 'secondary': 9, 'tertiary': 7, 'residential': 4.8,
         'service': 3.4, 'footway': 1.7, 'path': 1.6, 'pedestrian': 3, 'cycleway': 2.1, 'steps': 1.7}
ROOT = Path('assets/shiba-game')


def parts(shape, kind):
    if shape.is_empty:
        return
    if shape.geom_type == kind:
        yield shape
    elif shape.geom_type.startswith('Multi') or shape.geom_type == 'GeometryCollection':
        for g in shape.geoms:
            yield from parts(g, kind)


def rings(shape):
    return [np.round(np.asarray(r.coords)[:-1], 2).tolist() for r in [shape.exterior, *shape.interiors]]


def save(path, value):
    with open(path, 'wb') as f, gzip.GzipFile(filename='', mode='wb', fileobj=f, mtime=0, compresslevel=7) as z:
        z.write(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode())


def entities(folder, layout):
    nodes, ways, relations, crossings = {}, {}, {}, {}
    for p in sorted([*folder.glob('*.osm'), *folder.glob('*.osm.gz')]):
        with (gzip.open(p) if p.suffix == '.gz' else p.open('rb')) as f:
            root = ET.parse(f).getroot()
        for e in root:
            id_ = e.get('id')
            tags = {t.get('k'): t.get('v') for t in e.findall('tag')}
            if e.tag == 'node':
                nodes[id_] = ((float(e.get('lon'))-layout['lon'])*layout['east'],
                              (float(e.get('lat'))-layout['lat'])*layout['north'])
                if tags.get('highway') == 'crossing' and tags.get('crossing') != 'unmarked':
                    crossings[id_] = nodes[id_]
            elif e.tag == 'way':
                ways[id_] = ([n.get('ref') for n in e.findall('nd')], tags)
            elif e.tag == 'relation' and tags.get('type') == 'multipolygon':
                relations[id_] = ([(m.get('ref'), m.get('role')) for m in e.findall('member') if m.get('type')=='way'], tags)
    if not ways:
        raise ValueError('Supply regional *.osm or *.osm.gz extracts')
    lines = {k: sh.LineString([nodes[n] for n in refs]) for k,(refs,_) in ways.items()
             if len(refs) >= 2 and all(n in nodes for n in refs)}
    return ways, relations, lines, crossings


def land_kind(t):
    if t.get('natural') == 'water' or t.get('waterway') == 'riverbank': return 'water'
    if t.get('amenity') == 'parking' and t.get('parking','surface') == 'surface': return 'parking'
    if t.get('leisure') in ('park','garden') or t.get('landuse') in ('grass','village_green'): return 'park'


def district_limit(ways, lines):
    # The aerial terrain has a continuous surface here. Follow the surveyed waterfront on the east.
    extent = sh.box(-1715,-1715,1740,1740).buffer(35, quad_segs=5)
    shores = [line for i,line in lines.items() if ways[i][1].get('natural')=='coastline']
    pieces = list(polygonize(sh.union_all([extent.boundary, *(s.intersection(extent) for s in shores)])))
    tower = sh.Point(0,0)
    land = next(p for p in pieces if p.covers(tower))
    if len(pieces)<2 or not 11e6 < land.area < 12.5e6:
        raise ValueError('Incomplete land/coast coverage')
    return sh.orient_polygons(land.simplify(.12, preserve_topology=True))


def public_road(tags):
    k = tags.get('highway')
    if k not in DRIVE | PATH or tags.get('area')=='yes' or tags.get('indoor')=='yes':
        return
    if tags.get('access') in {'private','no'} or tags.get('tunnel','no') not in ('no','building_passage'):
        return
    if tags.get('location') in {'underground','indoor'}: return
    m = re.search(r'-?\d+', tags.get('layer','0'))
    layer = int(m.group()) if m else 0
    if layer < 0 or layer > 1: return
    bridge = tags.get('bridge','no') != 'no'
    if layer > 0 and not bridge: return
    drive = k in DRIVE and tags.get('motor_vehicle', tags.get('vehicle','yes')) not in ('private','no')
    lanes = re.match(r'\d+', tags.get('lanes',''))
    width = re.match(r'\s*(\d+(?:\.\d+)?)\s*(?:m\s*)?$', tags.get('width',''))
    w = float(width.group(1)) if width else max(WIDTH.get(k,5.2), int(lanes.group())*2.85 if lanes else 0)
    w = round(np.clip(w, 1.1, 28), 1)
    return 'road' if drive else 'path', [w,k,tags.get('oneway','no'),int(lanes.group()) if lanes else (2 if drive and w>=6.2 else 1)], bridge


def inventory(folder, layout):
    ways,rels,lines,crossings = entities(folder,layout)
    domain = district_limit(ways, lines)
    core = sh.Polygon(layout['boundary'])
    old = sh.Polygon(json.loads(Path('assets/shiba-solids.json').read_text())['travelBoundary'])
    areas = {'park':[], 'parking':[], 'water':[]}
    members = set()
    for refs,tags in rels.values():
        kind = land_kind(tags)
        if not kind: continue
        outer = list(polygonize([lines[i] for i,r in refs if r!='inner' and i in lines]))
        holes = list(polygonize([lines[i] for i,r in refs if r=='inner' and i in lines]))
        if not outer: continue
        areas[kind].append(sh.union_all(outer).difference(sh.union_all(holes)))
        members.update(i for i,_ in refs)
    roads, raw_bridges = [], []
    for id_,line in lines.items():
        refs,t = ways[id_]
        kind = land_kind(t)
        if kind and id_ not in members and line.is_ring:
            areas[kind].append(sh.make_valid(sh.Polygon(line)))
        info = public_road(t)
        if not info: continue
        mode,spec,bridge = info
        for section in parts(line.intersection(domain), 'LineString'):
            if section.length<.4: continue
            if bridge:
                raw_bridges.append((section,mode,spec))
            else:
                roads.append((section,mode,spec))
    areas = {kind:sh.union_all([p.intersection(domain) for p in geometries if p.intersects(domain)])
             for kind,geometries in areas.items()}
    water = areas['water']
    bridges = []
    for line,mode,spec in raw_bridges:
        # Only model surface routes crossing measured water. Elevated expressways and footbridges retain their own levels.
        if water.is_empty or not line.intersects(water.buffer(4)): continue
        bridges.append((line,spec[0]))
        roads.append((line,mode,spec))
    outer_roads = []
    # The original game already carries every surveyed street inside its core. Rejoin at its actual endpoints.
    for line,mode,spec in roads:
        for seg in parts(line.difference(core), 'LineString'):
            if seg.length>.45:
                outer_roads.append([mode,np.round(seg.coords,2).tolist(),spec])
    land = []
    for kind,geom in areas.items():
        # Lots and vegetation also drive the radar. Preserve the surveyed riverbanks in the fine core.
        protected = old if kind=='water' else core
        for p in parts(geom.difference(protected), 'Polygon'):
            if p.area>1:
                land.append({'kind':kind,'rings':rings(p.simplify(.10, preserve_topology=True))})
    water_crossings = []
    for line,width in bridges:
        # Include bank approaches and the full collision hull up to the public road width.
        for s in parts(line.intersection(water.buffer(9)).difference(old), 'LineString'):
            if s.length>1:
                water_crossings.append([np.round(s.segmentize(5).coords,2).tolist(),width])
    public_marks = [p for p in crossings.values() if domain.covers(sh.Point(p))]
    return domain, roads, outer_roads, land, areas, public_marks, water_crossings


def street_trees(folder,layout,domain,old,roads,grid):
    from region_ground import sample
    from scipy.spatial import cKDTree
    records = {}
    for p in sorted([*folder.glob('*.osm'),*folder.glob('*.osm.gz')]):
        with (gzip.open(p) if p.suffix=='.gz' else p.open('rb')) as f:
            for element in ET.parse(f).getroot().iterfind('node'):
                tags={t.get('k'):t.get('v') for t in element.findall('tag')}
                if tags.get('natural')!='tree': continue
                x=(float(element.get('lon'))-layout['lon'])*layout['east']
                y=(float(element.get('lat'))-layout['lat'])*layout['north']
                if not domain.contains(sh.Point(x,y)) or old.covers(sh.Point(x,y)): continue
                key=int(element.get('id'))
                def metres(field,default):
                    match=re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*m?\s*',tags.get(field,''))
                    return float(match.group(1)) if match else default
                h=np.clip(metres('height',5.5+(key%37)/12),2,22)
                radius=np.clip(metres('diameter_crown',h*.65)/2,.8,7)
                records[key]=[x,y,h,radius]
    if not records: return []
    street=sh.STRtree([line.buffer(max(.3,info[0]/2-.55),quad_segs=2) for line,kind,info in roads if kind=='road'])
    original=cKDTree(np.asarray(layout['trees'])[:,:2])
    rows=np.array([records[k] for k in sorted(records)])
    heights=sample(grid,rows[:,:2]);separations=original.query(rows[:,:2])[0]
    return [[round(x,2),round(y,2),round(z,2),round(h,2),round(r,2)] for (x,y,h,r),z,d in zip(rows,heights,separations)
            if d>2.5 and not len(street.query(sh.Point(x,y),predicate='intersects'))]



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('extracts', type=Path, help='Adjacent OSM API map extracts covering 1,820 metres in each direction from Tokyo Tower')
    args = parser.parse_args()
    layout = json.loads(Path('assets/shiba-layout.json').read_text())
    domain, roads, extensions, land, areas, marks, bridges = inventory(args.extracts,layout)
    extension = survey_extension(layout)
    grid = height_field(layout, extension)
    old = sh.Polygon(json.loads(Path("assets/shiba-solids.json").read_text())["travelBoundary"])
    detailed, walls = building_selection(domain, layout, grid)
    trees = street_trees(args.extracts,layout,domain,old,roads,grid)
    surface_tiles = build_surfaces(domain, roads, areas, marks, extension, old)
    region = dict(boundary=rings(domain)[0], areaM2=round(domain.area), height=grid,
                  streets=extensions, land=land, bridges=bridges, detailedBuildings=detailed, solidBuildings=walls, trees=trees,
                  groundFill=np.rint(extension*100).astype(int).reshape(-1,9).tolist(), orthoUV=ortho_frame())
    save(ROOT/'region.json.gz', region)
    save(ROOT/'region-streets.json.gz', surface_tiles)
    print(f'{domain.area/1e6:.3f} km², {len(extensions)} street and path sections, {len(surface_tiles)} pavement tiles, {len(bridges)} bridge approaches')


if __name__ == '__main__':
    main()
