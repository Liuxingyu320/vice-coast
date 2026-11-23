"""Build Palm Coast's street fleet and residents in Blender. Run from the project root."""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

B=bpy
B.ops.wm.read_factory_settings(use_empty=True)
out=Path.cwd()/'assets'
scene=B.context.scene
pi=math.pi
cos,sin=math.cos,math.sin

def linear(n):
    v=n/255
    return v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4

def rgb(code):
    code=code.lstrip('#')
    return tuple(linear(int(code[i:i+2],16)) for i in (0,2,4))+(1,)

def shader(name, rough, metal, color=None):
    mat=B.data.materials.new(name);mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    if color:
        mat.diffuse_color=rgb(color);bs.inputs['Base Color'].default_value=rgb(color)
    else:
        vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Pigment'
        mat.node_tree.links.new(vc.outputs[0],bs.inputs['Base Color'])
    return mat

surfaces={'enamel':shader('Enamel and glass',.29,.28),'metal':shader('Brushed metal',.34,.54),
          'soft':shader('Cloth and rubber',.87,.01),'hard':shader('Dyed leather and trim',.53,.07)}
rubber='202830'; dark='26343b'; trim='364953'; alloy='bcc7c7'; ivory='e7dcc4'; glass='364f60'
lamp='ffecc3'; amber='db8b37'; red='bc4345'; walnut='936543'; brass='c19846'
fleet={};cast={}
def collection(name):
    c=B.data.collections.new(name);scene.collection.children.link(c);return c
def empty(name,c):
    o=B.data.objects.new(name,None);c.objects.link(o);o.empty_display_size=.08;return o
class Assembly:
    def __init__(self,key,title,coat=None):
        self.key=key;self.coll=collection(title);self.root=empty(key,self.coll);self.root['assetKey']=key
        self.piv={};self.orig={};self.buf={};self.coat=shader('Paintwork '+key,.28,.39,coat) if coat else None
    def joint(self,name,point=(0,0,0),parent=None):
        n=empty(self.key+' '+name,self.coll);n['rigSlot']=name;n.parent=self.piv[parent] if parent else self.root
        self.orig[name]=Vector(point);n.location=self.orig[name]-(self.orig[parent] if parent else Vector((0,0,0)))
        self.piv[name]=n;self.current=name
    def put(self,verts,faces,color,finish='hard',smooth=False):
        k=(self.current,'paint' if color=='paint' else finish)
        points,polys,colors,shade=self.buf.setdefault(k,([],[],[],[]))
        off=len(points);points.extend(tuple(Vector(p)-self.orig[self.current]) for p in verts)
        polys.extend(tuple(i+off for i in f) for f in faces)
        if color!='paint':colors.extend([rgb(color)]*len(verts))
        shade.extend([smooth]*len(faces))
    def finish(self):
        for (joint,kind),(points,polys,colors,shade) in self.buf.items():
            name=self.key+' '+joint+' '+kind;me=B.data.meshes.new(name);me.from_pydata(points,[],polys);me.update()
            if colors:
                col=me.color_attributes.new(name='Pigment',type='BYTE_COLOR',domain='POINT')
                col.data.foreach_set('color',[v for c in colors for v in c]);me.color_attributes.active_color=col
            for f,val in zip(me.polygons,shade):f.use_smooth=val
            ob=B.data.objects.new(name,me);self.coll.objects.link(ob);ob.parent=self.piv[joint]
            me.materials.append(self.coat if kind=='paint' else surfaces[kind])
        self.buf.clear()

def rings(a,rows,c,finish='hard',smooth=False):
    count=len(rows[0]);vs=[p for row in rows for p in row];ff=[]
    for j in range(len(rows)-1):
        for i in range(count):
            k=j*count+i;n=j*count+(i+1)%count;ff.append((k,n,n+count,k+count))
    ff.extend([tuple(reversed(range(count))),tuple(range(len(vs)-count,len(vs)))])
    a.put(vs,ff,c,finish,smooth)

def box(a,pt,dims,c,bevel=.012,finish='hard'):
    x,y,z=pt;u,v,w=[d/2 for d in dims];e=min(bevel,u*.42,v*.42,w*.42)
    def row(h,shrink):
        X=u-shrink;Y=v-shrink;b=min(max(e,.001),X*.5,Y*.5)
        return [(x+i,y+j,z+h) for i,j in [(-X+b,-Y),(X-b,-Y),(X,-Y+b),(X,Y-b),(X-b,Y),(-X+b,Y),(-X,Y-b),(-X,-Y+b)]]
    rings(a,[row(-w,e*.52),row(-w+e,0),row(w-e,0),row(w,e*.52)],c,finish)

def loft(a,rows,c,finish='soft',n=16):
    rings(a,[[(x+u*cos(2*pi*i/n),y+v*sin(2*pi*i/n),z) for i in range(n)] for x,y,z,u,v in rows],c,finish,True)
def ball(a,pt,r,c,finish='soft',n=14):
    x,y,z=pt;u,v,w=r
    loft(a,[(x,y,z+w*sin(t),max(.0003,u*cos(t)),max(.0003,v*cos(t))) for t in (-pi/2,-1.1,-.65,-.22,.22,.65,1.1,pi/2)],c,finish,n)
def pipe(a,pts,r,c,finish='metal',n=8):
    pp=[Vector(p) for p in pts];rs=[]
    for i,p in enumerate(pp):
        d=(pp[min(i+1,len(pp)-1)]-pp[max(0,i-1)]).normalized()
        ref=Vector((0,0,1)) if abs(d.z)<.9 else Vector((0,1,0))
        u=d.cross(ref).normalized();v=d.cross(u).normalized()
        rs.append([p+r*(cos(j*2*pi/n)*u+sin(j*2*pi/n)*v) for j in range(n)])
    rings(a,rs,c,finish,True)
def face(a,pts,c,finish='hard'):
    # Thin plates have a visible inside and outside, including open-car windscreens.
    a.put(pts,[tuple(range(len(pts)))],c,finish)

