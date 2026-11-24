import {Group} from 'three';
import {Simulation} from '../src/simulation.js';
import {StreetRace,layoutCircuit} from '../src/racing.js';
import {circuits} from '../src/data.js';

function fixture(colliders=[]){
 const sim=Object.create(Simulation.prototype);
 const position={x:0,z:0,set(x,y,z){Object.assign(this,{x,y,z})}};
 const car={visible:true,position,rotation:{y:0},userData:{model:0,shell:{rotation:{}},wheels:[]}};
 Object.assign(sim,{world:{colliders},car,cars:[car],traffic:[],carId:0,pos:{x:0,z:0,a:0},inCar:true,
  speed:18,boost:1,smoothSteer:1,motionA:0,time:1,shake:0,impactSerial:0,impactStrength:0,heat:0,hits:0,hitCooldown:0,
  vehicleImpacts:[],vehicleScrapes:new Map(),vehicleContactTimes:new Map(),save:{mods:{engine:0,brakes:0,nitro:0}}});
 sim.bodyOf=()=>({hw:1,hl:2});
 sim.notify=sim.stepWalkers=sim.pursue=()=>{};
 return sim;
}

const noKeys=new Set();
function step(sim,dt=.025,keys=noKeys){sim.time+=dt;sim.movingCity(dt,keys)}
function sweep(sim,vx,vz,dt,other=[]){
 sim.moveVehicleBodies([{mesh:sim.car,vx,vz,player:true},...other],dt);
}
function overlaps(sim,mesh){return sim.boxPush(sim.playerBox(),sim.meshBox(mesh))}

