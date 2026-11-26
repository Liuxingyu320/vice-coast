import {createVenues} from './venues.js';
import * as T from 'three';
import {batcher,canvasTexture} from './models.js';
import {xs,zs,rng,roadWidth} from './data.js';
import {studioModel} from './studio-models.js';
import layout from '../assets/tokyo-layout.json';

// Timetable in seconds and metres relative to the authored train position.
const trainStops=layout.trainStops;
function atmosphere(scene){
 const uniforms={uTime:{value:0},uNight:{value:0}};
 const sky=new T.Mesh(new T.SphereGeometry(1100,32,20),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms,
 vertexShader:'varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec3 v;uniform float uTime,uNight;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 void main(){vec3 d=normalize(v);float h=d.y;vec3 color=mix(vec3(.91,.74,.65),vec3(.69,.69,.77),smoothstep(0.,.16,h));color=mix(color,vec3(.45,.55,.69),smoothstep(.13,.47,h));color=mix(color,vec3(.22,.32,.49),smoothstep(.42,1.,h));
 vec3 sd=normalize(vec3(.30,.162,-1.));float sun=length(d-sd);color+=vec3(.16,.09,.015)*exp(-sun*5.);
 float disc=1.-smoothstep(.022,.024,sun);color=mix(color,vec3(1.,.9,.74),disc);
 vec2 uv=vec2(atan(d.z,d.x)*7.+uTime*.001,h*22.);float n=noise(uv)+noise(uv*2.5)*.38;float cloud=smoothstep(.84,1.22,n)*smoothstep(.025,.16,h)*(1.-smoothstep(.3,.65,h));color=mix(color,vec3(.95,.67,.66),cloud*.46);vec3 night=mix(vec3(.27,.33,.42),vec3(.09,.14,.22),smoothstep(0.,.43,h));night=mix(night,vec3(.024,.027,.077),smoothstep(.42,1.,h));vec2 stars=vec2(atan(d.x,d.z),asin(d.y))*210.;float spark=step(.987,hash(floor(stars)))*(1.-smoothstep(.05,.29,length(fract(stars)-.5)))*smoothstep(.06,.32,h);night+=vec3(.66,.76,.93)*spark;float moon=length(d-normalize(vec3(.38,.20,-1.)));night+=vec3(.20,.33,.59)*exp(-moon*16.);night=mix(night,vec3(.86,.89,1.),1.-smoothstep(.034,.036,moon));gl_FragColor=vec4(mix(color,night,uNight),1.);}`}));
 scene.add(sky);
 const ocean=new T.Mesh(new T.PlaneGeometry(3400,3400),new T.ShaderMaterial({uniforms,vertexShader:'varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}',fragmentShader:`varying vec3 wp;uniform float uTime,uNight;
 void main(){float far=smoothstep(10.,850.,distance(wp.xz,cameraPosition.xz));float wave=sin(wp.z*1.4+sin(wp.x*.19+uTime*.7)*1.4+uTime*1.1)*.5+.5;float wave2=sin(wp.z*.47+wp.x*.11+uTime*.7)*.5+.5;
 vec3 c=mix(vec3(.14,.48,.53),vec3(.48,.62,.67),far);vec2 dir=normalize(wp.xz-cameraPosition.xz);float shine=pow(max(dot(dir,normalize(vec2(.39,-1.))),0.),13.);c+=vec3(.35,.16,.1)*shine;c+=vec3(.53,.49,.29)*smoothstep(.91,.99,wave)*wave2*(.16+shine*.85)*(1.-far);vec3 noct=mix(vec3(.045,.13,.21),vec3(.22,.21,.34),far)+vec3(.29,.37,.57)*shine*wave2*smoothstep(.75,.99,wave);gl_FragColor=vec4(mix(c,noct,uNight),1.);}`}));
 ocean.rotation.x=-Math.PI/2;ocean.position.y=-.52;scene.add(ocean);
 return (time,cam,night)=>{uniforms.uNight.value=night?1:0;uniforms.uTime.value=time;sky.position.copy(cam.position)};
}
export function createWorld(scene){
 const atmo=atmosphere(scene);scene.fog=new T.FogExp2(0xc1b6b1,.00265);
 const hemi=new T.HemisphereLight(0xffe5ce,0x8b93bb,1.28);scene.add(hemi);let night=false;const lights=new T.Group();scene.add(lights);const lit=batcher(lights);
 const sun=new T.DirectionalLight(0xffd6af,2.28);sun.position.set(320,264,-354);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-350,right:350,top:335,bottom:-335,near:1,far:1050});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.18;sun.shadow.bias=-.00025;scene.add(sun);
 const env=canvasTexture(512,256,(c,w,h)=>{const g=c.createLinearGradient(0,0,0,h);for(const [v,col] of [[0,'#3c476a'],[.23,'#9e80ae'],[.43,'#ffd4a1'],[.49,'#fff1c0'],[.50,'#765e79'],[.59,'#313f58'],[1,'#323048']])g.addColorStop(v,col);c.fillStyle=g;c.fillRect(0,0,w,h);
 c.fillStyle='#424455';for(let x=0;x<w;x+=18)c.fillRect(x,119-Math.sin(x*3)*3,12,12);});env.mapping=T.EquirectangularReflectionMapping;scene.environment=env;scene.environmentIntensity=.95;

 const city=studioModel('tokyoBay');
 city.name='Tokyo Bay';
 scene.add(city);
 let train;
 city.traverse(obj=>{
  if(obj.userData.tokyoTrain)train=obj;
  if(obj.isMesh){obj.castShadow=obj.name!=='Ground';obj.receiveShadow=true}
 });
 train.traverse(obj=>{obj.castShadow=false});
 const colliders=layout.colliders.map(rect=>({...rect}));
 const footprints=layout.footprints.map(rect=>({...rect}));
 const objects=[],a=batcher(scene),{b,rod,sphere}=a,sPlane=new T.PlaneGeometry(1,1);
 const neons=[0xbb5352,0x88a8a2,0xe8b376];
 const block=(x,z,w,d)=>colliders.push({x,z,w:w/2,d:d/2});
 const asphalt=0x48475c,mark=0xdeab65,white=0xe6e1ce;
 for(const x of xs)b(x,.024,0,roadWidth,.055,502,asphalt);
 for(const z of zs)b(-40,.025,z,422,.056,roadWidth,asphalt);
 // A seamless dry aggregate with broken wheel-polish bands gives the road scale at walking speed.
 const grain=canvasTexture(256,256,(c,w,h)=>{const im=c.createImageData(w,h),rr=rng(992);
  for(let i=0;i<w*h;i++){const n=rr();im.data[4*i]=108+Math.floor(n*24);im.data[4*i+1]=110+Math.floor(n*23);im.data[4*i+2]=128+Math.floor(n*27);im.data[4*i+3]=255}c.putImageData(im,0,0)});
 grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(3,68);grain.anisotropy=4;
 const roadMat=new T.MeshLambertMaterial({map:grain,color:0x737e80});
 const roadG=new T.PlaneGeometry(roadWidth,502);
 for(const x of xs){const m=new T.Mesh(roadG,roadMat);m.rotation.x=-Math.PI/2;m.position.set(x,.057,0);m.receiveShadow=true;scene.add(m)}
 const roadG2=new T.PlaneGeometry(roadWidth,422);
 for(const z of zs){const m=new T.Mesh(roadG2,roadMat);m.rotation.set(-Math.PI/2,0,Math.PI/2);m.position.set(-40,.059,z);m.receiveShadow=true;scene.add(m)}
 const noCross=(v,list)=>list.every(n=>Math.abs(n-v)>11.2);
 for(const x of xs)for(let z=-248;z<250;z+=4){
  if(!noCross(z,zs))continue;
  for(const off of [-.2,.2])b(x+off,.063,z,.13,.015,4,mark);
  if(z%8===0)for(const off of [-5.5,5.5])b(x+off,.066,z,.105,.014,2.45,white);
 }
 for(const z of zs)for(let x=-248;x<171;x+=4){if(!noCross(x,xs))continue;for(const off of [-.18,.18])b(x,.064,z+off,4,.012,.13,mark);}
 for(const x of xs)for(const z of zs){for(let i=-4;i<=4;i++){for(const q of [-1,1]){
  b(x+i*1.55,.072,z+q*10.8,.66,.019,1.95,white);b(x+q*10.8,.074,z+i*1.55,1.95,.018,.66,white)}}
 }
 const poolTex=canvasTexture(128,128,(c,w,h)=>{let g=c.createRadialGradient(64,64,1,64,64,63);g.addColorStop(0,'rgba(250,212,155,.52)');g.addColorStop(.42,'rgba(240,181,131,.27)');g.addColorStop(1,'rgba(243,185,145,0)');c.fillStyle=g;c.fillRect(0,0,w,h)});
 const poolMat=new T.MeshBasicMaterial({map:poolTex,transparent:true,blending:T.AdditiveBlending,depthWrite:false});

 for(const x of xs)for(let z=-219;z<=229;z+=40){
  lit.add(sPlane,x+8,.088,z,8,12,1,0xffe1ae,-Math.PI/2,0,0,poolMat);
 }
 // Sailboats tie the far shoreline to the active beach and break up the open water.
 const sailGeo=new T.BufferGeometry();sailGeo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,0,1,0,1,0,.09],3));sailGeo.computeVertexNormals();
 const canvasSail=new T.MeshLambertMaterial({color:0xffffff,side:T.DoubleSide});
 for(const [xx,zz,sz] of [[253,43,1.1],[270,-37,1.4],[249,170,.72],[290,-184,1.15],[311,82,.82]]){
  sphere(xx,.03,zz,3.2*sz,.55*sz,1.12*sz,0xe1cfb6);b(xx,.42,zz,3.4*sz,.40*sz,1.45*sz,0x597583);
  rod(xx,3.3*sz,zz,.065,6.9*sz,0xa18877);a.add(sailGeo,xx+.12,1.15*sz,zz,2.55*sz,5.45*sz,1,0xffddaf,0,.24,0,canvasSail);
  a.add(sailGeo,xx-.1,.98*sz,zz,1.95*sz,4.75*sz,1,0xe49b92,0,Math.PI+.24,0,canvasSail);
 }
 // Alternating signal heads and street-name plates turn cross streets into recognizable junctions.
 const signalLights=[];const lightG=new T.CircleGeometry(.19,10);
 for(const crossing of [-160,0,160]){const xx=147.5,zz=crossing+12.6;rod(xx,3.55,zz,.115,7.1,0x596877);block(xx,zz,.24,.24);

  b(xx+4.15,7.02,zz,8.5,.16,.16,0x586674);b(xx+7.9,6.56,zz,1.65,.58,.40,0x434f53);
  for(let n=0;n<3;n++){
   const lamp=new T.Mesh(lightG,new T.MeshBasicMaterial({color:0x55454a}));
   lamp.position.set(xx+8.36-n*.46,6.56,zz+.21);scene.add(lamp);signalLights.push({lamp,n,phase:zz});
  }
 }
 const gullG=new T.BufferGeometry();gullG.setAttribute('position',new T.Float32BufferAttribute([0,0,0,-.85,.27,.08,-1.55,.05,.18,0,0,0,-.85,.27,.08,-.42,-.02,.28,0,0,0,.85,.27,.08,1.55,.05,.18,0,0,0,.85,.27,.08,.42,-.02,.28],3));gullG.computeVertexNormals();
 const flock=new T.InstancedMesh(gullG,new T.MeshBasicMaterial({color:0x7c707a,side:T.DoubleSide}),12),bird=new T.Object3D();flock.frustumCulled=false;scene.add(flock);
 const wheel=new T.Group();wheel.position.set(207,16,-128);wheel.rotation.y=-.45;scene.add(wheel);
 const rot=new T.Group();wheel.add(rot);const linePts=[];const cabinGeo=new T.BoxGeometry(1.8,1.15,1.3),cabins=[];
 for(let j=0;j<16;j++){const t=j*Math.PI/8,xx=Math.cos(t)*13,yy=Math.sin(t)*13;
  linePts.push(0,0,0,xx,yy,0,xx,yy,0,Math.cos(t+Math.PI/8)*13,Math.sin(t+Math.PI/8)*13,0);
  const cabin=new T.Mesh(cabinGeo,new T.MeshLambertMaterial({color:neons[j%3]}));cabin.position.set(xx,yy-.6,0);rot.add(cabin);cabins.push(cabin);
 }
 const lines=new T.BufferGeometry();lines.setAttribute('position',new T.Float32BufferAttribute(linePts,3));rot.add(new T.LineSegments(lines,new T.LineBasicMaterial({color:0xffd6af})));
 for(const dir of [-1,1])b(207+dir*3.18,7.75,-128,.6,16.5,.7,0xe6b7a6,0,0,dir*.39);
 const venues=createVenues(scene,colliders,footprints);a.flush();lit.flush();lights.visible=false;
 return {colliders,footprints,objects,venues,setNight(value){night=value;lights.visible=value;hemi.color.setHex(value?0xabc6ff:0xffe5ce);hemi.groundColor.setHex(value?0x69597b:0x8b93bb);hemi.intensity=value?.93:1.28;sun.color.setHex(value?0xa3b5ed:0xffd6af);sun.intensity=value?.65:2.28;scene.fog.color.setHex(value?0x414f64:0xc1b6b1);scene.environmentIntensity=value?.50:.95},update(t,cam){atmo(t,cam,night);

  // Both cab ends are modeled. Reverse at the terminal and dwell at Ariake.
  const phase=(t+12)%120;
  let i=1;while(trainStops[i][0]<phase)i++;
  const [ta,xa]=trainStops[i-1],[tb,xb]=trainStops[i];
  const u=(phase-ta)/(tb-ta);
  train.position.x=xa+(xb-xa)*u*u*(3-2*u);
  for(const {lamp,n,phase} of signalLights){const tick=((t+phase+400)%19);const on=tick<9?2:tick<11?1:0;lamp.material.color.setHex(n===on?[0xff4f61,0xffc85f,0x82f1bb][n]:0x51434d)}
  for(let i=0;i<12;i++){const phase=t*.11+i*.38;bird.position.set(200+Math.sin(phase)*30+i*1.6,11+i%4+Math.sin(t*.7+i)*.5,-14-i*7+Math.cos(phase)*25);bird.rotation.set(0,phase,.12*Math.sin(t*2.8+i));bird.scale.setScalar(.82+i%3*.12);bird.updateMatrix();flock.setMatrixAt(i,bird.matrix)}flock.instanceMatrix.needsUpdate=true;
  rot.rotation.z=t*.063;for(const c of cabins)c.rotation.z=-rot.rotation.z}};
}