def glaze(a,lower_left,lower_right,upper_right,upper_left):
    pts=[lower_left,lower_right,upper_right,upper_left]
    a.put(pts,[(0,1,2,3)],glass,'enamel')
    colors=a.buf[(a.current,'enamel')][2]
    colors[-4:]=[rgb(c) for c in ['273e4d','344c5a','627785','536c7a']]

# length, half width, tyre radius, axle spread, belt height, roof height, cabin front/back, paint
cars=[
 ('pelican','Pelican Cabrio',4.50,.91,.32,2.63,.75,1.20,.84,-1.12,'e48585'),
 ('nara','Nara Estate',4.98,.96,.36,2.85,.86,1.56,.66,-2.00,'598e88'),
 ('rook','Rook City Cab',4.86,.95,.35,2.85,.87,1.48,.68,-1.47,'edb647'),
 ('barranca','Barranca Stepside',4.85,1.00,.40,2.86,1.00,1.73,1.00,-.42,'548aaa'),
 ('marea','Marea Weekender',4.72,1.00,.37,2.77,1.00,2.11,1.67,-2.01,'c79b77'),
 ('bahia','Bahía Scout',3.89,.95,.44,2.35,1.03,1.78,.54,-1.63,'afbc80'),
 ('cricket','Cricket City',3.19,.80,.285,2.14,.74,1.50,.75,-1.33,'98bda3'),
 ('jetty','Jetty Mule',3.42,.91,.41,2.16,.67,1.44,.80,-1.12,'eab25f'),
 ('lido','Riviera Lido',5.18,.99,.35,2.99,.81,1.37,.54,-1.42,'84bed0'),
 ('horizon','Horizon Rallye',3.97,.89,.36,2.45,.83,1.47,.75,-1.46,'c27061'),
 ('mercado','Mercado Parcel',4.91,1.02,.39,2.93,.91,2.24,1.76,.10,'8daca1')]
def wheel(a,x,y,r,style):
    s=1 if x>0 else -1
    profile=[(-.10,.68),(-.115,.84),(-.089,.96),(-.061,1),(.062,1),(.098,.94),(.114,.82),(.112,.65)]
    def hoop(profile,color,finish):
        pts=[[(x+s*xx,y+r*rr*cos(2*pi*i/24),r+r*rr*sin(2*pi*i/24)) for i in range(24)] for xx,rr in profile]
        if s<0:pts=[list(reversed(p)) for p in pts]
        rings(a,pts,color,finish,True)
    hoop(profile,rubber,'soft')
    if style=='lido':hoop([(.113,.83),(.116,.78),(.116,.68)],ivory,'soft')
    hoop([(.112,.65),(.118,.60),(.119,.51)],alloy,'metal');hoop([(.120,.54),(.123,.50)],dark,'hard')
    count=5 if style in ('horizon','pelican','jetty') else 8
    for i in range(count):
        t=2*pi*i/count
        pipe(a,[(x+s*.139,y+r*.13*cos(t),r+r*.13*sin(t)),(x+s*.134,y+r*.52*cos(t+.10),r+r*.52*sin(t+.10))],r*.052,ivory if style=='marea' else alloy)
    hoop([(.127,.20),(.139,.16)],brass if style=='pelican' else alloy,'metal')

def cabseat(a,x,y,z):
    box(a,(x,y,z),(.44,.44,.11),'795944',.045)
    loft(a,[(x,y-.17,z,.22,.072),(x,y-.20,z+.24,.22,.07),(x,y-.22,z+.39,.17,.05)],'926e52')
    box(a,(x,y-.21,z+.44),(.23,.115,.13),'795944',.038)