export function checkVehicleCollision(check){
 let sim=fixture([{x:7,z:1,w:.15,d:.15}]);
 check(!sim.carBlocked(8,8,0,8,8),'Diagonal sweep hits a prop beside its path');

 sim=fixture([{x:5,z:0,w:.05,d:15}]);
 sweep(sim,14,-24,.34);
 check(sim.pos.x<3.95&&sim.pos.x>3.35&&!sim.boxBlocked(sim.playerBox()),'Glancing sweep crosses a thin wall or rebounds too far');
 check(sim.pos.z<-7.2&&sim.impactSerial===1,'Glancing sweep loses tangent travel or hard-contact feedback');
 check(sim.vehicleImpacts[0]?.kind==='scenery'&&sim.vehicleImpacts[0]?.strength>.5,'Scenery impulse lacks positional impact feedback');

 sim=fixture([{x:1.1,z:0,w:.2,d:5}]);
 check(sim.boxBlocked(sim.playerBox()),'Saved car fixture is not embedded');
 sweep(sim,-20,0,.025);
 check(sim.pos.x<-.49&&!sim.boxBlocked(sim.playerBox())&&sim.impactSerial===0,'A saved car cannot back out of scenery overlap');

 sim=fixture([{x:1.1,z:0,w:.2,d:8}]);
 sim.pos.a=Math.PI;sim.motionA=Math.PI;sim.speed=18;sim.smoothSteer=0;
 check(sim.boxBlocked(sim.playerBox()),'Tangential overlap fixture is not embedded');
 step(sim);
 check(sim.impactSerial===0&&sim.speed>1&&sim.pos.z>.2&&Math.abs(sim.pos.x)<.05,'Overlapping tangential slide sticks or counts as a frontal hit');
 sim=fixture([{x:1.1,z:0,w:.2,d:8}]);
 sim.pos.a=-Math.PI/2;sim.motionA=-Math.PI/2;sim.speed=18;sim.smoothSteer=0;
 step(sim);
 check(sim.speed<=0&&sim.pos.x<=0,'Driving deeper into an overlap does not stop');

 sim=fixture();
 const parked=fixture().car;parked.position.x=5;
 sim.traffic.push({m:parked,parked:true});
 check(sim.carBlocked(12,0,0,12,0),'Sweep passes through a parked car');
 check(sim.boxBlocked(sim.playerBox(224.5,0,0)),'Vehicle footprint escapes the world boundary');
 sim.pos.x=224.5;
 sweep(sim,0,-20,.025);
 check(Math.abs(sim.pos.z+.5)<.001&&!sim.boxBlocked(sim.playerBox()),'An older save stays stuck sideways beyond the world boundary');

 sim=fixture([{x:1.25,z:0,w:.2,d:8}]);
 step(sim,.025,new Set(['KeyA']));
 check(sim.pos.a===0&&sim.pos.z<0&&!sim.boxBlocked(sim.playerBox()),'Steering beside a wall leaves the car embedded');
 sim.world.colliders=[];
 step(sim,.025,new Set(['KeyA']));
 check(sim.pos.a>0,'A blocked turn leaves steering stuck');

 sim=fixture([{x:0,z:-2.3,w:6,d:.05}]);
 step(sim);
 check(sim.speed<0&&sim.impactSerial===1&&sim.shake>0,'Hard contact misses its rebound or impact feedback');

 sim=fixture([{x:0,z:0,w:1,d:1}]);
 step(sim,0);
 check(sim.speed===18&&sim.impactSerial===0&&sim.vehicleImpacts.length===0,'Updating an overlapping save at zero elapsed time corrupts vehicle state');
 check(!sim.blocked(1.25,1.25,.32,false)&&sim.blocked(1.2,1.2,.32,false),'Walking collision uses a square at scenery corners');
 sim.world.colliders=[];sim.inCar=false;
 check(sim.blocked(0,1.9,.32)&&!sim.blocked(1.6,0,.32),'Walking collision ignores the last driven car footprint');

 sim=fixture();
 const moving=fixture().car;moving.position.z=-4.1;
 sweep(sim,0,-12,.025,[{mesh:moving,vx:0,vz:-12}]);
 check(sim.impactSerial===0&&sim.vehicleImpacts.length===0&&Math.abs(moving.position.z+4.4)<.0001,'Matched traffic speed reports or experiences a crash');
 sim=fixture();
 const oncoming=fixture().car;oncoming.position.z=-4.3;oncoming.rotation.y=Math.PI;
 sweep(sim,0,-16,.025,[{mesh:oncoming,vx:0,vz:16}]);
 const oncomingSpeed=16+oncoming.userData.vehicleMotion.vz;
 check(sim.speed<-.5&&oncomingSpeed<-.5&&Math.abs(oncomingSpeed-sim.speed)<.01&&!overlaps(sim,oncoming),
  'An equal-mass head-on contact lacks a shared rebound or changes net momentum');

 sim=fixture();
 const struck=fixture().car;struck.position.z=-4.1;
 sim.traffic.push({m:struck,parked:true});
 let carMotion=0;
 sim.recordPedestrianVehicleMotion=(mesh,x,z,dx,dz)=>{if(mesh===struck)carMotion+=Math.hypot(dx,dz)};
 sweep(sim,0,-20,.025,[{mesh:struck}]);
 const targetSpeed=-(struck.userData.vehicleMotion?.vz??0);
 check(sim.speed>5&&sim.speed<14&&targetSpeed>8&&struck.position.z<-4.2,'A parked car absorbs the hit like scenery');
 check(!overlaps(sim,struck)&&sim.impactSerial===1&&sim.vehicleImpacts[0]?.kind==='vehicle','A vehicle impact penetrates or omits feedback');
 check(carMotion>.1,'An impacted vehicle moves without recording accepted travel');
 const after=struck.position.z;
 for(let i=0;i<50;i++)step(sim);
 check(struck.position.z<after-.3&&Math.abs(struck.userData.vehicleMotion.vz)<.1,'An impacted parked vehicle fails to coast and settle');

 sim=fixture();
 const corner=fixture().car;corner.position.x=1.35;corner.position.z=-4.05;
 sweep(sim,1,-21,.04,[{mesh:corner}]);
 check(Math.abs(corner.userData.vehicleMotion.yaw)>.15&&Math.abs(corner.rotation.y)>.005,'An off-center impact fails to turn the target car');
 check(!overlaps(sim,corner),'Off-center contact leaves the cars embedded');

 sim=fixture([{x:0,z:-2.2,w:6,d:.05}]);
 sweep(sim,0,-2,.1);
 check(sim.vehicleImpacts.length===1&&sim.impactSerial===0,'A minor tap affects activity scoring or lacks audio feedback');
 const impact=sim.vehicleImpacts.length;
 for(let i=0;i<20;i++){sim.time+=.025;sweep(sim,8,-2,.025)}
 check(sim.vehicleScrapes.size>0&&sim.vehicleImpacts.length===impact,'A loaded scrape fails to remain continuous or repeats impact audio');

 const slipOf=car=>Math.abs(Math.atan2(Math.sin(car.pos.a-car.motionA),Math.cos(car.pos.a-car.motionA)));
 sim=fixture();sim.speed=1.5;sim.smoothSteer=0;
 for(let i=0;i<10;i++)step(sim,.025,new Set(['KeyA']));
 check(sim.pos.a>.02,'Low speed steering does not turn the car');
 sim=fixture();sim.speed=0;sim.smoothSteer=0;
 for(let i=0;i<12;i++)step(sim,.025,new Set(['KeyA']));
 check(sim.pos.a>.02,'A stopped car cannot steer into a parking space');

 const loose=fixture(),held=fixture();
 for(let i=0;i<24;i++){step(loose,.025,new Set(['KeyA']));step(held,.025,new Set(['KeyA','Space']))}
 check(slipOf(held)>slipOf(loose)&&slipOf(loose)<.30,'Handbrake does not increase the slip angle');

 sim=fixture();
 const rival=fixture().car;rival.position.z=-4.1;
 const race=Object.create(StreetRace.prototype);
 const spec={points:[[0,0],[0,-80],[80,-80],[80,0],[0,0]],pace:20,laps:1};
 Object.assign(race,{active:true,track:layoutCircuit(spec),spec,countdown:0,time:0,passed:0,cars:[{car:rival,s:4.1,lane:0,pace:1,v:0,finished:0,trail:{visible:false}}]});
 sim.raceTraffic=race;sim.smoothSteer=0;
 step(sim);
 race.update(.025,sim);
 check(sim.impactSerial===1&&rival.position.z<-4.2&&race.cars[0].s>4.2,'A race rival neither shares an impulse nor advances by actual motion');
}

export function checkRaceRivalRoutes(check,colliders){
 for(const spec of circuits){
  const sim=fixture(colliders);
  delete sim.bodyOf;
  sim.inCar=false;sim.speed=0;sim.gridStart=()=>{};
  const race=new StreetRace(new Group(),(color,model)=>{
   const car=new Group();car.userData.model=model;return car;
  });
  race.start(spec,sim);race.countdown=0;
  const dt=.025,limit=race.track.length*spec.laps/spec.pace*1.7+8;
  while(race.time<limit&&race.cars.some(r=>!r.finished)){
   sim.time+=dt;
   sim.moveVehicleBodies(race.prepareTraffic(dt),dt);
   race.update(dt,sim);
  }
  check(race.cars.every(r=>r.finished>0),'A rival stalls on the full '+spec.id+' circuit');
 }
}
