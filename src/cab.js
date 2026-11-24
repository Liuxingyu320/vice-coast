import * as T from 'three';
import {stops,guests,dist,farePay} from './data.js';
import {makeWalker,stride,canvasTexture} from './models.js';

export class CabShift {
 constructor(sim){
  this.sim=sim;this.save=sim.save;this.guest=makeWalker(72);sim.scene.add(this.guest);this.guest.visible=false;
  this.sign=new T.Group();const tex=canvasTexture(128,44,(c,w,h)=>{c.fillStyle='#ffc55a';c.fillRect(0,0,w,h);c.textAlign='center';c.textBaseline='middle';c.font='900 35px Arial';c.fillStyle='#1a1a26';c.fillText('TAXI',w/2,h/2)});
  const face=new T.MeshBasicMaterial({map:tex}),amber=new T.MeshBasicMaterial({color:0xffbd60});
  this.sign.add(new T.Mesh(new T.BoxGeometry(.92,.29,.42),[amber,amber,amber,amber,face,face]));this.sign.position.set(0,1.64,.05);
  this.hold=0;this.exit=null;this.impact=sim.impactSerial;
 }
 get target(){
  const f=this.save.cab;if(!f)return null;
  const pick=f.stage==='pickup',id=pick?f.from:f.to;
  if(this._target&&this._targetPick===pick&&this._targetId===id)return this._target;
  const p=stops[id];this._targetPick=pick;this._targetId=id;
  return this._target={...p,label:(pick?'接客 · ':'送达 · ')+p.name,type:'cab'};
 }
 reset(){this.hold=0;this.exit=null;this.sign.removeFromParent();this.guest.visible=false;this.impact=this.sim.impactSerial}
 update(dt,keys,onBoard){
  const sim=this.sim,f=this.save.cab;
  if(!f){this.sign.removeFromParent();if(this.exit){const e=this.exit;e.t=Math.min(1,e.t+dt*.48);this.walk(e.x,e.z,e.to.walkX,e.to.walkZ,e.t);if(e.t===1){this.exit=null;this.guest.visible=false}}return null}
  if(this.sign.parent!==sim.car)sim.car.add(this.sign);
  const p=this.target,pick=f.stage==='pickup',q=sim.pos;
  const stopped=sim.inCar&&Math.abs(sim.speed)<1.6&&dist(p,q)<7.4;
  this.hold=stopped?this.hold+dt:0;
  const doorX=q.x+Math.cos(q.a)*1.28,doorZ=q.z-Math.sin(q.a)*1.28;
  if(pick){this.walk(p.walkX,p.walkZ,doorX,doorZ,Math.min(1,this.hold/1.05));
   if(this.hold>=1.05){f.stage='ride';f.car=sim.carId;this.hold=0;this.guest.visible=false;this.impact=sim.impactSerial;onBoard(guests[f.guest].line)}
   return null;
  }
  this.guest.visible=false;f.seconds+=dt;
  if(sim.impactSerial!==this.impact){f.bumps++;f.comfort=Math.max(0,f.comfort-15);this.impact=sim.impactSerial;sim.notify('碰撞 · 乘客舒适度 −15',2)}
  if(Math.abs(sim.speed)>12&&Math.abs(sim.smoothSteer)>.78)f.comfort=Math.max(0,f.comfort-dt*3);
  if(this.hold<.7)return null;
  const pay=farePay(f);this.exit={x:doorX,z:doorZ,to:p,t:0};this.hold=0;this.save.cab=null;this.sign.removeFromParent();
  return {...pay,...f,guestName:guests[f.guest].name};
 }
 walk(x,z,tx,tz,t){const g=this.guest;g.visible=true;g.position.set(x+(tx-x)*t,.14,z+(tz-z)*t);g.rotation.y=Math.atan2(x-tx,z-tz);stride(g,this.sim.time*8,t>0&&t<1?.9:0)}
}
