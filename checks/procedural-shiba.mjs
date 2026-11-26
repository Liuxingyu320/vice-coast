import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readArchives} from '../src/shiba/procedural/archive.js';
import {BFLAG, PROP, decodeTile} from '../vendor/procedural-tokyo/src/shared/tileformat.js';
import {buildingMesh} from '../vendor/procedural-tokyo/src/world/meshing.js';
import {facadeAttributes, indexSurface, roofAttributes} from '../vendor/procedural-tokyo/src/world/index-surface.js';
import {LANDMARKS} from '../vendor/procedural-tokyo/src/world/landmarks.js';
import {makeProjection} from '../vendor/procedural-tokyo/src/shared/geo.js';

const hashes = {
  geometry: 'eb0a8c40677a7483d5beb1435983e781b0eaf4d16d12605d69c1df331d0948b2',
  atlases: '3e3a8e1be74764dfdd85731b773d08190b21c5f8c424a23fdeb431ebfa0e2ec4',
  imagery: '299bb6391c878b79ae01cd3a25048bec71f8fcb76d7db7afdf87b174dd9fc8d4'
};
const packs = await Promise.all(Object.entries(hashes).map(async ([name,expected]) => {
  const data = await readFile('assets/procedural-shiba/'+name+'.zip');
  assert.equal(createHash('sha256').update(data).digest('hex'),expected,name);
  return data.toString('base64');
}));
const archive = readArchives(packs);
const base = 'tiles/shiba/';
const manifest = JSON.parse(new TextDecoder().decode(archive.read(base+'manifest.json')));
assert.equal(manifest.area,'shiba');
assert.equal(manifest.format,7);
assert.equal(manifest.tiles.length,180);
assert.equal(manifest.tileSize,256);
const terrain = manifest.terrain;
assert.equal(archive.read(base+terrain.file).length,terrain.w*terrain.h*4);
for (const layer of ['rails','roads','structures']) assert.ok(archive.has(base+manifest[layer]));
const projection = makeProjection(manifest.origin.lon,manifest.origin.lat);
const marks = LANDMARKS.shiba.map(([,lon,lat]) => projection.project(lon,lat));

const stats = {tiles:0, buildings:0, latticeTowers:0, parkedCars:0, corners:0, bytesBefore:0, bytesIndexed:0};
function verifySurface(surface,format,compareEveryCorner) {
  const fields = Object.entries(format);
  const corners = surface.position.length / 3;
  const original = {};
  for (const [name,stride] of fields) {
    assert.equal(surface[name].length,corners*stride);
    stats.bytesBefore += surface[name].byteLength;
    if (compareEveryCorner) original[name] = surface[name].slice();
  }
  indexSurface(surface,format);
  const indices = surface.index;
  assert.equal(indices?.length ?? surface.position.length/3,corners);
  for (const [name,stride] of fields) {
    const attr = surface[name];
    stats.bytesIndexed += attr.byteLength;
    if (!compareEveryCorner) continue;
    for (let i=0;i<corners;i++) {
      const from = (indices ? indices[i] : i)*stride;
      for (let j=0;j<stride;j++) {
        if (original[name][i*stride+j]!==attr[from+j]) assert.fail(name+' changed at corner '+i);
      }
    }
  }
  stats.bytesIndexed += indices?.byteLength ?? 0;
  stats.corners += corners;
}

for (const entry of manifest.tiles) {
  const bytes = archive.read(base+entry.file);
  assert.equal(bytes.length,entry.bytes,entry.file);
  const tile = decodeTile(bytes.slice().buffer);
  assert.equal(tile.tx,entry.x);
  assert.equal(tile.tz,entry.z);
  assert.equal(tile.buildings.length,entry.buildings);
  assert.equal(tile.props.length,entry.props);
  stats.tiles++;
  stats.buildings += tile.buildings.length;
  stats.latticeTowers += tile.buildings.filter(b=>b.flags & BFLAG.LATTICE).length;
  stats.parkedCars += tile.props.filter(p=>p.kind===PROP.PARKED).length;
  if (tile.tx===1 && tile.tz===0) assert.ok(!tile.signs.some(s=>s.text==='三解脱門'));
  if (entry.mesh) assert.ok(archive.has(base+entry.mesh));
  for (const file of [entry.walls,entry.atlas].filter(Boolean)) {
    assert.ok(archive.has(base+file),file);
    assert.ok(archive.has(base+file.replace('.jpg','_s.jpg')),file);
  }
  const mesh = buildingMesh(tile.buildings,tile.tx,tile.tz,marks);
  const checkCorners = tile.tz===0 && (tile.tx===0 || tile.tx===1);
  verifySurface(mesh,facadeAttributes,checkCorners);
  verifySurface(mesh.photo,roofAttributes,checkCorners);
}
assert.equal(stats.buildings,14753);
assert.equal(stats.latticeTowers,1);
assert.equal(stats.parkedCars,0);
assert.ok(stats.bytesIndexed < stats.bytesBefore);
console.log(JSON.stringify({...stats, savingPercent: +(100*(1-stats.bytesIndexed/stats.bytesBefore)).toFixed(1)},null,2));
