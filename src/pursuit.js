// Pursuit roles from re3 (GTA III) CarAI / CarCtrl:
// FindPoliceCarMissionForWantedLevel, MellowOutChaseSpeed,
// SteerAICarWithPhysicsTryingToBlockTarget (intercept, then handbrake).
// Star 1 only blocks. Star 2 keeps one rammer in the opposite lane and sends the other ahead.
import {xs,zs,clamp} from './data.js';

export const copSwitchClose=30;
export const copSwitchFar=50;
const interceptCap=6.5;
const interceptTime=3.6;
const lane=4.2;
const nearest=(list,n)=>list.reduce((a,b)=>Math.abs(a-n)<=Math.abs(b-n)?a:b);

export function pursuitAxes({inCar,motionA,pos,speed,walkV}){
 const yaw=inCar?motionA:pos.a,reverse=inCar&&speed<0?-1:1;
 const fx=-Math.sin(yaw)*reverse,fz=-Math.cos(yaw)*reverse;
 const vx=inCar?-Math.sin(motionA)*speed:walkV.x,vz=inCar?-Math.cos(motionA)*speed:walkV.z;
 return {fx,fz,vx,vz,rx:fz,rz:-fx};
}
function leadVector(axes){
 const mag=Math.hypot(axes.vx,axes.vz);
 const fx=mag>.35?axes.vx/mag:axes.fx,fz=mag>.35?axes.vz/mag:axes.fz,n=Math.hypot(fx,fz)||1;
 const lead=Math.max(Math.min(mag,interceptCap)*interceptTime,6);
 return {x:fx/n*lead,z:fz/n*lead};
}
function roadFrame(pos,axes,lead){
 const vertical=Math.hypot(lead.x,lead.z)>1?Math.abs(lead.x)<=Math.abs(lead.z):Math.abs(axes.fx)<=Math.abs(axes.fz);
 const center=vertical?nearest(xs,pos.x):nearest(zs,pos.z);
 const onGrid=Math.abs((vertical?pos.x:pos.z)-center)<=12;
 const side=vertical?Math.sign(axes.rx)||1:Math.sign(axes.rz)||1;
 return {vertical,center,onGrid,side};
}
function place(pos,axes,lead,lateralSign){
 const road=roadFrame(pos,axes,lead),lateral=lateralSign*road.side*lane;
 let x=pos.x+lead.x,z=pos.z+lead.z;
 if(road.vertical)x=(road.onGrid?road.center:pos.x)+lateral;
 else z=(road.onGrid?road.center:pos.z)+lateral;
 return {x:clamp(x,-251,221),z:clamp(z,-251,251)};
}
function pick(candidates,blocked){
 for(const spot of candidates)if(!blocked?.(spot.x,spot.z))return spot;
 return candidates[0];
}
export function blockGoal(pos,axes,blocked){
 const lead=leadVector(axes);
 return pick([1,0,-1].map(sign=>place(pos,axes,lead,sign)),blocked);
}
export function ramGoal(pos,axes,blocked){
 const lead={x:-axes.fx*5.2,z:-axes.fz*5.2};
 return pick([-1,0,1].map(sign=>place(pos,axes,lead,sign)),blocked);
}
export function mellowCruise(top,gap,heat,onFoot){
 const cruise=heat>=2?34:25;
 let now=cruise;
 if(onFoot)now=gap<20?5:gap<40?(heat>=2?18:13):cruise;
 else if(heat<=1)now=gap<10?15:gap<20?22:25;
 else now=gap<10?27:gap<20?30:34;
 return top*now/cruise;
}
export function assignMissions(cops,pos,axes){
 if(cops.length<2){if(cops[0])cops[0].mission='block';return cops}
 const along=cop=>(cop.x-pos.x)*axes.fx+(cop.z-pos.z)*axes.fz;
 let rear=cops[0];
 for(const cop of cops)if(along(cop)<along(rear))rear=cop;
 const current=cops.find(cop=>cop.mission==='ram');
 const ram=current&&along(current)-along(rear)<12?current:rear;
 for(const cop of cops)cop.mission=cop===ram?'ram':'block';
 return cops;
}
export function broadsideHeading(axes){
 const vertical=Math.abs(axes.fx)<=Math.abs(axes.fz);
 const faceX=vertical?Math.sign(axes.rx)||1:0,faceZ=vertical?0:Math.sign(axes.rz)||1;
 return Math.atan2(-faceX,-faceZ);
}
export function segmentHits(a,b,p,radius){
 const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
 if(len2<1e-4)return Math.hypot(p.x-a.x,p.z-a.z)<radius;
 const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/len2,0,1);
 return Math.hypot(p.x-(a.x+dx*t),p.z-(a.z+dz*t))<radius;
}
export const copPassRadius=3.6;
export function avoidCut(from,goal,pos,axes){
 if(!segmentHits(from,goal,pos,copPassRadius))return goal;
 const dx=goal.x-from.x,dz=goal.z-from.z,along=dx*axes.fx+dz*axes.fz;
 const lx=dx-axes.fx*along,lz=dz-axes.fz*along,lat=Math.hypot(lx,lz);
 if(lat>1.1&&lat<14)return {x:from.x+lx,z:from.z+lz};
 return goal;
}
export function shiftOffPartner(from,goal,other){
 if(!other)return goal;
 const ox=other.x-from.x,oz=other.z-from.z,tx=goal.x-from.x,tz=goal.z-from.z;
 const tn=Math.hypot(tx,tz),dist=Math.hypot(ox,oz);
 if(tn<.001||dist>9||dist<.001)return goal;
 const along=(ox*tx+oz*tz)/tn,lateral=Math.abs(ox*tz-oz*tx)/tn;
 if(along<-1||along>tn+3||lateral>4.5)return goal;
 const cross=tx*oz-tz*ox,nx=-tz/tn,nz=tx/tn,sign=cross>=0?-1:1,shift=clamp(7.5-dist,2,5);
 return {x:goal.x+nx*sign*shift,z:goal.z+nz*sign*shift};
}
export function yieldSpeed(speed,self,other,forward){
 if(!other)return speed;
 const ox=other.x-self.x,oz=other.z-self.z;
 const along=ox*forward.x+oz*forward.z,lateral=Math.abs(ox*forward.z-oz*forward.x);
 if(along>1.5&&along<14&&lateral<3.4)return Math.min(speed,Math.max(0,(other.speed||0)-1));
 return speed;
}
export function scoreSpawn(spot,{mission,pos,axes,partner}){
 const ahead=(spot.x-pos.x)*axes.fx+(spot.z-pos.z)*axes.fz;
 const cross=spot.vertical?Math.abs(axes.fx)>Math.abs(axes.fz):Math.abs(axes.fz)>Math.abs(axes.fx);
 let score=0;
 if(mission==='block'){
  if(ahead<18)score+=120;
  score+=Math.abs(ahead-42)*.35;
  if(!cross)score+=28;
 }else{
  if(ahead>-18)score+=120;
  score+=Math.abs(ahead+38)*.35;
  if(cross)score+=16;
 }
 if(partner){
  const gap=Math.hypot(spot.x-partner.x,spot.z-partner.z);
  if(gap<16)score+=250;else score-=Math.min(gap,80)*.15;
 }
 return score;
}
