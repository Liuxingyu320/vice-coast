import * as T from 'three';
import { instances, canvasMap } from './primitives.js';
export function buildFurniture(scene, streets, terrain, data, glow, passable) {
  const steel = [],
    rail = [],
    white = [],
    green = [],
    dark = [],
    lamp = [],
    beads = [[], [], []],
    signs = [],
    boxes = [],
    faces = [],
    pools = [],
    cones = [],
    glowPositions = [];
  const pole = (rows, x, y, h, w, base = 0, col) =>
    rows.push([x, terrain(x, y) + base + h / 2, -y, w, h, w, 0, col]);
  const put = (rows, x, y, z, w, h, d, ang = 0, col) => rows.push([x, z, -y, w, h, d, ang, col]);
  const signals = streets.sites.filter((s) => s.kind === 'traffic_signals');
  for (const s of signals) {
    const dx = Math.sin(s.heading),
      dy = Math.cos(s.heading),
      side = s.width * 0.5 + 0.38;
    const x = s.x + dy * side,
      y = s.y - dx * side,
      g = terrain(x, y);
    pole(steel, x, y, 5.15, 0.145);
    put(steel, x - dy * 1.65, y + dx * 1.65, g + 4.99, 3.6, 0.11, 0.12, -s.heading);
    const bx = x - dy * 3.1,
      by = y + dx * 3.1;
    put(dark, bx, by, g + 4.85, 1.48, 0.45, 0.27, -s.heading);
    for (let k = 0; k < 3; k++)
      put(
        beads[k],
        bx + dy * (k - 1) * 0.45 - dx * 0.16,
        by - dx * (k - 1) * 0.45 - dy * 0.16,
        g + 4.85,
        0.29,
        0.29,
        0.095,
        -s.heading,
      );
    put(signs, x - dy * 0.94, y + dx * 0.94, g + 4.52, 1.22, 0.38, 0.09, -s.heading);
  }
  for (const r of streets.roads) {
    if (r.width < 5 || r.length < 20) continue;
    for (let t = 15; t < r.length; t += Math.max(25, r.width * 2.8)) {
      const s = r.segments.find((q) => q.start + q.len >= t);
      if (!s) continue;
      const a = Math.atan2(s.dx, s.dy),
        side = r.width / 2 + 0.46,
        x = s.x + s.dx * (t - s.start) + s.dy * side,
        y = s.y + s.dy * (t - s.start) - s.dx * side,
        g = terrain(x, y);
      if (streets.onRoad(x, y, 0.08)) continue;
      pole(steel, x, y, 6.25, 0.105);
      put(steel, x - s.dy * 0.68, y + s.dx * 0.68, g + 6.16, 1.48, 0.075, 0.07, -a);
      put(dark, x - s.dy * 1.38, y + s.dx * 1.38, g + 6.12, 0.55, 0.1, 0.31, -a);
      put(lamp, x - s.dy * 1.38, y + s.dx * 1.38, g + 6.04, 0.48, 0.065, 0.25, -a);
      glowPositions.push(x - s.dy * 1.38, g + 5.98, -y - s.dx * 1.38);
      const hx = x - s.dy * 1.38,
        hy = y + s.dx * 1.38;
      cones.push([hx, g + 3.09, -hy, 4.7, 5.85, 4.7]);
      pools.push([hx, terrain(hx, hy) + 0.154, -hy, 6.9, 1, 8.8, -a]);
      const crossingClear = !streets.sites.some((q) => {
        const vx = q.x - x - 1.8 * s.dx,
          vy = q.y - y - 1.8 * s.dy;
        return Math.abs(vx * s.dx + vy * s.dy) < 4.6 && Math.abs(vx * s.dy - vy * s.dx) < q.width / 2 + 1.9;
      });
      if (
        r.width >= 7 &&
        crossingClear &&
        [0, 0.6, 1.2, 1.8, 2.4, 3, 3.6].every((t) => !streets.onRoad(x + s.dx * t, y + s.dy * t, 0.12))
      ) {
        for (let j = 0; j < 3; j++) {
          const xx = x + s.dx * (j * 1.8),
            yy = y + s.dy * (j * 1.8);
          pole(white, xx, yy, 0.78, 0.08);
          pole(green, xx, yy, 0.25, 0.087, 0.43);
        }
        for (const h of [0.43, 0.7]) put(rail, x + s.dx * 1.8, y + s.dy * 1.8, g + h, 0.06, 0.07, 3.55, -a);
        pole(white, x - s.dy * (r.width + 0.8), y + s.dx * (r.width + 0.8), 0.8, 0.11);
        pole(lamp, x - s.dy * (r.width + 0.8), y + s.dx * (r.width + 0.8), 0.12, 0.118, 0.57);
      }
    }
  }
  const machineMap = canvasMap(256, 384, (g) => {
    g.fillStyle = '#eee9dd';
    g.fillRect(0, 0, 256, 384);
    g.fillStyle = '#172335';
    g.fillRect(12, 20, 232, 238);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        const x = 22 + col * 28,
          y = 38 + row * 70;
        g.fillStyle = ['#efc35d', '#b42631', '#4994bd', '#78a87c', '#f0eee0'][(col + row) % 5];
        g.fillRect(x, y, 15, 39);
        g.fillStyle = '#f4eee0';
        g.fillRect(x + 3, y - 4, 9, 6);
        g.fillRect(x, y + 16, 15, 6);
      }
      g.fillStyle = '#aebbc2';
      g.fillRect(18, 83 + row * 70, 220, 4);
    }
    g.fillStyle = '#b1353c';
    g.font = 'bold 22px sans-serif';
    g.fillText('つめた〜い', 17, 296);
    g.fillStyle = '#202b33';
    g.fillRect(68, 331, 119, 28);
    g.fillRect(207, 275, 27, 46);
  });
  const roadSignMap = canvasMap(160, 48, (g) => {
    g.fillStyle = '#e7eae6';
    g.fillRect(0, 0, 160, 48);
    g.fillStyle = '#365565';
    g.textAlign = 'center';
    g.font = 'bold 20px sans-serif';
    g.fillText('芝公園・大門', 80, 31);
  });
  const panel = new T.PlaneGeometry();
  for (const [x0, y0] of [
    [408, -80],
    [324, -66],
    [49, -275],
    [412, -477],
    [605, -150],
    [688, -175],
    [781, -185],
    [831, -198],
  ]) {
    const s = streets.nearest(x0, y0),
      dx = Math.sin(s.heading),
      dy = Math.cos(s.heading);
    for (const side of [1, -1]) {
      const off = side * (s.width / 2 + 1.9);
      const bank = [0, 1.26, 2.42].map((u) => [s.x + dy * off + dx * u, s.y - dx * off + dy * u]);
      if (bank.some(([x, y]) => streets.onRoad(x, y, 0.53) || !passable(x, y))) continue;
      const yaw = Math.atan2(-side * dy, side * dx);
      bank.forEach(([x, y], i) => {
        const g = terrain(x, y) + 0.205;
        if (i === 2) {
          put(boxes, x, y, g + 0.43, 0.52, 0.86, 0.45, yaw, '#839895');
          put(dark, x - side * dy * 0.225, y + side * dx * 0.225, g + 0.71, 0.27, 0.09, 0.04, yaw);
        } else {
          put(boxes, x, y, g + 1.02, 1.14, 2.04, 0.77, yaw, i ? '#9d3440' : '#355c7c');
          put(faces, x - side * dy * 0.392, y + side * dx * 0.392, g + 1.02, 1.05, 1.9, 1, yaw);
        }
      });
      break;
    }
  }
  const box = new T.BoxGeometry(),
    std = (color, metalness = 0) => new T.MeshStandardMaterial({ color, metalness, roughness: 0.6 });
  instances(scene, 'Signal and lamp steel', box, std('#97a1a0', 0.38), steel);
  instances(scene, 'Guard rails', box, std('#c5d3c4'), rail);
  instances(scene, 'Reflector posts', box, std('#dad8c7'), white);
  instances(scene, 'Green rail bands', box, std('#3d8063'), green);
  instances(scene, 'Signal housings', box, std('#263536'), dark);
  const lit = new T.MeshStandardMaterial({ color: '#f1dbad', emissive: '#ffbb65' });
  instances(scene, 'Lanterns & reflectors', box, lit, lamp);
  const signalMats = ['#2bdba8', '#ffd564', '#ff483e'].map(
    (c) => new T.MeshStandardMaterial({ color: c, emissive: c }),
  );
  beads.forEach((v, i) =>
    instances(scene, 'Signal bulbs ' + i, new T.SphereGeometry(0.5, 8, 6), signalMats[i], v),
  );
  instances(scene, 'Intersection nameplates', box, new T.MeshStandardMaterial({ map: roadSignMap }), signs);
  instances(scene, 'Vending cabinets', box, std('white'), boxes);
  const vending = new T.MeshStandardMaterial({
    map: machineMap,
    emissiveMap: machineMap,
    emissive: '#fff2e4',
    side: T.DoubleSide,
  });
  instances(scene, 'Drink displays', panel, vending, faces);
  const poolMat = new T.MeshBasicMaterial({
    color: '#ffbe78',
    map: glow,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  const coneMat = new T.MeshBasicMaterial({
    color: '#ffc787',
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.FrontSide,
  });
  coneMat.onBeforeCompile = (sh) => {
    sh.vertexShader =
      'varying float beamFalloff;\n' +
      sh.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nbeamFalloff=smoothstep(-.5,.35,position.y)*(1.-smoothstep(.18,.5,position.y))*(1.-smoothstep(55.,135.,-mvPosition.z));',
      );
    sh.fragmentShader =
      'varying float beamFalloff;\n' +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a*=beamFalloff;',
      );
  };
  instances(scene, 'Downward streetlight haze', new T.ConeGeometry(0.5, 1, 12, 6, true), coneMat, cones);
  instances(scene, 'Warm light on asphalt', new T.PlaneGeometry().rotateX(-Math.PI / 2), poolMat, pools);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(glowPositions, 3));
  const halo = new T.PointsMaterial({
    color: '#ffac55',
    map: glow,
    size: 2.4,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  scene.add(new T.Points(geo, halo));
  return (time, amount) => {
    lit.emissiveIntensity = amount * 2.5;
    halo.opacity = amount * 0.68;
    vending.emissiveIntensity = 0.2 + amount * 0.95;
    poolMat.opacity = amount * 0.43;
    coneMat.opacity = amount * 0.028;
    const phase = time % 13;
    signalMats.forEach(
      (m, i) => (m.emissiveIntensity = i === (phase < 7 ? 0 : phase < 8.5 ? 1 : 2) ? 2.8 : 0.05),
    );
  };
}
