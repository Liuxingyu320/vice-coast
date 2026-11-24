import {makePerson,personDetail} from './people.js';
import {vehicles,additions,streetResidents} from './street-catalog.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createWorld} from './world.js';
import {makeCar,makeWalker,stride,canvasTexture} from './models.js';
import {rng,spawn,parkedSpots,parkedColors,streetStyles,paints,tapes,clamp,dist,xs,zs,cornerClearance,clearOfCrossStreets,route} from './data.js';
import {assignMissions,avoidCut,blockGoal,broadsideHeading,copPassRadius,copSwitchClose,copSwitchFar,mellowCruise,pursuitAxes,ramGoal,scoreSpawn,segmentHits,shiftOffPartner,yieldSpeed} from './pursuit.js';

const unit=new T.BoxGeometry(1,1,1),black=new T.MeshBasicMaterial({color:0x282a39});
const material=c=>new T.MeshBasicMaterial({color:c});
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const contactSlop=.0001;
function boxAxes(box){
 const cos=Math.cos(box.a),sin=Math.sin(box.a);
 return {rightX:cos,rightZ:-sin,forwardX:sin,forwardZ:cos,
  extentX:box.hw*Math.abs(cos)+box.hl*Math.abs(sin),extentZ:box.hw*Math.abs(sin)+box.hl*Math.abs(cos)};
}
function sweepBox(a,b,axes,dx,dz){
 const px=b.x-a.x,pz=b.z-a.z;
 if(Math.abs(px-dx/2)>axes.extentX+b.hl+b.hw+Math.abs(dx)/2||Math.abs(pz-dz/2)>axes.extentZ+b.hl+b.hw+Math.abs(dz)/2)return null;
 const other=boxAxes(b);
 const radius=(box,basis,x,z)=>box.hw*Math.abs(basis.rightX*x+basis.rightZ*z)+box.hl*Math.abs(basis.forwardX*x+basis.forwardZ*z);
 let entry=-Infinity,exit=Infinity,normal=null,shallowest=Infinity,outward=0;
 for(const [x,z] of [[axes.rightX,axes.rightZ],[axes.forwardX,axes.forwardZ],[other.rightX,other.rightZ],[other.forwardX,other.forwardZ]]){
  const center=px*x+pz*z,travel=dx*x+dz*z,span=radius(a,axes,x,z)+radius(b,other,x,z)-contactSlop;
  const depth=span-Math.abs(center);
  if(depth<shallowest){shallowest=depth;outward=center===0?Math.abs(travel):-Math.sign(center)*travel}
  if(Math.abs(travel)<1e-9){if(depth<=0)return null;continue}
  const near=(center-Math.sign(travel)*span)/travel,far=(center+Math.sign(travel)*span)/travel;
  if(near>entry){entry=near;normal={nx:-Math.sign(travel)*x,nz:-Math.sign(travel)*z}}
  exit=Math.min(exit,far);
  if(entry>=exit||exit<=0||entry>=1)return null;
 }
 // Let vehicles loaded from older saves move out of an existing overlap.
 if(shallowest>0){
  if(outward>1e-9)return null;
  return {fraction:0,nx:normal?.nx??0,nz:normal?.nz??0};
 }
 return {fraction:Math.max(0,entry),...normal};
}
function simpleBox(p,x,y,z,w,h,d,m){const o=new T.Mesh(unit,m);o.position.set(x,y,z);o.scale.set(w,h,d);p.add(o);return o}
const trafficGeometry=new Map();
const trafficMaterial=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
export function flattenTraffic(car){
 const {shell,model,paint}=car.userData;
 const key=model+'-'+paint.color.getHexString();let geometry=trafficGeometry.get(key);
 if(!geometry){
  const pieces=[];shell.updateMatrixWorld(true);
  shell.traverse(part=>{
   if(!part.isMesh)return;
   const g=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();g.applyMatrix4(part.matrixWorld);
   const pigment=g.getAttribute('color');
   for(const name of Object.keys(g.attributes))if(name!=='position'&&name!=='normal')g.deleteAttribute(name);
   const colors=new Float32Array(g.attributes.position.count*3);
   const tint=part.material.color;
   for(let i=0;i<g.attributes.position.count;i++){
    if(pigment){colors[3*i]=tint.r*pigment.getX(i);colors[3*i+1]=tint.g*pigment.getY(i);colors[3*i+2]=tint.b*pigment.getZ(i)}
    else tint.toArray(colors,i*3);
   }
   g.setAttribute('color',new T.BufferAttribute(colors,3));pieces.push(g);
  });
  geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
  if(!geometry)return car;
  trafficGeometry.set(key,geometry);
 }
 car.remove(shell);const body=new T.Mesh(geometry,trafficMaterial);car.add(body);car.userData.trafficBody=body;return car;
}
function goalMarker(){
 const group=new T.Group(),pink=material(0xff5487),cream=material(0xffe4bb);
 const ring=new T.Mesh(new T.RingGeometry(3.75,4.14,48),new T.MeshBasicMaterial({color:0xff739c,side:T.DoubleSide,transparent:true,opacity:.84,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.19;group.add(ring);
 const volume=new T.Mesh(new T.CylinderGeometry(4,4,.88,48,1,true),new T.MeshBasicMaterial({color:0xff5996,transparent:true,opacity:.115,side:T.DoubleSide,depthWrite:false}));volume.position.y=.62;group.add(volume);
 const tag=new T.Group();tag.position.y=3.8;group.add(tag);
 for(let j=0;j<2;j++){const bit=simpleBox(tag,(j?1:-1)*.38,0,0,.20,1.08,.2,j?pink:cream);bit.rotation.z=(j?-1:1)*-.77}
 return {group,tag,ring};
}
function makeTape(){
 const group=new T.Group(),gold=material(0xffcd71),dark=material(0x3e3348);
 simpleBox(group,0,0,0,1.34,.83,.23,gold);simpleBox(group,0,.08,.121,1.05,.36,.035,dark);simpleBox(group,0,-.23,.125,.62,.10,.04,dark);
 for(const x of [-.32,.32]){const reel=new T.Mesh(new T.RingGeometry(.07,.126,12),gold);reel.position.set(x,.08,.148);group.add(reel)}
 return group;
}
function makeTyreMarks(scene){
 const count=160,marks=new T.InstancedMesh(new T.PlaneGeometry(.16,.9),new T.MeshBasicMaterial({color:0x312d3c,transparent:true,opacity:.55,depthWrite:false}),count);
 marks.count=0;marks.frustumCulled=false;scene.add(marks);const matrix=new T.Object3D();let idx=0;
 return (x,z,a)=>{for(const side of [-1,1]){matrix.position.set(x+side*Math.cos(a)*.91,.085,z-side*Math.sin(a)*.91);matrix.rotation.set(-Math.PI/2,0,a);matrix.updateMatrix();marks.setMatrixAt(idx,matrix.matrix);idx=(idx+1)%count;marks.count=Math.min(count,marks.count+1)}marks.instanceMatrix.needsUpdate=true};
}
// Choose a continuous stretch of sidewalk between two crossings, excluding solid scenery.
function patrolSegment(x,preferred,colliders){
 const upper=zs.findIndex(z=>z>preferred);
 const block=clamp(upper<0?zs.length-1:upper,1,zs.length-1);
 const start=zs[block-1]+cornerClearance+.5,end=zs[block]-cornerClearance-.5;
 const obstacles=colliders.filter(c=>Math.abs(x-c.x)<c.w+.42&&c.z+c.d+.42>start&&c.z-c.d-.42<end).sort((a,b)=>(a.z-a.d)-(b.z-b.d));
 const gaps=[];let low=start;
 for(const c of obstacles){
  const high=c.z-c.d-.43;if(high-low>1)gaps.push([low,high]);
  low=Math.max(low,c.z+c.d+.43);
 }
 if(end-low>1)gaps.push([low,end]);
 let best=null,error=Infinity;
 for(const [min,max] of gaps){const z=clamp(preferred,min,max),d=Math.abs(z-preferred);
  if(d<error){error=d;best={z,min:Math.max(min,z-13),max:Math.min(max,z+13)}}}
 return best;
}
export class Simulation{
 constructor(canvas,save,notify){
  this.save=save;this.notify=notify;this.r=rng(120);this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(62,1,.19,2000);
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setClearColor(0xc88c99);
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
  this.world=createWorld(this.scene);this.marks=makeTyreMarks(this.scene);this.speed=0;this.idleAngle=.43;this.boost=1;this.time=0;this.heat=0;this.hits=0;this.hitCooldown=0;this.shake=0;this.safe=0;this.nextMark=0;this.camA=0;this.lookPitch=0;this.vy=0;this.jumpHeld=false;this.coyote=0;this.jumpBuffer=0;this.walkV={x:0,z:0};this.smoothSteer=0;this.inCar=true;this.punch=null;this.punchBuffer=false;this.punchTarget=null;this.punchVictim=null;this.combo=0;this.comboUntil=0;this.hitStop=0;
  this.cars=(save.fleet??[spawn,...parkedSpots]).map((p,i)=>{
   const style=streetStyles[p.trafficId];
   const m=style?makeCar(style.color,p.model??style.model,false):makeCar(parkedColors[i],i%2,true);
   m.userData.trafficId=p.trafficId;m.position.set(p.x,.07,p.z);m.rotation.y=p.a;this.scene.add(m);return m;
  });
  this.carId=save.car;this.car=this.cars[this.carId];this.pos={...save.pos};this.motionA=this.pos.a;
  // If a previous driver saved another car at the default pickup, keep the inactive car clear.
  for(const [i,c] of this.cars.entries())if(!save.fleet&&i!==this.carId&&Math.hypot(c.position.x-this.pos.x,c.position.z-this.pos.z)<4){const spot=parkedSpots[Math.max(0,this.carId-1)];c.position.set(spot.x,.07,spot.z);c.rotation.y=spot.a}
  this.syncCar();this.applyPaint();this.hero=makeWalker(44,true);this.hero.visible=false;this.scene.add(this.hero);this.punchMark=new T.Mesh(new T.OctahedronGeometry(.11),new T.MeshBasicMaterial({color:0xffd18a}));this.punchMark.visible=false;this.scene.add(this.punchMark);
  if(save.walker){this.inCar=false;this.pos={...save.walker};this.hero.visible=true}
  this.station=goalMarker();this.scene.add(this.station.group);this.collectibles=tapes.map((p,i)=>{const o=makeTape();o.position.set(p.x,1.5,p.z);o.visible=!save.tapes.includes(i);this.scene.add(o);return o});
  const random=this.r;this.walkers=[];
  const beats=[[172.6,-182],[147,40],[-68.5,100],[172.6,-136],[172.6,-44],[147,104],[172.6,-100],[147,21],[-68.5,58],[69.1,-103],[172.6,-116]];
  for(let i=0;i<30;i++){const beat=beats[i],p=beat?makePerson(streetResidents[i]):makeWalker(48+i);
   const x=beat?.[0]??(i<16?147:xs[i%6]+(i%2?12:-12)),z=beat?.[1]??(-220+(i*59)%440);const dir=i%2?1:-1;
   const segment=patrolSegment(x,z,this.world.colliders),rate=.8+random()*.7;
   if(segment){this.walkers.push({p,x,...segment,dir,rate,panic:0,down:0,ox:0});p.position.set(x,.17,segment.z);this.scene.add(p)}}
  this.traffic=[];
  const claimed=new Set(this.cars.map(c=>c.userData.trafficId));
  const addTraffic=(id,pts,idx,v,x,z)=>{
   if(claimed.has(id))return;
   const {color,model}=streetStyles[id],m=flattenTraffic(makeCar(color,model,false));
   m.userData.trafficId=id;m.position.set(x,.07,z);m.rotation.y=Math.atan2(x-pts[idx].x,z-pts[idx].z);
   this.scene.add(m);this.traffic.push({m,pts,idx,v});
  };
  for(let i=0;i<13;i++){const ix=i%5,iz=(i*3)%5,wide=i%3===0?2:1;
   const x0=xs[Math.min(ix,4)],x1=xs[Math.min(ix+wide,5)],z0=zs[iz],z1=zs[Math.min(iz+2,6)];
   const pts=[{x:x0+3.9,z:z1-3.9},{x:x0+3.9,z:z0+3.9},{x:x1-3.9,z:z0+3.9},{x:x1-3.9,z:z1-3.9}];
   if(i%2){pts.reverse();for(const p of pts){p.x+=p.x<(x0+x1)/2?-7.8:7.8;p.z+=p.z<(z0+z1)/2?-7.8:7.8}}
   const j=i%4,u=.12+random()*.7,v=pts[j],n=pts[(j+1)%4];
   addTraffic(i,pts,(j+1)%4,5+random()*3.8,v.x+(n.x-v.x)*u,v.z+(n.z-v.z)*u)}
  for(const [i,z] of [[0,20],[1,64],[2,-90]]){const x=i%2?156.3:167.8,dir=i%2?1:-1;
   const pts=dir<0?[{x,z:-236},{x:84,z:-236},{x:84,z:236},{x,z:236}]:[{x,z:236},{x:75.9,z:236},{x:75.9,z:-236},{x,z:-236}];
   addTraffic(13+i,pts,0,6+i*.8,x,z)}
  if(!claimed.has(16)){const van=makeCar(streetStyles[16].color,2);van.userData.trafficId=16;van.position.set(170,.07,-144);van.rotation.y=Math.PI;this.scene.add(van);this.traffic.push({m:van,parked:true,home:{x:170,z:-144}})}
  for(const spot of additions){
   if(claimed.has(spot.parkingId))continue;
   const style=streetStyles[spot.parkingId],m=flattenTraffic(makeCar(style.color,style.model,false));
   m.userData.trafficId=spot.parkingId;
   const occupied=[...this.cars,...this.traffic.filter(v=>v.parked).map(v=>v.m)];
   const free=z=>Math.abs(z)<zs.at(-1)&&clearOfCrossStreets(z,2.65)&&occupied.every(c=>Math.hypot(c.position.x-spot.x,c.position.z-z)>5.5);
   let z=spot.z;
   for(let offset=6;!free(z)&&offset<500;offset+=6)z=free(spot.z+offset)?spot.z+offset:spot.z-offset;
   if(!free(z))continue;
   m.position.set(spot.x,.07,z);m.rotation.y=spot.a;
   this.scene.add(m);this.traffic.push({m,parked:true,home:{x:m.position.x,z:m.position.z}});
  }
  const pinned=save.pin?.vehicleKey&&this.parkedStreetCar(save.pin.vehicleKey);
  if(pinned)Object.assign(save.pin,{x:pinned.position.x,z:pinned.position.z});
  this.patrol=flattenTraffic(makeCar(0xd6ded8,1,false));this.patrol.visible=false;this.scene.add(this.patrol);simpleBox(this.patrol,0,1.6,.1,1.05,.13,.34,black);
  this.lightR=material(0xff3459);this.lightB=material(0x679cff);simpleBox(this.patrol,-.31,1.72,.1,.4,.13,.29,this.lightR);simpleBox(this.patrol,.31,1.72,.1,.4,.13,.29,this.lightB);
  this.patrol2=flattenTraffic(makeCar(0xd6ded8,1,false));this.patrol2.visible=false;this.scene.add(this.patrol2);simpleBox(this.patrol2,0,1.6,.1,1.05,.13,.34,black);simpleBox(this.patrol2,-.31,1.72,.1,.4,.13,.29,this.lightR);simpleBox(this.patrol2,.31,1.72,.1,.4,.13,.29,this.lightB);
  this.custody=0;this.storyAlert=false;this.impactSerial=0;this.raceClosed=false;this.fineHold=0;this.copDispatchAt=0;
  this.beam=new T.SpotLight(0xffebc3,225,36,.52,.7,1.35);this.beam.position.set(0,.88,-1.7);this.beam.target.position.set(0,-.12,-22);this.setNight(save.night);this.resize();this.resetCamera();
 }
 setNight(on){this.save.night=on;this.world.setNight(on);this.beam.visible=on;this.car.add(this.beam,this.beam.target)}
 footHeight(x,z){return x>=177.5&&Math.abs(z+128)<=5?.355:.14}
 placeOnFoot(x,z,a){this.inCar=false;this.speed=0;this.vy=0;this.jumpHeld=true;this.coyote=0;this.jumpBuffer=0;this.walkV.x=this.walkV.z=0;this.pos={x,z,a};this.footY=this.footHeight(x,z);this.hero.visible=true;this.hero.position.set(x,this.footY,z);this.hero.rotation.y=a;this.resetCamera()}
 restoreFootClearance(){
  const {x,z,a}=this.pos;
  if(this.inCar||!this.blocked(x,z,.32))return;
  // An older save can land inside a car or scenery that has since moved.
  for(let ring=1;ring<=12;ring++){
   for(let direction=0;direction<12;direction++){
    const angle=direction*Math.PI/6,px=x+ring*.4*Math.cos(angle),pz=z+ring*.4*Math.sin(angle);
    if(!this.blocked(px,pz,.32)){this.placeOnFoot(px,pz,a);return}
   }
  }
 }
 dismissCop(mesh){mesh.visible=false;mesh.userData.onDuty=false}
 clearAlert(){
  this.boardingGrace=0;this.usedBoardingGrace=false;this.storyAlert=false;
  this.dismissCop(this.patrol);this.dismissCop(this.patrol2);
  this.heat=this.safe=this.hits=this.caught=this.fineHold=this.copDispatchAt=0;
  this.pursuitHeld=false;
 }
 beginAlert(level,x,z){
  this.clearAlert();this.storyAlert=true;this.heat=level;
  const cop=this.patrol;cop.position.set(x,.08,z);cop.visible=true;
  cop.rotation.y=Math.atan2(x-this.pos.x,z-this.pos.z);
 }
 gridStart(p){this.carId=0;this.car=this.cars[0];this.pos={x:p.x,z:p.z,a:p.a};this.motionA=p.a;this.speed=0;this.boost=1;this.emptyBoost=false;this.smoothSteer=0;this.walkV.x=this.walkV.z=0;this.inCar=true;this.hero.visible=false;this.patrol.visible=false;this.patrol2.visible=false;this.caught=this.safe=this.fineHold=0;this.syncCar();this.setNight(this.save.night);this.resetCamera()}
 resize(){const {clientWidth:w,clientHeight:h}=this.renderer.domElement;this.renderer.setSize(Math.max(w,1),Math.max(h,1),false);this.camera.aspect=w/Math.max(h,1);this.camera.updateProjectionMatrix()}
 applyPaint(){this.cars[0].userData.paint.color.setHex(paints.find(p=>p.id===this.save.paint).color)}
 syncCar(){this.car.position.set(this.pos.x,.07,this.pos.z);this.car.rotation.y=this.pos.a}
 resetCamera(){this.camA=this.pos.a;this.lookPitch=0;this.view(1,true)}
 look(dx,dy){if(this.inCar||!dx&&!dy)return;const s=matchMedia('(pointer:coarse)').matches?.0048:.0026;this.camA-=dx*s;this.lookPitch=clamp(this.lookPitch-dy*s,-.6,.8)}
 view(dt,snap=false){
  const p=this.pos,high=this.save.view===1,foot=!this.inCar;
  if(!foot){const diff=Math.atan2(Math.sin(p.a-this.camA),Math.cos(p.a-this.camA));this.camA+=diff*(snap?1:1-Math.exp(-dt*5.7))}
  const wantOffset=this.livePos?1.09:!foot&&!high&&Math.abs(this.speed)<1?(this.camera.aspect<.8?.07:.31):0;
  this.idleAngle+=(wantOffset-this.idleAngle)*(snap?1:1-Math.exp(-dt*2.2));
  const pitch=foot?this.lookPitch:0,lift=Math.sin(pitch);
  const back=this.livePos?9.65:foot?5:high?12:7.6+Math.abs(this.speed)*.027,up=(this.livePos?3.05:foot?2.9:high?7:3.45)-lift*(foot?1.55:0),side=foot?.42:0,s=Math.sin(this.camA-this.idleAngle),c=Math.cos(this.camA-this.idleAngle);
  const x=p.x+s*back+c*side,z=p.z+c*back-s*side,y=up+this.shake*Math.sin(this.time*76)*.12,arm=this.boom(p.x,p.z,x,z),eye=foot?1.15:1.05;
  const dest=vec(p.x+(x-p.x)*arm,eye+(y-eye)*arm,p.z+(z-p.z)*arm),cam=this.camera.position;
  // A wall can fold the boom inside the body. Stay above the roof instead of sitting in the cabin.
  if(!foot){const reach=Math.hypot(dest.x-p.x,dest.z-p.z);if(reach<this.bodyOf(this.car.userData.model).hl+.4){const roof=(this.carSpec.cargoHeight??1.35)+.55;if(dest.y<roof)dest.y=roof}}
  const pulled=arm<.98&&Math.hypot(cam.x-p.x,cam.z-p.z)>Math.hypot(dest.x-p.x,dest.z-p.z)+.04;
  const through=!snap&&Math.hypot(dest.x-cam.x,dest.z-cam.z)>.45&&this.boom(cam.x,cam.z,dest.x,dest.z)<.92;
  cam.lerp(dest,snap||pulled||through?1:1-Math.exp(-dt*12));
  const ahead=this.livePos?.3:foot?3:high?6:8,lookY=(foot?1.15:1)+lift*(foot?3.2:0);this.camera.lookAt(p.x-Math.sin(this.camA)*ahead,lookY,p.z-Math.cos(this.camA)*ahead);
  const fov=(this.camera.aspect<.76?73:61)+Math.abs(this.speed)*.21; if(Math.abs(this.camera.fov-fov)>.08){this.camera.fov=fov;this.camera.updateProjectionMatrix()}
 }
 // Colliders store half-extents. Judge the boom by full length and thickness.
 // Thin shopfronts and booths count; bollards and short bins do not.
 boom(x0,z0,x1,z1){
  let arm=1;const dx=x1-x0,dz=z1-z0,pad=.26;
  for(const b of this.world.colliders){
   const span=Math.max(b.w,b.d)*2,slim=Math.min(b.w,b.d)*2;
   if(span<1.7||(slim>.42&&slim<2.3&&span<8)||Math.abs(b.x-x0)>Math.abs(dx)+b.w+2||Math.abs(b.z-z0)>Math.abs(dz)+b.d+2)continue;
   let t0=0,t1=1;const slab=(p,d,lo,hi)=>{
    if(Math.abs(d)<1e-6)return p>lo&&p<hi;
    let a=(lo-p)/d,c=(hi-p)/d;if(a>c){const s=a;a=c;c=s}
    t0=Math.max(t0,a);t1=Math.min(t1,c);return t0<=t1;
   };
   if(slab(x0,dx,b.x-b.w-pad,b.x+b.w+pad)&&slab(z0,dz,b.z-b.d-pad,b.z+b.d+pad)&&t0<arm)arm=t0||.05;
  }
  return arm;
 }
 blocked(x,z,r,includeCars=true){
  if(x< -256+r||x>225-r||z< -256+r||z>256-r)return true;
  if(this.world.colliders.some(o=>{
   const dx=Math.max(0,Math.abs(x-o.x)-o.w),dz=Math.max(0,Math.abs(z-o.z)-o.d);
   return dx*dx+dz*dz<r*r;
  }))return true;
  if(!includeCars)return false;
  const hits=c=>(c!==this.car||!this.inCar)&&this.circleHitsBox(x,z,r,this.meshBox(c));
  return this.cars.some(hits)||!!this.traffic?.some(v=>v.parked&&hits(v.m));
 }
 bodyOf(model){const spec=vehicles[model]??vehicles[0];return {hl:spec.length/2,hw:spec.width/2}}
 meshBox(mesh){return {x:mesh.position.x,z:mesh.position.z,a:mesh.rotation.y,...this.bodyOf(mesh.userData.model)}}
 playerBox(x=this.pos.x,z=this.pos.z,a=this.pos.a){return {x,z,a,...this.bodyOf(this.car.userData.model)}}
 // Yaw-only rectangle. nx,nz point from the first box toward the second.
 boxPush(a,b){
  const ax=Math.cos(a.a),az=-Math.sin(a.a),bx=Math.sin(a.a),bz=Math.cos(a.a);
  const cx=Math.cos(b.a),cz=-Math.sin(b.a),dx=Math.sin(b.a),dz=Math.cos(b.a);
  const px=b.x-a.x,pz=b.z-a.z;let best=Infinity,nx=1,nz=0;
  for(const [x,z] of [[ax,az],[bx,bz],[cx,cz],[dx,dz]]){
   const along=px*x+pz*z,dist=Math.abs(along);
   const span=a.hw*Math.abs(ax*x+az*z)+a.hl*Math.abs(bx*x+bz*z)+b.hw*Math.abs(cx*x+cz*z)+b.hl*Math.abs(dx*x+dz*z);
   const overlap=span-dist;if(overlap<=0)return null;
   if(overlap<best){best=overlap;const s=along<0?-1:1;nx=x*s;nz=z*s}
  }
  return best>1e-4?{nx,nz,overlap:best}:null;
 }
 circleHitsBox(x,z,r,box){
  const dx=x-box.x,dz=z-box.z,lx=dx*Math.cos(box.a)-dz*Math.sin(box.a),lz=dx*Math.sin(box.a)+dz*Math.cos(box.a);
  const cx=clamp(lx,-box.hw,box.hw),cz=clamp(lz,-box.hl,box.hl);return (lx-cx)**2+(lz-cz)**2<r*r;
 }
 sceneryContact(box,axes,dx,dz){
  let hit=null;
  const edge=(distance,travel,nx,nz)=>{
   if(travel<0||travel<=distance)return;
   const fraction=travel===0?0:Math.max(0,distance/travel);
   if(!hit||fraction<hit.fraction)hit={fraction,nx,nz,overhang:Math.max(0,-distance)};
  };
  edge(box.x-axes.extentX+256,-dx,1,0);
  edge(225-box.x-axes.extentX,dx,-1,0);
  edge(box.z-axes.extentZ+256,-dz,0,1);
  edge(256-box.z-axes.extentZ,dz,0,-1);
  if(hit?.fraction===0)return hit;
  const reachX=axes.extentX+Math.abs(dx)/2,reachZ=axes.extentZ+Math.abs(dz)/2;
  for(const o of this.world.colliders){
   if(Math.abs(box.x+dx/2-o.x)>o.w+reachX||Math.abs(box.z+dz/2-o.z)>o.d+reachZ)continue;
   const contact=sweepBox(box,{x:o.x,z:o.z,a:0,hw:o.w,hl:o.d},axes,dx,dz);
   if(contact&&(!hit||contact.fraction<hit.fraction))hit=contact;
   if(hit?.fraction===0)break;
  }
  return hit;
 }
 boxBlocked(box){return !!this.sceneryContact(box,boxAxes(box),0,0)}
 carContact(box,dx,dz){
  const axes=boxAxes(box);
  let hit=this.sceneryContact(box,axes,dx,dz);
  const test=car=>{
   if(car===this.car)return;
   const contact=sweepBox(box,this.meshBox(car),axes,dx,dz);
   if(contact&&(!hit||contact.fraction<hit.fraction))hit=contact;
  };
  for(const car of this.cars){if(hit?.fraction===0)return hit;test(car)}
  for(const traffic of this.traffic){if(hit?.fraction===0)return hit;if(traffic.parked)test(traffic.m)}
  return hit;
 }
 carBlocked(x,z,a,dx=0,dz=0){return !!this.carContact(this.playerBox(x-dx,z-dz,a),dx,dz)}
 driveMove(dx,dz){
  if(dx===0&&dz===0)return null;
  const p=this.pos;
  let hit=this.carContact(this.playerBox(),dx,dz);
  // Older saves can leave part of the body outside the map while the centre is inside.
  if(hit?.overhang>0&&hit.overhang<=3){
   const clearance=hit.overhang+2*contactSlop,x=p.x+clearance*hit.nx,z=p.z+clearance*hit.nz;
   if(!this.carBlocked(x,z,p.a)){p.x=x;p.z=z;hit=this.carContact(this.playerBox(),dx,dz)}
  }
  const advance=(x,z,contact)=>{
   const fraction=contact?Math.max(0,contact.fraction-2*contactSlop/Math.hypot(x,z)):1;
   p.x+=x*fraction;p.z+=z*fraction;
  };
  advance(dx,dz,hit);
  if(!hit)return null;
  const inward=Math.min(0,dx*hit.nx+dz*hit.nz),remaining=1-hit.fraction;
  const slideX=(dx-inward*hit.nx)*remaining,slideZ=(dz-inward*hit.nz)*remaining;
  if(Math.hypot(slideX,slideZ)>contactSlop)advance(slideX,slideZ,this.carContact(this.playerBox(),slideX,slideZ));
  return hit;
 }
 contactNormal(x,z,r){
  let best=null,near=Infinity;
  const take=(px,pz)=>{
   const dx=x-px,dz=z-pz,d=Math.hypot(dx,dz);
   if(d<1e-4||d>r+.02||d>=near)return;
   near=d;best={x:dx/d,z:dz/d};
  };
  for(const o of this.world.colliders)take(clamp(x,o.x-o.w,o.x+o.w),clamp(z,o.z-o.d,o.z+o.d));
  const boxes=[];
  if(this.cars)for(const c of this.cars)if(c!==this.car||!this.inCar)boxes.push(this.meshBox(c));
  if(this.traffic)for(const v of this.traffic)if(v.parked)boxes.push(this.meshBox(v.m));
  for(const box of boxes){
   const dx=x-box.x,dz=z-box.z,cos=Math.cos(box.a),sin=Math.sin(box.a);
   const lx=dx*cos-dz*sin,lz=dx*sin+dz*cos,cx=clamp(lx,-box.hw,box.hw),cz=clamp(lz,-box.hl,box.hl);
   take(box.x+cx*cos+cz*sin,box.z-cx*sin+cz*cos);
  }
  return best;
 }
 move(dx,dz,r){const p=this.pos,x=p.x+dx,z=p.z+dz;if(!this.blocked(x,z,r)){p.x=x;p.z=z;return true}
  if(!this.blocked(x,p.z,r)){p.x=x;return false}if(!this.blocked(p.x,z,r)){p.z=z;return false}
  const n=this.contactNormal(p.x,p.z,r);if(!n)return false;
  const into=Math.min(0,dx*n.x+dz*n.z),sx=dx-into*n.x,sz=dz-into*n.z;
  if(Math.hypot(sx,sz)>1e-4&&!this.blocked(p.x+sx,p.z+sz,r)){p.x+=sx;p.z+=sz}
  return false;
 }
 curbSide(x,z,a){
  const nx=xs.reduce((p,q)=>Math.abs(p-x)<=Math.abs(q-x)?p:q),nz=zs.reduce((p,q)=>Math.abs(p-z)<=Math.abs(q-z)?p:q);
  const vertical=Math.abs(x-nx)<=Math.abs(z-nz),sx=vertical?Math.sign(x-nx)||1:0,sz=vertical?0:Math.sign(z-nz)||1;
  return sx*Math.cos(a)-sz*Math.sin(a)>=0?1:-1;
 }
 clearScenerySegment(x,z,toX,toZ){
  const dx=toX-x,dz=toZ-z;
  for(const o of this.world.colliders){
   if((x<o.x-o.w&&toX<o.x-o.w)||(x>o.x+o.w&&toX>o.x+o.w)||
      (z<o.z-o.d&&toZ<o.z-o.d)||(z>o.z+o.d&&toZ>o.z+o.d))continue;
   let enter=0,leave=1;
   for(const [from,delta,center,half] of [[x,dx,o.x,o.w],[z,dz,o.z,o.d]]){
    if(Math.abs(delta)<1e-6)continue;
    const first=(center-half-from)/delta,last=(center+half-from)/delta;
    enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));
   }
   if(enter<=leave)return false;
  }
  return true;
 }
 canBoard(car){
  if(!car?.visible||dist(this.pos,car.position)>=5.2)return false;
  const box=this.meshBox(car),p=this.pos,cos=Math.cos(box.a),sin=Math.sin(box.a);
  const dx=p.x-box.x,dz=p.z-box.z;
  const x=clamp(dx*cos-dz*sin,-box.hw,box.hw),z=clamp(dx*sin+dz*cos,-box.hl,box.hl);
  if(this.clearScenerySegment(p.x,p.z,box.x+x*cos+z*sin,box.z-x*sin+z*cos))return true;
  for(const direction of [1,-1]){
   const doorX=box.x+cos*direction*box.hw,doorZ=box.z-sin*direction*box.hw;
   if(this.clearScenerySegment(p.x,p.z,doorX,doorZ))return true;
  }
  return false;
 }
 exitPosition(){
  const p=this.pos,side=this.curbSide(p.x,p.z,p.a),cos=Math.cos(p.a),sin=Math.sin(p.a);
  const edge=this.playerBox().hw;
  for(const direction of [side,-side])for(const gap of [.55,1.2]){
   const doorX=p.x+cos*direction*edge,doorZ=p.z-sin*direction*edge;
   const x=doorX+cos*direction*gap,z=doorZ-sin*direction*gap;
   if(this.blocked(x,z,.32)||!this.clearScenerySegment(doorX,doorZ,x,z))continue;
   const busy=car=>car?.visible&&this.circleHitsBox(x,z,.32,this.meshBox(car));
   if(!this.traffic.some(v=>!v.parked&&busy(v.m))&&!busy(this.patrol)&&!busy(this.patrol2))return {x,z};
  }
  return null;
 }
 interact(requestedCar){
  if(this.inCar){if(Math.abs(this.speed)>3.4){this.notify('减速停车后再下车');return}
   const next=this.exitPosition();
   if(!next){this.notify('两侧车门旁空间不足 · 挪车后再试');return}
   this.placeOnFoot(next.x,next.z,this.pos.a);this.notify('已下车 · 靠近车身可再次上车');
  }else{const nearest=requestedCar??this.nearCar();
   if(!nearest||requestedCar&&!this.canBoard(requestedCar)){this.notify('走到车旁，再按 F 或点击「上车」');return}
   const index=this.traffic.findIndex(v=>v.m===nearest);
   if(index<0&&!this.cars.includes(nearest))return;
   if(index>=0){
    this.traffic.splice(index,1);
    const {shell,trafficBody}=nearest.userData;
    if(trafficBody){nearest.remove(trafficBody);delete nearest.userData.trafficBody;nearest.add(shell)}
    this.cars.push(nearest);
   }
   if(this.storyAlert&&!this.usedBoardingGrace){this.boardingGrace=this.time+4;this.usedBoardingGrace=true;this.caught=0}
   this.car=nearest;this.carId=this.cars.indexOf(nearest);Object.assign(this.pos,{x:nearest.position.x,z:nearest.position.z,a:nearest.rotation.y});this.motionA=this.pos.a;this.inCar=true;this.hero.visible=false;this.speed=0;this.vy=0;this.smoothSteer=0;this.walkV.x=this.walkV.z=0;this.jumpBuffer=0;this.setNight(this.save.night);this.resetCamera();this.notify('已上车 · '+this.carName())}
 }
 nearCar(){
  let best=null,range=5.2;
  const consider=car=>{const d=dist(this.pos,car.position);if(d<range&&this.canBoard(car)){best=car;range=d}};
  this.cars.forEach(consider);for(const {m} of this.traffic)consider(m);return best;
 }
 parkedStreetCar(key){
  const spot=additions.find(v=>v.key===key);if(!spot)return null;
  return this.cars.find(c=>c.userData.trafficId===spot.parkingId)??this.traffic.find(v=>v.m.userData.trafficId===spot.parkingId)?.m;
 }
 carName(car=this.car){return vehicles[car.userData.model].name}
 get carSpec(){return vehicles[this.car.userData.model]}
 rescue(){const p=this.pos;const x=xs.reduce((a,b)=>Math.abs(a-p.x)<Math.abs(b-p.x)?a:b);Object.assign(p,{x:x+4.2,z:clamp(p.z,-232,232),a:0});this.speed=0;this.motionA=0;this.walkV.x=this.walkV.z=0;this.inCar=true;this.hero.visible=false;this.syncCar();this.resetCamera();this.notify('救援完成 · 车辆已回到车道')}
 revive(){
  let z=spawn.z;
  const clear=pz=>clearOfCrossStreets(pz,2.6)&&!this.cars.some(c=>c!==this.car&&Math.hypot(c.position.x-spawn.x,c.position.z-pz)<5)&&!this.traffic.some(v=>Math.hypot(v.m.position.x-spawn.x,v.m.position.z-pz)<5);
  if(!clear(z)){
   for(let step=7;step<=56;step+=7){
    if(clear(spawn.z+step)){z=spawn.z+step;break}
    if(clear(spawn.z-step)){z=spawn.z-step;break}
   }
  }
  const a=spawn.a;
  this.speed=0;this.vy=0;this.smoothSteer=0;this.walkV.x=this.walkV.z=0;this.motionA=a;this.shake=0;
  this.busted=true;
  if(this.inCar){this.pos={x:spawn.x,z,a};this.hero.visible=false;this.syncCar();this.resetCamera()}
  else{
   this.car.position.set(spawn.x,.07,z);this.car.rotation.y=a;
   this.placeOnFoot(172.2,z,Math.PI/2);
   if(this.blocked(this.pos.x,this.pos.z,.32))this.restoreFootClearance();
  }
 }
 driving(dt,keys){
  const p=this.pos,forward=keys.has('KeyW'),reverse=keys.has('KeyS'),steer=Number(keys.has('KeyA'))-Number(keys.has('KeyD'));
  const {engine,brakes,nitro}=this.carId===0?this.save.mods:{engine:0,brakes:0,nitro:0};
  const boost=keys.has('ShiftLeft')&&forward&&this.boost>.015&&!this.emptyBoost;
  if(!keys.has('ShiftLeft')||this.boost>.32)this.emptyBoost=false;
  this.boost=clamp(this.boost+(boost?-.30/(1+.35*nitro):.105)*dt,0,1);if(this.boost<.015)this.emptyBoost=true;
  this.smoothSteer+=(steer-this.smoothSteer)*(1-Math.exp(-dt*7));
  const speedYaw=Math.min(Math.abs(this.speed)*.26,1.42),parkYaw=.9*(1-Math.min(1,Math.abs(this.speed)/2.5));
  const turn=this.smoothSteer*(Math.sign(this.speed)||1)*Math.max(speedYaw,parkYaw)*(this.carSpec.steering??1)*dt;
  if(turn&&!this.carBlocked(p.x,p.z,p.a+turn))p.a+=turn;
  const fx=-Math.sin(p.a),fz=-Math.cos(p.a),rx=Math.cos(p.a),rz=-Math.sin(p.a);
  let vx=-Math.sin(this.motionA)*this.speed,vz=-Math.cos(this.motionA)*this.speed;
  let long=vx*fx+vz*fz,lat=vx*rx+vz*rz,oldLong=long;const sand=p.x>179;
  if(forward)long+=(long<-1?23:(boost?20.5:12.8)*(this.carSpec.power??1))*(1+.13*engine)*dt;
  if(reverse)long-=(long>1?25*(1+.18*brakes):7.0)*dt;
  long-=((sand?.63:.16)*long+.004*long*Math.abs(long))*dt;
  const coast=(!forward&&!reverse?2.1:.23)*dt;
  long-=Math.sign(long)*Math.min(Math.abs(long),coast);
  long=clamp(long,-8,sand?17:boost?48+3*engine:Math.max(34+3*engine,oldLong-dt*6));
  let grip=keys.has('Space')?2:8;if(sand)grip*=.55;if(Math.abs(long)<.35)grip=Math.max(grip,14);
  lat*=Math.exp(-grip*dt);
  vx=long*fx+lat*rx;vz=long*fz+lat*rz;
  const mag=Math.hypot(vx,vz);this.speed=long<0?-mag:mag;
  if(mag>1e-4)this.motionA=Math.atan2(-vx/this.speed,-vz/this.speed);
  const dx=vx*dt,dz=vz*dt,hit=this.driveMove(dx,dz);
  if(hit){
   const approach=clamp(-(dx*hit.nx+dz*hit.nz)/Math.hypot(dx,dz),0,1),impactSpeed=Math.abs(this.speed)*approach;
   if(impactSpeed>1.8)this.shake=Math.max(this.shake,Math.min(.8,impactSpeed/12));
   if(impactSpeed>6&&this.time>=(this.nextStaticImpact??0)){this.impactSerial++;this.nextStaticImpact=this.time+.28}
   this.speed*=approach>.75?(impactSpeed>1.8?-.22:0):1-approach*.55;
  }
  const slip=Math.atan2(Math.sin(p.a-this.motionA),Math.cos(p.a-this.motionA));
  if(this.time>=this.nextMark&&Math.abs(this.speed)>7&&Math.abs(slip)>.32){this.marks(p.x,p.z,p.a);this.nextMark=this.time+.05}
  this.syncCar();this.car.userData.shell.rotation.z=this.smoothSteer*Math.min(Math.abs(this.speed)*.003,.055);
  for(const w of this.car.userData.wheels)w.rotation.x-=this.speed*dt/.39;
 }
 walk(dt,keys){
  const p=this.pos,yaw=this.camA;
  if(this.punch)this.advancePunch(dt);
  const commit=this.punch&&this.punch.t<0.4;
  let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),strafe=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  const mag=Math.hypot(forward,strafe);if(mag>1){forward/=mag;strafe/=mag}
  const rate=(keys.has('ShiftLeft')?7:3.8)*(this.walkScale??1);
  if(commit){this.walkV.x*=Math.max(0,1-dt*10);this.walkV.z*=Math.max(0,1-dt*10)}
  else{
   const tx=(-Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*rate,tz=(-Math.cos(yaw)*forward-Math.sin(yaw)*strafe)*rate;
   const blend=1-Math.exp(-dt*(mag>.01?14:18));
   this.walkV.x+=(tx-this.walkV.x)*blend;this.walkV.z+=(tz-this.walkV.z)*blend;
   if(this.walkV.x||this.walkV.z)this.move(this.walkV.x*dt,this.walkV.z*dt,.32);
   if(mag>.01){const face=Math.atan2(Math.sin(yaw)*forward-Math.cos(yaw)*strafe,Math.cos(yaw)*forward+Math.sin(yaw)*strafe),diff=Math.atan2(Math.sin(face-p.a),Math.cos(face-p.a));p.a+=diff*(1-Math.exp(-dt*12))}
  }
  const ground=this.footHeight(p.x,p.z);if(this.footY==null)this.footY=ground;
  const jump=keys.has('Space'),grounded=this.footY<=ground+.001&&this.vy<=0;
  if(grounded)this.coyote=.12;else this.coyote=Math.max(0,this.coyote-dt);
  if(jump&&!this.jumpHeld&&!commit)this.jumpBuffer=.12;else this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
  if(!commit&&this.jumpBuffer>0&&(grounded||this.coyote>0)){this.vy=6.5;this.jumpBuffer=0;this.coyote=0}
  this.jumpHeld=!!jump;
  this.vy-=18*dt;if(!jump&&this.vy>0)this.vy-=28*dt;
  this.footY+=this.vy*dt;if(this.footY<=ground){this.footY=ground;if(this.vy<0)this.vy=0}
  const pace=Math.hypot(this.walkV.x,this.walkV.z)/(rate||1);
  this.hero.position.set(p.x,this.footY,p.z);this.hero.rotation.y=p.a;stride(this.hero,this.time*(rate*Math.min(pace,1)+4),commit?0:pace>.08?Math.min(1,pace):0);
  this.posePunch();this.refreshPunchMark();
 }
 onFoot(){const ground=this.footHeight(this.pos.x,this.pos.z);return !this.inCar&&(this.footY??ground)<=ground+.12&&this.vy<=.4}
 attack(){if(!this.onFoot())return;if(this.punch){if(this.punch.t>=.34)this.punchBuffer=true;return}this.startPunch()}
 startPunch(){
  const chain=this.time<this.comboUntil&&this.combo>0&&this.combo<3&&this.punchConnected&&this.punchLive(this.punchTarget);
  this.combo=chain?this.combo+1:1;
  this.punchTarget=chain?this.punchTarget:this.findPunchTarget();
  this.punch={t:0,side:(this.combo-1)%2,hit:false,target:this.punchTarget,stand:null};
  this.punchBuffer=false;this.comboUntil=this.time+1.1;
 }
 punchLive(n){return !!n&&(n.lie||0)<=0&&(n.down||0)<=0&&Math.hypot(n.x+(n.ox||0)-this.pos.x,n.z-this.pos.z)<3.2}
 findPunchTarget(){
  const yaw=this.camA,fx=-Math.sin(yaw),fz=-Math.cos(yaw);let best=null,range=2.4;
  for(const n of this.walkers){
   if((n.lie||0)>0||(n.down||0)>0)continue;
   const dx=n.x+(n.ox||0)-this.pos.x,dz=n.z-this.pos.z,d=Math.hypot(dx,dz);
   if(d>range||d<.05||(dx*fx+dz*fz)/d<.45)continue;
   best=n;range=d;
  }
  return best;
 }
 aimAt(x,z){return Math.atan2(x-this.pos.x,z-this.pos.z)}
 turnToward(a,dt,speed){const d=Math.atan2(Math.sin(a-this.pos.a),Math.cos(a-this.pos.a)),step=Math.min(Math.abs(d),speed*dt);this.pos.a+=Math.sign(d)*step}
 advancePunch(dt){
  const sw=this.punch;if(!sw||this.hitStop>0)return;
  sw.t+=dt;const target=sw.target,p=this.pos;
  if(target&&(target.lie||0)<=0){
   const tx=target.x+(target.ox||0),tz=target.z;
   if(sw.t<.12)this.turnToward(this.aimAt(tx,tz),dt,11);
   else if(sw.t<.30&&!sw.hit){
    if(!sw.stand){const dx=p.x-tx,dz=p.z-tz,d=Math.hypot(dx,dz)||1;sw.stand=d<=1.15?{x:p.x,z:p.z}:{x:tx+dx/d*1.1,z:tz+dz/d*1.1}}
    this.turnToward(this.aimAt(tx,tz),dt,8);
    const mx=sw.stand.x-p.x,mz=sw.stand.z-p.z,md=Math.hypot(mx,mz);
    if(md>.05){const step=Math.min(md,7*dt);this.move(mx/md*step,mz/md*step,.32)}
   }
  }
  if(!sw.hit&&sw.t>=.30){sw.hit=true;this.punchConnected=this.resolvePunch(sw)}
  if(sw.t<.55)return;
  const again=this.punchBuffer;this.punch=null;this.punchBuffer=false;this.comboUntil=this.time+.5;
  if(again&&this.onFoot())this.startPunch();
 }
 resolvePunch(sw){
  const n=sw.target;if(!this.punchLive(n))return false;
  const x=n.x+(n.ox||0),z=n.z,dx=x-this.pos.x,dz=z-this.pos.z,d=Math.hypot(dx,dz);
  const fx=-Math.sin(this.pos.a),fz=-Math.cos(this.pos.a);
  if(d>1.6||d>.05&&(dx*fx+dz*fz)/d<.2)return false;
  this.punchVictim=n;this.hitStop=this.combo>=3?.07:.05;this.shake=Math.max(this.shake,this.combo>=3?.62:.32);
  if(this.combo>=3){n.hitX=x;n.hitZ=z;n.lie=10;n.down=10;n.panic=n.flinch=n.ox=0;this.layWalker(n,x);n.p.visible=true;this.noteAssault()}
  else this.shoveWalker(n);
  return true;
 }
 shoveWalker(n){
  const dir=n.z>=this.pos.z?1:-1,z=clamp(n.z+dir*.5,n.min,n.max),x=n.x+(n.ox||0);
  if(!this.blocked(x,z,.28,false))n.z=z;
  n.flinch=.28;n.p.position.set(x,.17,n.z);
 }
 posePunch(){
  const rig=this.hero.userData,sw=this.punch;
  if(!sw||sw.t<.18||!rig?.arms){if(rig?.torso)rig.torso.rotation.y=0;return}
  const u=clamp((sw.t-.18)/.16,0,1),extend=sw.t<.36?u:clamp(1-(sw.t-.36)/.19,0,1),s=sw.side,sign=s?1:-1;
  rig.arms[s].rotation.x=-1.45*extend;rig.arms[s].rotation.z=sign*(.2+.55*extend);
  if(rig.elbows)rig.elbows[s].rotation.x=.85*(1-extend*.65);
  if(rig.torso)rig.torso.rotation.y=sign*.35*extend;
 }
 refreshPunchMark(){
  const live=n=>n&&(n.lie||0)<=0&&(n.down||0)<=0;
  let n=null;
  if(!this.inCar&&(this.punch||this.time<this.comboUntil)&&live(this.punchTarget))n=this.punchTarget;
  else if(!this.inCar&&!this.punch)n=this.findPunchTarget();
  this.punchMark.visible=!!n;
  if(n)this.punchMark.position.set(n.x+(n.ox||0),2.15+Math.sin(this.time*4)*.06,n.z);
 }
 noteAssault(){
  if(this.storyAlert)return;
  if(this.heat<=0){this.hits++;if(this.hits>=2)this.raiseWanted(1);return}
  if(this.heat===1)this.raiseWanted(2);
 }
 roadOf(x){return xs.reduce((a,b)=>Math.abs(a-x)<=Math.abs(b-x)?a:b)}
 noteImpact(ped){
  this.freshImpact=true;this.impactSerial++;this.shake=1;this.hitCooldown=2.3;
  if(ped)this.speed*=.62;else this.speed*=-.27;
  if(this.storyAlert)return;
  if(this.heat<=0){
   this.hits++;
   if(this.hits>=2)this.raiseWanted(1);
   else if(!ped)this.notify('车辆擦碰 · 注意来车');
   return;
  }
  if(this.heat===1)this.raiseWanted(2);
 }
 raiseWanted(level){
  this.heat=Math.max(this.heat,level>=2?2:1);this.safe=this.fineHold=this.copDispatchAt=0;
  this.notify(this.heat>=2?'★★ 警车增援':'★ 警戒上升');
 }
 dropWanted(){
  if(this.heat>1){
   this.heat=1;this.safe=this.fineHold=0;this.dismissCop(this.patrol2);
   this.notify('★ 警戒下降 · 增援已撤离');
  }else{
   this.clearAlert();this.notify('警戒解除 · 已脱离追踪');
  }
 }
 deployCop(mesh,slot,avoid){
  if(this.storyAlert)return false;
  const spot=this.copPost(mesh,slot,avoid);
  if(!spot)return false;
  mesh.position.set(spot.x,.08,spot.z);mesh.rotation.y=spot.a;mesh.visible=true;
  Object.assign(mesh.userData,{onDuty:true,anchorX:spot.x,anchorZ:spot.z,stuck:0,copSpeed:0,copPath:[],waypoint:0,replanAt:0,mission:this.heat>=2&&slot===1?'ram':'block',holding:false,phase:'far',holdFx:0,holdFz:0});
  return true;
 }
 copPost(mesh,slot,avoid){
  const p=this.pos,radius=this.heat>=2?80:55,other=slot===2?this.patrol:this.patrol2;
  const axes=pursuitAxes(this),mission=this.heat>=2&&slot===1?'ram':'block',half=10;
  const roads=[];
  for(const x of xs)roads.push({vertical:true,x,lat:Math.abs(p.x-x)});
  for(const z of zs)roads.push({vertical:false,z,lat:Math.abs(p.z-z)});
  roads.sort((a,b)=>a.lat-b.lat);
  const body=this.bodyOf(mesh.userData.model);
  const ok=({x,z,a})=>{
   const d=Math.hypot(x-p.x,z-p.z);
   if(!(d>30&&d<radius))return false;
   if(avoid&&Math.hypot(x-avoid.x,z-avoid.z)<18)return false;
   if(other?.userData.onDuty&&Math.hypot(x-other.position.x,z-other.position.z)<14)return false;
   const box={x,z,a,...body};
   const overlaps=m=>Math.abs(x-m.position.x)<6&&Math.abs(z-m.position.z)<6&&this.boxPush(box,this.meshBox(m));
   return !this.boxBlocked(box)&&!this.cars.some(overlaps)&&!this.traffic.some(({m})=>overlaps(m));
  };
  const spotOf=(road,coordinate,dir)=>road.vertical?{x:road.x,z:coordinate,a:dir>0?0:Math.PI,vertical:true}:{x:coordinate,z:road.z,a:dir>0?Math.PI/2:-Math.PI/2,vertical:false};
  let best=null,bestScore=Infinity;
  const partner=other?.userData.onDuty?other.position:null;
  for(const road of roads){
   if(road.lat>=radius)continue;
   const axis=road.vertical?zs:xs,origin=road.vertical?p.z:p.x;
   for(const dir of [-1,1])for(let along=24;along<radius;along+=6){
    const coordinate=origin+dir*along;
    if(coordinate<axis[0]-half||coordinate>axis.at(-1)+half)continue;
    const spot=spotOf(road,coordinate,dir);
    if(!ok(spot))continue;
    const score=scoreSpawn(spot,{mission,pos:p,axes,partner});
    if(score<bestScore){bestScore=score;best=spot}
   }
  }
  if(best)return best;
  const scan=step=>{
   for(const road of roads){
    if(road.lat>=radius)continue;
    const behind=road.vertical?(axes.fz>=0?-1:1):(axes.fx>=0?-1:1),flip=slot===2?-1:1;
    const axis=road.vertical?zs:xs,origin=road.vertical?p.z:p.x;
    for(const dir of [behind*flip,-behind*flip])for(let along=step===2?32:1;along<radius;along+=step){
     const coordinate=origin+dir*along;
     if(coordinate<axis[0]-half||coordinate>axis.at(-1)+half)continue;
     const spot=spotOf(road,coordinate,dir);
     if(ok(spot))return spot;
    }
   }
   return null;
  };
  return scan(2)||scan(1);
 }
 copStuck(mesh,dt){
  if(mesh.userData.holding){mesh.userData.stuck=0;mesh.userData.anchorX=mesh.position.x;mesh.userData.anchorZ=mesh.position.z;return false}
  const pp=mesh.position,gap=Math.hypot(pp.x-this.pos.x,pp.z-this.pos.z);
  const ax=mesh.userData.anchorX,az=mesh.userData.anchorZ;
  if(ax==null||gap<8&&this.copLineClear(pp,this.pos)||Math.hypot(pp.x-ax,pp.z-az)>1.2){mesh.userData.anchorX=pp.x;mesh.userData.anchorZ=pp.z;mesh.userData.stuck=0;return false}
  mesh.userData.stuck=(mesh.userData.stuck||0)+dt;
  if(mesh.userData.stuck<4)return false;
  mesh.userData.stuck=0;mesh.userData.anchorX=pp.x;mesh.userData.anchorZ=pp.z;return true;
 }
 shiftPos(pos,nx,nz,amount,radius){
  if(!(amount>1e-4))return 0;
  const ox=pos.x,oz=pos.z,x=ox+nx*amount,z=oz+nz*amount,free=(px,pz)=>!radius||!this.blocked(px,pz,radius,false);
  if(free(x,z)){pos.x=x;pos.z=z}else if(free(x,oz))pos.x=x;else if(free(ox,z))pos.z=z;
  return Math.hypot(pos.x-ox,pos.z-oz);
 }
 curbKeeps(hx,hz,x,z){
  const crossing=(px,pz)=>xs.some(s=>Math.abs(px-s)<cornerClearance)&&zs.some(s=>Math.abs(pz-s)<cornerClearance);
  if(crossing(x,z)&&!crossing(hx,hz))return false;
  if(clearOfCrossStreets(hz,1)&&!clearOfCrossStreets(z,1))return false;
  const clearX=px=>xs.every(s=>Math.abs(px-s)>cornerClearance);
  return !(clearX(hx)&&!clearX(x));
 }
 nudgeParked(v,nx,nz,amount){
  if(!(amount>0))return 0;
  if(!v.home)v.home={x:v.m.position.x,z:v.m.position.z};
  const home=v.home,p=v.m.position,room=.4-Math.hypot(p.x-home.x,p.z-home.z);
  if(room<=.01)return 0;
  let x=p.x+nx*Math.min(amount,room),z=p.z+nz*Math.min(amount,room);
  const dx=x-home.x,dz=z-home.z,mag=Math.hypot(dx,dz);
  if(mag>.4){x=home.x+dx/mag*.4;z=home.z+dz/mag*.4}
  if(!this.curbKeeps(home.x,home.z,x,z)||this.blocked(x,z,.6,false))return 0;
  const moved=Math.hypot(x-p.x,z-p.z);p.x=x;p.z=z;return moved;
 }
 bleedCar(v){v.bleed=Math.min(1.8,(v.bleed||0)+.9)}
 separateTraffic(){
  if(this.raceClosed)return;
  const live=this.traffic.filter(v=>!v.parked),parked=this.traffic.filter(v=>v.parked);
  for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
   const hit=this.boxPush(this.meshBox(live[i].m),this.meshBox(live[j].m));
   if(!hit)continue;
   this.shiftPos(live[i].m.position,-hit.nx,-hit.nz,hit.overlap*.5,.7);this.shiftPos(live[j].m.position,hit.nx,hit.nz,hit.overlap*.5,.7);
   this.bleedCar(live[i]);this.bleedCar(live[j]);
  }
  let slowed=false;
  if(this.inCar){
   for(const v of live){
    const hit=this.boxPush(this.meshBox(v.m),this.playerBox());
    if(!hit)continue;
    this.bleedCar(v);
    const share=hit.overlap*.38,px=this.pos.x+hit.nx*share,pz=this.pos.z+hit.nz*share;
    const box=this.playerBox(px,pz);
    const crowded=!this.freshImpact&&(this.carBlocked(px,pz,box.a)||live.some(o=>o!==v&&this.boxPush(box,this.meshBox(o.m)))||this.walkers.some(n=>(n.down||0)<=0&&this.circleHitsBox(n.x+(n.ox||0),n.z,.35,box)));
    if(!this.freshImpact&&!slowed&&hit.overlap>.2){this.speed*=.82;slowed=true}
    if(this.freshImpact||crowded)this.shiftPos(v.m.position,-hit.nx,-hit.nz,hit.overlap,.7);
    else{
     this.shiftPos(v.m.position,-hit.nx,-hit.nz,hit.overlap-share,.7);
     this.pos.x=px;this.pos.z=pz;
    }
   }
   this.syncCar();
  }
  if(this.inCar){
   const solids=[...parked.map(v=>v.m),...this.cars.filter(c=>c!==this.car)];
   for(const m of solids){
    const hit=this.boxPush(this.playerBox(),this.meshBox(m));if(!hit)continue;
    const x=this.pos.x-hit.nx*(hit.overlap+contactSlop),z=this.pos.z-hit.nz*(hit.overlap+contactSlop);
    if(!this.carBlocked(x,z,this.pos.a)){this.pos.x=x;this.pos.z=z}
   }
   this.syncCar();
  }
  for(const v of live)for(const park of parked){
   const hit=this.boxPush(this.meshBox(v.m),this.meshBox(park.m));
   if(!hit)continue;
   this.bleedCar(v);
   const moved=this.nudgeParked(park,hit.nx,hit.nz,Math.min(hit.overlap,.4));
   this.shiftPos(v.m.position,-hit.nx,-hit.nz,Math.max(hit.overlap-moved,0),.7);
  }
  for(let pass=0;pass<3;pass++){
   let stuck=false;
   for(const v of live){
    const hit=this.worstOverlap(v,live,parked);
    if(!hit||hit.need<.04)continue;
    stuck=true;this.snapAlong(v,hit);
   }
   if(!stuck)break;
  }
 }
 worstOverlap(v,live,parked){
  const mine=()=>this.meshBox(v.m);let best=null;
  const pile=other=>{const hit=this.boxPush(mine(),other);if(hit&&(!best||hit.overlap>best.need))best={need:hit.overlap,x:other.x,z:other.z}};
  for(const o of live)if(o!==v)pile(this.meshBox(o.m));
  for(const o of parked)pile(this.meshBox(o.m));
  if(this.inCar)pile(this.playerBox());
  return best;
 }
 snapAlong(v,hit){
  const p=v.m.position,t=v.pts[v.idx];
  let fx=t.x-p.x,fz=t.z-p.z,n=Math.hypot(fx,fz);
  if(n<.2){v.idx=(v.idx+1)%v.pts.length;return}
  fx/=n;fz/=n;
  const step=Math.min(4,hit.need+.2);
  const go=sign=>{
   const x=p.x+fx*sign*step,z=p.z+fz*sign*step;
   if(this.blocked(x,z,.7,false))return false;
   if(this.inCar){const next=this.boxPush(this.playerBox(),{...this.meshBox(v.m),x,z}),prev=this.boxPush(this.playerBox(),this.meshBox(v.m));if(next&&(!prev||next.overlap>=prev.overlap-.02))return false}
   p.x=x;p.z=z;if(sign>0&&step>=n-.05)v.idx=(v.idx+1)%v.pts.length;return true;
  };
  const away=(p.x-hit.x)*fx+(p.z-hit.z)*fz;
  if(!go(away>=0?1:-1))go(away>=0?-1:1);
 }
 walkerLateral(n){
  let ox=clamp(n.ox||0,-1.1,1.1),x=n.x+ox,road=this.roadOf(x);
  if(Math.abs(x-road)<=10.4){
   const outward=Math.sign(n.x-road)||1;
   ox=clamp(road+outward*10.45-n.x,-1.1,1.1);x=n.x+ox;road=this.roadOf(x);
   if(Math.abs(x-road)<=10.4){ox=0;x=n.x}
  }
  if(ox&&this.blocked(x,n.z,.28,false)){ox=0;x=n.x}
  n.ox=ox;return x;
 }
 closingCars(){
  const list=[];
  const strike=this.strikeVel;
  if(strike&&Math.abs(strike.s)>6)list.push({x:this.pos.x,z:this.pos.z,vx:strike.x,vz:strike.z});
  if(!this.raceClosed)for(const v of this.traffic){
   if(v.parked)continue;
   const vx=v.vx||0,vz=v.vz||0;
   if(vx*vx+vz*vz<1.44)continue;
   list.push({x:v.m.position.x,z:v.m.position.z,vx,vz});
  }
  return list;
 }
 passesNear(car,x,z){
  const dx=x-car.x,dz=z-car.z,speed=Math.hypot(car.vx,car.vz);
  if(speed<1)return false;
  const along=(dx*car.vx+dz*car.vz)/speed;
  if(along<.3||along>14)return false;
  return Math.abs(dx*car.vz-dz*car.vx)/speed<3.5;
 }
 dodgeWalker(n,car){
  const side=Math.sign(n.x+(n.ox||0)-car.x)||1;
  n.dir=Math.sign(n.z-car.z)||-Math.sign(car.vz||car.vx||1);
  const legal=ox=>Math.abs(ox)<=1.1&&Math.abs(n.x+ox-this.roadOf(n.x+ox))>10.4&&!this.blocked(n.x+ox,n.z,.28,false);
  const want=clamp(side*1.1,-1.1,1.1);
  if(legal(want))n.ox=want;else if(legal(-want))n.ox=-want;
 }
 layWalker(n,x){n.p.position.set(x,.05,n.z);n.p.rotation.z=1.2;n.p.rotation.x=0}
 relocateWalker(n){
  const me=this.pos,oldX=n.x,oldZ=n.z,hx=n.hitX??oldX,hz=n.hitZ??oldZ,half=10;
  const blockOf=z=>{const upper=zs.findIndex(v=>v>z);return clamp(upper<0?zs.length-1:upper,1,zs.length-1)};
  const oldBlock=blockOf(oldZ),avenues=[];
  for(const road of xs)for(const side of [-12,12]){
   const x=road+side;
   if(x<-250||x>210||xs.some(s=>Math.abs(x-s)<=half))continue;
   avenues.push(x);
  }
  const total=avenues.length*(zs.length-1);
  if(!total)return false;
  const shift=Math.floor(this.r()*total);
  for(let k=0;k<total;k++){
   const pick=(shift+k)%total,x=avenues[pick%avenues.length],block=1+Math.floor(pick/avenues.length);
   if(block===oldBlock&&Math.abs(x-oldX)<20)continue;
   const segment=patrolSegment(x,(zs[block-1]+zs[block])/2,this.world.colliders);
   if(!segment||blockOf(segment.z)!==block)continue;
   if(Math.abs(x-oldX)<2&&segment.max>n.min&&segment.min<n.max)continue;
   if(Math.hypot(x-hx,segment.z-hz)<8||Math.hypot(x-me.x,segment.z-me.z)<25)continue;
   if(xs.some(s=>Math.abs(x-s)<=half)||zs.some(s=>Math.abs(segment.z-s)<=half))continue;
   if(!clearOfCrossStreets(segment.z,.32)||!clearOfCrossStreets(segment.min,.32)||!clearOfCrossStreets(segment.max,.32))continue;
   if(zs.some(s=>s>=segment.min&&s<=segment.max)||this.blocked(x,segment.z,.28,false))continue;
   let scenery=false;
   for(const c of this.world.colliders)if(Math.abs(x-c.x)<c.w+.32&&segment.max>c.z-c.d-.32&&segment.min<c.z+c.d+.32){scenery=true;break}
   if(scenery)continue;
   n.x=x;n.min=segment.min;n.max=segment.max;n.z=segment.z;n.ox=0;n.panic=0;n.down=0;
   n.p.rotation.z=0;n.p.rotation.x=0;n.p.position.set(x,.17,segment.z);n.p.visible=dist(me,n.p.position)<78;
   return true;
  }
  return false;
 }
 stepWalkers(dt){
  const me=this.pos,cars=this.closingCars(),fast=!!this.strikeFast;
  for(const n of this.walkers){
   if(n.panic==null)n.panic=0;if(n.down==null)n.down=0;if(n.ox==null)n.ox=0;if(n.lie==null)n.lie=0;if(n.flinch==null)n.flinch=0;
   if(this.hitStop>0&&n===this.punchVictim){
    if((n.lie||0)>0)this.layWalker(n,n.hitX??n.x);else n.p.position.set(n.x+(n.ox||0),.17,n.z);
    n.p.visible=true;continue;
   }
   if(n.lie>0){
    n.lie-=dt;n.panic=0;n.ox=0;this.layWalker(n,n.hitX??n.x);n.p.visible=true;
    if(n.lie>0){n.down=n.lie;continue}
    n.lie=0;n.down=0;n.p.visible=false;
    if(!this.relocateWalker(n)){n.down=1;n.p.visible=false}
    continue;
   }
   if(n.down>0){
    n.down-=dt;n.panic=0;n.p.visible=false;
    if(n.down>0)continue;
    if(!this.relocateWalker(n)){n.down=1;n.p.visible=false}
    continue;
   }
   if(fast&&n.down<=0&&this.circleHitsBox(n.x+(n.ox||0),n.z,.35,this.playerBox())){
    n.hitX=n.x+(n.ox||0);n.hitZ=n.z;n.lie=10;n.down=10;n.panic=0;n.flinch=0;n.ox=0;this.layWalker(n,n.hitX);n.p.visible=true;
    if(this.hitCooldown<=0)this.noteImpact(true);
    continue;
   }
   if(n.flinch>0){
    n.flinch-=dt;const x=this.walkerLateral(n);
    n.p.position.set(x,.17,n.z);n.p.rotation.y=Math.atan2(n.x-me.x,n.z-me.z);n.p.visible=dist(me,n.p.position)<78;
    if(n.p.visible)personDetail(n.p,dist(me,n.p.position)<14);continue;
   }
   let threat=null,best=1e9;
   for(const car of cars){if(!this.passesNear(car,n.x+(n.ox||0),n.z))continue;const d=Math.hypot(car.x-n.x,car.z-n.z);if(d<best){best=d;threat=car}}
   if(threat){n.panic=1.6;this.dodgeWalker(n,threat)}else n.panic=Math.max(0,n.panic-dt);
   if(n.panic<=0){n.ox*=Math.max(0,1-dt*3);if(Math.abs(n.ox)<.02)n.ox=0}
   const flee=this.heat>0&&!this.storyAlert&&Math.hypot(me.x-n.x,me.z-n.z)<18;
   if(flee&&!threat)n.dir=n.z>=me.z?1:-1;
   const greeting=!flee&&n.panic<=0&&n.down<=0&&!!n.p.userData.role&&!this.inCar&&Math.hypot(me.x-n.x,me.z-n.z)<2.8;
   if(!greeting){
    const pace=n.rate*(n.panic>0||flee?1.7:1),x=this.walkerLateral(n),nz=clamp(n.z+pace*n.dir*dt,n.min,n.max);
    if(!this.blocked(x,nz,.28,false))n.z=nz;else if(!flee&&n.panic<=0)n.dir*=-1;
    if(!flee){if(n.z===n.max)n.dir=-1;else if(n.z===n.min)n.dir=1}
   }
   const x=this.walkerLateral(n);
   n.p.position.set(x,.17,n.z);n.p.rotation.z=0;n.p.rotation.x=0;n.p.visible=dist(me,n.p.position)<78;
   if(n.p.visible){personDetail(n.p,dist(me,n.p.position)<14);n.p.rotation.y=greeting?Math.atan2(me.x-x,n.z-me.z):n.dir<0?0:Math.PI;stride(n.p,this.time*n.rate*4.7+n.x,greeting?.025:1)}
  }
 }
 flashLights(){this.lightR.color.setHex(Math.sin(this.time*15)>0?0xff3154:0x672639);this.lightB.color.setHex(Math.sin(this.time*15)<0?0x649aff:0x25375b)}
 copLineClear(a,b){return this.clearScenerySegment(a.x,a.z,b.x,b.z)}
 assignCopMissions(cops){
  const entries=cops.map(cop=>({cop,x:cop.position.x,z:cop.position.z,mission:cop.userData.mission}));
  assignMissions(entries,this.pos,pursuitAxes(this));
  for(const entry of entries)entry.cop.userData.mission=entry.mission;
 }
 partnerOf(mesh){const other=mesh===this.patrol?this.patrol2:this.patrol;return other?.visible&&other.userData.onDuty?other:null}
 turnCop(mesh,heading,dt,rate){
  const yaw=mesh.rotation.y,diff=Math.atan2(Math.sin(heading-yaw),Math.cos(heading-yaw));
  const a=yaw+clamp(diff,-rate*dt,rate*dt),box=this.meshBox(mesh);
  if(!this.boxBlocked({...box,a}))mesh.rotation.y=a;
  return diff;
 }
 driveCop(mesh,target,dt,speed){
  const pp=mesh.position,dx=target.x-pp.x,dz=target.z-pp.z,left=Math.hypot(dx,dz);
  if(left<.2)return;
  const heading=Math.atan2(-dx,-dz);
  this.turnCop(mesh,heading,dt,2.6);
  const step=Math.min(left,speed*dt)*Math.max(0,Math.cos(heading-mesh.rotation.y));
  const x=pp.x-Math.sin(mesh.rotation.y)*step,z=pp.z-Math.cos(mesh.rotation.y)*step;
  if(!this.boxBlocked({...this.meshBox(mesh),x,z,a:mesh.rotation.y})){pp.x=x;pp.z=z}
  else{mesh.userData.copSpeed=0;mesh.userData.replanAt=Math.min(mesh.userData.replanAt??0,this.time+.2)}
 }
 steerCop(mesh,dt){
  const me=this.pos,pp=mesh.position,state=mesh.userData,gap=dist(me,pp),axes=pursuitAxes(this);
  const mission=state.mission||'block',blocked=(x,z)=>this.blocked(x,z,.8,false);
  if(gap<copSwitchClose)state.phase='close';
  else if(gap>copSwitchFar||!state.phase)state.phase='far';
  const goal=mission==='ram'?ramGoal(me,axes,blocked):blockGoal(me,axes,blocked);
  const along=(pp.x-me.x)*axes.fx+(pp.z-me.z)*axes.fz,stopped=!this.inCar||Math.abs(this.speed)<2;
  if(mission==='block'&&state.phase==='close'&&dist(pp,goal)<5&&along>2&&!(stopped&&gap>8.5)){
   state.holding=true;state.holdFx=axes.fx;state.holdFz=axes.fz;
  }
  if(state.holding){
   const turned=axes.fx*(state.holdFx??axes.fx)+axes.fz*(state.holdFz??axes.fz)<.45;
   if(mission!=='block'||along<-3||turned||stopped&&gap>8.5||gap>copSwitchFar)state.holding=false;
  }
  if(state.holding){state.copSpeed=0;this.turnCop(mesh,broadsideHeading(axes),dt,3.4);return}
  const partner=this.partnerOf(mesh),clear=state.phase==='close'&&this.copLineClear(pp,goal)&&!segmentHits(pp,goal,me,copPassRadius);
  if(!clear&&this.time>=(state.replanAt??0)){state.copPath=route(pp,goal).slice(1);state.waypoint=0;state.replanAt=this.time+.8}
  if(clear){state.copPath=[];state.waypoint=0}
  const path=state.copPath??[];
  while(state.waypoint<path.length-1&&dist(pp,path[state.waypoint])<3)state.waypoint++;
  let target=clear?goal:path[state.waypoint]??goal;
  if(mission==='block'&&segmentHits(pp,target,me,copPassRadius)){
   const side=avoidCut(pp,goal,me,axes);
   if(side!==goal&&!blocked(side.x,side.z))target=side;
  }
  const other=partner?{x:partner.position.x,z:partner.position.z,speed:partner.userData.copSpeed||0}:null;
  const shifted=shiftOffPartner(pp,target,other);
  if(!blocked(shifted.x,shifted.z)&&Math.hypot(shifted.x-me.x,shifted.z-me.z)>3)target=shifted;
  const dx=target.x-pp.x,dz=target.z-pp.z,heading=Math.atan2(-dx,-dz);
  const diff=Math.atan2(Math.sin(heading-mesh.rotation.y),Math.cos(heading-mesh.rotation.y));
  const top=this.heat>=2?21:17;
  let desired=mellowCruise(top,gap,this.heat,!this.inCar)*Math.max(0,Math.cos(diff));
  if(dist(pp,goal)<8)desired*=clamp(dist(pp,goal)/8,0,1);
  desired=yieldSpeed(desired,pp,other,{x:-Math.sin(mesh.rotation.y),z:-Math.cos(mesh.rotation.y)});
  state.copSpeed=(state.copSpeed||0)+clamp(desired-(state.copSpeed||0),-24*dt,10*dt);
  this.driveCop(mesh,target,dt,state.copSpeed);
 }
 shiftCop(mesh,nx,nz,distance){
  if(distance<=0)return;
  const box=this.meshBox(mesh),x=box.x+nx*distance,z=box.z+nz*distance;
  if(!this.boxBlocked({...box,x,z})){mesh.position.x=x;mesh.position.z=z}
  else if(x!==box.x&&!this.boxBlocked({...box,x}))mesh.position.x=x;
  else if(z!==box.z&&!this.boxBlocked({...box,z}))mesh.position.z=z;
 }
 unstickCop(mesh){
  for(const v of this.traffic){
   const hit=this.boxPush(this.meshBox(mesh),this.meshBox(v.m));
   if(!hit)continue;
   if(v.parked){const moved=this.nudgeParked(v,hit.nx,hit.nz,Math.min(hit.overlap,.4));this.shiftCop(mesh,-hit.nx,-hit.nz,hit.overlap-moved)}
   else{
    const trial={...this.meshBox(v.m),x:v.m.position.x+hit.nx*hit.overlap*.3,z:v.m.position.z+hit.nz*hit.overlap*.3};
    if(this.inCar&&this.boxPush(this.playerBox(),trial))this.shiftCop(mesh,-hit.nx,-hit.nz,hit.overlap);
    else{this.shiftCop(mesh,-hit.nx,-hit.nz,hit.overlap*.7);this.shiftPos(v.m.position,hit.nx,hit.nz,hit.overlap*.3,.7)}
    this.bleedCar(v);
   }
  }
  for(const car of this.cars){
   const hit=this.boxPush(this.meshBox(mesh),this.meshBox(car));
   if(!hit)continue;
   if(this.inCar&&car===this.car&&this.hitCooldown<=0){
    const approach=(Math.sin(this.motionA)*hit.nx+Math.cos(this.motionA)*hit.nz)*this.speed;
    if(approach>4)this.noteImpact(false);
   }
   this.shiftCop(mesh,-hit.nx,-hit.nz,hit.overlap);
  }
 }
 // The chapter handles custody and escape as different story outcomes.
 storyChase(dt){
  const me=this.pos;this.patrol2.visible=false;
  const pp=this.patrol.position,dx=me.x-pp.x,dz=me.z-pp.z,dd=Math.hypot(dx,dz);
  const advance=this.inCar?dt*9:Math.min(dt*9,Math.max(0,dd-2.8));
  const tx=dx/Math.max(1,dd)*advance,tz=dz/Math.max(1,dd)*advance;
  if(!this.blocked(pp.x+tx,pp.z+tz,.9,false)){pp.x+=tx;pp.z+=tz}else if(!this.blocked(pp.x+tx,pp.z,.9,false))pp.x+=tx;else if(!this.blocked(pp.x,pp.z+tz,.9,false))pp.z+=tz;
  this.patrol.rotation.y=Math.atan2(-dx,-dz);
  this.safe=dd>26&&Math.hypot(me.x-48,me.z+120)>34?this.safe+dt:0;
  const canDetain=this.time>=this.boardingGrace&&(!this.inCar||Math.abs(this.speed)<2.2);
  this.caught=dd<3.2&&canDetain&&this.copLineClear(pp,me)?this.caught+dt:0;
  const leftVenue=Math.hypot(me.x-68,me.z+114)>65;
  if(leftVenue||this.safe>6||this.caught>2.3){
   if(!leftVenue&&this.caught>2.3)this.custody++;
   else this.notify('警戒解除 · 已脱离追踪');
   this.clearAlert();
  }
 }
 pursue(dt){
  if(this.raceClosed&&!this.storyAlert){this.patrol.visible=false;this.patrol2.visible=false;if(this.heat>0)this.pursuitHeld=true;return}
  if(this.heat<=0){this.patrol.visible=false;this.patrol2.visible=false;this.pursuitHeld=false;return}
  this.flashLights();
  if(this.storyAlert){this.storyChase(dt);return}
  const radius=this.heat>=2?80:55;
  if(this.pursuitHeld){
   this.pursuitHeld=false;this.safe=this.fineHold=this.copDispatchAt=0;
   for(const cop of [this.patrol,this.patrol2])if(dist(cop.position,this.pos)>radius)this.dismissCop(cop);
  }
  const pool=this.heat>=2?[this.patrol,this.patrol2]:[this.patrol];
  if(this.time>=this.copDispatchAt&&pool.some(c=>!c.userData.onDuty)){
   this.copDispatchAt=this.time+.75;
   for(const cop of pool)if(!cop.userData.onDuty)this.deployCop(cop,pool.indexOf(cop)+1);
  }
  const cops=pool.filter(c=>c.userData.onDuty);
  for(const cop of cops)cop.visible=true;
  if(dt===0)return;
  this.assignCopMissions(cops);
  for(const cop of cops)this.steerCop(cop,dt);
  for(const cop of cops)this.unstickCop(cop);
  if(cops.length===2){
   const [a,b]=cops,hit=this.boxPush(this.meshBox(a),this.meshBox(b));
   if(hit){this.shiftCop(a,-hit.nx,-hit.nz,hit.overlap*.5);this.shiftCop(b,hit.nx,hit.nz,hit.overlap*.5)}
  }
  for(const cop of cops)if(this.copStuck(cop,dt)){
   cop.userData.replanAt=0;
   // Move a stranded cruiser to another road only after the player has left its vicinity.
   if(dist(cop.position,this.pos)>34)this.deployCop(cop,pool.indexOf(cop)+1,cop.position);
  }
  const inside=cops.some(c=>dist(c.position,this.pos)<=radius);
  this.safe=inside?0:this.safe+dt;
  if(this.safe>6){this.dropWanted();return}
  const stopped=!this.inCar||Math.abs(this.speed)<2;
  const close=stopped&&cops.some(c=>dist(c.position,this.pos)<8&&this.copLineClear(c.position,this.pos));
  this.fineHold=close?this.fineHold+dt:0;
  if(this.fineHold>2){
   const fee=Math.min(100,this.save.money);this.save.money-=fee;
   this.clearAlert();this.revive();
   this.notify(fee?'被拘留 · 罚款 $'+fee+' · 送回海景大道':'被拘留 · 送回海景大道');
  }
 }
 movingCity(dt){
  this.freshImpact=false;this.strikeFast=dt>0&&this.inCar&&Math.abs(this.speed)>7;
  this.strikeVel=this.inCar?{x:-Math.sin(this.motionA)*this.speed,z:-Math.cos(this.motionA)*this.speed,s:this.speed}:null;
  const me=this.pos;
  for(const v of this.traffic){
   if(v.parked)continue;
   if(this.raceClosed){v.m.visible=false;v.vx=v.vz=v.bleed=0;continue}
   const p=v.m.position,target=v.pts[v.idx],dx=target.x-p.x,dz=target.z-p.z,n=Math.hypot(dx,dz);
   if(v.bleed>0)v.bleed=Math.max(0,v.bleed-dt);
   const drag=v.bleed>0?Math.max(.22,1-v.bleed*.5):1;
   const away=dist(me,p),approaching=away<10&&(me.x-p.x)*dx+(me.z-p.z)*dz>0,waiting=!this.inCar&&away<5.2;
   const rate=waiting||approaching&&(!this.inCar||Math.abs(this.speed)<2)?0:v.v*(this.livePos&&dist(p,this.livePos)<21?.55:1)*drag;
   const step=Math.min(n,rate*dt);
   const moveX=n>0?dx/n*step:0,moveZ=n>0?dz/n*step:0;
   p.x+=moveX;p.z+=moveZ;v.vx=dt>0?moveX/dt:0;v.vz=dt>0?moveZ/dt:0;
   if(n>0)v.m.rotation.y=Math.atan2(-dx,-dz);
   if(step===n&&dt>0)v.idx=(v.idx+1)%v.pts.length;
   if(dt>0&&this.strikeVel&&this.hitCooldown<=0&&Math.abs(this.strikeVel.s)>4&&away<10){
    const hit=this.boxPush(this.playerBox(),this.meshBox(v.m));
    if(hit&&(this.strikeVel.x-v.vx)*hit.nx+(this.strikeVel.z-v.vz)*hit.nz>4)this.noteImpact(false);
   }
   v.m.visible=dist(me,p)<155;
  }
  this.stepWalkers(dt);this.separateTraffic();this.pursue(dt);
 }
 update(dt,keys,target){this.time+=dt;this.hitCooldown-=dt;this.hitStop=Math.max(0,this.hitStop-dt);this.shake=Math.max(0,this.shake-dt*2.7);
  if(this.inCar){this.punch=null;this.punchBuffer=false;this.comboUntil=0;if(this.punchMark)this.punchMark.visible=false;this.driving(dt,keys)}else this.walk(dt,keys);this.movingCity(dt);
  const m=this.station;m.group.visible=!!target&&target.type!=='race'&&target.type!=='chapter';if(target){m.ring.material.color.setHex(target.type==='cab'?0xffbc64:target.type==='pin'?0x77d6fc:0xff739c);m.group.position.set(target.x,0,target.z);m.tag.position.y=3.75+Math.sin(this.time*3)*.25;m.tag.rotation.y=this.camA;m.ring.scale.setScalar(1+Math.sin(this.time*2)*.045)}
  this.collectibles.forEach((o,i)=>{if(!o.visible)return;o.rotation.y=this.time*1.7;o.position.y=1.45+Math.sin(this.time*2+i)*.15;o.visible=!this.save.tapes.includes(i)});
  this.view(dt);this.world.update(this.time,this.camera)
 }
 photo(yaw,height,radius){const p=this.pos,angle=p.a+yaw,dx=Math.sin(angle),dz=Math.cos(angle),arm=this.boom(p.x,p.z,p.x+dx*radius,p.z+dz*radius);
  const back=arm>.999?radius:radius*arm;
  const y=this.inCar&&back<this.bodyOf(this.car.userData.model).hl+.4?Math.max(height,(this.carSpec.cargoHeight??1.35)+.7):height;
  this.camera.position.set(p.x+dx*back,y,p.z+dz*back);this.camera.lookAt(p.x,this.inCar?.95:1.05,p.z);this.camera.fov=this.camera.aspect<.8?63:51;this.camera.updateProjectionMatrix();this.world.update(this.time,this.camera);this.render();
 }
 render(){
  const seat=this.inCar?this.carSpec.seatHeight:null;
  if(seat!=null){
   if(!this.seatedDriver){
    const driver=makePerson('rico'),rig=driver.userData;driver.scale.setScalar(.90);
    for(const leg of rig.legs)leg.rotation.x=1.27;
    for(const knee of rig.knees)knee.rotation.x=-1.37;
    for(const arm of rig.arms)arm.rotation.x=.72;
    for(const elbow of rig.elbows)elbow.rotation.x=.60;
    this.seatedDriver=driver;
   }
   const shell=this.car.userData.shell;
   if(this.seatedDriver.parent!==shell){shell.add(this.seatedDriver);this.seatedDriver.position.set(-.34,seat-.74,.19)}
  }else if(this.seatedDriver?.parent)this.seatedDriver.removeFromParent();
  this.renderer.render(this.scene,this.camera);
 }
}
