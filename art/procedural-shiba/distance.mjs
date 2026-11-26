import {unzipSync,zipSync} from 'three/addons/libs/fflate.module.js';
import {decodeTile} from '../../vendor/procedural-tokyo/src/shared/tileformat.js';
import {outlineTile} from '../../vendor/procedural-tokyo/src/world/outline-tile.js';

// Header per tile followed by signed decimetre XYZ, linear RGB8 and triangle indices.
export function distanceArchive(geometry) {
  const files=unzipSync(geometry),base='tiles/shiba/';
  const manifest=JSON.parse(new TextDecoder().decode(files[base+'manifest.json']));
  const pieces=[];
  for(const entry of manifest.tiles) {
    const raw=files[base+entry.file];
    const tile=decodeTile(raw.slice().buffer);
    const {xyz,color,indices}=outlineTile(tile);
    const header=Buffer.alloc(12);
    header.writeInt16LE(tile.tx);header.writeInt16LE(tile.tz,2);
    header.writeUInt32LE(color.length/3,4);header.writeUInt32LE(indices.length,8);
    const record=Buffer.alloc(xyz.length*2+color.length+indices.length*4);
    record.set(Buffer.from(xyz.buffer),0);record.set(color,xyz.byteLength);
    record.set(Buffer.from(indices.buffer),xyz.byteLength+color.length);
    pieces.push(header,record,Buffer.alloc((4-record.length%4)%4));
  }
  return zipSync({'tiles/shiba/distance.bin':Buffer.concat(pieces)},{level:5,mtime:new Date(2020,0,1)});
}