def build_car(cfg):
    k,title,l,w,r,spread,belt,top,cf,cb,paint=cfg
    a=Assembly(k,title,paint);fleet[k]=a;a.joint('body')
    end=l/2;util=k in ('barranca','bahia','mercado','marea')
    sy=[-end,-end+.15,-spread/2,0,spread/2,end-.23,end]
    widths=[.82,.94,1,.975,1,.94,.81];heights=[belt-.04,belt+.015,belt+.033,belt+.006,belt,belt-.056,belt-.104]
    if k=='jetty':widths=[v*.72 for v in widths];heights=[z-.085 for z in heights]
    bottom=.40 if util or k=='jetty' else .26
    lx=spread/2
    # Cross sections run from tail to nose; arch cuts are part of the side wall.
    def at(y,array):
        for i,b in enumerate(sy[1:]):
            if y<=b:return array[i]+(array[i+1]-array[i])*(y-sy[i])/(b-sy[i])
        return array[-1]
    ys=sorted(set(sy+[i*end/28 for i in range(-28,29)]+[c+j*(r+.075) for c in [-lx,lx] for j in [-1,-.999,.999,1]]))
    rows=[]
    for y in ys:
        width=w*at(y,widths);h=at(y,heights);d=min(abs(y-lx),abs(y+lx));rr=r+.064
        lower=r+rr*(max(0,1-(d/(rr+.01))**2)**.5) if d<=rr+.01 else bottom
        sh=max(h+.007,lower+.053)
        well=min(1,max(0,min((y+1.20)/.16,(cf-y)/.16))) if k in ('jetty','pelican') else 0
        row=[(-width*.72,lower),(-width,lower+.012),(-width*.997,sh-.046),(-width*.95,sh),(-width*.79,h+.018),(-width*.75,h+.018-.35*well),(0,h+.026-.35*well),(width*.75,h+.018-.35*well),(width*.79,h+.018),(width*.95,sh),(width*.997,sh-.046),(width,lower+.012),(width*.72,lower)]
        rows.append([(x,y,z) for x,z in row])
    rings(a,rows,'paint','enamel')
    for side in [-1,1]:
        for axle in [-lx,lx]:
            pts=[(side*(w*at(axle+(r+.046)*cos(i*pi/18),widths)+.007),axle+(r+.046)*cos(i*pi/18),r+(r+.052)*sin(i*pi/18)+.017) for i in range(19)]
            pipe(a,pts,.022 if util else .012,trim if util else 'paint')
    # Passenger cell, with fit-specific pillars and windows on all four faces.
    btm=belt+.026;tw=w*(.80 if util else .77);ww=w*.87
    flat=k in ('marea','mercado','barranca','bahia');frontTop=cf-(.16 if flat else .48);backTop=cb+(.15 if flat or k in ('nara','cricket') else .45)
    def corner(side,y,topEdge=False):
        return (side*(tw if topEdge else ww),y,top-.046 if topEdge else btm)
    if k not in ('jetty',):
        q=[corner(-1,cf),corner(1,cf),corner(1,frontTop,True),corner(-1,frontTop,True)]
        glaze(a,*q)
        for i in (0,1,2,3):pipe(a,[q[i],q[(i+1)%4]],.023,alloy if k in ('pelican','lido') else trim)
        for s in [-1,1]:
            pipe(a,[(s*ww*.16,cf+.012,btm+.024),(s*ww*.43,cf-.018,btm+.084),(s*ww*.76,cf-.030,btm+.102)],.008,dark)
    openair=k in ('jetty','pelican')
    if not openair:
        box(a,(0,(frontTop+backTop)/2,top),(tw*2+.08,frontTop-backTop+.11,.081),ivory if k in ('lido','marea','nara') else 'paint',.033,'enamel')
        glaze(a,corner(1,cb),corner(-1,cb),corner(-1,backTop,True),corner(1,backTop,True))
        for s in [-1,1]:
            q=[corner(s,cf),corner(s,frontTop,True),corner(s,backTop,True),corner(s,cb)]
            glaze(a,q[0],q[3],q[2],q[1])
            for p in [0,1,2,3]:pipe(a,[q[p],q[(p+1)%4]],.022 if p%2 else .039,'paint' if p!=3 else alloy)
            splits=2 if k in ('nara','marea') else 1
            for j in range(1,splits+1):
                f=j/(splits+1);pipe(a,[(s*ww,cf+(cb-cf)*f,btm),(s*tw,frontTop+(backTop-frontTop)*f,top-.04)],.028,trim)
            for t in ([.25,.74] if frontTop-backTop>1.1 else [.55]):
                y=cf+(cb-cf)*t;box(a,(s*(w*at(y,widths)+.002),y,belt-.07),(.032,.14,.032),alloy,.008,'metal')
            for t in ([.03,.52,.92] if k in ('rook','nara','marea','lido') else [.03,.88]):
                y=cf+(cb-cf)*t
                if min(abs(y-lx),abs(y+lx))>r+.12:
                    pipe(a,[(s*(w*at(y,widths)+.004),y,belt-.02),(s*(w*at(y,widths)+.004),y,bottom+.16),(s*(w*at(y-.07,widths)+.003),y-.07,bottom+.089)],.0065,trim)
    else:
        seat=.46 if k=='pelican' else .41
        box(a,(0,-.17,seat-.042),(1.21,1.48,.036),dark,.014)
        for s in [-1,1]:cabseat(a,s*.34,-.20,seat)
        box(a,(0,.43,belt+.10),(1.24,.19,.16),trim,.05)
        tor=[(-.33+.13*cos(j*2*pi/16),.37,belt+.26+.12*sin(j*2*pi/16)) for j in range(17)]
        pipe(a,tor,.014,rubber)
        if k=='pelican':
            box(a,(0,-.90,belt+.08),(1.40,.38,.11),dark,.046)
            for j in range(4):pipe(a,[(-.63,-.79-.058*j,belt+.14),(.63,-.79-.058*j,belt+.14)],.008,trim)
    nose=end+.013;tail=-end-.017
    box(a,(0,nose,belt-.24),(1.40*w,.062,.16),dark,.024)
    for i in range(3):box(a,(0,nose+.034,belt-.292+.048*i),(1.18*w,.012,.011),alloy,.003,'metal')
    for s in [-1,1]:
        cx=s*(w*.69);z=belt-.16
        if k in ('bahia','cricket','jetty','lido'):
            for j in range(2 if k=='lido' else 1):
                x=cx+s*(j*.19-.07);pipe(a,[(x,nose,z),(x,nose+.045,z)],.105 if k!='lido' else .081,alloy)
                pipe(a,[(x,nose+.04,z),(x,nose+.055,z)],.081 if k!='lido' else .062,lamp,'enamel',16)
        else:box(a,(cx,nose+.026,z),(.30,.065,.116),lamp,.023,'enamel')
        box(a,(s*w*.79,tail,belt-.17),(.22,.062,.13),red,.026,'enamel')
        box(a,(s*w*.90,tail-.006,belt-.17),(.065,.063,.11),amber,.014,'enamel')
        pipe(a,[(s*ww,cf-.13,btm+.04),(s*(w+.045),cf-.11,btm+.13)],.022,trim)
        box(a,(s*(w+.051),cf-.12,btm+.15),(.12,.21,.089),'paint',.035)
    for y in [nose,tail]:box(a,(0,y,belt-.404),(w*1.88,.13,.091),alloy if k in ('nara','barranca','pelican','lido') else trim,.029,'metal')
    box(a,(0,tail-.057,belt-.23),(.37,.022,.117),ivory,.008)
    # The following are silhouette and equipment changes specific to each vehicle.
    if k=='nara':
        for s in [-1,1]:
            for j in range(3):
                y=-1.58+.91*j;box(a,(s*w*.995,y,belt-.168),(.035,.86,.21),walnut,.016)
                pipe(a,[(s*w*1.014,y-.43,belt-.065),(s*w*1.014,y+.43,belt-.065)],.011,ivory)
        for s in [-1,1]:pipe(a,[(s*tw*.87,-1.55,top+.073),(s*tw*.87,.07,top+.073)],.026,alloy)
        for y in [-1.24,-.40]:box(a,(0,y,top+.10),(tw*1.86,.052,.043),alloy)
        ball(a,(0,-.68,top+.17),(.29,1.20,.065),'d9ae75');box(a,(0,-.65,top+.23),(.043,1.66,.015),'6d8b75')
    elif k=='rook':
        box(a,(0,-.12,top+.13),(.56,.29,.19),ivory,.04)
        for s in [-1,1]:
            for j in range(15):
                y=-1.03+j*.14
                for row in range(2):box(a,(s*(w*at(y,widths)+.009),y,belt-.133+.063*row),(.019,.14,.066),dark if (j+row)%2 else ivory,.001)
    elif k=='barranca':
        box(a,(0,-1.31,belt+.032),(1.55,1.61,.057),trim)
        for j in range(8):box(a,(-.65+j*.184,-1.32,belt+.069),(.042,1.49,.023),alloy,.005)
        for s in [-1,1]:box(a,(s*w*.88,-1.36,belt+.149),(.17,1.82,.30),'paint',.037)
        box(a,(0,-end+.13,belt+.121),(w*1.87,.14,.25),'paint',.024)
        for s in [-1,1]:pipe(a,[(s*.75,-.73,belt+.12),(s*.69,-.64,top-.10)],.036,alloy)
        pipe(a,[(-.69,-.64,top-.1),(.69,-.64,top-.1)],.036,alloy)
    elif k=='marea':
        box(a,(0,-.34,top+.12),(1.57,2.72,.24),ivory,.065)
        for s in [-1,1]:
            for j in range(2):box(a,(s*w*.986,-.33,belt-.14-j*.07),(.036,3.08,.045),'b56849' if j else ivory)
        pipe(a,[(-tw-.08,-1.70,top-.02),(-tw-.08,1.10,top-.02)],.075,ivory)
        for y in [-1.80,-1.50]:pipe(a,[(w*.69,y,top+.043),(w*.69,y,top+.23)],.016,alloy)
    elif k=='bahia':
        pipe(a,[(0,tail-.01,1.07),(0,tail-.23,1.07)],.37,rubber,'soft',24)
        pipe(a,[(0,tail-.22,1.07),(0,tail-.25,1.07)],.21,alloy,'metal',20)
        box(a,(0,nose+.10,.70),(1.03,.16,.17),trim,.029)
        for s in [-1,1]:
            pipe(a,[(s*.68,nose+.11,.72),(s*.68,nose+.11,.99),(s*.48,nose+.10,1.07)],.031,dark)
            for y in [-.91,.14]:box(a,(s*.97,y,.49),(.20,.42,.065),trim)
    elif k=='cricket':
        box(a,(0,-.22,top+.044),(.84,.96,.017),dark,.007)
        for s in [-1,1]:box(a,(s*w*.985,-.42,belt-.22),(.052,.95,.06),trim)
    elif k=='jetty':
        for s in [-1,1]:
            pipe(a,[(s*.64,.95,.68),(s*.62,.51,1.38),(s*.61,-.52,1.46),(s*.72,-1.21,.72)],.051,alloy)
            pipe(a,[(s*.75,-1.27,.50),(s*.74,-.30,.40),(s*.74,.85,.49)],.042,dark)
        for y,z in [(.51,1.38),(-.52,1.46)]:pipe(a,[(-.62,y,z),(.62,y,z)],.049,alloy)
        for s in [-1,1]:pipe(a,[(s*.66,-1.17,.72),(-s*.58,-.53,1.41)],.035,alloy)
    elif k=='lido':
        for s in [-1,1]:
            pts=[(s*w*.91,-end+.035,belt+.31),(s*w*.88,-end+.08,belt-.04),(s*w*.99,-.95,belt+.03)]
            face(a,pts,'paint');pipe(a,[pts[0],pts[2]],.026,alloy)
            pipe(a,[(s*(w*at(y,widths)+.01),y,belt-.14+.052*cos(y)) for y in sy],.021,alloy)
    elif k=='horizon':
        for i in range(4):
            x=-.45+i*.30;pipe(a,[(x,nose+.012,.77),(x,nose+.095,.77)],.118,dark)
            pipe(a,[(x,nose+.091,.77),(x,nose+.104,.77)],.098,'e1cb91','enamel',16)
        box(a,(0,-1.46,1.05),(1.60,.24,.075),dark,.025)
        for s in [-1,1]:box(a,(s*.55,-1.42,.958),(.059,.081,.19),dark)
    elif k=='mercado':
        box(a,(0,-1.045,1.56),(2*w+.03,2.63,1.35),'paint',.044)
        box(a,(0,-1.045,2.25),(2*w+.07,2.69,.074),ivory,.025)
        for s in [-1,1]:
            for j in range(3):box(a,(s*(w+.019),-1.03,1.54+j*.117),(.022,1.94-.28*j,.063),ivory if j!=1 else 'c1784c')
        box(a,(0,-2.373,1.55),(1.64,.032,1.10),alloy,.012)
        for j in range(9):box(a,(0,-2.394,1.06+j*.123),(1.60,.015,.012),trim,.002)
    for side in [-1,1]:
        for axle in [-lx,lx]:
            x=side*(w-.10 if k!='jetty' else w);a.joint('wheel_'+('L' if side<0 else 'R')+('F' if axle>0 else 'R'),(x,axle,r),'body')
            wheel(a,x,axle,r,k)
    a.finish()

