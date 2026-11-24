import * as T from 'three';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';
import bytes from '../../assets/shiba-pavement.gz';
import { canvasMap, random } from './primitives.js';

function tile(size, paint, color = true) {
  const tex = canvasMap(size, size, paint, color);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  return tex;
}

function mineral(base, amplitude, seed) {
  return (g, w, h) => {
    const image = g.createImageData(w, h),
      rand = random(seed);
    for (let i = 0; i < image.data.length; i += 4) {
      const grain = (rand() + rand() - 1) * amplitude;
      base.forEach((v, k) => (image.data[i + k] = v + grain));
      image.data[i + 3] = 255;
    }
    g.putImageData(image, 0, 0);
  };
}
function streetMaterials() {
  const aggregate = tile(512, mineral([43, 48, 58], 16, 781));
  const wet = tile(
    128,
    (g, w, h) => {
      const pixels = g.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const a = (x * Math.PI * 2) / w,
            b = (y * Math.PI * 2) / h;
          const field =
            0.5 +
            0.24 * Math.sin(a + 0.8 * Math.sin(b)) +
            0.15 * Math.cos(b * 2 - a) +
            0.11 * Math.sin(b + a * 2);
          const v = Math.round(255 * (0.42 + 0.43 * field));
          pixels.data.set([v, v, v, 255], 4 * (y * w + x));
        }
      g.putImageData(pixels, 0, 0);
    },
    false,
  );
  wet.repeat.setScalar(1 / 9);
  const brick = tile(512, (g, w, h) => {
    mineral([161, 164, 166], 15, 347)(g, w, h);
    const rand = random(664);
    for (let row = 0; row < 12; row++)
      for (let col = -1; col < 6; col++) {
        const x = ((col + (row % 2) * 0.5) * w) / 6,
          y = (row * h) / 12;
        g.fillStyle = rand() > 0.5 ? 'rgba(230,225,214,.13)' : 'rgba(55,64,73,.12)';
        g.fillRect(x, y, w / 6, h / 12);
        g.strokeStyle = '#71787b';
        g.lineWidth = 2;
        g.strokeRect(x, y, w / 6, h / 12);
        g.strokeStyle = 'rgba(245,242,225,.45)';
        g.lineWidth = 1;
        g.strokeRect(x + 2, y + 2, w / 6 - 4, h / 12 - 4);
      }
  });
  const studs = tile(128, (g, w, h) => {
    mineral([222, 171, 48], 14, 883)(g, w, h);
    g.fillStyle = '#977332';
    g.fillRect(0, 0, 2, h);
    g.fillRect(0, 0, w, 2);
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) {
        const x = ((i + 0.5) * w) / 5,
          y = ((j + 0.5) * h) / 5,
          gr = g.createRadialGradient(x - 2, y - 2, 0, x, y, 6);
        gr.addColorStop(0, '#ffdd72');
        gr.addColorStop(0.65, '#e8b844');
        gr.addColorStop(1, '#a37b30');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
      }
  });
  const physical = (map, extra = {}) =>
    new T.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: '#ffffff',
      emissiveIntensity: 0.2,
      side: T.DoubleSide,
      ...extra,
    });
  const paint = (c) =>
    new T.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 0.31,
      roughness: 0.65,
      side: T.DoubleSide,
    });
  return {
    asphalt: physical(aggregate, {
      roughnessMap: wet,
      roughness: 1,
      metalness: 0.04,
      envMapIntensity: 0.85,
      emissiveIntensity: 0.64,
    }),
    sidewalk: physical(brick, { roughness: 0.85, bumpMap: brick, bumpScale: 0.018 }),
    forecourt: physical(brick, { color: 0xc4c5bb, roughness: 0.89 }),
    curb: physical(tile(256, mineral([156, 158, 156], 15, 764)), { roughness: 0.85 }),
    tactile: physical(studs, { roughness: 0.78, bumpMap: studs, bumpScale: 0.015 }),
    white: paint('#E8EDF5'),
    yellow: paint('#ffb940'),
  };
}
export function layPavement(scene, terrain, data, district) {
  const layers = JSON.parse(new TextDecoder().decode(gunzipSync(bytes)));
  const materials = streetMaterials();
  const offset = {
    asphalt: 0.085,
    sidewalk: 0.205,
    forecourt: 0.205,
    curb: 0.238,
    tactile: 0.221,
    white: 0.105,
    yellow: 0.105,
  };
  const repeat = { asphalt: 2.5, sidewalk: 2.4, forecourt: 1.8, curb: 1, tactile: 0.31, white: 1, yellow: 1 };
  const xmin = Math.min(...data.boundary.map((p) => p[0])) - 2,
    ymin = Math.min(...data.boundary.map((p) => p[1])) - 2;
  const w = Math.max(...data.boundary.map((p) => p[0])) + 2 - xmin,
    h = Math.max(...data.boundary.map((p) => p[1])) + 2 - ymin;
  const mask = document.createElement('canvas');
  mask.width = 2048;
  mask.height = Math.round((2048 * h) / w);
  const ctx = mask.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.scale(mask.width / w, -mask.height / h);
  ctx.translate(-xmin, -ymin - h);
  for (const [name, [xy, indices]] of Object.entries(layers)) {
    const verts = [],
      uv = [],
      cell = repeat[name],
      edges = new Map(),
      n = xy.length / 2;
    for (let i = 0; i < xy.length; i += 2) {
      const x = xy[i] / 1000,
        y = xy[i + 1] / 1000;
      verts.push(x, terrain(x, y) + offset[name], -y);
      uv.push(x / cell, y / cell);
    }
    const solid = name === 'curb' || name === 'sidewalk';
    const covered = name === 'asphalt' || name === 'sidewalk' || name === 'forecourt';
    if (covered) ctx.beginPath();
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i],
        b = indices[i + 1],
        c = indices[i + 2];
      if (covered) {
        ctx.moveTo(verts[3 * a], -verts[3 * a + 2]);
        ctx.lineTo(verts[3 * b], -verts[3 * b + 2]);
        ctx.lineTo(verts[3 * c], -verts[3 * c + 2]);
        ctx.closePath();
      }
      if (solid)
        for (const [u, v] of [
          [a, b],
          [b, c],
          [c, a],
        ]) {
          const key = Math.min(u, v) * n + Math.max(u, v);
          if (edges.has(key)) edges.delete(key);
          else edges.set(key, [u, v]);
        }
    }
    if (covered) ctx.fill();
    if (solid) {
      // Duplicate the lip vertices: a vertical concrete face must never smooth the normal of a flat paving slab.
      for (const [a, b] of edges.values()) {
        const j = verts.length / 3,
          depth = name === 'curb' ? 0.17 : 0.25;
        const A = verts.slice(3 * a, 3 * a + 3),
          B = verts.slice(3 * b, 3 * b + 3);
        const dist = Math.hypot(B[0] - A[0], B[2] - A[2]);
        verts.push(...B, ...A, A[0], A[1] - depth, A[2], B[0], B[1] - depth, B[2]);
        uv.push(dist / cell, depth / cell, 0, depth / cell, 0, 0, dist / cell, 0);
        indices.push(j, j + 1, j + 2, j, j + 2, j + 3);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, materials[name]);
    mesh.name = 'Survey paving • ' + name;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const coverage = new T.CanvasTexture(mask);
  const detail = tile(256, mineral([142, 142, 142], 62, 962), false);
  district.getObjectByName('shiba-ground')?.traverse((o) => {
    if (!o.isMesh) return;
    const m = (o.material = o.material.clone());
    m.onBeforeCompile = (sh) => {
      sh.uniforms.groundMask = { value: coverage };
      sh.uniforms.grit = { value: detail };
      sh.vertexShader =
        'varying vec2 siteXY;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvec3 site=(modelMatrix*vec4(transformed,1.)).xyz;siteXY=vec2(site.x,-site.z);',
        );
      sh.fragmentShader =
        'varying vec2 siteXY;uniform sampler2D groundMask,grit;\n' +
        sh.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
         if(texture2D(groundMask,(siteXY-vec2(${xmin.toFixed(4)},${ymin.toFixed(4)}))/vec2(${w.toFixed(4)},${h.toFixed(4)})).r>.56)discard;
         float green=smoothstep(-.018,.035,diffuseColor.g-diffuseColor.r);
         float fine=texture2D(grit,siteXY/1.15).r-.55;
         float medium=texture2D(grit,siteXY/5.3).r-.55;
         float luma=dot(diffuseColor.rgb,vec3(.21,.72,.07));
         diffuseColor.rgb=mix(mix(vec3(luma),diffuseColor.rgb,.35)*.76,diffuseColor.rgb*vec3(.91,1.03,.89),green);
         diffuseColor.rgb*=1.+fine*.9+medium*.32;`,
        );
    };
  });
}
