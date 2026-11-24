import {visitShiba} from './shiba.js';
import {StreetRadio} from './street-radio.js';
import {loadStudio} from './blender-assets.js';
import {LedgerChapter} from './chapter.js';
import {garagePrice,routes,readLedger} from './ledger-state.js';
import {DriftChain} from './drift.js';
import {StreetRace} from './racing.js';
import {CabShift} from './cab.js';
import {makeCar} from './models.js';
import {clock,tabs,cabPanel,racePanel,drawTrack,modPanel,navigation,showroom} from './dispatch.js';
import {Simulation,flattenTraffic} from './simulation.js';
import {CoastAudio} from './sound.js';
import {paintMap,clickedPoint} from './map.js';
import {additions} from './street-catalog.js';
import {editionKey,localStops,readEdition,loadSave,missions,tapes,paints,dist,district,districtEn,circuits,stops,guests,upgrades,curbPin,newFare,fareTerms,farePay} from './data.js';

const $=id=>document.getElementById(id),icon=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
let snapshot=readEdition();
const replay=new URL(location.href).searchParams.get('replay')==='flamingo';
const sample=new URL(location.href).searchParams.get('sample');
const demo=!replay&&['return','keep'].includes(sample);
const save=loadSave(snapshot),audio=new CoastAudio(),keys=new Set();
if(demo){
 Object.assign(save,loadSave('{}'));save.chapter=readLedger({ending:sample,active:true,route:sample==='return'?'deal':'mix'});save.money=sample==='return'?400:1100;save.walker={x:147,z:54.5,a:1.52};
}
if(replay){
 save.midnight=loadSave('{}').midnight;save.chapter=readLedger({stage:'ride',clue:true,active:true});save.walker={x:71.5,z:-113.8,a:1.56};save.night=true;save.mission=-1;save.cab=null;
}
function replayLocation(on){
 if(!replay)persist();const url=new URL(location.href);if(on)url.searchParams.set('replay','flamingo');else url.searchParams.delete('replay');location.assign(url.href);
}
let sim=null,screen='menu',panel='',selectedJob=0,previousFocus=null,elapsed=0,timer=null,savedAt=0,uiAt=0,toastUntil=0,startedAt=0,rewardUntil=0,saveAvailable=true,opening=false,lastArea='',lastContext='';
let streetRadio=null,chapter=null,race=null,cab=null,course=0,kind='cruise',garageTab='performance',studioYaw=2.34,rewardMode='story';
const drift=new DriftChain(),touchHolds=new Set();
const idleKeys=new Set(),storyTarget=()=>missions[save.mission]?.steps[save.step];
function target(){
 if(race?.active)return race.target;
 const pin=save.pin?{...save.pin,label:'导航 · '+save.pin.name,type:'pin'}:null;
 if(cab?.target)return cab.target;
 if(pin?.vehicleKey&&!missions[save.mission]?.time)return pin;
 return chapter?.target??storyTarget()??pin;
}
function stopRace(){if(race?.active){race.stop();sim.raceClosed=false}}
function bookmark(){if(save.mission>=0){save.bookmark={id:save.mission,step:missions[save.mission].time?0:save.step};save.mission=-1;save.step=0;timer=null}}
function clearFare(){save.cab=null;cab?.reset()}
function eventStart(){chapter?.suspend();drift.reset();rewardUntil=0;bookmark();closePanel();startedAt=elapsed}
function startFare(){eventStart();stopRace();if(!save.cab){cab.reset();save.cab=save.heldCab??newFare(save,sim.pos,kind);save.heldCab=null;if(save.cab.stage==='ride'&&(!sim.inCar||sim.carId!==save.cab.car)){const car=sim.cars[save.cab.car];if(car){sim.carId=save.cab.car;sim.car=car;sim.inCar=true;sim.hero.visible=false;sim.pos={x:car.position.x,z:car.position.z,a:car.rotation.y};sim.speed=0;sim.motionA=sim.pos.a;sim.resetCamera()}}}sim.setNight(true);toast('夜班调度 · '+guests[save.cab.guest].name+' 等待接送');persist();updateHUD()}
function startRace(){eventStart();clearFare();sim.setNight(true);sim.raceClosed=true;race.start(circuits[course],sim);audio.chime();toast('跟住薄荷绿旗门 · 对手车尾可补充氮气',4);persist();updateHUD()}
function receipt(mode,title,amount,note,next){rewardMode=mode;rewardUntil=Infinity;audio.chime();$('toast').classList.remove('show');toastUntil=0;$('reward').firstElementChild.textContent=mode==='race'?'COAST MOTOR CLUB　/　比赛成绩':'COAST CABS　/　车费收据';$('rewardname').textContent=title;$('rewardcash').textContent='＋'+money(amount);$('rewardnote').textContent=note;$('rewardbalance').textContent='当前余额 '+money(save.money);$('nextjob').textContent=next;persist();updateHUD()}
function podium(result){
 stopRace();
 const prev=save.records[result.id],best=Math.min(prev?.best??Infinity,result.time);
 save.records[result.id]={best,rank:Math.min(prev?.rank??4,result.rank),runs:(prev?.runs??0)+1};
 save.money+=result.pay;
 const comparison=prev&&result.time<prev.best?'　·　刷新 '+(prev.best-result.time).toFixed(1)+' 秒':'';
 receipt('race',result.name+' · 第 '+result.rank+' 名',result.pay,'完赛 '+clock(result.time)+'　／　个人最佳 '+clock(best)+comparison,'再赛一场 →');
}
function dropoff(result){
 save.money+=result.total;save.cabIncome+=result.total;save.trips++;
 if(result.comfort>=97)save.perfect++;
 kind=result.kind;
 const collisions=result.bumps?'碰撞 '+result.bumps+' 次':'无碰撞';
 const late=Math.ceil(result.seconds-fareTerms(result).limit);
 const timing=result.kind==='express'?'　·　'+(late>0?'超时 '+late+' 秒':'准点'):'';
 const note='车费 '+money(result.base)+' ＋ 小费 '+money(result.tip)+'　／　舒适 '+Math.round(result.comfort)+'%　·　'+collisions+timing;
 receipt('cab',result.guestName+' · 已送达',result.total,note,'接下一位 →');
}
const money=n=>'$'+n.toLocaleString('en-US');
const touch=()=>matchMedia('(pointer:coarse)').matches;
function persist(){
 if(replay||demo)return;
 if(sim){const c=sim.car;save.car=sim.carId;save.pos={x:c.position.x,z:c.position.z,a:c.rotation.y};
  save.walker=sim.inCar?null:{...sim.pos};save.fleet=sim.cars.map(v=>({x:v.position.x,z:v.position.z,a:v.rotation.y,trafficId:v.userData.trafficId,model:v.userData.trafficId==null?undefined:v.userData.model}))}
 try{
  const current=readEdition();
  if(current!==snapshot){onOtherSave(current);return}
  const serialized=JSON.stringify(save);
  if(serialized!==snapshot){localStorage.setItem(editionKey,serialized);snapshot=serialized}
 }catch{if(saveAvailable){saveAvailable=false;toast('浏览器未开放本地存档，本次仍可继续游玩')}}
}
function onOtherSave(current){
 if(current===snapshot)return;
 if(!sim&&screen==='menu'){Object.assign(save,loadSave(current));snapshot=current;refreshMenu();return}
 if(panel!=='sync')showPanel('sync');
}
window.addEventListener('storage',e=>{if(!replay&&!demo&&e.key===editionKey)onOtherSave(readEdition())});
function toast(text,seconds=3.3){$('toast').textContent=text;$('toast').classList.add('show');toastUntil=elapsed+seconds}
function refreshMenu(){
 $('donecount').textContent=save.done.length+' / 3';$('tapecount').textContent=save.tapes.length+' / 6';
 $('story').querySelector('span').textContent=save.chapter.stage==='new'?'进入海浪账本':save.chapter.stage==='done'?'回到街区':'继续海浪账本';
 $('tagline').textContent=save.chapter.stage==='done'?'唱片已经翻面，街区还记得你的选择。':'一盘失踪的母带，一本没结清的账。';
 const next=!!save.chapter.ending;$('firstArt').hidden=next;$('secondArt').hidden=!next;
 $('edition').innerHTML=next?'<i></i>CHAPTER 02 <em>/</em> 午夜暗频':'<i></i>CHAPTER 01 <em>/</em> 海浪账本';
 if(next){$('story').querySelector('span').textContent=save.midnight.outcome?'回到午夜街区':save.midnight.stage==='new'?'进入午夜暗频':'继续午夜暗频';$('tagline').textContent=demo?'独立试玩 · '+(sample==='return'?'乐手记得你归还的尾款。':'门房还记得你留下的现金。'):save.midnight.outcome?'午夜过后，街上的电台还在播放你的选择。':'午夜的一个空频段，两个人都想让全城听见。'}
 if(replay){$('story').querySelector('span').textContent='开始后院回放';$('tagline').textContent='重演火烈鸟之夜。回放使用独立进度。'}
 if(!replay&&!demo){
  $('firstArt').hidden=false;$('secondArt').hidden=true;
  $('edition').innerHTML='<i></i>東京都 <em>/</em> 港区';
  $('tagline').textContent='从芝公园到东京塔，沿增上寺门前的街道走到大门。';
  $('story').querySelector('span').textContent='东京湾 · 原作剧情';
 }
 document.querySelectorAll('.sound').forEach(b=>{b.innerHTML=icon(save.sound?'audio':'off');b.setAttribute('aria-label',save.sound?'关闭声音':'打开声音');b.setAttribute('aria-pressed',String(save.sound))});
}
let photoYaw=-.75,photoHeight=2.6,photoRadius=6.3,dragPoint=null;
let relay=0;
function beginJob(id){
 const resume=save.bookmark?.id===id?save.bookmark.step:0;chapter?.suspend();relay=0;drift.reset();stopRace();clearFare();rewardMode='story';
 save.mission=id;save.bookmark=null;save.step=resume;timer=null;rewardUntil=0;audio.chime();toast(missions[id].from+'　“'+(id===0?'唱片店等你。粉色光圈就是取货点。':id===1?'先到湾岸通集合，再开始计时。':'胶片在深川下町，我在露台等你。')+'”',5);
 persist();updateHUD();
}
function trackChapter(){
 stopRace();if(save.cab){save.heldCab={...save.cab};clearFare()}bookmark();drift.reset();rewardUntil=0;chapter.activate();updateHUD();
}
function dialogUI([name,role],line,choices){
 keys.clear();touchHolds.clear();$('hud').hidden=true;$('conversation').hidden=false;$('speaker').textContent=name;$('speakerrole').textContent=role;$('spoken').textContent=line;
 $('mixdesk').hidden=true;const answers=$('answers');answers.replaceChildren();
 choices.forEach(([label],i)=>{const b=document.createElement('button');b.innerText=label;b.onclick=()=>chapter.pick(i);answers.append(b)});answers.firstElementChild?.focus({preventScroll:true});
}
function mixUI(phase,hits,feedback){$('mixdesk').hidden=false;$('track').lastElementChild.style.left=(phase*100)+'%';if(feedback) $('beats').dataset.msg=feedback;$('beats').textContent='● '.repeat(hits)+'○ '.repeat(3-hits)+'　'+($('beats').dataset.msg??'')}
function hideTalk(){keys.clear();$('conversation').hidden=true;$('hud').hidden=false;$('sceneAction').focus({preventScroll:true})}
async function enter(story){
 if(opening)return;opening=true;audio.init();$('loading').hidden=false;
 await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
 $('worldview').hidden=false;
 try{if(!sim){await loadStudio();sim=new Simulation($('scene'),save,toast);cab=new CabShift(sim);race=new StreetRace(sim.scene,(color,i)=>flattenTraffic(makeCar(color,i,false)));chapter=new LedgerChapter(sim,save,{persist,toast,refresh:updateHUD,dialogue:dialogUI,hide:hideTalk,meter:mixUI,chime:()=>audio.chime(),cue:()=>audio.cue(),venue:zone=>audio.venue(zone,save.sound),start:trackChapter,free:()=>!race.active&&!save.cab&&save.mission<0});
  streetRadio=new StreetRadio(sim,save,{persist,toast,chime:()=>audio.chime(),free:()=>!race.active&&!save.cab&&save.mission<0});
  sim.restoreFootClearance();
 }sim.resize()}
 catch(e){console.warn('3D initialization:',e.message);$('worldview').hidden=true;$('loading').hidden=true;opening=false;showPanel('error');return}
 $('menu').classList.remove('daypreview');$('menu').hidden=true;$('loading').hidden=true;screen='play';opening=false;startedAt=elapsed;keys.clear();lastContext='';lastArea='';sim.resetCamera();
 if(story){trackChapter();toast(save.chapter.ending?chapter.town.journal:save.chapter.stage==='intro'?'湾岸通 · 黄昏　　前面戴耳机的人在等你。':chapter.journal,4.5)}
 else{stopRace();if(save.cab){save.heldCab={...save.cab};clearFare()}bookmark();chapter.suspend();if(save.chapter.stage==='new'&&!save.walker&&!save.fleet)sim.placeOnFoot(148.45,54.85,.63);toast('自由漫游 · 在城市手记里查看联系人和故事');persist()}
 chapter.update(0);
 updateHUD();sim.update(0,keys,target());sim.render();$('worldview').classList.remove('arrival');requestAnimationFrame(()=>$('worldview').classList.add('arrival'));
}
async function enterShiba(){
 if(opening)return;
 opening=true;screen='shiba-loading';$('loading').hidden=false;
 try{
  await visitShiba(()=>{screen='menu';$('menu').hidden=false;$('roam').focus()});
  screen='shiba';$('menu').hidden=true;
 }catch(err){console.warn('Shiba scene:',err.message);screen='menu';showPanel('error')}
 finally{opening=false;$('loading').hidden=true}
}
function backMenu(){streetRadio?.stop(false);if(demo){const u=new URL(location.href);u.searchParams.delete('sample');location.assign(u.href);return}if(replay){replayLocation(false);return}chapter?.close();drift.reset();closePanel();stopRace();rewardUntil=0;screen='menu';persist();$('worldview').hidden=true;$('menu').hidden=false;refreshMenu();audio.update(false,save,0,false,false);$('story').focus()}
function finishStep(dt){
 const job=missions[save.mission],step=storyTarget();if(!sim||!job||!step||dist(sim.pos,step)>(step.foot?2.5:job.time?5.2:7.5)){relay=0;return}
 if(step.foot?sim.inCar:!sim.inCar)return;
 if(!job.time&&!step.foot){if(Math.abs(sim.speed)>3.4){relay=0;return}relay+=dt;if(relay<.52)return}
 const id=save.mission;relay=0;save.step++;audio.chime();
 if(save.step>=job.steps.length){
  const time=job.time?Math.max(.1,job.time-(timer??job.time)):0;
  if(time&&(save.best===0||time<save.best))save.best=time;
  save.money+=job.reward;if(!save.done.includes(id))save.done.push(id);
  save.mission=-1;save.step=0;timer=null;toastUntil=0;$('toast').classList.remove('show');
  rewardMode='story';$('reward').firstElementChild.textContent='SIDE A　/　交接回执';$('rewardname').textContent=job.name+' · 委托完成';$('rewardcash').textContent='＋'+money(job.reward);
  $('rewardnote').textContent=job.time?'完赛 '+time.toFixed(1)+' 秒　/　个人最佳 '+save.best.toFixed(1)+' 秒':step.note;
  $('rewardbalance').textContent='当前余额 '+money(save.money)+'　·　录音带 '+save.tapes.length+'/6';
  rewardUntil=elapsed+14;selectedJob=missions.findIndex((_,i)=>!save.done.includes(i));if(selectedJob<0)selectedJob=0;$('nextjob').textContent=missions[selectedJob].name+'　'+money(missions[selectedJob].reward)+' →';
 }else{if(job.time&&save.step===1)timer=job.time;toast(step.note)}
 persist();updateHUD();
}
function collect(){
 for(const [i,p] of tapes.entries()){if(save.tapes.includes(i)||dist(sim.pos,p)>2.85)continue;
  save.tapes.push(i);save.money+=100;sim.collectibles[i].visible=false;audio.chime();toast('录音带 '+save.tapes.length+'/6 · '+p.name+'　＋$100');persist()}
}
function updateHUD(){
 if(!sim)return;streetRadio?.hud();const p=sim.pos,job=missions[save.mission],step=target(),driving=sim.inCar;
 $('objtop').textContent=job?'ON AIR　/　'+job.name:'TOKYO BAY　/　自由漫游';
 $('objtext').textContent=step?.label??'查看城市委托';
 $('objdist').textContent=step?'◆ '+Math.round(dist(p,step))+' m　·　'+(save.step+1)+' / '+(job?.steps.length??1):'任务 '+save.done.length+'/3　·　录音带 '+save.tapes.length+'/6';
 if(race?.active){const rel=Math.atan2(p.x-step.x,p.z-step.z)-p.a;const behind=Math.cos(rel)<-.55&&dist(p,step)>12;
  $('objtop').textContent='COAST MOTOR CLUB　/　'+race.spec.name;$('objtext').textContent='P'+race.rank+' / 4　·　第 '+race.lap+' / '+race.spec.laps+' 圈';$('objdist').textContent=(behind?'↶ 旗门在后方':race.draft?'尾流充能 ↑':'旗门 '+(race.passed%race.track.gates.length+1)+' / '+race.track.gates.length)+'　·　'+clock(race.time)}
 else if(save.cab){const f=save.cab;$('objtop').textContent='COAST CABS　/　'+guests[f.guest].name;$('objdist').textContent=Math.round(dist(p,step))+' m　·　'+(f.stage==='pickup'?'停车接客':'舒适 '+Math.round(f.comfort)+'%　小费 '+money(farePay(f).tip)+(f.kind==='express'?'　'+Math.max(0,Math.ceil(fareTerms(f).limit-f.seconds))+'s':''))}
 else if(step?.type==='pin'){$('objtop').textContent='TOKYO BAY　/　导航';$('objdist').textContent=Math.round(dist(p,step))+' m　·　自设路标'}
 const count=$('countin');count.hidden=!race?.active||(race.countdown<=0&&race.time>.8);if(!count.hidden)count.textContent=race.countdown>0?Math.ceil(race.countdown):'GO';
 const chip=$('driftScore');chip.hidden=drift.score<8;if(!chip.hidden){chip.querySelector('b').textContent=Math.floor(drift.score)+' PT';chip.querySelector('small').textContent='漂移 ×'+drift.multiplier.toFixed(1)+(drift.idle>.2?'　即将入账':'');chip.style.setProperty('--driftfill',(100-100*drift.idle/2.25)+'%')}
 $('hud').dataset.draft=String(!!race?.draft);$('hud').dataset.activity=race?.active?'race':save.cab?'cab':'city';
 if(save.chapter.active&&step?.type!=='pin'){$('objtop').textContent=replay?'REPLAY　/　后院回放':save.chapter.ending?'CHAPTER 02　/　午夜暗频':'CHAPTER 01　/　海浪账本';$('objtext').textContent=step?.label??(save.chapter.ending?'午夜暗频 · 已完结':'海浪账本 · 已完结');$('objdist').textContent=step?(sim.inCar?'驾车':'步行')+'　·　'+Math.round(dist(p,step))+' m':save.chapter.ending?chapter.town.journal:chapter.journal}
 if(sim.heat)$('objtop').textContent='★'.repeat(sim.heat)+'　警戒中';
 const action=chapter?.nearby();$('sceneAction').hidden=!action;$('sceneAction').lastElementChild.textContent=action?chapter.prompt(action):'';
 $('radio').setAttribute('aria-pressed',String(save.radio));$('radiotxt').textContent=sim.airTrack?'LIVE 98.4':save.radio?(save.midnight.outcome?'FM 98.4':'FM 98.6'):'RADIO OFF';
 $('speed').textContent=String(Math.round(Math.abs(sim.speed)*3.6)).padStart(3,'0');
 $('gear').textContent=sim.speed<-.4?'R':sim.speed<.4?'N':String(Math.min(6,1+Math.floor(sim.speed/7)));
 $('boostbar').style.width=(sim.boost*100)+'%';$('vehicle').textContent=sim.carName();$('gauge').hidden=!driving;
 $('timer').hidden=timer===null;$('timer').textContent=timer===null?'':Math.max(0,timer).toFixed(1)+' s';$('timer').classList.toggle('urgent',timer!==null&&timer<=15);
 $('reward').hidden=rewardUntil<=elapsed;
 const area=district(p.x,p.z);if(area!==lastArea){$('area').innerHTML=area+'<small>'+districtEn(p.x,p.z)+'</small>';lastArea=area}
 const nearby=!driving&&sim.nearCar();let context='';
 const useCar=$('touchF');
 useCar.hidden=driving?Math.abs(sim.speed)>3.4||race.active||save.cab?.stage==='ride':!nearby;
 useCar.lastElementChild.textContent=chapter.carryingMaster?(driving?'带箱下车':'装箱上车'):(driving?'下车':'上车');
 if(save.midnight.stage==='haul')useCar.lastElementChild.textContent=driving?'带音箱下车':'装音箱上车';
 if(chapter.carryingMaster)$('objdist').textContent+='　·　'+(driving?'母带箱已装车':'随身携带母带箱');
 if(touch()){document.querySelector('[data-hold="ShiftLeft"]').textContent=driving?'氮气':'奔跑';$('touchDrift').hidden=!driving;document.querySelector('[data-hold="KeyW"]').textContent=driving?'油门':'前进';document.querySelector('[data-hold="KeyS"]').textContent=driving?'刹车':'后退'}
 if(save.cab&&dist(p,step)<35)context=cab.hold>0?(save.cab.stage==='pickup'?'乘客正在上车…':'乘客正在下车…'):'在琥珀色圈内刹停';else if(race?.draft)context='尾流充能 ↑　按住加速冲刺';else if(job&&step&&!step.foot&&driving&&!job.time&&dist(p,step)<42)context=relay>0?'正在交接…':(touch()?'刹车入圈，停车交接':'S　刹车入圈，停车交接');
 else if(job&&step?.foot&&driving&&dist(p,step)<19)context='刹停后按 F 下车取件';
 else if(!touch()&&elapsed-startedAt<13)context=driving?'W 加速　·　A / D 转向　·　S 刹车':'W 前进　·　A / D 转身　·　Shift 奔跑';
 if(sim.inCar&&sim.car.userData.model===2&&streetRadio?.mode==='off'&&!context)context='停稳后按 B，在这个街区开一场流动电台';if(!context)context=chapter.town.hint();if(action||nearby)context='';if(context!==lastContext){$('context').textContent=context;lastContext=context}
 const wp=$('waypoint');wp.hidden=true;if(step){const dst=dist(p,step),v=sim.station.group.position.clone();v.set(step.x,5.8,step.z).project(sim.camera);
  if(dst>8&&dst<200&&v.z<1&&v.z>0&&Math.abs(v.x)<.88&&Math.abs(v.y)<.70){wp.hidden=false;wp.style.left=((v.x+1)*50)+'%';wp.style.top=((1-v.y)*50)+'%';wp.lastElementChild.textContent=Math.round(dst)+' m'}}
 paintMap($('minimap'),p,step,save,sim.world.footprints,false,race);
}
const headers={chapters:['STORY ARCHIVE','选章试玩'],sync:['CITY ARCHIVE','另一窗口已保存进度'],help:['CONTROLS','操作指南'],pause:['PAUSE MENU','已暂停'],jobs:['TOKYO BAY JOURNAL','城市手记'],map:['TOKYO BAY / NAVIGATION','城市地图'],drift:['SIDEWAYS CLUB','漂移练习'],cab:['NIGHT DISPATCH','夜班载客'],race:['RACE CONTROL','街头竞速'],garage:['MARLIN CUSTOMS','私人车库'],error:['GRAPHICS','暂时无法进入街区']};
function showPanel(name){
 if(chapter?.talk&&name!=='sync')chapter.close();
 if(!panel)previousFocus=document.activeElement;
 keys.clear();touchHolds.clear();document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));panel=name;$('overlay').hidden=false;$('panelKicker').textContent=headers[name][0];$('panelTitle').textContent=headers[name][1];const body=$('panelbody');
 const btn=(key,label)=>'<button class="btn" data-act="'+key+'">'+label+'</button>';
 if(name==='sync'){
  body.innerHTML='<p class="panelcopy">载入最新的城市档案，可以从同一笔余额和活动进度继续。</p>'+btn('reload','载入最新进度');
 }else if(name==='chapters'){
  body.innerHTML='<div class="chaptercard"><small>CHAPTER 01</small><h3>海浪账本</h3><p>从后院现场开始，重选取回母带的方法。</p>'+btn('sample-yard','重演火烈鸟之夜')+'</div><div class="chaptercard midnightcard"><small>CHAPTER 02　/　98.4 FM</small><h3>午夜暗频</h3><p>从唱片店出发，选择第一章分账后的街区关系。试玩使用独立进度。</p><div class="actions">'+btn('sample-return','上回把尾款还给了乐手')+btn('sample-keep','上回和玛拉留下了现金')+'</div></div>';
 }else if(name==='help'){
  body.innerHTML='<div class="helpgrid">'+[['W / ↑','油门或步行前进'],['S / ↓','刹车、倒车或后退'],['A D / ← →','转向'],['空格','手刹漂移'],['Shift','氮气加速 / 奔跑'],['E','与附近人物交谈 / 查看物件'],['F','停车后下车 / 就近上车'],['M / J / G','地图 / 调度 / 车库'],['C / R','切换镜头 / 电台'],['B','转播车停稳后，开播或收天线'],['V','明信片相机'],['Esc / P','暂停或恢复']].map(([k,s])=>'<p><kbd>'+k+'</kbd>'+s+'</p>').join('')+'</div><p class="helpnote">金色菱形指向当前剧情目标。对话中可用数字键选择回答。触屏使用两侧驾驶键，点击小地图或任务文字可展开详情。</p>';
 }else if(name==='pause'){
  body.innerHTML='<div class="ledger"><span>钱包 '+money(save.money)+'</span><span>载客 '+save.trips+' 单</span><span>完赛 '+Object.values(save.records).reduce((n,r)=>n+r.runs,0)+' 场</span></div><div class="menulist">'+[['resume','继续游玩'],['map','城市地图'],['jobs','城市手记'],['garage','私人车库'],['drift','漂移练习'],['night',save.night?'切换至日落':'切换至午夜'],['photo','拍摄明信片'],['view','切换驾驶视角'],['help','操作指南'],['sound',save.sound?'关闭声音':'打开声音'],['rescue','道路救援'],['menu',replay?'结束回放，返回正式存档':'返回主菜单']].map(([k,s])=>'<button data-act="'+k+'">'+s+icon('arrow')+'</button>').join('')+'</div>';
 }else if(name==='map'){
  const picker='<details class="fleetfinder"><summary>找街车 · 11 款</summary><div class="mapstops">'+additions.map(v=>'<button data-findcar="'+v.key+'">'+v.name+'</button>').join('')+'</div></details>';
  body.innerHTML=navigation(save,sim)+'<div class="mapstops">'+Object.entries(localStops).map(([id,{name}])=>'<button data-place="'+id+'">'+name+'</button>').join('')+'</div>'+picker;paintMap($('bigmap'),sim.pos,target(),save,sim.world.footprints,true,race);
 }else if(name==='drift'){body.innerHTML='<div class="ticket raceticket"><div class="tickethead"><b>SIDEWAYS CLUB</b><small>自由漫游</small></div><div class="ticketbody"><small>个人最佳连段</small><h3>'+save.driftBest+' PT</h3><p>单次连段达到 450 分，解锁「午夜极光」车漆。</p></div></div><p class="helpnote">开到有空间的路段，加速到 30 km/h 以上，按住手刹转向。连续左右甩尾可叠到 3 倍；平稳行驶 2 秒即可结算，碰撞会中断连段。</p><div class="actions"><button class="btn hot" data-act="freeDrift">进入自由练习</button></div>';
 }else if(name==='cab'){body.innerHTML=cabPanel(save,sim,kind);
 }else if(name==='race'){body.innerHTML=racePanel(save,race,course);drawTrack($('diagram'),course);
 }else if(name==='jobs'){
  const m=missions[selectedJob];body.innerHTML='<div class="chaptercard"><small>CHAPTER 01</small><h3>海浪账本</h3><p>'+chapter.journal+'</p>'+(save.chapter.route?'<p>后院做法 · '+routes[save.chapter.route]+'</p>':'')+'<button class="btn hot" data-act="track">'+(save.chapter.active?'返回街头':save.chapter.stage==='new'?'开始故事':'继续这个故事')+'</button>'+(save.chapter.active?btn('untrack','自由漫游'):'')+(save.chapter.ending?btn('replay','重演后院 · 独立进度'):'')+(replay?btn('exitReplay','返回正式存档'):'')+'</div>'+tabs('jobs')+'<div class="joblist">'+missions.map((j,i)=>'<button class="job '+(i===selectedJob?'active':'')+'" data-job="'+i+'"><strong>'+j.name+(save.done.includes(i)?'　✓':'')+'</strong><small>'+j.en+'</small><span>'+money(j.reward)+'</span></button>').join('')+'</div><p class="panelcopy"><strong>'+m.from+'</strong><br>'+m.line+(m.time&&save.best?'<br>个人最佳 '+save.best.toFixed(1)+' 秒':'')+'</p><div class="actions"><button class="btn hot" data-act="accept">'+(save.mission===selectedJob?'继续当前委托':save.done.includes(selectedJob)?'重玩委托':'接下委托')+'</button>'+(save.mission>=0?btn('leave','转为自由漫游'):'')+'</div>';
  const header=body.querySelector('.chaptercard');
  if(save.chapter.ending){
   const second=document.createElement('div');second.className='chaptercard midnightcard';
   second.innerHTML='<small>CHAPTER 02　/　98.4 FM</small><h3>午夜暗频</h3><p>'+chapter.town.journal+'</p><button class="btn hot" data-act="track">'+(save.midnight.outcome?'回到街头':'追踪午夜暗频')+'</button>'+(save.chapter.active?btn('untrack','暂时自由漫游'):'');header.before(second);
   header.querySelector('[data-act="track"]')?.remove();header.querySelector('[data-act="untrack"]')?.remove();
  }
  if(chapter.town.sideNote){const note=document.createElement('p');note.className='panelcopy streetnote';note.textContent='街头见闻　'+chapter.town.sideNote;header.after(note)}
 }else if(name==='garage'){
  body.innerHTML='<div class="studio"><canvas id="studio" width="760" height="225" aria-label="私人跑车三维预览"></canvas><button data-act="rotate" aria-label="旋转车辆">↻</button></div><div class="ledger"><span>'+ (save.chapter.ending==='return'?'熟人价 · 全场八折':'MARLIN TURBO')+'</span><b>'+money(save.money)+'</b></div><div class="switches"><button data-garage="performance" aria-pressed="'+(garageTab==='performance')+'">性能改装</button><button data-garage="paint" aria-pressed="'+(garageTab==='paint')+'">车身涂装</button></div>'+(garageTab==='performance'?modPanel(save):'<div class="swatches">'+paints.map(p=>'<button class="swatch '+(save.paint===p.id?'selected':'')+'" data-paint="'+p.id+'" '+(!save.owned.includes(p.id)&&(p.unlock||save.money<garagePrice(save,p.price))?'disabled':'')+'><i style="background:#'+p.color.toString(16).padStart(6,'0')+'"></i><strong>'+p.name+'</strong><small>'+(save.paint===p.id?'已装备':save.owned.includes(p.id)?'装备':p.unlock?'漂移 '+p.unlock+' 分':money(garagePrice(save,p.price)))+'</small></button>').join('')+'</div>');drawStudio();
 }else if(name==='error')body.innerHTML='<p class="panelcopy">浏览器未能建立 3D 画面。请启用浏览器的图形加速，或在支持 WebGL 2 的浏览器中重新打开游戏。</p>'+btn('resume','返回');
 $('close').focus();if(screen==='play')audio.update(false,save,0,false,false);
}
function drawStudio(){const c=$('studio');if(c)showroom(c,sim,paints.find(p=>p.id===save.paint).color,studioYaw)}
function closePanel(){if(panel==='sync'){location.reload();return}panel='';$('overlay').hidden=true;keys.clear();if(previousFocus instanceof HTMLElement&&previousFocus.offsetParent)previousFocus.focus({preventScroll:true});previousFocus=null}
function toggleSound(){audio.init();save.sound=!save.sound;audio.update(screen==='play'&&!panel,save,sim?.speed||0,false,!!sim?.inCar);if(save.sound)audio.chime();refreshMenu();persist()}
function toggleRadio(){audio.init();save.radio=!save.radio;toast(save.radio&&save.chapter.route?chapter.broadcast():save.radio?'FM 98.6 · Bay Wave 正在播放':'车载电台已关闭');persist();updateHUD()}
function interact(){if(!sim)return;if(sim.inCar&&(race?.active||save.cab?.stage==='ride')){toast(race?.active?'完赛后可下车':'先送乘客到目的地');return}sim.interact();persist();updateHUD()}
function changeView(){save.view=save.view?0:1;sim.resetCamera();persist();toast(save.view?'远景追车镜头':'近景追车镜头')}
$('panelbody').addEventListener('click',e=>{
 if(e.target.id==='bigmap'){const p=clickedPoint(e.target,e);save.pin={...curbPin(p.x,p.z),name:'自定义地点'};persist();showPanel('map');return}
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.circuit!==undefined){course=Number(b.dataset.circuit);showPanel('race');return}
 if(b.dataset.fare){kind=b.dataset.fare;showPanel('cab');return}
 if(b.dataset.garage){garageTab=b.dataset.garage;showPanel('garage');return}
 if(b.dataset.mod){const u=upgrades.find(u=>u.id===b.dataset.mod),level=save.mods[u.id],price=garagePrice(save,u.price[level]);if(price&&save.money>=price){save.money-=price;save.mods[u.id]++;persist();audio.chime();showPanel('garage')}return}
 if(b.dataset.findcar){
  const spec=additions.find(v=>v.key===b.dataset.findcar);if(!spec)return;
  const m=sim.parkedStreetCar(spec.key);
  if(!m)return;
  save.pin={x:m.position.x,z:m.position.z,name:spec.name,vehicleKey:spec.key};
  closePanel();persist();updateHUD();toast(target()?.vehicleKey?'导航到'+spec.name:'已记下车位，当前行程结束后导航');return
 }
 if(b.dataset.place){const dest=localStops[b.dataset.place];if(!dest)return;eventStart();stopRace();if(save.cab){save.heldCab={...save.cab};clearFare()}save.pin={...dest};persist();updateHUD();toast('已标记 '+save.pin.name+'。城市手记里可随时接回剧情。');return}
 if(b.dataset.stop!==undefined){const p=stops[Number(b.dataset.stop)];save.pin={...curbPin(p.x,p.z),name:p.name};persist();showPanel('map');return}

 if(b.dataset.job!==undefined){selectedJob=Number(b.dataset.job);showPanel('jobs');$('panelbody').querySelector('[data-job="'+selectedJob+'"]').focus();return}
 if(b.dataset.paint){const p=paints.find(v=>v.id===b.dataset.paint);if(!p)return;if(!save.owned.includes(p.id)){if(p.unlock||save.money<garagePrice(save,p.price))return;save.money-=garagePrice(save,p.price);save.owned.push(p.id)}save.paint=p.id;sim.applyPaint();persist();audio.chime();showPanel('garage');return}
 const act=b.dataset.act;
 if(act?.startsWith('sample-')){
  const route=act.slice(7),url=new URL(location.href);url.searchParams.delete('sample');url.searchParams.delete('replay');if(route==='yard')url.searchParams.set('replay','flamingo');else url.searchParams.set('sample',route);
  location.assign(url.href);return;
 }
 if(act==='reload'){location.reload();return}if(headers[act]){showPanel(act);return}
 if(act==='replay'){if(replay)location.reload();else replayLocation(true);return}if(act==='exitReplay'){replayLocation(false);return}
 if(act==='track'){closePanel();if(!save.chapter.active)trackChapter();return}if(act==='untrack'){chapter.suspend();closePanel();persist();updateHUD();return}
 if(act==='freeDrift'){eventStart();clearFare();stopRace();persist();toast('漂移练习 · 加速后按住手刹转向');updateHUD();return}
 if(act==='rotate'){studioYaw+=Math.PI/3;drawStudio();return}
 if(act==='clearPin'){save.pin=null;persist();showPanel('map');return}
 if(act==='takeCab'){startFare();return}
 if(act==='startRace'){if(race.active&&race.spec.id===circuits[course].id)closePanel();else startRace();return}
 if(act==='endEvent'){stopRace();clearFare();rewardUntil=0;closePanel();persist();updateHUD();return}
 if(act==='night'){sim.setNight(!save.night);persist();closePanel();return}
 if(act==='accept'){closePanel();if(save.mission!==selectedJob)beginJob(selectedJob)}
 if(act==='leave'){save.bookmark=null;save.mission=-1;save.step=0;timer=null;persist();closePanel();toast('自由漫游 · 随时可以接下委托');updateHUD()}
 if(act==='photo'){closePanel();openPhoto()}
 if(act==='resume')closePanel();if(act==='menu')backMenu();if(act==='sound'){toggleSound();showPanel('pause')}
 if(act==='rescue'){if(save.chapter.active&&save.chapter.stage==='escape'){closePanel();toast('警戒中。玛拉提醒你可以找门房核对母带。');return}if(race.active||save.cab){closePanel();toast('请先在调度中结束当前活动再呼叫救援');return}sim.rescue();persist();closePanel()}
 if(act==='view'){changeView();closePanel()}
});
$('chapters').onclick=()=>showPanel('chapters');$('sceneAction').onclick=()=>chapter.action();$('walkAway').onclick=()=>chapter.close();$('story').onclick=()=>enter(true);$('roam').onclick=enterShiba;$('legacyRoam').onclick=()=>enter(false);$('help').onclick=()=>showPanel('help');$('close').onclick=closePanel;$('pause').onclick=()=>showPanel('pause');
$('missionbtn').onclick=()=>{if(save.mission>=0)selectedJob=save.mission;showPanel(race?.active?'race':save.cab?'cab':'jobs')};$('minimapbtn').onclick=()=>showPanel('map');$('radio').onclick=toggleRadio;$('touchF').onclick=interact;
$('nextjob').onclick=()=>{rewardUntil=0;if(rewardMode==='race')startRace();else if(rewardMode==='cab')startFare();else beginJob(selectedJob)};$('rewardpaint').onclick=()=>{rewardUntil=0;showPanel('garage')};$('cruise').onclick=()=>{rewardUntil=0;updateHUD()};
$('overlay').addEventListener('click',e=>{if(e.target===$('overlay'))closePanel()});
document.querySelector('.sound').onclick=toggleSound;
const full=document.querySelector('.fullscreen');if(!document.documentElement.requestFullscreen&&!document.documentElement.webkitRequestFullscreen)full.hidden=true;
full.onclick=async()=>{try{if(document.fullscreenElement||document.webkitFullscreenElement){await (document.exitFullscreen?.()??document.webkitExitFullscreen?.())}else{const n=document.documentElement;await (n.requestFullscreen?.()??n.webkitRequestFullscreen?.())}}catch{full.title='当前窗口无法全屏'}};
function redrawPhoto(){if(screen==='photo')sim.photo(photoYaw,photoHeight,photoRadius)}
function openPhoto(){screen='photo';keys.clear();audio.update(false,save,0,false,false);photoYaw=-.85;photoHeight=2.6;photoRadius=sim.camera.aspect<.8?7.5:6.3;
 $('hud').hidden=true;$('photo').hidden=false;$('photoplace').textContent=district(sim.pos.x,sim.pos.z);$('shutter').textContent='保存明信片';sim.station.group.visible=false;redrawPhoto();$('shutter').focus()}
