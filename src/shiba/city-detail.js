import * as T from 'three';
import city from '../../assets/shiba-city-detail.json';
import data from '../../assets/shiba-layout.json';
import { canvasMap, instances } from './primitives.js';

const stone = '#96948b',
  lightStone = '#b1afa4',
  basalt = '#575c5b',
  metal = '#7e8683',
  dark = '#414949',
  silver = '#afb5b0',
  timber = '#765b42';
const stationNames = ['大門駅', '芝公園駅', '芝公園駅'];
function inscriptions() {
  return canvasMap(
    1536,
    1024,
    (g) => {
      const w = 512,
        h = 256;
      function cell(id, bg, paint) {
        g.save();
        g.translate((id % 3) * w, Math.floor(id / 3) * h);
        g.beginPath();
        g.rect(0, 0, w, h);
        g.clip();
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        paint();
        g.restore();
      }
      function type(text, x, y, size, color, font = 'sans-serif') {
        g.font = '600 ' + size + 'px ' + font;
        g.fillStyle = color;
        g.fillText(text, x, y);
      }
      for (let i = 0; i < 3; i++)
        cell(i, '#153b53', () => {
          const lines = i ? ['I 05'] : ['A 09', 'E 20'];
          g.fillStyle = '#eef3ec';
          g.fillRect(0, 0, 512, 9);
          type('都営地下鉄', 18, 43, 23, '#e7eee9');
          type('TOEI SUBWAY', 291, 42, 19, '#c4d6d8');
          type(stationNames[i], 16, 121, 68, '#f1f5e9');
          type(i ? 'Shibakoen Sta.' : 'Daimon Sta.', 18, 159, 25, '#e8eeea');
          lines.forEach((s, k) => {
            const xx = 22 + k * 115;
            g.fillStyle = i ? '#0079c1' : k ? '#b6007a' : '#e85b77';
            g.fillRect(xx, 184, 102, 51);
            type(s, xx + 11, 220, 28, '#fff');
          });
          g.fillStyle = '#f4c149';
          g.fillRect(382, 162, 109, 74);
          type(['A6', 'A3', 'A4'][i], 393, 218, 49, '#15252a');
        });
      cell(3, '#242b2a', () => {
        // The fascia is 5.88 × 0.84 m. Draw in that same 7:1 coordinate system.
        g.scale(1, 3.5);
        g.fillStyle = '#cc4c31';
        g.fillRect(14, 12, 7, 50);
        type('TOKYO TOWER', 34, 44, 43, '#f4f0e5');
        type('FOOT TOWN   /   MAIN ENTRANCE', 36, 63, 12, '#e4c7a1');
      });
      cell(4, '#d8d3c3', () => {
        type('芝公園', 25, 78, 58, '#35594f');
        type('SHIBA PARK', 27, 112, 21, '#36584a');
        g.fillStyle = '#b6c6ab';
        g.fillRect(26, 135, 460, 92);
        g.strokeStyle = '#eee6cf';
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(37, 209);
        g.lineTo(184, 157);
        g.lineTo(295, 184);
        g.lineTo(470, 143);
        g.stroke();
        type('●', 260, 183, 20, '#a44a37');
      });
      cell(5, '#929a99', () => {
        for (let y = 7; y < 252; y += 9) {
          g.fillStyle = '#454f50';
          g.fillRect(7, y, 498, 4);
          g.fillStyle = '#b2b8b3';
          g.fillRect(7, y + 4, 498, 2);
        }
        g.fillStyle = '#84918c';
        for (let x = 0; x < 514; x += 128) g.fillRect(x, 2, 4, 252);
      });
      cell(6, '#252f31', () => {
        g.fillStyle = '#606a65';
        g.fillRect(8, 7, 496, 242);
        for (let x = 12; x < 508; x += 11)
          for (let y = 11; y < 247; y += 10) {
            g.fillStyle = (x + y) % 3 ? '#242d2d' : '#444c47';
            g.fillRect(x, y, 6, 6);
          }
        g.fillStyle = '#8b8e7d';
        g.fillRect(16, 16, 92, 37);
        type('点検', 33, 43, 20, '#363c37');
      });
      cell(7, '#283a37', () => {
        type('資源回収', 32, 107, 62, '#e4e9d5');
        type('びん  ・  缶  ・  PET', 30, 188, 39, '#d6e0ce');
      });
      cell(8, '#234640', () => {
        g.fillStyle = '#f0f1dc';
        g.fillRect(6, 6, 500, 7);
        type('←', 18, 148, 112, '#f9f7dc');
        type('改札口', 147, 137, 78, '#f5f5e8');
        type('Ticket gates', 151, 197, 36, '#e1e6d8');
      });
      cell(9, '#293332', () => {
        type('OFFICE LOBBY', 31, 132, 56, '#b9b09c');
        type('エントランス', 34, 189, 25, '#d8d3bc');
      });
      for (let i = 0; i < 2; i++)
        cell(10 + i, '#182523', () => {
          const col = i ? '#ff6c56' : '#58edb0';
          // The physical signal is taller than it is wide. Fit the icon to that printed aspect.
          g.translate(256, 0);
          g.scale(2.85, 1);
          g.translate(-256, 0);
          g.strokeStyle = col;
          g.fillStyle = col;
          g.lineWidth = 13;
          g.lineCap = 'round';
          g.beginPath();
          g.arc(255, 49, 15, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.moveTo(255, 77);
          g.lineTo(i ? 254 : 248, 132);
          g.moveTo(253, 91);
          g.lineTo(i ? 228 : 218, 124);
          g.moveTo(255, 91);
          g.lineTo(i ? 279 : 289, i ? 125 : 107);
          g.moveTo(248, 131);
          g.lineTo(i ? 241 : 219, 197);
          g.moveTo(253, 131);
          g.lineTo(i ? 267 : 294, 197);
          g.stroke();
        });
    },
    true,
  );
}

export function buildCityDetail(ctx) {
  const { scene, part, cubes, cylinders, balls, cones, rings, loc, ground, box, post, face, bike, shelters } =
    ctx;
  const cards = [],
    lamps = [],
    redLights = [],
    shrubRows = [],
    pedestrians = [];
  const geoBox = new T.BoxGeometry();
  const std = (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.64 });
  function pos(o, u, v) {
    let c = Math.cos(o.yaw),
      s = Math.sin(o.yaw);
    return [o.x + c * u + s * v, o.y + s * u - c * v];
  }
  function label(o, u, v, z, w, h, cell, glow = 0, turn = 0) {
    const p = pos(o, u, v);
    cards.push({ row: [p[0], o.z + z, -p[1], w, h, 1, o.yaw + turn], cell, glow });
  }
  function lamp(o, u, v, z, w, h, d) {
    part(lamps, o, u, v, z, w, h, d, '#fff0cf');
  }
  function strut(o, a, b, r, color) {
    const dir = new T.Vector3(b[0] - a[0], b[2] - a[2], b[1] - a[1]),
      length = dir.length();
    const e = new T.Euler().setFromQuaternion(
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()),
      'YXZ',
    );
    part(
      cylinders,
      o,
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
      r,
      length,
      r,
      color,
      e.y,
      e.x,
      e.z,
    );
  }
  function shoe(o, u, v, top, w, d, color) {
    const corners = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ];
    const low = Math.min(...corners.map(([a, b]) => ground(...pos(o, u + a, v + b)))) - o.z - 0.055;
    box(o, u, v, (top + low) / 2, w, top - low, d, color);
  }
  for (const [owner, kind, x, y, z, nx, ny, w, d, h] of city.roofs) {
    const o = { ...loc(x, y, nx, ny), z };
    if (kind === 'parapet') {
      box(o, 0, 0, h / 2, w, h, d, '#9b9b90');
      box(o, 0, 0, h + 0.026, w + 0.02, 0.052, d + 0.048, '#bec0b5');
      continue;
    }
    if (kind === 'beacon') {
      post(o, 0, 0, 0.28, 0.16, 0.56, 0.16, dark);
      post(o, 0, 0, 0.62, 0.26, 0.19, 0.26, metal);
      part(redLights, o, 0, 0, 0.77, 0.16, 0.23, 0.16, '#e85c46');
      continue;
    }
    for (const dx of [-0.32, 0.32]) box(o, dx * w, 0, 0.092, 0.15, 0.184, d * 0.89, basalt);
    if (kind === 'chiller') {
      box(o, 0, 0, 0.17 + (h - 0.17) / 2, w, h - 0.17, d, '#adb4a9');
      for (const sign of [-1, 1])
        label(o, 0, sign * (d / 2 + 0.007), 0.71, w * 0.91, 0.78, 5, 0, sign < 0 ? Math.PI : 0);
      for (const offset of [-0.253, 0.253]) {
        const D = w * 0.66;
        post(o, 0, d * offset, h + 0.024, D, 0.048, D, '#3f4c48');
        for (const t of [0, 0.79, 1.57, 2.35])
          box(o, 0, d * offset, h + 0.061, D, 0.017, 0.036, '#7d8780', t);
        post(o, 0, d * offset, h + 0.071, 0.15, 0.026, 0.15, '#8e9486');
      }
      strut(o, [w * 0.39, -d * 0.43, 0.19], [w * 0.39, d * 0.42, 0.19], 0.075, '#858476');
    } else if (kind === 'penthouse') {
      box(o, 0, 0, h / 2, w, h, d, '#92958b');
      box(o, 0, 0, h + 0.065, w + 0.16, 0.13, d + 0.16, '#656f6b');
      box(o, -w * 0.18, d / 2 + 0.02, 1.04, 0.86, 2.08, 0.04, '#515b59');
      label(o, w * 0.23, d / 2 + 0.026, 1.47, 0.65, 0.64, 5);
    } else if (kind === 'tank') {
      box(o, 0, 0, 0.31, w, 0.3, d, '#57645f');
      box(o, 0, 0, (h + 0.48) / 2, w * 0.94, h - 0.48, d * 0.92, '#c6c2a9');
      for (let j = -1; j <= 1; j++) {
        box(o, j * w * 0.3, 0, h * 0.61, 0.033, h - 0.48, d * 0.94, '#8e998c');
        box(o, 0, j * d * 0.29, h * 0.61, w * 0.95, h - 0.48, 0.031, '#959885');
      }
      box(o, 0, 0, h + 0.035, w * 0.98, 0.07, d * 0.96, '#b5b39e');
      post(o, w * 0.24, d * 0.17, h + 0.08, 0.59, 0.08, 0.59, '#848d7f');
      strut(o, [w * 0.48, -d * 0.26, 0.1], [w * 0.48, -d * 0.26, h * 0.78], 0.082, metal);
    } else {
      box(o, 0, 0, 0.31, w, 0.3, d, '#8c9793');
      for (const i of [-0.35, 0, 0.35]) box(o, 0, i * d, 0.31, w + 0.04, 0.34, 0.051, metal);
    }
  }
  for (const [k, x, y, nx, ny, w, d, lift, idx] of [...city.street, ...city.plantings]) {
    const o = { ...loc(x, y, nx, ny), z: ground(x, y) + lift };
    if (k === 'lantern') {
      shoe(o, 0, 0, 0.12, w, d, basalt);
      post(o, 0, 0, 0.245, 0.72, 0.25, 0.72, stone);
      post(o, 0, 0, 0.7, 0.29, 0.76, 0.29, stone);
      post(o, 0, 0, 1.1, 0.63, 0.17, 0.63, stone);
      box(o, 0, 0, 1.37, 0.46, 0.4, 0.43, '#655e4b');
      for (const s of [-1, 1])
        for (const t of [-1, 1]) box(o, s * 0.205, t * 0.19, 1.4, 0.06, 0.42, 0.06, lightStone);
      part(cones, o, 0, 0, 1.76, 0.86, 0.35, 0.86, stone);
      post(o, 0, 0, 1.98, 0.22, 0.13, 0.22, lightStone);
      part(balls, o, 0, 0, 2.1, 0.19, 0.2, 0.19, stone);
    } else if (k === 'treeGrate') {
      const r = 0.27;
      for (const s of [-1, 1]) {
        box(o, (s * (w + r * 2)) / 4, 0, 0.014, (w - 2 * r) / 2, 0.027, d, '#555d51');
        box(o, 0, (s * (d + 2 * r)) / 4, 0.017, 2 * r, 0.028, (d - 2 * r) / 2, '#565e53');
        for (let j = -3; j <= 3; j++)
          box(o, (s * (w + r * 2)) / 4, (j * d) / 8, 0.032, (w - 2 * r) * 0.46, 0.008, 0.021, '#2c3731');
        box(o, s * (w / 2 - 0.022), 0, 0.027, 0.044, 0.055, d, basalt);
        box(o, 0, s * (d / 2 - 0.022), 0.027, w, 0.055, 0.044, basalt);
      }
    } else if (k === 'understory' || k === 'mulch' || k === 'hedge') {
      if (k === 'hedge') {
        shoe(o, 0, 0, 0.13, w, d, stone);
      }
      if (k !== 'mulch')
        for (let j = 0; j < (k === 'hedge' ? 5 : 7); j++) {
          const a = j * 2.4 + idx,
            xx = k === 'hedge' ? (j - 2) * w * 0.16 : w * 0.27 * Math.cos(a),
            yy = k === 'hedge' ? 0 : d * 0.27 * Math.sin(a);
          const [px, py] = pos(o, xx, yy);
          const height = k === 'hedge' ? 0.53 : 0.28 + 0.12 * (j % 3);
          shrubRows.push([
            px,
            ground(px, py) + lift + (k === 'hedge' ? 0.12 : 0),
            -py,
            k === 'hedge' ? 0.62 : w * 0.4,
            height,
            k === 'hedge' ? 0.48 : d * 0.37,
            a,
          ]);
        }
    } else if (k === 'parkMap') {
      for (const u of [-0.53, 0.53]) shoe(o, u, 0, 1.88, 0.077, 0.098, timber);
      box(o, 0, 0, 1.29, 1.3, 0.95, 0.1, '#47594d');
      label(o, 0, 0.061, 1.29, 1.23, 0.88, 4);
    } else if (k === 'bollard') {
      shoe(o, 0, 0, 0.06, 0.21, 0.21, basalt);
      post(o, 0, 0, 0.43, 0.145, 0.8, 0.145, '#575e59');
      post(o, 0, 0, 0.71, 0.148, 0.074, 0.148, '#e3b157');
    } else if (k === 'cityBike') {
      bike({ ...o, lift }, 0, 0);
    } else {
      const h = k === 'utility' ? 1.26 : k === 'sorting' ? 0.93 : 0.84;
      shoe(o, 0, 0, 0.09, w, d, basalt);
      box(o, 0, 0, (h + 0.09) / 2, w * 0.95, h - 0.09, d * 0.92, k === 'utility' ? '#808c83' : '#b6b9a8');
      box(o, 0, 0, h, w, 0.058, d, silver);
      if (k === 'utility') {
        label(o, 0, d * 0.47, h * 0.68, w * 0.82, 0.41, 5);
        box(o, w * 0.3, d * 0.48, 0.49, 0.03, 0.18, 0.024, dark);
      } else {
        for (const u of k === 'sorting' ? [-0.28, 0, 0.28] : [0])
          post(o, u, 0, h + 0.034, 0.15, 0.025, 0.15, '#34423b');
        label(o, 0, d * 0.476, h * 0.54, w * 0.82, h * 0.46, 7);
      }
    }
  }
  for (const [id, ax, ay, bx, by, height] of city.templeWalls) {
    const dx = bx - ax,
      dy = by - ay,
      length = Math.hypot(dx, dy),
      o = loc((ax + bx) / 2, (ay + by) / 2, dy / length, -dx / length);
    const count = Math.max(1, Math.ceil(length / 1.12));
    for (let j = 0; j < count; j++) {
      const u = ((j + 0.5) * length) / count - length / 2,
        [x, y] = pos(o, u, 0),
        grade = ground(x, y) - o.z;
      box(o, u, 0, grade + height * 0.5 - 0.17, length / count + 0.006, height + 0.34, 0.245, '#75796e');
      for (let k = 0; k < 3; k++)
        box(
          o,
          u + ((k % 2) - 0.5) * 0.008,
          0,
          grade + ((k + 0.5) * height) / 3,
          length / count - 0.014,
          height / 3 - 0.018,
          0.27,
          k % 2 ? '#888a7f' : '#909085',
        );
      box(o, u, 0, grade + height + 0.042, length / count - 0.006, 0.085, 0.32, '#a7a69a');
    }
  }
  // Shallow root buttresses sit below the surface at their tips, including on sloping park lawns.
  data.trees.forEach(([x, y, z, h, r], i) => {
    const o = { ...loc(x, y, 0, -1), z };
    for (let j = 0; j < 3; j++) {
      const a = i * 2.399 + j * 2.094;
      const along = Math.min(0.46, 0.19 + 0.065 * r);
      const u = Math.cos(a) * along,
        v = Math.sin(a) * along;
      const [px, py] = pos(o, u, v);
      strut(
        o,
        [0, 0, Math.min(0.56, 0.031 * h)],
        [u, v, ground(px, py) - z - 0.025],
        0.078 + Math.min(0.076, r * 0.015),
        '#665848',
      );
    }
  });
  data.stations.forEach((s, i) => {
    const [x, y] = s.mouth,
      [nx, ny] = s.down,
      o = { ...loc(x, y, nx, ny), z: ground(x, y) + s.sillLift };
    const holeW = Math.hypot(s.well[1][0] - s.well[0][0], s.well[1][1] - s.well[0][1]);
    const length = s.length - 0.62,
      width = holeW,
      count = Math.min(17, Math.floor(length / 0.37) - 2),
      tread = 0.32,
      rise = 0.155;
    const landing = length - count * tread;
    const floor = -count * rise;
    for (let j = 0; j < count; j++) {
      const near = 0.08 + j * tread,
        top = -j * rise - 0.015;
      box(
        o,
        0,
        near + tread / 2,
        (top + floor - 0.2) / 2,
        width + 0.018,
        top - floor + 0.2,
        tread,
        j % 2 ? '#93938b' : '#96948b',
      );
      box(o, 0, near + tread - 0.03, top + 0.006, width - 0.035, 0.012, 0.058, '#dfcd99');
      box(o, 0, near + tread + 0.005, top - 0.043, width - 0.035, 0.064, 0.014, '#676a63');
    }
    box(
      o,
      0,
      0.08 + count * tread + landing / 2,
      floor - 0.075,
      width + 0.1,
      0.15,
      landing + 0.014,
      '#a8a494',
    );
    const H = s.shell ? (i === 0 ? 2.8 : 2.77) : 2.67;
    for (const sign of [-1, 1]) {
      const u = sign * (width / 2 + 0.058);
      box(
        o,
        u,
        0.08 + length / 2,
        (0.45 + floor - 0.2) / 2,
        0.145,
        0.45 - floor + 0.2,
        length + 0.16,
        '#9b9c90',
      );
      for (const j of [0, 0.33, 0.67, 1]) {
        const v = 0.19 + j * (length - 0.22);
        shoe(o, u, v, H, 0.085, 0.1, metal);
      }
      part(shelters, o, u, 0.08 + length / 2, 0.82, 0.055, 0.72, length - 0.15, '#b6cec6');
      box(o, u, 0.08 + length / 2, 1.24, 0.095, 0.065, length + 0.06, silver);
      for (let j = 0; j < count; j++) {
        const v = 0.08 + (j + 0.5) * tread;
        if (j % 3 === 0) lamp(o, sign * (width / 2 - 0.02), v, -j * rise + 0.41, 0.021, 0.075, 0.18);
        if (j % 2 === 0)
          box(o, sign * (width / 2 - 0.015), v, -j * rise + 0.64, 0.018, 0.013, tread * 1.79, '#787b72');
      }
      strut(
        o,
        [sign * (width / 2 - 0.105), 0.22, 0.87],
        [sign * (width / 2 - 0.105), count * tread - 0.12, floor + 1.03],
        0.048,
        silver,
      );
      for (const j of [1, 6, 11])
        if (j < count)
          strut(
            o,
            [sign * (width / 2 - 0.105), 0.2 + j * tread, -j * rise],
            [sign * (width / 2 - 0.105), 0.2 + j * tread, -j * rise + 0.9],
            0.033,
            metal,
          );
      lamp(o, sign * (width * 0.38), length * 0.48, H - 0.08, 0.07, 0.035, length * 0.76);
    }
    // A real dog-leg beyond the surveyed surface opening, lit across the back wall.
    const run = 2.65,
      end = length + run;
    box(o, 0, length + run / 2, floor - 0.08, width + 0.13, 0.16, run + 0.26, '#7d827b');
    box(o, 0, length + run / 2, floor + 2.29, width + 0.32, 0.15, run + 0.32, '#aaa99b');
    box(o, -width / 2 - 0.06, length + run / 2, floor + 1.12, 0.13, 2.35, run + 0.3, '#b5b4a7');
    box(o, width / 2 + 0.06, length + 0.52, floor + 1.12, 0.13, 2.35, 1.06, '#acafa2');
    box(o, 0.75, end, floor + 1.12, width + 1.65, 2.35, 0.14, '#a3a89a');
    for (const h of [0.46, 1.46]) box(o, 0.75, end - 0.08, floor + h, width + 1.64, 0.095, 0.025, '#467b79');
    const turnStart = width / 2,
      turnLength = 3.05,
      turnMid = turnStart + turnLength / 2;
    box(o, turnMid, end - 0.75, floor - 0.07, turnLength + 0.18, 0.14, 1.66, '#a49c86');
    box(o, turnMid, end - 0.75, floor + 2.28, turnLength + 0.18, 0.12, 1.66, '#bdb6a3');
    box(o, turnMid, end - 0.03, floor + 1.12, turnLength, 2.34, 0.13, '#b5b39e');
    box(o, turnMid, end - 1.55, floor + 1.12, turnLength, 2.34, 0.13, '#a8ad9c');
    box(o, turnStart + turnLength, end - 0.78, floor + 1.12, 0.13, 2.34, 1.64, '#aaa993');
    for (let j = 0; j < 8; j++) {
      box(
        o,
        0,
        length - landing + (j * (run + landing)) / 8,
        floor + 0.011,
        width - 0.08,
        0.012,
        0.014,
        '#77796c',
      );
    }
    for (const sign of [-1, 1]) {
      for (let j = 0; j < 4; j++) {
        box(
          o,
          sign * (width / 2 - 0.017),
          length * 0.55,
          floor + 0.28 + j * 0.34,
          0.014,
          0.018,
          length * 0.84,
          '#858779',
        );
      }
    }
    for (let j = 0; j < 5; j++) {
      const u = turnStart + 0.3 + j * 0.55;
      box(o, u, end - 0.77, floor + 0.006, 0.014, 0.008, 1.38, '#868674');
    }
    lamp(o, turnMid, end - 0.75, floor + 2.17, 1.68, 0.065, 0.12);
    box(o, turnMid, end - 0.097, floor + 1.34, turnLength, 0.15, 0.035, '#447c77');
    for (let j = 0; j < 6; j++) {
      box(o, 0.75, end - 0.083, floor + 0.19 + j * 0.34, width + 1.59, 0.014, 0.018, '#7b8178');
      box(
        o,
        -width / 2 + 0.012,
        length + run / 2,
        floor + 0.19 + j * 0.34,
        0.017,
        0.014,
        run + 0.21,
        '#949588',
      );
    }
    for (let j = 0; j < 5; j++) {
      box(o, -width * 0.47 + j * width * 0.24, end - 0.086, floor + 1.12, 0.012, 2.26, 0.018, '#8d9185');
    }
    box(o, 0, length - 0.1, floor + 0.013, width - 0.08, 0.025, 0.32, '#d0c5a2');
    box(o, width * 0.35, end - 0.13, floor + 1.21, 1.1, 0.55, 0.035, '#365853');
    label(o, width * 0.35, end - 0.155, floor + 1.21, 1.07, 0.52, 8, 0.19, Math.PI);
    lamp(o, 0, length + 0.86, floor + 2.18, width * 0.81, 0.045, 0.14);
    lamp(o, 0.67, end - 0.095, floor + 1.9, width * 0.78, 0.1, 0.045);
    if (!s.shell) {
      box(o, 0, length / 2, H + 0.08, width + 0.35, 0.16, length + 0.44, '#86958d');
    }
    box(o, 0, 0.04, H - 0.22, width + 0.19, 0.57, 0.17, '#235069');
    label(o, 0, -0.052, H - 0.22, width + 0.06, 0.51, i, 0.35, Math.PI);
    const u = width / 2 + 0.155;
    shoe(o, u, 0.18, 2.51, 0.11, 0.13, metal);
    box(o, u, 0.2, 2.35, 0.1, 0.88, 0.7, '#2c474d');
    label(o, u + 0.058, 0.2, 2.35, 0.65, 0.82, i, 0.26, Math.PI / 2);
  });
  const angles = (-33.72 * Math.PI) / 180,
    nx = -Math.sin(angles),
    ny = Math.cos(angles);
  // The north-east public apron sits below the parking-side level on the opposite façade.
  const ft = { ...loc(0, 0, nx, ny), z: 18.391 };
  for (const u of [-8, -3, 3, 8]) {
    shoe(ft, u, 33.35, 4.58, 0.18, 0.22, silver);
    box(ft, u, 30.9, 4.52, 0.13, 0.2, 5.48, metal);
  }
  box(ft, 0, 31.0, 4.75, 17.6, 0.27, 5.85, '#a6a79c');
  box(ft, 0, 33.95, 4.58, 17.76, 1.03, 0.14, '#394043');
  label(ft, 0, 34.044, 4.57, 5.88, 0.84, 3, 0.85);
  for (let i = -3; i <= 3; i++) {
    const u = i * 2.1;
    part(shelters, ft, u, 28.52, 2.02, 2.02, 3.66, 0.065, '#a3bbb8');
    for (const side of [-0.97, 0.97]) box(ft, u + side, 28.56, 2.02, 0.074, 3.69, 0.12, metal);
    for (const z of [0.48, 2.94]) box(ft, u, 28.54, z, 2.08, 0.052, 0.048, silver);
    box(ft, u + 0.47, 28.58, 1.56, 0.046, 0.61, 0.065, '#c9bb9f');
    lamp(ft, u, 28.62, 3.65, 1.36, 0.043, 0.038);
  }
  for (let u = -7.8; u < 8; u += 1.9) {
    box(ft, u, 28.53, 2.04, 0.067, 3.86, 0.17, silver);
    lamp(ft, u, 31.9, 4.57, 0.88, 0.029, 0.12);
  }
  const basin = data.footprints.find((f) => f.id === city.basinId).rings[0],
    center = basin
      .slice(0, -1)
      .reduce((v, p) => [v[0] + p[0] / (basin.length - 1), v[1] + p[1] / (basin.length - 1)], [0, 0]);
  const wash = { ...loc(...center, 0.993, -0.119), z: ground(...center) };
  for (const u of [-1.76, 1.76])
    for (const v of [-1.48, 1.48]) {
      shoe(wash, u, v, 0.24, 0.49, 0.48, stone);
      post(wash, u, v, 1.72, 0.25, 3.0, 0.25, timber);
    }
  for (const u of [-1.76, 1.76]) box(wash, u, 0, 3.23, 0.31, 0.27, 3.33, timber);
  shoe(wash, 0, 0, 0.36, 1.7, 1.04, basalt);
  box(wash, 0, 0, 0.64, 2.0, 0.5, 1.25, stone);
  box(wash, 0, 0, 0.903, 1.7, 0.02, 0.93, '#4d665d');
  for (const s of [-1, 1]) {
    box(wash, s * 0.94, 0, 0.9, 0.12, 0.115, 1.24, lightStone);
    box(wash, 0, s * 0.57, 0.9, 1.78, 0.115, 0.11, lightStone);
  }
  strut(wash, [-0.72, 0.12, 0.98], [0.72, 0.12, 0.98], 0.055, '#8e8962');
  for (const [fid, x, y, z, ax, ay] of city.bridgeLights) {
    const o = { ...loc(x, y, ax, ay), z };
    box(o, 0, 0, -0.038, 0.32, 0.076, 0.92, dark);
    lamp(o, 0, 0, -0.088, 0.23, 0.027, 0.81);
  }
  for (const [x, y, z, dx, dy] of data.fixtures.signals) {
    const o = { ...loc(x, y, dx, dy), z };
    box(o, 0.19, 0, 2.65, 0.34, 0.68, 0.24, '#374442');
    for (const side of [-1, 1]) {
      pedestrians.push([cards.length, Math.abs(dx) > Math.abs(dy) ? 0 : 12]);
      label(o, 0.19, side * 0.132, 2.69, 0.32, 0.53, 10, 1.65, side < 0 ? Math.PI : 0);
    }
    box(o, 0.175, -0.18, 3.0, 0.4, 0.056, 0.3, '#34413b');
  }
  const chart = inscriptions(),
    geometry = new T.PlaneGeometry(),
    evening = { value: 0 };
  geometry.setAttribute(
    'detailCell',
    new T.InstancedBufferAttribute(
      new Float32Array(cards.flatMap((v) => [v.cell % 3, 3 - Math.floor(v.cell / 3), v.glow])),
      3,
    ),
  );
  const signs = new T.MeshStandardMaterial({ map: chart, roughness: 0.78, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1 });
  signs.onBeforeCompile = (sh) => {
    sh.uniforms.detailEvening = evening;
    sh.vertexShader =
      'attribute vec3 detailCell;varying float markLight;\n' +
      sh.vertexShader.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvMapUv=(detailCell.xy+vec2(.008,.012)+uv*vec2(.984,.976))/vec2(3.,4.);markLight=detailCell.z;',
      );
    sh.fragmentShader =
      'varying float markLight;uniform float detailEvening;\n' +
      sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*markLight*(.12+1.3*detailEvening+.82*step(1.5,markLight));',
      );
  };
  const labels = instances(
    scene,
    'District detail • printed signs and louvers',
    geometry,
    signs,
    cards.map((c) => c.row),
  );
  labels.userData.grid = [3, 4];
  const lit = new T.MeshStandardMaterial({ color: '#ebe4ca', emissive: '#ffda98' });
  instances(scene, 'District detail • recessed luminaires', geoBox, lit, lamps);
  const obstruction = std('#773724');
  obstruction.emissive.set('#fa4936');
  instances(
    scene,
    'District detail • rooftop beacons',
    new T.SphereGeometry(0.5, 10, 6),
    obstruction,
    redLights,
  );
  let oldPhase = -1;
  return {
    shrubRows,
    update(darkness, time) {
      const phase = Math.floor(time) % 24;
      if (phase !== oldPhase) {
        oldPhase = phase;
        const cells = geometry.getAttribute('detailCell');
        for (const [index, offset] of pedestrians) {
          const t = (phase + offset) % 24,
            cell = t >= 12 && t < 20 ? 10 : 11;
          cells.setX(index, cell % 3);
        }
        cells.needsUpdate = true;
      }
      evening.value = darkness;
      lit.emissiveIntensity = 0.18 + darkness * 2.85;
      obstruction.emissiveIntensity = darkness * (1.3 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(time * 2.4), 3));
    },
    counts: {
      roofElements: city.roofs.length,
      sidewalkFurniture: city.street.length,
      stationEntrances: data.stations.length,
    },
  };
}