# The existing CC0 face and hair assets share the same coordinate frame as these outfits.
source=out/'coast-picture-studio.blend'
source_roles=['mara','rico','ramon']
with B.data.libraries.load(str(source.resolve()),link=False) as (available,loaded):
    loaded.collections=['Workshop  •  '+r for r in source_roles]
templates={}
prefixes=('Adapted anatomical face','Eyebrow hair','Cut and styled hair','Sclera','Iris','Pupil')
for role,c in zip(source_roles,loaded.collections):
    pieces=[]
    for ob in c.objects:
        if not ob.name.startswith(prefixes):continue
        geo=ob.data
        if ob.name.startswith(('Adapted','Cut and styled')):
            tmp=ob.copy();tmp.data=geo.copy();scene.collection.objects.link(tmp)
            dec=tmp.modifiers.new('Street distance topology','DECIMATE')
            dec.ratio=.31 if ob.name.startswith('Adapted') else .64
            evaluated=tmp.evaluated_get(B.context.evaluated_depsgraph_get())
            geo=B.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=B.context.evaluated_depsgraph_get())
            B.data.objects.remove(tmp,do_unlink=True)
        pieces.append((ob.name,geo,ob.location.copy()))
    templates[role]=pieces

# name, occupation, face template, body width, stature, shirt, legwear, accent, skin, head width
people=[
 ('grease','Marina mechanic','rico',1.13,1.00,'365a62','365a62','c56c45','b78266',1.02),
 ('skater','Boardwalk skater','mara',.91,.94,'a9bfc0','526481','eca871','a66e55',.95),
 ('florist','Market florist','mara',1.12,.92,'b8797c','4e6260','83966d','99674f',1.08),
 ('rigger','Dock rigger','ramon',1.18,1.03,'43566a','434954','df8f3e','a8745c',1.08),
 ('guard','Beach lifeguard','mara',1.02,1.04,'e4c38f','b74047','da5144','aa7157',1.0),
 ('busker','Guitar busker','rico',.92,1.01,'a7714f','485060','d8bea0','b17c62',.96),
 ('lens','Street photographer','mara',1.00,.97,'7c8f96','584b4a','c9af7a','ae785c',.99),
 ('courier','Cycle messenger','rico',.93,.96,'668b7c','394f60','e4a34c','b67f61',.94),
 ('cook','Night-market cook','ramon',1.19,.96,'e4ddc9','41474c','728ba0','ac7961',1.10),
 ('reed','Saxophonist','ramon',.98,1.01,'d7c4ac','554950','704758','ae7c66',.94),
 ('angler','Pier angler','ramon',1.09,.94,'70838a','655747','b0a076','ab785e',1.04)]

