import * as T from 'three';
import {decodeTile} from './tile.js';
import {readFile} from './storage.js';

function loadGroup(id,materialFor){
  const group=new T.Group();group.name=id;
  for(const part of decodeTile(readFile(id+'.bin'))){
    const geometry=new T.BufferGeometry();
    for(const [name,{array,width}] of Object.entries(part.attributes))geometry.setAttribute(name,new T.BufferAttribute(array,width,name==='normal'));
    geometry.setIndex(new T.BufferAttribute(part.index,1));geometry.computeBoundingSphere();
    const mesh=new T.Mesh(geometry,materialFor(part.layer,part.material));
    mesh.name=part.layer;mesh.receiveShadow=true;
    mesh.castShadow=/^(sites\/|detail\/)/.test(id)&&!part.layer.startsWith('paving-')&&!part.layer.startsWith('skyline-street');
    group.add(mesh);
  }
  return group;
}

export class DistrictTiles {
  constructor(scene,manifest,materialFor){
    this.scene=scene;this.materialFor=materialFor;this.radius=400;this.jobs=[];
    this.items=[];this.active=new Map();this.details=new Map();this.blocks=new Map();
    const size=manifest.cellSize;
    for(const info of manifest.tiles){
      const [kind,address]=info.id.split('/');
      if(kind==='trees')continue;
      if(kind==='sites'){scene.add(loadGroup(info.id,materialFor));continue;}
      const [ix,iz]=address.split('_').map(Number),side=kind==='ground'?size*4:size;
      const tile={...info,kind,address,x:(ix+.5)*side,z:(iz+.5)*side,half:side/2};
      this.items.push(tile);
      if(kind==='detail')this.details.set(address,tile);
      if(kind==='blocks')this.blocks.set(address,tile);
    }
  }
  get count(){return this.active.size;}
  refresh(x,z){
    this.centerX=x;this.centerZ=z;
    const pending=[];
    for(const tile of this.items){
      const d=Math.hypot(Math.max(0,Math.abs(tile.x-x)-tile.half),Math.max(0,Math.abs(tile.z-z)-tile.half));
      const range=tile.kind==='detail'?Math.min(980,Math.max(220,this.radius)):(this.overview?6500:2500);
      const mesh=this.active.get(tile.id);
      if(d>range+(mesh?100:0)){
        if(mesh){
          mesh.removeFromParent();mesh.traverse(m=>m.geometry?.dispose());this.active.delete(tile.id);
          this.syncOutline(tile.address);
        }
        continue;
      }
      if(mesh||tile.kind==='blocks'&&!tile.persistent&&this.hasBuildings(tile.address))continue;
      pending.push({tile,priority:d+(tile.kind==='ground'?-340:tile.kind==='blocks'?190:0)});
    }
    this.jobs=pending.sort((a,b)=>b.priority-a.priority);
  }
  hasBuildings(address){
    const tile=this.details.get(address);
    return tile?.buildings&&this.active.has(tile.id);
  }
  syncOutline(address){
    const block=this.active.get('blocks/'+address);
    if(block){
      const fine=this.hasBuildings(address);
      for(const mesh of block.children)mesh.visible=mesh.name!=='skyline-replaced'||!fine;
    }
  }
  work(budget=4){
    const start=performance.now();
    while(this.jobs.length&&performance.now()-start<budget){
      const {tile}=this.jobs.pop();
      if(tile.kind==='blocks'&&!tile.persistent&&this.hasBuildings(tile.address))continue;
      const group=loadGroup(tile.id,this.materialFor);
      this.scene.add(group);this.active.set(tile.id,group);this.syncOutline(tile.address);
    }
  }
}

// Keep the measured height, crown width and orientation at both levels. Instance each species and sector once.
export function plantTrees(scene,rows,materialFor,coreCount=rows.length){
  const prototypes=Array.from({length:3},(_,kind)=>loadGroup('trees/'+kind,materialFor));
  const bins=new Map(),dummy=new T.Object3D(),coarse=new T.SphereGeometry(1,12,8);
  const points=coarse.attributes.position;
  for(let i=0;i<points.count;i++){
    const x=points.getX(i),y=points.getY(i),z=points.getZ(i),a=Math.atan2(z,x);
    const lobe=1+.105*Math.cos(3*a+1.6*y)+.052*Math.cos(5*a-2.9*y);
    points.setXYZ(i,x*lobe,y+.075*(1-y*y)*Math.cos(3*a),z*lobe);
  }
  coarse.computeVertexNormals();
  const trunk=new T.CylinderGeometry(.58,1,1,6),bark=new T.MeshLambertMaterial({color:0x574c40});
  const leaves=[0x53734a,0x44664a,0x67794b].map(color=>new T.MeshLambertMaterial({color}));
  rows.forEach(([x,north,elevation,height,radius],i)=>{
    const z=-north,kind=i%11<6?0:i%11<9?1:2,side=i<coreCount?90:220;
    const key=side+','+Math.floor(x/side)+','+Math.floor(z/side)+','+kind;
    if(!bins.has(key))bins.set(key,{kind,cx:(Math.floor(x/side)+.5)*side,cz:(Math.floor(z/side)+.5)*side,half:side/2,rows:[]});
    bins.get(key).rows.push({x,z,elevation,height,radius,yaw:i*2.399963});
  });
  for(const group of bins.values()){
    const near=new T.Group();group.near=near;scene.add(near);
    for(const source of prototypes[group.kind].children){
      const mesh=new T.InstancedMesh(source.geometry,source.material,group.rows.length);
      group.rows.forEach((r,i)=>{
        dummy.position.set(r.x,r.elevation,r.z);dummy.scale.set(r.radius*.97,r.height,r.radius*.93);
        dummy.rotation.y=r.yaw;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      });
      mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();near.add(mesh);
    }
    group.far=new T.Group();
    const far=new T.InstancedMesh(coarse,leaves[group.kind],group.rows.length);
    const trunks=new T.InstancedMesh(trunk,bark,group.rows.length),tint=new T.Color();
    group.rows.forEach((r,i)=>{
      dummy.position.set(r.x,r.elevation+r.height*.64,r.z);dummy.scale.set(r.radius,r.height*.35,r.radius*.93);
      dummy.rotation.y=r.yaw;dummy.updateMatrix();far.setMatrixAt(i,dummy.matrix);
      const variation=.9+.09*Math.sin(r.x*.31+r.z*.74);
      far.setColorAt(i,tint.setRGB(variation,.99*variation,.87+.1*variation));
      dummy.position.y=r.elevation+r.height*.26;dummy.scale.set(r.radius*.093,r.height*.52,r.radius*.093);
      dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    });
    far.computeBoundingSphere();trunks.computeBoundingSphere();group.far.add(far,trunks);scene.add(group.far);
  }
  return (x,z,map)=>{
    for(const g of bins.values()){
      const d=Math.hypot(Math.max(0,Math.abs(g.cx-x)-g.half),Math.max(0,Math.abs(g.cz-z)-g.half));g.near.visible=!map&&d<112;
      g.far.visible=!g.near.visible&&d<1600;
    }
  };
}
