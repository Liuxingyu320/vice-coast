import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {distanceArchive} from './distance.mjs';
import {classicGame} from './classic.mjs';
import {zipSync} from 'three/addons/libs/fflate.module.js';

const vendor=path.resolve('vendor/procedural-tokyo');
const assetRoot='assets/procedural-shiba/';
const gameRoot='src/shiba/procedural/';
const compile={bundle:true,target:'es2022',write:false,minify:true,legalComments:'inline',metafile:true};
const pinThree={name:'district-three-runtime',setup(builder){
  builder.onResolve({filter:/^three(?:\/|$)/},args=>{
    if(args.pluginData?.pinned||args.importer.startsWith(vendor+path.sep))return;
    return builder.resolve(args.path,{kind:args.kind,resolveDir:vendor,pluginData:{pinned:true}});
  });
}};

export async function buildMap(){
  const names=['geometry','atlases','imagery'];
  const [shell,notice,worker,packs,cover,font,loadingCSS,uiCSS,ui,classic]=await Promise.all([
    readFile(path.join(vendor,'index.html'),'utf8'),readFile(assetRoot+'NOTICE.txt','utf8'),
    build({...compile,entryPoints:[path.join(vendor,'src/world/tileWorker.js')],format:'iife'}),
    Promise.all(names.map(name=>readFile(assetRoot+name+'.zip'))),readFile(assetRoot+'shiba-dusk.webp'),
    readFile(assetRoot+'barlow-condensed-black-italic.ttf'),readFile(gameRoot+'loading.css','utf8'),
    readFile(gameRoot+'game-ui.css','utf8'),readFile(gameRoot+'game-ui.html','utf8'),classicGame()
  ]);
  names.push('distance');packs.push(Buffer.from(distanceArchive(packs[0])));
  const models=['rico','mara','ramon','street-residents','marlin-turbo','solano-gt','relay-van','street-fleet'];
  const cast=await Promise.all(models.map(async model=>['studio/'+model+'.glb',await readFile('assets/'+model+'.glb')]));
  names.push('studio');packs.push(Buffer.from(zipSync(Object.fromEntries(cast),{level:5,mtime:new Date(2020,0,1)})));
  const main=await build({...compile,format:'esm',plugins:[pinThree],loader:{'.glb':'binary'},
    stdin:{resolveDir:vendor,sourcefile:'shiba-game.mjs',contents:`
      import {DefaultLoadingManager} from 'three';
      import {gunzipSync} from 'three/addons/libs/fflate.module.js';
      import {installAssets} from '../../src/shiba/procedural/local-assets.js';
      import {failLoading} from '../../src/shiba/procedural/loading.js';
      const query=new URLSearchParams(location.search),classic=document.getElementById('original-game');
      try{
        if(query.get('mode')==='original'||query.has('replay')||query.has('sample')){
          const bytes=Uint8Array.fromBase64?Uint8Array.fromBase64(classic.textContent):Uint8Array.from(atob(classic.textContent),c=>c.charCodeAt(0));
          const data=JSON.parse(new TextDecoder().decode(gunzipSync(bytes)));
          const doc=new DOMParser().parseFromString(data.html,'text/html');
          document.head.replaceChildren(...doc.head.childNodes);document.body.replaceChildren(...doc.body.childNodes);
          const run=document.createElement('script');run.textContent=data.js;document.body.append(run);
        }else{
          classic.remove();
          const packs=Array.from(document.querySelectorAll('script[data-map-pack]'),node=>{const data=node.textContent;node.remove();return data;});
          installAssets(packs,${JSON.stringify(worker.outputFiles[0].text)},DefaultLoadingManager);
          packs.length=0;await import('./src/main.js');
        }
      }catch(error){failLoading();throw error;}
    `}});
  const style=loadingCSS.replace('../../../'+assetRoot+'barlow-condensed-black-italic.ttf',()=>'data:font/ttf;base64,'+font.toString('base64'));
  const archives=packs.map((bytes,i)=>'<script type="application/octet-stream" data-map-pack="'+names[i]+'">'+bytes.toString('base64')+'</script>').join('\n');
  const program=main.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const html=shell.replace('<link rel="stylesheet" href="../../src/shiba/procedural/loading.css">',()=>'<style>'+style+'\n'+uiCSS+'</style>')
    .replace('../../'+assetRoot+'shiba-dusk.webp',()=>'data:image/webp;base64,'+cover.toString('base64'))
    .replace('</head>','<link rel="icon" href="data:,"></head>')
    .replace('<!--DISTRICT_GAME-->',()=>ui.replace('<!--LEDGER_DIALOGUE-->',()=>classic.dialogue))
    .replace('<script type="module" src="/src/main.js"></script>',()=>archives+'\n<script type="application/octet-stream" id="original-game">'+classic.payload.toString('base64')+'</script>\n<script type="module">'+program+'</script>')
    .replace('</html>',()=>'<!--\n'+notice.replaceAll('-->','-- >')+'\n-->\n</html>');
  return {html,inputs:Object.keys({...main.metafile.inputs,...worker.metafile.inputs,...classic.inputs})};
}
