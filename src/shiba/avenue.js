import * as T from 'three';
import frontages from '../../assets/shiba-frontages.json';
import { instances, canvasMap } from './primitives.js';
import { addUnderstory } from './understory.js';
import { buildCityDetail } from './city-detail.js';
import { makeShopAtlas, brands, cells } from './shop-atlas.js';

// A placement frame has local X along a frontage and local Z facing the street.
export async function furnishAvenue(scene, streets, ground, passable, fixtures) {
  const shelters = [],
    cubes = [],
    cylinders = [],
    cones = [],
    rings = [],
    balls = [],
    cards = [];
  const inventory = {
    frontages: frontages.length,
    benches: 0,
    shelters: 0,
    bicycles: 0,
    gantries: 0,
  };
  const loc = (x, y, nx, ny) => ({ x, y, z: ground(x, y) + 0.14, yaw: Math.atan2(nx, -ny) });
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
  function slat(o, u, v, z, w, h, d, col) {
    box(o, u, v, z, w, h, d, col);
  }
  // Each repeated bay is mounted to a surveyed wall normal; the parapet and jambs conceal the photo at grade.
  for (const [i, [x, y, nx, ny, width, seed, owner, lobby]] of frontages.entries()) {
    const o = loc(x, y, nx, ny),
      kind = (seed + Math.floor(i / 2) * 3) % brands.length,
      ink = brands[kind][2],
      w = Math.min(width, 9.8),
      closed = !lobby && i % 13 === 8;
    const edgeLevels = [-w / 2, 0, w / 2].map((u) => {
      const [xx, yy] = P(o, u, 0.32);
      return ground(xx, yy);
    });
    const bottom = Math.min(...edgeLevels) - 0.16;
    o.z = Math.max(...edgeLevels) + 0.14;
    const foundationDepth = o.z - bottom;
    box(o, 0, 0.18, -foundationDepth / 2, w, foundationDepth, 0.36, '#59605e');
    box(o, 0, 0.12, 1.88, w, 3.76, 0.2, '#3f4542');
    face(
      o,
      0,
      0.228,
      1.57,
      w - 0.2,
      2.88,
      closed ? cells.closed : lobby ? 28 : kind,
      closed ? 0.02 : lobby ? 0.23 : 0.31,
    );
    // Physical reveals and door hardware stay in front of recessed interior glazing.
    for (const u of [-w * 0.48, w * 0.48]) box(o, u, 0.32, 1.52, 0.11, 2.95, 0.23, '#414b4d');
    box(o, 0, 0.34, 2.6, w - 0.2, 0.052, 0.13, '#777e7c');
    box(o, 0, 0.31, 0.35, w - 0.2, 0.07, 0.14, '#636d69');
    if (!closed) {
      box(o, w * 0.16, 0.32, 1.52, 0.055, 2.95, 0.16, '#687273');
      for (const z of [1.0, 1.41]) box(o, w * 0.18, 0.44, z, 0.038, 0.036, 0.14, '#8c9693');
      box(o, w * 0.18, 0.5, 1.205, 0.036, 0.45, 0.035, '#a8b0a9');
    }
    box(o, 0, 0.28, 0.12, w, 0.24, 0.24, '#626761');
    for (const u of [-w * 0.49, -w * 0.16, w * 0.49]) box(o, u, 0.3, 1.6, 0.072, 2.96, 0.12, '#7c8785');
    box(o, 0, 0.33, 3.37, w, 0.72, 0.3, '#4c514c');
    face(o, 0, 0.494, 3.37, w - 0.1, 0.64, lobby ? 29 : 7 + kind, lobby ? 0.25 : 0.88);
    if (lobby) {
      for (const u of [-w * 0.46, w * 0.46]) box(o, u, 0.29, 1.88, 0.26, 3.73, 0.31, '#565955');
      box(o, 0, 0.49, 3.79, w, 0.13, 0.75, '#858880');
    } else if (i % 3 !== 0) {
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
    if (!lobby && i % 3 === 1) {
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
  function bench(o, u = 0, v = 0) {
    inventory.benches++;
    for (let j = 0; j < 4; j++) slat(o, u, v + j * 0.12, 0.48, 1.72, 0.075, 0.1, '#946d4c');
    for (const j of [0.7, 0.9]) slat(o, u, v - 0.11, j, 1.74, 0.15, 0.07, '#926d4d');
    for (const s of [-0.64, 0.64]) {
      const [xx, yy] = P(o, u + s, v + 0.16),
        foot = ground(xx, yy) + o.lift - o.z - 0.012;
      box(o, u + s, v + 0.16, (0.48 + foot) / 2, 0.095, 0.48 - foot, 0.49, '#454f4c');
      box(o, u + s, v - 0.13, 0.64, 0.07, 0.65, 0.07, '#485250');
    }
  }
  function bike(o, u, v) {
    inventory.bicycles++;
    const tire = '#394042',
      metal = '#8e9c9b';
    const [bx, by] = P(o, u, v);
    o = { ...o, x: bx, y: by, z: ground(bx, by) + o.lift };
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
  for (const [kind, id, x, y, nx, ny, lift, label, hasBench] of fixtures.amenities) {
    const o = { ...loc(x, y, nx, ny), z: ground(x, y) + lift, lift };
    if (kind === 'bench') {
      bench(o);
      continue;
    }
    if (kind === 'bikes') {
      for (const u of [-1.86, 0, 1.86]) bike(o, u, 0);
      continue;
    }
    if (kind === 'post') {
      post(o, 0, 0, 0.37, 0.17, 0.74, 0.17, '#565f5a');
      box(o, 0, 0, 0.99, 0.53, 0.74, 0.46, '#b64032');
      box(o, 0, 0.235, 1.15, 0.35, 0.061, 0.026, '#443c37');
      continue;
    }
    if (kind === 'stopPole') {
      post(o, 0, 0, 1.1, 0.078, 2.24, 0.078, '#737d7c');
      box(o, 0, 0, 1.58, 0.47, 0.94, 0.08, '#e1dfce');
      face(o, 0, 0.044, 1.58, 0.45, 0.92, 25, 0.08);
      continue;
    }
    if (kind !== 'shelter') continue;
    inventory.shelters++;
    for (const u of [-2.3, 2.3]) {
      const [xx, yy] = P(o, u, -0.36),
        support = ground(xx, yy) + lift,
        top = o.z + 2.64;
      post(o, u, -0.36, (support + top) / 2 - o.z, 0.095, top - support, 0.095, '#667676');
      box(o, u, -0.18, 2.54, 0.09, 0.12, 1.68, '#677676');
    }
    part(shelters, o, 0.35, -0.39, 1.39, 3.05, 2.19, 0.032, '#b4cbd1');
    box(o, 0, -0.1, 2.67, 5.1, 0.16, 1.9, '#758582');
    box(o, -1.73, -0.3, 1.4, 1.11, 2.18, 0.14, '#455355');
    face(o, -1.73, -0.21, 1.4, 1, 2.03, 25, 0.12);
    if (hasBench) bench(o, 0.48, -0.2);
  }
  for (const [index, [x, y, z, dx, dy]] of fixtures.gantries.entries()) {
    const o = { ...loc(x, y, -dy, dx), z };
    inventory.gantries++;
    post(o, 0, 0, 3.65, 0.24, 7.3, 0.24, '#83908d');
    box(o, 0, 2.72, 7.14, 0.18, 0.19, 5.6, '#879392');
    box(o, 0, 3.3, 6.22, 0.2, 1.76, 4.35, '#5c666b');
    for (const [side, lines] of fixtures.guideFaces[index].entries()) {
      if (!lines.length) continue;
      const direction = side ? -1 : 1;
      const map = canvasMap(768, 296, (g) => {
        g.fillStyle = '#24558b';
        g.fillRect(0, 0, 768, 296);
        g.strokeStyle = '#c5d4dc';
        g.lineWidth = 4;
        g.strokeRect(9, 9, 750, 278);
        for (const [i, [arrow, japanese, roman]] of lines.entries()) {
          const y = lines.length === 1 ? 114 : 66 + i * 123;
          g.fillStyle = '#f0f3ee';
          g.font = 'bold 76px sans-serif';
          g.fillText(arrow, 27, y + 23);
          g.font = '600 51px sans-serif';
          g.fillText(japanese, 135, y + 11);
          g.font = '28px sans-serif';
          g.fillText(roman, 139, y + 49);
        }
      });
      const [X, Y] = P(o, direction * 0.111, 3.3),
        yaw = o.yaw + (direction * Math.PI) / 2;
      instances(
        scene,
        'Route guide ' + index + ' ' + side,
        new T.PlaneGeometry(),
        new T.MeshStandardMaterial({ map, roughness: 0.79 }),
        [[X, z + 6.22, -Y, 4.23, 1.64, 1, yaw]],
      );
    }
  }
  const detail = buildCityDetail({
    scene,
    part,
    cubes,
    cylinders,
    balls,
    cones,
    rings,
    loc,
    ground,
    box,
    post,
    face,
    bike,
    shelters,
  });
  Object.assign(inventory, detail.counts);
  addUnderstory(scene, detail.shrubRows);
  const steel = new T.MeshStandardMaterial({ roughness: 0.71, metalness: 0.06 });
  instances(
    scene,
    'Avenue • joinery, shop fittings and street furniture',
    new T.BoxGeometry(),
    steel,
    cubes,
    true,
  );
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
  const chart = await makeShopAtlas(),
    evening = { value: 0.75 };
  function panels(name, list) {
    const geo = new T.PlaneGeometry();
    geo.setAttribute(
      'chartCell',
      new T.InstancedBufferAttribute(
        Float32Array.from(list.flatMap((p) => [p.chart % 4, 7 - Math.floor(p.chart / 4), p.glow])),
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
          '#include <uv_vertex>\nvMapUv=(chartCell.xy+vec2(.004)+uv*.992)/vec2(4.,8.);signLight=chartCell.z;',
        );
      sh.fragmentShader =
        'varying float signLight;uniform float streetEvening;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*signLight*(.18+streetEvening*1.5);',
        );
    };
    const mesh = instances(
      scene,
      name,
      geo,
      mat,
      list.map((p) => p.row),
    );
    mesh.userData.grid = [4, 8];
  }
  panels('Avenue • interior glazing, signage and displays', cards);
  return {
    inventory,
    update(amount, time) {
      detail.update(amount, time);
      evening.value = amount;
    },
  };
}
