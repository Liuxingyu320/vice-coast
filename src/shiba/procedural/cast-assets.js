import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {registerStudioAssets} from '../../studio-models.js';
import {readStudioFile} from './local-assets.js';

async function modelScene(key) {
  const bytes=readStudioFile(key);
  const buffer=bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes.buffer:bytes.slice().buffer;
  return (await new GLTFLoader().parseAsync(buffer,'')).scene;
}
const groupEntries=scene=>scene.children.map(model=>[model.userData.assetKey,model]);
export async function loadDistrictCast() {
  const [cast,residents]=await Promise.all([
    Promise.all(['rico','mara','ramon'].map(async key=>[key,await modelScene(key)])),
    modelScene('street-residents')
  ]);
  registerStudioAssets([...cast,...groupEntries(residents)]);
}
const loadedCars=new Map();
export function loadCarAsset(key) {
  const vehicles={marlin:'marlin-turbo',solano:'solano-gt',van:'relay-van'};
  const file=vehicles[key]??'street-fleet';
  if(!loadedCars.has(file)) {
    const promise=modelScene(file)
      .then(scene=>registerStudioAssets(file==='street-fleet'?groupEntries(scene):[[key,scene]]))
      .catch(error=>{loadedCars.delete(file);throw error;});
    loadedCars.set(file,promise);
  }
  return loadedCars.get(file);
}
