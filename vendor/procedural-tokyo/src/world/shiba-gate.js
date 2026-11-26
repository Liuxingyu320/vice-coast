// Detail for the Shiba tile only. The native PLATEAU roof ridge fixes its rotation
// and the source building fixes its ground datum. Local coordinates are east, north, up.
import {inflateSync} from 'three/addons/libs/fflate.module.js';
import data from './sangedatsumon.json' with {type:'json'};
import {WALL} from './constants.js';

let packed;
function readDetail() {
  if(packed) return packed;
  const bytes=inflateSync(Uint8Array.from(atob(data.deflate),c=>c.charCodeAt(0)));
  const nv=data.vertices, nf=data.triangles;
  const points=new Int16Array(bytes.buffer,bytes.byteOffset,nv*3);
  const faces=new Uint16Array(bytes.buffer,bytes.byteOffset+nv*6,nf*3);
  const paints=new Uint8Array(bytes.buffer,bytes.byteOffset+(nv+nf)*6,nf);
  const colors=data.palette.map(hex=>[0,2,4].map(i=>{
    const c=parseInt(hex.slice(i,i+2),16)/255;
    return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
  }));
  return packed={points,faces,paints,colors};
}

export function drawGate(building, emit) {
  let peak=-Infinity;
  for(const f of building.surfaces) for(const r of f.rings)
    for(let i=1;i<r.length;i+=3) peak=Math.max(peak,r[i]);
  let north=null,south=null;
  for(const f of building.surfaces) for(const r of f.rings)
    for(let i=0;i<r.length;i+=3) if(r[i+1]>=peak-.08) {
      if(!north || r[i+2]<north[1]) north=[r[i],r[i+2]];
      if(!south || r[i+2]>south[1]) south=[r[i],r[i+2]];
    }
  if(!north||!south||Math.hypot(north[0]-south[0],north[1]-south[1])<1) return false;
  const cx=(north[0]+south[0])/2,cz=(north[1]+south[1])/2;
  const len=Math.hypot(north[0]-south[0],north[1]-south[1]);
  const nx=(north[0]-south[0])/len,nz=(north[1]-south[1])/len;
  const {points,faces,paints,colors}=readDetail();
  const col=[];
  for(let i=0;i<points.length;i+=3) {
    const e=points[i]/100,n=points[i+1]/100;
    col.push([cx-e*nz+n*nx,building.base+points[i+2]/100,cz+e*nx+n*nz]);
  }
  const tileColor=2;
  for(let f=0;f<paints.length;f++) {
    const p=col[faces[3*f]],q=col[faces[3*f+1]],r=col[faces[3*f+2]],paint=paints[f];
    const a=q[0]-p[0],b=q[1]-p[1],c=q[2]-p[2],d=r[0]-p[0],e=r[1]-p[1],g=r[2]-p[2];
    const normal=[b*g-c*e,c*d-a*g,a*e-b*d],size=Math.hypot(...normal);
    if(size<1e-9) continue;
    normal[0]/=size;normal[1]/=size;normal[2]/=size;
    const layer=paint===tileColor?WALL.ROOF:paint===1||paint===0?WALL.SIDING:WALL.PLASTER;
    for(const pt of [p,q,r]) emit(pt,normal,colors[paint],layer);
  }
  return true;
}
