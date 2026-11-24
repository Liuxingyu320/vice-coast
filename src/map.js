import {xs,zs,tapes,route} from './data.js';
export function paintMap(canvas,pos,target,save,footprints,big=false,race=null,patrols=[]){
 const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
 const scale=big?Math.min(W/570,H/560):W/135;
 const cx=big?-14:pos.x,cz=big?0:pos.z-9;
 const px=x=>(x-cx)*scale+W/2,pz=z=>(z-cz)*scale+H/2;
 const rect=(x,z,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(px(x),pz(z),w*scale,h*scale)};
 ctx.fillStyle='#1c384b';ctx.fillRect(0,0,W,H);rect(-269,-269,494,538,'#57616a');rect(179,-269,47,537,'#89948e');rect(-268,-267,443,534,'#303c49');
 rect(178,-133,65,10,'#9d8a72');
 for(const x of xs)rect(x-8,-251,16,502,'#758492');
 for(const z of zs)rect(-251,z-8,422,16,'#758492');
 for(const v of footprints)rect(v.x-v.w/2,v.z-v.d/2,v.w,v.d,'#485865');
 if(big){ctx.fillStyle='#b6c3c366';ctx.font='bold 13px sans-serif';ctx.textAlign='center';for(const [s,x,z] of [['深 川 下 町',-151,34],['新 桥 商 区',32,-128],['芝 浦 广 场',26,125]])ctx.fillText(s,px(x),pz(z))}
 if(big){
  ctx.save();ctx.strokeStyle='#9ac2ad';ctx.setLineDash([4,3]);ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(px(-264),pz(16.3));ctx.lineTo(px(220),pz(16.3));ctx.stroke();ctx.restore();
  ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillStyle='#eed2aa';
  for(const [label,x,z] of [['芝公园铁塔',105,-119],['有明站',123,16],['潮见码头',204,-128]]){
   ctx.beginPath();ctx.arc(px(x),pz(z),3.2,0,Math.PI*2);ctx.fill();ctx.fillText(label,px(x),pz(z)-7);
  }
 }
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
 ctx.save();ctx.translate(px(pos.x),pz(pos.z));ctx.rotate(-pos.a);const k=big?1.2:1.5;ctx.scale(k,k);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.lineWidth=2.3;ctx.strokeStyle='#19282e';ctx.stroke();ctx.fillStyle='#89ffe1';ctx.fill();ctx.restore();
}

export function clickedPoint(canvas,e){const r=canvas.getBoundingClientRect(),w=canvas.width,h=canvas.height,k=Math.min(w/570,h/560);return {x:-14+((e.clientX-r.left)/r.width*w-w/2)/k,z:((e.clientY-r.top)/r.height*h-h/2)/k}}
