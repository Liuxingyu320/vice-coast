import { AREA, BFLAG, PROP, decodeTile } from '../../../vendor/procedural-tokyo/src/shared/tileformat.js';
import { roadMesh } from '../../../vendor/procedural-tokyo/src/world/meshing.js';
import { createDraper } from '../../../vendor/procedural-tokyo/src/world/drape.js';
import {drawGate} from '../../../vendor/procedural-tokyo/src/world/shiba-gate.js';
import { createCollision, inRing } from '../collision.js';

const BUCKET = 40;
// Measure each surface type using the original mesher on flat terrain. This keeps
// the tyre and eye heights in sync with kerbs and courts without duplicating styles.
const testGrid = {x0:0,z0:0,step:5,w:2,h:2,data:new Float32Array(4)};
const surfaceLifts = new Map();
function surfaceLift(area) {
  const key = area.kind + ',' + area.code;
  if (!surfaceLifts.has(key)) {
    const triangle = Float32Array.of(1,1,2,1,1,2);
    const probe = roadMesh([{...area,polygons:[[triangle]]}],testGrid,()=>0);
    let lift=0;
    for(let i=1;i<probe.position.length;i+=3) lift=Math.max(lift,probe.position[i]);
    surfaceLifts.set(key,lift);
  }
  return surfaceLifts.get(key);
}
function spatialIndex() {
  const bins = new Map();
  const key = (i,j) => i + 65536*j;
  return {
    add(row, x0, y0, x1, y1) {
      for(let i=Math.floor(x0/BUCKET);i<=Math.floor(x1/BUCKET);i++)
        for(let j=Math.floor(y0/BUCKET);j<=Math.floor(y1/BUCKET);j++) {
          const id=key(i,j);
          if (!bins.has(id)) bins.set(id,[]);
          bins.get(id).push(row);
        }
    },
    at(x,y) { return bins.get(key(Math.floor(x/BUCKET),Math.floor(y/BUCKET))) || []; }
  };
}
const inPolygon = (x,y,rings) => inRing(x,y,rings[0]) && !rings.slice(1).some(h=>inRing(x,y,h));
const round = n => Math.round(n*100)/100;
function points(ring) {
  const list=[];
  for(let i=0;i<ring.length;i+=2) list.push([round(ring[i]),round(-ring[i+1])]);
  return list;
}
function rectangle(x,y,w,h,angle=0) {
  const c=Math.cos(angle), s=Math.sin(angle);
  return [[-w,-h],[w,-h],[w,h],[-w,h]].map(([a,b])=>[x+a*c-b*s,y+a*s+b*c]);
}
function towerFeet(b) {
  let lo=Infinity,x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
  const vertices=[];
  for(const face of b.surfaces) for(const ring of face.rings)
    for(let i=0;i<ring.length;i+=3) {
      const [x,y,z]=ring.subarray(i,i+3);
      vertices.push([x,y,z]);lo=Math.min(lo,y);x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);
    }
  const x=(x0+x1)/2,z=(z0+z1)/2;
  let far=0,angle=0;
  for(const [px,py,pz] of vertices) {
    const d=Math.hypot(px-x,pz-z);
    if(py<lo+4 && d>far){ far=d;angle=Math.atan2(pz-z,px-x)-Math.PI/4; }
  }
  const r=far/Math.SQRT2, half=r*.27/2, offset=r-half, feet=[];
  for(const a of [-offset,offset]) for(const b of [-offset,offset])
    feet.push([rectangle(x+a*Math.cos(angle)-b*Math.sin(angle),-z-a*Math.sin(angle)-b*Math.cos(angle),half,half,-angle)]);
  return feet;
}
// Slice the detailed Sanmon at walking height. Its three passages stay open.
function gateWalls(building) {
  const y=building.base+1.1, triangles=[], walls=[];
  drawGate(building,point=>{
    triangles.push(point);
    if(triangles.length!==3) return;
    const hits=[];
    for(let i=0;i<3;i++) {
      const a=triangles[i], b=triangles[(i+1)%3];
      if((a[1]>y)===(b[1]>y)) continue;
      const f=(y-a[1])/(b[1]-a[1]);
      hits.push([a[0]+f*(b[0]-a[0]),-a[2]-f*(b[2]-a[2])]);
    }
    triangles.length=0;
    if(hits.length!==2) return;
    const [[x,z],[xx,zz]]=hits, length=Math.hypot(xx-x,zz-z);
    if(length>.01) walls.push([rectangle((x+xx)/2,(z+zz)/2,length/2,.07,Math.atan2(zz-z,xx-x))]);
  });
  return walls;
}
const propSizes = new Map([[PROP.TREE,[.23,.23]],[PROP.POLE,[.14,.14]],[PROP.LIGHT,[.13,.13]],[PROP.VENDING,[.6,.45]],[PROP.SIGNAL,[.14,.14]],[PROP.BENCH,[.9,.32]],[PROP.BOLLARD,[.13,.13]],[PROP.POST_BOX,[.3,.3]]]);

