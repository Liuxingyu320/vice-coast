import {tapes,route} from './data.js';
import {shibaLimits,shibaRoads} from './shiba-ground.js';
export function paintMap(canvas,pos,target,save,footprints,big=false,race=null,patrols=[],heat=0){
 const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
 const spanX=shibaLimits.maxX-shibaLimits.minX,spanZ=shibaLimits.maxZ-shibaLimits.minZ;
 const scale=big?Math.min(W/(spanX+40),H/(spanZ+40)):W/135;
 const cx=big?(shibaLimits.minX+shibaLimits.maxX)/2:pos.x,cz=big?(shibaLimits.minZ+shibaLimits.maxZ)/2:pos.z-9;
 const px=x=>(x-cx)*scale+W/2,pz=z=>(z-cz)*scale+H/2;
 const rect=(x,z,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(px(x),pz(z),w*scale,h*scale)};
 ctx.fillStyle='#1a5278';ctx.fillRect(0,0,W,H);rect(shibaLimits.minX,shibaLimits.minZ,spanX,spanZ,'#6d746c');
 ctx.strokeStyle='#e4e1d4';ctx.lineWidth=big?2:3;ctx.beginPath();
 for(const [x,z,x2,z2] of shibaRoads){ctx.moveTo(px(x),pz(z));ctx.lineTo(px(x2),pz(z2))}
 ctx.stroke();
 for(const v of footprints)rect(v.x-v.w/2,v.z-v.d/2,v.w,v.d,'#5c645e');
 if(!big&&heat>0){ctx.fillStyle='rgba(255,79,110,.34)';ctx.fillRect(0,0,W,H)}
 if(big){ctx.fillStyle='#eed2aa';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('芝公园',px(30),pz(324))}
 if(race?.active){ctx.beginPath();race.track.samples.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.strokeStyle='#74e9d0';ctx.lineWidth=big?3:4;ctx.stroke();for(const v of race.cars){ctx.fillStyle='#'+v.color.toString(16).padStart(6,'0');ctx.beginPath();ctx.arc(px(v.car.position.x),pz(v.car.position.z),big?4:5,0,Math.PI*2);ctx.fill()}}
 if(target){const points=race?.active?[]:target.type==='chapter'&&Math.hypot(pos.x-target.x,pos.z-target.z)<42?[pos,target]:route(pos,target);const color=target.type==='chapter'?'#ffd08a':target.type==='cab'?'#ffca74':target.type==='pin'?'#7ed5ff':target.type==='race'?'#8af8d5':'#ff6998';ctx.strokeStyle=color;ctx.lineWidth=big?4:5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.stroke();
  ctx.fillStyle=color;ctx.strokeStyle='#fff1d5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px(target.x),pz(target.z),big?6:8,0,Math.PI*2);ctx.fill();ctx.stroke()}
 for(let i=0;i<tapes.length;i++){if(save.tapes.includes(i))continue;const p=tapes[i],x=px(p.x),y=pz(p.z),size=big?4:5;ctx.fillStyle='#ffe19b';ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x+size,y);ctx.lineTo(x,y+size);ctx.lineTo(x-size,y);ctx.fill()}
 for(const patrol of patrols){
  const x=px(patrol.x),y=pz(patrol.z),r=big?5:6;
  ctx.fillStyle='#131b26';ctx.beginPath();ctx.arc(x,y,r+2,0,2*Math.PI);ctx.fill();
  ctx.fillStyle='#ff4f6e';ctx.beginPath();ctx.arc(x,y,r,Math.PI/2,3*Math.PI/2);ctx.fill();
  ctx.fillStyle='#70aaff';ctx.beginPath();ctx.arc(x,y,r,-Math.PI/2,Math.PI/2);ctx.fill();
 }
 ctx.save();ctx.translate(px(pos.x),pz(pos.z));ctx.rotate(-pos.a);const k=big?1.2:1.5;ctx.scale(k,k);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.lineWidth=2.3;ctx.strokeStyle='#111';ctx.stroke();ctx.fillStyle='#fff';ctx.fill();ctx.restore();
}

export function clickedPoint(canvas,e){const r=canvas.getBoundingClientRect(),w=canvas.width,h=canvas.height,k=Math.min(w/570,h/560);return {x:-14+((e.clientX-r.left)/r.width*w-w/2)/k,z:((e.clientY-r.top)/r.height*h-h/2)/k}}
