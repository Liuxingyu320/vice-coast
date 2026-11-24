import {Box3, Matrix4, Scene, Vector3} from 'three';
import {loadStudio} from '../src/blender-assets.js';
import {clearOfCrossStreets, loadSave, parkedSpots, roadWidth, spawn, xs, zs} from '../src/data.js';
import {makeMidnightSet} from '../src/midnight-set.js';
import {Simulation} from '../src/simulation.js';
import {additions, streetResidents} from '../src/street-catalog.js';
import {createWorld} from '../src/world.js';

function check(ok, message) {
 if (!ok) throw new Error(message);
}

async function checkCity() {
 await loadStudio();
 const scene = new Scene();
 const world = createWorld(scene);
 makeMidnightSet({scene, world, footHeight: () => .14});
 scene.updateMatrixWorld(true);
 const half = roadWidth / 2;
 // The paved strips continue one metre past the outermost intersection.
 function onRoad(x, z, w, d) {
  const inside = (v, size, min, max) => v + size > min + .001 && v - size < max - .001;
  return (inside(z, d, zs[0]-half-1, zs.at(-1)+half+1) && xs.some(s => inside(x, w, s-half, s+half))) ||
         (inside(x, w, xs[0]-half-1, xs.at(-1)+half+1) && zs.some(s => inside(z, d, s-half, s+half)));
 }
 for (const {x,z,w,d} of world.colliders) {
  check(!onRoad(x,z,w,d), 'Collision inside road at '+[x,z]);
 }
 // The Blender scenery is batched by district. Check its triangles, since the
 // gameplay colliders alone cannot detect a projecting awning or a misplaced pier.
 const district=scene.getObjectByName('Tokyo Bay'), triangle=new Box3(), vertex=new Vector3();
 let checkedFaces=0;
 district.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const {position}=mesh.geometry.attributes, indices=mesh.geometry.index;
  for(let i=0;i<indices.count;i+=3){
   triangle.makeEmpty();
   for(let k=0;k<3;k++){
    vertex.fromBufferAttribute(position,indices.getX(i+k)).applyMatrix4(mesh.matrixWorld);
    triangle.expandByPoint(vertex);
   }
   const {min,max}=triangle;
   if(min.y>3.25||max.y<.32)continue;
   checkedFaces++;
   check(!onRoad((min.x+max.x)/2,(min.z+max.z)/2,(max.x-min.x)/2,(max.z-min.z)/2),
    'Blender mesh projects into road: '+mesh.name+' at '+[min.x,min.z]);
  }
 });
 check(checkedFaces>0,'Tokyo scenery was not loaded');
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
 makeMidnightSet(sim);
 for(let x=148.5;x>=136;x-=.25){
  check(!sim.blocked(x,54.4,.32,false),'Record shop entrance obstructed at x='+x);
 }
 const train=sim.scene.getObjectByProperty('name','Train');
 sim.world.update(0,sim.camera);const start=train.position.x;
 sim.world.update(15,sim.camera);check(train.position.x>start+5,'Commuter train is stationary');

 for (const role of streetResidents) {
  check(sim.walkers.some(n => n.p.userData.role === role), 'Missing resident '+role);
 }
 for (const n of sim.walkers) {
  check(xs.every(x => Math.abs(n.x-x) > half+.32), 'Pedestrian in traffic at x='+n.x);
  check(clearOfCrossStreets(n.min,.32) && clearOfCrossStreets(n.max,.32) &&
        !zs.some(z => z >= n.min && z <= n.max), 'Pedestrian route crosses traffic at x='+n.x);
  for (const c of sim.world.colliders) {
   const overlap = Math.abs(n.x-c.x) < c.w+.32 && n.max > c.z-c.d-.32 && n.min < c.z+c.d+.32;
   check(!overlap, 'Pedestrian route enters scenery at '+[c.x,c.z]);
  }
 }
 const parked = [...sim.cars, ...sim.traffic.filter(v => v.parked).map(v => v.m)];
 for (const car of additions) {
  const m = sim.parkedStreetCar(car.key);
  check(m && clearOfCrossStreets(m.position.z,2.65), 'Missing or obstructing parked car '+car.key);
  check(parked.every(other => other === m || other.position.distanceTo(m.position) > 5.5), 'Overlapping car '+car.key);
 }
 const moved = sim.parkedStreetCar(favorite.key).position;
 check(moved.z !== favorite.z && save.pin.x === moved.x && save.pin.z === moved.z, 'Car pin did not follow relocated vehicle');
 return [xs.length*zs.length+' intersections', world.colliders.length+' collision bounds',checkedFaces+' street-level Blender triangles',
         sim.walkers.length+' pedestrian routes', additions.length+' vehicle locations'].join(', ');
}

const result = document.querySelector('#result');
checkCity().then(summary => { result.textContent = 'PASS '+summary; })
 .catch(error => { result.textContent = 'FAIL '+error.message; });
