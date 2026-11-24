import layout from '../assets/shiba-layout.json';
import gateSupports from '../assets/shiba-gate-supports.json';
import {createTrees, makeStreets} from './shiba/street.js';

const height = layout.height;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function shibaTerrain(x, y) {
 const fx = clamp((x - height.x) / height.step, 0, height.w - 1.001),
  fy = clamp((y - height.y) / height.step, 0, height.h - 1.001),
  i = Math.floor(fx),
  j = Math.floor(fy),
  a = fx - i,
  b = fy - j,
  n = j * height.w + i,
  cm = height.cm;
 return ((cm[n] * (1 - a) + cm[n + 1] * a) * (1 - b) + (cm[n + height.w] * (1 - a) + cm[n + height.w + 1] * a) * b) / 100;
}
export const shibaGround = (x, z) => shibaTerrain(x, -z);

const boundsOf = ring => {
 let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
 for (const [x, y] of ring) {
  if (x < minX) minX = x;
  if (y < minY) minY = y;
  if (x > maxX) maxX = x;
  if (y > maxY) maxY = y;
 }
 return [minX, minY, maxX, maxY];
};
const boundary = boundsOf(layout.boundary);
export const shibaLimits = {minX: boundary[0] - 4, maxX: boundary[2] + 4, minZ: -boundary[3] - 4, maxZ: -boundary[1] + 4};

function buildingBox(ring) {
 const [minX, minY, maxX, maxY] = boundsOf(ring);
 const w = (maxX - minX) / 2, d = (maxY - minY) / 2;
 if (w < 0.3 || d < 0.3) return null;
 return {x: (minX + maxX) / 2, z: -(minY + maxY) / 2, w, d};
}
export function shibaBuildings() {
 const colliders = [], footprints = [];
 for (const footprint of layout.footprints) {
  const rings = (gateSupports[footprint.id] || [null]).map(support => support || footprint.rings[0]);
  for (const ring of rings) {
   const box = buildingBox(ring);
   if (!box) continue;
   colliders.push(box);
   footprints.push({x: box.x, z: box.z, w: box.w * 2, d: box.d * 2});
  }
 }
 return {colliders, footprints};
}

export const shibaRoads = [];
for (const [kind, pts] of layout.roads) {
 if (kind !== 'road' || pts.length < 2) continue;
 for (let i = 1; i < pts.length; i++) shibaRoads.push([pts[i - 1][0], -pts[i - 1][1], pts[i][0], -pts[i][1]]);
}

export function addShibaDistrict(scene, district) {
 district.name = 'Shiba Park';
 scene.add(district);
 district.traverse(obj => {
  if (obj.isMesh) {
   obj.castShadow = obj.name !== 'surveyed-ground' && obj.name !== 'skyline-ground';
   obj.receiveShadow = true;
  }
 });
 makeStreets(scene, layout, shibaTerrain, district);
 createTrees(scene, layout.trees);
}
