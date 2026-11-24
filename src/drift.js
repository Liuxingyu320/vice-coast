import {clamp} from './data.js';

export class DriftChain{
 constructor(){this.reset()}
 reset(){this.score=0;this.multiplier=1;this.idle=0;this.direction=0;this.sinceTurn=0;this.impact=-1}
 update(dt,sim,keys){
  const angle=Math.atan2(Math.sin(sim.pos.a-sim.motionA),Math.cos(sim.pos.a-sim.motionA));
  if(!sim.inCar||this.score>0&&sim.impactSerial!==this.impact){const lost=this.score>=20;this.reset();return lost?{lost:true}:null}
  const sliding=sim.speed>7&&Math.abs(angle)>.32;
  if(sliding){
   const dir=Math.sign(angle);
   if(!this.score)this.impact=sim.impactSerial;
   if(this.direction&&this.direction!==dir&&this.sinceTurn>.40){this.multiplier=clamp(this.multiplier+.5,1,3);this.sinceTurn=0}
   this.direction=dir;this.sinceTurn+=dt;this.idle=0;
   this.score+=sim.speed*Math.min(1.1,Math.abs(angle))*dt*15*this.multiplier;return null
  }
  if(this.score<=0)return null;
  this.idle+=dt;if(this.idle<2.25)return null;
  const points=Math.floor(this.score);this.reset();return points>=28?{points,pay:Math.min(260,Math.ceil(points*.20))}:null;
 }
}
