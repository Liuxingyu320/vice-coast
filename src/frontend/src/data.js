import {readLedger,droppedStory} from './ledger-state.js';
import {additions} from './street-catalog.js';
import {shibaLimits} from './shiba-ground.js';
export const xs=[-240,-160,-80,0,80,160], zs=[-240,-160,-80,0,80,160,240];
export const roadWidth=20;
// Keep curb ramps and the ends of the crosswalk stripes clear as well as the asphalt.
export const cornerClearance=roadWidth/2+2;
export const clearOfCrossStreets=(z,halfDepth=0)=>zs.every(cross=>Math.abs(z-cross)>cornerClearance+halfDepth);
export const spawn={x:164.3,z:134,a:0};
export const missions=[
 {name:'霓虹计时赛',en:'NEON SPRINT',from:'索尔 · 夜跑车会',line:'从湾岸通起跑，穿过霓虹区。发车后 80 秒内通过三个计时点。',reward:1100,time:80,steps:[
  {x:164.2,z:15,label:'驶入夜跑起点',note:'开始计时。穿过下一个光圈！'},
  {x:83.8,z:-74,label:'通过霓虹区计时点',note:'第一个计时点通过。'},
  {x:4,z:-150,label:'通过芝浦广场计时点',note:'最后一段，终点在酒店街。'},
  {x:151,z:-235.8,label:'冲过酒店街终点',note:'终点计时已锁定。'}]}
];
export const tapes=[
 {x:174,z:95,name:'海风倒带'}, {x:178,z:-115,name:'码头余辉'}, {x:13,z:-48,name:'落日调频'},
 {x:-146,z:14,name:'银杏回声'}, {x:-92,z:92,name:'街角慢拍'}, {x:66,z:204,name:'散场之后'}];
