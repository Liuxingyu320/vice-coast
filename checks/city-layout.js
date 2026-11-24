import {Box3, Matrix4, Scene, Vector3} from 'three';
import {loadStudio} from '../src/blender-assets.js';
import {clearOfCrossStreets, loadSave, parkedSpots, roadWidth, spawn, xs, zs} from '../src/data.js';
import {Simulation} from '../src/simulation.js';
import {additions, streetResidents} from '../src/street-catalog.js';
import {createWorld} from '../src/world.js';
import {checkRaceRivalRoutes, checkVehicleCollision} from './vehicle-collision.js';
import {checkVehicleAudio} from './vehicle-audio.js';
import {checkPedestrianCombat} from './pedestrian-combat.js';
import {checkPursuit} from './pursuit-behavior.js';

function check(ok, message) {
 if (!ok) throw new Error(message);
}

function checkVehicleExit(){
 const fixture=(speed,blocked)=>{
  const sim=Object.create(Simulation.prototype);
  const car={position:{x:160,z:25},rotation:{y:0},visible:true,userData:{model:0}};
  const notices=[];
  Object.assign(sim,{inCar:true,speed,pos:{x:160,z:25,a:0},car,cars:[car],traffic:[],notices,notify:message=>notices.push(message)});
  sim.blocked=blocked;
  sim.clearScenerySegment=()=>true;
  sim.placeOnFoot=(x,z,a)=>{sim.inCar=false;sim.speed=0;sim.pos={x,z,a}};
  return sim;
 };
 for(const speed of [0,5,-5]){
  const sim=fixture(speed,()=>false);
  check(sim.canExitAtSpeed(),'HUD refuses an allowed exit speed '+speed);
  sim.interact();
  check(!sim.inCar&&sim.pos.x>160&&sim.car.position.x===160&&sim.car.position.z===25,'Allowed exit fails or moves the car '+speed);
 }
 for(const speed of [5.001,-5.001]){
  const sim=fixture(speed,()=>false);
  check(!sim.canExitAtSpeed(),'HUD permits exit beyond the speed limit '+speed);
  sim.interact();
  check(sim.inCar&&sim.speed===speed&&sim.notices.length===0,'Too-fast exit changes vehicle state or shows a warning '+speed);
 }
 const farDoor=fixture(5,x=>x>=160);
 farDoor.interact();
 check(!farDoor.inCar&&farDoor.pos.x<160,'Blocked curb-side door prevents a clear far-side exit');
 const blocked=fixture(-5,()=>true);
 blocked.interact();
 check(blocked.inCar&&blocked.speed===-5&&blocked.notices[0]?.includes('车门'),'Blocked doors allow exit or omit the obstruction notice');
}

function checkVehicleOffense(){
 const notices=[];
 const sim=Object.assign(Object.create(Simulation.prototype),{heat:0,hits:0,hitCooldown:0,notify:message=>notices.push(message)});
 sim.reportVehicleOffense();
 check(sim.hits===1&&sim.hitCooldown>0&&notices.length===0,'First vehicle offense is ignored or shows a crash warning');
 sim.hitCooldown=0;
 sim.reportVehicleOffense();
 check(sim.heat===1&&notices.length===1&&notices[0].includes('警戒上升'),'Repeated vehicle offense no longer raises wanted status');
}

