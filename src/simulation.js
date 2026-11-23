import {makePerson,personDetail} from './people.js';
import {vehicles,additions,streetResidents} from './street-catalog.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createWorld} from './world.js';
import {makeCar,makeWalker,stride,canvasTexture} from './models.js';
import {rng,spawn,parkedSpots,parkedColors,streetStyles,paints,tapes,clamp,dist,xs,zs,cornerClearance,clearOfCrossStreets} from './data.js';

const unit=new T.BoxGeometry(1,1,1),black=new T.MeshBasicMaterial({color:0x282a39});
const material=c=>new T.MeshBasicMaterial({color:c});
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
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
  this.world=createWorld(this.scene);this.marks=makeTyreMarks(this.scene);this.speed=0;this.idleAngle=.43;this.boost=1;this.time=0;this.heat=0;this.hits=0;this.hitCooldown=0;this.shake=0;this.safe=0;this.nextMark=0;this.camA=0;this.smoothSteer=0;this.inCar=true;
  this.cars=(save.fleet??[spawn,...parkedSpots]).map((p,i)=>{
   const style=streetStyles[p.trafficId];
   const m=style?makeCar(style.color,p.model??style.model,false):makeCar(parkedColors[i],i%2,true);
   m.userData.trafficId=p.trafficId;m.position.set(p.x,.07,p.z);m.rotation.y=p.a;this.scene.add(m);return m;
  });
  this.carId=save.car;this.car=this.cars[this.carId];this.pos={...save.pos};this.motionA=this.pos.a;
  // If a previous driver saved another car at the default pickup, keep the inactive car clear.
  for(const [i,c] of this.cars.entries())if(!save.fleet&&i!==this.carId&&Math.hypot(c.position.x-this.pos.x,c.position.z-this.pos.z)<4){const spot=parkedSpots[Math.max(0,this.carId-1)];c.position.set(spot.x,.07,spot.z);c.rotation.y=spot.a}
  this.syncCar();this.applyPaint();this.hero=makeWalker(44,true);this.hero.visible=false;this.scene.add(this.hero);
  if(save.walker){this.inCar=false;this.pos={...save.walker};this.hero.visible=true}
  this.station=goalMarker();this.scene.add(this.station.group);this.collectibles=tapes.map((p,i)=>{const o=makeTape();o.position.set(p.x,1.5,p.z);o.visible=!save.tapes.includes(i);this.scene.add(o);return o});
  const random=this.r;this.walkers=[];
  const beats=[[172.6,-182],[147,40],[-68.5,100],[172.6,-136],[172.6,-44],[147,104],[172.6,-100],[147,21],[-68.5,58],[69.1,-103],[172.6,-116]];
  for(let i=0;i<30;i++){const beat=beats[i],p=beat?makePerson(streetResidents[i]):makeWalker(48+i);
   const x=beat?.[0]??(i<16?147:xs[i%6]+(i%2?12:-12)),z=beat?.[1]??(-220+(i*59)%440);const dir=i%2?1:-1;
   const segment=patrolSegment(x,z,this.world.colliders),rate=.8+random()*.7;
   if(segment){this.walkers.push({p,x,...segment,dir,rate});p.position.set(x,.17,segment.z);this.scene.add(p)}}
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
  if(!claimed.has(16)){const van=makeCar(streetStyles[16].color,2);van.userData.trafficId=16;van.position.set(170,.07,-144);van.rotation.y=Math.PI;this.scene.add(van);this.traffic.push({m:van,parked:true})}
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
   this.scene.add(m);this.traffic.push({m,parked:true});
  }
  const pinned=save.pin?.vehicleKey&&this.parkedStreetCar(save.pin.vehicleKey);
  if(pinned)Object.assign(save.pin,{x:pinned.position.x,z:pinned.position.z});
  this.patrol=flattenTraffic(makeCar(0xd6ded8,1,false));this.patrol.visible=false;this.scene.add(this.patrol);simpleBox(this.patrol,0,1.6,.1,1.05,.13,.34,black);
  this.lightR=material(0xff3459);this.lightB=material(0x679cff);simpleBox(this.patrol,-.31,1.72,.1,.4,.13,.29,this.lightR);simpleBox(this.patrol,.31,1.72,.1,.4,.13,.29,this.lightB);
  this.custody=0;this.storyAlert=false;this.impactSerial=0;this.raceClosed=false;
  this.beam=new T.SpotLight(0xffebc3,225,36,.52,.7,1.35);this.beam.position.set(0,.88,-1.7);this.beam.target.position.set(0,-.12,-22);this.setNight(save.night);this.resize();this.resetCamera();
 }
 setNight(on){this.save.night=on;this.world.setNight(on);this.beam.visible=on;this.car.add(this.beam,this.beam.target)}
 footHeight(x,z){return x>=177.5&&Math.abs(z+128)<=5?.355:.14}
 placeOnFoot(x,z,a){this.inCar=false;this.speed=0;this.pos={x,z,a};this.hero.visible=true;this.hero.position.set(x,this.footHeight(x,z),z);this.hero.rotation.y=a;this.resetCamera()}
 restoreFootClearance(){
  const {x,z,a}=this.pos;
  if(this.inCar||!this.blocked(x,z,.32,false))return;
  // An older save can land inside street furniture that has since moved.
  for(let ring=1;ring<=12;ring++){
   for(let direction=0;direction<12;direction++){
    const angle=direction*Math.PI/6,px=x+ring*.4*Math.cos(angle),pz=z+ring*.4*Math.sin(angle);
    if(!this.blocked(px,pz,.32)){this.placeOnFoot(px,pz,a);return}
   }
  }
 }
 clearAlert(){this.boardingGrace=0;this.usedBoardingGrace=false;this.storyAlert=false;this.patrol.visible=false;this.heat=this.safe=this.hits=this.caught=0}
 beginAlert(level,x,z){this.clearAlert();this.storyAlert=true;this.heat=level;this.patrol.position.set(x,.08,z);this.patrol.visible=true}
 gridStart(p){this.carId=0;this.car=this.cars[0];this.pos={x:p.x,z:p.z,a:p.a};this.motionA=p.a;this.speed=0;this.boost=1;this.emptyBoost=false;this.smoothSteer=0;this.inCar=true;this.hero.visible=false;this.patrol.visible=false;this.heat=this.hits=this.caught=0;this.syncCar();this.setNight(this.save.night);this.resetCamera()}
 resize(){const {clientWidth:w,clientHeight:h}=this.renderer.domElement;this.renderer.setSize(Math.max(w,1),Math.max(h,1),false);this.camera.aspect=w/Math.max(h,1);this.camera.updateProjectionMatrix()}
 applyPaint(){this.cars[0].userData.paint.color.setHex(paints.find(p=>p.id===this.save.paint).color)}
 syncCar(){this.car.position.set(this.pos.x,.07,this.pos.z);this.car.rotation.y=this.pos.a}
 resetCamera(){this.camA=this.pos.a;this.view(1,true)}
 view(dt,snap=false){
  const p=this.pos,high=this.save.view===1,foot=!this.inCar;const diff=Math.atan2(Math.sin(p.a-this.camA),Math.cos(p.a-this.camA));
  this.camA+=diff*(snap?1:1-Math.exp(-dt*(foot?7:5.7)));
  const wantOffset=this.livePos?1.09:!foot&&!high&&Math.abs(this.speed)<1?(this.camera.aspect<.8?.07:.31):0;
  this.idleAngle+=(wantOffset-this.idleAngle)*(snap?1:1-Math.exp(-dt*2.2));
  const back=this.livePos?9.65:foot?5:high?12:7.6+Math.abs(this.speed)*.027,up=this.livePos?3.05:foot?2.9:high?7:3.45,side=foot?.42:0,s=Math.sin(this.camA-this.idleAngle),c=Math.cos(this.camA-this.idleAngle);
  const x=p.x+s*back+c*side,z=p.z+c*back-s*side;
  const dest=vec(x,up+this.shake*Math.sin(this.time*76)*.12,z);
  // Shorten the camera boom against the first nearby building when turning in an alley.
  for(const b of this.world.colliders){if(b.w<2||Math.abs(b.x-p.x)>26+b.w||Math.abs(b.z-p.z)>26+b.d)continue;
   for(let i=1;i<=6;i++){const f=i/6,tx=p.x+(x-p.x)*f,tz=p.z+(z-p.z)*f;if(Math.abs(tx-b.x)<b.w+.18&&Math.abs(tz-b.z)<b.d+.18){const g=Math.max(.15,(i-1)/6);dest.x=p.x+(x-p.x)*g;dest.z=p.z+(z-p.z)*g;break}}
  }
  this.camera.position.lerp(dest,snap?1:1-Math.exp(-dt*12));
  const ahead=this.livePos?.3:foot?3:high?6:8;this.camera.lookAt(p.x-Math.sin(this.camA)*ahead,foot?1.15:1.0,p.z-Math.cos(this.camA)*ahead);
  const fov=(this.camera.aspect<.76?73:61)+Math.abs(this.speed)*.21; if(Math.abs(this.camera.fov-fov)>.08){this.camera.fov=fov;this.camera.updateProjectionMatrix()}
 }
 blocked(x,z,r,includeCars=true){
  if(x< -256+r||x>225-r||z< -256+r||z>256-r)return true;
  if(this.world.colliders.some(o=>Math.abs(x-o.x)<o.w+r&&Math.abs(z-o.z)<o.d+r))return true;
  if(!includeCars)return false;
  const occupied=c=>{
   if(c===this.car)return false;
   const dx=x-c.position.x,dz=z-c.position.z;
   if(c.userData.model<3)return Math.hypot(dx,dz)<r+1.1;
   if(Math.abs(dx)>4||Math.abs(dz)>4)return false;
   const s=Math.sin(c.rotation.y),k=Math.cos(c.rotation.y);
   return Math.hypot(dx*k-dz*s,Math.max(0,Math.abs(dx*s+dz*k)-1.1))<.84+r;
  };
  return this.cars.some(occupied)||!!this.traffic?.some(v=>v.parked&&v.m.userData.model>=3&&occupied(v.m));
 }
 move(dx,dz,r){const p=this.pos,x=p.x+dx,z=p.z+dz;if(!this.blocked(x,z,r)){p.x=x;p.z=z;return true}
  if(!this.blocked(x,p.z,r))p.x=x;else if(!this.blocked(p.x,z,r))p.z=z;return false;
 }
 interact(){
  if(this.inCar){if(Math.abs(this.speed)>3.4){this.notify('减速停车后再下车');return}
   const p=this.pos;let next=null;for(const off of [-2.35,2.35,-3.3,3.3]){const x=p.x+Math.cos(p.a)*off,z=p.z-Math.sin(p.a)*off;if(!this.blocked(x,z,.32)){next={x,z};break}}
   if(!next){this.notify('车门旁空间不足，向前挪一点');return}
   this.placeOnFoot(next.x,next.z,p.a);this.notify('已下车 · 靠近车身可再次上车');
  }else{const nearest=this.nearCar();if(!nearest){this.notify('走到车旁，按 F 或点击「上车」');return}
   const index=this.traffic.findIndex(v=>v.m===nearest);
   if(index>=0){
    this.traffic.splice(index,1);
    const {shell,trafficBody}=nearest.userData;
    if(trafficBody){nearest.remove(trafficBody);delete nearest.userData.trafficBody;nearest.add(shell)}
    this.cars.push(nearest);
   }
   if(this.storyAlert&&!this.usedBoardingGrace){this.boardingGrace=this.time+4;this.usedBoardingGrace=true;this.caught=0}
   this.car=nearest;this.carId=this.cars.indexOf(nearest);Object.assign(this.pos,{x:nearest.position.x,z:nearest.position.z,a:nearest.rotation.y});this.motionA=this.pos.a;this.inCar=true;this.hero.visible=false;this.speed=0;this.smoothSteer=0;this.setNight(this.save.night);this.resetCamera();this.notify('已上车 · '+this.carName())}
 }
 nearCar(){
  let best=null,range=5.2;
  const consider=car=>{const d=dist(this.pos,car.position);if(car.visible&&d<range){best=car;range=d}};
  this.cars.forEach(consider);for(const {m} of this.traffic)consider(m);return best;
 }
 parkedStreetCar(key){
  const spot=additions.find(v=>v.key===key);if(!spot)return null;
  return this.cars.find(c=>c.userData.trafficId===spot.parkingId)??this.traffic.find(v=>v.m.userData.trafficId===spot.parkingId)?.m;
 }
 carName(car=this.car){return vehicles[car.userData.model].name}
 get carSpec(){return vehicles[this.car.userData.model]}
 rescue(){const p=this.pos;const x=xs.reduce((a,b)=>Math.abs(a-p.x)<Math.abs(b-p.x)?a:b);Object.assign(p,{x:x+4.2,z:clamp(p.z,-232,232),a:0});this.speed=0;this.motionA=0;this.inCar=true;this.hero.visible=false;this.syncCar();this.resetCamera();this.notify('救援完成 · 车辆已回到车道')}
 driving(dt,keys){
  const p=this.pos,forward=keys.has('KeyW'),reverse=keys.has('KeyS'),steer=Number(keys.has('KeyA'))-Number(keys.has('KeyD'));
  const {engine,brakes,nitro}=this.carId===0?this.save.mods:{engine:0,brakes:0,nitro:0};
  const hand=keys.has('Space'),boost=keys.has('ShiftLeft')&&forward&&this.boost>.015&&!this.emptyBoost;
  if(!keys.has('ShiftLeft')||this.boost>.32)this.emptyBoost=false;
  this.boost=clamp(this.boost+(boost?-.30/(1+.35*nitro):.105)*dt,0,1);if(this.boost<.015)this.emptyBoost=true;
  const oldSpeed=this.speed;const sand=p.x>179,drag=(sand?.63:.16)*this.speed;
  if(forward)this.speed+=(this.speed< -1?23:(boost?20.5:12.8)*(this.carSpec.power??1))*(1+.13*engine)*dt;
  if(reverse)this.speed-=(this.speed>1?25*(1+.18*brakes):7.0)*dt;
  this.speed-=drag*dt;const braking=(hand?13:!forward&&!reverse?2.1:.23)*dt;
  this.speed-=Math.sign(this.speed)*Math.min(Math.abs(this.speed),braking);
  this.speed=clamp(this.speed,-8,sand?17:boost?48+3*engine:Math.max(34+3*engine,oldSpeed-dt*6));
  this.smoothSteer+=(steer-this.smoothSteer)*(1-Math.exp(-dt*7));
  p.a+=this.smoothSteer*Math.sign(this.speed)*Math.min(Math.abs(this.speed)*.26,hand?2.35:1.42)*(this.carSpec.steering??1)*dt;
  const diff=Math.atan2(Math.sin(p.a-this.motionA),Math.cos(p.a-this.motionA));this.motionA+=diff*(1-Math.exp(-dt*(hand?2.8:8)));
  const ok=this.move(-Math.sin(this.motionA)*this.speed*dt,-Math.cos(this.motionA)*this.speed*dt,.95);
  if(!ok&&Math.abs(this.speed)>1.8){if(Math.abs(this.speed)>6)this.impactSerial++;this.shake=.8;this.speed*=-.22}
  this.syncCar();this.car.userData.shell.rotation.z=this.smoothSteer*Math.min(Math.abs(this.speed)*.003,.055);
  for(const w of this.car.userData.wheels)w.rotation.x-=this.speed*dt/.39;
  if(hand&&Math.abs(this.speed)>6&&this.time>this.nextMark){this.marks(p.x,p.z,p.a);this.nextMark=this.time+.045}
 }
 walk(dt,keys){const p=this.pos,forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),turn=Number(keys.has('KeyA'))-Number(keys.has('KeyD'));p.a+=turn*2.55*dt;
  const speed=(keys.has('ShiftLeft')?7:3.8)*forward*(this.walkScale??1);const dx=-Math.sin(p.a)*speed*dt,dz=-Math.cos(p.a)*speed*dt;
  if(Math.hypot(p.x+dx-this.car.position.x,p.z+dz-this.car.position.z)>1.2)this.move(dx,dz,.32);
  this.hero.position.set(p.x,this.footHeight(p.x,p.z),p.z);this.hero.rotation.y=p.a;stride(this.hero,this.time*(Math.abs(speed)+4),forward?1:0);
 }
 movingCity(dt){
  const me=this.pos;
  for(const v of this.traffic){if(v.parked)continue;if(this.raceClosed){v.m.visible=false;continue}const p=v.m.position,target=v.pts[v.idx],dx=target.x-p.x,dz=target.z-p.z,n=Math.hypot(dx,dz);
   if(n<v.v*dt+.08){p.x=target.x;p.z=target.z;v.idx=(v.idx+1)%4}else{
    const away=dist(me,p);const approaching=away<10&&(me.x-p.x)*dx+(me.z-p.z)*dz>0;
    const waiting=!this.inCar&&away<5.2;
    const rate=waiting||approaching&&(!this.inCar||Math.abs(this.speed)<2)?0:v.v*(this.livePos&&dist(p,this.livePos)<21?.55:1);
    p.x+=dx/n*rate*dt;p.z+=dz/n*rate*dt;v.m.rotation.y=Math.atan2(-dx,-dz);
    if(this.inCar&&away<2.48&&this.hitCooldown<=0&&Math.abs(this.speed)>4){this.impactSerial++;this.speed*=-.27;this.shake=1;this.hitCooldown=2.3;this.hits++;
     if(this.hits>=2&&!this.heat){this.heat=1;this.safe=0;this.patrol.position.set(me.x+Math.sin(me.a)*16,.08,me.z+Math.cos(me.a)*16);this.patrol.visible=true;this.notify('★ 警戒上升 · 拉开距离以解除警戒')}else if(!this.heat)this.notify('车辆擦碰 · 注意来车')}
   }v.m.visible=dist(me,p)<155;
  }
  for(const n of this.walkers){
   const greeting=n.p.userData.role&&!this.inCar&&Math.hypot(me.x-n.x,me.z-n.z)<2.8;
   if(!greeting){n.z=clamp(n.z+n.rate*n.dir*dt,n.min,n.max);if(n.z===n.max)n.dir=-1;else if(n.z===n.min)n.dir=1}
   const close=Math.hypot(me.x-n.x,me.z-n.z)<4.2&&this.inCar,offset=close?(n.x>=me.x?1:-1)*1.2:0;n.p.position.set(n.x+offset,.17,n.z);n.p.visible=dist(me,n.p.position)<78;
   if(n.p.visible){personDetail(n.p,dist(me,n.p.position)<14);n.p.rotation.y=greeting?Math.atan2(n.x-me.x,n.z-me.z):n.dir<0?0:Math.PI;stride(n.p,this.time*n.rate*4.7+n.x,greeting?.025:1)}
  }
  if(this.heat){
   const pp=this.patrol.position,dx=me.x-pp.x,dz=me.z-pp.z,dd=Math.hypot(dx,dz);
   const tx=dx/Math.max(1,dd)*dt*9,tz=dz/Math.max(1,dd)*dt*9;
   if(!this.blocked(pp.x+tx,pp.z+tz,.9,false)){pp.x+=tx;pp.z+=tz}else if(!this.blocked(pp.x+tx,pp.z,.9,false))pp.x+=tx;else if(!this.blocked(pp.x,pp.z+tz,.9,false))pp.z+=tz;
   this.patrol.rotation.y=Math.atan2(-dx,-dz);this.lightR.color.setHex(Math.sin(this.time*15)>0?0xff3154:0x672639);this.lightB.color.setHex(Math.sin(this.time*15)<0?0x649aff:0x25375b);
   this.safe=dd>26&&(!this.storyAlert||Math.hypot(me.x-48,me.z+120)>34)?this.safe+dt:0;const canDetain=!this.storyAlert||(this.time>=(this.boardingGrace||0)&&(!this.inCar||Math.abs(this.speed)<2.2));this.caught=dd<3.2&&canDetain?(this.caught||0)+dt:0;
   const leftVenue=this.storyAlert&&Math.hypot(me.x-68,me.z+114)>65;
   if(leftVenue||this.safe>6||this.caught>2.3){const caught=!leftVenue&&this.caught>2.3;if(caught&&this.storyAlert){this.custody++}else if(caught){const fee=Math.min(100,this.save.money);this.save.money-=fee;this.notify('警戒解除 · 交通罚款 $'+fee)}else this.notify('警戒解除 · 已脱离追踪');this.patrol.visible=false;this.heat=0;this.hits=0;this.caught=0}
  }
 }
 update(dt,keys,target){this.time+=dt;this.hitCooldown-=dt;this.shake=Math.max(0,this.shake-dt*2.7);
  if(this.inCar)this.driving(dt,keys);else this.walk(dt,keys);this.movingCity(dt);
  const m=this.station;m.group.visible=!!target&&target.type!=='race'&&target.type!=='chapter';if(target){m.ring.material.color.setHex(target.type==='cab'?0xffbc64:target.type==='pin'?0x77d6fc:0xff739c);m.group.position.set(target.x,0,target.z);m.tag.position.y=3.75+Math.sin(this.time*3)*.25;m.tag.rotation.y=this.camA;m.ring.scale.setScalar(1+Math.sin(this.time*2)*.045)}
  this.collectibles.forEach((o,i)=>{if(!o.visible)return;o.rotation.y=this.time*1.7;o.position.y=1.45+Math.sin(this.time*2+i)*.15;o.visible=!this.save.tapes.includes(i)});
  this.view(dt);this.world.update(this.time,this.camera)
 }
 photo(yaw,height,radius){const p=this.pos,angle=p.a+yaw;
  const dx=Math.sin(angle),dz=Math.cos(angle);let back=radius;
  for(let n=1;n<=radius;n+=.5){const x=p.x+dx*n,z=p.z+dz*n;if(this.world.colliders.some(b=>b.w>2&&Math.abs(b.x-x)<b.w&&Math.abs(b.z-z)<b.d)){back=Math.max(2,n-.5);break}}
  this.camera.position.set(p.x+dx*back,height,p.z+dz*back);this.camera.lookAt(p.x,this.inCar?.95:1.05,p.z);this.camera.fov=this.camera.aspect<.8?63:51;this.camera.updateProjectionMatrix();this.world.update(this.time,this.camera);this.render();
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
