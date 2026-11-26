import { inflateSync } from 'three/addons/libs/fflate.module.js';

// The static distribution is a single HTML file. Index the ZIP members in place
// and decompress only the terrain, photographs and tiles that the viewer asks for.
export function readArchives(packs) {
  const members = new Map();
  const decoder = new TextDecoder();
  for (const encoded of packs) {
    const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(encoded) : Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    let at = 0;
    while (at + 30 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
      const method = view.getUint16(at + 8, true), length = view.getUint32(at + 18, true);
      const names = view.getUint16(at + 26, true), extra = view.getUint16(at + 28, true);
      const name = decoder.decode(bytes.subarray(at + 30, at + 30 + names));
      const start = at + 30 + names + extra;
      if ((view.getUint16(at + 6, true) & 9) || ![0,8].includes(method) || start + length > bytes.length || members.has(name)) throw Error('Invalid map archive member: ' + name);
      members.set(name, { bytes: bytes.subarray(start, start + length), method });
      at = start + length;
    }
    if (at + 4 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw Error('Incomplete Shiba map archive');
  }
  return {
    has: name => members.has(name),
    read(name) {
      const entry = members.get(name);
      if (!entry) throw Error('Missing Shiba asset: ' + name);
      return entry.method === 8 ? inflateSync(entry.bytes) : entry.bytes;
    }
  };
}