export const paints=[{id:'cherry',name:'落日樱桃',color:0xe84c68,price:0},{id:'lagoon',name:'潟湖薄荷',color:0x32d1c2,price:250},{id:'gold',name:'日光琥珀',color:0xf0a340,price:400},{id:'afterglow',name:'午夜极光',color:0x9871e5,unlock:450}];
export const parkedSpots=[{x:153.2,z:56,a:Math.PI},{x:73.1,z:-112,a:Math.PI},{x:-86.6,z:100,a:Math.PI},{x:8.5,z:185,a:0}];
export const parkedColors=[0xe84c68,0x6fbbac,0xf2c681,0x918eb9,0xd3d8c5];
export const streetStyles=[
 ...Array.from({length:13},(_,i)=>({color:parkedColors[(i+2)%parkedColors.length],model:i<additions.length?i+3:i%2})),
 ...[0xb690c0,0x83bdb8,0xf1cd89].map((color,i)=>({color,model:i%2})),{color:0x368784,model:2},
 ...additions.map((v,i)=>({color:v.color,model:i+3}))
];
export function district(x,z){if(x>137)return '湾岸通';if(x< -56)return '深川下町';return z<0?'新桥商区':'芝浦广场'}
export function districtEn(x,z){if(x>137)return 'WANGAN-DORI';if(x< -56)return 'FUKAGAWA';return z<0?'SHIMBASHI':'SHIBAURA'}
export function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const nearest=(list,n)=>list.reduce((a,b)=>Math.abs(a-n)<Math.abs(b-n)?a:b);
function roadLinks(p){
 const x=nearest(xs,p.x),z=nearest(zs,p.z);
 if(Math.abs(p.x-x)<Math.abs(p.z-z)){
  const zs0=zs.filter(n=>n<=p.z).at(-1)??zs[0],zs1=zs.find(n=>n>=p.z)??zs.at(-1);
  return [zs0,zs1].map(v=>[{x,z:p.z},{x,z:v}]);
 }
 const x0=xs.filter(n=>n<=p.x).at(-1)??xs[0],x1=xs.find(n=>n>=p.x)??xs.at(-1);
 return [x0,x1].map(v=>[{x:p.x,z},{x:v,z}]);
}
export function route(a,b){
 const start=roadLinks(a),end=roadLinks(b);
 if((xs.includes(start[0][0].x)&&start[0][0].x===end[0][0].x)||(zs.includes(start[0][0].z)&&start[0][0].z===end[0][0].z))return [a,start[0][0],end[0][0],b];
 let shortest=Infinity,chosen=[a,b];
 for(const [sa,na] of start)for(const [sb,nb] of end){
  const options=[{x:nb.x,z:na.z},{x:na.x,z:nb.z}];
  for(const mid of options){
   const pts=[a,sa,na,mid,nb,sb,b];let len=0;for(let i=1;i<pts.length;i++)len+=dist(pts[i-1],pts[i]);
   if(len<shortest){shortest=len;chosen=pts}
  }
 }
 return chosen;
}
export const editionKey='vicecoast.ledger.1';
export function readEdition(){try{return localStorage.getItem(editionKey)}catch{return null}}
export function loadSave(snapshot=readEdition()){
 const base={chapter:readLedger(),heldCab:null,money:0,done:[],tapes:[],owned:['cherry'],paint:'cherry',mission:-1,step:0,best:0,car:0,pos:{...spawn},radio:true,sound:true,view:0,fleet:null,walker:null,bookmark:null,night:true,driftBest:0,trips:0,cabIncome:0,perfect:0,mods:{engine:0,brakes:0,nitro:0},records:{},cab:null,pin:null};
 try{let d;
 for(const raw of [snapshot,localStorage.getItem('vicecoast.afterhours.1'),localStorage.getItem('vicecoast.save.1')]){try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){d=parsed;break}}catch{}}
 if(!d)return base; const legacy=droppedStory(d.chapter);base.chapter=readLedger(d.chapter);
 if(Array.isArray(d.tapes))base.tapes=[...new Set(d.tapes.filter(v=>Number.isInteger(v)&&v>=0&&v<6))];
 if(Array.isArray(d.done))base.done=[...new Set((legacy?d.done.includes(1)?[0]:[]:d.done).filter(v=>v===0))];
 if(Number.isFinite(d.money))base.money=Math.max(0,Math.floor(d.money));
 if(Array.isArray(d.owned))base.owned=[...new Set(['cherry',...d.owned.filter(v=>paints.some(p=>p.id===v))])];
 if(base.owned.includes(d.paint))base.paint=d.paint;
 const mission=legacy?d.mission===1?0:-1:d.mission;if(Number.isInteger(mission)&&missions[mission]){base.mission=mission;base.step=clamp(Math.trunc(d.step)||0,0,missions[mission].steps.length-1);if(missions[mission].time)base.step=0}
 const pose=p=>p&&[p.x,p.z,p.a].every(Number.isFinite)?{x:clamp(p.x,shibaLimits.minX+1,shibaLimits.maxX-1),z:clamp(p.z,shibaLimits.minZ+1,shibaLimits.maxZ-1),a:p.a}:null;
 base.pos=pose(d.pos)||base.pos;base.walker=pose(d.walker);
 const fixedCars=parkedSpots.length+1;
 if(Array.isArray(d.fleet)&&d.fleet.length>=fixedCars&&d.fleet.slice(0,fixedCars).every(p=>pose(p))){
  base.fleet=d.fleet.slice(0,fixedCars).map(pose);
  const used=new Set();
  for(const entry of d.fleet.slice(fixedCars,fixedCars+streetStyles.length)){
   const p=pose(entry),id=entry?.trafficId;
   if(!p||!Number.isInteger(id)||!streetStyles[id]||used.has(id))break;
   // Claimed traffic in earlier saves used alternating original coupes.
   const model=id<additions.length&&entry.model!==streetStyles[id].model?id%2:streetStyles[id].model;
   used.add(id);base.fleet.push({...p,trafficId:id,model});
  }
 }
 if(d.bookmark&&Number.isInteger(d.bookmark.id)){const id=legacy?d.bookmark.id===1?0:-1:d.bookmark.id;if(missions[id]){const m=missions[id];base.bookmark={id,step:m.time?0:clamp(Math.trunc(d.bookmark.step)||0,0,m.steps.length-1)}}}
 if(Number.isInteger(d.car))base.car=clamp(d.car,0,(base.fleet?.length??fixedCars)-1);
 if(Number.isFinite(d.best)&&d.best>0)base.best=d.best;
 for(const k of ['sound','radio'])if(typeof d[k]==='boolean')base[k]=d[k];
 if(d.view===1)base.view=1;restoreExpansion(base,d); if(d.heldCab){const holder={...base,cab:null,mission:-1};restoreExpansion(holder,{...d,cab:d.heldCab});base.heldCab=holder.cab}
 }catch{}return base;
}

