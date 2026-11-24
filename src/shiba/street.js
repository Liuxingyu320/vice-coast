import { layPavement } from './pavement.js';
import * as T from 'three';
import { random, canvasMap, instances } from './primitives.js';
export function makeStreets(scene, data, terrain, district) {
  const roads = [],
    paths = [],
    stops = [],
    zebras = [],
    junctions = [];
  const paintMat = (c) =>
    new T.MeshStandardMaterial({ color: c, roughness: 0.62, emissive: c, emissiveIntensity: 0.3 });
  const junctionMap = new Map();
  for (let i = 0; i < data.roads.length; i++) {
    const [kind, pts] = data.roads[i],
      [width, category, oneway, lanes] = data.roadInfo[i];
    let length = 0;
    const segments = [];
    for (let k = 1; k < pts.length; k++) {
      const [x, y] = pts[k - 1],
        [ex, ey] = pts[k],
        dx = ex - x,
        dy = ey - y,
        len = Math.hypot(dx, dy);
      if (len < 0.18) continue;
      segments.push({ x, y, dx: dx / len, dy: dy / len, len, start: length });
      length += len;
    }
    if (!segments.length) continue;
    const road = { id: i, kind, width, category, oneway, lanes, length, segments, pts };
    (kind === 'road' ? roads : paths).push(road);
    if (kind === 'road')
      for (const [x, y] of pts) {
        const key = Math.round(x / 2) + ',' + Math.round(y / 2);
        let j = junctionMap.get(key);
        if (!j) junctionMap.set(key, (j = { x, y, ids: new Set() }));
        j.ids.add(i);
      }
  }
  for (const j of junctionMap.values()) if (j.ids.size >= 2) junctions.push(j);
  function nearest(x, y) {
    let best = null,
      bestD = Infinity;
    for (const r of roads)
      for (const s of r.segments) {
        const t = T.MathUtils.clamp((x - s.x) * s.dx + (y - s.y) * s.dy, 0, s.len),
          px = s.x + t * s.dx,
          py = s.y + t * s.dy,
          d = (x - px) ** 2 + (y - py) ** 2;
        if (d < bestD) {
          bestD = d;
          best = {
            x: px,
            y: py,
            heading: Math.atan2(s.dx, s.dy),
            width: r.width,
            road: r,
            distance: Math.sqrt(d),
          };
        }
      }
    return best;
  }
  layPavement(scene, terrain, data, district);
  const box = new T.BoxGeometry();
  function onRoad(x, y, margin = 0) {
    for (const r of roads)
      for (const s of r.segments) {
        const dx = x - s.x,
          dy = y - s.y,
          t = dx * s.dx + dy * s.dy;
        if (t >= 0 && t <= s.len && Math.abs(dx * s.dy - dy * s.dx) < r.width * 0.5 + margin) return true;
      }
    return false;
  }
  const sites = [];
  for (const [kind, x, y] of data.crossings) {
    const p = nearest(x, y);
    if (!p || p.distance > 10) continue;
    if (kind === 'stop') {
      stops.push([p.x, terrain(p.x, p.y) + 0.135, -p.y, 1.5, 1, 3.5, -p.heading]);
      continue;
    }
    if (sites.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 8)) continue;
    sites.push({ ...p, kind });
    const dx = Math.sin(p.heading),
      dy = Math.cos(p.heading),
      reach = Math.floor(p.width / 0.85);
    for (let j = 0; j < reach; j++) {
      const shift = (j - (reach - 1) / 2) * 0.83,
        cx = p.x + dy * shift,
        cy = p.y - dx * shift;
      zebras.push([
        cx,
        terrain(cx, cy) + 0.135,
        -cy,
        0.55,
        0.022,
        3.7,
        -p.heading,
        undefined,
        Math.atan2(terrain(cx + dx, cy + dy) - terrain(cx - dx, cy - dy), 2),
      ]);
    }
  }
  if (!stops.length)
    for (const q of sites.filter((_, i) => i % 5 === 0)) {
      const x = q.x - Math.sin(q.heading) * 6,
        y = q.y - Math.cos(q.heading) * 6;
      stops.push([x, terrain(x, y) + 0.14, -y, 1.5, 1, 3.3, -q.heading]);
    }
  const stopTexture = canvasMap(128, 256, (g) => {
    g.fillStyle = '#E8EDF5';
    g.textAlign = 'center';
    g.font = 'bold 65px sans-serif';
    ['止', 'ま', 'れ'].forEach((s, i) => g.fillText(s, 64, 69 + i * 77));
  });
  const plane = new T.PlaneGeometry();
  plane.rotateX(-Math.PI / 2);
  instances(
    scene,
    '止まれ',
    plane,
    new T.MeshStandardMaterial({ map: stopTexture, transparent: true, alphaTest: 0.35, roughness: 0.55 }),
    stops,
  );
  instances(scene, 'Marked crossings', box, paintMat('#E8EDF5'), zebras);
  return { roads, paths, sites, junctions, nearest, onRoad };
}
export function createTrees(scene, trees) {
  const rng = random(662),
    trunks = [],
    branches = [],
    leaves = [],
    cards = [];
  const bark = new T.MeshStandardMaterial({ color: '#797067', roughness: 0.98 }),
    canopy = new T.MeshStandardMaterial({
      roughness: 0.98,
      emissive: 0x263322,
      emissiveIntensity: 0.45,
      map: canvasMap(256, 256, (g) => {
        g.fillStyle = '#adb2a0';
        g.fillRect(0, 0, 256, 256);
        for (let n = 0; n < 8200; n++) {
          g.fillStyle = 'hsl(63 10% ' + (45 + rng() * 49) + '%)';
          g.beginPath();
          g.ellipse(rng() * 256, rng() * 256, 1 + rng() * 5, 1 + rng() * 2, rng() * 6.28, 0, 6.29);
          g.fill();
        }
      }),
    });
  const palette = [
    ['#486b3b', '#759149', '#5d793c'],
    ['#294b3e', '#426344', '#627348'],
    ['#697647', '#809150', '#91a45b'],
  ];
  for (let i = 0; i < trees.length; i++) {
    const [x, y, g, h, r] = trees[i],
      type = i % 11 < 6 ? 0 : i % 11 < 9 ? 1 : 2,
      az = rng() * Math.PI * 2;
    trunks.push([x, g + h * 0.27, -y, h * 0.018, h * 0.54, h * 0.018, az]);
    for (let j = 0; j < 6; j++) {
      const a = az + j * 2.39996,
        t = 0.43 + j * 0.054,
        dx = Math.cos(a),
        dz = Math.sin(a),
        spread = r * (type === 1 ? 0.78 : 0.7);
      const v = new T.Vector3(dx * spread, h * 0.22, dz * spread),
        l = v.length(),
        rot = new T.Euler().setFromQuaternion(
          new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize()),
          'YXZ',
        );
      branches.push([
        x + (dx * spread) / 2,
        g + h * (t + 0.11),
        -y + (dz * spread) / 2,
        h * 0.009,
        l,
        h * 0.009,
        rot.y,
        undefined,
        rot.x,
        rot.z,
      ]);
      const rad = r * (type === 1 ? 0.75 : 0.79),
        height = type === 1 ? h * 0.105 : h * 0.19;
      leaves.push([
        x + dx * spread * 0.72,
        g + h * (t + 0.2),
        -y + dz * spread * 0.72,
        rad * 0.91,
        height * 0.94,
        rad * 0.88,
        a,
        palette[type][j % 3],
      ]);
      for (let n = 0; n < 4; n++) {
        const b = a + n * 1.57;
        cards.push([
          x + dx * spread * 0.72 + Math.cos(b) * rad * 0.85,
          g + h * (t + 0.2),
          -y + dz * spread * 0.72 + Math.sin(b) * rad * 0.85,
          rad * 1.7,
          height * 2.1,
          1,
          -b + 0.5,
          palette[type][(j + n) % 3],
          (rng() - 0.5) * 0.7,
        ]);
      }
    }
    leaves.push([x, g + h * 0.87, -y, r * 0.7, h * 0.13, r * 0.66, az, palette[type][1]]);
  }
  instances(scene, 'Measured trunks', new T.CylinderGeometry(0.72, 1, 1, 6), bark, trunks);
  instances(scene, 'Tree branches', new T.CylinderGeometry(0.35, 1, 1, 5), bark, branches);
  const geo = new T.IcosahedronGeometry(1, 1),
    p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      r = 0.95 + 0.1 * Math.sin(x * 23 + y * 11 + z * 19);
    p.setXYZ(i, x * r, y * r, z * r);
  }
  geo.computeVertexNormals();
  instances(scene, 'Layered tree crowns', geo, canopy, leaves);
  const leaf = canvasMap(128, 128, (g, w, h) => {
    for (let j = 0; j < 780; j++) {
      const t = rng() * Math.PI * 2,
        d = Math.sqrt(rng());
      let x = 64 + Math.cos(t) * 55 * d,
        y = 64 + Math.sin(t) * 54 * d;
      g.fillStyle = 'hsl(65 12% ' + (59 + rng() * 40) + '%)';
      g.beginPath();
      g.ellipse(x, y, 2 + rng() * 4, 1 + rng() * 2, t, 0, Math.PI * 2);
      g.fill();
    }
  });
  instances(
    scene,
    'Outer leaf sprays',
    new T.PlaneGeometry(),
    new T.MeshStandardMaterial({
      map: leaf,
      alphaTest: 0.36,
      roughness: 0.96,
      emissive: 0x263622,
      emissiveIntensity: 0.45,
      side: T.DoubleSide,
    }),
    cards,
  );
}
