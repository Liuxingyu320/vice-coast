import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

const offlineDistrict = {
 name: 'compressed-shiba-model',
 setup(builder) {
  builder.onLoad({filter: /shiba-(park|pavement|horizon)\.glb$/}, async ({path}) => ({
   contents: gzipSync(await readFile(path), {level: 6}), loader: 'binary'
  }));
 }
};
const js=await build({entryPoints:['src/game.js'],bundle:true,loader:{'.glb':'binary','.gz':'binary','.jpg':'dataurl','.png':'dataurl'},format:'iife',plugins:[offlineDistrict],target:'es2022',minify:true,legalComments:'none',write:false});
const [shell,css,art,midnight,threeLicense]=await Promise.all([readFile('src/shell.html','utf8'),readFile('src/style.css','utf8'),readFile('assets/shiba-cover.webp'),readFile('assets/tokyo-night.webp'),readFile('node_modules/three/LICENSE','utf8')]);
let html=shell.replace('/*CSS*/',()=>css).replace('COVER_ASSET',()=>`data:image/webp;base64,${art.toString('base64')}`).replace('MIDNIGHT_ASSET',()=>`data:image/webp;base64,${midnight.toString('base64')}`).replace('/*GAME*/',()=>js.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
html=html.replace('</html>',()=>`<!-- Three.js license\n${threeLicense}\n-->\n</html>`);
await writeFile('index.html',html);
console.log('Built standalone index.html ('+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MB)');
