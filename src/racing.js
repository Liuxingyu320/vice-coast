import * as T from 'three';
import {clamp,dist} from './data.js';
import {canvasTexture} from './models.js';

const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
const rivals=[{name:'NOVA',color:0x32d7cd,lane:-3.6,pace:1.035},{name:'SOL',color:0xffb655,lane:1.7,pace:.95},{name:'ECHO',color:0xac83ef,lane:-1.2,pace:.89}];
export function layoutCircuit(spec){
 const raw=spec.points.map(([x,z])=>({x,z})),samples=[{...raw[0],s:0}],markers=[];
 const push=p=>{const prev=samples.at(-1),n=dist(p,prev);if(n>.001)samples.push({...p,s:prev.s+n})};
 for(let i=1;i<raw.length;i++){
  const a=raw[i-1],b=raw[i],c=raw[(i+1)%raw.length],radius=8.5;
  const entry=mix(b,a,radius/dist(b,a)),exit=mix(b,c,radius/dist(b,c));push(entry);
  for(let j=1;j<=8;j++){const f=j/8;push(mix(mix(entry,b,f),mix(b,exit,f),f))}
  markers.push(samples.at(-1).s);
 }
 push(raw[0]);const length=samples.at(-1).s;
 function at(distance,lane=0){
  const s=((distance%length)+length)%length;let lo=0,hi=samples.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(samples[mid].s<=s)lo=mid;else hi=mid}
  const a=samples[lo],b=samples[hi],n=b.s-a.s,dx=(b.x-a.x)/n,dz=(b.z-a.z)/n,p=mix(a,b,(s-a.s)/n);
  return {x:p.x-dz*lane,z:p.z+dx*lane,a:Math.atan2(-dx,-dz),dx,dz};
 }
 const distances=[];let last=0;for(const s of [...markers,length]){const chunks=Math.ceil((s-last)/87);
  for(let j=1;j<=chunks;j++)distances.push(last+(s-last)*j/chunks);last=s}
 const gates=distances.map((s,i)=>({...at(s),s,label:i===distances.length-1?'冲过终点线':'穿过下一道旗门',type:'race'}));
 return {samples,gates,at,length};
}
function mesh(parent,geo,mat,x,y,z){const o=new T.Mesh(geo,mat);o.position.set(x,y,z);parent.add(o);return o}
function nameplate(text,color){const map=canvasTexture(192,52,(c,w,h)=>{c.fillStyle='#121b2a';c.fillRect(0,0,w,h);c.fillStyle=color;c.fillRect(0,h-5,w,5);c.fillStyle='#fff4e0';c.textAlign='center';c.textBaseline='middle';c.font='bold italic 36px Arial';c.fillText(text,w/2,h*.49)});
 return new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthWrite:false}));}