async function checkCity() {
 checkVehicleExit();
 checkVehicleOffense();
 checkVehicleCollision(check);
 checkPedestrianCombat(check);
 checkPursuit(check);
 await checkVehicleAudio(check);
 await loadStudio();
 const scene = new Scene();
 const world = createWorld(scene);
 scene.updateMatrixWorld(true);
 const half = roadWidth / 2;
 // The paved strips continue one metre past the outermost intersection.
 function onRoad(x, z, w, d) {
  const inside = (v, size, min, max) => v + size > min + .001 && v - size < max - .001;
  return (inside(z, d, zs[0]-half-1, zs.at(-1)+half+1) && xs.some(s => inside(x, w, s-half, s+half))) ||
         (inside(x, w, xs[0]-half-1, xs.at(-1)+half+1) && zs.some(s => inside(z, d, s-half, s+half)));
 }
 checkRaceRivalRoutes(check,world.colliders);
 const district=scene.getObjectByName('Shiba Park');
 check(district&&district.children.length>0,'Shiba Park scenery was not loaded');
 let checkedFaces=0;
 district.traverse(mesh=>{if(mesh.isMesh)checkedFaces++});
 check(checkedFaces>0,'Shiba Park has no meshes');
 const transform = new Matrix4(), bounds = new Box3();
 scene.traverse(mesh => {
  if (!mesh.isInstancedMesh) return;
  mesh.geometry.computeBoundingBox();
  for (let i = 0; i < mesh.count; i++) {
   mesh.getMatrixAt(i, transform);
   bounds.copy(mesh.geometry.boundingBox).applyMatrix4(transform.premultiply(mesh.matrixWorld));
   const {min,max} = bounds;
   if (min.y > 3.25 || max.y < .32) continue;
   const x = (min.x+max.x)/2, z = (min.z+max.z)/2;
   check(!onRoad(x,z,(max.x-min.x)/2,(max.z-min.z)/2), 'Street decoration inside road at '+[x,z]);
  }
 });
 const save = loadSave('{}'), favorite = additions[0];
 save.fleet = [spawn, ...parkedSpots].map(p => ({...p}));
 Object.assign(save.fleet[1], {x:favorite.x, z:favorite.z});
 save.pin = {vehicleKey:favorite.key, x:favorite.x, z:favorite.z};
 const sim = new Simulation(document.querySelector('canvas'), save, () => {});
 check(!sim.blocked(spawn.x,spawn.z,.32,false),'Spawn is inside Shiba scenery');

 for (const role of streetResidents) {
  check(sim.walkers.some(n => n.p.userData.role === role), 'Missing resident '+role);
 }
 for (const n of sim.walkers) {
  check(xs.every(x => Math.abs(n.x-x) > half+.32), 'Pedestrian in traffic at x='+n.x);
  check(clearOfCrossStreets(n.min,.32) && clearOfCrossStreets(n.max,.32) &&
        !zs.some(z => z >= n.min && z <= n.max), 'Pedestrian route crosses traffic at x='+n.x);
 }
 const parked = [...sim.cars, ...sim.traffic.filter(v => v.parked).map(v => v.m)];
 for (const car of additions) {
  const m = sim.parkedStreetCar(car.key);
  check(m && clearOfCrossStreets(m.position.z,2.65), 'Missing or obstructing parked car '+car.key);
  check(parked.every(other => other === m || other.position.distanceTo(m.position) > 5.5), 'Overlapping car '+car.key);
 }
 const moved = sim.parkedStreetCar(favorite.key).position;
 check(moved.z !== favorite.z && save.pin.x === moved.x && save.pin.z === moved.z, 'Car pin did not follow relocated vehicle');
 const noseX=-Math.sin(sim.pos.a), noseZ=-Math.cos(sim.pos.a);
 const camGap=Math.hypot(sim.camera.position.x-sim.pos.x, sim.camera.position.z-sim.pos.z);
 check(camGap>4, 'Follow camera sits inside the cabin');
 const toCarX=sim.pos.x-sim.camera.position.x, toCarZ=sim.pos.z-sim.camera.position.z;
 check(toCarX*noseX+toCarZ*noseZ>camGap*0.6, 'Follow camera is not behind the vehicle');
 const powered=sim.driving(0.25, new Set(['KeyW']));
 check(powered.vx*noseX+powered.vz*noseZ>0.3, 'W does not accelerate toward the camera look');
 check(sim.patrol.userData.service!=='solano'&&sim.patrol.getObjectByName('Lightbar'), 'Patrol car is not the surveyed police model');
 return [xs.length*zs.length+' intersections', world.colliders.length+' collision bounds',checkedFaces+' street-level Blender triangles',
         sim.walkers.length+' pedestrian routes', additions.length+' vehicle locations', 'vehicle exit, collision, audio, combat and pursuit regressions'].join(', ');
}

const result = document.querySelector('#result');
checkCity().then(summary => { result.textContent = 'PASS '+summary; })
 .catch(error => { result.textContent = 'FAIL '+error.message; });
