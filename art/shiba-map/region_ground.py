"""Read the baked survey triangles in east/north/metres and sample their elevation."""
import json
import struct
import numpy as np
import shapely as sh
from pathlib import Path
from scipy.ndimage import distance_transform_edt


def surface_nodes(path, names):
    data = Path(path).read_bytes()
    end = 20 + struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:end])
    binary = memoryview(data)[end + 8:]

    def array(index):
        a = doc['accessors'][index]
        v = doc['bufferViews'][a['bufferView']]
        dtype = {5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
        cols = {'VEC3': 3, 'SCALAR': 1}[a['type']]
        offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        size = np.dtype(dtype).itemsize
        return np.ndarray((a['count'], cols), dtype, buffer=binary, offset=offset,
                          strides=(v.get('byteStride', size * cols), size))

    for node in doc['nodes']:
        if node['name'] not in names:
            continue
        for p in doc['meshes'][node['mesh']]['primitives']:
            v = array(p['attributes']['POSITION'])
            xyz = v[:, [0, 2, 1]].astype(np.float64)
            xyz[:, 1] *= -1
            triangles = xyz[array(p['indices']).reshape((-1, 3))]
            a = triangles[:, 1, :2] - triangles[:, 0, :2]
            b = triangles[:, 2, :2] - triangles[:, 0, :2]
            good = abs(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]) > 1e-6
            yield node['name'], triangles[good]


def planes(triangles):
    a, b = triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]
    n = np.cross(a, b)
    slope = -n[:, :2] / n[:, 2:3]
    origin = triangles[:, 0]
    return np.column_stack((slope, origin[:, 2] - (origin[:, :2] * slope).sum(axis=1)))


def survey_extension(layout):
    import gzip
    from scipy.spatial import cKDTree
    with gzip.open('assets/shiba-game/skyline.json.gz') as f:
        buildings = json.load(f)
    elevations = np.asarray([low/10 for low,_,_ in buildings])
    centers = np.asarray([np.mean(rings[0], axis=0)*[.1,-.1] for _,_,rings in buildings])
    survey = cKDTree(centers)
    # Extend the original 35 m ground mesh. Read its actual outside vertices to stitch the seam exactly.
    ground = next(surface_nodes('assets/shiba-horizon.glb', {'skyline-ground'}))[1]
    edge = ground.reshape(-1,3)
    seam = {(round(x),round(y)):z for x,y,z in edge if x*x+y*y>1650**2 and abs(x-round(x/35)*35)<.001 and abs(y-round(y/35)*35)<.001}
    index = sh.STRtree(sh.polygons(ground[:, :, :2]))
    xy = np.asarray([(x,y) for x in range(-1820,1820,35) for y in range(-1820,1820,35)
                     if x*x+y*y>1600**2 and not len(index.query(sh.Point(x+17.5,y+17.5),predicate='intersects'))])
    corners = np.unique((xy[:,None,:] + [[0,0],[35,0],[35,35],[0,35]]).reshape(-1,2),axis=0)
    indices = {tuple(p):i for i,p in enumerate(corners)}
    dist, ix = survey.query(corners,k=8)
    weights = 1/np.maximum(6,dist)**2
    z = (elevations[ix]*weights).sum(axis=1)/weights.sum(axis=1)-1.9
    for i,p in enumerate(corners):
        if tuple(p) in seam: z[i] = seam[tuple(p)]
    positions = np.column_stack((corners,z))
    faces = []
    for p in xy:
        a,b,c,d = [indices[tuple(p+off)] for off in [[0,0],[35,0],[35,35],[0,35]]]
        faces.extend([(a,b,c),(a,c,d)])
    return positions[np.asarray(faces)]


def ortho_frame():
    data = Path('assets/shiba-horizon.glb').read_bytes()
    end = 20 + struct.unpack_from('<I',data,12)[0]
    doc = json.loads(data[20:end])
    node = next(n for n in doc['nodes'] if n['name']=='skyline-ground')
    attrs = doc['meshes'][node['mesh']]['primitives'][0]['attributes']
    def values(key, n):
        a = doc['accessors'][attrs[key]]
        off = doc['bufferViews'][a['bufferView']].get('byteOffset',0) + a.get('byteOffset',0)
        return np.frombuffer(data, dtype='<f4', count=a['count']*n, offset=end+8+off).reshape(-1,n)[::17]
    xyz = values('POSITION',3)
    frame = np.column_stack((xyz[:,0], -xyz[:,2], np.ones(len(xyz))))
    return np.linalg.lstsq(frame, values('TEXCOORD_0',2),rcond=None)[0].T.tolist()



def height_field(layout, extension):
    # Align with the original five-metre street survey, including its diagonal breaklines.
    lo, hi, step = -1790, 1810, 5
    axis = np.arange(lo, hi + 1, step)
    n = len(axis)
    yy, xx = np.meshgrid(axis, axis, indexing='ij')
    xy = np.column_stack((xx.ravel(), yy.ravel()))
    heights = np.full(len(xy), np.nan)
    names = {'skyline-ground', 'skyline-street-asphalt', 'skyline-street-white',
             'skyline-street-sidewalk', 'skyline-street-water'}
    from itertools import chain
    for name, triangles in chain(surface_nodes('assets/shiba-horizon.glb', names), [('extension', extension)]):
        poly = sh.polygons(triangles[:, :, :2])
        index, coef = sh.STRtree(poly), planes(triangles)
        for start in range(0, len(xy), 40000):
            part = xy[start:start+40000]
            cells, tri = index.query(sh.points(part), predicate='intersects')
            z = (part[cells] * coef[tri, :2]).sum(axis=1) + coef[tri, 2]
            heights[cells + start] = z - (.14 if name.endswith('sidewalk') else 0)
    grid = layout['height']
    source = np.asarray(grid['gradeCm']).reshape((grid['h'], grid['w'])) / 100.
    core = sh.Polygon(layout['boundary']).buffer(77.8)
    inside = sh.contains_xy(core, xy[:, 0], xy[:, 1])
    ix = np.clip(((xy[inside, 0]-grid['x'])/step).astype(int), 0, grid['w']-1)
    iy = np.clip(((xy[inside, 1]-grid['y'])/step).astype(int), 0, grid['h']-1)
    heights[inside] = source[iy, ix]
    heights = heights.reshape((n, n))
    missing = ~np.isfinite(heights)
    dist, nearest = distance_transform_edt(missing, return_indices=True)
    if dist[8:-8, 8:-8].max() > 7:
        raise ValueError('Survey ground is missing more than 35 metres inside the region')
    heights[missing] = heights[tuple(nearest[:, missing])]
    return dict(x=lo, y=lo, step=step, w=n, h=n, gradeCm=np.rint(heights*100).astype(int).ravel().tolist())


def sample(grid, xy):
    xy = np.atleast_2d(xy)
    uv = (xy - [grid['x'], grid['y']]) / grid['step']
    uv = np.clip(uv, [0, 0], [grid['w']-1.001, grid['h']-1.001])
    i = uv.astype(int)
    a, b = (uv - i).T
    cm = np.asarray(grid['gradeCm'])
    n = i[:, 1]*grid['w'] + i[:, 0]
    return ((1-np.maximum(a,b))*cm[n] + np.maximum(a-b,0)*cm[n+1] +
            np.maximum(b-a,0)*cm[n+grid['w']] + np.minimum(a,b)*cm[n+grid['w']+1])/100
