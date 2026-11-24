import * as T from 'three';
import {canvasTexture} from './models.js';
import {makePerson,personDetail,animatePerson} from './people.js';
import {district,dist,tapes} from './data.js';

const $=id=>document.getElementById(id);
function onAirKit(car){
 const kit=new T.Group();car.add(kit);
 const flag=canvasTexture(320,96,(c,w,h)=>{c.fillStyle='#5b1933';c.fillRect(0,0,w,h);c.fillStyle='#ffb7c9';c.textAlign='center';c.font='bold 54px monospace';c.fillText('ON AIR',160,66)});
 const panel=new T.MeshBasicMaterial({map:flag});for(const side of [-1,1]){const sign=new T.Mesh(new T.PlaneGeometry(.98,.3),panel);sign.rotation.y=side*Math.PI/2;sign.position.set(side*1.01,1.81,.61);kit.add(sign)}
 const mast=new T.Mesh(new T.CylinderGeometry(.026,.04,1.88,8),new T.MeshStandardMaterial({color:0xd1c5a4,metalness:.47,roughness:.33}));mast.position.set(0,3.4,.89);kit.add(mast);
 const lamp=new T.Mesh(new T.SphereGeometry(.105,10,8),new T.MeshBasicMaterial({color:0x6dfff1}));lamp.position.set(0,4.37,.89);kit.add(lamp);
 const wash=canvasTexture(128,128,c=>{const g=c.createRadialGradient(64,64,1,64,64,63);g.addColorStop(0,'#ff438e99');g.addColorStop(.50,'#48ead46b');g.addColorStop(1,'#49d9cf00');c.fillStyle=g;c.fillRect(0,0,128,128)});
 const floor=new T.Mesh(new T.PlaneGeometry(6.4,6.4),new T.MeshBasicMaterial({map:wash,transparent:true,depthWrite:false,blending:T.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2}));floor.rotation.x=-Math.PI/2;floor.position.y=.045;kit.add(floor);kit.visible=false;return {kit,lamp};
}
const directions=[-.95,-.25,.45,1.05];
export class StreetRadio{
 constructor(sim,save,api){
  this.sim=sim;this.save=save;this.api=api;this.mode='off';this.crowd=[];this.dissolve=0;this.kit=null;
  $('airToggle').onclick=()=>this.toggle();$('airStart').onclick=()=>this.start();
  $('airDial').oninput=()=>{$('airDialValue').value=(Number($('airDial').value)/10).toFixed(1)};
 }
 get canUse(){return this.sim.inCar&&this.sim.car.userData.model===2&&Math.abs(this.sim.speed)<1&&!this.sim.heat&&this.api.free()}
 tracks(){
  const s=this.save.midnight,list=[['coast','海风序曲']];
  if(s.vinyl==='catalogued'||s.vinyl==='delivered')list.push(['sideb','Side B · 露兹的首版']);
  if(s.outcome)list.push(s.outcome==='live'?['live','退潮以后 · 玛拉现场']:['sponsor','午夜热线 · 雷蒙']);
  for(const i of this.save.tapes)list.push(['tape'+i,tapes[i].name]);
  return list;
 }
 toggle(){
  if(this.mode!=='off'){this.stop(true);return}
  if(!this.canUse)return;
  const list=$('airTrack');list.replaceChildren();
  for(const [value,name] of this.tracks())list.add(new Option(name,value));
  this.mode='setup';this.mistuned=false;$('airForm').hidden=false;$('airDial').value=979;$('airDialValue').value='97.9';$('airStart').disabled=false;this.hud();
 }
 start(){
  if(this.mode!=='setup'||!this.canUse)return;
  if(Number($('airDial').value)!==984){this.mistuned=true;this.hud();return}
  this.mode='locking';this.age=0;this.earned=0;this.nextTip=8;this.track=$('airTrack').value;this.zone=district(this.sim.pos.x,this.sim.pos.z);
  if(!this.kit)this.kit=onAirKit(this.sim.car);this.kit.kit.visible=true;$('airForm').hidden=true;$('airToggle').focus({preventScroll:true});this.hud();
 }
 arrive(){
  if(!this.crowd.length)for(let i=0;i<4;i++){const actor=makePerson('civilian',i+7);this.sim.scene.add(actor);this.crowd.push({actor})}
  const p=this.sim.pos;
  this.crowd.forEach((entry,i)=>{
   let angle=p.a+directions[i]+Math.PI;
   for(let j=0;j<12;j++){
    const x=p.x+6*Math.sin(angle),z=p.z+6*Math.cos(angle);
    if(!this.sim.blocked(x,z,.34,false)&&!this.sim.blocked(p.x+10*Math.sin(angle),p.z+10*Math.cos(angle),.34,false))break;
    angle+=Math.PI/6;
   }
   entry.angle=angle;entry.home={x:p.x+Math.sin(angle)*(10+i*.6),z:p.z+Math.cos(angle)*(10+i*.6)};
   entry.spot={x:p.x+Math.sin(angle)*(4+i*.22),z:p.z+Math.cos(angle)*(4+i*.22)};
   entry.actor.position.set(entry.home.x,.17,entry.home.z);entry.actor.visible=true;personDetail(entry.actor,true);
  });
 }
 audience(dt,leaving){
  for(const [i,{actor,home,spot}] of this.crowd.entries()){if(!actor.visible||!home)continue;const goal=leaving?home:spot,dx=goal.x-actor.position.x,dz=goal.z-actor.position.z,d=Math.hypot(dx,dz);
   const f=Math.min(1,dt*2.25/Math.max(d,.01));if(!this.sim.blocked(actor.position.x+dx*f,actor.position.z+dz*f,.22,false)){actor.position.x+=dx*f;actor.position.z+=dz*f}
   if(d>.3)actor.rotation.y=Math.atan2(-dx,-dz);else actor.rotation.y=Math.atan2(actor.position.x-this.sim.pos.x,actor.position.z-this.sim.pos.z);
   animatePerson(actor,this.sim.time*(d>.3?6:4)+i,d>.3?.73:.15);if(d<.35&&!leaving){actor.userData.arms[i%2].rotation.x=.69+.29*Math.sin(this.sim.time*3+i);actor.userData.head.rotation.x=.1*Math.sin(this.sim.time*4+i)}
   if(leaving&&(d<.38||this.dissolve<=0))actor.visible=false;
  }
 }
 stop(report){
  if(this.mode==='off')return;const wasLive=this.mode==='live';this.mode='off';this.sim.livePos=null;this.sim.airTrack=null;if(this.kit)this.kit.kit.visible=false;this.dissolve=5;
  if(report&&wasLive)this.api.toast(this.zone+'收线　·　本场听众打赏 $'+this.earned,4);this.hud();
 }
 hud(){
  const active=this.mode!=='off';$('airToggle').hidden=!active&&!this.canUse;$('airToggle').lastElementChild.textContent=active?'收天线':'街头开播';
  $('airBox').hidden=!active;if(!active)return;
  $('airLabel').textContent=this.mode==='live'?'● LIVE　/　'+this.zone:'BAY WAVE　/　流动转播';
  if(this.mode==='setup')$('airStatus').textContent=this.mistuned?'还有杂音。把指针对准 98.4 MHz。':'选一张唱片，把接收机调到 98.4 MHz。';
  if(this.mode==='locking')$('airStatus').textContent='天线正在锁频　'+Math.max(0,Math.ceil(5-this.age))+' s';
  if(this.mode==='live')$('airStatus').textContent='打赏 $'+this.earned+'　·　'+(this.age<20?'听众点歌中':this.age<34?'街坊正赶来围观':'本轮时段即将结束');
 }
 update(dt){
  if(!this.canUse&&this.mode!=='off')this.stop(true);
  if(this.mode==='off'){if(this.dissolve>0){this.dissolve-=dt;this.audience(dt,true)}return}
  if(this.mode==='setup')return;
  this.age+=dt;this.kit.lamp.scale.setScalar(.88+.25*Math.sin(this.age*Math.PI*3));
  if(this.mode==='locking'&&this.age>=5){
   this.mode='live';this.age=0;this.sim.livePos={...this.sim.pos};this.sim.airTrack=this.track;this.arrive();this.api.chime();this.api.toast('正在播出《'+$('airTrack').selectedOptions[0].textContent+'》',3);
  }
  if(this.mode==='live'){
   this.audience(dt,false);
   if(this.age>=this.nextTip){
    const tip=(this.zone==='湾岸通'?17:this.zone==='新桥商区'?21:14)+(this.nextTip>=24?8:0)+(this.track==='sideb'?5:0);
    this.nextTip+=8;this.earned+=tip;this.save.money+=tip;this.save.midnight.tips+=tip;
    if(this.nextTip===16)this.save.midnight.shows++;this.api.persist();this.api.chime();this.api.toast('听众打赏　＋$'+tip,2.3);
   }
   if(this.age>=42){this.stop(true);return}
  }
  this.hud();
 }
}
