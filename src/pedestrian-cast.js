import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import leatherYouth from '../assets/pedestrians/leather-youth.glb';
import floralUncle from '../assets/pedestrians/floral-uncle.glb';
import tattooYouth from '../assets/pedestrians/tattoo-youth.glb';
import passer01 from '../assets/pedestrians/passer-01.glb';
import passer02 from '../assets/pedestrians/passer-02.glb';
import passer03 from '../assets/pedestrians/passer-03.glb';
import passer04 from '../assets/pedestrians/passer-04.glb';
import passer05 from '../assets/pedestrians/passer-05.glb';
import passer06 from '../assets/pedestrians/passer-06.glb';
import passer07 from '../assets/pedestrians/passer-07.glb';
import passer08 from '../assets/pedestrians/passer-08.glb';

const files={
 leather:leatherYouth,floral:floralUncle,tattoo:tattooYouth,
 passer0:passer01,passer1:passer02,passer2:passer03,passer3:passer04,
 passer4:passer05,passer5:passer06,passer6:passer07,passer7:passer08
};
let scenes,loading;
function glbBuffer(bytes){
 return bytes.byteOffset||bytes.byteLength!==bytes.buffer.byteLength?bytes.slice().buffer:bytes.buffer;
}
export function loadPedestrians(){
 if(!loading){
  const loader=new GLTFLoader();
  loading=Promise.all(Object.entries(files).map(async([key,bytes])=>{
   const {scene}=await loader.parseAsync(glbBuffer(bytes),'');
   return [key,scene];
  })).then(entries=>{
   scenes=Object.fromEntries(entries);
   // #region agent log
   fetch('http://127.0.0.1:7326/ingest/e9fbfe8e-3183-45ec-8b50-8cb955649747',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5f55f9'},body:JSON.stringify({sessionId:'5f55f9',runId:'pre',hypothesisId:'A',location:'pedestrian-cast.js:load',message:'pedestrians parsed',data:{keys:Object.keys(scenes),meshes:Object.fromEntries(Object.entries(scenes).map(([key,scene])=>{let n=0;scene.traverse(o=>{if(o.isMesh)n++});return [key,n]}))},timestamp:Date.now()})}).catch(()=>{});
   // #endregion
  }).catch(error=>{
   // #region agent log
   fetch('http://127.0.0.1:7326/ingest/e9fbfe8e-3183-45ec-8b50-8cb955649747',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5f55f9'},body:JSON.stringify({sessionId:'5f55f9',runId:'pre',hypothesisId:'A',location:'pedestrian-cast.js:fail',message:'pedestrian load failed',data:{error:String(error&&error.message||error)},timestamp:Date.now()})}).catch(()=>{});
   // #endregion
   loading=null;throw error});
 }
 return loading;
}
export const pedestriansReady=()=>!!scenes;
export const pedestrianScene=key=>scenes?.[key]??null;
