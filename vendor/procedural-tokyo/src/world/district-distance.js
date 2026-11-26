// Keep the full mapped district in the distance while the original streamer builds
// full-detail tiles around the camera. Terrain and buildings hand off independently.
import * as THREE from 'three';

export async function addDistrictDistance(streamer,scene,materials) {
  const {manifest}=streamer, {bounds,tileSize}=manifest;
  const data=await (await fetch('tiles/shiba/distance.bin')).arrayBuffer(), view=new DataView(data);
  const light=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.96});
  const city=new THREE.Group(), tiles=[];
  city.name='芝公园 · 远景';
  let at=0;
  for(const descriptor of manifest.tiles) {
    const x=view.getInt16(at,true),z=view.getInt16(at+2,true);
    if(x!==descriptor.x||z!==descriptor.z) throw Error('Shiba distance tile mismatch');
    const vertices=view.getUint32(at+4,true),count=view.getUint32(at+8,true);
    at+=12;
    const q=new Int16Array(data,at,vertices*3);at+=q.byteLength;
    const colours=new Uint8Array(data,at,vertices*3);at+=colours.byteLength;
    // The colour byte count can leave the index block unaligned.
    const faces=new Uint32Array(data.slice(at,at+count*4));at+=count*4;at+=((4-at%4)%4);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(q,v=>v*.1),3));
    geometry.setAttribute('color',new THREE.Uint8BufferAttribute(colours,3,true));
    geometry.setIndex(new THREE.BufferAttribute(vertices<=65536?Uint16Array.from(faces):faces,1));
    let buildings=null;
    if(count) {
      geometry.computeVertexNormals();geometry.computeBoundingSphere();
      buildings=new THREE.Mesh(geometry,light);buildings.userData.tile=x+'_'+z;buildings.userData.detail='outline';city.add(buildings);
    }
    const x0=Math.max(x*tileSize,bounds.minX),x1=Math.min((x+1)*tileSize,bounds.maxX);
    const z0=Math.max(z*tileSize,bounds.minZ),z1=Math.min((z+1)*tileSize,bounds.maxZ);
    let ground=null;
    if(x1>x0&&z1>z0) {
      const grid=new THREE.PlaneGeometry(x1-x0,z1-z0,8,8).rotateX(-Math.PI/2);
      grid.translate((x0+x1)/2,0,(z0+z1)/2);
      const pos=grid.getAttribute('position');
      for(let j=0;j<pos.count;j++) pos.setY(j,streamer.ground(pos.getX(j),pos.getZ(j))-.25);
      grid.computeVertexNormals();grid.computeBoundingSphere();
      ground=new THREE.Mesh(grid,materials.terrain);ground.userData.tile=x+'_'+z;ground.userData.detail='ground';city.add(ground);
    }
    tiles.push({key:x+'_'+z,buildings,ground,facade:null,source:null});
  }
  if(at!==data.byteLength) throw Error('Shiba distance geometry length mismatch');
  scene.add(city);
  return {group:city, update(){
    for(const entry of tiles) {
      const t=streamer.tiles.get(entry.key);
      if(t?.group!==entry.source) {
        entry.source=t?.group;entry.facade=t?.group?.children.find(o=>o.userData.facade);
      }
      if(entry.ground) entry.ground.visible=!t?.group?.children[0]?.visible;
      if(entry.buildings) entry.buildings.visible=!(entry.facade?.visible || (t?.state==='ready'&&!t.buildings));
    }
  }};
}