def dress(a,z,w,d,c):
    loft(a,[(0,0,h,rw*w,rd*d) for h,rw,rd in z],c)
def flatbadge(a,x,y,z,w,h,c):
    box(a,(x,y,z),(w,.014,h),c,.003)
def strap(a,pts,width,c):
    vs=[]
    for x,y,z in pts:vs.extend([(x-width/2,y,z),(x+width/2,y,z)])
    a.put(vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(pts)-1)],c,'soft')
def camera(a,x,y,z):
    box(a,(x,y,z),(.174,.08,.111),'282d31',.015)
    box(a,(x-.033,y,z+.068),(.068,.058,.03),alloy,.006)
    pipe(a,[(x+.018,y+.018,z),(x+.018,y+.104,z)],.048,trim)
    pipe(a,[(x+.018,y+.098,z),(x+.018,y+.106,z)],.038,'759197','enamel',16)
def hat(a,style,y=0):
    if style=='helmet':
        loft(a,[(0,y,1.72,.123,.141),(0,y,1.75,.129,.147),(0,y,1.811,.114,.130),(0,y,1.838,.067,.074),(0,y,1.845,.030,.04)],'e5a64a','enamel',24)
        box(a,(0,y+.082,1.727),(.264,.166,.025),'dc9a46',.012)
        for x in [-.040,0,.040]:pipe(a,[(x,y-.09,1.792),(x,y-.041,1.837),(x,y+.052,1.834),(x,y+.092,1.799)],.007,'d4923c')
    elif style=='toque':
        loft(a,[(0,0,1.713,.119,.131),(0,0,1.795,.117,.135),(0,0,1.825,.132,.145)],ivory)
        for j in range(9):
            t=j*2*pi/9;ball(a,(.079*cos(t),.084*sin(t),1.839),(.065,.071,.062),'eee5d0')
        ball(a,(0,0,1.863),(.091,.101,.06),'eee5d0')
    elif style in ('brim','bucket'):
        col='887657' if style=='brim' else '73827a'
        loft(a,[(0,0,1.719,.177,.19),(0,0,1.733,.180,.195),(0,0,1.762,.118,.132),(0,-.006,1.814,.103,.109),(0,-.010,1.826,.075,.089)],col)
        loft(a,[(0,0,1.744,.123,.137),(0,0,1.767,.118,.133)],dark)
    elif style=='beanie':
        loft(a,[(0,.005,1.681,.116,.135),(0,0,1.715,.129,.144),(0,-.006,1.78,.117,.132),(0,-.034,1.822,.081,.088),(0,-.047,1.84,.038,.039)],'994d42')
        loft(a,[(0,0,1.69,.123,.137),(0,0,1.724,.130,.146)],'af6653')
    else:
        col='435c63' if style=='cap' else 'd8ac71'
        loft(a,[(0,0,1.706,.118,.134),(0,-.002,1.731,.121,.138),(0,-.01,1.79,.097,.112),(0,-.019,1.817,.047,.057)],col)
        ball(a,(0,.116,1.716),(.116,.115,.012),col,'hard')