export class StreetRace{
 constructor(scene,makeRival){
  this.root=new T.Group();scene.add(this.root);this.root.visible=false;this.active=false;
  this.cars=rivals.map((r,i)=>{const car=makeRival(r.color,i%2);this.root.add(car);
   const badge=nameplate(r.name,'#'+r.color.toString(16).padStart(6,'0'));badge.scale.set(1.75,.47,1);badge.position.y=2.45;car.add(badge);
   const trail=new T.Group(),mat=new T.MeshBasicMaterial({color:0x82f8e3,transparent:true,opacity:.54,depthWrite:false});for(const side of [-1,1]){const line=mesh(trail,new T.BoxGeometry(.055,.035,4.2),mat,side*1.03,.42,4.2);line.rotation.y=side*.055}car.add(trail);trail.visible=false;
   return {car,trail,...r,s:0,v:0,finished:0,contact:0}});
  this.gate=new T.Group();this.root.add(this.gate);const mint=new T.MeshBasicMaterial({color:0x66efd7}),white=new T.MeshBasicMaterial({color:0xffebbc});
  for(const x of [-8.8,8.8]){mesh(this.gate,new T.BoxGeometry(.3,3.7,.35),mint,x,1.9,0);mesh(this.gate,new T.BoxGeometry(.7,.38,.72),white,x,.25,0)}
  const tex=canvasTexture(256,32,(c,w,h)=>{for(let x=0;x<16;x++)for(let y=0;y<2;y++){c.fillStyle=(x+y)%2?'#212438':'#fff0cf';c.fillRect(x*16,y*16,16,16)}});
  const flagMat=new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});
  const stripe=mesh(this.gate,new T.PlaneGeometry(17.6,1.1),flagMat,0,.105,0);stripe.rotation.x=-Math.PI/2;
  this.turnHints=[];this.turnGeo=new T.PlaneGeometry(2.9,1.45);this.turnMats=[1,-1].map(dir=>new T.MeshBasicMaterial({side:T.DoubleSide,map:canvasTexture(160,80,(c,w,h)=>{c.fillStyle="#30282a";c.fillRect(0,0,w,h);c.fillStyle="#ffbd54";for(let i=0;i<2;i++){c.save();c.translate(43+76*i,40);c.scale(dir,1);c.beginPath();c.moveTo(-26,-27);c.lineTo(2,-27);c.lineTo(29,0);c.lineTo(2,27);c.lineTo(-26,27);c.lineTo(0,0);c.fill();c.restore()}})}));
  this.header=mesh(this.gate,new T.PlaneGeometry(17.6,.43),flagMat,0,3.65,0);
  this.board=nameplate('FINISH','#ff976c');this.board.position.y=4.45;this.board.scale.set(3,.82,1);this.gate.add(this.board);
 }
 start(spec,sim){
  this.spec=spec;this.track=layoutCircuit(spec);this.active=true;this.root.visible=true;
  this.passed=0;this.time=0;this.countdown=3;this.rank=4;this.draft=false;this.previous=null;
  const start=this.track.at(-3,3.7);sim.gridStart(start);
  this.cars.forEach((r,i)=>{r.s=[7,4,.5][i];r.v=0;r.finished=0;r.contact=0;r.trail.visible=false;this.place(r)});
  for(const obj of this.turnHints)obj.removeFromParent();this.turnHints=[];
  for(let i=1;i<spec.points.length;i++){const [x,z]=spec.points[i],[px,pz]=spec.points[i-1],[nx,nz]=spec.points[(i+1)%spec.points.length];const len=Math.hypot(x-px,z-pz),dx=(x-px)/len,dz=(z-pz)/len;
   const dir=dx*(nz-z)-dz*(nx-x)>0?1:-1;for(const advance of [38,17]){const side=dir*8.7;const sign=mesh(this.root,this.turnGeo,this.turnMats[dir>0?0:1],x-dx*advance-dz*side,2.1,z-dz*advance+dx*side);sign.rotation.y=Math.atan2(-dx,-dz);this.turnHints.push(sign)}}
  this.updateGate();
 }
 place(r){const p=this.track.at(r.s,r.lane);r.car.position.set(p.x,.08,p.z);r.car.rotation.y=p.a}
 get target(){return this.track.gates[this.passed%this.track.gates.length]}
 get lap(){return Math.min(this.spec.laps,1+Math.floor(this.passed/this.track.gates.length))}
 updateGate(){const g=this.target;this.gate.position.set(g.x,0,g.z);this.gate.rotation.y=g.a;this.board.visible=this.passed%this.track.gates.length===this.track.gates.length-1;this.header.visible=this.board.visible}
 progress(pos){
  const {gates,length,at}=this.track,k=this.passed%gates.length,end=gates[k].s,start=k?gates[k-1].s:0;
  const p=at(start),q=at(end),dx=q.x-p.x,dz=q.z-p.z;const t=clamp(((pos.x-p.x)*dx+(pos.z-p.z)*dz)/(dx*dx+dz*dz||1),0,.9999);
  return Math.floor(this.passed/gates.length)*length+start+(end-start)*t;
 }
 resolveContact(r,sim,dt,rivalSpeed){
  r.contact=Math.max(0,r.contact-dt);
  const hit=sim.boxPush(sim.meshBox(r.car),sim.playerBox());
  if(!hit)return;
  const p=sim.pos,offset=hit.overlap+.01;
  const x=p.x+hit.nx*offset,z=p.z+hit.nz*offset;
  if(!sim.carBlocked(x,z,p.a,0,0)){p.x=x;p.z=z;sim.syncCar()}
  const rivalA=r.car.rotation.y;
  const vx=Math.sin(rivalA)*rivalSpeed-Math.sin(sim.motionA)*sim.speed;
  const vz=Math.cos(rivalA)*rivalSpeed-Math.cos(sim.motionA)*sim.speed;
  if(r.contact===0&&vx*hit.nx+vz*hit.nz< -4){sim.speed*=.82;sim.shake=Math.max(sim.shake,.5);r.contact=.85}
 }
 update(dt,sim){
  if(this.countdown>0){this.countdown=Math.max(0,this.countdown-dt);return null}
  this.time+=dt;const max=this.track.length*this.spec.laps;this.draft=false;
  for(const r of this.cars){
   const before=r.s;
   if(!r.finished){const here=this.track.at(r.s),ahead=this.track.at(r.s+9),bend=1-Math.abs(here.dx*ahead.dx+here.dz*ahead.dz);
    const target=this.spec.pace*r.pace*(1-.43*bend)*(1+.022*Math.sin(r.s*.043+r.lane));r.v+=clamp(target-r.v,-12*dt,6*dt);
    r.s+=r.v*dt;if(r.s>=max)r.finished=this.time-(r.s-max)/Math.max(1,r.v);this.place(r);
   }else if(r.s<max+14){r.s+=dt*4;this.place(r)}
   this.resolveContact(r,sim,dt,dt>0?(r.s-before)/dt:0);
   const dx=r.car.position.x-sim.pos.x,dz=r.car.position.z-sim.pos.z,forward=-Math.sin(sim.pos.a)*dx-Math.cos(sim.pos.a)*dz,lateral=Math.abs(Math.cos(sim.pos.a)*dx-Math.sin(sim.pos.a)*dz);
   r.trail.visible=forward>3.2&&forward<16&&lateral<2.7&&sim.speed>8&&Math.cos(sim.pos.a-r.car.rotation.y)>.75;if(r.trail.visible)this.draft=true;
  }
  if(this.draft)sim.boost=Math.min(1,sim.boost+dt*.16);
  const progress=this.progress(sim.pos);
  this.rank=1+this.cars.filter(r=>r.s>progress).length;
  const g=this.target,p=sim.pos,dx=p.x-g.x,dz=p.z-g.z,along=dx*g.dx+dz*g.dz,across=Math.abs(dx*g.dz-dz*g.dx);
  const before=this.previous?((this.previous.x-g.x)*g.dx+(this.previous.z-g.z)*g.dz):-1;
  const advancing=this.previous&&(p.x-this.previous.x)*g.dx+(p.z-this.previous.z)*g.dz>.00001;this.previous={x:p.x,z:p.z};
  if(!advancing||across>10||along<-.7||along>4.8||before>3.8||sim.speed<.2)return null;
  this.passed++;if(this.passed===this.track.gates.length*this.spec.laps){
   const rank=1+this.cars.filter(r=>r.finished&&r.finished<=this.time).length;
   return {rank,time:this.time,pay:Math.round(this.spec.prize*[1,.74,.53,.36][rank-1]),id:this.spec.id,name:this.spec.name}
  }
  this.updateGate();return null;
 }
 stop(){this.active=false;this.root.visible=false;this.draft=false}
}
