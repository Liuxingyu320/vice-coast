// reVC CarCtrl uses the target's velocity for interception and its body for
// close pursuit. The two-cruiser dispatch here gives those jobs to separate cars.
import {clamp} from './data.js';

export const copSwitchClose=30;
export const copSwitchFar=50;
export const maneuverSpeed=2.2;

export function pursuitAxes({inCar,motionA,pos,speed,walkV}){
 const moving=inCar&&Math.abs(speed)>=maneuverSpeed;
 const yaw=moving?motionA:pos.a,reverse=moving&&speed<0?-1:1;
 const fx=-Math.sin(yaw)*reverse,fz=-Math.cos(yaw)*reverse;
 const vx=inCar?-Math.sin(motionA)*speed:walkV.x,vz=inCar?-Math.cos(motionA)*speed:walkV.z;
 return {fx,fz,vx,vz,rx:fz,rz:-fx,speed:Math.hypot(vx,vz)};
}

export function relativePosition(target,axes,car){
 const dx=car.x-target.x,dz=car.z-target.z;
 return {ahead:dx*axes.fx+dz*axes.fz,side:dx*axes.rx+dz*axes.rz};
}

export function offsetFrom(target,axes,ahead,side=0){
 return {x:target.x+axes.fx*ahead+axes.rx*side,z:target.z+axes.fz*ahead+axes.rz*side};
}

function extentAlong(box,x,z){
 const c=Math.cos(box.a),s=Math.sin(box.a);
 return box.hw*Math.abs(x*c-z*s)+box.hl*Math.abs(x*s+z*c);
}

export function interceptManeuver(target,axes,car,passSide,clear){
 const {ahead,side}=relativePosition(target,axes,car);
 const nose=extentAlong(target,axes.fx,axes.fz),frontClear=nose+Math.max(car.hl,car.hw)+.6;
 const flank=extentAlong(target,axes.rx,axes.rz)+car.hw+1;
 const lead=clamp(axes.speed*.74,frontClear+1,27);
 const cut=offsetFrom(target,axes,lead);
 if(ahead>=frontClear&&clear(cut))return {goal:cut,passSide:0};
 // Establish lateral clearance first so the overtake does not drive into the rear bumper.
 const preferred=passSide||(Math.abs(side)>.25?Math.sign(side):1);
 for(const direction of [preferred,-preferred]){
  const alongside=Math.abs(side-direction*flank)<.65;
  const up=alongside?Math.max(frontClear+1,axes.speed*.42+frontClear):Math.min(lead,ahead+clamp(-ahead*.25,2,5));
  const move=offsetFrom(target,axes,up,direction*flank);
  if(clear(move))return {goal:move,passSide:direction};
 }
 return {goal:offsetFrom(target,axes,-frontClear),passSide:0};
}

export function pressureGoal(target,axes,car,sideHint,clear){
 const {ahead,side}=relativePosition(target,axes,car);
 const width=extentAlong(target,axes.rx,axes.rz)+car.hw;
 const rear=extentAlong(target,axes.fx,axes.fz)*.65;
 const lead=Math.min(axes.speed*.22,5);
 const preferred=sideHint||(Math.abs(side)>.25?Math.sign(side):1);
 for(const direction of [preferred,-preferred]){
  const alongside=ahead>-target.hl-3&&Math.abs(side-direction*width)<1.7;
  const goal=offsetFrom(target,axes,lead-rear,direction*(width+(alongside?-.45:.35)));
  if(clear(goal))return goal;
 }
 return offsetFrom(target,axes,lead);
}

export function stoppedGoal(pos,axes,car,onFoot,mission){
 if(!onFoot){
  const distance=pos.hl+car.hl+.7;
  return offsetFrom(pos,axes,mission==='ram'?-distance:distance);
 }
 const dx=car.x-pos.x,dz=car.z-pos.z,gap=Math.hypot(dx,dz)||1;
 return {x:pos.x+dx/gap*4.8,z:pos.z+dz/gap*4.8};
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
 const score=cop=>{
  const {ahead,side}=relativePosition(pos,axes,cop);
  return Math.abs(side)*.8+Math.max(0,10-ahead)*1.4+Math.max(0,ahead-35)*.5;
 };
 const [a,b]=cops,current=cops.find(cop=>cop.mission==='block');
 const best=score(a)<=score(b)?a:b;
 const blocker=current&&(current.holding||score(current)<=score(best)+8)?current:best;
 for(const cop of cops)cop.mission=cop===blocker?'block':'ram';
 return cops;
}
export function broadsideHeading(axes,yaw){
 const sign=-Math.sin(yaw)*axes.rx-Math.cos(yaw)*axes.rz>=0?1:-1;
 return Math.atan2(-axes.rx*sign,-axes.rz*sign);
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
// Sight from gta-reversed CPed::OurPedCanSeeThisEntity (0x5E1660).
// Before the first spot the suspect must be in front and inside 40.
// After that, only a clear line counts. Decay from re3 CWanted::Update:
// one chaos per second, and only while no cop is inside 18.
export const presenceRadius=18;
const sightRange=40;
export function chaosForStar(star){return star>=2?220:60}
export function starsFromChaos(chaos){return chaos<40?0:chaos<200?1:2}
export function tickChaos(chaos,star,copNearby){
 if(copNearby)return chaos;
 const next=chaos-1;
 if(star>=2&&next<200)return 60;
 return next;
}
export function copSees(cop,player,spotted,lineClear){
 if(!lineClear)return false;
 if(spotted)return true;
 const dx=player.x-cop.x,dz=player.z-cop.z;
 if(dx*dx+dz*dz>=sightRange*sightRange)return false;
 const fx=-Math.sin(cop.yaw),fz=-Math.cos(cop.yaw);
 return dx*fx+dz*fz>=0;
}
