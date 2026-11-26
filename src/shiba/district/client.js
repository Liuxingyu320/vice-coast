import * as T from 'three';
import {MapControls} from 'three/addons/controls/MapControls.js';
import {loadMaterials} from './materials.js';
import {DistrictTiles,plantTrees} from './streamer.js';
import {openFiles,readJSON} from './storage.js';
import {createDistrictGame} from './district-game.js';
import {finishLoading,setLoading} from './loading.js';
import {buildFurniture} from '../furniture.js';
import {furnishAvenue} from '../avenue.js';
import {glowMap} from '../lighting.js';

const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));

function createSky(scene){
  const u={top:{value:new T.Color()},horizon:{value:new T.Color()}};
  const dome=new T.Mesh(new T.SphereGeometry(3900,32,16),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:u,
    vertexShader:'varying vec3 ray; void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 ray; uniform vec3 top,horizon;
      void main(){float t=smoothstep(-.06,.79,normalize(ray).y);
      gl_FragColor=vec4(mix(horizon,top,t),1.);
      #include <colorspace_fragment>
      }`
  }));
  dome.renderOrder=-10;scene.add(dome);return {dome,u};
}
export async function enterDistrict(){
  setLoading(.03,'展开街区');await nextFrame();
  openFiles();
  const manifest=readJSON('manifest'),layout=readJSON('layout'),physical=readJSON('physical'),steps=readJSON('steps'),decks=readJSON('decks');
  const renderer=new T.WebGLRenderer({canvas:document.getElementById('district-scene'),antialias:true,powerPreference:'high-performance'});
  const mobile=matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.2:1.5));
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(63,1,.12,4900);
  const controls=new MapControls(camera,renderer.domElement);
  const resize=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/Math.max(1,innerHeight);camera.updateProjectionMatrix();};
  resize();addEventListener('resize',resize);
  const sun=new T.DirectionalLight(0xffe1bb,2.4),hemi=new T.HemisphereLight(0xe1edff,0xb1a798,1.8);
  scene.add(sun,sun.target,hemi);sun.castShadow=true;sun.shadow.mapSize.setScalar(mobile?1024:2048);
  Object.assign(sun.shadow.camera,{left:-58,right:58,top:58,bottom:-58,near:2,far:270});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00025;sun.shadow.normalBias=.035;
  const {dome,u}=createSky(scene);scene.fog=new T.FogExp2(0xcbd5d7,.00049);
  const evening={value:0},clockTime={hour:15.3,label(){return String(Math.floor(this.hour)).padStart(2,'0')+'∶'+String(Math.round(this.hour%1*60)).padStart(2,'0');}};
  const materialFor=await loadMaterials(manifest,layout,evening,f=>setLoading(.09+f*.32,'铺设街面与建筑立面'));
  const streamer=new DistrictTiles(scene,manifest,materialFor),trees=plantTrees(scene,layout.trees,materialFor,layout.coreTreeCount);
  const app={scene,camera,renderer,controls,clockTime,streamer,manifest,layout,physical,steps,decks};
  setLoading(.46,'布置芝公园');await nextFrame();
  const game=app.game=await createDistrictGame(app,new URLSearchParams(location.search));
  const terrain=(x,y)=>game.nav.ground(x,-y);
  const fixtures=buildFurniture(scene,null,terrain,layout,glowMap(),game.nav.canWalk);
  const avenue=await furnishAvenue(scene,null,terrain,game.nav.canWalk,layout.fixtures);
  const start=game.isMap?controls.target:game.pos;
  streamer.refresh(start.x,start.z);trees(start.x,start.z,game.isMap);
  const total=Math.max(1,streamer.jobs.length);
  while(streamer.jobs.length){
    streamer.work(14);setLoading(.56+.4*(1-streamer.jobs.length/total),'装入街区与城市远景');await nextFrame();
  }
  let lastNight=null,watch=0,lastX=Infinity,lastZ=Infinity,lastMap=null,previous=performance.now();
  function frame(now){
    const elapsed=Math.max(0,(now-previous)/1000),dt=Math.min(.10,elapsed);previous=now;
    game.update(dt);const center=game.isMap?controls.target:game.pos;
    watch+=elapsed;
    if(watch>.22&&(Math.hypot(center.x-lastX,center.z-lastZ)>8||lastMap!==game.isMap)){
      streamer.refresh(center.x,center.z);trees(center.x,center.z,game.isMap);
      lastX=center.x;lastZ=center.z;lastMap=game.isMap;watch=0;
    }
    streamer.work(3);
    const night=clockTime.hour>=19||clockTime.hour<6;
    if(night!==lastNight){
      evening.value=night?1:0;
      u.top.value.set(night?'#142541':'#77a6cd');u.horizon.value.set(night?'#52627c':'#e1dfd5');
      scene.fog.color.copy(u.horizon.value);
      hemi.color.set(night?'#b7c9ed':'#e1edff');hemi.groundColor.set(night?'#77727e':'#b9afa1');hemi.intensity=night?1.15:1.65;
      sun.color.set(night?'#b1caff':'#ffe2bc');sun.intensity=night?.73:2.55;lastNight=night;
    }
    const height=game.floor||0;
    sun.position.set(center.x-58,height+95,center.z+52);sun.target.position.set(center.x,height,center.z);
    dome.position.copy(camera.position);fixtures(now*.001,evening.value);avenue.update(evening.value,now*.001);
    renderer.render(scene,camera);
  }
  frame(previous);window.__app=app;game.loading=false;game.ui.refresh();finishLoading();
  renderer.setAnimationLoop(frame);
}
