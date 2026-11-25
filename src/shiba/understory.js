import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasMap, instances, random } from './primitives.js';

export function addUnderstory(scene, rows) {
  const rng = random(8191);
  // Twigs and paired evergreen leaves on six curved, crossing sprays. Clear gaps expose the lower branches.
  const atlas = canvasMap(384, 256, (g) => {
    for (let twig = 0; twig < 25; twig++) {
      const x0 = 192 + (rng() - 0.5) * 90,
        y0 = 260;
      const x1 = 18 + rng() * 348,
        y1 = 9 + rng() * 144;
      g.strokeStyle = '#635c44';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(x1, y0 - 73, x1, y1);
      g.stroke();
      for (let j = 0; j < 12; j++) {
        const t = 0.16 + j * 0.068,
          x = (1 - t) * (1 - t) * x0 + (2 * t - t * t) * x1,
          y = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * (y0 - 73) + t * t * y1;
        const side = j % 2 ? 1 : -1,
          length = 4 + 7 * rng();
        g.fillStyle = ['#63764a', '#4d6945', '#728258', '#859063', '#567449'][Math.floor(rng() * 5)];
        g.beginPath();
        g.ellipse(x + side * length * 0.5, y - 4, length, length * 0.38, side * -0.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  const sprays = [];
  for (let i = 0; i < 6; i++) {
    const geo = new T.PlaneGeometry(1, 0.9, 4, 4),
      a = (i * Math.PI) / 3;
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k),
        y = p.getY(k) + 0.45,
        depth = 0.08 + 0.16 * Math.sin(Math.PI * y) + 0.14 * y;
      p.setXYZ(k, Math.cos(a) * x + Math.sin(a) * depth, y, Math.cos(a) * depth - Math.sin(a) * x);
    }
    geo.computeVertexNormals();
    sprays.push(geo);
  }
  const geo = mergeGeometries(sprays),
    normal = geo.attributes.normal,
    p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const n = new T.Vector3(p.getX(i), 0.36 + p.getY(i) * 0.46, p.getZ(i)).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  const mat = new T.MeshStandardMaterial({
    map: atlas,
    roughness: 0.95,
    side: T.DoubleSide,
    alphaTest: 0.35,
    alphaToCoverage: true,
    color: '#dce7c3',
    emissive: '#20271a',
    emissiveIntensity: 0.14,
  });
  instances(scene, 'Park low evergreen sprays', geo, mat, rows);
}
