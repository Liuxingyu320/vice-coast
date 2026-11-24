import * as T from 'three';
import frontages from '../../assets/shiba-frontages.json';
import { instances } from './primitives.js';
import { makeShopAtlas, brands, cells } from './shop-atlas.js';

// A placement frame has local X along a frontage and local Z facing the street.
export function furnishAvenue(scene, streets, ground, passable) {
  const shelters = [],
    cubes = [],
    cylinders = [],
    cones = [],
    rings = [],
    balls = [],
    cards = [],
    decals = [];
  const inventory = {
    frontages: frontages.length,
    benches: 0,
    shelters: 0,
    bicycles: 0,
    gantries: 0,
    stoneLanterns: 0,
  };
  const loc = (x, y, nx, ny) => ({ x, y, z: ground(x, y) + 0.202, yaw: Math.atan2(nx, -ny) });
  const P = (o, u, v) => [
    o.x + Math.cos(o.yaw) * u + Math.sin(o.yaw) * v,
    o.y + Math.sin(o.yaw) * u - Math.cos(o.yaw) * v,
  ];
  function part(list, o, u, v, z, w, h, d, col, turn = 0, pitch = 0, roll = 0) {
    const [x, y] = P(o, u, v);
    list.push([x, o.z + z, -y, w, h, d, o.yaw + turn, col, pitch, roll]);
  }
  const box = (...a) => part(cubes, ...a),
    post = (...a) => part(cylinders, ...a);
  function face(o, u, v, z, w, h, chart, glow = 0, turn = 0) {
    const [x, y] = P(o, u, v);
    cards.push({ row: [x, o.z + z, -y, w, h, 1, o.yaw + turn], chart, glow });
  }
  function flat(o, u, v, w, h, chart, alt = 0.025) {
    const [x, y] = P(o, u, v);
    decals.push({ row: [x, ground(x, y) + alt, -y, w, h, 1, o.yaw, undefined, -Math.PI / 2], chart, glow: 0 });
  }
  function slat(o, u, v, z, w, h, d, col) {
    box(o, u, v, z, w, h, d, col);
  }
  // Each repeated bay is mounted to a surveyed wall normal; the parapet and jambs conceal the photo at grade.
  for (const [i, [x, y, nx, ny, width, seed]] of frontages.entries()) {
    const o = loc(x, y, nx, ny),
      kind = (seed + Math.floor(i / 2) * 3) % brands.length,
      ink = brands[kind][2],
      w = Math.min(width, 9.8),
      closed = i % 13 === 8;
    box(o, 0, 0.13, 1.89, w, 3.75, 0.24, '#4c5351');
    face(o, 0, 0.265, 1.51, w - 0.19, 2.88, closed ? cells.closed : kind, closed ? 0.04 : 0.53);
    box(o, 0, 0.28, 0.12, w, 0.24, 0.24, '#626761');
    for (const u of [-w * 0.49, -w * 0.16, w * 0.49]) box(o, u, 0.3, 1.6, 0.072, 2.96, 0.12, '#7c8785');
    box(o, 0, 0.33, 3.37, w, 0.72, 0.3, '#4c514c');
    face(o, 0, 0.494, 3.37, w - 0.1, 0.64, 7 + kind, 0.88);
    if (i % 3 !== 0) {
      box(o, 0, 0.62, 2.91, w + 0.07, 0.12, 0.98, ink, 0, 0.105);
      box(o, 0, 1.06, 2.76, w + 0.06, 0.22, 0.085, ink);
      if (kind === 1 || kind === 6) {
        for (let j = 0; j < 6; j++) {
          const u = (j - 2.5) * w * 0.142;
          box(o, u, 1.07, 2.4, w * 0.132, 0.6, 0.042, j % 3 ? '#444c52' : '#865047');
        }
        part(balls, o, w * 0.39, 0.88, 1.99, 0.29, 0.48, 0.29, '#ba513e');
        for (const z of [1.78, 2.2]) post(o, w * 0.39, 0.88, z, 0.23, 0.056, 0.23, '#383a37');
      }
    }
    if (i % 3 === 1) {
      const u = w * 0.41;
      box(o, u, 0.78, 3.49, 0.16, 1.68, 0.72, '#4e5554');
      for (const side of [-1, 1])
        face(o, u + side * 0.087, 0.78, 3.49, 0.68, 1.58, 14 + kind, 0.98, (side * Math.PI) / 2);
    }
    if (i % 4 === 0) {
      const u = -w * 0.36;
      box(o, u, 0.37, 0.5, 0.86, 0.63, 0.46, '#a3a79c');
      face(o, u, 0.613, 0.5, 0.79, 0.54, cells.ac, 0.03);
      post(o, u + 0.46, 0.32, 0.62, 0.06, 1.02, 0.06, '#8b8d83');
    }
  }
  // Roadside placements follow the shoulder at each anchor. Off-road checks exclude intersecting carriageways.
  function shoulder(x, y, side = 1, extra = 1.6) {
    const s = streets.nearest(x, y),
      dx = Math.sin(s.heading),
      dy = Math.cos(s.heading);
    const nx = side * dy,
      ny = -side * dx,
      off = s.width / 2 + extra;
    const xx = s.x + nx * off,
      yy = s.y + ny * off;
    if (streets.onRoad(xx, yy, 0.05) || !passable(xx, yy)) return null;
    if ([2.8, 5, 7.5, 10].some((d) => streets.onRoad(xx + nx * d, yy + ny * d))) return null;
    return loc(xx, yy, -nx, -ny);
  }
  function choose(x, y, side, extra) {
    for (const delta of [0, 3, -3, 7, -7, 12, -12, 18, -18]) {
      const o = shoulder(x + delta, y + delta * 0.3, side, extra);
      if (o) return o;
    }
  }
  function bench(o, u = 0, v = 0) {
    inventory.benches++;
    for (let j = 0; j < 4; j++) slat(o, u, v + j * 0.12, 0.48, 1.72, 0.075, 0.1, '#946d4c');
    for (const j of [0.7, 0.9]) slat(o, u, v - 0.11, j, 1.74, 0.15, 0.07, '#926d4d');
    for (const s of [-0.64, 0.64]) {
      box(o, u + s, v + 0.16, 0.24, 0.095, 0.48, 0.49, '#454f4c');
      box(o, u + s, v - 0.13, 0.64, 0.07, 0.65, 0.07, '#485250');
    }
  }
  function bin(o, u, v) {
    box(o, u, v, 0.43, 0.45, 0.86, 0.44, '#586763');
    box(o, u, v, 0.88, 0.48, 0.055, 0.46, '#9ca59c');
    box(o, u, v + 0.228, 0.7, 0.28, 0.095, 0.018, '#202d30');
  }
  function fixturePoint(x, y, side, extra) {
    return choose(x, y, side, extra) || choose(x, y, -side, extra);
  }
  for (const [k, [x, y]] of [
    [46, -298],
    [55, -238],
    [78, -179],
    [79, -136],
    [74, -95],
    [133, -332],
    [224, -342],
    [321, -330],
    [398, -266],
    [407, -200],
    [424, -145],
  ].entries()) {
    const o = fixturePoint(x, y, k % 2 ? 1 : -1, 2.45);
    if (!o) continue;
    bench(o);
    bin(o, 1.42, 0.18);
    if (k % 2 === 0) {
      for (const u of [-1, 1]) post(o, u - 2.6, -0.18, 1.02, 0.081, 2.04, 0.081, '#536059');
      box(o, -2.6, -0.18, 1.38, 2.18, 1.27, 0.13, '#596259');
      face(o, -2.6, -0.106, 1.38, 2.08, 1.16, cells.guide, 0.15);
    }
    // Individual granite courses follow the slope at the lawn edge.
    for (let j = 0; j < 11; j++) {
      const [xx, yy] = P(o, (j - 5) * 0.76, -0.98);
      if (!passable(xx, yy) || streets.onRoad(xx, yy, 0.1)) continue;
      const v = { ...o, x: xx, y: yy, z: ground(xx, yy) };
      box(v, 0, 0, 0.23, 0.75, 0.46, 0.38, j % 3 ? '#747b74' : '#80857c');
      box(v, 0, 0, 0.49, 0.76, 0.1, 0.42, '#9a9d90');
    }
    if (k % 3 === 0) {
      inventory.stoneLanterns++;
      const u = 3.18;
      box(o, u, -0.12, 0.13, 0.73, 0.26, 0.72, '#828577');
      post(o, u, -0.12, 0.57, 0.32, 0.72, 0.32, '#777d74');
      box(o, u, -0.12, 1.01, 0.59, 0.17, 0.58, '#8e9385');
      box(o, u, -0.12, 1.27, 0.43, 0.39, 0.43, '#a29c80');
      for (const s of [-1, 1]) box(o, u + s * 0.2, -0.12, 1.27, 0.07, 0.43, 0.46, '#6c716b');
      part(cones, o, u, -0.12, 1.64, 0.92, 0.4, 0.92, '#737a72', Math.PI / 4);
      part(balls, o, u, -0.12, 1.91, 0.22, 0.26, 0.22, '#777c73');
    }
  }
  function bike(o, u, v) {
    inventory.bicycles++;
    const tire = '#394042',
      metal = '#8e9c9b';
    const [bx, by] = P(o, u, v);
    o = { ...o, x: bx, y: by, z: ground(bx, by) + 0.207 };
    u = 0;
    v = 0;
    for (const q of [-0.56, 0.56]) {
      part(rings, o, q, 0, 0.315, 0.62, 0.62, 0.62, tire);
      for (let j = 0; j < 6; j++)
        part(cubes, o, q, 0, 0.315, 0.011, 0.54, 0.011, metal, 0, 0, (j * Math.PI) / 6);
    }
    function tube(x0, z0, x1, z1, r, col) {
      const dx = x1 - x0,
        dz = z1 - z0;
      part(
        cylinders,
        o,
        (x0 + x1) / 2,
        0,
        (z0 + z1) / 2,
        r,
        Math.hypot(dx, dz),
        r,
        col,
        0,
        0,
        -Math.atan2(dx, dz),
      );
    }
    const paint = ['#426366', '#62483f', '#566576'][Math.abs(Math.round(bx)) % 3];
    for (const [x0, z0, x1, z1] of [
      [-0.56, 0.315, -0.16, 0.36],
      [-0.56, 0.315, -0.22, 0.86],
      [-0.22, 0.86, -0.16, 0.36],
      [-0.16, 0.36, 0.38, 0.8],
      [-0.22, 0.79, 0.34, 0.68],
    ])
      tube(x0, z0, x1, z1, 0.036, paint);
    tube(0.56, 0.315, 0.37, 0.8, 0.035, metal);
    tube(0.37, 0.8, 0.34, 1.02, 0.031, metal);
    box(o, -0.22, 0, 0.88, 0.25, 0.067, 0.14, tire);
    box(o, 0.34, 0, 1.02, 0.04, 0.04, 0.42, metal);
    box(o, -0.55, 0, 0.7, 0.44, 0.035, 0.16, metal);
    for (const side of [-1, 1]) box(o, 0.52, side * 0.13, 0.77, 0.3, 0.11, 0.014, '#82908c');
    box(o, 0.52, 0, 0.716, 0.3, 0.018, 0.27, '#737f7c');
  }
  for (const [k, [x, y]] of [
    [29, -313],
    [49, -241],
    [400, -206],
    [454, -150],
    [572, -165],
    [679, -176],
    [756, -185],
    [860, -184],
    [820, -168],
  ].entries()) {
    const o = fixturePoint(x, y, 1, 2.16);
    if (!o) continue;
    for (let j = 0; j < 3; j++) bike(o, j * 1.91 - 1.85, -0.12);
    box(o, 3.6, -0.08, 0.69, 0.82, 1.38, 0.54, '#667872');
    for (const side of [-1, 1]) {
      box(o, 3.6, -0.08 + side * 0.275, 0.69, 0.73, 1.23, 0.033, '#82908a');
      for (let j = 0; j < 5; j++)
        box(o, 3.6, -0.08 + side * 0.3, 0.34 + 0.055 * j, 0.57, 0.021, 0.023, '#515e5b');
      box(o, 3.85, -0.08 + side * 0.3, 0.88, 0.028, 0.114, 0.026, '#485553');
    }
    if (k % 2 === 0) {
      post(o, -3.0, 0, 0.44, 0.17, 0.88, 0.17, '#555c58');
      box(o, -3, 0, 0.99, 0.51, 0.69, 0.43, '#b54032');
      box(o, -3, 0.22, 1.13, 0.31, 0.06, 0.035, '#503d38');
      box(o, -3, 0.23, 0.91, 0.15, 0.035, 0.03, '#f2d6b4');
    }
    for (let j = 0; j < 2; j++) {
      const u = 4.58 + j * 0.65;
      box(o, u, 0, 0.035, 0.38, 0.07, 0.38, '#534b42');
      part(cones, o, u, 0, 0.31, 0.34, 0.58, 0.34, '#d66737');
      post(o, u, 0, 0.32, 0.17, 0.096, 0.17, '#e1d5bc');
    }
  }
  for (const [x, y] of [
    [44, -282],
    [403, -207],
    [622, -170],
    [795, -190],
  ]) {
    const o = fixturePoint(x, y, 1, 2.2);
    if (!o) continue;
    inventory.shelters++;
    for (const u of [-2.3, 2.3]) {
      post(o, u, -0.36, 1.32, 0.095, 2.64, 0.095, '#667676');
      box(o, u, -0.18, 2.54, 0.09, 0.12, 1.68, '#677676');
    }
    part(shelters, o, 0.35, -0.39, 1.39, 3.05, 2.19, 0.032, '#b4cbd1');
    box(o, 0, -0.1, 2.67, 5.1, 0.16, 1.9, '#758582');
    box(o, -1.73, -0.3, 1.4, 1.11, 2.18, 0.14, '#455355');
    face(o, -1.73, -0.21, 1.4, 1, 2.03, 25, 1.1);
    bench(o, 0.48, -0.2);
  }
  for (const [x, y, side] of [
    [61, -229, 1],
    [495, -158, -1],
    [733, -181, 1],
  ]) {
    const o = fixturePoint(x, y, side, 1.25);
    if (!o) continue;
    inventory.gantries++;
    post(o, 0, 0, 3.65, 0.24, 7.3, 0.24, '#83908d');
    box(o, 0, 2.72, 7.14, 0.18, 0.19, 5.6, '#879392');
    box(o, 0, 3.3, 6.22, 0.2, 1.76, 4.35, '#5c666b');
    face(o, 0.111, 3.3, 6.22, 4.23, 1.64, 24, 0.26, Math.PI / 2);
    face(o, -0.111, 3.3, 6.22, 4.23, 1.64, 24, 0.26, -Math.PI / 2);
  }
  for (const r of streets.roads)
    for (const s of r.segments) {
      if (r.width < 5.6 || s.len < 7) continue;
      for (let t = 4; t < s.len; t += 15) {
        const x = s.x + s.dx * t,
          y = s.y + s.dy * t;
        const axis =
          (x > 405 && x < 890 && Math.abs(y + 145 + (x - 405) * 0.125) < 44) ||
          (x > -5 && x < 120 && y > -370 && y < -68) ||
          (x > 130 && x < 399 && Math.abs(y + 333) < 20);
        if (!axis) continue;
        const o = loc(x, y, s.dy, -s.dx);
        flat(o, 0, r.width * 0.5 - 0.35, 0.57, 0.34, 27, 0.12);
        if (t === 4) flat(o, 0, 1.24, 0.61, 0.61, 26, 0.12);
      }
    }
  const steel = new T.MeshStandardMaterial({ roughness: 0.71, metalness: 0.06 });
  instances(scene, 'Avenue • joinery, shop fittings and street furniture', new T.BoxGeometry(), steel, cubes);
  instances(scene, 'Avenue • posts', new T.CylinderGeometry(0.5, 0.5, 1, 10), steel, cylinders);
  instances(scene, 'Avenue • cones and stone caps', new T.ConeGeometry(0.5, 1, 8), steel, cones);
  instances(scene, 'Avenue • bicycle wheels', new T.TorusGeometry(0.47, 0.035, 6, 24), steel, rings);
  instances(scene, 'Avenue • paper lanterns and finials', new T.SphereGeometry(0.5, 10, 7), steel, balls);
  instances(
    scene,
    'Avenue • shelter windbreaks',
    new T.BoxGeometry(),
    new T.MeshStandardMaterial({
      transparent: true,
      opacity: 0.23,
      roughness: 0.24,
      metalness: 0.15,
      depthWrite: false,
    }),
    shelters,
  );
  const chart = makeShopAtlas(),
    evening = { value: 0.75 };
  function panels(name, list) {
    const geo = new T.PlaneGeometry();
    geo.setAttribute(
      'chartCell',
      new T.InstancedBufferAttribute(
        Float32Array.from(list.flatMap((p) => [p.chart % 4, 6 - Math.floor(p.chart / 4), p.glow])),
        3,
      ),
    );
    const mat = new T.MeshStandardMaterial({
      map: chart,
      roughness: 0.67,
      metalness: 0.04,
      side: T.DoubleSide,
      alphaTest: 0.35,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.streetEvening = evening;
      sh.vertexShader =
        'attribute vec3 chartCell;varying float signLight;\n' +
        sh.vertexShader.replace(
          '#include <uv_vertex>',
          '#include <uv_vertex>\nvMapUv=(chartCell.xy+vec2(.004)+uv*.992)/vec2(4.,7.);signLight=chartCell.z;',
        );
      sh.fragmentShader =
        'varying float signLight;uniform float streetEvening;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*signLight*(.18+streetEvening*1.5);',
        );
    };
    instances(
      scene,
      name,
      geo,
      mat,
      list.map((p) => p.row),
    );
  }
  panels('Avenue • interior glazing, signage and displays', cards);
  panels('Avenue • ironwork flush with asphalt', decals);
  return {
    inventory,
    update(amount) {
      evening.value = amount;
    },
  };
}
