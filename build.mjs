import {rename,rm,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {buildMap} from './art/shiba-map/bundle.mjs';

const {html}=await buildMap();
const target=path.resolve(process.env.SHIBA_BUILD_STAGE || '.', 'index.html');
const draft=target+'.'+randomUUID()+'.tmp';
try { await writeFile(draft,html); await rename(draft,target); }
finally { await rm(draft,{force:true}); }
console.log('Built offline Tokyo Bay game ('+(Buffer.byteLength(html)/1048576).toFixed(2)+' MiB)');
