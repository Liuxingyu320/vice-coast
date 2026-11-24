import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadPedestrians} from './pedestrian-cast.js';
import {loadModel, streetVehicleFiles} from './model-assets.js';

const files = {
 tokyoBay: 'assets/tokyo-bay.glb',
 marlin: 'assets/marlin-turbo.glb',
 solano: 'assets/solano-gt.glb',
 van: 'assets/relay-van.glb',
 rico: 'assets/rico.glb',
 mara: 'assets/mara.glb',
 ramon: 'assets/ramon.glb',
 shibaPark: 'assets/shiba-park.glb',
 ...streetVehicleFiles,
};
const modelGroups = ['assets/street-fleet.glb', 'assets/street-residents.glb'];
let models,loading;
export function loadStudio(){
 if(!loading){
  const loader=new GLTFLoader();
  const original=Object.entries(files).map(async([key,path])=>{
   const {scene}=await loader.parseAsync(await loadModel(path),'');
   return [[key,scene]];
  });
  const groups=modelGroups.map(async path=>{
   const {scene}=await loader.parseAsync(await loadModel(path),'');
   return scene.children.map(asset=>[asset.userData.assetKey,asset]);
  });
  loading=Promise.all([Promise.all([...original,...groups]),loadPedestrians()])
   .then(([lists])=>{models=Object.fromEntries(lists.flat())})
   .catch(error=>{loading=null;throw error});
 }
 return loading;
}
export const studioModel=name=>models[name].clone(true);
export function rigSlots(model){
 const slots={};
 model.traverse(node=>{if(node.userData.rigSlot)slots[node.userData.rigSlot]=node});
 return slots;
}
