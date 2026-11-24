import {garagePrice} from './ledger-state.js';
import * as T from 'three';
import {circuits,stops,guests,upgrades,newFare,fareTerms,routeLength} from './data.js';
import {makeCar} from './models.js';
import {layoutCircuit} from './racing.js';

const cash=n=>'$'+n.toLocaleString('en-US');
export const clock=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')+'.'+Math.floor(t*10)%10;
export function tabs(selected){return '<nav class="dispatchtabs" aria-label="活动类别">'+[['jobs','故事委托'],['cab','夜班载客'],['race','街头竞速']].map(([k,n])=>'<button aria-pressed="'+(k===selected)+'" data-act="'+k+'">'+n+'</button>').join('')+'</nav>'}
export function cabPanel(save,sim,kind){
 const f=save.cab??save.heldCab??newFare(save,sim.pos,kind),terms=fareTerms(f),g=guests[f.guest];
 const history=save.trips?'<p class="helpnote">已送达 '+save.trips+' 单　·　高舒适度 '+save.perfect+' 单　·　累计 '+cash(save.cabIncome)+'</p>':'';
 return tabs('cab')+'<div class="ticket cabticket"><div class="tickethead"><b>COAST CABS</b><small>夜班调度　/　'+String(save.trips+1).padStart(3,'0')+'</small></div><div class="ticketbody"><small>'+g.job+'</small><h3>'+g.name+'</h3><p>“'+g.line+'”</p><div class="itinerary"><b>'+stops[f.from].name+'</b><span>→</span><b>'+stops[f.to].name+'</b></div></div></div>'+
 (!save.cab&&!save.heldCab?'<div class="switches">'+['cruise','express'].map((v,i)=>'<button data-fare="'+v+'" aria-pressed="'+(v===kind)+'">'+['舒适单','赶场单'][i]+'</button>').join('')+'</div>':'')+
 '<div class="numbers"><div><small>保底车费</small><b>'+cash(terms.base)+'</b></div><div><small>最高小费</small><b>+'+cash(terms.maxTip)+'</b></div><div><small>'+ (f.kind==='express'?'准点时限':'载客路程')+'</small><b>'+(f.kind==='express'?terms.limit+' s':terms.distance+' m')+'</b></div></div><p class="helpnote">'+(f.kind==='express'?'乘客赶时间。超时只影响小费，碰撞与高速急转会降低舒适度。':'在琥珀色光圈内停稳，让乘客上下车。平稳转向、少碰撞可以保住小费。')+'</p><div class="actions"><button class="btn hot" data-act="takeCab">'+(save.cab||save.heldCab?'继续本单':'接下这单')+'</button>'+(save.cab?'<button class="btn" data-act="endEvent">结束载客</button>':'')+'</div>'+history;
}
export function racePanel(save,race,index){
 const c=circuits[index],rec=save.records[c.id],track=layoutCircuit(c);
 return tabs('race')+'<div class="switches">'+circuits.map((v,i)=>'<button data-circuit="'+i+'" aria-pressed="'+(index===i)+'">'+v.name+'</button>').join('')+'</div><div class="ticket raceticket"><div class="tickethead"><b>COAST MOTOR CLUB</b><small>起跑名单　/　4 辆</small></div><div class="course"><div><small>'+c.en+'</small><h3>'+c.name+'</h3><p>'+c.laps+' 圈　·　'+(track.length*c.laps/1000).toFixed(2)+' km</p></div><canvas id="diagram" width="340" height="140" aria-label="赛道形状"></canvas></div></div>'+
 '<div class="numbers"><div><small>冠军奖金</small><b>'+cash(c.prize)+'</b></div><div><small>个人最佳</small><b>'+(rec?clock(rec.best):'—')+'</b></div><div><small>最佳名次</small><b>'+(rec?'P'+rec.rank:'—')+'</b></div></div><p class="helpnote">使用私人跑车在起点集合。依次通过旗门，贴近同向对手车尾可补充氮气。每个名次都有奖金。</p><div class="actions"><button class="btn hot" data-act="startRace">'+(race?.active&&race.spec.id===c.id?'继续本场':'前往发车')+'</button>'+(race?.active?'<button class="btn" data-act="endEvent">退出本场</button>':'')+'</div>';
}
export function drawTrack(canvas,id){
 if(!canvas)return;const t=layoutCircuit(circuits[id]),ctx=canvas.getContext('2d'),pts=t.samples;
 const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),left=Math.min(...xs),top=Math.min(...zs),w=Math.max(...xs)-left,h=Math.max(...zs)-top,k=Math.min(275/w,109/h);
 const coord=p=>[(canvas.width-w*k)/2+(p.x-left)*k,(canvas.height-h*k)/2+(p.z-top)*k];ctx.lineJoin='round';ctx.lineCap='round';
 ctx.strokeStyle='#ffffff12';ctx.lineWidth=1;for(let x=0;x<340;x+=15){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,140);ctx.stroke()}for(let y=0;y<140;y+=15){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(340,y);ctx.stroke()}
 ctx.beginPath();pts.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](...coord(p)));ctx.strokeStyle='#8cd9d7';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#ffb36d';ctx.beginPath();ctx.arc(...coord(pts[0]),6,0,Math.PI*2);ctx.fill();
}
export function modPanel(save){return '<div class="mods">'+upgrades.map(u=>{const level=save.mods[u.id],price=garagePrice(save,u.price[level]);return '<button data-mod="'+u.id+'" '+(level===2||save.money<price?'disabled':'')+'><div><strong>'+u.name+'</strong><small>'+u.detail+'　'+u.stat(level)+(price?' → '+u.stat(level+1):'')+'</small></div><div><small>LV '+level+' / 2</small><b>'+(price?cash(price):'满级')+'</b></div></button>'}).join('')+'</div>'}
export function navigation(save,sim){return '<div class="charthead"><b>TOKYO BAY</b><small>点击道路设置路标</small></div><canvas class="mapfull" id="bigmap" width="720" height="540" aria-label="海岸城市道路及导航地图"></canvas><div class="legend"><b>▲ 车辆</b><em>● 活动</em><i>◆ 录音带</i></div><div class="mapstops">'+[1,2,3,5].map(i=>'<button data-stop="'+i+'">'+stops[i].name+'</button>').join('')+'</div>'+(save.pin?'<p class="helpnote">已标记 '+save.pin.name+'　·　'+Math.round(routeLength(sim.pos,save.pin))+' m　<button class="plain" data-act="clearPin">清除路标</button></p>':'')}
let studio=null;
export function showroom(canvas,sim,color,angle){
 if(!studio){const scene=new T.Scene();scene.background=new T.Color(0x202333);scene.environment=sim.scene.environment;scene.environmentIntensity=1.2;
  scene.add(new T.HemisphereLight(0xffddd7,0xa49dc9,2.2));const key=new T.DirectionalLight(0xffe0bc,3.3);key.position.set(-4,7,-2);scene.add(key);
  const rim=new T.DirectionalLight(0x73ffe9,2);rim.position.set(4,3,5);scene.add(rim);const car=makeCar(color,0,true);scene.add(car);
  const floor=new T.Mesh(new T.PlaneGeometry(160,160),new T.MeshStandardMaterial({color:0x343548,roughness:.84}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);
  for(const x of [-3.8,-3.5,3.5,3.8]){const bar=new T.Mesh(new T.BoxGeometry(.075,.035,25),new T.MeshBasicMaterial({color:x<0?0xd2a6c5:0x7fcecd}));bar.position.x=x;scene.add(bar)}
  studio={scene,car,camera:new T.PerspectiveCamera(26,1,.1,120)}}
 const r=sim.renderer,tmp=new T.Vector2();r.getSize(tmp);const was=r.getPixelRatio();
 try{r.setPixelRatio(1);r.setSize(canvas.width,canvas.height,false);studio.car.userData.paint.color.setHex(color);const c=studio.camera;c.aspect=canvas.width/canvas.height;c.position.set(Math.sin(angle)*6.35,2.4,Math.cos(angle)*6.35);c.lookAt(0,.78,0);c.updateProjectionMatrix();r.render(studio.scene,c);canvas.getContext('2d').drawImage(r.domElement,0,0,canvas.width,canvas.height)}
 finally{r.setPixelRatio(was);r.setSize(tmp.x,tmp.y,false);sim.render()}
}
