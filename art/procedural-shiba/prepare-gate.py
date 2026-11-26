"""Bake the project's measured Sangedatsumon joinery to an indexed, centimetre-scale detail mesh."""
import base64
import json
from pathlib import Path
import sys
import zlib
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "art/shiba"))
from gates import PALETTE, make_gate

# The live tile supplies its surveyed centre, ridge bearing and ground elevation.
axis = np.array([[0, 0, 0], [0, -10, 21], [0, 10, 21]], dtype=float)
(verts, faces, _, materials), _ = make_gate((axis,), True, list(PALETTE))
palette = list(PALETTE.values())
plaque = list(PALETTE).index("Gate inscription")
palette[plaque] = "362b22"
pixels = np.asarray(Image.open(Path(__file__).with_name("gate-plaque.png")).convert("L")) > 113
height, width = pixels.shape
points, triangles = verts.tolist(), faces.tolist()
colours = materials.tolist()
for row, mask in enumerate(pixels):
    # Emit only continuous runs of lettering on the tablet. Its dark back is already part of the mesh.
    changes = np.flatnonzero(np.diff(np.r_[False, mask, False].astype(np.int8))).reshape(-1, 2)
    for begin, end in changes:
        u0,u1 = ((np.array([begin,end]) / width - 0.5) * 2.14).tolist()
        z0,z1 = (15.48 + (0.5 - np.array([row+1,row]) / height) * 0.78).tolist()
        first = len(points)
        points.extend([[4.169,u0,z0],[4.169,u1,z0],[4.169,u1,z1],[4.169,u0,z1]])
        triangles.extend([[first,first+1,first+2],[first,first+2,first+3]])
        colours.extend([len(palette)]*2)
palette.append("d6ba76")
unique, remap = np.unique(np.rint(np.asarray(points)*100).astype('<i2'),axis=0,return_inverse=True)
assert len(unique) < 65536
ids = remap[np.array(triangles)].astype('<u2')
keep = (ids[:,0]!=ids[:,1]) & (ids[:,1]!=ids[:,2]) & (ids[:,0]!=ids[:,2])
ids = ids[keep]
data = unique.tobytes() + ids.tobytes() + np.asarray(colours,dtype='u1')[keep].tobytes()
out = {"vertices":len(unique),"triangles":len(ids),"palette":palette,
       "deflate":base64.b64encode(zlib.compress(data,9)[2:-4]).decode()}
(root/"vendor/procedural-tokyo/src/world/sangedatsumon.json").write_text(json.dumps(out,separators=(',',':'))+'\n')
print('Gate:',len(unique),'positions,',len(ids),'triangles')
