import * as T from 'three';
import {readFile} from './storage.js';
import {finishParking} from './parking.js';
import {buildingFinish} from '../facades.js';
import {finishPavement} from '../pavement.js';

export async function loadMaterials(manifest,layout,evening,onImage){
  const cache=new Map(),pending=[],loader=new T.TextureLoader();
  let completed=0;
  function texture(path,color){
    if(!path)return null;
    const key=path+(color?'#color':'#data');
    if(cache.has(key))return cache.get(key);
    const url=URL.createObjectURL(new Blob([readFile(path)],{type:path.endsWith('.png')?'image/png':'image/jpeg'}));
    let texture;
    pending.push(new Promise((resolve,reject)=>{
      texture=loader.load(url,()=>{URL.revokeObjectURL(url);onImage(++completed/cache.size);resolve();},undefined,()=>{
        URL.revokeObjectURL(url);reject(Error('Cannot load '+path));
      });
    }));
    texture.flipY=false;texture.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
    texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;
    cache.set(key,texture);return texture;
  }
  const library=manifest.materials.map(s=>{
    const m=new T.MeshStandardMaterial({name:s.name,color:new T.Color(...s.color.slice(0,3)),opacity:s.color[3],
      emissive:new T.Color(...s.emissive),roughness:s.rough,metalness:s.metal,map:texture(s.map,true),
      normalMap:texture(s.normal,false),emissiveMap:texture(s.emissiveMap,true),roughnessMap:texture(s.mr,false),metalnessMap:texture(s.mr,false),
      transparent:s.alpha==='BLEND',alphaTest:s.alpha==='MASK'?s.cutoff:0,side:s.side?T.DoubleSide:T.FrontSide});
    m.normalScale.setScalar(s.normalScale);
    if(s.name==='Leaf sprays'){m.alphaTest=.34;m.transparent=false;m.side=T.DoubleSide;m.color.set('#c3d1ad');}
    return m;
  });
  await Promise.all(pending);
  // Surface finishes depend on UVs and on the surveyed façade bay attributes.
  const catalog=new T.Group(),empty=new T.BufferGeometry(),bindings=new Map();
  for(const [layer,id] of manifest.bindings){
    const material=library[id],sample=new T.Mesh(empty,material);
    sample.name=layer;catalog.add(sample);bindings.set(layer+':'+id,sample);
  }
  const finish=buildingFinish(catalog,evening);for(const m of library)finish(m);
  finishPavement(catalog,layout,evening);
  finishParking(catalog,layout.landUse,layout.height);
  const distant=new T.MeshLambertMaterial({name:'远景建筑',color:0xafb4b7,side:T.FrontSide});
  distant.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 facadePos,facadeNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nfacadePos=position;facadeNormal=normal;');
    shader.fragmentShader='varying vec3 facadePos,facadeNormal;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float wall=1.-smoothstep(.15,.75,abs(normalize(facadeNormal).y));
      vec2 axis=normalize(vec2(-facadeNormal.z,facadeNormal.x)+vec2(.0001));
      vec2 bays=vec2(dot(facadePos.xz,axis)*.37,facadePos.y*.31);
      vec2 footprint=max(fwidth(bays),vec2(.02)), edge=abs(fract(bays)-.5);
      vec2 panes=1.-smoothstep(vec2(.33,.28)-footprint*.5,vec2(.33,.28)+footprint*.5,edge);
      float glass=mix(panes.x*panes.y,.38,smoothstep(.2,.9,max(footprint.x,footprint.y)));
      diffuseColor.rgb*=mix(vec3(.87,.86,.84),mix(vec3(1.),vec3(.38,.48,.57),glass),wall);`);
  };
  return (layer,id)=>id<0?distant:bindings.get(layer+':'+id).material;
}
