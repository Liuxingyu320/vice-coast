import * as T from 'three';
export function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function canvasMap(width, height, paint, color = true) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  paint(c.getContext('2d'), width, height);
  const t = new T.CanvasTexture(c);
  if (color) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function instances(scene, name, geometry, material, rows, shadow = false) {
  if (!rows.length) return null;
  const mesh = new T.InstancedMesh(geometry, material, rows.length),
    o = new T.Object3D(),
    color = new T.Color();
  rows.forEach(([x, y, z, w, h, d, yaw = 0, tint, pitch = 0, roll = 0], i) => {
    o.position.set(x, y, z);
    o.scale.set(w, h, d);
    o.rotation.set(pitch, yaw, roll, 'YXZ');
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (tint !== undefined) mesh.setColorAt(i, color.set(tint));
  });
  mesh.name = name;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}
function asphalt() {
  const size = 512,
    rng = random(73),
    noise = new Uint8Array(size * size);
  for (let i = 0; i < noise.length; i++) noise[i] = rng() * 255;
  const grids = [8, 16, 32, 64].map((n) => ({
    n,
    values: Float32Array.from({ length: n * n }, () => rng()),
  }));
  function field(x, y, { n, values }) {
    const fx = (x * n) / size,
      fy = (y * n) / size,
      i = Math.floor(fx),
      j = Math.floor(fy),
      u = fx - i,
      v = fy - j;
    const a = u * u * (3 - 2 * u),
      b = v * v * (3 - 2 * v),
      at = (i, j) => values[(j % n) * n + (i % n)];
    return (
      (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b
    );
  }
  function paint(rough) {
    return (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x,
            t = 2 * Math.PI,
            grain = noise[i] / 255,
            patch =
              0.56 * field(x, y, grids[0]) +
              0.25 * field(x, y, grids[1]) +
              0.13 * field(x, y, grids[2]) +
              0.06 * field(x, y, grids[3]);
          const wet = T.MathUtils.smoothstep(patch, 0.54, 0.86),
            c = rough ? Math.round(255 * (0.75 - 0.59 * wet)) : 29 + Math.round((grain - 0.5) * 22 - wet * 4);
          img.data.set(rough ? [c, c, c, 255] : [c, c + 3, c + 9, 255], i * 4);
        }
      g.putImageData(img, 0, 0);
    };
  }
  const map = canvasMap(size, size, paint(false)),
    roughnessMap = canvasMap(size, size, paint(true), false);
  for (const t of [map, roughnessMap]) t.wrapS = t.wrapT = T.RepeatWrapping;
  return new T.MeshPhysicalMaterial({
    map,
    roughnessMap,
    roughness: 1,
    metalness: 0.02,
    specularIntensity: 0.5,
    envMapIntensity: 0.47,
  });
}
function roadPlane(scene, name, material, patches, textured) {
  if (!patches.length) return;
  const geo = new T.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const heights = [],
    uvs = [],
    rows = [];
  for (const p of patches) {
    heights.push(...p.z);
    uvs.push(p.width / 4, p.length / 4, p.start / 4);
    rows.push([p.x, 0, -p.y, p.width, 1, p.length, -p.angle]);
  }
  geo.setAttribute('cornerElevations', new T.InstancedBufferAttribute(new Float32Array(heights), 4));
  geo.setAttribute('tileScale', new T.InstancedBufferAttribute(new Float32Array(uvs), 3));
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute vec4 cornerElevations;attribute vec3 tileScale;varying vec3 laneSample;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.y=mix(mix(cornerElevations.x,cornerElevations.y,uv.x),mix(cornerElevations.z,cornerElevations.w,uv.x),uv.y);',
    );
    if (textured) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvMapUv=uv*tileScale.xy+vec2(0.,tileScale.z);vRoughnessMapUv=vMapUv;laneSample=vec3(uv.x,(uv.y*tileScale.y+tileScale.z)*4.,tileScale.x*4.);',
      );
      shader.fragmentShader = 'varying vec3 laneSample;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
 float roadWidth=laneSample.z;float lateral=(laneSample.x-.5)*roadWidth;
 float edgeStripe=1.-smoothstep(.046,.082,abs(abs(lateral)-roadWidth*.5+.34));
 float dash=1.-smoothstep(.065,.10,abs(lateral));
 float broken=1.-smoothstep(2.7,2.9,mod(laneSample.y,6.));
 vec3 marking=mix(vec3(.71,.72,.67),vec3(.90,.48,.075),step(9.,roadWidth));
 float centre=dash*mix(broken,1.,step(9.,roadWidth));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.65,.65),edgeStripe*step(5.6,roadWidth)*.90);
 diffuseColor.rgb=mix(diffuseColor.rgb,marking,centre*step(6.2,roadWidth)*.92);`,
      );
    }
  };
  material.customProgramCacheKey = () => name;
  const obj = instances(scene, name, geo, material, rows);
  obj.frustumCulled = false;
}
export function makeStreets(scene, data, terrain, district) {
  const roads = [],
    paths = [],
    patches = [],
    curbs = [],
    white = [],
    yellow = [],
    stops = [],
    zebras = [],
    junctions = [];
  const paintMat = (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.46, metalness: 0.04 });
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
  for (const r of roads) {
    for (const s of r.segments) {
      const n = Math.ceil(s.len / 4.5),
        len = s.len / n,
        ang = Math.atan2(s.dx, s.dy),
        nx = s.dy,
        ny = -s.dx;
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) * len,
          x = s.x + s.dx * t,
          y = s.y + s.dy * t,
          w = r.width,
          offset = 0.082 + (r.width > 8 ? 0.018 : 0);
        const z = [];
        for (const v of [-1, 1])
          for (const u of [-1, 1])
            z.push(
              terrain(
                x + v * s.dx * len * 0.5 + u * nx * w * 0.5,
                y + v * s.dy * len * 0.5 + u * ny * w * 0.5,
              ) + offset,
            );
        patches.push({ x, y, z, width: w, length: len + 0.06, start: s.start + j * len, angle: ang });
        if (r.category === 'service') continue;
        const crossing = junctions.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < Math.max(4, w * 0.6) ** 2);
        if (!crossing) {
          for (const side of [-1, 1]) {
            const cx = x + nx * (w + 0.18) * 0.5 * side,
              cy = y + ny * (w + 0.18) * 0.5 * side;
            const pitch = Math.atan2(
              terrain(cx + (s.dx * len) / 2, cy + (s.dy * len) / 2) -
                terrain(cx - (s.dx * len) / 2, cy - (s.dy * len) / 2),
              len,
            );
            curbs.push([cx, terrain(cx, cy) + 0.155, -cy, 0.21, 0.15, len + 0.035, -ang, undefined, pitch]);
          }
          if (w >= 6.4) {
            const centre = r.category === 'primary' || r.category === 'secondary';
            const target = centre ? yellow : white;
            const prev = Math.floor((s.start + j * len) / 6),
              next = Math.floor((s.start + (j + 1) * len) / 6);
            if (centre || next !== prev)
              target.push([
                x,
                terrain(x, y) + offset + 0.029,
                -y,
                0.12,
                0.014,
                centre ? len + 0.02 : Math.min(2.8, len),
                -ang,
                undefined,
                Math.atan2((z[2] + z[3] - z[0] - z[1]) * 0.5, len),
              ]);
          }
        }
      }
    }
  }
  // Mask the coarser aerial terrain under the road strips, including where the two DEM triangulations differ.
  const allX = data.boundary.map((p) => p[0]),
    allY = data.boundary.map((p) => p[1]),
    left = Math.min(...allX) - 12,
    bottom = Math.min(...allY) - 12,
    spanX = Math.max(...allX) - left + 12,
    spanY = Math.max(...allY) - bottom + 12;
  const roadMask = canvasMap(
    2048,
    1536,
    (g, W, H) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      g.scale(W / spanX, H / spanY);
      g.strokeStyle = '#fff';
      g.lineJoin = 'round';
      g.lineCap = 'butt';
      for (const r of roads) {
        g.lineWidth = Math.max(1, r.width - 0.25);
        g.beginPath();
        r.pts.forEach(([x, y], i) =>
          i ? g.lineTo(x - left, spanY - y + bottom) : g.moveTo(x - left, spanY - y + bottom),
        );
        g.stroke();
      }
    },
    false,
  );
  district.getObjectByName('shiba-ground')?.traverse((o) => {
    if (!o.isMesh) return;
    const m = (o.material = o.material.clone());
    m.onBeforeCompile = (sh) => {
      sh.uniforms.roadCoverage = { value: roadMask };
      sh.vertexShader = 'varying vec2 groundXY;\n' + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvec3 gWorld=(modelMatrix*vec4(transformed,1.)).xyz;groundXY=vec2(gWorld.x,-gWorld.z);',
      );
      sh.fragmentShader = 'varying vec2 groundXY;uniform sampler2D roadCoverage;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
 if(texture2D(roadCoverage,(groundXY-vec2(${left.toFixed(4)},${bottom.toFixed(4)}))/vec2(${spanX.toFixed(4)},${spanY.toFixed(4)})).r>.61)discard;`,
      );
    };
    m.customProgramCacheKey = () => 'survey-ground-with-roads';
  });
  roadPlane(scene, 'DEM street surface', asphalt(), patches, true);
  const box = new T.BoxGeometry();
  instances(scene, 'Sidewalk curbs', box, paintMat('#a9a79d'), curbs);
  instances(scene, 'White lane paint', box, paintMat('#dddcc9'), white);
  instances(scene, 'Yellow lane paint', box, paintMat('#da9e38'), yellow);
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
        0.46,
        0.019,
        2.9,
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
    g.fillStyle = '#e9e6d7';
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
  instances(scene, 'Marked crossings', box, paintMat('#e2e1da'), zebras);
  return { roads, paths, sites, junctions, nearest };
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
