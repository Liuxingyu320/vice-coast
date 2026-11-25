import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const asset = (name) => readFileSync(new URL('../assets/' + name, import.meta.url));
const map = JSON.parse(asset('shiba-layout.json'));
const boundary = map.boundary;
function inside([x, y], ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i],
      [bx, by] = ring[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) result = !result;
  }
  return result;
}
const xs = boundary.map((p) => p[0]),
  ys = boundary.map((p) => p[1]);
const rectangle = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
const signedArea =
  boundary.reduce((a, [x, y], i) => {
    const [u, v] = boundary[(i + 1) % boundary.length];
    return a + x * v - u * y;
  }, 0) / 2;
assert.ok(Math.abs(Math.abs(signedArea) - map.areaM2) < 2, 'Boundary area differs from the survey extract');
assert.ok(map.areaM2 / rectangle < 0.65, 'Map must retain its street-following indentations');
assert.ok(boundary.length > 50 && map.areaM2 > 550000);
assert.ok(
  inside([820, -190], boundary) && inside([405, -482], boundary),
  'Daimon and Shibakoen station extensions',
);
assert.ok(!inside([820, -475], boundary), 'Space between the two extensions is outside the map');
assert.equal(map.sourceBuildings, 636);
assert.equal(map.height.cm.length, map.height.w * map.height.h);
assert.ok(map.height.cm.every(Number.isFinite));
assert.equal(map.pins.length, 6);
for (const [index, [name, x, y]] of map.pins.entries()) {
  assert.ok(inside([x, y], boundary), name);
  for (const arrival of [map.arrivals[index], map.vehicleArrivals[index]]) {
    assert.ok(inside(arrival, boundary), 'Arrival outside ' + name);
    assert.ok(
      !map.footprints.some(
        (b) => inside(arrival, b.rings[0]) && !b.rings.slice(1).some((r) => inside(arrival, r)),
      ),
      'Blocked arrival at ' + name,
    );
  }
  if (map.verifiedBuildings[name])
    assert.ok(
      map.footprints.some((f) => f.id === map.verifiedBuildings[name] && inside([x, y], f.rings[0])),
      name,
    );
}
const bytes = asset('shiba-park.glb');
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(8), bytes.length);
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
for (const name of ['shiba-ground', 'tower-lattice']) {
  assert.ok(
    gltf.nodes.some((n) => n.name === name),
    'Missing geometry ' + name,
  );
}
const mesh = gltf.meshes[gltf.nodes.find((n) => n.name === 'tower-lattice').mesh];
const heights = mesh.primitives.map((p) => gltf.accessors[p.attributes.POSITION]);
const tip = Math.max(...heights.map((p) => p.max[1]));
assert.ok(Math.abs(tip - 18.391 - 333) < 0.04, 'Tokyo Tower tip');
assert.ok(
  gltf.images.length >= 16 && gltf.images.every((i) => Number.isInteger(i.bufferView) && !i.uri),
  'Offline photographic textures',
);
assert.ok(gltf.nodes.filter((n) => n.name.startsWith('brid_')).length > 0, 'Surveyed bridges');
console.log(
  `Shiba verified: ${map.areaM2} m², ${boundary.length} boundary vertices, ${map.sourceBuildings} buildings, six accessible landmarks, tower tip ${tip.toFixed(2)} m above datum`,
);

assert.equal(map.treeCandidates, 635);
assert.ok(map.trees.length > 0 && map.trees.length <= map.treeCandidates);
assert.ok(
  map.trees.every((row) => row.length === 5 && row.every(Number.isFinite) && row[3] > 3 && row[4] > 0),
);
assert.equal(map.roadInfo.length, map.roads.length);
assert.ok(map.crossings.some((c) => c[0] === 'traffic_signals'));
assert.ok(!gltf.nodes.some((n) => ['laser-crowns', 'canopy-trunks'].includes(n.name)));

