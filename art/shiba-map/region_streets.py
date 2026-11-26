"""Cut mapped pavement and road markings on the actual top surface of each survey triangle."""
from collections import defaultdict
import math
import numpy as np
import shapely as sh
import mapbox_earcut
from region_ground import planes, surface_nodes

CELL = 160


def polygons(geometry):
    if geometry.is_empty: return
    if geometry.geom_type=='Polygon':
        yield geometry
    elif geometry.geom_type in ('MultiPolygon','GeometryCollection'):
        for g in geometry.geoms: yield from polygons(g)


class TileMesh:
    def __init__(self):
        self.lookup, self.xyz, self.faces = {}, [], []

    def add(self, coords, faces, plane, lift):
        z = coords @ plane[:2] + plane[2] + lift
        xyz = np.rint(np.column_stack((coords,z))*100).astype(int).tolist()
        ids = []
        for p in xyz:
            k = tuple(p)
            index = self.lookup.get(k)
            if index is None:
                index = len(self.lookup)
                self.lookup[k] = index
                self.xyz.extend(p)
            ids.append(index)
        for a,b,c in faces:
            if len({ids[a],ids[b],ids[c]})==3:
                # East/north positive winding corresponds to an upward normal in the game.
                if (coords[b,0]-coords[a,0])*(coords[c,1]-coords[a,1]) < (coords[b,1]-coords[a,1])*(coords[c,0]-coords[a,0]): b,c = c,b
                self.faces.extend((ids[a],ids[b],ids[c]))


def encode_polygon(mesh,p,plane,lift):
    if p.area<.0008: return
    rings = [np.asarray(r.coords)[:-1] for r in [p.exterior,*p.interiors]]
    xy = np.concatenate(rings)
    if len(xy)==3: faces = [(0,1,2)]
    else:
        ends = np.cumsum([len(r) for r in rings],dtype=np.uint32)
        faces = mapbox_earcut.triangulate_float64(xy, ends).reshape(-1,3)
    mesh.add(xy,faces,plane,lift)


def indexed(shapes):
    return sh.STRtree([p for p in shapes if not p.is_empty])


def union_near(index,box):
    idx = index.query(box,predicate='intersects')
    if not len(idx): return sh.Polygon()
    return sh.union_all(sh.intersection(index.geometries.take(idx),box),grid_size=.015)


def cartography(roads,areas,marks):
    asphalt,walk,paint,major,widths,ends = [],[],[],[],[],defaultdict(int)
    for line,mode,(width,kind,_,lanes) in roads:
        if mode=='road':
            for p in (line.coords[0],line.coords[-1]): ends[tuple(np.round(p,1))]+=1
            asphalt.append(line.buffer(width/2,quad_segs=3))
            if width>=6:
                walk.append(line.buffer(width/2+min(2.5,width*.15),quad_segs=3))
                major.append(line);widths.append(width)
        else:
            walk.append(line.buffer(width/2,quad_segs=2))
    avoid = indexed([sh.Point(p).buffer(5.5,quad_segs=3) for p,n in ends.items() if n>=3])
    for road,width in zip(major,widths):
        if width<8 or road.length<18: continue
        at = np.arange(7,road.length-6,12)
        if not len(at): continue
        a,b = sh.line_interpolate_point(road,at), sh.line_interpolate_point(road,at+4)
        aa,bb = sh.get_coordinates(a),sh.get_coordinates(b)
        for seg in sh.linestrings(np.stack([aa,bb],axis=1)):
            if not len(avoid.query(seg,predicate='intersects')):
                paint.append(seg.buffer(.09,cap_style='flat'))
    road_index = sh.STRtree(major)
    stamped=set()
    for xy in marks:
        point=sh.Point(xy)
        idx=road_index.nearest(point)
        if idx is None: continue
        line,w=major[idx],widths[idx]
        if line.distance(point)>1.6: continue
        t=line.project(point); pos=np.asarray(line.interpolate(t).coords[0]); key=tuple(np.floor(pos/4))
        if key in stamped:continue
        stamped.add(key)
        d=np.array(line.interpolate(min(line.length,t+.5)).coords[0])-np.array(line.interpolate(max(0,t-.5)).coords[0])
        length=np.linalg.norm(d)
        if length<.01:continue
        d/=length; n=np.array([-d[1],d[0]])
        for s in np.arange(-w/2+.45,w/2-.4,.9):
            paint.append(sh.Polygon([pos+d*a+n*b for a,b in [(-1.5,s),(1.5,s),(1.5,s+.42),(-1.5,s+.42)]]))
    return {k:indexed(p) for k,p in {'asphalt':asphalt,'walk':walk,'paint':paint,
                                     'parking':list(polygons(areas['parking']))}.items()}


def build_surfaces(domain, roads, areas, marks, extension, old):
    categories = cartography(roads,areas,marks)
    terrain = next(surface_nodes('assets/shiba-horizon.glb', {'skyline-ground'}))[1]
    terrain = np.concatenate((terrain,extension))
    planes_ = planes(terrain)
    triangles = sh.polygons(terrain[:,:,:2])
    survey = sh.STRtree(triangles)
    usable = domain.difference(old)
    xmin,ymin,xmax,ymax = domain.bounds
    tiles = []
    for x in range(math.floor(xmin/CELL)*CELL, math.ceil(xmax/CELL)*CELL, CELL):
        for z in range(math.floor(-ymax/CELL)*CELL, math.ceil(-ymin/CELL)*CELL, CELL):
            clip=sh.box(x,-z-CELL,x+CELL,-z).intersection(usable)
            if clip.area<.1: continue
            shapes={k:union_near(index,clip) for k,index in categories.items()}
            road=shapes['asphalt']
            shapes['walk']=shapes['walk'].difference(road)
            shapes['paint']=shapes['paint'].intersection(road)
            shapes['parking']=shapes['parking'].difference(road.union(shapes['walk']))
            tri_ids=survey.query(clip,predicate='intersects')
            local=triangles[tri_ids]
            for key,lift in [('asphalt',.025),('parking',.024),('walk',.055),('paint',.041)]:
                shape=shapes[key]
                if shape.is_empty: continue
                mesh=TileMesh()
                # Split complex networks before clipping. Prepare each local polygon once.
                for poly in polygons(shape):
                    overlaps=sh.intersects(local,poly)
                    matches=tri_ids[overlaps]
                    if not len(matches): continue
                    clips=sh.intersection(triangles[matches],poly)
                    for c,ti in zip(clips,matches):
                        for p in polygons(c): encode_polygon(mesh,p,planes_[ti],lift)
                if mesh.faces: tiles.append([x//CELL,z//CELL,key,mesh.xyz,mesh.faces])
    return tiles
