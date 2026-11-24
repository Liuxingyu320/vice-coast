import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
for (const name of ['shiba-ground', 'tower-lattice', 'surveyed-skyline']) {
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

assert.equal(map.trees.length, 635);
assert.ok(map.trees.every((row) => row.length === 5 && row.every(Number.isFinite) && row[3] > 3 && row[4] > 0));
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
const motion = roadMotion(clip, [building], fence, {
  nearest: () => ({ heading: 0, distance: 0, width: 12 }),
});
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

// Test the serialized triangles that the browser renders, including T junctions with no shared OSM node.
const { gunzipSync } = await import('node:zlib');
const paving = JSON.parse(gunzipSync(asset('shiba-pavement.gz')));
const bins = new Map(),
  cell = 32;
const binKey = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
const sides = [-1, 1];
map.roads.forEach(([kind, line], i) => {
  if (kind !== 'road') return;
  const half = map.roadInfo[i][0] / 2 - 0.004;
  for (let j = 1; j < line.length; j++) {
    const [x, y] = line[j - 1],
      [X, Y] = line[j],
      length = Math.hypot(X - x, Y - y);
    if (length < 0.02) continue;
    const dx = (X - x) / length,
      dy = (Y - y) / length;
    const polygon = sides.flatMap((side) =>
      sides.map((end) => [
        (x + X) / 2 + end * dx * (length / 2 - 0.004) - side * dy * half,
        (y + Y) / 2 + end * dy * (length / 2 - 0.004) + side * dx * half,
      ]),
    );
    const xs = polygon.map((p) => p[0]),
      ys = polygon.map((p) => p[1]);
    const road = {
      polygon,
      axes: [
        [dx, dy],
        [-dy, dx],
      ],
    };
    for (let u = Math.floor(Math.min(...xs) / cell); u <= Math.floor(Math.max(...xs) / cell); u++)
      for (let v = Math.floor(Math.min(...ys) / cell); v <= Math.floor(Math.max(...ys) / cell); v++) {
        const key = u + ',' + v;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(road);
      }
  }
});
for (const [kind, [xy, faces]] of Object.entries(paving)) {
  assert.ok(xy.length % 2 === 0 && faces.length % 3 === 0 && xy.every(Number.isInteger));
  assert.ok(faces.length > 100 && faces.every((i) => Number.isInteger(i) && i >= 0 && i < xy.length / 2));
  if (!['curb', 'tactile', 'sidewalk', 'forecourt'].includes(kind)) continue;
  for (let j = 0; j < faces.length; j += 3) {
    const tri = faces.slice(j, j + 3).map((k) => [xy[k * 2] / 1000, xy[k * 2 + 1] / 1000]);
    const axes = tri.map(([x, y], k) => [y - tri[(k + 1) % 3][1], tri[(k + 1) % 3][0] - x]);
    const xs = tri.map((p) => p[0]),
      ys = tri.map((p) => p[1]);
    const nearby = new Set();
    for (const x of [Math.min(...xs), Math.max(...xs)])
      for (const y of [Math.min(...ys), Math.max(...ys)])
        for (const road of bins.get(binKey(x, y)) || []) nearby.add(road);
    for (const road of nearby) {
      const separate = [...axes, ...road.axes].some(([x, y]) => {
        const a = tri.map((p) => p[0] * x + p[1] * y),
          b = road.polygon.map((p) => p[0] * x + p[1] * y);
        return Math.max(...a) <= Math.min(...b) + 1e-8 || Math.max(...b) <= Math.min(...a) + 1e-8;
      });
      assert.ok(separate, kind + ' overlaps motor road at ' + JSON.stringify(tri));
    }
  }
}
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
