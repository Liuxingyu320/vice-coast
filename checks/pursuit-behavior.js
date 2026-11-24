import {Simulation} from '../src/simulation.js';
import {chaosForStar,pursuitAxes,relativePosition} from '../src/pursuit.js';

const dt=1/60;
const noKeys=new Set();
const lights={color:{setHex(){}}};

function vehicle(x,z,a,onDuty=false){
 return {
  position:{x,z,set(x,y,z){Object.assign(this,{x,y,z})}},
  rotation:{y:a},
  userData:{model:1,onDuty,shell:{rotation:{}},wheels:[]},
  visible:onDuty
 };
}

function scenario({pos,velocity,cruisers,colliders=[]}){
 const [x,z,a]=pos,car=vehicle(x,z,a);
 const patrols=cruisers.map(([x,z,a])=>vehicle(x,z,a,true));
 const contacts=[];
 const sim=Object.assign(Object.create(Simulation.prototype),{
  car,cars:[car],traffic:[],walkers:[],patrol:patrols[0],patrol2:patrols[1]??vehicle(0,0,0),
  pos:{x,z,a},motionA:a,speed:velocity,inCar:true,walkV:{x:0,z:0},world:{colliders},lightR:lights,lightB:lights,
  time:0,heat:cruisers.length,chaos:chaosForStar(cruisers.length),chaosClock:0,fineHold:0,spotted:true,seenAt:{x,z},
  copDispatchAt:100,hitCooldown:100,shake:0,impactSerial:0,vehicleImpacts:[],vehicleScrapes:new Map(),vehicleContactTimes:new Map(),
  save:{},notify(){},marks(){},smoothSteer:0,nextMark:0
 });
 // Supply repeatable driver input while the actual AI and swept contact solver move the bodies.
 sim.driving=()=>({vx:-Math.sin(sim.pos.a)*velocity,vz:-Math.cos(sim.pos.a)*velocity});
 sim.publishVehicleContact=(a,b,hit,contact)=>{
  Simulation.prototype.publishVehicleContact.call(sim,a,b,hit,contact);
  const player=a.command.player?a:b?.command.player?b:null;
  const other=player===a?b:a;
  if(player&&patrols.includes(other?.mesh)&&contact.approach>1.05){
   contacts.push({mission:other.mesh.userData.mission,playerSpeed:Math.hypot(player.vx,player.vz)});
  }
 };
 return {
  sim,patrols,contacts,
  step(){
   sim.time+=dt;
   sim.pedestrianMotionCount=0;
   sim.movingCity(dt,noKeys);
  }
 };
}

export function checkPursuit(check){
 const first=scenario({pos:[156.1,10,Math.PI],velocity:10,cruisers:[[160,53,0]]});
 let held=false;
 for(let i=0;i<240&&!first.contacts.length;i++){
  first.step();
  held||=!!first.sim.patrol.userData.holding;
 }
 check(held,'One-star interceptor never blocked the actual target lane');
 check(first.contacts.some(contact=>contact.mission==='block'&&contact.playerSpeed<9.7),'Interceptor never slowed the target through swept vehicle contact');

 const cross=scenario({pos:[163.9,32,0],velocity:20,cruisers:[[137,0,-Math.PI/2]]});
 const crossIntercepted=()=>cross.contacts.some(contact=>contact.mission==='block'&&contact.playerSpeed<19.5);
 for(let i=0;i<280&&!crossIntercepted();i++)cross.step();
 check(crossIntercepted(),'Cruiser from a cross street cannot physically intercept a moving target');

 const rear=scenario({pos:[164,32,Math.PI],velocity:12,cruisers:[[164,21,Math.PI],[161,14,Math.PI]]});
 let blockerAhead=false,flankClosed=false;
 for(let i=0;i<400;i++){
  rear.step();
  const axes=pursuitAxes(rear.sim);
  for(const cop of rear.patrols){
   const {ahead,side}=relativePosition(rear.sim.pos,axes,cop.position);
   if(cop.userData.mission==='block'&&cop.userData.holding&&ahead>1)blockerAhead=true;
   if(cop.userData.mission==='ram'&&ahead>-5&&ahead<3&&Math.abs(side)<3.6&&Math.abs(side)>1)flankClosed=true;
  }
  if(blockerAhead&&flankClosed&&rear.contacts.some(contact=>contact.mission==='ram'))break;
 }
 check(blockerAhead&&flankClosed,'Two-star cruisers do not split into an interceptor and close flank pressure');
 check(rear.contacts.some(contact=>contact.mission==='ram'),'Pressure cruiser never makes genuine vehicle contact');

 const escape=scenario({pos:[0,20,Math.PI],velocity:12,cruisers:[[0,29,Math.PI/2]]});
 escape.step();
 check(escape.sim.patrol.userData.holding,'Head-on hold fixture failed to cover the player trajectory');
 escape.sim.pos.a=escape.sim.motionA=-Math.PI/2;
 escape.step();
 check(!escape.sim.patrol.userData.holding,'Patrol keeps holding after a sideways escape');

 const reverse=scenario({pos:[0,20,Math.PI],velocity:-8,cruisers:[[0,11,Math.PI/2]]});
 reverse.step();
 check(reverse.sim.patrol.userData.holding,'Patrol ignored the actual travel direction while reversing');

 const stopped=scenario({pos:[0,20,Math.PI],velocity:0,cruisers:[[0,7,Math.PI]]});
 for(let i=0;i<210&&stopped.sim.fineHold<.4;i++)stopped.step();
 check(stopped.sim.fineHold>=.4&&!stopped.contacts.length,'Patrol cannot approach a stopped car for custody without hitting it');

 const hidden=scenario({pos:[0,20,Math.PI],velocity:12,cruisers:[[0,29,Math.PI/2]]});
 hidden.step();
 const {x,z}=hidden.sim.seenAt;
 hidden.sim.pos.x=-6;
 hidden.sim.world.colliders=[{x:-3,z:24,w:1,d:3}];
 hidden.step();
 check(hidden.sim.unseen&&hidden.sim.patrol.userData.searching&&!hidden.sim.patrol.userData.holding
  &&hidden.sim.seenAt.x===x&&hidden.sim.seenAt.z===z,'Patrol continues intercepting through scenery instead of searching the last sighting');
}