def outfit(cfg):
    k,title,base,w,height,shirt,pants,accent,skin,hw=cfg
    a=Assembly(k,title);cast[k]=a
    short=k in ('skater','guard','courier')
    a.joint('torso')
    dress(a,[(.806,.157,.099),(.866,.179,.12),(.946,.158,.109)],w,1,pants)
    rows=[(.91,.163,.108),(.98,.176,.119),(1.12,.176,.133),(1.28,.194,.134),(1.365,.210,.115),(1.414,.16,.093),(1.45,.066,.061)]
    if k in ('rigger','cook','angler'):rows=[(z,ww+.018*sin(max(0,min(1,(1.40-z)/.46))*pi),dd+.015) for z,ww,dd in rows]
    dress(a,rows,w,1,shirt)
    loft(a,[(0,.01,1.421,.066,.063),(0,.01,1.501,.058,.057),(0,.017,1.539,.059,.061)],skin)
    if k in ('grease','cook','reed','angler'):
        for s in [-1,1]:
            face(a,[(s*.055,.078,1.45),(s*.105,.080,1.42),(s*.122,.116,1.374),(s*.066,.142,1.337)],accent if k=='reed' else shirt,'soft')
        for j in range(4):ball(a,(0,.137,1.12+j*.063),(.005,.004,.005),ivory,'hard',8)
    if k in ('rigger','angler','reed'):
        for s in [-1,1]:
            sections=[(.976,.188,.144,.22),(1.09,.207,.166,.19),(1.26,.222,.166,.18),(1.368,.225,.146,.30),(1.406,.171,.120,.68)]
            panel=[]
            for z,ww,dd,start in sections:
                for j in range(12):
                    angle=start+(pi+.32-start)*j/11
                    panel.append((s*ww*w*sin(angle),dd*cos(angle),z))
            a.put(panel,[(i,i+1,i+13,i+12) for row in range(4) for i in range(row*12,row*12+11)],accent,'soft',True)
            flatbadge(a,s*.116,.140,1.128,.082,.079,accent)
            if k=='rigger':
                strap(a,[(s*.098,.137,1.382),(s*.122,.158,1.28),(s*.107,.167,1.09)],.031,'dfe5c9')
                strap(a,[(s*.057,.167,1.132),(s*.122,.156,1.132),(s*.182,.132,1.132)],.025,'dfe5c9')
            if k=='angler':
                for z in [1.13,1.245]:box(a,(s*.118,.130,z),(.089,.038,.065),'9d916e',.009)
        if k=='reed':
            ball(a,(0,.103,1.415),(.041,.017,.019),'644855')
    if k in ('cook','florist'):
        strap(a,[(-.080,.062,1.448),(-.086,.139,1.295)],.033,accent)
        strap(a,[(.080,.062,1.448),(.086,.139,1.295)],.033,accent)
        panel=[]
        for z,width,depth in [(.685,.195,.169),(.90,.183,.163),(1.08,.159,.166),(1.24,.123,.164),(1.31,.101,.162)]:
            for j in range(9):
                t=(j-4)/4;panel.append((t*width,depth-.047*t*t,z+.004*cos(6*t)))
        a.put(panel,[(i,i+1,i+10,i+9) for row in range(4) for i in range(row*9,row*9+8)],accent,'soft',True)
        box(a,(0,.169,.99),(.179,.015,.108),accent,.007)
        pipe(a,[(-.080,.179,1.036),(.080,.179,1.036)],.004,ivory)
    if k=='grease':
        for s in [-1,1]:
            flatbadge(a,s*.103,.143,1.236,.083,.097,shirt)
            pipe(a,[(s*.138,.148,1.27),(s*.064,.148,1.27)],.004,ivory)
        flatbadge(a,-.104,.150,1.311,.074,.023,'d89d71')
        box(a,(.181,-.015,.919),(.078,.12,.148),'765941',.014)
        for j in range(2):pipe(a,[(.193,-.061+.047*j,.959),(.208,-.064+.047*j,1.063)],.012,alloy)
        pipe(a,[(0,.129,.969),(0,.144,1.29),(0,.094,1.428)],.005,alloy)
    if k=='skater':
        for z in [1.14,1.18,1.22]:
            loft(a,[(0,0,z,.186*w,.139),(0,0,z+.017,.187*w,.140)],'b57570')
        # The deck stands at the side, with trucks and wheels facing the pavement.
        x=.284*w;y=.062
        box(a,(x,y,.839),(.042,.188,.54),'b88257',.019)
        for z in [.572,1.105]:ball(a,(x,y,z),(.023,.093,.077),'b88257','hard')
        for z in [.659,1.03]:
            pipe(a,[(x+.037,y-.086,z),(x+.037,y+.086,z)],.014,alloy)
            for yy in [y-.078,y+.078]:pipe(a,[(x+.046,yy-.015,z),(x+.046,yy+.015,z)],.032,'edc282')
        pipe(a,[(x+.025,y,.64),(x+.025,y,.96)],.019,'6b9792')
    if k=='guard':
        strap(a,[(-.075,.077,1.422),(-.038,.145,1.30),(0,.151,1.246),(.055,.136,1.337),(.076,.077,1.422)],.009,dark)
        box(a,(0,.156,1.248),(.025,.026,.036),alloy,.005)
        strap(a,[(.130,.089,1.399),(0,.149,1.21),(-.175,.097,.99)],.031,dark)
        ball(a,(-.234*w,.001,.91),(.077,.084,.27),'e65540','enamel')
        pipe(a,[(-.259,.073,.82),(-.287,.097,.86),(-.287,.097,.975),(-.259,.073,1.00)],.014,ivory)
        flatbadge(a,.098,.135,1.30,.044,.061,red);flatbadge(a,.098,.138,1.30,.070,.026,red)
    if k=='florist':
        for j in range(8):
            t=j*2.40;xx=-.207+.075*cos(t);yy=.168+.051*sin(t);zz=1.218+.068*sin(j*1.41)
            pipe(a,[(-.216,.076,.948),(xx,yy,zz)],.0052,'658459')
            for m in range(5):
                f=m*2*pi/5;ball(a,(xx+.019*cos(f),yy+.017*sin(f),zz),(.019,.018,.016),['cc7775','e1bb66','b294bb'][j%3],n=8)
            ball(a,(xx,yy,zz+.009),(.011,.011,.011),'d5b46c',n=8)
    if k in ('busker','lens','courier'):
        strap(a,[(-.112,.081,1.423),(-.067,.142,1.32),(.068,.155,1.16),(.165,.111,1.036)],.035 if k!='courier' else .055,trim)
    if k=='busker':
        x=.078;y=.172;z=1.058
        for xx,zz,rx,rz in [(x,z,.130,.146),(x-.064,z+.126,.093,.104)]:
            ball(a,(xx,y,zz),(rx,.046,rz),'ac7647','enamel')
        pipe(a,[(.012,.181,1.18),(-.194,.177,1.465)],.026,walnut)
        ball(a,(-.198,.178,1.468),(.043,.027,.056),walnut,'hard')
        pipe(a,[(.055,.213,1.117),(.055,.222,1.117)],.040,dark,'hard',16)
        box(a,(.083,.216,1.014),(.070,.011,.017),dark)
        for j in range(4):pipe(a,[(.075+j*.005,.223,1.015),(-.196+j*.004,.211,1.47)],.0012,ivory)
    if k=='lens':
        camera(a,.061,.164,1.171)
        box(a,(-.189,.011,.962),(.119,.146,.157),walnut,.026)
    if k=='courier':
        box(a,(.01,-.15,1.184),(.368,.15,.347),'ba8146',.044)
        box(a,(.01,-.232,1.25),(.343,.032,.164),'d49c55',.015)
        for s in [-1,1]:box(a,(s*.119,-.25,1.17),(.032,.024,.102),trim,.008)
        box(a,(.158,.097,1.01),(.13,.06,.108),accent,.012)
    if k=='cook':
        for j in range(3):flatbadge(a,.099,.15,1.25-j*.06,.010,.010,dark)
        for j in range(3):pipe(a,[(.143+.013*j,.147,1.033),(.152+.013*j,.141,1.104)],.005,alloy)
        strap(a,[(.162,.10,1.02),(.179,.12,.871),(.172,.123,.799)],.069,'d5c3ae')
    if k=='reed':
        strap(a,[(-.057,.091,1.419),(0,.145,1.263),(.061,.092,1.419)],.011,dark)
        pipe(a,[(-.046,.166,1.337),(-.027,.192,1.358),(.022,.185,1.342),(.115,.178,1.055),(.146,.181,1.011),(.195,.178,1.037),(.203,.174,1.128)],.020,brass)
        loft(a,[(.202,.175,1.091,.020,.02),(.205,.174,1.138,.029,.026),(.207,.174,1.164,.059,.055)],brass,'metal')
        ball(a,(.207,.175,1.162),(.051,.047,.004),'644d36','hard')
        for j in range(6):ball(a,(.021+j*.015,.205,1.289-j*.039),(.010,.007,.012),ivory,'hard',8)
    if k=='angler':
        box(a,(.231,.017,.724),(.19,.133,.152),'546e69',.018)
        pipe(a,[(.177,.021,.798),(.183,.021,.845),(.278,.021,.845),(.284,.021,.798)],.009,walnut)
    a.joint('head',(0,0,1.483),'torso')
    hats={'grease':'cap','rigger':'helmet','guard':'visor','busker':'beanie','courier':'cap','cook':'toque','reed':'brim','angler':'bucket'}
    if k in hats:hat(a,hats[k])
    if k in ('lens','angler','reed'):
        for s in [-1,1]:
            box(a,(s*.050,.143,1.649),(.08,.010,.037),dark,.006)
            pipe(a,[(s*.086,.141,1.654),(s*.112,.069,1.655),(s*.107,.004,1.638)],.0035,alloy)
        pipe(a,[(-.015,.146,1.651),(0,.154,1.658),(.015,.146,1.651)],.003,alloy)
    if k=='angler':
        for s in [-1,1]:ball(a,(s*.020,.143,1.577),(.027,.007,.008),'827870',n=10)
    if k=='florist':
        ball(a,(0,-.126,1.673),(.073,.068,.071),'493a39')
        for j in range(4):ball(a,(-.08+j*.018,.004,1.765+.009*j),(.015,.014,.015),['c4797a','d8a363'][j%2],n=8)
    parts=templates[base]
    if k in ('florist','lens'):
        parts=[p for p in parts if not p[0].startswith('Cut and styled')]+[p for p in templates['ramon'] if p[0].startswith('Cut and styled')]
    for name,g,loc in parts:
        if name.startswith('Cut and styled') and k in hats:
            # Close-cropped sides fit below working headgear without clipping its crown.
            if hats[k] in ('helmet','toque','brim','bucket','visor','cap','beanie'):
                continue
        ob=B.data.objects.new(k+' '+name.split('.')[0],g);a.coll.objects.link(ob);ob.parent=a.piv['head']
        ob.location=(loc.x*hw,loc.y,loc.z-1.483);ob.scale=(hw,1,1)
    if k in hats:
        for s in [-1,1]:
            ball(a,(s*.093,.007,1.682),(.022,.064,.047),'6d6259' if k in ('angler','reed') else '3e3530')
        ball(a,(0,-.080,1.682),(.107,.049,.066),'6d6259' if k in ('angler','reed') else '3e3530')
    for s,lr in [(-1,'L'),(1,'R')]:
        x=s*.098*w;a.joint('leg_'+lr,(x,0,.85))
        loft(a,[(x,0,.849,.098*w,.102),(x,-.005,.78,.102*w,.112),(x,0,.63,.086*w,.097),(x,0,.447,.072*w,.077)],pants)
        if short:loft(a,[(x,0,.447,.073*w,.077),(x,0,.531,.082*w,.084)],pants)
        a.joint('knee_'+lr,(x,0,.444),'leg_'+lr)
        legcolor=skin if short else pants
        loft(a,[(x,0,.454,.072*w,.079),(x,-.007,.351,.078*w,.083),(x,-.001,.228,.059*w,.062),(x,.005,.094,.052*w,.054)],legcolor)
        if short:loft(a,[(x,.003,.092,.055,.055),(x,.002,.192,.063,.064)],ivory)
        boot='634e41' if k in ('grease','rigger','angler') else '4b5155' if k in ('courier','reed','cook') else '9f7966'
        loft(a,[(x,.048,.035,.069*w,.121),(x,.052,.056,.071*w,.126),(x,.044,.078,.069*w,.118),(x,.018,.104,.061*w,.085),(x,.009,.121,.054*w,.063)],boot)
        loft(a,[(x,.049,.018,.066*w,.118),(x,.049,.029,.071*w,.124),(x,.049,.043,.071*w,.124)],trim if not short else ivory)
        for j in range(3):box(a,(x,.071+j*.024,.11-j*.007),(.068,.009,.007),ivory,.002)
        ax=s*.198*w; a.joint('arm_'+lr,(ax,0,1.377),'torso')
        ux=ax+s*.032
        loft(a,[(ax,0,1.397,.064,.078),(ax+s*.017,0,1.354,.080,.082),(ux,0,1.24,.065,.067),(ux,0,1.177,.060,.062)],shirt)
        if k=='rigger':loft(a,[(ux,0,1.208,.064,.067),(ux,0,1.236,.068,.069)],ivory)
        a.joint('elbow_'+lr,(ux,0,1.175),'arm_'+lr)
        long=k in ('grease','cook','angler','busker','reed')
        loft(a,[(ux,0,1.181,.058,.061),(ux+s*.009,.006,1.088,.055,.056),(ux+s*.011,.018,.986,.042,.043)],shirt if long else skin)
        ball(a,(ux+s*.011,.019,.944),(.042,.037,.065),skin)
        ball(a,(ux-s*.019,.041,.957),(.020,.022,.038),skin,n=10)
    a.finish()
    # This transform stays on the template root when cloned by the game.
    a.root.scale=(height,height,height)

