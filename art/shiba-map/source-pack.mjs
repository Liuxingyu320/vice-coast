import path from 'node:path';
import {readFile,rename,rm,writeFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {zipSync} from 'three/addons/libs/fflate.module.js';
import {buildMap} from './bundle.mjs';

const onlyCode=process.argv.includes('--code-only');
const directory=onlyCode?'东京湾街区-游戏源码':'东京湾街区-游戏整合源码';
const target=path.resolve(process.argv.slice(2).find(p=>p!=='--code-only')??'../'+directory+'.zip');
const {html,inputs}=await buildMap();
const files=new Set([...inputs,'build.mjs','package.json','package-lock.json','README.md','东京塔与芝公园全景.html',
  'checks/shiba-survey.mjs','checks/shiba-routes.mjs','checks/shiba-region-browser.mjs','checks/shiba-game-browser.mjs','src/shell.html','src/style.css',
  'assets/shiba-cover.webp','assets/tokyo-night.webp','art/shiba/sources.md']);
for(const dir of ['art/shiba-map','src/shiba/district','assets/shiba-game']){
  for(const entry of await readdir(dir,{withFileTypes:true}))if(entry.isFile()&&!entry.name.startsWith('.'))files.add(dir+'/'+entry.name);
}
const entries={};
for(const name of [...files].sort()){
  if(onlyCode&&(name.startsWith('assets/')||name==='art/shiba/sources.md'))continue;
  const bytes=await readFile(name);
  entries[directory+'/'+name]=[bytes,{level:/\.(?:gz|webp|png|jpg)$/i.test(name)?0:5}];
}
if(!onlyCode)entries[directory+'/index.html']=[Buffer.from(html),{level:4}];
const archive=zipSync(entries,{mtime:new Date(2020,0,1)}),temp=target+'.'+randomUUID()+'.tmp';
try{await writeFile(temp,archive,{flag:'wx'});await rename(temp,target);}
finally{await rm(temp,{force:true});}
console.log(Object.keys(entries).length+' files, '+(archive.length/1048576).toFixed(1)+' MiB: '+target);
