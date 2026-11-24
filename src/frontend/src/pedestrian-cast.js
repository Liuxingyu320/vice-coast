import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadModel} from './model-assets.js';

const files={
 leather:'leather-youth.glb',floral:'floral-uncle.glb',tattoo:'tattoo-youth.glb',
 passer0:'passer-01.glb',passer1:'passer-02.glb',passer2:'passer-03.glb',passer3:'passer-04.glb',
 passer4:'passer-05.glb',passer5:'passer-06.glb',passer6:'passer-07.glb',passer7:'passer-08.glb'
};
let scenes,loading;
export function loadPedestrians(){
 if(!loading){
  const loader=new GLTFLoader();
  loading=Promise.all(Object.entries(files).map(async([key,file])=>{
   const {scene}=await loader.parseAsync(await loadModel('assets/pedestrians/'+file),'');
   return [key,scene];
  })).then(entries=>{
   scenes=Object.fromEntries(entries);
  }).catch(error=>{
   loading=null;throw error});
 }
 return loading;
}
export const pedestriansReady=()=>!!scenes;
export const pedestrianScene=key=>scenes?.[key]??null;
