import * as T from 'three';
import {batcher,canvasTexture,shadow} from './models.js';
import {makePerson} from './people.js';
import {recordStall,localStops} from './data.js';

const cream=0xf5c99c,ink=0x272b39,brass=0xc69a61,teal=0x4a847f,coral=0xb96267;
const plane=new T.PlaneGeometry(1,1);
function plate(title,sub,bg='#274f52',fg='#ffe0ac'){
 return new T.MeshBasicMaterial({side:T.DoubleSide,map:canvasTexture(512,128,(c,w,h)=>{
  c.fillStyle=bg;c.fillRect(0,0,w,h);c.strokeStyle=fg;c.strokeRect(7,7,w-14,h-14);
  c.fillStyle=fg;c.textAlign='center';c.font='italic bold 66px Georgia';c.fillText(title,256,78,478);
  c.font='bold 17px monospace';c.fillText(sub,256,107,478);
 })});
}
function item(parent,w,h,d,color,x=0,y=0,z=0){
 const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.63}));m.position.set(x,y,z);parent.add(m);return m;
}
function label(parent,title,sub,w,h,x,y,z,angle=0){
 const m=new T.Mesh(plane,plate(title,sub));m.scale.set(w,h,1);m.position.set(x,y,z);m.rotation.y=angle;parent.add(m);return m;
}
function flightCase(scene){
 const g=new T.Group();scene.add(g);item(g,.88,.54,.38,ink,0,.29);
 for(const x of [-.39,.39])item(g,.048,.58,.40,brass,x,.29);
 for(const y of [.04,.53])item(g,.84,.043,.4,brass,0,y);
 item(g,.22,.065,.07,brass,0,.57);label(g,'WAVE','AMPLIFIER 03',.39,.15,0,.26,.196);return g;
}
export function makeMidnightSet(sim){
 const scene=sim.scene,geo=batcher(scene),{b,rod}=geo;
 function wall(x,y,z,w,h,d,col){b(x,y,z,w,h,d,col);sim.world.colliders.push({x,z,w:w/2,d:d/2})}
 function sign(x,y,z,w,h,a,title,sub,bg,fg){geo.add(plane,x,y,z,w,h,1,0xffffff,0,a,0,plate(title,sub,bg,fg))}
 // The counter follows the south wall of Wave Records. Its front faces the sidewalk.
 const sx=recordStall.x,sz=recordStall.z;
 wall(sx,.65,sz,3.74,1.04,1.38,teal);b(sx,1.23,sz,3.89,.12,1.50,cream);
 for(const offset of [-1.88,1.88]){
  rod(sx+offset,1.64,sz-.53,.048,3.02,brass);
  sim.world.colliders.push({x:sx+offset,z:sz-.53,w:.05,d:.05});
 }
 for(let j=0;j<9;j++){const xx=sx+(j-4)*.46;b(xx,3.06,sz+.09,.468,.12,2.42,j%2?cream:teal,.09);b(xx,2.77,sz+1.29,.468,.37,.08,j%2?cream:teal)}
 sign(sx,.78,sz+.70,2.85,.66,0,'Side B','二手黑胶唱片   •   33 RPM','#794a46','#ffe4b9');
 for(let j=0;j<3;j++){const xx=sx-.78+j*.94;b(xx,1.43,sz,.83,.28,.91,brass);
  for(let n=0;n<5;n++)b(xx,1.64,sz-.23+n*.095,.66,.56,.038,[ink,coral,teal,cream][(j+n)%4],-.15);
  geo.add(plane,xx,1.64,sz+.174,.65,.55,1,0xffffff,-.15,0,0,sim.world.venues.recordMats[j]);
 }
 const lp=new T.CylinderGeometry(1,1,.032,32);
 geo.add(lp,sx+1.10,1.83,sz+.27,.324,1,.324,0x272630,Math.PI/2+.14);
 geo.add(lp,sx+1.10,1.833,sz+.291,.110,.32,.110,0xe9ac68,Math.PI/2+.14);
 // Portable station: tagged flight cases, working dial faces and a guyed antenna.
 const x=185,z=-129.4;
 wall(x,.99,z,2.4,.16,1.08,0x806152);for(const sx of [-1,1])for(const sz of [-.4,.4])b(x+sx,.53,z+sz,.065,.88,.065,ink);
 b(x,1.25,z,1.7,.39,.62,teal);sign(x,1.29,z+.318,1.51,.36,0,'Palm Wave','98.4   •   MOBILE BROADCAST','#263942','#ffe194');
 for(const dx of [-.57,.57])geo.add(new T.CylinderGeometry(.09,.09,.06,16),x+dx,1.27,z+.34,1,1,1,brass,Math.PI/2);
 for(let j=0;j<9;j++)b(x-.37+j*.088,1.47,z,.046,.015,.31,j<6?cream:coral);
 for(const dx of [-1.8,1.8]){wall(x+dx,.81,z,.77,1.18,.64,ink);for(const yy of [.61,1.06])geo.add(new T.CylinderGeometry(.229,.239,.09,24),x+dx,yy,z+.33,1,1,1,0x444959,Math.PI/2)}
 rod(x-2.42,2.78,z-1,.042,4.95,brass);for(let j=0;j<4;j++)b(x-2.42,3.4+j*.37,z-1,1.52-j*.29,.028,.04,cream);
 const beacon=new T.Mesh(new T.SphereGeometry(.127,12,8),new T.MeshBasicMaterial({color:0xff847d}));beacon.position.set(x-2.42,5.31,z-1);scene.add(beacon);
 for(let j=0;j<2;j++){const curve=new T.CatmullRomCurve3([new T.Vector3(x-2.42,4.6,z-1),new T.Vector3(x-2.42+(j?1:-1)*.7,2.35,z-1.12),new T.Vector3(x-2.42+(j?1:-1)*1.5,.38,z-1.4)]);geo.add(new T.TubeGeometry(curve,8,.014,4,false),0,0,0,1,1,1,ink)}
 sign(181.5,1.44,-128.6,1.67,.78,.42,'On Air','P I E R    S E S S I O N S','#77424e','#ffe2a9');rod(181.5,.9,-128.6,.048,1.47,brass);
 const deck=canvasTexture(512,256,(c,w,h)=>{
  c.fillStyle='#a88370';c.fillRect(0,0,w,h);
  for(let row=0;row<12;row++){const y=row*h/12;c.fillStyle=['#bb9a82','#b2967e','#b09886','#b99478'][row%4];c.fillRect(0,y,w,h/12-1.5);c.fillStyle='#806b61';
   for(let col=0;col<4;col++){const x=(col*145+row*71)%w;c.fillRect(x,y,1.3,h/12);c.fillRect(x+4,y+3,2,1.5);c.fillRect(x+4,y+h/12-5,2,1.5)}
   c.strokeStyle='#937563';c.lineWidth=.65;for(let k=0;k<3;k++){const yy=y+4+k*4;c.beginPath();c.moveTo(0,yy);c.bezierCurveTo(150,yy+2,275,yy-2,512,yy+1);c.stroke()}
  }
 });deck.wrapS=deck.wrapT=T.RepeatWrapping;deck.repeat.set(5,2);
 geo.add(plane,201.15,.356,-128,47,9.88,1,0xffffff,-Math.PI/2,0,0,new T.MeshStandardMaterial({map:deck,roughness:.88}));
 const pool=canvasTexture(128,128,(c)=>{const g=c.createRadialGradient(64,64,0,64,64,63);g.addColorStop(0,'#82edda88');g.addColorStop(.45,'#72caca44');g.addColorStop(1,'#7cceca00');c.fillStyle=g;c.fillRect(0,0,128,128)});
 const spill=new T.MeshBasicMaterial({map:pool,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
 geo.add(plane,185,.37,-128.9,8,6.8,1,0xffffff,-Math.PI/2,0,0,spill);
 for(const zz of [-131.8,-124.2]){
  for(const xx of [181,188,195,202]){rod(xx,2.12,zz,.038,3.45,brass);b(xx,3.84,zz,.21,.13,.21,ink);geo.sphere(xx,3.70,zz,.105,.15,.105,cream);b(xx,3.71,zz,.14,.18,.14,0xffca86,0,0,0,true)}
  for(let j=0;j<24;j++){const xx=181+j*.875;const h=3.79-.32*Math.sin(j%8*Math.PI/8);b(xx+.42,h,zz,.9,.024,.024,ink,0,0,-.12*Math.cos(j*Math.PI/8));
   if(j%2===1)b(xx,h-.12,zz,.064,.13,.064,j%4===1?0xffc275:0xff9d9b,0,0,0,true)}
 }
 for(const [xx,zz,col,power] of [[185,-127.2,0xffbf83,30],[184.4,-130.2,0x83e6dc,26],[sx,sz+.75,0xffc783,19]]){
  const light=new T.PointLight(col,power,13,1.65);light.position.set(xx,3.1,zz);scene.add(light);
 }
 // Street noticeboard and a coastal kiosk with a tangible abandoned camera bag.
 for(const px of [176.8,178.65])rod(px,1.12,-104.8,.07,1.98,brass);
 sign(177.7,1.84,-104.8,2.02,.98,0,'Contact Sheet','PALM CITY   /   STREET PHOTOS','#485f61','#fae0b2');
 const photo=label(scene,'Night Shift','PHOTO BY INÉS  /  PALM CITY',1.21,.69,177.69,1.82,-104.77);
 // A hand-printed contact sheet pinned up after the photographer gets her film back.
 photo.material=new T.MeshBasicMaterial({map:canvasTexture(512,300,(c,w,h)=>{
  c.fillStyle='#ddd3ad';c.fillRect(0,0,w,h);
  for(let j=0;j<3;j++){c.save();c.translate(14+j*162,13);c.fillStyle='#384951';c.fillRect(0,0,154,226);const g=c.createLinearGradient(0,0,0,226);g.addColorStop(0,'#a99791');g.addColorStop(.55,'#e2b999');g.addColorStop(1,'#4f6770');c.fillStyle=g;c.fillRect(6,7,142,210);
   c.fillStyle='#72776f';for(let k=0;k<5;k++)c.fillRect(7+k*30,95+Math.sin(k+j)*18,27,87);
   c.strokeStyle='#eeeece';c.lineWidth=6;c.beginPath();c.moveTo(6,100);c.lineTo(76,58+j*7);c.lineTo(148,96);c.stroke();
   for(let k=0;k<3;k++){const x=27+k*45,y=131+Math.sin(k+j)*7;c.fillStyle='#2c3d42';c.beginPath();c.arc(x,y,9,0,Math.PI*2);c.fill();c.fillRect(x-6,y+11,13,42);c.strokeStyle='#36454a';c.lineWidth=6;c.beginPath();c.moveTo(x,y+22);c.lineTo(x+14,y+2);c.lineTo(x+21,y-23);c.stroke()}
   c.restore()}
  c.fillStyle='#33444a';c.font='bold 21px monospace';c.fillText('INÉS  /  NIGHT SHIFT      01 — 03',18,275);
 })});
 const bag=new T.Group();scene.add(bag);item(bag,.43,.28,.23,0xbb956e,0,.15);item(bag,.46,.07,.25,0x6c5756,0,.29);item(bag,.071,.12,.025,brass,0,.21,.126);bag.position.set(198.9,.2,-61.7);
 sign(201.98,3.76,-62.72,3.63,.65,0,'Mar Azul','KIOSK   /   POSTCARDS','#b77167','#ffebc4');
 const pass=new T.Group();scene.add(pass);item(pass,.29,.025,.19,cream);item(pass,.22,.028,.043,teal,0,.014,.035);pass.position.set(40.3,1.72,-131.75);
 const crate=new T.Group();scene.add(crate);item(crate,.56,.34,.43,0x977551,0,.18);for(let j=0;j<4;j++)item(crate,.44,.38,.035,[coral,ink,teal,cream][j],0,.29,-.14+j*.08);
 const amp=flightCase(scene);geo.flush();
 const actors={};
 function actor(id,x,z,angle,seed){const g=makePerson(id==='ramon'?'ramon':'civilian',seed);g.position.set(x,Math.max(.21,sim.footHeight(x,z)),z);g.rotation.y=angle;shadow(g,.95,.65);scene.add(g);actors[id]=g;return g}
 actor('ramon',187,-127.5,-1.5);actor('luz',localStops.stall.x,localStops.stall.z,Math.PI+.38,4);actor('ines',176.5,-102.6,-1.2,1);actor('tito',46,-104.6,2.0,5);actor('paz',64.5,-91.8,-1.1,3);
 item(actors.ines.userData.torso,.23,.15,.13,ink,0,1.24,-.177);const lens=new T.Mesh(new T.CylinderGeometry(.056,.062,.11,14),new T.MeshStandardMaterial({color:0x89a7a7}));lens.rotation.x=Math.PI/2;lens.position.set(.023,1.25,-.26);actors.ines.userData.torso.add(lens);
 return {actors,amp,pass,bag,crate,photo,beacon};
}
