// Low-detail silhouettes compiled from each Shiba tile, with courtyard holes.
import earcut from 'earcut';
import {BFLAG,MATERIAL} from '../shared/tileformat.js';
import {buildingMesh} from './meshing.js';

const linearByte=c=>Math.round(255*(c/255<=0.04045?c/255/12.92:((c/255+.055)/1.055)**2.4));
export function outlineTile(tile) {
  const xyz=[],color=[],indices=[];
  function vertex(x,y,z,c) {
    const i=xyz.length/3;
    xyz.push(Math.round(x*10),Math.round(y*10),Math.round(z*10));
    color.push(...c);return i;
  }
  for(const [i,b] of tile.buildings.entries()) {
    if(b.flags&BFLAG.LATTICE) {
      // Preserve the orange-and-white lattice when the tower leaves the detailed radius.
      const model=buildingMesh([b],tile.tx,tile.tz), cache=new Map();
      for(let k=0;k<model.position.length;k+=3) {
        const p=model.position.subarray(k,k+3),c=Array.from(model.color.subarray(k,k+3),v=>Math.min(255,Math.round(v*255)));
        const key=[...p].map(v=>Math.round(v*10)).concat(c).join(',');
        if(!cache.has(key)) cache.set(key,vertex(...p,c));
        indices.push(cache.get(key));
      }
      continue;
    }
    if(b.height<8) continue;
    const tone=(((i*67+tile.tx*37+tile.tz*23)%29)+29)%29;
    const glass=((b.hint>>>24)&15)===MATERIAL.GLASS || b.height>80;
    const shade=(glass?66:95)+tone;
    const surveyed=b.hint>>>31 ? [(b.hint>>>16)&255,(b.hint>>>8)&255,b.hint&255] : null;
    const wall=surveyed ? surveyed.map(c=>Math.round(c*.7)) : [shade-6,shade-2,shade+(glass?12:2)];
    const rgb=wall.map(linearByte);
    const top=b.base+b.height;
    for(const rings of b.polygons) {
      const coords=[],holes=[],roof=[];
      for(const [r,ring] of rings.entries()) {
        if(r) holes.push(coords.length/2);
        const bottom=[],rim=[];
        for(let j=0;j<ring.length;j+=2) {
          const x=ring[j],z=ring[j+1];
          bottom.push(vertex(x,b.base-2,z,rgb));rim.push(vertex(x,top,z,rgb));
          roof.push(rim.at(-1));coords.push(x,z);
        }
        let area=0;for(let k=0,j=ring.length-2;k<ring.length;j=k,k+=2) area+=ring[j]*ring[k+1]-ring[k]*ring[j+1];
        for(let k=0;k<rim.length;k++) {
          const n=(k+1)%rim.length,a=bottom[k],b0=bottom[n],c=rim[n],d=rim[k];
          if((area<0)!==Boolean(r)) indices.push(a,b0,c,a,c,d);else indices.push(a,c,b0,a,d,c);
        }
      }
      const faces=earcut(coords,holes,2);
      for(let j=0;j<faces.length;j+=3) indices.push(roof[faces[j]],roof[faces[j+2]],roof[faces[j+1]]);
    }
  }
  return {xyz:Int16Array.from(xyz), color:Uint8Array.from(color), indices:Uint32Array.from(indices)};
}
