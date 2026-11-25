import * as T from 'three';
import { instances } from './primitives.js';
export function makeStreets(data) {
  const roads = [],
    paths = [],
    junctions = [];
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
    if (kind === 'stop' || sites.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 8)) continue;
    sites.push({ ...p, kind });
  }
  return { roads, paths, sites, junctions, nearest, onRoad };
}
export function createTrees(scene, district, trees) {
  const groves = [];
  for (let kind = 0; kind < 3; kind++) {
    const prototype = district.getObjectByName('tree-prototype-' + kind);
    const rows = [];
    trees.forEach(([x, y, z, height, radius], i) => {
      if ((i % 11 < 6 ? 0 : i % 11 < 9 ? 1 : 2) !== kind) return;
      const phase = Math.sin(12.9898 * x + 78.233 * y);
      rows.push([
        x,
        z,
        -y,
        radius * ([0.94, 1.0, 0.95][kind] + 0.09 * phase),
        height,
        radius * ([0.91, 0.94, 0.95][kind] - 0.095 * phase),
        i * 2.399963 + phase,
      ]);
    });
    const meshes = [],
      bounds = new T.Box3().setFromObject(prototype);
    prototype.traverse((branch) => {
      if (!branch.isMesh) return;
      const leaf = branch.material.name === 'Leaf sprays';
      const mat = branch.material.clone();
      if (leaf) {
        mat.transparent = false;
        mat.depthWrite = true;
        mat.alphaTest = 0.34;
        mat.alphaToCoverage = true;
        mat.side = T.DoubleSide;
        mat.color.set(['#d9e0bb', '#b7c9ac', '#e0dbab'][kind]);
        mat.roughness = 0.97;
        mat.metalness = 0;
        mat.envMapIntensity = 0.25;
        mat.emissive.setRGB(0.027, 0.035, 0.018);
        mat.emissiveIntensity = 0.28;
        mat.onBeforeCompile = (sh) => {
          // Leaf cards share a crown normal even when seen from behind.
          sh.vertexShader =
            'varying float leafTone;\n' +
            sh.vertexShader
              .replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nleafTone=fract(sin(dot(instanceMatrix[3].xz,vec2(.741,.318)))*4375.13);',
              )
              .replace(
                '#include <beginnormal_vertex>',
                '#include <beginnormal_vertex>\nobjectNormal=normalize(vec3(position.x,(position.y-.55)*6.0+.25,position.z));',
              );
          sh.fragmentShader =
            'varying float leafTone;\n' +
            sh.fragmentShader
              .replace(
                '#include <map_fragment>',
                '#include <map_fragment>\ndiffuseColor.rgb*=mix(vec3(.66,.89,.78),vec3(1.13,1.01,.69),leafTone);',
              )
              .replace(
                '#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*(.085+.09*pow(1.-abs(dot(normal,normalize(vViewPosition))),2.));',
              )
              .replace(
                '#include <normal_fragment_begin>',
                T.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
              )
              .replace(
                '#include <lights_physical_fragment>',
                '#include <lights_physical_fragment>\nmaterial.specularColor*=.07;material.specularF90=.026;',
              );
        };
      }
      meshes.push(
        instances(
          scene,
          (leaf ? 'Leaf clusters ' : 'Trunks and boughs ') + kind,
          branch.geometry,
          mat,
          rows,
          true,
        ),
      );
    });
    const transforms = meshes[0].instanceMatrix.array.slice(),
      buffer = meshes[0].instanceMatrix;
    buffer.setUsage(T.DynamicDrawUsage);
    for (const mesh of meshes) mesh.instanceMatrix = buffer;
    const matrix = new T.Matrix4();
    const spheres = rows.map((_, i) =>
      bounds
        .clone()
        .applyMatrix4(matrix.fromArray(transforms, i * 16))
        .getBoundingSphere(new T.Sphere()),
    );
    groves.push({
      meshes,
      transforms,
      buffer,
      spheres,
      indices: new Int32Array(rows.length).fill(-1),
      size: -1,
    });
    prototype.removeFromParent();
  }
  // Keep off-camera shadow casters. A single draw per species/material still represents every
  // tree that can reach either the camera or the directional shadow map.
  const light = scene.children.find((o) => o.isDirectionalLight),
    view = new T.Frustum(),
    matrix = new T.Matrix4();
  scene.onBeforeRender = (_renderer, _scene, camera) => {
    view.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    light.shadow.updateMatrices(light);
    const shadow = light.shadow.getFrustum();
    for (const grove of groves) {
      let length = 0,
        changed = false;
      for (let i = 0; i < grove.spheres.length; i++) {
        const sphere = grove.spheres[i];
        if (!view.intersectsSphere(sphere) && !shadow.intersectsSphere(sphere)) continue;
        if (grove.indices[length] !== i) changed = true;
        grove.indices[length++] = i;
      }
      if (!changed && length === grove.size) continue;
      for (let j = 0; j < length; j++) {
        const offset = grove.indices[j] * 16;
        grove.buffer.array.set(grove.transforms.subarray(offset, offset + 16), j * 16);
      }
      grove.buffer.clearUpdateRanges();
      grove.buffer.addUpdateRange(0, length * 16);
      grove.buffer.needsUpdate = true;
      grove.size = length;
      for (const mesh of grove.meshes) mesh.count = length;
    }
  };
}
