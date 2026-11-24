import {Simulation} from '../src/simulation.js';

function fixture(colliders=[]){
 const sim=Object.create(Simulation.prototype);
 const position={x:0,z:0,set(x,y,z){Object.assign(this,{x,y,z})}};
 const car={position,rotation:{y:0},userData:{model:0,shell:{rotation:{}},wheels:[]}};
 Object.assign(sim,{world:{colliders},car,cars:[car],traffic:[],carId:0,pos:{x:0,z:0,a:0},inCar:true,
  speed:18,boost:1,smoothSteer:1,motionA:0,time:1,shake:0,impactSerial:0,save:{mods:{engine:0,brakes:0,nitro:0}}});
 sim.bodyOf=()=>({hw:1,hl:2});
 return sim;
}

export function checkVehicleCollision(check){
 let sim=fixture([{x:7,z:1,w:.15,d:.15}]);
 check(!sim.carBlocked(8,8,0,8,8),'Diagonal sweep hits a prop beside its path');

 sim=fixture([{x:5,z:0,w:.05,d:15}]);
 const hit=sim.driveMove(12,-6);
 check(hit?.nx===-1&&Math.abs(sim.pos.x-3.95)<.002,'Sweep tunnels through a thin wall');
 check(Math.abs(sim.pos.z+6)<.002&&!sim.boxBlocked(sim.playerBox()),'Car sticks or penetrates while sliding along the wall');

 sim=fixture([{x:1.1,z:0,w:.2,d:5}]);
 check(sim.boxBlocked(sim.playerBox())&&!sim.driveMove(-.5,0)&&!sim.boxBlocked(sim.playerBox()),'A saved car cannot back out of scenery overlap');

 sim=fixture();
 const parked=fixture().car;parked.position.x=5;
 sim.traffic.push({m:parked,parked:true});
 check(sim.carBlocked(12,0,0,12,0),'Sweep passes through a parked car');
 check(sim.boxBlocked(sim.playerBox(224.5,0,0)),'Vehicle footprint escapes the world boundary');
 sim.pos.x=224.5;
 check(!sim.driveMove(0,-.5)&&sim.pos.z===-.5&&!sim.boxBlocked(sim.playerBox()),'An older save stays stuck sideways beyond the world boundary');

 sim=fixture([{x:1.25,z:0,w:.2,d:8}]);
 sim.driving(.025,new Set(['KeyA']));
 check(sim.pos.a===0&&sim.pos.z<0&&!sim.boxBlocked(sim.playerBox()),'Steering beside a wall leaves the car embedded');
 sim.world.colliders=[];
 sim.driving(.025,new Set(['KeyA']));
 check(sim.pos.a>0,'A blocked turn leaves steering stuck');

 sim=fixture([{x:0,z:-2.3,w:6,d:.05}]);
 sim.driving(.025,new Set());
 check(sim.speed<0&&sim.impactSerial===1&&sim.shake>0,'Hard contact misses its rebound or impact feedback');

 sim=fixture([{x:0,z:0,w:1,d:1}]);
 sim.driving(0,new Set());
 check(sim.speed===18&&sim.impactSerial===0,'Updating an overlapping save at zero elapsed time corrupts vehicle state');
 check(!sim.blocked(1.25,1.25,.32,false)&&sim.blocked(1.2,1.2,.32,false),'Walking collision uses a square at scenery corners');
 sim.world.colliders=[];sim.inCar=false;
 check(sim.blocked(0,1.9,.32)&&!sim.blocked(1.6,0,.32),'Walking collision ignores the last driven car footprint');

 sim=fixture();
 sim.notify=sim.stepWalkers=sim.separateTraffic=sim.pursue=()=>{};
 sim.hitCooldown=0;sim.hits=0;sim.heat=0;sim.speed=12;
 const traffic=fixture().car;
 traffic.position.z=-3.5;
 sim.traffic.push({m:traffic,pts:[{x:0,z:-20},{x:10,z:-20}],idx:0,v:12});
 sim.movingCity(.025);
 check(sim.impactSerial===0,'A matched-speed traffic contact reports a crash');
 sim.movingCity(0);
 check(sim.impactSerial===0,'A zero-time update reports a traffic crash');
 sim.traffic[0].pts[0].z=-3.92;
 sim.movingCity(.025);
 check(sim.impactSerial===1,'Closing traffic contact at a route corner misses the impact');

 const slipOf=car=>Math.abs(Math.atan2(Math.sin(car.pos.a-car.motionA),Math.cos(car.pos.a-car.motionA)));
 sim=fixture();
 sim.world.colliders=[];sim.speed=1.5;sim.smoothSteer=0;
 for(let i=0;i<10;i++)sim.driving(.025,new Set(['KeyA']));
 check(sim.pos.a>.02,'Low speed steering does not turn the car');
 sim=fixture();
 sim.world.colliders=[];sim.speed=0;sim.smoothSteer=0;
 for(let i=0;i<12;i++)sim.driving(.025,new Set(['KeyA']));
 check(sim.pos.a>.02,'A stopped car cannot steer into a parking space');

 const loose=fixture(),held=fixture();
 loose.world.colliders=[];held.world.colliders=[];
 for(let i=0;i<24;i++){loose.driving(.025,new Set(['KeyA']));held.driving(.025,new Set(['KeyA','Space']))}
 check(slipOf(held)>slipOf(loose)&&slipOf(loose)<.30,'Handbrake does not increase the slip angle');
}
