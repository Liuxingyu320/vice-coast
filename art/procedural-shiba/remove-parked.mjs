// Rebuild a TKY7 archive without parked vehicles. Variable-length city geometry,
// photographic UVs and the road graph are copied byte for byte.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {unzipSync,zipSync} from 'three/addons/libs/fflate.module.js';
import {decodeTile,PROP} from '../../vendor/procedural-tokyo/src/shared/tileformat.js';

const [source,dest]=process.argv.slice(2);
if(!source||!dest||source===dest) throw Error('Supply a source archive and a separate output path.');
const files=unzipSync(fs.readFileSync(source)),base='tiles/shiba/',manifest=JSON.parse(new TextDecoder().decode(files[base+'manifest.json']));
assert.equal(manifest.area,'shiba');assert.equal(manifest.format,7);
let removed=0, signsRemoved=0;
for(const def of manifest.tiles) {
  const path=base+def.file, bytes=Buffer.from(files[path]), tile=decodeTile(files[path].slice().buffer);
  const signs=tile.signs.map(s=>34+Buffer.byteLength(s.text));
  const signsAt=bytes.length-signs.reduce((a,b)=>a+b,0);
  const propsEnd=signsAt-4*(tile.wires.length+tile.walls.length), propsAt=propsEnd-tile.props.length*16;
  const keep=[bytes.subarray(0,propsAt)];
  for(const [i,p] of tile.props.entries()) {
    const offset=propsAt+i*16;
    assert.equal(bytes[offset],p.kind);assert.equal(bytes.readFloatLE(offset+4),p.x);
    if(p.kind===PROP.PARKED){removed++;continue;}
    keep.push(bytes.subarray(offset,offset+16));
  }
  keep.push(bytes.subarray(propsEnd,signsAt));
  let pos=signsAt, ns=0;
  for(const [i,s] of tile.signs.entries()) {
    const end=pos+signs[i];
    if(tile.tx===1&&tile.tz===0&&s.text==='三解脱門'&&Math.hypot(s.x-421.48,s.z-148.15)<1) signsRemoved++;
    else {keep.push(bytes.subarray(pos,end));ns++;}
    pos=end;
  }
  const output=Buffer.concat(keep);
  def.props=tile.props.filter(p=>p.kind!==PROP.PARKED).length;
  def.signs=ns;def.bytes=output.length;output.writeUInt32LE(def.props,24);output.writeUInt32LE(ns,36);
  const check=decodeTile(Uint8Array.from(output).buffer);
  assert.equal(check.props.length,def.props);assert.equal(check.buildings.length,tile.buildings.length);assert.equal(check.signs.length,ns);
  files[path]=output;
}
assert.equal(removed,2072);assert.equal(signsRemoved,1);
files[base+'manifest.json']=Buffer.from(JSON.stringify(manifest));
fs.writeFileSync(dest,zipSync(files,{level:5,mtime:new Date(2020,0,1)}));
console.log('Filtered parked-car placements:',removed,'replaced gate signs:',signsRemoved);
