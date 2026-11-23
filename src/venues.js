import * as T from 'three';
import {batcher,canvasTexture} from './models.js';

const storefront=143,shopZ=54,plane=new T.PlaneGeometry(1,1),vinyl=new T.CylinderGeometry(1,1,1,36);
const albums=[['LOW TIDE','#12444c','#f5a782'],['LADO B','#bc4c60','#f6cf79'],['MARA / LIVE','#2e3655','#79cab2'],['SUN ROOM','#efac6e','#653853'],['NOCHE','#583848','#efafa7'],['SOLAR','#29495f','#f3d889']];
function printed(w,h,draw){
 const tex=canvasTexture(w,h,draw);tex.anisotropy=4;
 return new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});
}
function letterPanel(line,sub,bg,ink){
 return printed(1024,256,(c,w,h)=>{
  c.fillStyle=bg;c.fillRect(0,0,w,h);c.strokeStyle=ink;c.lineWidth=3;c.strokeRect(15,14,w-30,h-28);
  c.textAlign='center';c.textBaseline='middle';c.fillStyle=ink;c.font='italic 900 129px Georgia';c.fillText(line,w/2,103,w-80);
  c.font='bold 29px Helvetica';c.fillText(sub,w/2,204,w-140);
 });
}
function sleeveMat([name,bg,ink],i){
 return printed(256,256,(c,w,h)=>{
  c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=ink;c.strokeStyle=ink;c.lineWidth=6;
  c.save();c.beginPath();c.rect(12,12,232,183);c.clip();
  if(i%3===0){for(let j=0;j<9;j++){c.beginPath();c.arc(186,58,24+j*12,0,Math.PI*2);c.stroke()}}
  else if(i%3===1){for(let j=0;j<10;j++){c.beginPath();c.moveTo(-20+j*31,197);c.lineTo(95+j*26,17);c.lineTo(129+j*26,17);c.closePath();c.fill()}}
  else{c.beginPath();c.arc(114,87,63,0,Math.PI*2);c.fill();c.fillStyle=bg;for(let j=0;j<6;j++)c.fillRect(30,96+j*10,171,3+j*.6)}
  c.restore();c.fillStyle=ink;c.font='900 31px Helvetica';c.fillText(name,13,228,230);c.font='10px monospace';c.fillText('WAVE • INDEPENDENT PRESSING  /  33 RPM',14,246);
 });
}
function roomFloor(wood){
 const tex=canvasTexture(512,512,(c,w,h)=>{
  c.fillStyle=wood?'#c79972':'#b39188';c.fillRect(0,0,w,h);let seed=21;
  const r=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  if(wood){
   for(let j=0;j<8;j++){c.fillStyle=j%3?'#c09570':'#b98e69';c.fillRect(0,j*64,512,63);
    c.strokeStyle='#987356';c.lineWidth=2;c.strokeRect(-1,j*64,514,64);
    c.fillStyle='#997256';c.fillRect((j*179)%480,j*64,2,64);
    for(let k=0;k<31;k++){const x=r()*500,y=j*64+r()*62;c.beginPath();c.strokeStyle=k%3?'#b88d6955':'#d2ad8470';
     c.moveTo(x,y);c.bezierCurveTo(x+14,y-2,x+26,y+3,x+60+r()*70,y);c.stroke()}}
  }else{for(let j=0;j<3300;j++){c.fillStyle=['#e4c1a8','#715e63','#c89e87','#dec7b0'][j%4];const x=r()*512,y=r()*512;c.fillRect(x,y,1+r()*3,1+r()*2)}
   c.strokeStyle='#9c7c72';c.lineWidth=4;c.strokeRect(0,0,512,512)}
 });tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(wood?3:8,wood?3:8);tex.anisotropy=4;
 return new T.MeshStandardMaterial({map:tex,roughness:.88});
}
function sessionMural(){
 return printed(1024,512,(c,w,h)=>{
  c.fillStyle='#27545b';c.fillRect(0,0,w,h);c.fillStyle='#e4a375';c.beginPath();c.arc(759,198,119,0,Math.PI*2);c.fill();
  for(let j=0;j<12;j++){c.lineWidth=3;c.strokeStyle=j%2?'#8eafa0':'#528980';c.beginPath();c.moveTo(-15,280+j*15);c.bezierCurveTo(320,82+j*13,503,452+j*8,1038,222+j*15);c.stroke()}
  c.strokeStyle='#f3ba9c';c.lineWidth=13;c.lineCap='round';c.beginPath();c.moveTo(727,328);c.bezierCurveTo(845,346,767,211,833,212);c.bezierCurveTo(863,213,866,241,854,250);c.stroke();
  c.fillStyle='#f4b49a';c.beginPath();c.ellipse(711,306,76,32,-.17,0,Math.PI*2);c.fill();c.lineWidth=6;
  for(const x of [706,727]){c.beginPath();c.moveTo(x,331);c.lineTo(x-3,390);c.lineTo(x-17,417);c.stroke()}
  c.fillStyle='#f1d1a2';c.font='italic bold 100px Georgia';c.fillText('After Dark',48,243,545);c.font='700 25px sans-serif';c.fillText('FLAMINGO   •   LIVE SESSIONS',56,304);c.font='17px monospace';c.fillText('PALM CITY   /   EST. 1982',58,347)
 });
}
export function createVenues(scene,colliders,footprints){
 const staticGroup=new T.Group(),partyLights=new T.Group();scene.add(staticGroup,partyLights);
 const geo=batcher(staticGroup),lights=batcher(partyLights),{b,rod,sphere}=geo;
 const wall=(x,y,z,w,h,d,color)=>{b(x,y,z,w,h,d,color);colliders.push({x,z,w:w/2,d:d/2})};
 const print=(x,y,z,w,h,angle,mat)=>geo.add(plane,x,y,z,w,h,1,0xffffff,0,angle,0,mat);
 const bulb=new T.SphereGeometry(1,10,8);const east=Math.PI/2,recordMats=albums.map(sleeveMat);
 const wood=0xb17e5f,mint=0x79c7b5,cream=0xffdbac,brass=0xc39662,ink=0x343249;
 const addRail=(x,z,w,d,col=brass)=>{b(x,1.0,z,w,.08,d,col);b(x,.53,z,w,.06,d,col)};
 function shop(){
  const x=133,z=shopZ,w=20,d=20;
  footprints.push({x,z,w,d});
  b(x,.158,z,w,.12,d,0xbdb1a0);geo.add(plane,x,.224,z,19.7,19.7,1,0xffffff,-Math.PI/2,0,0,roomFloor(true));
  // Real floor and open front door, with individually collidable walls and furniture.
  wall(123.1,2.25,z,.35,4.5,d,0xa28e81);
  for(const side of [-1,1])wall(x,2.24,z+side*9.85,w,4.5,.32,0xdfba9a);
  for(const [zz,depth] of [[47.7,7.2],[60.3,7.2]]){
   wall(storefront,.49,zz,.24,.70,depth,0x426568);
   for(const y of [1,3.24])b(storefront,y,zz,.23,.12,depth,ink);
   for(let j=-1;j<=1;j++)b(storefront,2.1,zz+j*depth*.45,.21,2.3,.11,brass);
   const glass=new T.MeshStandardMaterial({color:0x85babe,metalness:.28,roughness:.15,transparent:true,opacity:.17,depthWrite:false});
   geo.add(plane,143.03,2.1,zz,depth-.14,2.15,1,0xffffff,0,east,0,glass);
  }
  b(x,4.35,z,w+.55,.34,d+.55,0xcba89c);b(x,6.0,z,w,3.1,d,0xe7b996);
  b(x,7.65,z,w+.66,.22,d+.72,cream);b(x,7.95,z,w-.4,.33,d-.4,0xbe998a);
  for(let i=0;i<6;i++){const zz=46+i*3.16;b(143.09,5.99,zz,.14,1.65,1.66,0x627b84);b(143.17,5.43,zz,.18,.13,1.84,cream);b(143.2,6.03,zz,.16,1.62,.075,0xdeba96)}
  for(const y of [3.53,3.84,4.14])b(143.64,y,z,1.75,.15,20.75,mint,0,0,0,true);
  b(143.45,4.75,z,.62,1.28,16.5,ink);print(143.775,4.76,z,7.78,1.16,east,letterPanel('Wave Records','PALM CITY   •   VINYL & TAPES   •   EST. 1978','#234e50','#ffdbaf'));
  for(let j=0;j<20;j++)b(143.81,3.37,44.47+j,2.35,.12,1,j%2?0xf2d5b0:0xba655b,0,0,-.095);
  for(const zz of [52.04,56.05]){b(143.78,1.78,zz,.24,3.2,.18,0x735446);b(143.89,1.73,zz,.16,2.95,.055,brass)}
  const door=new T.MeshStandardMaterial({color:0x91b6b7,transparent:true,opacity:.31,side:T.DoubleSide});
  geo.add(plane,142.05,1.72,55.93,1.8,2.89,1,0xffffff,0,.1,0,door);
  b(142.1,1.24,55.88,.5,.06,.09,brass);
  for(const zz of [46.5,61.6]){
   print(143.80,4.75,zz,3.2,.69,east,letterPanel(zz<50?'33 RPM':'SIDE B','ANALOG SOUND','#234e50','#f3c092'));
   b(143.81,1.67,zz,.12,1.25,.95,wood);print(143.88,1.67,zz,.84,1.14,east,recordMats[zz<50?2:4]);
  }
  const light=new T.PointLight(0xffc188,41,13,1.3);light.position.set(136,3.52,52.2);scene.add(light);
  // Freestanding sleeve bins, printed covers, shelving and a working counter.
  for(const [x0,z0,length] of [[139.75,48.2,6],[139.6,60.2,6],[126,54,12]]){
   wall(x0,.54,z0,1.05,.82,length,wood);
   for(const side of [-1,1])b(x0+side*.53,1.00,z0,.085,.32,length+.08,wood);
   const count=Math.floor(length/.66)-1;
   for(let j=0;j<count;j++){const zz=z0-length/2+.7+j*.68;
    for(let k=0;k<3;k++)b(x0-.22+k*.15,1.08+k*.02,zz,.055,.56,.57,[0xb3a197,0x506979,0xdebf96][(k+j)%3],0,0,-.09);
    print(x0+.31,1.15,zz,.58,.58,east,recordMats[(j+count)%6]);
   }
  }
  for(let j=0;j<7;j++)print(123.30,2.6,46.65+j*2.31,1.65,1.65,east,recordMats[j%6]);
  wall(134.7,.66,49.8,3.35,1.08,1.05,0x647e74);b(134.7,1.25,49.8,3.58,.13,1.25,wood);
  b(134.0,1.45,49.7,.52,.36,.43,ink);b(134.01,1.53,49.96,.40,.15,.04,0x8aded3,0,0,0,true);
  b(135.46,1.36,49.82,.62,.08,.57,0xa46548);b(135.46,1.412,49.82,.57,.025,.51,cream);
  for(let j=0;j<3;j++){const zz=47+j*6.8;b(133,3.94,zz,4,.12,.44,ink);b(133,3.86,zz,3.7,.035,.28,0xffdfad,0,0,0,true)}
  // Oversized vinyl blade sign with label and concentric pressed grooves.
  geo.add(vinyl,144.68,6.95,50.0,1.15,.19,1.15,ink,Math.PI/2,0,0);
  for(let i=0;i<3;i++){const ring=new T.TorusGeometry(.67+i*.138,.012,5,48);geo.add(ring,144.68,6.95,50.115,1,1,1,0x687582)}
  geo.add(vinyl,144.68,6.95,50.125,.33,.025,.33,0xf88785,Math.PI/2,0,0);
  b(143.77,6.95,50.0,2,.11,.14,brass);
  for(const zz of [46.7,60.4]){wall(145.35,.46,zz,.9,.64,1.15,0xad725c);for(let i=0;i<7;i++)geo.add(new T.ConeGeometry(.12,.92,5),145.35+Math.cos(i)*.14,1.04,zz+Math.sin(i)*.17,1,1,1,0x62855d,.36*Math.sin(i),i,.44*Math.cos(i))}
 }
 function club(){
  const left=22,back=-143;
  b(41,.158,-120,57,.12,55,0xb29998);
  for(let ix=0;ix<11;ix++)for(let iz=0;iz<10;iz++)b(38+ix*2.55,.232,-138+iz*3.55,2.51,.025,3.51,(ix+iz)%2?0x9e8992:0xb29d9d);
  wall(left,4.4,-120,18,8.5,48,0xd3998f);footprints.push({x:left,z:-120,w:18,d:48});
  b(left,8.86,-120,19,.46,49,cream);for(const zz of [-138,-131,-124,-117,-110,-103]){b(31.16,5.1,zz,.36,4.5,3.7,0x55657a);for(const y of [3.8,5.6])b(31.45,y,zz,.38,.14,4.2,cream)}
  for(const y of [7.45,7.77,8.10])lights.b(31.36,y,-120,.39,.13,48,0xff9c9d,0,0,0,true);
  lights.add(plane,31.42,6.85,-120,14,2.8,1,0xffffff,0,east,0,letterPanel('Flamingo','SOCIAL CLUB   /   LEONIDA SESSIONS','#5c394e','#ffd2bc'));
  for(const [xx,zz,ww,dd] of [[50,back,36,.55],[42.25,-97,20.5,.55],[62.75,-97,10.5,.55],[67.7,-130,.5,26],[67.7,-103,.5,11]]){
   wall(xx,.86,zz,ww,1.25,dd,0xc29488);b(xx,1.56,zz,ww+.12,.16,dd+.12,cream);
  }
  for(const z of [-117,-109]){wall(67.65,1.6,z,.78,2.8,.84,0x877781);lights.b(67.65,3.15,z,.86,.16,.92,0xfab5a9,0,0,0,true)}
  b(67.65,3.70,-113,.48,.46,9.35,ink);lights.add(plane,67.91,3.71,-113,8.8,.65,1,0xffffff,0,east,0,letterPanel('AFTER DARK','COURTYARD SESSIONS','#533849','#ffd6ac'));
  for(const zz of [-114.85,-112.85,-110.85]){rod(68.2,.56,zz,.14,.77,brass);colliders.push({x:68.2,z:zz,w:.13,d:.13})}
  geo.add(plane,49.45,.236,-120,34.9,44.7,1,0xffffff,-Math.PI/2,0,0,roomFloor(false));
  print(31.58,3.55,-130,14.6,6.05,east,sessionMural());
  const glow=canvasTexture(128,128,(c)=>{const g=c.createRadialGradient(64,64,1,64,64,64);g.addColorStop(0,'rgba(255,187,120,.38)');g.addColorStop(.53,'rgba(255,158,135,.15)');g.addColorStop(1,'rgba(255,155,123,0)');c.fillStyle=g;c.fillRect(0,0,128,128)});
  const glowMat=new T.MeshBasicMaterial({map:glow,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  for(const x of [38,49,60])for(const z of [-137,-119,-101])lights.add(plane,x,.25,z,10,8,1,0xffffff,-Math.PI/2,0,0,glowMat);
  // Stage, decks, amplifier cabinets and inset woofer cones.
  b(38.0,.36,-129,11.4,.36,11.8,0x604b59);b(38.1,.59,-134.2,11.4,.14,.65,0xef9c87,0,0,0,true);
  wall(40.0,.9,-130.2,1.6,1.27,5.3,0x704e5c);b(40,1.58,-130.2,1.85,.15,5.65,ink);
  for(const z of [-131.7,-128.7]){rod(40,1.71,z,.53,.09,0x252638);rod(40,1.77,z,.18,.027,mint)}
  for(let j=0;j<5;j++){b(40.32,1.72,-130.65+j*.16,.45,.043,.045,0xd8c4ac);b(40.08,1.75,-130.65+j*.16,.08,.057,.075,ink)}
  for(const zz of [-136.2,-123.0]){wall(35.8,1.38,zz,1.35,2.35,1.7,ink);for(const yy of [.88,1.85]){geo.add(vinyl,36.51,yy,zz,.48,.085,.48,0x252732,0,0,Math.PI/2);geo.add(vinyl,36.56,yy,zz,.16,.08,.16,0x56646c,0,0,Math.PI/2)}}
  for(const zz of [-137,-119,-101]){
   for(const xx of [34,64])rod(xx,2.6,zz,.075,4.8,ink);
   for(let i=0;i<15;i++){const x=34+i*2.13,tt=i/14,y=5.02-.84*Math.sin(tt*Math.PI);b(x+.97,y+.08,zz,2.2,.035,.035,0x584759,0,0,-.08*Math.cos(tt*Math.PI));lights.add(bulb,x,y-.08,zz,.11,.14,.11,i%3?0xffcb91:0x92e5da,0,0,0,lights.unlit)}
  }
  wall(45,1.02,-102.1,12.1,1.45,1.6,0x6c8e83);b(45,1.79,-102.1,12.5,.17,1.95,wood);
  for(let i=0;i<17;i++){const x=39.6+i*.63;rod(x,1.99,-102.1,.09,.38,[0x658d84,0xc9af80,0x8297a9][i%3]);rod(x,2.23,-102.1,.042,.13,brass)}
  for(const [x,z] of [[55,-134],[61,-102.5],[37,-112]]){wall(x,.78,z,3.2,.92,.85,0x885869);b(x,.51,z+.65,3.22,.35,1.47,0xc78c8b);rod(x,.57,z+2.25,.11,.67,brass);rod(x,.95,z+2.25,.83,.12,wood)}
  wall(48,.65,-119.9,2.8,.95,1.2,wood);b(48,1.20,-119.9,3,.12,1.38,cream);
  for(const xx of [54,59,64]){addRail(xx,-142,4.7,.08);b(xx,1.9,-142.43,.13,2.8,.14,brass)}
 }
 shop();club();geo.flush();lights.flush();
 const shutter=new T.Mesh(new T.BoxGeometry(4.9,2.35,.22),letterPanel('CREW','FLAMINGO   /   LOADING','#405c59','#ecd4a6'));shutter.position.set(55,1.38,-97);scene.add(shutter);
 const barrier={x:55,z:-97,w:2.45,d:.15};colliders.push(barrier);
 for(const x of [52.55,57.45]){const post=new T.Mesh(new T.BoxGeometry(.15,3.5,.24),new T.MeshStandardMaterial({color:0x726557}));post.position.set(x,1.8,-97);scene.add(post)}
 return {partyLights,recordMats,setLoadingDoor(open){shutter.position.y=open?3.65:1.38;barrier.w=open?-10:2.45},partyMood(on){partyLights.visible=on}};
}
