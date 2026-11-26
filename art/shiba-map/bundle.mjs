import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {zipSync} from 'three/addons/libs/fflate.module.js';
import {classicGame} from './classic.mjs';
import {compileMap,surveyInputs} from './compile.mjs';

const root='src/shiba/district/', art='assets/shiba-game/';
const models=['rico','mara','ramon','street-residents','marlin-turbo','solano-gt','relay-van','street-fleet'];
const readText=path=>readFile(path,'utf8');
export async function buildMap(){
  const [world,classic,client,shell,hud,style,ui,cover,font,ofl,three]=await Promise.all([
    compileMap(),classicGame(),build({entryPoints:[root+'entry.js'],format:'esm',bundle:true,target:'es2022',minify:true,
      write:false,metafile:true,legalComments:'inline',loader:{'.jpg':'dataurl','.png':'dataurl'}}),
    readText(root+'shell.html'),readText(root+'game-ui.html'),readText(root+'loading.css'),readText(root+'game-ui.css'),
    readFile(art+'shiba-dusk.webp'),readFile(art+'barlow-condensed-black-italic.ttf'),readText(art+'Barlow-OFL.txt'),
    readText('node_modules/three/LICENSE')
  ]);
  const studio=await Promise.all(models.map(async name=>['studio/'+name+'.glb',await readFile('assets/'+name+'.glb')]));
  const cars=Buffer.from(zipSync(Object.fromEntries(studio),{level:5,mtime:new Date(2020,0,1)}));
  const pack=(name,bytes)=>'<script type="application/octet-stream" '+name+'>'+bytes.toString('base64')+'</script>';
  const script=client.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const data=[pack('data-game-pack="district"',world.bytes),pack('data-game-pack="cast"',cars),pack('id="original-game"',classic.payload),
    '<script type="module">'+script+'</script>','<!--\n'+ofl+'\n'+three+'\n-->'].join('\n');
  const html=shell.replace('/*GAME_STYLE*/',()=>style.replace('../../../'+art+'barlow-condensed-black-italic.ttf',()=>'data:font/ttf;base64,'+font.toString('base64'))+'\n'+ui)
    .replace('SHIBA_ART',()=>'data:image/webp;base64,'+cover.toString('base64'))
    .replace('<!--GAME_HUD-->',()=>hud.replace('<!--LEDGER_DIALOGUE-->',()=>classic.dialogue)).replace('<!--GAME_DATA-->',()=>data);
  const inputs=new Set([...Object.keys(client.metafile.inputs),...Object.keys(classic.inputs),...surveyInputs,...models.map(n=>'assets/'+n+'.glb')]);
  return {html,inputs:[...inputs].filter(p=>p.startsWith('assets/')||p.startsWith('src/')),manifest:world.manifest};
}