def aim(o,focus):o.rotation_euler=(Vector(focus)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,at,focus,power,size,tint):
    light=B.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size;light.color=tint
    o=B.data.objects.new(name,light);scene.collection.objects.link(o);o.location=at;aim(o,focus)
def build():
    for spec in cars:build_car(spec)
    for spec in people:outfit(spec)
    assets={**fleet,**cast}
    for filename,items in [('street-fleet',fleet),('street-residents',cast)]:
        B.ops.object.select_all(action='DESELECT')
        for a in items.values():
            for o in a.coll.objects:o.select_set(True)
        B.ops.export_scene.gltf(filepath=str(out/(filename+'.glb')),use_selection=True,export_format='GLB',export_animations=False,export_extras=True,export_yup=True,export_cameras=False,export_lights=False)
    for i,(key,a) in enumerate(fleet.items()):a.root.location=((i%4-1.5)*4.3,(i//4-1)*7,0)
    for i,(key,a) in enumerate(cast.items()):a.root.location=((i-5)*1.36,12.5,0)
    scene.world=B.data.worlds.new('Hazy morning');scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.63,.70,.79,1);bg.inputs[1].default_value=.55
    B.ops.mesh.primitive_plane_add(size=180);floor=B.context.object;floor.name='Studio floor';floor.location.z=-.018
    floor.data.materials.append(shader('Shell limestone',.86,0,'bfb9ae'))
    area('Large north window',(2,4,6),(0,0,.8),820,5,(1,.88,.78))
    area('Strip reflection',(-3,-3,5),(0,0,1),1000,4,(.77,.87,1))
    area('Soft fill',(3,-1,3),(0,0,1),275,3,(1,.97,.89))
    B.ops.object.camera_add(location=(15,25,16));cam=B.context.object;scene.camera=cam;aim(cam,(0,1,1));cam.data.type='ORTHO';cam.data.ortho_scale=30
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.view_settings.view_transform='AgX'
    scene.render.resolution_percentage=100;scene.render.resolution_x=1500;scene.render.resolution_y=940
    info=B.data.texts.new('Street cast and fleet');info.write('PALM COAST / STREET COLLECTION\n\n'+
        '\n'.join(key+' — '+a.coll.name for key,a in assets.items())+
        '\n\nCharacter face, eyebrow and hair foundations adapted from the MakeHuman CC0 system assets. Vehicle geometry, costumes and equipment made for Palm Coast.\nhttps://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html\n'+
        'Shape references: wood paneling, roof racks and rescue-can proportions\nhttps://rmsothebys.com/auctions/as18/lots/r0222-1964-volkswagen-beetle-station-wagon-custom/\nhttps://www.oursouthbay.com/when-this-l-a-county-lifeguard-isnt-saving-lives-hes-living-for-the-ocean/\n')
    for screen in B.data.screens:
        for ar in screen.areas:
            if ar.type=='VIEW_3D':
                sp=ar.spaces.active;sp.region_3d.view_distance=24;sp.region_3d.view_location=(0,2,.6)
                sp.region_3d.view_rotation=cam.rotation_euler.to_quaternion();sp.shading.color_type='VERTEX'
    B.ops.object.select_all(action='DESELECT');B.context.preferences.filepaths.save_version=0
    B.ops.wm.save_as_mainfile(filepath=str(out/'palm-street-collection.blend'),compress=True)
    if '--portraits' not in sys.argv:return
    dest=Path(sys.argv[sys.argv.index('--portraits')+1]);dest.mkdir(parents=True,exist_ok=True)
    for key,a in assets.items():
        for other,g in assets.items():g.coll.hide_render=other!=key
        a.root.location=(0,0,0);person=key in cast
        scene.render.resolution_x=470;scene.render.resolution_y=465 if person else 315
        cam.location=(1.10,5.1,1.68) if person else ((-5,4.7,3.0) if key=='barranca' else (5,4.0,2.80))
        if key=='barranca':cam.location=(-5,-4.1,3.0)
        if key=='nara':cam.location=(5,-3.7,2.9)
        aim(cam,(0,0,.96 if person else 1.01 if key in ('mercado','marea') else .75))
        cam.data.ortho_scale=2.12 if person else next(c[2] for c in cars if c[0]==key)*1.20
        scene.render.filepath=str(dest/(key+'.png'));B.ops.render.render(write_still=True)

if __name__=='__main__':build()
