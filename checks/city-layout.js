import {Box3, Matrix4, Scene} from 'three';
import {loadStudio} from '../src/blender-assets.js';
import {clearOfCrossStreets, loadSave, parkedSpots, roadWidth, spawn, xs, zs} from '../src/data.js';
import {makeMidnightSet} from '../src/midnight-set.js';
import {Simulation} from '../src/simulation.js';
import {additions, streetResidents} from '../src/street-catalog.js';
import {createWorld} from '../src/world.js';
import {checkVehicleCollision} from './vehicle-collision.js';

function check(ok, message) {
 if (!ok) throw new Error(message);
}

async function checkCity() {
 checkVehicleCollision(check);
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
 return [xs.length*zs.length+' intersections', world.colliders.length+' collision bounds',
         sim.walkers.length+' pedestrian routes', additions.length+' vehicle locations', 'vehicle collision regressions'].join(', ');
}

const result = document.querySelector('#result');
checkCity().then(summary => { result.textContent = 'PASS '+summary; })
 .catch(error => { result.textContent = 'FAIL '+error.message; });
