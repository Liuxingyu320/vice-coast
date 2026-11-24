import {createVenues} from './venues.js';
import * as T from 'three';
import {canvasTexture} from './models.js';
import {studioModel} from './blender-assets.js';
import {addShibaDistrict, shibaBuildings, shibaGround, shibaLimits} from './shiba-ground.js';

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
 ocean.rotation.x=-Math.PI/2;ocean.position.y=-4;scene.add(ocean);
 return (time,cam,night)=>{uniforms.uNight.value=night?1:0;uniforms.uTime.value=time;sky.position.copy(cam.position)};
}
export function createWorld(scene){
 const atmo=atmosphere(scene);scene.fog=new T.FogExp2(0xc1b6b1,.00115);
 const hemi=new T.HemisphereLight(0xffe5ce,0x8b93bb,1.28);scene.add(hemi);let night=false;
 const sun=new T.DirectionalLight(0xffd6af,2.28);sun.position.set(80,160,-40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-120,right:120,top:120,bottom:-120,near:1,far:420});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.18;sun.shadow.bias=-.00025;scene.add(sun,sun.target);
 const env=canvasTexture(512,256,(c,w,h)=>{const g=c.createLinearGradient(0,0,0,h);for(const [v,col] of [[0,'#3c476a'],[.23,'#9e80ae'],[.43,'#ffd4a1'],[.49,'#fff1c0'],[.50,'#765e79'],[.59,'#313f58'],[1,'#323048']])g.addColorStop(v,col);c.fillStyle=g;c.fillRect(0,0,w,h);
 c.fillStyle='#424455';for(let x=0;x<w;x+=18)c.fillRect(x,119-Math.sin(x*3)*3,12,12);});env.mapping=T.EquirectangularReflectionMapping;scene.environment=env;scene.environmentIntensity=.95;

 const district=studioModel('shibaPark');
 const {colliders,footprints}=shibaBuildings();
 addShibaDistrict(scene,district);
 const venues=createVenues(scene,colliders,footprints);
 return {colliders,footprints,objects:[],venues,limits:shibaLimits,ground:shibaGround,setNight(value){night=value;hemi.color.setHex(value?0xabc6ff:0xffe5ce);hemi.groundColor.setHex(value?0x69597b:0x8b93bb);hemi.intensity=value?.93:1.28;sun.color.setHex(value?0xa3b5ed:0xffd6af);sun.intensity=value?.65:2.28;scene.fog.color.setHex(value?0x414f64:0xc1b6b1);scene.environmentIntensity=value?.50:.95},update(t,cam){atmo(t,cam,night);const x=cam.position.x,z=cam.position.z;sun.target.position.set(x,0,z);sun.position.set(x+70,160,z-80)}};
}
