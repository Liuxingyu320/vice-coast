import {assignMissions,avoidCut,blockGoal,broadsideHeading,mellowCruise,pursuitAxes,ramGoal,scoreSpawn,segmentHits,yieldSpeed} from '../src/pursuit.js';

const facing=(motionA,speed=0,pos={x:0,z:0})=>pursuitAxes({inCar:true,motionA,pos:{...pos,a:motionA},speed,walkV:{x:0,z:0}});
const north=facing(Math.PI,0,{x:0,z:80});
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
let checks=0;
const check=(name,cond)=>{checks++;if(!cond)throw new Error(name)};

const pos={x:0,z:80};
const block=blockGoal(pos,north),ram=ramGoal(pos,north);
check('stopped block is ahead',(block.z-pos.z)>4);
check('stopped ram is behind',(ram.z-pos.z)<-4);
check('roles take opposite lanes',Math.sign(block.x-pos.x)!==Math.sign(ram.x-pos.x));
check('goals stay apart',gap(block,ram)>10);
check('neither goal is the suspect',gap(block,pos)>5&&gap(ram,pos)>5);
check('both can still reach a stopped suspect',gap(block,pos)<8&&gap(ram,pos)<8);

const fast=facing(Math.PI,20,pos);
const cut=blockGoal(pos,fast);
check('fast intercept leads by the capped 3.6s',cut.z-pos.z>20&&cut.z-pos.z<26);
check('ram does not chase the intercept',ramGoal(pos,fast).z<pos.z);

for(const motion of [0,Math.PI/2,Math.PI,-Math.PI/2]){
 const axes=facing(motion,8,{x:0,z:0}),origin={x:0,z:0};
 const ahead=blockGoal(origin,axes),behind=ramGoal(origin,axes);
 const front=(ahead.x-origin.x)*axes.fx+(ahead.z-origin.z)*axes.fz;
 const back=(behind.x-origin.x)*axes.fx+(behind.z-origin.z)*axes.fz;
 check('block brackets from the front '+motion,front>4);
 check('ram brackets from the back '+motion,back<-4);
 check('lanes differ '+motion,gap(ahead,behind)>10);
}

const cops=[{x:0,z:60,mission:null},{x:0,z:100,mission:null}];
assignMissions(cops,pos,north);
check('rear cruiser rams',cops[0].mission==='ram'&&cops[1].mission==='block');
cops[0].z=90;
assignMissions(cops,pos,north);
check('ram role holds through a small shuffle',cops[0].mission==='ram');
cops[0].z=120;
assignMissions(cops,pos,north);
check('ram role swaps once the old rammer is ahead',cops[1].mission==='ram');
{
 const lone=[{x:0,z:0,mission:'ram'}];
 assignMissions(lone,pos,north);
 check('lone cruiser is the blocker',lone[0].mission==='block');
}

check('close cruise is the re3 ratio',Math.abs(mellowCruise(21,5,2,false)-21*27/34)<1e-6);
check('foot approach creeps',mellowCruise(17,10,1,true)<mellowCruise(17,10,1,false));

const spawnAxes=north;
const aheadCross={x:40,z:122,vertical:false},behindSame={x:0,z:40,vertical:true};
check('blocker spawns ahead on a cross street',scoreSpawn(aheadCross,{mission:'block',pos,axes:spawnAxes,partner:null})<scoreSpawn(behindSame,{mission:'block',pos,axes:spawnAxes,partner:null}));
check('rammer spawns behind',scoreSpawn(behindSame,{mission:'ram',pos,axes:spawnAxes,partner:null})<scoreSpawn(aheadCross,{mission:'ram',pos,axes:spawnAxes,partner:null}));

const from={x:0,z:60},goal=blockGoal(pos,north);
check('straight cut hits the suspect',segmentHits(from,goal,pos,3.6));
const side=avoidCut(from,goal,pos,north);
check('blocker changes lane before the suspect',Math.abs(side.x-goal.x)<.1&&side.z<pos.z);
check('the lane change itself misses the suspect',!segmentHits(side,goal,pos,3.6));

let tail={x:0,z:60},lead={x:0,z:62};
for(let i=0;i<80;i++){
 const a=blockGoal(pos,fast),b=ramGoal(pos,fast);
 tail=move(tail,b,.25,18);lead=move(lead,a,.25,18);
}
check('a shared start splits into a cordon',gap(tail,lead)>12);
check('lead car stays ahead of the tail',lead.z>tail.z);

const yielded=yieldSpeed(18,{x:0,z:0},{x:0,z:8,speed:12},{x:0,z:1});
check('the car behind gives way',yielded<12);
check('a car in the other lane does not brake for its partner',yieldSpeed(18,{x:0,z:0},{x:8,z:8,speed:12},{x:0,z:1})===18);

const across=broadsideHeading(north);
const nose={x:-Math.sin(across),z:-Math.cos(across)};
check('the roadblock sits across the avenue',Math.abs(nose.x)>.9&&Math.abs(nose.z)<.1);

function move(p,target,dt,speed){
 const dx=target.x-p.x,dz=target.z-p.z,n=Math.hypot(dx,dz)||1,step=Math.min(n,speed*dt);
 return {x:p.x+dx/n*step,z:p.z+dz/n*step};
}
console.log('PASS pursuit '+checks);
