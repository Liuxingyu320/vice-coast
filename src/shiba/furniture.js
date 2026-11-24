import * as T from 'three';
import { instances, canvasMap } from './primitives.js';
export function buildFurniture(scene, streets, terrain, data, glow, passable) {
  const steel = [],
    poles = [],
    shoes = [],
    rail = [],
    white = [],
    green = [],
    dark = [],
    heads = [],
    lamp = [],
    beads = Array.from({ length: 6 }, () => []),
    hoods = [],
    signs = new Map(),
    boxes = [],
    faces = [],
    cones = [],
    glowPositions = [];
  const put = (rows, x, y, z, w, h, d, ang = 0, col) => rows.push([x, z, -y, w, h, d, ang, col]);
  const pole = (rows, x, y, z, h, w, base = 0) => put(rows, x, y, z + base + h / 2, w, h, w);
  for (const [index, [x, y, g, dx, dy]] of data.fixtures.signals.entries()) {
    const yaw = -Math.atan2(dx, dy),
      reach = 4.55;
    pole(shoes, x, y, g, 0.055, 0.26);
    pole(poles, x, y, g, 5.3, 0.145);
    put(steel, x - (dy * reach) / 2, y + (dx * reach) / 2, g + 5.2, reach + 0.26, 0.13, 0.13, yaw);
    const bx = x - dy * reach,
      by = y + dx * reach;
    put(heads, bx, by, g + 4.99, 1.5, 0.46, 0.31, yaw);
    const phaseGroup = Math.abs(dx) > Math.abs(dy) ? 0 : 3;
    for (let k = 0; k < 3; k++) {
      const px = bx + dy * (k - 1) * 0.45,
        py = by - dx * (k - 1) * 0.45;
      put(beads[k + phaseGroup], px - dx * 0.183, py - dy * 0.183, g + 4.99, 0.286, 0.286, 0.07, yaw);
      put(hoods, px - dx * 0.25, py - dy * 0.25, g + 5.005, 0.346, 0.346, 0.24, yaw);
    }
    const title = data.fixtures.junctionNames[index];
    if (title) {
      if (!signs.has(title)) signs.set(title, []);
      put(signs.get(title), x - dy * 1.65, y + dx * 1.65, g + 4.91, 1.44, 0.42, 0.08, yaw);
    }
  }
  for (const [x, y, g, dx, dy] of data.fixtures.lamps) {
    const a = Math.atan2(dx, dy),
      reach = 2.85;
    pole(shoes, x, y, g, 0.045, 0.2);
    pole(poles, x, y, g, 6.25, 0.11);
    put(steel, x - (dy * reach) / 2, y + (dx * reach) / 2, g + 6.16, reach + 0.1, 0.085, 0.09, -a);
    const hx = x - dy * reach,
      hy = y + dx * reach;
    put(dark, hx, hy, g + 6.12, 0.61, 0.1, 0.31, -a);
    put(lamp, hx, hy, g + 6.055, 0.51, 0.035, 0.25, -a);
    glowPositions.push(hx, g + 6.02, -hy);
    cones.push([hx, g + 3.09, -hy, 4.7, 5.85, 4.7]);
  }
  for (const anchors of data.fixtures.rails) {
    for (const [x, y, g] of anchors) {
      pole(white, x, y, g, 0.79, 0.081);
      pole(green, x, y, g, 0.25, 0.087, 0.43);
    }
    for (let j = 1; j < anchors.length; j++) {
      const [x, y, g] = anchors[j - 1],
        [X, Y, G] = anchors[j];
      const delta = new T.Vector3(X - x, G - g, y - Y),
        length = delta.length();
      const rotation = new T.Euler().setFromQuaternion(
        new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), delta.normalize()),
        'YXZ',
      );
      for (const h of [0.44, 0.71])
        rail.push([
          (x + X) / 2,
          (g + G) / 2 + h,
          -(y + Y) / 2,
          0.058,
          0.062,
          length,
          rotation.y,
          undefined,
          rotation.x,
          rotation.z,
        ]);
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
  const roadSignMap = (title) =>
    canvasMap(384, 96, (g) => {
      g.fillStyle = '#e7eae6';
      g.fillRect(0, 0, 384, 96);
      g.fillStyle = '#365565';
      g.textAlign = 'center';
      g.font = '500 48px sans-serif';
      g.fillText(title, 192, 65, 352);
    });
  const panel = new T.PlaneGeometry();
  for (const [kind, id, x, y, nx, ny, lift] of data.fixtures.amenities) {
    if (kind !== 'vending') continue;
    const yaw = Math.atan2(nx, -ny),
      g = terrain(x, y) + lift;
    put(boxes, x, y, g + 1.02, 1.14, 2.04, 0.77, yaw, Number(id) % 3 ? '#dadbd4' : '#a03c38');
    put(faces, x + nx * 0.392, y + ny * 0.392, g + 1.02, 1.05, 1.9, 1, yaw);
  }
  const box = new T.BoxGeometry(),
    std = (color, metalness = 0) => new T.MeshStandardMaterial({ color, metalness, roughness: 0.6 });
  const tube = new T.CylinderGeometry(0.5, 0.5, 1, 12);
  const galv = std('#929b99', 0.38);
  instances(scene, 'Mast base plates', tube, std('#555e60', 0.32), shoes);
  instances(scene, 'Signal and lamp masts', tube, galv, poles, true);
  instances(scene, 'Signal and lamp arms', box, galv, steel);
  const visor = new T.CylinderGeometry(0.5, 0.5, 1, 16, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
  const hoodMat = std('#303937');
  hoodMat.side = T.DoubleSide;
  instances(scene, 'Signal visors', visor, hoodMat, hoods);
  const outline = new T.Shape();
  outline.moveTo(-0.415, -0.5);
  outline.lineTo(0.415, -0.5);
  outline.quadraticCurveTo(0.5, -0.5, 0.5, -0.25);
  outline.lineTo(0.5, 0.25);
  outline.quadraticCurveTo(0.5, 0.5, 0.415, 0.5);
  outline.lineTo(-0.415, 0.5);
  outline.quadraticCurveTo(-0.5, 0.5, -0.5, 0.25);
  outline.lineTo(-0.5, -0.25);
  outline.quadraticCurveTo(-0.5, -0.5, -0.415, -0.5);
  const housing = new T.ExtrudeGeometry(outline, {
    depth: 0.94,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 5,
  });
  housing.translate(0, 0, -0.47);
  instances(scene, 'Signal housings', housing, std('#303936', 0.2), heads);
  instances(scene, 'Guard rails', tube.clone().rotateX(Math.PI / 2), std('#c5d3c4'), rail, true);
  instances(scene, 'Reflector posts', tube, std('#dad8c7'), white, true);
  instances(scene, 'Green rail bands', tube, std('#3d8063'), green);
  instances(scene, 'Lamp housings', box, std('#333e3d'), dark);
  const lit = new T.MeshStandardMaterial({ color: '#f1dbad', emissive: '#ffbb65' });
  instances(scene, 'Lanterns & reflectors', box, lit, lamp);
  const lensColor = ['#3bd7b0', '#f8c04f', '#f4483f'];
  const unlit = ['#253933', '#3e3628', '#422a2a'];
  const signalMats = beads.map(
    (_, i) =>
      new T.MeshStandardMaterial({ color: unlit[i % 3], emissive: lensColor[i % 3], roughness: 0.32 }),
  );
  beads.forEach((v, i) =>
    instances(scene, 'Signal bulbs ' + i, new T.SphereGeometry(0.5, 12, 8), signalMats[i], v),
  );
  for (const [title, rows] of signs)
    instances(
      scene,
      'Intersection ' + title,
      box,
      new T.MeshStandardMaterial({ map: roadSignMap(title) }),
      rows,
    );
  instances(scene, 'Vending cabinets', box, std('white'), boxes);
  const vending = new T.MeshStandardMaterial({
    map: machineMap,
    emissiveMap: machineMap,
    emissive: '#fff2e4',
    side: T.DoubleSide,
  });
  instances(scene, 'Drink displays', panel, vending, faces);
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
    coneMat.opacity = amount * 0.028;
    const phase = time % 24;
    signalMats.forEach((mat, i) => {
      const t = (phase + (i < 3 ? 0 : 12)) % 24;
      const selected = t < 9 ? 0 : t < 11 ? 1 : 2;
      const on = i % 3 === selected;
      mat.color.set(on ? lensColor[i % 3] : unlit[i % 3]);
      mat.emissiveIntensity = on ? 1.36 : 0.012;
    });
  };
}
