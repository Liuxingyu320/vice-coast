import assert from 'node:assert/strict';
import { createCollision } from '../src/shiba/collision.js';
import { roadMotion } from '../src/shiba/driving.js';
export function checkTravel(map, physical) {
  const { contact, passable } = createCollision(map.boundary, physical);
  const move = roadMotion(contact);
  let samples = 0,
    streets = 0;
  const main = new Set([
    'primary',
    'secondary',
    'tertiary',
    'trunk',
    'primary_link',
    'secondary_link',
    'trunk_link',
    'tertiary_link',
  ]);
  for (const [i, [kind, line]] of map.roads.entries()) {
    const [width, level] = map.roadInfo[i];
    if (kind !== 'road' || !main.has(level)) continue;
    streets++;
    for (let k = 1; k < line.length; k++) {
      const [ax, ay] = line[k - 1],
        [bx, by] = line[k],
        len = Math.hypot(bx - ax, by - ay);
      if (len < 0.01) continue;
      const dx = (bx - ax) / len,
        dy = (by - ay) / len,
        angle = Math.atan2(dx, dy);
      for (let t = 0.5; t < len; t += 1) {
        const x = ax + t * dx,
          y = ay + t * dy;
        // A mapped median or gate pier can divide a road. At least one full-width route must exist.
        const open = [0, -0.25, 0.25, -0.32, 0.32].some(
          (f) => !contact(x + dy * width * f, y - dx * width * f, angle),
        );
        assert.ok(open, `all vehicle lanes blocked on ${level} way ${i} at ${x.toFixed(2)},${y.toFixed(2)}`);
        samples++;
      }
    }
  }
  // Continuous bumper-to-bumper sweeps through the three measured building passages, including both portals.
  const passages = [
    ['134192181', [512.29, -86.18], [582.83, -95.52]],
    ['411388986', [400.24, -197.16], [409.94, -198.57]],
    ['988197906', [659.94, -150.86], [622.35, -152.44]],
  ];
  for (const [id, [ax, ay], [bx, by]] of passages) {
    const length = Math.hypot(bx - ax, by - ay),
      steps = Math.ceil(length / 0.23);
    const s = { x: ax, y: ay, heading: Math.atan2(bx - ax, by - ay), speed: 4 };
    for (let i = 0; i < steps; i++) move(s, (bx - ax) / steps, (by - ay) / steps);
    assert.ok(Math.hypot(bx - s.x, by - s.y) < 0.025, 'Visible passage obstructed ' + id);
  }
  const x = 438.94,
    y = -162.97,
    h = 0.44,
    s = { x, y, heading: h, speed: 8 };
  for (let step = 0; step < 55; step++) move(s, Math.sin(h) * 0.5, Math.cos(h) * 0.5);
  assert.ok(Math.hypot(s.x - x, s.y - y) > 27.45, 'vehicle blocked on park access');
  s.speed = -6;
  for (let step = 0; step < 55; step++) move(s, -Math.sin(h) * 0.5, -Math.cos(h) * 0.5);
  assert.ok(Math.hypot(s.x - x, s.y - y) < 0.005, 'vehicle failed to reverse from lawn');
  for (const st of map.stations) {
    const [dx, dy] = st.down,
      px = st.mouth[0] + dx * 0.47,
      py = st.mouth[1] + dy * 0.47;
    assert.ok(passable(px, py), 'pedestrian station entrance blocked');
    assert.ok(contact(px, py, Math.atan2(dx, dy)), 'open station well admits vehicle');
  }
  return {
    majorRoads: streets,
    metreSamples: samples,
    blockedCarriageways: 0,
    continuousPassages: passages.length,
    grassOutAndBackM: 55,
  };
}
