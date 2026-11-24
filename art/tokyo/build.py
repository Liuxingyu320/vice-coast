"""Run inside Blender. Model coordinates are game X, elevation, game Z in metres."""
import bpy
import json
import math
import random
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
ASSETS=ROOT/'assets'
TEX=HERE/'textures'
rng=random.Random(8241)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=18
scene.cycles.use_denoising=True
scene.cycles.max_bounces=4
scene.unit_settings.system='METRIC'
scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('Tokyo • evening sky')
scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.16,.235,.36,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.7
tiles=json.loads((TEX/'tiles.json').read_text())

def xyz(p): return (p[0],-p[2],p[1])

@lru_cache()
def color(hexcode):
    c=hexcode.strip('#')
    srgb=[int(c[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(a/12.92 if a<=.04045 else ((a+.055)/1.055)**2.4 for a in srgb)+(1,)

mats={}
def material(name,tint=None,texture=None,emission=None,power=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    n=m.node_tree.nodes;link=m.node_tree.links.new
    bs=n.get('Principled BSDF');bs.inputs['Roughness'].default_value=.64
    def image(name):
        tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(TEX/name),check_existing=True)
        return tex.outputs['Color']
    if tint is None and texture is None:
        vc=n.new('ShaderNodeVertexColor');vc.layer_name='Paint'
        link(vc.outputs['Color'],bs.inputs['Base Color'])
    elif texture:link(image(texture),bs.inputs['Base Color'])
    else:bs.inputs['Base Color'].default_value=color(tint);m.diffuse_color=color(tint)
    if power:
        if emission:link(image(emission),bs.inputs['Emission Color'])
        else:bs.inputs['Emission Color'].default_value=color(tint)
        bs.inputs['Emission Strength'].default_value=power
    mats[name]=m
material('Paint')
material('Tower vermilion','d9522f',power=.55)
material('Tower ivory','eed6b6',power=.38)
material('Print',texture='signs.png',emission='signs.png',power=.68)
for i in range(4):material('Bay'+str(i),texture=f'bays{i}.png',emission=f'lights{i}.png',power=.58)
for k,c,p in [('Honey','ffbe66',1.6),('Paper','ffe5aa',1.4),('Jade','85d9ba',1.8),('Brake','ff4b35',2.3),('Ice','a2d7ef',1.3)]:
    material(k,c,power=p)

class Part:
    def __init__(self,name,collection,sector):
        self.name=name;self.collection=collection;self.sector=sector
        self.v=[];self.faces=[];self.colors=[];self.uv=[];self.m=[]
    def poly(self,points,indices,paint,mat='Paint',uv=None):
        base=len(self.v);self.v.extend(xyz(p) for p in points)
        for f in indices:
            self.faces.append(tuple(base+i for i in f));self.colors.append(paint);self.m.append(mat)
            self.uv.append(uv or ((0,0),)*len(f))
    def quad(self,p,paint,mat='Paint',uv=None):self.poly(p,[(0,1,2,3)],paint,mat,uv)
    def box(self,x,h,z,w,ht,d,c,mat='Paint'):
        v=[(x+i*w/2,h+j*ht/2,z+k*d/2) for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
        self.poly(v,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],c,mat)
    def rod(self,a,b,r,c,mat='Paint',sides=7,top=None):
        # Construct the section in Blender's right-handed coordinate frame.
        av,bv=Vector(xyz(a)),Vector(xyz(b));axis=(bv-av).normalized()
        u=axis.cross(Vector((0,0,1)) if abs(axis.z)<.91 else Vector((0,1,0))).normalized()
        v=axis.cross(u);base=len(self.v)
        for pt,rad in [(av,r),(bv,r if top is None else top)]:
            for i in range(sides):
                ang=i*math.tau/sides;self.v.append(tuple(pt+rad*(u*math.cos(ang)+v*math.sin(ang))))
        fs=[tuple(reversed(range(sides))),tuple(range(sides,sides*2))]
        fs.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
        for f in fs:self.faces.append(tuple(base+i for i in f));self.colors.append(c);self.m.append(mat);self.uv.append(((0,0),)*len(f))
    def panel(self,x,h,z,w,ht,face,tile=None,facade=None,repeat=(1,1)):
        # U increases to the viewer's right for each outward-facing elevation.
        dx,dz={'E':(0,-1),'W':(0,1),'S':(1,0),'N':(-1,0)}[face]
        coords=[(x+dx*w*i,h+ht*j,z+dz*w*i) for i,j in [(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)]]
        if tile:
            tx,ty,tw,th=tiles[tile]
            u0,u1=(tx+1)/2048,(tx+tw-1)/2048;v0,v1=1-(ty+th-1)/2048,1-(ty+1)/2048
        else:u0,v0=0,0;u1,v1=repeat
        self.quad(coords,'ffffff','Print' if tile else 'Bay'+str(facade),[(u0,v0),(u1,v0),(u1,v1),(u0,v1)])
    def merge(self,part):
        off=len(self.v);self.v.extend(part.v)
        self.faces.extend(tuple(i+off for i in f) for f in part.faces)
        self.colors.extend(part.colors);self.m.extend(part.m);self.uv.extend(part.uv)
    def emit(self,coll):
        me=bpy.data.meshes.new(self.name);me.from_pydata(self.v,[],self.faces);me.update()
        ob=bpy.data.objects.new(self.name,me);coll.objects.link(ob)
        used=list(dict.fromkeys(self.m))
        for m in used:me.materials.append(mats[m])
        me.polygons.foreach_set('material_index',[used.index(m) for m in self.m])
        vc=me.color_attributes.new(name='Paint',type='BYTE_COLOR',domain='POINT')
        # Positions are shared only inside a primitive, whose paint is uniform.
        rgba=bytearray((255,255,255,255))*len(self.v)
        for f,c in zip(self.faces,self.colors):
            if c=='ffffff':continue
            cr=bytes.fromhex(c+'ff')
            for i in f:rgba[i*4:i*4+4]=cr
        vc.data.foreach_set('color_srgb',[c/255 for c in rgba])
        uv=me.uv_layers.new(name='Artwork')
        uv.data.foreach_set('uv',[v for face in self.uv for pair in face for v in pair])
        return ob

parts=[];bounds=[];prints=[]
def part(name,group,sector):
    p=Part(name,group,sector);parts.append(p);return p
def coll(x,z,w,d,foot=False):
    bounds.append(dict(x=x,z=z,w=w/2,d=d/2))
    if foot:prints.append(dict(x=x,z=z,w=w,d=d))
def board(p,x,h,z,w,ht,face,tile):
    ew=face in 'EW';p.box(x,h,z,.19 if ew else w+.16,ht+.17,w+.16 if ew else .19,'344049')
    dx,dz={'E':(.103,0),'W':(-.103,0),'S':(0,.103),'N':(0,-.103)}[face]
    p.panel(x+dx,h,z+dz,w,ht,face,tile)
def bracket(p,x,h,z,w,ht,tile):
    p.box(x+.9,h,z,1.85,.16,.21,'45474a');board(p,x+1.24,h,z,w,ht,'S',tile)
    p.panel(x+1.24,h,z-.104,w,ht,'N',tile)
def vending(p,x,z,idx=0):
    c=['b03936','186779','c9c5ad'][idx]
    p.box(x,1.13,z,.92,2.03,1.27,c);p.panel(x+.466,1.14,z,1.19,1.89,'E','vend'+str(idx))
    p.box(x,.16,z,1.04,.15,1.36,'54534e')
    coll(x,z,1.04,1.36)

wall=['b3a38c','869193','ba8e75','71818a'];trim=['ded0b5','435560','e3baa1','4c6470']
def building(ix,iz,x,z,w,d,h,style,index,kind):
    sector='Blocks %s %s'%(ix//2,iz//2)
    p=part(f'{kind} • {ix}{iz}-{index}',kind,sector)
    b=p.box;c=wall[style];cap=trim[style]
    b(x,h/2+.15,z,w,h,d,c);coll(x,z,w,d,True)
    b(x,h+.19,z,w+.32,.26,d+.32,cap)
    # The rooftop is recessed between four parapets.
    for a in [-1,1]:
        b(x+a*(w/2-.12),h+.52,z,.24,.62,d,cap);b(x,h+.52,z+a*(d/2-.12),w,.62,.24,cap)
    floors=max(1,round((h-3.5)/3.1))
    for face,px,pz,span in [('E',x+w/2+.011,z,d),('W',x-w/2-.011,z,d),('S',x,z+d/2+.011,w),('N',x,z-d/2-.011,w)]:
        p.panel(px,(h+3.5)/2,pz,span-.7,h-3.5,face,facade=style,repeat=(max(1,round(span/6)),floors/2))
    b(x-w*.19,h+1.22,z+d*.12,w*.39,1.9,d*.33,'78817e')
    for j in range(2):
        rx=x+w*.22;rz=z+(j-.5)*2.45
        b(rx,h+.7,rz,2.0,1.02,1.7,'abae9f')
        for l in range(3):b(rx,h+1.23,rz-.5+l*.48,1.7,.04,.12,'5b6869')
    east=x+w/2
    shop=(index+ix*3+iz*2)%12
    if ix==4 and index==0 and iz==4:shop=8
    facade=east+.045
    # Recessed timber storefront, lit glass, transoms and fabric eave.
    b(facade,1.69,z,.12,2.93,d-.62,'364548')
    for j in range(5):
        zz=z+(j-2)*(d-.9)/5
        b(facade+.075,1.59,zz,.11,1.99,(d-.9)/5-.16,['a59070','809b98','dcaa71'][j%3])
        b(facade+.15,1.53,zz,.08,2.06,.095,'39464c')
    b(east+.46,3.18,z,1.12,.18,d+.21,cap)
    board(p,east+.13,3.83,z,d*.81,1.03,'E','s'+str(shop))
    if ix>=3 or index%2==0:
        bracket(p,east,h*.58,z+d*.37,1.04,min(5.8,h*.5),'v'+str(shop%8))
    if kind=='Shitamachi':
        # Low ridge and broad projecting eaves.
        ridge=h+2.25
        for s in [-1,1]:
            verts=[(x-w*.53,h+.56,z+s*d*.54),(x+w*.53,h+.56,z+s*d*.54),(x+w*.53,ridge,z),(x-w*.53,ridge,z)]
            p.quad(verts if s==1 else list(reversed(verts)),'4c555b')
        b(x,ridge,z,w*1.08,.23,.29,'344854')
        for j in range(5):b(east+.31,2.09,z-d*.38+j*d*.06,.1,1.65,.08,'6b5041')
    elif kind=='Office district':
        for j in [-1,0,1]:b(x+j*w*.36,h*.54,z+d/2+.09,.25,h*.89,.28,cap)
        b(x,h+2,z,w*.55,3.8,d*.57,'546874')
    elif ix==4:
        for f in range(1,min(5,floors)):
            y=3.7+f*3
            b(east+.47,y,z,.94,.16,d*.84,'cbbeaa');b(east+.9,y+.48,z,.09,.68,d*.84,'82918b')
            for dz in [-.37,0,.37]:b(east+.92,y+.54,z+dz*d,.12,.9,.12,'4f5a5d')
    if ix>=3 and (index%2==0 or ix==4):
        tile='p'+str((index+iz+ix)%4);pw=min(w*.75,8);ph=pw*1.13
        for xx in [-1,1]:b(x+xx*pw*.37,h+ph*.29,z+d*.31,.19,ph*.64,.22,'44515a')
        board(p,x,h+ph*.57+.7,z+d*.31,pw,ph,'S',tile)
        if ix==4:
            pw=min(d*.55,8.4);board(p,east+.18,h*.73,z-d*.17,pw,min(h*.46,8.2),'E',tile)
    if ix==4:vending(p,east+.87,z-d*.34,(iz+index)%3)

for ix in range(5):
    for iz in range(6):
        cx=-200+ix*80;cz=-200+iz*80
        if ix==3 and iz==1 or ix==2 and iz==3:continue
        if ix==4:
            for j in range(2):
                z=cz+(-13.5 if j==0 else 14)
                if iz==3 and j==0:z=31
                if not(iz==3 and j==1):
                    building(ix,iz,132.7,z,20.5,17.8,rng.choice([10.2,13.3,16.4,19.5]),(iz+j)%4,j,'Bay shopping street')
                if iz==1:continue
                building(ix,iz,103,z,13.3,15,10.1+3.1*((j+iz)%4),(iz+j+2)%4,j+2,'Bay shopping street')
        else:
            for j in range(2):
                for k in range(2):
                    x=cx+(13.6 if j else -13.6);z=cz+(13.4 if k else -13.4)
                    if iz==3 and k==0:z+=4
                    kind='Shitamachi' if ix<2 else 'Office district' if iz<3 else 'Residential'
                    h=(4.7+rng.choice([0,3,3,6]) if kind=='Shitamachi' else rng.uniform(19,47) if kind=='Office district' else rng.choice([10,13,16,22]))
                    building(ix,iz,x,z,rng.uniform(15,20),rng.uniform(13.5,18),h,(ix+iz+j+k)%4,j*2+k,kind)

# Namioto occupies the playable record shop. Its first floor is furnished by the game.
shop=part('Namioto • upstairs listening rooms','Bay shopping street','Shop')
b=shop.box
b(133,10.0,54,19.54,4.1,19.2,'a68874')
for face,x,z,span in [('E',142.79,54,18.8),('S',133,63.62,19),('N',133,44.38,19),('W',123.21,54,18.8)]:
    shop.panel(x,10,z,span,3.58,face,facade=0,repeat=(3,1))
b(133,12.14,54,20,.34,19.7,'cebba1');b(133,12.42,54,19.6,.25,19.2,'576765')
# Rooftop record sleeve, a pressed vinyl sign, and a projecting blade.
for zz in [50.1,56.1]:b(141.9,14.6,zz,.22,4.8,.22,'455358')
board(shop,142.02,16.01,53.1,7.6,7.7,'E','p0')
board(shop,134,15.4,61.9,8.6,6.8,'S','p0')
for xx in [131,137]:b(xx,13.2,61.9,.25,2.5,.25,'516062')
bracket(shop,143.05,7.3,62.35,1.38,5.9,'v0')
board(shop,143.89,4.77,54,9.65,1.19,'E','s0')
vending(shop,143.95,44.58,0)
for i in range(4):
    z=45.2+i*1.38
    shop.rod((144.12,3.25,z),(144.12,2.78,z),.022,'58483e')
    shop.rod((144.12,2.56,z),(144.12,2.83,z),.22,'fab466','Honey',12,top=.18)
    shop.box(144.12,2.52,z,.28,.06,.28,'83493b')
shopref=part('Namioto • walk-in lower store','Render set','Reference')
b=shopref.box
b(133,5.98,54,20,3.9,20,'bc977d')
for zz in (44.2,63.8):b(133,2.1,zz,20,4.16,.35,'aa8978')
b(123.2,2.1,54,.38,4.2,20,'a38875');b(133,4.19,54,20.5,.25,20.4,'dbbea0')
for ix in range(6):
    zz=45.75+ix*3.24;b(143.07,6.04,zz,.14,1.65,1.75,'536c74')
for i in range(20):b(143.66,3.38,44.5+i,2.3,.18,.99,'d3bf9b' if i%2==0 else '934b44')
for zz in [47.9,60.1]:
    b(143,1.72,zz,.12,2.85,7.0,'657e78');b(143.1,.55,zz,.2,.7,7.1,'3f5a59')
    for dz in [-2.86,0,2.86]:b(143.11,1.83,zz+dz,.19,2.75,.12,'594f47')
for j in range(4):
    b(139,.68,47.7+j*3.8,1.2,1.13,2.9,'84664f')
    for k in range(8):b(139,1.28,46.55+j*3.8+k*.31,.85,.45,.07,['ce8a69','586b75','c2a67b'][k%3])
b(133,.1,54,20,.2,20,'af9070')

# A four-legged, tapered truss with two observation decks and a striped antenna.
tower=part('Shiba tower • observation decks and lattice','Landmarks','Tower')
tx,tz=105,-119
red='d9502e';bone='f0debf'
levels=[(.25,12),(7,9.6),(15,7.25),(23,5.75),(31,4.55),(38,3.65),(45,3.0),(52,2.30),(60,1.78),(67,1.23),(73,.88)]
for idx,((lo,r),(hi,R)) in enumerate(zip(levels,levels[1:])):
    c=bone if idx in [4,7] else red
    for j,(u,v) in enumerate([(-1,-1),(1,-1),(1,1),(-1,1)]):
        U,V=[(-1,-1),(1,-1),(1,1),(-1,1)][(j+1)%4]
        a=(tx+u*r,lo,tz+v*r);bb=(tx+u*R,hi,tz+v*R)
        e=(tx+U*R,hi,tz+V*R);f=(tx+U*r,lo,tz+V*r)
        finish='Tower ivory' if c==bone else 'Tower vermilion'
        tower.rod(a,bb,.19+r*.035,c,finish,sides=5);tower.rod(bb,e,.15+r*.008,c,finish,sides=5)
        tower.rod(a,e,.10+r*.011,c,finish,sides=5);tower.rod(f,bb,.10+r*.011,c,finish,sides=5)
        if idx%2==0:
            tower.rod((a[0],a[1]+.15,a[2]),bb,.065,'ff9c54','Honey',5)
for dx in [-12,12]:
    for dz in [-12,12]:
        tower.box(tx+dx,.37,tz+dz,2.4,.7,2.4,'ad9c88');coll(tx+dx,tz+dz,2.35,2.35)
for h,w in [(32,14.5),(61.5,6.6)]:
    for dy,ww,ht,c,m in [(-1,w*.84,.56,red,'Paint'),(-.49,w,.56,bone,'Paint'),(.35,w*.95,1.17,'5f6f76','Paint'),(1.03,w,.21,'ffcd88','Honey'),(1.42,w*.85,.55,red,'Paint')]:
        tower.box(tx,h+dy,tz,ww,ht,ww,c,m)
    for s in [-1,1]:
        for k in range(-4,5):
            tower.box(tx+k*w*.095,h+.37,tz+s*w*.48,.10,1.18,.09,bone)
            tower.box(tx+s*w*.48,h+.37,tz+k*w*.095,.09,1.18,.10,bone)
for j in range(12):
    rr=.68-.047*j
    tower.rod((tx,73+j*1.43,tz),(tx,74.43+j*1.43,tz),rr,red if j%2==0 else bone,sides=9,top=rr-.042)
tower.box(tx,90.25,tz,.36,.32,.36,'ff473c','Brake')

# Twin tracks cross the street on steel girders. All piers stand outside traffic lanes.
rail=part('To-wan Line • elevated track and riveted portals','Railway','Rail')
for z in [13.25,19.3]:
    rail.box(-12,7.04,z,601,.87,.30,'366864')
    rail.box(-12,7.47,z,601,.12,.61,'8aaba0')
    for x in range(-307,285,6):
        rail.box(x,7.05,z,.12,.79,.44,'bdd0bc')
rail.box(-12,6.92,16.28,601,.46,6.15,'586d69')
for z in (14.15,15.5,17.1,18.45):rail.box(-12,7.38,z,601,.16,.08,'a1aaa4')
for xx in range(-300,281,16):
    if min(abs(xx-a) for a in [-240,-160,-80,0,80,160])<12:continue
    rail.box(xx,3.18,16.3,1.05,6.35,1.52,'aba99a');coll(xx,16.3,1.05,1.52)
    rail.box(xx,6.36,16.3,1.24,.8,5.47,'90a098')
    for dz in [-1,1]:rail.rod((xx,5.05,16.3+dz*.56),(xx,6.39,16.3+dz*2.58),.18,'82988b',sides=5)
for xx in range(-295,285,20):
    for zz in [13.4,19.16]:rail.rod((xx,7.4,zz),(xx,11.98,zz),.08,'687976',sides=5)
    rail.box(xx,11.97,16.28,.13,.13,5.97,'667771')
for zz in (15,17.8):rail.box(-12,11.53,zz,598,.042,.04,'4d5354')

train=part('Local 07 • commuter consist','Railway','Train')
for car in range(4):
    x=127.0+car*13.55;z=17.81
    b=train.box
    b(x,8.03,z,12.96,.72,2.42,'475256');b(x,9.25,z,13.05,2.31,2.53,'c9d3cc')
    b(x,10.52,z,12.95,.24,2.47,'99a6a3');b(x,10.76,z,3.6,.39,1.62,'7e8987')
    for s in [-1,1]:
        zz=z+s*1.273;b(x,8.64,zz,12.89,.26,.04,'57864c');b(x,8.44,zz,12.89,.095,.04,'d5b24f')
        for j in range(9):
            xx=x+(j-4)*1.35;b(xx,9.53,zz,.99,.87,.055,'354752')
            b(xx,9.53,zz+s*.032,.82,.69,.028,'ffe0a1','Paper' if j%3 else 'Ice')
            b(xx,9.54,zz+s*.05,.06,.69,.03,'40535a')
            if j%3==1:
                for k in [-.59,.59]:b(xx+k,9.12,zz+s*.035,.045,2.07,.03,'556463')
    for ss in [-1,1]:
        dx=x+ss*6.55
        b(dx,9.53,z,.064,1.1,2.18,'304850')
        for off in [-.84,.84]:b(dx+ss*.05,8.65,z+off,.05,.2,.3,'ffe3aa','Paper')
        for off in [-1.04,1.04]:train.rod((x+ss*4.35,7.74,z+off-.12),(x+ss*4.35,7.74,z+off+.12),.36,'354046',sides=10)
station=part('Ariake • platform lights and canopy','Railway','Station')
b=station.box
b(122,7.68,21.78,40,.5,3.93,'adb5a5')
for xx in range(104,143,6):
    b(xx,9.36,22.7,.14,3.25,.18,'8a9e95');b(xx,10.93,22,.16,.14,3.75,'647b71')
b(122,11.16,21.82,42,.29,4.4,'546e69');b(122,11.12,23.99,42,.35,.12,'bccdc0')
for xx in [106,116,126,136]:b(xx,10.98,23.8,4.2,.08,.09,'ffe3a1','Paper')
board(station,123,9.74,23.54,9.8,1.35,'S','s13')

# Waterfront: paved esplanade, ferry landing, and a double suspension bridge on the horizon.
land=part('Island and waterfront • pavement','Ground','Ground')
land.box(-34,-.52,0,474,.94,540,'999489')
land.box(201,-.36,0,56,.59,536,'a39f91')
land.box(175,.009,0,7,.1,530,'acada2')
for ix in range(5):
    for iz in range(6):
        land.box(-200+ix*80,.066,-200+iz*80,59.8,.132,59.8,'aaa99d')
park=part('Shiba pocket park • paths and ginkgo','Street trees','Park')
park.box(-40,.151,40,47,.05,46,'7a8269')
for k in [-1,1]:park.box(-40+k*11,.20,40,1.9,.05,45,'c5b79b')
waterfront=part('Shiomi wharf • boardwalk and ferry kiosks','Waterfront','Waterfront')
b=waterfront.box
b(210,.14,-128,65,.42,10,'a69783')
for z in [-65,125,-139,-117]:
    xx=202 if z in [-65,125] else 188
    b(xx,1.65,z,5,3,4.4,'c8bba3');b(xx,3.33,z,6.15,.34,5.2,'546d6b')
    b(xx,2.05,z+2.22,3.6,1.04,.07,'45616b');coll(xx,z,5,4.4,True)
    board(waterfront,xx-2.62,2.7,z,3.6,.78,'W','s15' if xx==188 else 's12')
for z in range(-244,246,4):
    if abs(z+128)<8:continue
    b(225.1,.77,z,.12,1.44,.13,'5e7175')
    for h in [.6,1.27]:b(225.1,h,z,.1,.09,4.1,'86938c')
for zz in [-131.9,-124.1]:
    for x in range(181,242,5):
        if x>205:b(x,.94,zz,.14,1.2,.14,'787d74')
for x in [-1,1]:
    waterfront.rod((180,0,-128+x*4.9),(180,4.79,-128+x*4.9),.1,'556d71')
board(waterfront,180,4.5,-128,9.9,1.35,'W','s15')
for z in range(-218,230,29):
    if abs(z+128)<16:continue
    b(183,.58,z,2.17,.16,.67,'aa8462');b(183,1.08,z+.32,2.17,.46,.10,'ae8d6a')
    for x in [182.31,183.69]:b(x,.32,z,.12,.48,.53,'4c6668')
    coll(183,z,2.17,.72)
bridge=part('Bay crossing • twin suspension spans','Landmarks','Bay bridge')
bx=323
bridge.box(bx,9.4,-8,9,.99,473,'8c9da0')
for zz in [-77,61]:
    for s in [-1,1]:
        xx=bx+s*5.5
        bridge.box(xx,23,zz,1.63,48,2.2,'d3d1bd');bridge.box(xx,1.6,zz,4,4.2,5,'898f8c')
    for h in [28.2,43.5]:bridge.box(bx,h,zz,11.1,1.2,2,'cccfbf')
for start,end,h0,h1,sag in [(-232,-77,11.3,46.5,6),(-77,61,46.5,46.5,24),(61,221,46.5,11.3,6)]:
    for s in [-1,1]:
        xx=bx+s*5.2
        def loc(t):return (xx,h0*(1-t)+h1*t-4*sag*t*(1-t),start+(end-start)*t)
        for j in range(28):
            a,c=loc(j/28),loc((j+1)/28)
            bridge.rod(a,c,.16,'e3decc',sides=5);bridge.rod((xx,10,a[2]),a,.059,'c4cccc',sides=4)
        bridge.box(xx,10.26,(start+end)/2,.11,.10,end-start,'ffe3b0','Paper')

def ginkgo(p,x,z,scale=1):
    h=5.8*scale;p.rod((x,.15,z),(x,h*.87,z),.16*scale,'635f50',sides=7,top=.09*scale)
    for j in range(5):
        a=j*2.4;dx=math.sin(a)*1.05*scale;dz=math.cos(a)*scale
        p.rod((x,h*.34,z),(x+dx,h*.72,z+dz),.08,'75715a',sides=5,top=.041)
        col=['928b51','aaa150','a99749','858a55','b3a557'][j]
        p.rod((x+dx,h*.54,z+dz),(x+dx,h*.77,z+dz),.42*scale,col,sides=7,top=1.21*scale)
        p.rod((x+dx,h*.77,z+dz),(x+dx*.85,h*(.96+(j%3)*.055),z+dz*.85),1.21*scale,col,sides=7,top=.21*scale)
    coll(x,z,.44*scale,.44*scale)
trees=part('Ginkgo avenue • autumn canopy','Street trees','Trees')
for z in range(-222,230,18):
    if min(abs(z-zz) for zz in range(-240,241,80))<13 or abs(z+128)<11:continue
    for xx in [176,214]:ginkgo(trees,xx,z,.92+rng.random()*.28)
for xx in [-54,-26]:
    for zz in [23,39,58]:ginkgo(park,xx,zz,1.2)
for x in [-224,-144,-64,16,96]:
    for z in [-216,-58,106,186]:ginkgo(trees,x,z,.87+rng.random()*.15)

# Contact wires sag between offset utility poles along the shopping street.
utility=part('Distribution line • crossarms and three cables','Street furniture','Utility')
pole_z=[-219,-181,-139,-102,-59,-27,28,66,106,144,187,222]
for zz in pole_z:
    x=146.0
    utility.rod((x,.13,zz),(x,9.6,zz),.16,'777974',top=.10);coll(x,zz,.33,.33)
    utility.box(x,8.92,zz,2.22,.13,.13,'4a5755')
    for dx in [-.89,0,.89]:utility.rod((x+dx,8.95,zz),(x+dx,9.35,zz),.10,'c3c3ab',sides=6)
    utility.rod((x-.35,7.38,zz),(x-.35,8.17,zz),.28,'728381',sides=10)
for aa,bb in zip(pole_z,pole_z[1:]):
    for dx in [-.89,0,.89]:
        for j in range(8):
            def pt(t):return (146+dx,9.35-1.8*4*t*(1-t),aa+(bb-aa)*t)
            utility.rod(pt(j/8),pt((j+1)/8),.023,'414952',sides=4)
# An independent roadway plate and its mast, visible from the approach to the station.
for zz in [-144,14.8,176]:
    xx=147.45
    utility.rod((xx,.13,zz),(xx,6.8,zz),.14,'65777a');coll(xx,zz,.29,.29)
    utility.box(xx+2.65,6.65,zz,5.5,.16,.16,'687877')
    board(utility,xx+2.79,6.02,zz,4.6,.95,'S','s14')

# The game retains its road shaders and animated traffic. These surfaces and
# set dressing let the same street be edited and rendered directly in Blender.
roads=part('Street layout • crossings and lane paint','Render set','Reference')
b=roads.box
asphalt='444950';mark='d7cdb5'
for x in range(-240,161,80):
    b(x,.025,0,20,.055,502,asphalt)
    for z in range(-246,249,6):
        if min(abs(z-a) for a in range(-240,241,80))<=12:continue
        b(x,.069,z,.13,.015,5.97,'d09654')
        for s in [-1,1]:b(x+5*s,.069,z,.12,.014,2.35,mark)
for z in range(-240,241,80):
    b(-40,.029,z,422,.059,20,asphalt)
    for x in range(-247,171,6):
        if min(abs(x-a) for a in range(-240,161,80))<=12:continue
        b(x,.071,z,5.96,.014,.13,'d09654')
    for x in range(-240,161,80):
        for n in range(-4,5):
            for s in [-1,1]:
                b(x+n*1.53,.073,z+s*10.8,.67,.013,2.05,mark);b(x+s*10.8,.073,z+n*1.53,2.05,.013,.67,mark)
roads.box(0,-.77,0,5000,.1,5000,'526f7b')
# Distant office silhouettes and rooftop antennae, shared by game and render.
skyline=part('Distant city • Sumida skyline','Landmarks','Skyline')
for j in range(130):
    a=j*2.39996;radius=rng.uniform(345,515);x=-16+math.cos(a)*radius;z=math.sin(a)*radius
    h=rng.uniform(14,65);w=rng.uniform(9,18);d=rng.uniform(10,17)
    c=rng.choice(['77828e','717e8a','8d8e98','809098'])
    skyline.box(x,-1.4,z,70,3.2,55,'777e83');skyline.box(x,h/2,z,w,h,d,c)
    skyline.box(x,h+.81,z,w*.7,1.5,d*.71,'899499')
    for y in range(5,int(h)-1,5):
        skyline.box(x,y,z,w+.08,.28,d+.08,'bdc5c4','Paper' if (j+y)%7==0 else 'Paint')
    if j%6==0:skyline.rod((x,h,z),(x,h+4,z),.13,'9aa1a3',sides=5)
street=part('Lamps • pedestrian scale','Street furniture','Lamps')
for x in [-240,-160,-80,0,80,160]:
    for z in range(-219,229,40):
        xx=x+11.4
        street.rod((xx,.14,z),(xx,7.2,z),.1,'637374',top=.075)
        street.rod((xx,7.1,z),(xx-2.4,7.47,z),.073,'647372')
        street.box(xx-2.5,7.47,z,.8,.16,.31,'4e6166')
        street.box(xx-2.5,7.37,z,.68,.036,.24,'ffe0ad','Paper');coll(xx,z,.22,.22)

# Street-level props sit inside the shop frontage or along the far promenade.
detail=part('Record shop • listening window and sidewalk display','Bay shopping street','Shop')
for zz in [46.85,60.45]:
    board(detail,143.19,2.12,zz,1.28,1.57,'E','p0' if zz<50 else 'p1')
    for yy in [1.25,3.04]:detail.box(143.3,yy,zz,.35,.07,1.7,'705a48')
for z in [45.1,63.23]:
    detail.rod((143.19,.25,z),(143.19,7.83,z),.073,'948576')
for zz in [47.5,60.1]:
    detail.box(143.40,6.1,zz,.58,.71,1.07,'cfcbb8')
    detail.rod((143.68,6.1,zz+.15),(143.72,6.1,zz+.15),.24,'596263',sides=14)
    for k in range(-2,3):detail.box(143.74,6.1+k*.074,zz+.15,.025,.023,.39,'b1afa1')
for j in range(5):
    zz=52.41+j*.76
    detail.box(143.94,2.96,zz,.046,.63,.70,'253f4b')
    detail.rod((143.965,2.97,zz),(143.984,2.97,zz),.125,'dcc693',sides=14)
detail.box(143.95,3.3,53.92,.07,.07,3.93,'8e7861')

def bike(p,x,z,frame):
    # Step-through bicycle, drawn in the Y/Z plane against the front wall.
    def line(h1,z1,h2,z2,r,col):p.rod((x,h1,z+z1),(x,h2,z+z2),r,col,sides=6)
    for hub in [-.55,.55]:
        for j in range(14):
            a=j*math.tau/14;c=(j+1)*math.tau/14
            line(.48+.36*math.sin(a),hub+.36*math.cos(a),.48+.36*math.sin(c),hub+.36*math.cos(c),.037,'3a4141')
            if j%2==0:line(.48,hub,.48+.35*math.sin(a),hub+.35*math.cos(a),.009,'9fa4a1')
    for a,b,c,d in [(.48,-.55,.49,.04),(.49,.04,.91,-.19),(.91,-.19,.48,-.55),(.49,.04,.82,.43),(.82,.43,.48,.55),(.82,.43,1.18,.38),(.91,-.19,1.03,-.21)]:
        line(a,b,c,d,.03,frame)
    p.box(x,1.07,z-.21,.19,.07,.27,'3a3d3a');p.box(x,1.18,z+.37,.39,.04,.05,'6b7270')
    p.box(x,.93,z+.64,.31,.23,.27,'7f8d83')
for i in range(2):bike(detail,144.05,62.72-i*1.66,['8b473a','627a77'][i])
# Bicycles lean against the display windows, away from the open door.
coll(144.05,61.89,.44,3.24)

prom=part('Waterfront • kissaten terrace and lantern kiosks','Waterfront','Waterfront')
def lantern(p,x,h,z):
    p.rod((x,h-.26,z),(x,h-.16,z),.12,'e47044','Honey',10,top=.22)
    p.rod((x,h-.16,z),(x,h+.16,z),.22,'cb613a','Honey',10)
    p.rod((x,h+.16,z),(x,h+.26,z),.22,'dc8151','Honey',10,top=.12)
    for dh in [-.26,-.115,.11,.26]:p.rod((x,h+dh-.015,z),(x,h+dh+.015,z),.13 if abs(dh)>.25 else .224,'8c5740',sides=10)
for idx,z in enumerate([45,57,106,-22,-45,187]):
    x=181.7
    prom.box(x,1.45,z,3.4,2.63,5.8,'9a7961');prom.box(x,2.98,z,4.2,.37,6.45,'40545a')
    prom.box(x-1.72,1.82,z,.08,1.75,5.32,'394c4b');prom.box(x-1.97,1.0,z,.57,.15,5.67,'d6b991')
    board(prom,x-1.8,2.6,z,4.75,.7,'W','s'+str([1,2,11,4,3,7][idx]))
    for n in range(4):
        zz=z+(n-1.5)*1.27;prom.rod((x-2.04,2.2,zz),(x-2.04,2.78,zz),.019,'5a5047')
        lantern(prom,x-2.04,2.15,zz)
    for dz in [-1.65,0,1.65]:
        prom.rod((x-2.14,.15,z+dz),(x-2.14,.72,z+dz),.09,'545856')
        prom.rod((x-2.14,.71,z+dz),(x-2.14,.81,z+dz),.31,'a95a45')
    coll(x-.15,z,3.9,6.15,True)
# A shrine gate beside the landscaped waterfront. The passage stays open.
gate=part('Shiomi • vermilion torii','Waterfront','Waterfront')
for z in [28.9,34.7]:
    gate.rod((187,.13,z),(187,5.52,z),.24,'aa4230',sides=12,top=.19)
    gate.rod((187,.12,z),(187,.52,z),.28,'444a48',sides=12);coll(187,z,.56,.56)
gate.box(187,4.33,31.8,.34,.32,7.06,'b34a34')
gate.box(187,5.29,31.8,.48,.4,7.93,'b04b37')
gate.box(187,5.62,31.8,.64,.24,8.41,'3d4649')
for s in [-1,1]:gate.rod((187,5.62,31.8+s*3.71),(187,5.82,31.8+s*4.62),.15,'3d4649',sides=5)
gate.box(187,4.84,31.8,.31,.76,.58,'bb5537')
# Signal backing and visors are shared by both render and game at the near junction.
traffic=part('Wangan-dori • horizontal signal head','Street furniture','Utility')
xx,zz=147.4,67
traffic.rod((xx,.15,zz),(xx,6.95,zz),.135,'798584',top=.10);coll(xx,zz,.29,.29)
traffic.rod((xx,6.5,zz),(156,6.5,zz),.105,'758487')
traffic.box(155.6,6.48,zz,2.06,.7,.41,'455558')
for n,lightmat in enumerate(['Jade','Paint','Paint']):
    x=154.96+n*.62;traffic.rod((x,6.5,zz+.208),(x,6.5,zz+.27),.221,'495553' if n else '89d5ab',lightmat,12)
    traffic.box(x,6.77,zz+.25,.47,.055,.35,'445357')

# View the complete editable city in named collections.
collections={}
def collection(name):
    if name not in collections:
        c=bpy.data.collections.new(name);scene.collection.children.link(c);collections[name]=c
    return collections[name]
# Put object pivots at their footprint centres so buildings can be moved or rotated in Blender.
from mathutils import Matrix
schedule=[(0,-22),(8,-22),(31,104),(35,104),(58,-22),(66,-22),(90,-220),(96,-220),(120,-22)]
scene.render.fps=24;scene.frame_start=1;scene.frame_end=2880
for p in parts:
    ob=p.emit(collection(p.collection))
    box=[Vector(v) for v in ob.bound_box]
    origin=(box[0]+box[6])/2
    ob.data.transform(Matrix.Translation(-origin));ob.location=origin
    if p.sector=='Train':
        for seconds,offset in schedule:
            ob.location.x=origin.x+offset
            ob.keyframe_insert(data_path='location',index=0,frame=1+24*seconds)
        action=ob.animation_data.action
        action.name='Ariake local • two-minute service'
        # Horizontal handles give the same smooth acceleration as the game.
        curve=action.fcurves[0]
        for j,key in enumerate(curve.keyframe_points):
            frame,value=key.co
            before=schedule[max(0,j-1)][0]
            after=schedule[min(len(schedule)-1,j+1)][0]
            key.handle_left_type=key.handle_right_type='FREE'
            key.handle_left=(frame-(schedule[j][0]-before)*8,value)
            key.handle_right=(frame+(after-schedule[j][0])*8,value)
scene.frame_set(289)
def camera(name,pos,target,lens):
    c=bpy.data.cameras.new(name);ob=bpy.data.objects.new(name,c);collection('Cameras and lights').objects.link(ob)
    ob.location=xyz(pos);ob.rotation_euler=(Vector(xyz(target))-ob.location).to_track_quat('-Z','Y').to_euler()
    c.lens=lens;c.clip_end=1800
    return ob
hero=camera('01 • Wangan-dori at dusk',(163.0,3.75,80),(139,10.5,16),26)
second=camera('02 • Crossing and bay railway',(187,15,105),(111,16,-12),31)
overview=camera('03 • Bay district masterplan',(365,244,300),(-2,0,-15),42)
scene.camera=hero
for scr in bpy.data.screens:
    for area in scr.areas:
        if area.type=='VIEW_3D':
            sp=area.spaces.active;sp.region_3d.view_perspective='CAMERA';sp.clip_end=1800
            sp.shading.type='MATERIAL';sp.shading.use_scene_world=True;sp.shading.use_scene_lights=True;sp.overlay.show_overlays=False
def light(name,kind,loc,rgb,energy,target=None,size=1):
    l=bpy.data.lights.new(name,kind);o=bpy.data.objects.new(name,l);collection('Cameras and lights').objects.link(o)
    o.location=xyz(loc);l.color=rgb;l.energy=energy
    if kind=='SUN':l.angle=.18
    if kind=='AREA':l.shape='DISK';l.size=size
    if target:o.rotation_euler=(Vector(xyz(target))-o.location).to_track_quat('-Z','Y').to_euler()
    return o
light('Last sunlight','SUN',(138,95,-195),(1,.72,.49),2.15,(0,0,0))
light('Record shop spill','AREA',(145,4.3,54),(1,.59,.29),470,(148,0,55),8)
light('Station fluorescents','AREA',(123,10.7,21.7),(.67,1,.86),430,(123,0,22),14)

# Painted dusk sky, evaluated from the view direction, with layered high cloud.
nt=scene.world.node_tree;nd=nt.nodes;link=nt.links.new
bg=nd.get('Background');coord=nd.new('ShaderNodeTexCoord')
sep=nd.new('ShaderNodeSeparateXYZ');link(coord.outputs['Generated'],sep.inputs[0])
ramp=nd.new('ShaderNodeValToRGB')
cr=ramp.color_ramp;cr.elements.remove(cr.elements[1])
for i,(v,c) in enumerate([(0,'edb694'),(.08,'dac2bb'),(.2,'a2aabe'),(.45,'71839e'),(1,'455775')]):
    e=cr.elements[0] if i==0 else cr.elements.new(v);e.position=v;e.color=color(c)
link(sep.outputs['Z'],ramp.inputs[0])
vec=nd.new('ShaderNodeVectorMath');vec.operation='MULTIPLY';vec.inputs[1].default_value=(3,3,18)
link(coord.outputs['Generated'],vec.inputs[0])
noise=nd.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2.6;noise.inputs['Detail'].default_value=4;link(vec.outputs[0],noise.inputs['Vector'])
cloud=nd.new('ShaderNodeValToRGB');cloud.color_ramp.elements[0].position=.45;cloud.color_ramp.elements[1].position=.74
cloud.color_ramp.elements[1].color=(.40,.40,.40,1);link(noise.outputs['Fac'],cloud.inputs[0])
mix=nd.new('ShaderNodeMixRGB');link(cloud.outputs[0],mix.inputs[0]);link(ramp.outputs[0],mix.inputs[1]);mix.inputs[2].default_value=color('edd6c2')
link(mix.outputs[0],bg.inputs[0]);bg.inputs[1].default_value=.85

# Existing studio vehicles and figures give the cover the same scale as gameplay.
def stage_asset(file,placements):
    bpy.ops.import_scene.gltf(filepath=str(ASSETS/file))
    imported=list(bpy.context.selected_objects)
    # Imported selection may only include roots in some Blender versions.
    rootnodes=[obj for obj in imported if not obj.parent]
    if not rootnodes:return
    lib=bpy.data.collections.new('Cast asset • '+file)
    def move(obj):
        for child in list(obj.children):move(child)
        for old in list(obj.users_collection):old.objects.unlink(obj)
        lib.objects.link(obj)
    for ob in rootnodes:move(ob)
    for i,(x,z,yaw) in enumerate(placements):
        ob=bpy.data.objects.new(file.split('.')[0]+f' • {i}',None);ob.instance_type='COLLECTION';ob.instance_collection=lib
        collection('Render cast').objects.link(ob);ob.location=xyz((x,.14,z));ob.rotation_euler.z=math.radians(yaw)
stage_asset('marlin-turbo.glb',[(153.2,51,177),(166,-12,0),(164,-52,0)])
stage_asset('solano-gt.glb',[(167,39,0),(154,-21,180)])
stage_asset('rico.glb',[(148,53,112),(145,38,70)])
stage_asset('mara.glb',[(146.6,55.2,-80),(172,46,152)])

scene.use_nodes=True;comp=scene.node_tree
gl=comp.nodes.new('CompositorNodeGlare');gl.glare_type='FOG_GLOW';gl.quality='MEDIUM'
comp.links.new(comp.nodes.get('Render Layers').outputs['Image'],gl.inputs['Image'])
comp.links.new(gl.outputs['Image'],comp.nodes.get('Composite').inputs[0])
scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath='//东京湾街景.png'
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active=None
bpy.ops.file.pack_all()
for image in bpy.data.images:
    for packed in image.packed_files:
        if packed.filepath and not packed.filepath.startswith('//'):
            packed.filepath=bpy.path.relpath(packed.filepath,start=str(ASSETS))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS/'东京湾街区.blend'),compress=True)

# Spatial batches keep the browser draw count bounded. The editable source
# above retains one named object per building, structure or prop assembly.
batches={}
for p in parts:
    if p.sector=='Reference':continue
    if p.sector not in batches:batches[p.sector]=Part(p.sector,'Export',p.sector)
    batches[p.sector].merge(p)
runtime=collection('Runtime export')
for key,p in batches.items():
    ob=p.emit(runtime)
    if key=='Train':ob['tokyoTrain']=True
bpy.ops.object.select_all(action='DESELECT')
for ob in runtime.objects:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ASSETS/'tokyo-bay.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False)
(ASSETS/'tokyo-layout.json').write_text(json.dumps({'colliders':bounds,'footprints':prints,'trainStops':schedule},separators=(',',':'))+'\n')
print('TOKYO EXPORT',len(parts),'editable parts',len(batches),'runtime sectors',len(bounds),'ground bounds',flush=True)
