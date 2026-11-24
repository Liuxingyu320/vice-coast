import {Group, PerspectiveCamera} from 'three';
import {rng} from '../src/data.js';
import {makeWalker} from '../src/models.js';
import {Simulation} from '../src/simulation.js';

const idleKeys=new Set();
const dt=1/40;

function fixture(yaw=0,range=2.2){
 const sim=Object.create(Simulation.prototype),pos={x:147,z:50,a:yaw};
 const p=makeWalker(63),x=pos.x-Math.sin(yaw)*range,z=pos.z-Math.cos(yaw)*range;
 p.position.set(x,.17,z);
 const n={p,x,z,ox:0,min:20,max:70,dir:1,rate:0,health:100,healthUntil:0,vehicleHitUntil:0,
  panic:0,flinch:0,lie:0,down:0,healthDisplay:{bar:new Group(),fill:new Group()}};
 Object.assign(sim,{pos,hero:makeWalker(70),camera:new PerspectiveCamera(),camA:yaw,footY:.14,vy:0,
  walkV:{x:0,z:0},jumpBuffer:0,coyote:0,combo:0,comboUntil:0,time:1,hitStop:0,shake:0,inCar:false,
  cars:[],traffic:[],walkers:[n],pedestrianMotionCount:0,world:{colliders:[]},storyAlert:true,r:rng(120)});
 sim.bodyOf=()=>({hw:1,hl:2});
 sim.vehicleCollisionWithPedestrian=speed=>{sim.pedestrianImpactSpeed=speed};
 return {sim,n};
}

function footFrames(sim,count){
 for(let i=0;i<count;i++){
  sim.time+=dt;sim.hitStop=Math.max(0,sim.hitStop-dt);
  sim.walk(dt,idleKeys);sim.stepWalkers(dt);
 }
}

function punch(sim){
 sim.attack();
 for(let i=0;i<32&&sim.punch;i++)footFrames(sim,1);
}

function runInto(sim,n,{speed=8,offset=0,travel=-8}={}){
 const car=sim.car??{rotation:{y:0},userData:{model:0}};
 sim.recordPedestrianVehicleMotion(car,n.x+n.ox+offset,n.z+4,0,travel,0,-speed);
 sim.stepWalkers(dt);
}

export function checkPedestrianCombat(check){
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const {sim,n}=fixture(yaw);
  sim.pos.a=yaw+Math.PI;
  punch(sim);
  check(n.health===75,'Punch misses its target in camera direction '+yaw);
 }

 let {sim,n}=fixture();
 sim.refreshWalkerHealthBars(true);
 check(n.healthDisplay.bar.visible,'Targeted walker does not display a health bar');
 sim.attack();footFrames(sim,13);
 check(n.health===75&&n.flinch>0&&n.p.rotation.x>0&&sim.hitStop>0,'First punch does not cause visible recoil and damage');
 sim.refreshWalkerHealthBars(true);
 check(Math.abs(n.healthDisplay.fill.scale.x-.525)<1e-6,'Walker health bar does not track damage');
 sim.refreshWalkerHealthBars(false);
 check(!n.healthDisplay.bar.visible,'Walker health bar stays visible outside gameplay');
 footFrames(sim,16);
 check(n.health===75,'One swing inflicts damage more than once');
 punch(sim);
 check(n.health===45,'Second punch does not continue the combo');
 punch(sim);
 check(n.health===0&&n.lie>0&&n.p.rotation.z>1,'Third punch does not knock down the defeated walker');
 const oldX=n.x,oldZ=n.z;
 sim.stepWalkers(10.1);
 check(n.health===100&&n.lie===0&&Math.hypot(n.x-oldX,n.z-oldZ)>8,'Defeated walker fails to respawn away from contact with full health');

 ({sim,n}=fixture(0,3));punch(sim);
 check(n.health===100,'Punch connects beyond its acquisition range');
 ({sim,n}=fixture(0,0));punch(sim);
 check(n.health===75,'Punch does not connect at point-blank range');
 ({sim,n}=fixture());sim.camA=Math.PI;punch(sim);
 check(n.health===100,'Punch hits a walker behind the player');
 ({sim,n}=fixture());sim.attack();
 sim.world.colliders=[{x:sim.pos.x,z:n.z+1,w:2,d:.06}];footFrames(sim,30);
 check(n.health===100,'Punch can travel through a wall that appears after target acquisition');

 ({sim,n}=fixture());runInto(sim,n,{speed:3});
 check(n.health===100,'Walking-speed vehicle contact inflicts damage');
 ({sim,n}=fixture());n.walkVelocity=-1.1;runInto(sim,n,{speed:16.5});
 check(n.health>0&&n.health<100,'Impact ignores the pedestrian velocity along the same direction');
 ({sim,n}=fixture());n.walkVelocity=1.1;runInto(sim,n,{speed:15.5});
 check(n.health===0,'Opposite walking direction does not add to the closing speed');
 ({sim,n}=fixture());runInto(sim,n,{speed:18,offset:1.349});
 check(n.health===100,'A shallow brush at high speed registers as a head-on hit');
 ({sim,n}=fixture());
 sim.world.colliders=[{x:n.x,z:n.z+.10,w:2,d:.03}];runInto(sim,n,{travel:-1.85});
 check(n.health===100,'Vehicle hits a walker across a thin obstacle');
 ({sim,n}=fixture());
 sim.car={rotation:{y:0},userData:{model:0}};sim.inCar=true;
 runInto(sim,n);
 check(n.health>0&&n.health<100&&n.flinch>0&&sim.pedestrianImpactSpeed===8,'Moderate vehicle impact misses damage or its player feedback');
 const health=n.health;
 runInto(sim,n);
 check(n.health===health,'An ongoing vehicle contact applies repeated damage');
 sim.pedestrianMotionCount=0;sim.time+=.5;
 sim.recordPedestrianVehicleMotion(sim.car,n.x+n.ox,n.z+1.9,0,-.4,0,-8);
 sim.stepWalkers(dt);
 check(n.health===health,'A sustained overlap after contact cooldown re-applies vehicle damage');
 sim.pedestrianMotionCount=0;runInto(sim,n);
 check(n.health<health,'A later separate vehicle contact fails to damage the walker');
 ({sim,n}=fixture());runInto(sim,n,{speed:20});
 check(n.health===0&&n.lie>0&&sim.pedestrianImpactSpeed==null,'A fast drive-over misses a lethal hit or blames the player for another car');
 ({sim,n}=fixture());
 const car={rotation:{y:0},userData:{model:0}};
 sim.recordPedestrianVehicleMotion(car,n.x,n.z,0,0,0,20);
 sim.recordPedestrianVehicleMotion(car,n.x,n.z,0,4,0,20);
 sim.stepWalkers(dt);
 check(n.health===100,'Stationary or departing vehicle damages an already overlapping walker');

 ({sim,n}=fixture());
 const ambientCar={position:{x:n.x,z:n.z+4},rotation:{y:0},userData:{model:0}};
 sim.vehicleScrapes=new Map();sim.vehicleContactTimes=new Map();
 sim.moveVehicleBodies([{mesh:ambientCar,vz:-20}],.4);
 sim.stepWalkers(dt);
 check(ambientCar.position.z<n.z&&n.health===0,'The vehicle solver fails to carry accepted motion into pedestrian damage');
}