// Glancing contact keeps forwards and reverse tangential travel against a facade and the map edge.
const { roadMotion } = await import('../src/shiba/driving.js');
const fence = [
  [-10, -30],
  [10, -30],
  [10, 30],
  [-10, 30],
];
const building = {
  box: [0, -20, 6, 20],
  rings: [
    [
      [0, -20],
      [6, -20],
      [6, 20],
      [0, 20],
    ],
  ],
};
const clip = (x, y) => inside([x, y], fence) && !inside([x, y], building.rings[0]);
const { createCollision } = await import('../src/shiba/collision.js');
const motion = roadMotion(createCollision(fence, { solids: [building.rings], wells: [], walks: [] }).contact);
for (const [x, dx, sign] of [
  [-0.99, 0.4, 1],
  [-9.08, -0.4, 1],
  [-0.99, 0.4, -1],
]) {
  const state = { x, y: 0, speed: 8 * sign, heading: 0 };
  motion(state, dx, 0.54 * sign);
  assert.ok(
    state.y * sign > 0.3 && Math.abs(state.speed) > 4 && clip(state.x, state.y),
    'Tangent slide lost after glancing contact',
  );
}

// Read the three published glTF files and independently reconstruct the metre-scale planar geometry.
const { spawnSync } = await import('node:child_process');
const { fileURLToPath } = await import('node:url');
const { existsSync } = await import('node:fs');
const { join } = await import('node:path');
const candidates = [
  process.env.SHIBA_PYTHON,
  process.env.VIRTUAL_ENV && join(process.env.VIRTUAL_ENV, 'bin/python'),
  'python3',
  process.env.SHIBA_CACHE && join(process.env.SHIBA_CACHE, 'venv/bin/python'),
  '/tmp/shiba-build-env/bin/python',
  '/tmp/shiba-plateau-local/venv/bin/python',
].filter(Boolean);
const python = candidates.find(
  (bin) =>
    (bin === 'python3' || existsSync(bin)) &&
    spawnSync(bin, ['-c', 'import shapely, numpy, PIL; assert hasattr(shapely,"coverage_is_valid")'])
      .status === 0,
);
assert.ok(
  python,
  'Install Shapely 2.1+, NumPy, and Pillow in the survey environment and set SHIBA_PYTHON to its interpreter.',
);
const audit = spawnSync(python, [fileURLToPath(new URL('../art/shiba/verify_site.py', import.meta.url))], {
  stdio: 'inherit',
});
assert.equal(audit.status, 0, 'Exported map geometry');
const supports = JSON.parse(asset('shiba-gate-supports.json')),
  bays = JSON.parse(asset('shiba-frontages.json'));
for (const name of ['sangedatsumon-gate', 'daimon-gate', 'building-foundations']) {
  const node = gltf.nodes.find((n) => n.name === name);
  assert.ok(node && gltf.meshes[node.mesh].primitives.length > 0, name);
}
for (const [label, x, y] of [
  ['三解脱门', 412.08, -148.03],
  ['增上寺大门', 645.2, -176.2],
]) {
  const obstacles = supports[map.verifiedBuildings[label]];
  assert.ok(obstacles.length >= 4 && obstacles.every((r) => !inside([x, y], r)), label + ' center passage');
}
assert.ok(
  bays.length > 100 &&
    bays.every(
      ([x, y, nx, ny, w]) => Number.isFinite(x + y + w) && w > 2 && Math.abs(Math.hypot(nx, ny) - 1) < 0.001,
    ),
);
console.log(
  'No pavement triangles cross a motor carriageway; verified two gate passages and ' +
    bays.length +
    ' measured frontage bays.',
);

const { checkTravel } = await import('./shiba-travel.mjs');
const travel = checkTravel(map, JSON.parse(asset('shiba-solids.json')));
console.log('Physical travel', travel);
if (process.env.SHIBA_GEOMETRY_REPORT) {
  const target = process.env.SHIBA_GEOMETRY_REPORT;
  const result = JSON.parse(readFileSync(target));
  writeFileSync(target, JSON.stringify({ ...result, travel }, null, 2) + '\n');
}