function leavePhoto(){screen='play';$('photo').hidden=true;$('hud').hidden=false;dragPoint=null;sim.resetCamera();sim.update(0,keys,target());sim.render();$('pause').focus()}
$('exitphoto').onclick=leavePhoto;$('orbitL').onclick=()=>{photoYaw-=.35;redrawPhoto()};$('orbitR').onclick=()=>{photoYaw+=.35;redrawPhoto()};$('zoomphoto').onclick=()=>{photoRadius=photoRadius<7.1?9:photoRadius>8?7:5.4;redrawPhoto()};
$('photo').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;dragPoint=[e.clientX,e.clientY];$('photo').setPointerCapture(e.pointerId)});
$('photo').addEventListener('pointermove',e=>{if(!dragPoint)return;photoYaw-=(e.clientX-dragPoint[0])*.008;photoHeight=Math.max(1.5,Math.min(8,photoHeight+(e.clientY-dragPoint[1])*.018));dragPoint=[e.clientX,e.clientY];redrawPhoto()});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('photo').addEventListener(name,()=>dragPoint=null);
$('shutter').onclick=()=>{redrawPhoto();const original=$('scene'),post=document.createElement('canvas'),w=original.width,h=original.height,pad=Math.max(12,Math.round(w*.019)),band=Math.max(60,Math.round(w*.067));
 post.width=w+pad*2;post.height=h+pad*2+band;const c=post.getContext('2d');c.fillStyle='#fff0d8';c.fillRect(0,0,post.width,post.height);c.drawImage(original,pad,pad);
 c.fillStyle='#352438';c.font='italic 900 '+Math.round(band*.53)+'px Impact, sans-serif';c.textBaseline='middle';c.fillText('TOKYO BAY',pad,h+pad+band*.65);
 c.textAlign='right';c.font='600 '+Math.round(band*.23)+'px sans-serif';c.fillText(district(sim.pos.x,sim.pos.z)+'  /  TOKYO BAY',w+pad,h+pad+band*.67);
 post.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),link=document.createElement('a');link.href=u;link.download='Tokyo Bay - '+district(sim.pos.x,sim.pos.z)+'.png';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(u),12000);$('shutter').textContent='明信片已生成'},'image/png');
};
const mapped={ArrowUp:'KeyW',ArrowDown:'KeyS',ArrowLeft:'KeyA',ArrowRight:'KeyD',ShiftRight:'ShiftLeft'};
function keyCode(e){return mapped[e.code]||e.code}
window.addEventListener('keydown',e=>{
 if(screen==='shiba'||screen==='shiba-loading')return;
 if(e.metaKey||e.ctrlKey||e.altKey)return;
 if(!panel&&screen==='play'&&streetRadio?.mode==='setup'&&['SELECT','INPUT'].includes(e.target.tagName)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Space'].includes(e.code))return;
 if(chapter?.talk&&!panel){
  if(e.code==='Escape'){e.preventDefault();chapter.close()}
  else if(/^Digit[1-3]$/.test(e.code)&&!e.repeat){e.preventDefault();chapter.pick(Number(e.code.slice(-1))-1)}
  else if(e.code==='Tab'){const btns=[...$('conversation').querySelectorAll('button,input')].filter(el=>el.getClientRects().length);if(e.shiftKey&&document.activeElement===btns[0]){e.preventDefault();btns.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===btns.at(-1)){e.preventDefault();btns[0].focus()}}
  return;
 }
 if(screen==='photo'){if(['Escape','KeyV'].includes(e.code)){e.preventDefault();if(!e.repeat)leavePhoto()}else if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();photoYaw+=e.code==='ArrowLeft'?-.1:.1;redrawPhoto()}return}
 if(panel){
  if(e.code==='Tab'){const list=[...$('overlay').querySelectorAll('button:not(:disabled)')];if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus()}}
  if(['Escape','KeyP'].includes(e.code)||(panel==='map'&&e.code==='KeyM')||(panel==='jobs'&&e.code==='KeyJ')){e.preventDefault();if(!e.repeat)closePanel()}return
 }
 if(screen==='menu'){if(e.code==='Enter'&&document.activeElement.tagName!=='BUTTON'){e.preventDefault();if(replay||demo)enter(true);else enterShiba()}return}
 const k=keyCode(e);if(['Space','KeyW','KeyA','KeyS','KeyD','ShiftLeft'].includes(k)){e.preventDefault();keys.add(k);return}
 if(e.repeat)return;
 switch(k){case 'KeyB':streetRadio.toggle();break;case 'KeyE':if(chapter.nearby())chapter.action();else if(!sim.inCar&&sim.nearCar())interact();break;case 'KeyG':showPanel('garage');break;case 'KeyV':openPhoto();break;case 'KeyF':interact();break;case 'KeyM':showPanel('map');break;case 'KeyJ':$('missionbtn').click();break;case 'KeyR':toggleRadio();break;case 'KeyC':changeView();break;case 'KeyP':case 'Escape':e.preventDefault();showPanel('pause');break}
});
window.addEventListener('keyup',e=>keys.delete(keyCode(e)));
document.querySelectorAll('[data-hold]').forEach(b=>{const k=b.dataset.hold;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touchHolds.add(k);keys.add(k);b.classList.add('held')});for(const t of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(t,()=>{touchHolds.delete(k);keys.delete(k);b.classList.remove('held')})});
window.addEventListener('blur',()=>{keys.clear();if(screen==='play'&&!panel)showPanel('pause')});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(sim)persist();keys.clear();if(screen==='play'&&!panel)showPanel('pause')}});
window.addEventListener('pagehide',()=>{if(sim)persist()});window.addEventListener('resize',()=>{if(sim&&screen!=='menu'){sim.resize();redrawPhoto()}});
let then=0;
function updateDrift(dt,controls){
 if(save.chapter.active||race.active||save.cab||save.mission>=0||rewardUntil>elapsed)return;
 const slide=drift.update(dt,sim,controls);
 if(!slide)return;
 if(slide.lost){toast('碰撞 · 连段中断',2);return}
 save.driftBest=Math.max(save.driftBest,slide.points);
 save.money+=slide.pay;
 const unlocked=save.driftBest>=450&&!save.owned.includes('afterglow');
 if(unlocked)save.owned.push('afterglow');
 toast('漂移 '+slide.points+' 分　＋'+money(slide.pay)+(unlocked?'　解锁「午夜极光」':''),4);
 audio.chime();persist();
}
function updateActivities(dt,controls){
 sim.update(dt,race.active&&race.countdown>0?idleKeys:controls,target());
 if(race.active){const result=race.update(dt,sim);if(result)podium(result)}
 updateDrift(dt,controls);
 const fare=cab.update(dt,controls,line=>{audio.chime();toast('乘客上车 · “'+line+'”');persist()});
 if(fare)dropoff(fare);
}
function loop(now){
 const dt=then?Math.min((now-then)/1000,.12):0;then=now;
 if(screen==='play'&&!panel&&chapter?.talk){chapter.update(dt,true);sim.render()}else if(screen==='play'&&!panel&&sim){
  elapsed+=dt;
  // The right thumb can hold boost or drift while the left thumb steers.
  const touchPower=sim.inCar&&!keys.has('KeyS')&&((touchHolds.has('ShiftLeft')&&keys.has('ShiftLeft'))||(touchHolds.has('Space')&&keys.has('Space')&&sim.speed>5));
  const controls=touchPower?new Set([...keys,'KeyW']):keys;let remaining=dt;
  while(remaining>0){const step=Math.min(remaining,1/40);updateActivities(step,controls);remaining-=step}
  chapter.update(dt);streetRadio.update(dt);
  if(timer!==null){timer-=dt;if(timer<=0){save.step=0;timer=null;toast('计时结束 · 回到发车点可重试');audio.chime(false);persist()}}
  finishStep(dt);if(!race.active)collect();if(target()?.type==='pin'&&dist(sim.pos,save.pin)<5){save.pin=null;persist();toast('已抵达导航终点')}if(elapsed>=toastUntil)$('toast').classList.remove('show');
  if(elapsed>=uiAt){updateHUD();uiAt=elapsed+.09}
  if(elapsed>=savedAt){persist();savedAt=elapsed+2.5}
  audio.update(true,save,sim.speed,controls.has('KeyW'),sim.inCar,sim.airTrack);sim.render();
 }
 requestAnimationFrame(loop)
}
refreshMenu();requestAnimationFrame(loop);
