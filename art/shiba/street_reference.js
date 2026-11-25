import * as T from 'three';
import data from '../../assets/shiba-layout.json';
import { makeStreets } from '../../src/shiba/street.js';
import { surveyHeight } from '../../src/shiba/terrain.js';
import { furnishAvenue } from '../../src/shiba/avenue.js';
import { buildFurniture } from '../../src/shiba/furniture.js';
import { glowMap } from '../../src/shiba/lighting.js';

export async function streetReference() {
  const scene = new T.Scene(),
    roads = makeStreets(data),
    height = (x, y) => surveyHeight(data.height, x, y);
  await furnishAvenue(scene, roads, height, null, data.fixtures);
  buildFurniture(scene, roads, height, data, glowMap(), null)(3, 0);
  const charts = [],
    meshes = [];
  for (const mesh of scene.children) {
    if (!mesh.isInstancedMesh || mesh.name === 'Downward streetlight haze') continue;
    const geo = mesh.geometry,
      mat = mesh.material,
      map = mat.map?.image;
    if (map && !charts.includes(map)) charts.push(map);
    meshes.push({
      name: mesh.name,
      pos: [...geo.attributes.position.array],
      uv: [...geo.attributes.uv.array],
      indices: geo.index
        ? [...geo.index.array]
        : Array.from({ length: geo.attributes.position.count }, (_, k) => k),
      matrices: [...mesh.instanceMatrix.array],
      colors: mesh.instanceColor ? [...mesh.instanceColor.array] : null,
      cells:
        geo.attributes.chartCell || geo.attributes.detailCell
          ? [...(geo.attributes.chartCell || geo.attributes.detailCell).array]
          : null,
      grid: mesh.userData.grid || [4, 7],
      map: charts.indexOf(map),
      cutout: mat.alphaTest > 0 && mesh.name === 'Park low evergreen sprays',
      color: mat.color.toArray(),
      metal: mat.metalness,
      rough: mat.roughness,
      alpha: mat.opacity,
      emission: mat.emissive ? mat.emissive.toArray().map((x) => x * mat.emissiveIntensity) : null,
    });
  }
  const images = charts.map((img, i) =>
    meshes.some((m) => m.map === i && m.cutout)
      ? img.toDataURL('image/png')
      : img.toDataURL('image/jpeg', 0.94),
  );
  return { meshes, images };
}
