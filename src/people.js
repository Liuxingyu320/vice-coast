import * as T from 'three';
import {studioModel,rigSlots} from './studio-models.js';
import {residents} from './street-catalog.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const skinMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.83,metalness:.025});
skinMaterial.onBeforeCompile=shader=>{
 shader.vertexShader='attribute float finishRoughness; varying float vFinish;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFinish=finishRoughness;');
 shader.fragmentShader='varying float vFinish;\n'+shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=vFinish;');
};
const finishes=new Map([[0xc58b68,.89],[0xa2694e,.88],[0xb48164,.92],[0xbd805f,.86],[0x344665,.48],[0xb96470,.61],[0xddad57,.25],[0xbd996b,.27],[0x52646a,.38],[0x503b37,.4],[0xd29649,.72],[0xe6ddc9,.97]]);
const sphere=new T.SphereGeometry(1,16,12),box=new T.BoxGeometry(1,1,1),hoop=new T.TorusGeometry(1,.13,6,20);
const wardrobes={
 rico:{skin:0xc58b68,hair:0x302731,coat:0x344665,shirt:0xe6ddc9,pants:0x39414e,shoe:0xa87051},
 mara:{skin:0xa2694e,hair:0x37272e,coat:0xd29649,shirt:0x75b8a7,pants:0x3c424c,shoe:0xe8d9c0},
 vic:{skin:0xb48164,hair:0xadb1ac,coat:0x417d77,shirt:0xf5dcc0,pants:0x5b524a,shoe:0x554038},
 carlos:{skin:0xbd805f,hair:0x2e2831,coat:0xb96470,shirt:0xf5dcb0,pants:0x494051,shoe:0x45343a}
};
const civilian=[0x7099a8,0xcf9863,0xaa6c89,0x598575,0x8d85a9,0xcebd8e];
const templates=new Map(),matrices=new T.Object3D();
function rings(rows,n=20){
 const pos=[],idx=[];
 for(const [y,rx,rz,cz=0] of rows)for(let j=0;j<n;j++){const a=2*Math.PI*j/n;pos.push(Math.cos(a)*rx,y,cz+Math.sin(a)*rz)}
 for(let i=1;i<rows.length;i++)for(let j=0;j<n;j++){const a=(i-1)*n+j,b=(i-1)*n+(j+1)%n;idx.push(a,a+n,b,b,a+n,b+n)}
 for(let j=1;j<n-1;j++){idx.push(0,j,j+1);const a=(rows.length-1)*n;idx.push(a,a+j+1,a+j)}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function sew(){
 const pieces=[];
 function part(geo,c,x,y,z,w=1,h=1,d=1,rx=0,ry=0,rz=0){
  const g=geo.index?geo.toNonIndexed():geo.clone();g.deleteAttribute('uv');
  matrices.position.set(x,y,z);matrices.scale.set(w,h,d);matrices.rotation.set(rx,ry,rz);matrices.updateMatrix();g.applyMatrix4(matrices.matrix);
  const color=new T.Color(c),rgb=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<rgb.length;i+=3)color.toArray(rgb,i);
  g.setAttribute('color',new T.BufferAttribute(rgb,3));g.setAttribute('finishRoughness',new T.BufferAttribute(new Float32Array(rgb.length/3).fill(finishes.get(c)??.82),1));pieces.push(g);
 }
 return {part,blob:(...args)=>part(sphere,...args),block:(...args)=>part(box,...args),finish(){const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());return geometry}};
}
function buildPerson(role,index){
 const c=wardrobes[role]??{...wardrobes[index%2?'mara':'rico'],coat:civilian[index%civilian.length],pants:index%2?0x34465b:0x5c5051};
 const female=role==='mara'||role==='civilian'&&index%2===1,old=role==='vic',wide=old?1.13:female?.91:1;
 const top=sew(),head=sew();
 top.part(rings([[.81,.155,.118],[.91,.187,.128],[1.02,.171,.111],[1.19,.192,.135],[1.34,.217,.138],[1.415,.226,.101],[1.46,.091,.081]]),c.coat,0,0,0,wide,1,1);
 top.blob(c.skin,0,1.465,0,.075,.108,.075);
 top.part(rings([[1.045,.165,.114],[1.18,.187,.139],[1.34,.211,.145],[1.423,.090,.091]]),c.shirt,0,0,-.004,.98,1,1);
 // Tailored front panels follow the chest instead of floating above it.
 for(const side of [-1,1]){
  top.blob(c.coat,side*.139,1.20,-.068,.089,.217,.089,0,side*.22,side*.045);
  for(let n=0;n<3;n++)top.block(0xbdac91,side*.080,1.07+n*.074,-.139,.012,.012,.009);
  top.block(c.pants,side*.125,.86,.091,.081,.059,.020,0,0,side*.09);
 }
 for(const side of [-1,1]){
  top.block(c.coat,side*.106,1.28,-.132,.057,.292,.034,0,0,-side*.25);
  top.block(old?0xb7c6ab:0xb9ab91,side*.131,1.25,-.118,.086,.011,.014,0,0,-side*.08);
  top.block(c.coat,side*.138,1.218,-.112,.076,.049,.021);
  top.block(c.shirt,side*.082,1.396,-.108,.084,.083,.024,0,0,side*.48);
 }
 top.part(rings([[.792,.151,.103],[.85,.191,.125],[.93,.177,.121]]),c.pants,0,0,0);
 top.part(rings([[.908,.18,.124],[.933,.177,.123]]),0x473632,0,0,0);
 top.block(0xb79b67,0,.921,-.128,.055,.027,.009);
 if(role==='rico'){top.block(0xda9353,.112,1.299,-.139,.079,.034,.014);for(const side of [-1,1])top.block(0x69839d,side*.148,1.177,.099,.016,.31,.013,0,0,side*.12);top.block(0x99a3a6,0,1.34,.124,.23,.009,.009)}
 if(female){
  top.part(hoop,0x303542,0,1.47,-.012,.129,.127,.092,Math.PI/2,0,0);
  for(const s of [-1,1]){
   top.blob(0x2b3039,s*.113,1.404,-.105,.052,.067,.048,0,0,-s*.19);
   top.blob(0x52646a,s*.117,1.404,-.141,.046,.056,.021,0,0,-s*.19);
   top.part(hoop,0xbd996b,s*.117,1.405,-.160,.032,.042,.015,0,0,-s*.19)
  }
  if(role==='mara'){top.block(0x886f50,-.055,1.17,-.156,.026,.385,.013,0,0,-.30);top.blob(0xa88144,-.144,.989,-.113,.095,.095,.065);top.block(0xbca570,-.144,1.01,-.174,.13,.015,.015)}
 }
 if(role==='carlos'){top.part(hoop,0xc9aa66,0,1.372,-.04,.086,.092,.082,.77,0,0)}
 // The facial cross-sections narrow from temples to jaw, with a separate brow, nose and lower lip.
 head.part(rings([[.008,.057,.063,-.012],[.034,.083,.087,-.02],[.079,.109,.103,-.011],[.13,.124,.116],[.19,.126,.116,.004],[.245,.113,.103,.007],[.288,.076,.078,.008],[.301,.024,.037]]),c.skin,0,0,0);
 head.blob(c.skin,0,.137,-.110,.019,.042,.026,-.19);
 head.blob(c.skin,0,.107,-.127,.024,.014,.020);
 head.blob(female?0x995e55:0x915e50,0,.072,-.115,.037,.0055,.008);
 head.blob(female?0xb77866:0xa37364,0,.066,-.114,.030,.005,.007);
 for(const s of [-1,1]){
  head.blob(c.skin,s*.122,.132,.002,.025,.042,.020);
  head.blob(0xebe0cb,s*.054,.165,-.101,.031,.012,.013,0,s*.13,s*.025);
  head.blob(0x594539,s*.053,.165,-.113,.0105,.009,.004);
  head.blob(0x211c22,s*.053,.165,-.1165,.006,.0075,.0025);
  head.blob(0xffeac6,s*.053-.0025,.168,-.1184,.0026,.0026,.0017);
  head.blob(c.hair,s*.054,.175,-.108,.029,.0025,.006,0,s*.14,-s*.04);
  head.blob(c.hair,s*.053,.184,-.101,.038,.008,.011,0,s*.18,s*.075);
  if(female)head.part(hoop,0xddad57,s*.132,.086,-.006,.027,.038,.026,0,s*.25,0);
 }
 head.blob(c.hair,0,.23,.023,.13,.101,.112);
 if(female){
  for(let j=0;j<53;j++){
   const a=j*2.4,l=j%6/5,front=Math.max(0,-Math.sin(a)),y=.186+.111*l+.049*front*(1-l);
   const rad=.120-.036*l;
   head.blob([c.hair,0x3e2c31,0x473438,0x402c2c][j%4],Math.cos(a)*rad,y,Math.sin(a)*rad+.010,.027+.008*l,.035,.029,0,.3*a,.2*Math.sin(a));
  }
  head.blob(c.hair,-.025,.234,.124,.095,.089,.077);
  for(let i=0;i<10;i++){const a=i*2.4;head.blob(c.hair,-.03+Math.cos(a)*.067,.215+.033*Math.sin(a*.7),.158+.018*Math.cos(a),.038,.048,.039)}
 }
 else{for(let j=0;j<6;j++)head.blob(c.hair,-.077+j*.027,.242+.014*Math.sin(j*.7),-.07,.042,.039,.046,0,0,-.32);for(const s of [-1,1])head.blob(c.hair,s*.113,.167,.024,.016,.062,.069)}
 if(old||role==='carlos'){
  for(const s of [-1,1]){head.part(hoop,0x503b37,s*.055,.16,-.118,.046,.030,.02);head.block(0x6d5140,s*.106,.166,-.042,.009,.009,.14)}
  head.block(0x66514a,0,.164,-.124,.029,.007,.009);head.blob(c.hair,0,.085,-.115,.045,.012,.013);
 }
 const shapes={body:top.finish(),head:head.finish(),limbs:[]};
 for(const s of [-1,1]){
  const thigh=sew(),shin=sew(),arm=sew(),fore=sew();
  thigh.part(rings([[-.40,.062,.065],[-.32,.073,.081],[-.13,.093,.098],[.014,.090,.099]]),c.pants,0,0,0);
  shin.part(rings([[-.36,.054,.061],[-.26,.060,.073],[-.12,.071,.078],[.012,.064,.067]]),c.pants,0,0,0);
  shin.blob(c.shoe,0,-.369,-.036,.064,.061,.132);shin.blob(0x423d40,0,-.405,-.041,.067,.019,.135);
  for(let j=0;j<3;j++)shin.block(0xd6c4a7,0,-.333-j*.005,-.076-j*.021,.071-j*.009,.008,.012,-.27);
  shin.part(rings([[-.331,.057,.065],[-.308,.060,.067]]),c.pants,0,0,0);
  arm.part(rings([[-.196,.061,.066],[-.115,.075,.083],[-.024,.084,.088],[.031,.052,.055]]),c.coat,s*.012,0,0);
  arm.part(rings([[-.217,.064,.068],[-.183,.063,.068]]),female?0xb88655:c.shirt,s*.014,0,0);
  fore.blob(c.skin,0,-.090,-.017,.052,.114,.057,.11);fore.blob(c.skin,0,-.218,-.037,.045,.067,.032);
  fore.blob(c.skin,-s*.036,-.205,-.045,.017,.040,.019,0,0,s*.24);
  if(s===-1)fore.blob(0x534746,0,-.161,-.026,.048,.015,.05);
  shapes.limbs.push([thigh.finish(),shin.finish(),arm.finish(),fore.finish()]);
 }
 // Distant people use a single lightweight silhouette, with the same outfit and proportions.
 shapes.far=farGeometry(c);return shapes;
}
function farGeometry(c){
 const far=sew(),simple=new T.SphereGeometry(1,8,6);
 far.part(simple,c.coat,0,1.18,0,.224,.319,.144);far.part(simple,c.skin,0,1.63,0,.12,.157,.112);far.part(simple,c.hair,0,1.71,.012,.124,.103,.112);
 for(const side of [-1,1]){far.part(simple,c.pants,side*.091,.48,0,.083,.462,.089);far.part(simple,c.shoe,side*.093,.056,-.053,.069,.052,.129);far.part(simple,c.coat,side*.223,1.272,0,.073,.156,.075);far.part(simple,c.skin,side*.235,1.023,-.024,.047,.147,.052)}
 const geometry=far.finish();simple.dispose();return geometry;
}
const studioWardrobes={rico:wardrobes.rico,mara:wardrobes.mara,ramon:{skin:0xb37a60,hair:0x312b2b,coat:0x25574f,pants:0xe6d9bd,shoe:0x4e403a}};
for(const [key,[coat,pants,skin]] of Object.entries(residents))studioWardrobes[key]={coat,pants,skin,hair:0x403834,shoe:0x554b45};
const distantCast=new Map();
function studioPerson(role){
 const root=studioModel(role),slots=rigSlots(root);
 if(!distantCast.has(role))distantCast.set(role,farGeometry(studioWardrobes[role]));
 const far=new T.Mesh(distantCast.get(role),skinMaterial);root.add(far);far.visible=false;
 const pair=part=>[slots[part+'_L'],slots[part+'_R']];
 root.userData={role,torso:slots.torso,head:slots.head,arms:pair('arm'),elbows:pair('elbow'),legs:pair('leg'),knees:pair('knee'),far};
 if(role==='mara')root.scale.setScalar(.975);
 return root;
}
export function makePerson(role='civilian',seed=0){
 if(Object.hasOwn(studioWardrobes,role))return studioPerson(role);
 const idx=role==='civilian'?Math.abs(seed)%6:0,key=role+idx;
 if(!templates.has(key))templates.set(key,buildPerson(role,idx));
 const g=templates.get(key),root=new T.Group(),torso=new T.Group();root.add(torso);
 const attach=(parent,geo,x,y,z)=>{const m=new T.Mesh(geo,skinMaterial);m.position.set(x,y,z);parent.add(m);return m};
 attach(torso,g.body,0,0,0);const head=attach(torso,g.head,0,1.482,-.005);
 const legs=[],knees=[],arms=[],elbows=[];
 for(let i=0;i<2;i++){const s=i?1:-1,[thigh,shin,upper,lower]=g.limbs[i];
  const leg=attach(root,thigh,s*.101,.825,.006);legs.push(leg);knees.push(attach(leg,shin,0,-.405,0));
  const arm=attach(torso,upper,s*(role==='vic'?.234:.206),1.389,0);arm.rotation.z=s*.068;arms.push(arm);elbows.push(attach(arm,lower,s*.018,-.212,-.003));
 }
 const far=attach(root,g.far,0,0,0);far.visible=false;root.userData={legs,knees,arms,elbows,head,torso,far};if(role==='vic')root.scale.setScalar(1.035);if(role==='mara')root.scale.setScalar(.975);
 return root;
}
export function seatedPerson(role='rico'){
 const person=makePerson(role),rig=person.userData;
 person.scale.multiplyScalar(.90);
 for(const leg of rig.legs)leg.rotation.x=1.27;
 for(const knee of rig.knees)knee.rotation.x=-1.37;
 for(const arm of rig.arms)arm.rotation.x=.72;
 for(const elbow of rig.elbows)elbow.rotation.x=.60;
 return person;
}
export function personDetail(o,near){
 const {torso,legs,far}=o.userData;if(torso.visible===near)return;
 torso.visible=near;for(const leg of legs)leg.visible=near;far.visible=!near;
}
export function animatePerson(o,t,power=1){
 if(o.userData.far.visible){o.userData.far.position.y=.015*Math.cos(t*2)*power;return}
 const {arms,legs,knees,elbows,torso}=o.userData;
 for(let i=0;i<2;i++){const v=Math.sin(t+i*Math.PI);legs[i].rotation.x=v*.54*power;knees[i].rotation.x=-Math.max(0,-v)*.49*power;
  arms[i].rotation.x=-v*.38*power;elbows[i].rotation.x=.15+Math.max(0,v)*.22*power}
 torso.position.y=.009*Math.cos(t*2)*power;torso.rotation.z=.025*Math.cos(t)*power;
}
