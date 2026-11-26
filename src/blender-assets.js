import {registerStudioAssets} from './studio-models.js';
export {studioModel,rigSlots} from './studio-models.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import marlin from '../assets/marlin-turbo.glb';
import solano from '../assets/solano-gt.glb';
import van from '../assets/relay-van.glb';
import rico from '../assets/rico.glb';
import mara from '../assets/mara.glb';
import ramon from '../assets/ramon.glb';
import streetFleet from '../assets/street-fleet.glb';
import streetResidents from '../assets/street-residents.glb';

import tokyoBay from '../assets/tokyo-bay.glb';

const files={tokyoBay,marlin,solano,van,rico,mara,ramon};
let loading;
export function loadStudio(){
 if(!loading){
  const loader=new GLTFLoader();
  const original=Object.entries(files).map(async([key,bytes])=>{
   const {scene}=await loader.parseAsync(bytes.buffer,'');return [[key,scene]];
  });
  const groups=[streetFleet,streetResidents].map(async bytes=>{
   const {scene}=await loader.parseAsync(bytes.buffer,'');
   return scene.children.map(asset=>[asset.userData.assetKey,asset]);
  });
  loading=Promise.all([...original,...groups]).then(lists=>{registerStudioAssets(lists.flat())}).catch(error=>{loading=null;throw error});
 }
 return loading;
}
