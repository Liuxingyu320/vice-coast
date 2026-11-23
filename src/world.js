import {createVenues} from './venues.js';
import * as T from 'three';
import {batcher,canvasTexture} from './models.js';
import {xs,zs,rng,roadWidth,clearOfCrossStreets} from './data.js';

function palmCrown(){
 const verts=[],cols=[],random=rng(85),base=new T.Color(), shades=[0x386c51,0x4c8552,0x739659,0x2e7056];
 const tri=(a,b,c,color)=>{verts.push(...a,...b,...c);base.setHex(color);for(let i=0;i<3;i++)cols.push(base.r,base.g,base.b)};
 for(let f=0;f<13;f++){const angle=f*2.401+random()*.15,L=3.7+random()*2.25,rise=f%3===0?2.2:1.1,drop=1.0+random()*2.0,dx=Math.cos(angle),dz=Math.sin(angle);
  const pos=(t,side=0,down=0)=>[dx*L*t-dz*side,rise*Math.sin(t*Math.PI)-drop*t*t-down,dz*L*t+dx*side];
  for(let j=0;j<11;j++){const t=j/11,end=(j+1)/11;tri(pos(t,-.055),pos(t,.055),pos(end),0x71945d);
   const width=(Math.sin((t*.89+.06)*Math.PI)*.85+.16)*(1.02+random()*.19);
   for(const s of [-1,1])tri(pos(t),pos(Math.min(1.08,end+.08),width*s,.17+.54*t),pos(end),shades[(j+f)%4]);
  }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('color',new T.Float32BufferAttribute(cols,3));g.computeVertexNormals();return g;
}
function atmosphere(scene){
 const uniforms={uTime:{value:0},uNight:{value:0}};
 const sky=new T.Mesh(new T.SphereGeometry(1100,32,20),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms,
 vertexShader:'varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec3 v;uniform float uTime,uNight;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 void main(){vec3 d=normalize(v);float h=d.y;vec3 color=mix(vec3(1.,.72,.50),vec3(.88,.40,.50),smoothstep(0.,.16,h));color=mix(color,vec3(.38,.39,.61),smoothstep(.13,.47,h));color=mix(color,vec3(.18,.10,.34),smoothstep(.42,1.,h));
 vec3 sd=normalize(vec3(.30,.162,-1.));float sun=length(d-sd);color+=vec3(.16,.09,.015)*exp(-sun*5.);
 float disc=1.-smoothstep(.099,.101,sun);float slat=h>.13?1.:smoothstep(-.94,-.64,sin(h*430.));color=mix(color,vec3(1.,.89,.61),disc*slat);
 vec2 uv=vec2(atan(d.z,d.x)*7.+uTime*.001,h*22.);float n=noise(uv)+noise(uv*2.5)*.38;float cloud=smoothstep(.84,1.22,n)*smoothstep(.025,.16,h)*(1.-smoothstep(.3,.65,h));color=mix(color,vec3(.95,.67,.66),cloud*.46);vec3 night=mix(vec3(.26,.20,.35),vec3(.045,.071,.156),smoothstep(0.,.43,h));night=mix(night,vec3(.024,.027,.077),smoothstep(.42,1.,h));vec2 stars=vec2(atan(d.x,d.z),asin(d.y))*210.;float spark=step(.987,hash(floor(stars)))*(1.-smoothstep(.05,.29,length(fract(stars)-.5)))*smoothstep(.06,.32,h);night+=vec3(.66,.76,.93)*spark;float moon=length(d-normalize(vec3(.38,.20,-1.)));night+=vec3(.20,.33,.59)*exp(-moon*16.);night=mix(night,vec3(.86,.89,1.),1.-smoothstep(.034,.036,moon));gl_FragColor=vec4(mix(color,night,uNight),1.);}`}));
 scene.add(sky);
 const ocean=new T.Mesh(new T.PlaneGeometry(3400,3400),new T.ShaderMaterial({uniforms,vertexShader:'varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}',fragmentShader:`varying vec3 wp;uniform float uTime,uNight;
 void main(){float far=smoothstep(10.,850.,distance(wp.xz,cameraPosition.xz));float wave=sin(wp.z*1.4+sin(wp.x*.19+uTime*.7)*1.4+uTime*1.1)*.5+.5;float wave2=sin(wp.z*.47+wp.x*.11+uTime*.7)*.5+.5;
 vec3 c=mix(vec3(.14,.48,.53),vec3(.48,.62,.67),far);vec2 dir=normalize(wp.xz-cameraPosition.xz);float shine=pow(max(dot(dir,normalize(vec2(.39,-1.))),0.),13.);c+=vec3(.35,.16,.1)*shine;c+=vec3(.53,.49,.29)*smoothstep(.91,.99,wave)*wave2*(.16+shine*.85)*(1.-far);vec3 noct=mix(vec3(.045,.13,.21),vec3(.22,.21,.34),far)+vec3(.29,.37,.57)*shine*wave2*smoothstep(.75,.99,wave);gl_FragColor=vec4(mix(c,noct,uNight),1.);}`}));
 ocean.rotation.x=-Math.PI/2;ocean.position.y=-.52;scene.add(ocean);
 return (time,cam,night)=>{uniforms.uNight.value=night?1:0;uniforms.uTime.value=time;sky.position.copy(cam.position)};
}
export function createWorld(scene){
 const atmo=atmosphere(scene);scene.fog=new T.FogExp2(0xe5a396,.0031);
 const hemi=new T.HemisphereLight(0xffd5d2,0x8b93bb,1.28);scene.add(hemi);let night=false;const lights=new T.Group();scene.add(lights);const lit=batcher(lights);
 const sun=new T.DirectionalLight(0xffc18d,2.28);sun.position.set(320,264,-354);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-350,right:350,top:335,bottom:-335,near:1,far:1050});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.18;sun.shadow.bias=-.00025;scene.add(sun);
 const env=canvasTexture(512,256,(c,w,h)=>{const g=c.createLinearGradient(0,0,0,h);for(const [v,col] of [[0,'#3c476a'],[.23,'#9e80ae'],[.43,'#ffd4a1'],[.49,'#fff1c0'],[.50,'#765e79'],[.59,'#313f58'],[1,'#323048']])g.addColorStop(v,col);c.fillStyle=g;c.fillRect(0,0,w,h);
 c.fillStyle='#424455';for(let x=0;x<w;x+=18)c.fillRect(x,119-Math.sin(x*3)*3,12,12);});env.mapping=T.EquirectangularReflectionMapping;scene.environment=env;scene.environmentIntensity=.95;
 const a=batcher(scene),{b,rod,sphere}=a,r=rng(606),pick=arr=>arr[Math.floor(r()*arr.length)],colliders=[],footprints=[],objects=[];
 const block=(x,z,w,d)=>colliders.push({x,z,w:w/2,d:d/2});
 const trunk=new T.CylinderGeometry(.78,1.22,1,8),crown=palmCrown(),leafMat=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,flatShading:true});
 const sPlane=new T.PlaneGeometry(1,1);
 function palm(x,z,h=8){const lean=(r()-.5)*.16,dir=r()*6.28;
  if(!clearOfCrossStreets(z,.35)||xs.some(road=>Math.abs(x-road)<roadWidth/2+.9))return;
  a.add(trunk,x+lean*h*.25,h/2,z,.24,h,.24,0x856f60,0,0,-lean);
  a.add(crown,x+lean*h*.75,h-.02,z,h/8,h/8,h/8,0xffffff,0,dir,0,leafMat);
  for(let j=1;j<7;j++){const y=j*h/7.7,rr=.249*(1.17-.4*j/7.7);rod(x+lean*(y-h*.25),y,z,rr,.06,0x796854,0,0,-lean)}block(x+lean*(1-h*.25),z,.60+2*Math.abs(lean),.60);
 }
 b(-34,-.51,0,474,.92,540,0xcbb598);b(201,-.35,0,56,.56,536,0xf1c39b);b(175,.007,0,7,.10,530,0xe1c3aa);
 const asphalt=0x48475c,mark=0xffdda1,white=0xe6d5c3;
 for(const x of xs)b(x,.024,0,roadWidth,.055,502,asphalt);
 for(const z of zs)b(-40,.025,z,422,.056,roadWidth,asphalt);
 // A seamless dry aggregate with broken wheel-polish bands gives the road scale at walking speed.
 const grain=canvasTexture(256,256,(c,w,h)=>{const im=c.createImageData(w,h),rr=rng(992);
  for(let i=0;i<w*h;i++){const n=rr();im.data[4*i]=108+Math.floor(n*24);im.data[4*i+1]=110+Math.floor(n*23);im.data[4*i+2]=128+Math.floor(n*27);im.data[4*i+3]=255}c.putImageData(im,0,0)});
 grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(3,68);grain.anisotropy=4;
 const roadMat=new T.MeshLambertMaterial({map:grain,color:0x848197});
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
 const signs=[];
 const glaze=canvasTexture(96,160,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,2,w/2,h/2,h/2);g.addColorStop(0,'rgba(255,202,186,.24)');g.addColorStop(.35,'rgba(255,168,177,.15)');g.addColorStop(1,'rgba(250,180,152,0)');c.fillStyle=g;c.fillRect(0,0,w,h);c.globalCompositeOperation='destination-out';for(let y=0;y<h;y+=4){c.fillStyle='rgba(0,0,0,.5)';c.fillRect(0,y,w,1)}});
 const glazeMat=new T.MeshBasicMaterial({map:glaze,transparent:true,depthWrite:false});for(let z=-218;z<230;z+=27)a.add(sPlane,151.8,.079,z,3.1,10.7,1,0xffc6b4,-Math.PI/2,0,0,glazeMat);
 function sign(text,x,y,z,w,h,angle=0,ink='#ffe1b4',bg='#345865',script=false){
  const tex=canvasTexture(512,128,(c,W,H)=>{c.fillStyle=bg;c.fillRect(0,0,W,H);c.strokeStyle=ink;c.lineWidth=2;c.strokeRect(6,6,W-12,H-12);c.fillStyle='#ff78a5';c.fillRect(17,H-13,W-34,3);c.fillStyle='#88eee3';c.fillRect(17,H-8,W-34,2);
   c.textAlign='center';c.textBaseline='middle';c.font=script?'italic bold 78px Georgia':'bold 74px Impact, sans-serif';c.fillStyle=ink;c.fillText(text,W/2,H*.52,W-33)});
  const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex}));m.position.set(x,y,z);m.rotation.y=angle;scene.add(m);signs.push(m);
 }
 const walls=[0xffc5ab,0xf0d8b8,0xa6cec5,0xe2b2bf,0x96b9be,0xe9c4a3,0xb9bbcb];
 const windows=[0x56667f,0x476374,0x698e9b,0xf6c28d,0x9b8ca1,0xb4bdc1],neons=[0xff8798,0x7cf3d6,0xffce86];
 function windowPane(x,y,z,w,h,d,color){b(x,y,z,w,h,d,color);if(color===windows[3]||color===windows[1])lit.b(x,y,z,w+.035,h+.012,d+.035,color===windows[3]?0xffcf93:0x8daec6,0,0,0,true)}
 function building(x,z,w,d,h,downtown=false){
  const c=pick(walls),accent=pick(neons),roof=0xdac6bb,floor=downtown?4:3.5;
  b(x,h/2+.15,z,w,h,d,c);b(x,h+.22,z,w+.8,.42,d+.8,roof);block(x,z,w+.45,d+.45);footprints.push({x,z,w,d});
  b(x,h+1.05,z,w*.45,1.5,d*.48,pick(walls));b(x+w*.22,h+.72,z-d*.23,2.8,1.1,2.3,0x81868a);
  for(let y=2.5;y<h-1;y+=floor){
   if(downtown||r()<.52)b(x,y-1.25,z,w+.35,.22,d+.35,roof);
   for(let s of [-1,1]){
    for(let xx=-w/2+2;xx<w/2-1;xx+=4.0)windowPane(x+xx,y,z+s*(d/2+.035),2.35,1.6,.085,pick(windows));
    for(let zz=-d/2+2;zz<d/2-1;zz+=4.0)windowPane(x+s*(w/2+.035),y,z+zz,.085,1.6,2.35,pick(windows));
   }
  }
  if(h<22){
   b(x,3.6,z,w+.8,.33,d+.8,0xf5d2b8);
   for(let n=-1;n<2;n++)b(x+w*.22+n*.55,h+.0,z+d*.5+.10,.22,2.1,.16,accent,0,0,0,true);
   for(const s of [-1,1]){b(x+s*(w/2+.52),2.95,z,1.3,.30,d*.79,accent);b(x+s*(w/2+.06),1.35,z,.1,2.5,1.65,0x375364)}
  }else b(x+w*.49,h/2,z+d*.48,.28,h*.94,.24,accent,0,0,0,true);
 }
 const oceanNames=['SUNDIAL','FLAMINGO','OCEAN CLUB','PALM ROYALE','HIGH TIDE','CALYPSO','CORAL MOTEL','WAVE RECORDS','PARADISO','SEA GLASS','LA PALMA','MIRAGE'];
 for(let ix=0;ix<xs.length-1;ix++)for(let iz=0;iz<zs.length-1;iz++){
  const cx=xs[ix]+40,cz=zs[iz]+40;
  b(cx,.065,cz,59.8,.13,59.8,0xdcc6b5);b(cx,.137,cz,51.8,.019,51.8,0xa9aa8c);
  if(ix===4){
   for(let j=0;j<2;j++){const z=cz+(j?14:-14),w=19+r()*5,d=20+r()*5,h=8+3.3*Math.floor(r()*3),x=137-w/2+6;
    if(iz===3&&j===1){building(100,z,11,18,6+r()*5);continue}building(x,z,w,d,h);
    const name=oceanNames[iz*2+j];
    const face=x+w/2;const stripe=iz%2?0xffa5a2:0x91dfd1;
    for(let k=0;k<3;k++)b(face+.19,h-.4-k*.32,z,.28,.11,d*.96,stripe,0,0,0,true);
    for(let f=4.8;f<h-1;f+=3.4){for(let dz=-d/2+3;dz<d/2-1;dz+=6.5){
     b(face+.65,f-.9,z+dz,1.4,.16,4.7,0xe9c6b0);b(face+1.29,f-.44,z+dz,.09,.12,4.7,0xa8c3bb);
     for(const o of [-1.9,0,1.9])b(face+1.28,f-.64,z+dz+o,.065,.57,.065,0xd7c7b6);
    }}
    for(let k=0;k<3;k++)b(face-.8-k*.28,h+.7+k*.45,z-d*.32,1.0,.95,3.2-k*.6,0xf7ccb2);
    for(let e=0;e<4;e++)b(face+1.0,2.77,z-5.6+e*3.3,1.8,.1,1.56,0xffdfb7,-.03,0,-.15);
    sign(name,x+w/2+.095,Math.min(h-1.1,5.4),z,d*.87,1.8,Math.PI/2,j?'#ffcfbd':'#a5ffe5',j?'#744763':'#304f60',j%2===1);
    if(j===1){
     const base=147.4;rod(base,3.5,z-6,.15,7,0x80646d);
     b(base,6.5,z-6,3.0,4.7,.45,iz%2?0xae5f76:0x4d8e8d);
     sign(name==='WAVE RECORDS'?'LP':iz%2?'INN':'VACANCY',base,6.65,z-5.74,2.95,2.0,0,'#ffe9af','#465467');
     if(name==='WAVE RECORDS'){const disc=new T.Mesh(new T.CylinderGeometry(2.05,2.05,.22,24),new T.MeshStandardMaterial({color:0x242335}));disc.position.set(base,9.4,z-6);disc.rotation.x=Math.PI/2;scene.add(disc);
      const label=new T.Mesh(new T.CircleGeometry(.63,20),new T.MeshBasicMaterial({color:0xffaa87}));label.position.set(base,9.4,z-5.87);scene.add(label)}
    }
    building(100,z,11,18,6+r()*5);
   }
  }else if(ix===3&&iz===1){continue
  }else if(ix===2&&iz===3){
   b(cx,.17,cz,44,.05,44,0x8ba783);for(let k=-1;k<=1;k++)for(let u=-1;u<=1;u++)if(k||u)palm(cx+k*16,cz+u*16,6+r()*2);
   rod(cx,.65,cz,5.2,1,0xc1b4a5);rod(cx,1.18,cz,4.8,.12,0x66c5c5);rod(cx,2.0,cz,.6,2,0xe8c9aa);sphere(cx,3.4,cz,1.2,1.2,1.2,0xf3be87);
  }else{
   const tower=ix>=2&&iz<=2;
   for(let j=0;j<2;j++)for(let k=0;k<2;k++){
    const x=cx+(j?13.4:-13.4),z=cz+(k?13.2:-13.2),w=14+r()*7,d=14+r()*7;
    const h=tower?14+r()*34:5+r()*10;building(x,z,w,d,h,tower);
   }
  }
  if((ix+iz)%2===0)palm(cx-26,cz+23,7.5+r()*2);
 }
 // Beach promenade, kiosks, lamps, umbrellas and the observation wheel.
 for(let z=-245;z<250;z+=16){
  palm(174.4,z,8+r()*2.7);if(Math.round((z+245)/16)%2===0)palm(147.6,z+3,7+r()*2.2);
  if(clearOfCrossStreets(z+.94,1.2)){b(172,.49,z,.36,.83,.48,0xd7c6af);b(172,.86,z+.94,.26,.12,2.3,0xe4dac5)}
 }
 const poolTex=canvasTexture(128,128,(c,w,h)=>{let g=c.createRadialGradient(64,64,1,64,64,63);g.addColorStop(0,'rgba(250,212,155,.52)');g.addColorStop(.42,'rgba(240,181,131,.27)');g.addColorStop(1,'rgba(243,185,145,0)');c.fillStyle=g;c.fillRect(0,0,w,h)});
 const poolMat=new T.MeshBasicMaterial({map:poolTex,transparent:true,blending:T.AdditiveBlending,depthWrite:false});
 function streetLamp(x,z,dir){lit.add(sPlane,x+dir*5,.088,z,11,16,1,0xffe1ae,-Math.PI/2,0,0,poolMat);rod(x,3.75,z,.12,7.5,0x4b6267);b(x+dir*.76,7.42,z,1.58,.13,.14,0x4b6267);b(x+dir*1.51,7.30,z,.79,.13,.36,0xffe3ab,0,0,0,true)}
 for(const x of xs)for(let z=-218;z<=226;z+=40){streetLamp(x+10.8,z,-1);if(x!==160&&r()<.32)palm(x-12.2,z+3,7+r()*2)}
 for(let z=-220;z<231;z+=21){if(Math.abs(z+126)<22)continue;const x=190+r()*23;
  rod(x,1.35,z,.08,2.7,0x997867);const g=new T.ConeGeometry(2.6,.95,8);a.add(g,x,2.7,z,1,1,1,pick([0xe1877c,0x6ea9ab,0xf4bc83]));
  b(x+1.6,.25,z+1.5,.85,.32,2.7,0xf2cc9d);b(x+1.6,.62,z+2.45,.86,.15,1,0x79aab0,-.6);
 }
 for(const z of [-65,125]){b(202,1.8,z,5,2.9,4.4,0x72c3c2);b(202,3.42,z,6.2,.35,5.3,0xf2a19c);b(202,2.28,z+2.23,3.8,.8,.08,0x45677e);block(202,z,5,4.4)}
 b(210,.14,-128,65,.42,10,0xb39785);for(let x=180;x<240;x+=4){for(const s of [-1,1])rod(x,.81,-128+s*5,.11,1.35,0xe5c1a7)}
 // An arcade and ticket booth frame the endpoint of the first delivery.
 for(const [off,col] of [[-11,0xd89187],[11,0x78aaa8]]){b(188,1.9,-128+off,6,3.5,5,col);b(188,3.81,-128+off,7.3,.42,6.1,0xffcdad);b(184.97,1.9,-128+off,.09,1.4,3.6,0x385567);block(188,-128+off,6,5)}
 sign('SUNSET LIVE',184.9,3.04,-139,4.8,.82,-Math.PI/2,'#ffe1b2','#6b4c62');
 for(let j=0;j<4;j++){const z=104+j*6.4;b(178,.52,z,1.95,.16,.62,0xad806c);b(178,1.00,z+.28,1.95,.52,.10,0xb78c72);for(const off of [-.66,.66])b(178+off,.31,z,.1,.48,.52,0x627278)}
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
  b(xx+4.15,7.02,zz,8.5,.16,.16,0x586674);b(xx+7.9,6.26,zz,.56,1.53,.40,0x494952);
  for(let n=0;n<3;n++){const lamp=new T.Mesh(lightG,new T.MeshBasicMaterial({color:0x55454a}));lamp.position.set(xx+7.9,6.72-n*.46,zz+.21);scene.add(lamp);signalLights.push({lamp,n,phase:zz})}
  sign(zz<0?'PIER AVE':zz>20?'CORAL AVE':'PALM BLVD',xx+3.9,6.49,zz+.14,4.2,.80,0,'#fff4d2','#466d6f')
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
 sign('SUNSET PIER',180,4.6,-128,9.5,2.2,Math.PI/2,'#ffdfad','#396b70');rod(180,2,-132,.12,4,0x806b6c);rod(180,2,-124,.12,4,0x806b6c);
 // A distant skyline across the bay gives the playable island a recognizable horizon.
 for(let i=0;i<105;i++){const angle=r()*Math.PI*2,rad=385+r()*220,x=-22+Math.cos(angle)*rad,z=Math.sin(angle)*rad;
  const h=13+Math.pow(r(),2)*63,w=7+r()*14,d=8+r()*13,c=pick([0x898da7,0x9597a9,0xb29ca6,0x8291a5]);
  b(x,1.3,z,56+r()*38,3.5,45+r()*40,0x868b92);b(x,4,z,w*2.2,8,d*1.9,c);b(x,h/2+4,z,w,h,d,c);
  for(let y=11;y<h+3;y+=6.5){b(x,y,z,w+.35,.5,d+.35,0x94a0ac);if((i+Math.round(y))%3)lit.b(x,y,z,w+.40,.31,d+.40,i%3?0xdbb397:0x83a5c2,0,0,0,true)}
  b(x+w*.33,h*.33,z-d*.26,w*.7,h*.68,d*1.1,c);b(x,h+5,z,w*.69,3.6,d*.73,c);
  for(let v=0;v<2;v++)b(x-w/2+1.3+v*w*.45,h*.52,z+d/2+.12,.25,h*.78,.2,0xc7b4b5);
  if(i%3===0){b(x,h+2,z,w*.62,4,d*.65,c);rod(x,h+5,z,.25,7,c)}
 }
 // The far shore reads as a continuous, inhabited island behind the sailboats.
 for(let j=0;j<64;j++){const t=j*Math.PI/32,radius=473,xx=-22+Math.cos(t)*radius,zz=Math.sin(t)*radius;
  const h=4+2*Math.sin(j*2.1);b(xx,h/2-.4,zz,51,h,32,0x92909d,0,-t-Math.PI/2);
  b(xx-Math.cos(t)*15,2.1,zz-Math.sin(t)*15,43,.34,.45,j%4?0xe6ae92:0xc5909c,0,-t-Math.PI/2);}
 for(let j=0;j<7;j++){const xx=97+j*17,zz=-375-(j%3)*12,hh=[32,53,45,76,39,59,30][j],col=j%2?0xad99a8:0xa4a1b9;
  b(xx,hh/2,zz,12,hh,11,col);b(xx,hh+2.5,zz,8,5,9,col);if(j===3){b(xx,hh+7,zz,4,5,5,col);rod(xx,hh+13,zz,.18,8,col)}}
 const venues=createVenues(scene,colliders,footprints);a.flush();lit.flush();lights.visible=false;
 return {colliders,footprints,objects,venues,setNight(value){night=value;lights.visible=value;hemi.color.setHex(value?0xabc6ff:0xffd5d2);hemi.groundColor.setHex(value?0x69597b:0x8b93bb);hemi.intensity=value?.93:1.28;sun.color.setHex(value?0xa3b5ed:0xffc18d);sun.intensity=value?.65:2.28;scene.fog.color.setHex(value?0x45405b:0xe5a396);scene.environmentIntensity=value?.50:.95},update(t,cam){atmo(t,cam,night);
  for(const {lamp,n,phase} of signalLights){const tick=((t+phase+400)%19);const on=tick<9?2:tick<11?1:0;lamp.material.color.setHex(n===on?[0xff4f61,0xffc85f,0x82f1bb][n]:0x51434d)}
  for(let i=0;i<12;i++){const phase=t*.11+i*.38;bird.position.set(200+Math.sin(phase)*30+i*1.6,11+i%4+Math.sin(t*.7+i)*.5,-14-i*7+Math.cos(phase)*25);bird.rotation.set(0,phase,.12*Math.sin(t*2.8+i));bird.scale.setScalar(.82+i%3*.12);bird.updateMatrix();flock.setMatrixAt(i,bird.matrix)}flock.instanceMatrix.needsUpdate=true;
  rot.rotation.z=t*.063;for(const c of cabins)c.rotation.z=-rot.rotation.z}};
}