export function buildNavigation({manifest, roads, structures, grid, surface, tileBytes}) {
  const {minX,maxX,minZ,maxZ}=manifest.bounds;
  const boundary=[[minX,-maxZ],[maxX,-maxZ],[maxX,-minZ],[minX,-minZ]];
  const land=[], solids=[], surfaces=spatialIndex(), paths=spatialIndex(), driveSegments=[];
  for(const tile of manifest.tiles) {
    const bytes=tileBytes(tile.file);
    const raw=decodeTile(bytes.byteOffset===0 && bytes.byteLength===bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer);
    for(const b of raw.buildings) {
      let ringsList=b.flags&BFLAG.LATTICE ? towerFeet(b) : b.polygons.map(poly=>poly.map(points));
      if(tile.x===1 && tile.z===0 && b.surfaces.length && ringsList.some(poly=>inPolygon(413.53,-147.085,poly))) ringsList=gateWalls(b);
      for(const rings of ringsList) if(rings[0]?.length>=3) solids.push(rings);
    }
    for(const a of raw.areas) {
      if (a.kind===AREA.MARK_WHITE || a.kind===AREA.MARK_YELLOW) continue;
      for(const poly of a.polygons) {
        const rings=poly.map(points), xs=rings[0].map(p=>p[0]), ys=rings[0].map(p=>p[1]);
        if([AREA.PARK,AREA.WOOD,AREA.WATER].includes(a.kind)) land.push({kind:a.kind,rings});
        surfaces.add({kind:a.kind,lift:surfaceLift(a),rings}, Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys));
      }
    }
    for(const p of raw.props) {
      const size=propSizes.get(p.kind);
      if(size) solids.push([rectangle(p.x,-p.z,size[0]*p.scale,size[1]*p.scale,p.rot)]);
    }
    for(let i=0;i<raw.walls.length;i+=5) {
      const [x0,z0,x1,z1]=raw.walls.subarray(i,i+4);
      const len=Math.hypot(x1-x0,z1-z0);
      if(len>.1) solids.push([rectangle((x1+x0)/2,-(z1+z0)/2,len/2,.12,Math.atan2(z0-z1,x1-x0))]);
    }
  }
  const collision=createCollision(boundary,{solids,wells:[],walks:[]});
  const ground=createDraper(grid,surface,manifest.tileSize).height;
  function addPath(pts,half,kind,oneway=1) {
    for(let i=3;i<pts.length;i+=3) {
      const x=pts[i-3],y=-pts[i-1],dx=pts[i]-x,dy=-pts[i+2]-y;
      const length=Math.hypot(dx,dy);
      if(length<.14) continue;
      const s={x,y,dx,dy,length,h:pts[i-2],dh:pts[i+1]-pts[i-2],half,kind,oneway};
      paths.add(s,Math.min(x,x+dx)-half,Math.min(y,y+dy)-half,Math.max(x,x+dx)+half,Math.max(y,y+dy)+half);
      if(kind!=='footbridge') driveSegments.push(s);
    }
  }
  for(const r of roads.edges) {
    if(r.tunnel) continue;
    const isMotorway=r.highway.startsWith('motorway'), half=(Math.max(1,r.lanes)*3.3+(isMotorway?2.2:1.4))/2;
    addPath(r.pts,half,(r.flyover||isMotorway)&&!r.span?'flyover':'road',r.oneway);
  }
  for(const f of structures.footbridges) addPath(f.pts,f.width/2,'footbridge');
  function projected(s,x,y) {
    const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(y-s.y)*s.dy)/s.length**2));
    const px=s.x+s.dx*t, py=s.y+s.dy*t;
    return {x:px,y:py,z:s.h+s.dh*t,d:Math.hypot(px-x,py-y)};
  }
  function support(x,y,prior,drive=false) {
    let water=false, pavement=false, lift=0;
    for(const a of surfaces.at(x,y)) if(inPolygon(x,y,a.rings)) {
      if(a.kind===AREA.WATER||a.kind===AREA.POOL) water=true;
      else {
        lift=Math.max(lift,a.lift);
        if([AREA.ROAD,AREA.CARRIAGEWAY,AREA.SIDEWALK,AREA.PATH].includes(a.kind)) pavement=true;
      }
    }
    const base=ground(x,-y)+lift;
    let best=water&&!pavement?null:{z:base,layer:'ground'};
    for(const s of paths.at(x,y)) {
      if(s.kind==='road'||(drive&&s.kind==='footbridge')) continue;
      const hit=projected(s,x,y);
      if(hit.d>s.half-(drive?.65:.12)||hit.z<base+.10) continue;
      if(Number.isFinite(prior)&&(!best||Math.abs(hit.z-prior)<Math.abs(best.z-prior))) best={z:hit.z,layer:s.kind};
    }
    return best;
  }
  function canWalk(x,y) { return collision.passable(x,y) && support(x,y,undefined)!==null; }
  function roadNear(x,y,upper=false) {
    let best=null, dist=Infinity;
    for(const s of driveSegments) {
      if((s.kind==='flyover')!==upper) continue;
      const h=projected(s,x,y);
      if(h.d>=dist) continue;
      const heading=Math.atan2(s.dx,s.dy)+(s.oneway===-1?Math.PI:0);
      const lane=Math.min(1.45,s.half*.48);
      const px=h.x-Math.cos(heading)*lane, py=h.y+Math.sin(heading)*lane;
      const floor=support(px,py,upper?h.z:undefined,true);
      if(!floor||collision.contact(px,py,heading)||(upper&&floor.layer!=='flyover')) continue;
      best={x:px,y:py,z:floor.z,heading,layer:floor.layer};dist=h.d;
    }
    return best;
  }
  function walkNear(x,y) {
    if(canWalk(x,y)) return [x,y];
    for(let r=1;r<=40;r+=1.5) for(let i=0;i<20;i++) {
      const px=x+r*Math.cos(i*Math.PI/10),py=y+r*Math.sin(i*Math.PI/10);
      if(canWalk(px,py)) return [px,py];
    }
    const road=roadNear(x,y);return road&&[road.x,road.y];
  }
  function vehicleContact(actor,x,y,yaw) {
    const hit=collision.contact(x,y,yaw);
    if(hit) return hit;
    const floor=support(x,y,actor.z,true);
    if(!floor||Math.abs(floor.z-actor.z)>.85) return [Math.cos(yaw),-Math.sin(yaw)];
    return null;
  }
  return {land,ground,support,canWalk,roadNear,walkNear,vehicleContact,
    passable:collision.passable, edgeDistance:(x,y)=>Math.min(x-minX,maxX-x,y+maxZ,-minZ-y)};
}
