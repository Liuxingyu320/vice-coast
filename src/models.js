import {makePerson,animatePerson} from './people.js';
import * as T from 'three';
import {studioModel,rigSlots} from './blender-assets.js';
import {vehicles} from './street-catalog.js';

export function canvasTexture(w,h,draw){
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);
 const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;return tex;
}
const unitBox=new T.BoxGeometry(1,1,1);
function mesh(g,m,group,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);group.add(o);return o}
const shadowTex=canvasTexture(64,64,(c)=>{let g=c.createRadialGradient(32,32,5,32,32,32);g.addColorStop(0,'rgba(25,10,38,.72)');g.addColorStop(.65,'rgba(25,10,38,.38)');g.addColorStop(1,'rgba(25,10,38,0)');c.fillStyle=g;c.fillRect(0,0,64,64)});
export function shadow(parent,w,d){const mat=new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false});const o=mesh(new T.PlaneGeometry(w,d),mat,parent,0,.036,0);o.rotation.x=-Math.PI/2;return o}
const plateTex=canvasTexture(128,48,(c)=>{c.fillStyle='#ffe6ba';c.fillRect(0,0,128,48);c.fillStyle='#b94b60';c.font='italic bold 10px sans-serif';c.textAlign='center';c.fillText('品川',64,12);c.fillStyle='#263248';c.font='bold 27px monospace';c.fillText('COAST',64,39)});
const plate=new T.MeshBasicMaterial({map:plateTex});
const streetKeys=['streetEbike','streetScooter','streetStall','streetBike','streetVan','patrol'];
let loggedStreet=false;
function streetCar(color,key,type){
 const car=new T.Group(),shell=new T.Group();car.add(shell);shadow(car,3.4,6.3);
 const model=studioModel(key);model.rotation.y=Math.PI;shell.add(model);
 let paint=null;
 model.traverse(part=>{
  if(paint||!part.isMesh)return;
  const src=Array.isArray(part.material)?part.material[0]:part.material;
  if(!src?.color)return;
  paint=src.clone();paint.color.setHex(color);part.material=paint;
 });
 if(!paint)paint=new T.MeshStandardMaterial({color});
 car.userData={shell,paint,wheels:[],model:type,source:key,keepMaterials:true};
 // #region agent log
 if(!loggedStreet){loggedStreet=true;fetch('http://127.0.0.1:7326/ingest/e9fbfe8e-3183-45ec-8b50-8cb955649747',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5f55f9'},body:JSON.stringify({sessionId:'5f55f9',runId:'post-fix',hypothesisId:'G',location:'models.js:streetCar',message:'street vehicle',data:{key},timestamp:Date.now()})}).catch(()=>{});}
 // #endregion
 return car;
}
export function makeCar(color,type=0,detail=true){
 if(type===0||type>=3)return streetCar(color,type===0?'streetVan':streetKeys[(type-3)%streetKeys.length],type);
 const car=new T.Group(),shell=new T.Group();car.add(shell);shadow(car,3.4,6.3);
 const model=studioModel(vehicles[type].key);shell.add(model);
 const slots=rigSlots(model),wheels=['LF','RF','LR','RR'].map(axle=>slots['wheel_'+axle]);
 let paint;
 if(type===2){
  model.traverse(part=>{
   if(!part.isMesh||part.material.name!=='petrol')return;
   if(!paint)paint=part.material.clone();
   part.material=paint;
  });
  const mark=canvasTexture(512,128,(c,w,h)=>{c.textAlign='center';c.fillStyle='#ffe1a2';c.font='italic bold 78px Georgia';c.fillText('Bay Wave',w/2,75);c.font='bold 23px monospace';c.fillText('REMOTE UNIT   /   98.4 FM',w/2,110)});
  const logo=new T.MeshBasicMaterial({map:mark,transparent:true,depthWrite:false});
  for(const side of [-1,1]){const panel=new T.Mesh(new T.PlaneGeometry(1.61,.42),logo);panel.position.set(side*1.072,1.04,.52);panel.rotation.y=side*Math.PI/2;shell.add(panel)}
  const rear=text=>canvasTexture(384,64,c=>{c.fillStyle='#142d39';c.fillRect(0,0,384,64);c.textAlign='center';c.fillStyle='#f2d196';c.font='bold 42px monospace';c.fillText(text,192,47,360)});
  for(const [txt,y,w,h,z] of [['B W  •  984',.85,.47,.138,2.397],['BAY WAVE',1.05,.65,.12,2.36]]){const tag=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:rear(txt)}));tag.position.set(txt.startsWith('BAY')?.47:0,y,z);shell.add(tag)}
 }else{
  model.traverse(part=>{
   if(!part.isMesh||!part.material.name.startsWith('Paintwork'))return;
   if(!paint){paint=part.material.clone();paint.color.setHex(color)}
   part.material=paint;
  });
  if(detail&&type<2)mesh(new T.PlaneGeometry(.387,.101),plate,shell,0,.607,2.203);
 }
 car.userData={shell,paint,wheels,model:type};return car;
}
// Patrol cars keep the surveyed police mesh. Street Solanos stay on the original saloon.
export function makePatrolCar(){
 const car=new T.Group(),shell=new T.Group();car.add(shell);shadow(car,1.9,4.6);
 shell.rotation.y=Math.PI;
 const model=studioModel('patrol');model.position.y=.32;shell.add(model);
 const wheels=[];let red,blue;
 model.traverse(node=>{
  if(typeof node.name==='string'&&node.name.startsWith('Wheel.'))wheels.push(node);
  const material=node.material;
  if(!material||Array.isArray(material))return;
  if(material.name.startsWith('Emergency -'))red=material;
  else if(material.name.startsWith('Emergency '))blue=material;
 });
 if(red){red.emissive=red.color;red.emissiveIntensity=1.4}
 if(blue){blue.emissive=blue.color;blue.emissiveIntensity=1.4}
 car.userData={shell,paint:new T.MeshStandardMaterial({color:0xd6ded8}),wheels,model:1,lampRed:red,lampBlue:blue};
 return car;
}
const passers=['passer0','passer1','passer2','passer3','passer4','passer5','passer6','passer7'];
export function makeWalker(seed=1,hero=false){return makePerson(hero?'rico':passers[Math.abs(seed)%8],seed)}
export const stride=animatePerson;
// Batched repeated scenery keeps the whole street grid affordable on integrated GPUs.
export function batcher(scene){
 const buckets=new Map(),obj=new T.Object3D(),white=new T.MeshLambertMaterial({color:0xffffff,flatShading:true}),unlit=new T.MeshBasicMaterial({color:0xffffff});
 const cylinder=new T.CylinderGeometry(1,1,1,9),round=new T.SphereGeometry(1,8,6);
 function add(g,x,y,z,w,h,d,color,rx=0,ry=0,rz=0,mat=white){const key=g.uuid+mat.uuid;if(!buckets.has(key))buckets.set(key,{g,mat,items:[]});
  obj.position.set(x,y,z);obj.scale.set(w,h,d);obj.rotation.set(rx,ry,rz);obj.updateMatrix();buckets.get(key).items.push([obj.matrix.clone(),new T.Color(color)]);
 }
 const b=(x,y,z,w,h,d,c,rx=0,ry=0,rz=0,bright=false)=>add(unitBox,x,y,z,w,h,d,c,rx,ry,rz,bright?unlit:white);
 const rod=(x,y,z,rad,h,c,rx=0,ry=0,rz=0)=>add(cylinder,x,y,z,rad,h,rad,c,rx,ry,rz);
 const sphere=(x,y,z,w,h,d,c)=>add(round,x,y,z,w,h,d,c);
 function flush(){for(const {g,mat,items} of buckets.values()){const m=new T.InstancedMesh(g,mat,items.length);items.forEach(([matrix,color],i)=>{m.setMatrixAt(i,matrix);m.setColorAt(i,color)});m.computeBoundingSphere();m.castShadow=!mat.transparent&&mat===white||mat.vertexColors;m.receiveShadow=!mat.transparent;scene.add(m)}buckets.clear()}
 return {b,rod,sphere,add,flush,white,unlit};
}
