"""Match individual lower-detail buildings to the measured façade meshes and the street plane."""
import gzip
import json
import numpy as np
import shapely as sh
from region_ground import surface_nodes, sample


def building_selection(domain, layout, grid):
    with gzip.open('assets/shiba-game/skyline.json.gz') as src:
        rows = json.load(src)
    polygons = np.array([sh.Polygon(np.asarray(rings[0])*[.1,-.1],
                                    [np.asarray(r)*[.1,-.1] for r in rings[1:]])
                         for _,_,rings in rows],dtype=object)
    idx = sh.STRtree(polygons)
    peaks = np.asarray([hi/10 for _,hi,_ in rows])
    matched = np.zeros(len(rows),dtype=bool)
    for source,names in [('park',{'Survey buildings'}),('horizon',{'surveyed-skyline','skyline-photofacades'})]:
        for _,tri in surface_nodes('assets/shiba-'+source+'.glb',names):
            n = np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
            roof = tri[abs(n[:,2])>np.maximum(1, np.linalg.norm(n[:,:2],axis=1))]
            centers = roof.mean(axis=1)
            part, target = idx.query(sh.points(centers[:,:2]), predicate='within')
            same = abs(peaks[target]-centers[part,2])<3.5
            matched[target[same]]=True
    # Keep the fine survey's individual gate pillars and passages throughout the temple/tower core.
    centers = sh.get_coordinates(sh.point_on_surface(polygons))
    feet = np.array([lo/10 for lo,_,_ in rows])
    outside = ~sh.intersects_xy(sh.Polygon(layout['boundary']).buffer(2), centers[:,0], centers[:,1])
    reachable = sh.intersects(polygons,domain) & outside & (feet-sample(grid,centers)<7)
    return np.flatnonzero(matched).tolist(), np.flatnonzero(reachable).tolist()
