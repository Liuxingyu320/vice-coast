import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {gunzipSync} from 'three/addons/libs/fflate.module.js';
import {loadPedestrians} from './pedestrian-cast.js';
import marlin from '../assets/marlin-turbo.glb';
import solano from '../assets/solano-gt.glb';
import van from '../assets/relay-van.glb';
import patrol from '../模型/六辆街头载具-GLB/都市街头巡逻警车.glb';
import streetVan from '../模型/六辆街头载具-GLB/老式市井面包车.glb';
import streetBike from '../模型/六辆街头载具-GLB/破旧跨骑摩托车.glb';
import streetScooter from '../模型/六辆街头载具-GLB/外卖配送电动车.glb';
import streetEbike from '../模型/六辆街头载具-GLB/共享电驴.glb';
import streetStall from '../模型/六辆街头载具-GLB/夜市三轮烧烤餐车.glb';
import rico from '../assets/rico.glb';
import mara from '../assets/mara.glb';
import ramon from '../assets/ramon.glb';
import streetFleet from '../assets/street-fleet.glb';
import streetResidents from '../assets/street-residents.glb';

import tokyoBay from '../assets/tokyo-bay.glb';
import shibaPark from '../assets/shiba-park.glb';

const files={tokyoBay,marlin,solano,van,rico,mara,ramon,patrol,streetVan,streetBike,streetScooter,streetEbike,streetStall};
let models,loading;
export function loadStudio(){
 if(!loading){
  const loader=new GLTFLoader();
  const glbBuffer=bytes=>{
   const raw=bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes):bytes;
   return raw.byteOffset||raw.byteLength!==raw.buffer.byteLength?raw.slice().buffer:raw.buffer;
  };
  const original=Object.entries(files).map(async([key,bytes])=>{
   const {scene}=await loader.parseAsync(glbBuffer(bytes),'');return [[key,scene]];
  });
  original.push((async()=>{const {scene}=await loader.parseAsync(glbBuffer(shibaPark),'');return [['shibaPark',scene]]})());
  const groups=[streetFleet,streetResidents].map(async bytes=>{
   const {scene}=await loader.parseAsync(bytes.buffer,'');
   return scene.children.map(asset=>[asset.userData.assetKey,asset]);
  });
  loading=Promise.all([...original,...groups]).then(async lists=>{models=Object.fromEntries(lists.flat());await loadPedestrians()}).catch(error=>{loading=null;throw error});
 }
 return loading;
}
export const studioModel=name=>models[name].clone(true);
export function rigSlots(model){
 const slots={};
 model.traverse(node=>{if(node.userData.rigSlot)slots[node.userData.rigSlot]=node});
 return slots;
}
