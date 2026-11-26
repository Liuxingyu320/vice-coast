import path from 'node:path';
import {readFile, rename, rm, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {zipSync} from 'three/addons/libs/fflate.module.js';
import {buildMap} from './bundle.mjs';

const directory = '东京湾街区-游戏整合源码';
const target = path.resolve(process.argv[2] ?? '../'+directory+'.zip');
const {inputs, html} = await buildMap();
const viewer = 'vendor/procedural-tokyo/';
const buildTools = 'art/procedural-shiba/';
const sources = new Set([
  'README.md','src/shell.html','src/style.css','src/shiba/procedural/loading.css','src/shiba/procedural/game-ui.css','src/shiba/procedural/game-ui.html','assets/shiba-cover.webp','assets/tokyo-night.webp','art/procedural-shiba/loading-art.md','build.mjs','package.json','package-lock.json','东京塔与芝公园全景.html',
  'checks/procedural-shiba.mjs','checks/procedural-shiba-browser.mjs','art/shiba/gates.py',
  ...['bundle.mjs','classic.mjs','distance.mjs','prepare-gate.py','gate-plaque.png','remove-parked.mjs','source-pack.mjs'].map(n=>buildTools+n),
  ...['index.html','LICENSE','package.json','package-lock.json','src/world/outline-tile.js'].map(n=>viewer+n),
  ...['geometry.zip','atlases.zip','imagery.zip','NOTICE.txt','shiba-dusk.webp','barlow-condensed-black-italic.ttf'].map(n=>'assets/procedural-shiba/'+n),
  ...inputs.filter(n=>n.startsWith(viewer+'src/') || n.startsWith('src/') || n.startsWith('assets/'))
]);
const entries = {};
for (const name of [...sources].sort()) {
  const bytes = await readFile(name);
  entries[directory+'/'+name] = [bytes,{level:/\.(zip|jpg|png)$/.test(name) ? 0 : 6}];
}
entries[directory+'/index.html'] = [Buffer.from(html),{level:4}];
const archive = zipSync(entries,{mtime:new Date(2020,0,1)});
const temp = target+'.'+randomUUID()+'.tmp';
try {
  await writeFile(temp,archive,{flag:'wx'});
  await rename(temp,target);
} finally {
  await rm(temp,{force:true});
}
console.log(sources.size+' game source and data files plus offline game, '+(archive.length/1048576).toFixed(2)+' MiB: '+target);
