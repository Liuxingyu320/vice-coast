import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

export async function classicGame(){
  const [program,shell,css,cover,night,license]=await Promise.all([
    build({entryPoints:['src/game.js'],bundle:true,format:'iife',minify:true,target:'es2022',write:false,metafile:true,
      loader:{'.glb':'binary','.gz':'binary','.jpg':'dataurl','.png':'dataurl'},legalComments:'inline'}),
    readFile('src/shell.html','utf8'),readFile('src/style.css','utf8'),readFile('assets/shiba-cover.webp'),
    readFile('assets/tokyo-night.webp'),readFile('node_modules/three/LICENSE','utf8')
  ]);
  const html=shell.replace('/*CSS*/',()=>css).replace('COVER_ASSET',()=>'data:image/webp;base64,'+cover.toString('base64'))
    .replace('MIDNIGHT_ASSET',()=>'data:image/webp;base64,'+night.toString('base64'));
  const payload=gzipSync(JSON.stringify({html,js:program.outputFiles[0].text+'\n/* '+license+' */'}));
  return {payload,inputs:program.metafile.inputs,dialogue:shell.match(/<section id="conversation"[\s\S]*?<\/section>/)[0]};
}