// Curbside stops use a drivable coordinate and a separate place for the passenger to stand.
export const stops=[
 {name:'东京湾酒店',en:'TOKYO BAY HOTEL',x:165,z:111,walkX:171.3,walkZ:111},
 {name:'潮见码头',en:'SHIOMI PIER',x:165,z:-122,walkX:171.3,walkZ:-122},
 {name:'波音唱片',en:'WAVE RECORDS',x:154,z:52,walkX:148.6,walkZ:52},
 {name:'霓虹剧院',en:'NEON THEATRE',x:75,z:-101,walkX:68.3,walkZ:-101},
 {name:'芝浦广场',en:'SHIBAURA',x:-5,z:44,walkX:-11.4,walkZ:44},
 {name:'深川夜市',en:'FUKAGAWA MARKET',x:-75,z:106,walkX:-68.5,walkZ:106},
 {name:'北岸俱乐部',en:'NORTH SHORE',x:107,z:-235,walkX:107,walkZ:-228.5},
 {name:'有明照相馆',en:'ARIAKE PHOTO',x:85,z:141,walkX:91.4,walkZ:141}
];
export const guests=[
 {name:'露娜',job:'驻场歌手',line:'乐队给我留了最后一首歌。'},
 {name:'米洛',job:'夜班调音师',line:'今晚的低音，总算调对了。'},
 {name:'安娜',job:'胶片摄影师',line:'慢一点，桥那头的灯真好看。'},
 {name:'维克',job:'调酒师',line:'收班以后，城市才算安静。'},
 {name:'苏菲',job:'唱片店员',line:'这盘 B 面，留给你回程听。'},
 {name:'埃利',job:'剧院灯光师',line:'谢了，刚好赶上开场。'}
];
export const upgrades=[
 {id:'engine',name:'动力调校',en:'ENGINE',price:[550,950],stat:l=>Math.round((34+3*l)*3.6)+' km/h',detail:'极速与起步加速度'},
 {id:'brakes',name:'运动制动',en:'BRAKES',price:[400,700],stat:l=>Math.round(25*(1+.18*l))+' m/s²',detail:'刹车减速度'},
 {id:'nitro',name:'氮气扩容',en:'NITRO',price:[450,800],stat:l=>((1+.35*l)/.30).toFixed(1)+' s',detail:'满槽连续喷射时间'}
];
export const circuits=[
 {id:'palm',name:'湾岸短环',en:'WANGAN CIRCUIT',laps:1,pace:16.3,prize:880,points:[[160,32],[160,-80],[80,-80],[80,80],[160,80]],color:'#79f1dc'},
 {id:'neon',name:'霓虹长夜',en:'NEON GRAND PRIX',laps:2,pace:20.6,prize:1700,points:[[80,114],[80,-80],[0,-80],[0,-160],[-80,-160],[-80,80],[0,80],[0,160],[80,160]],color:'#ff93b8'}
];
export const recordStall={x:140.2,z:65.85};
export const localStops={
 stall:{x:recordStall.x+1.45,z:recordStall.z+1.37,name:'旧唱片摊'},photo:{x:176.5,z:-102.6,name:'海滨公告栏'},bag:{x:198.9,z:-61.7,name:'海蓝亭'},crew:{x:64.5,z:-91.8,name:'火烈鸟后巷'},dial:{x:185,z:-127.8,name:'码头电台'}
};
export function curbPin(x,z){
 x=clamp(x,xs[0],xs.at(-1));z=clamp(z,zs[0],zs.at(-1));
 const nx=nearest(xs,x),nz=nearest(zs,z);
 return Math.abs(nx-x)<Math.abs(nz-z)?{x:nx,z}:{x,z:nz};
}
export function routeLength(from,to){const pts=route(from,to);return pts.slice(1).reduce((total,p,i)=>total+dist(p,pts[i]),0)}
export function newFare(save,pos,kind){
 const order=save.trips;
 const nearby=stops.map((p,i)=>({i,d:dist(p,pos)})).sort((a,b)=>a.d-b.d);
 const from=nearby[order>0&&order%3===0?1:0].i;
 // The first run follows the promenade. Later offers mix neighborhoods and passenger preferences.
 let to=order===0&&from===0?(kind==='express'?3:1):(from+1+((order*3+(kind==='express'?2:0))%(stops.length-1)))%stops.length;
 const guest=(order+(kind==='express'?1:0))%guests.length;
 return {from,to,guest,kind,stage:'pickup',comfort:100,bumps:0,seconds:0,car:-1};
}
export function fareTerms(f){
 const distance=Math.round(routeLength(stops[f.from],stops[f.to]));
 const express=f.kind==='express';
 return {distance,base:Math.round((110+distance*(express?.92:.78))/5)*5,limit:Math.ceil(14+distance/10),maxTip:express?210:160};
}
export function farePay(f){
 const terms=fareTerms(f);
 const timePart=f.kind==='express'?clamp(1-Math.max(0,f.seconds-terms.limit)/25,0,1):1;
 const tip=Math.round(terms.maxTip*f.comfort/100*timePart);
 return {base:terms.base,tip,total:terms.base+tip};
}
// Old map pins carry display names. Resolve renamed locations before restoring the pin.
const formerStopNames={'海景酒店':'东京湾酒店','日落码头':'潮见码头','海浪唱片':'波音唱片','棕榈广场':'芝浦广场','哈瓦那夜市':'深川夜市','滨海冲印店':'有明照相馆'};
function restoreExpansion(base,d){
 const cash=n=>Number.isSafeInteger(n)&&n>=0?n:0;
 base.night=typeof d.night==='boolean'?d.night:true;
 base.driftBest=cash(d.driftBest);if(base.driftBest>=450&&!base.owned.includes('afterglow'))base.owned.push('afterglow');base.trips=cash(d.trips);base.cabIncome=cash(d.cabIncome);base.perfect=cash(d.perfect);
 for(const u of upgrades)base.mods[u.id]=clamp(cash(d.mods?.[u.id]),0,2);
 for(const t of circuits){const s=d.records?.[t.id];if(s&&Number.isFinite(s.best)&&s.best>0&&Number.isInteger(s.rank)&&s.rank>=1&&s.rank<=4)base.records[t.id]={best:s.best,rank:s.rank,runs:Math.max(1,cash(s.runs))}}
 if(d.pin&&Number.isFinite(d.pin.x)&&Number.isFinite(d.pin.z)){
  const car=additions.find(v=>v.key===d.pin.vehicleKey),exact=Object.values(localStops).find(v=>v.name===d.pin.name);
  base.pin=car?{x:clamp(d.pin.x,-255,224),z:clamp(d.pin.z,-255,255),name:car.name,vehicleKey:car.key}:exact?{...exact}:{...curbPin(d.pin.x,d.pin.z),name:stops.find(p=>p.name===(formerStopNames[d.pin.name]??d.pin.name))?.name??'自定义地点'};
 }
 const f=d.cab;if(!f||base.mission>=0||!Number.isInteger(f.from)||!stops[f.from]||!Number.isInteger(f.to)||!stops[f.to]||f.from===f.to||!Number.isInteger(f.guest)||!guests[f.guest])return;
 base.cab={from:f.from,to:f.to,guest:f.guest,kind:f.kind==='express'?'express':'cruise',bumps:cash(f.bumps),stage:f.stage==='ride'?'ride':'pickup',comfort:clamp(Number.isFinite(f.comfort)?f.comfort:100,0,100),seconds:Math.max(0,Number.isFinite(f.seconds)?f.seconds:0),car:clamp(Number.isInteger(f.car)?f.car:-1,-1,base.fleet?base.fleet.length-1:parkedSpots.length)};
}
