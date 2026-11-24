import {visitShiba} from './shiba.js';
import {StreetRadio} from './street-radio.js';
import {loadStudio} from './blender-assets.js';
import {LedgerChapter} from './chapter.js';
import {garagePrice} from './ledger-state.js';
import {DriftChain} from './drift.js';
import {StreetRace} from './racing.js';
import {CabShift} from './cab.js';
import {makeCar} from './models.js';
import {clock,tabs,cabPanel,racePanel,drawTrack,modPanel,navigation,showroom} from './dispatch.js';
import {Simulation,flattenTraffic} from './simulation.js';
import {CoastAudio} from './sound.js';
import {paintMap,clickedPoint} from './map.js';
import {additions} from './street-catalog.js';
import {Vector3} from 'three';
import {editionKey,localStops,readEdition,loadSave,missions,tapes,paints,dist,district,districtEn,circuits,stops,guests,upgrades,curbPin,newFare,fareTerms,farePay} from './data.js';

const $=id=>document.getElementById(id),icon=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
let snapshot=readEdition();
const save=loadSave(snapshot),audio=new CoastAudio();
let sim=null,screen='menu',panel='',selectedJob=0,previousFocus=null,elapsed=0,timer=null,savedAt=0,uiAt=0,toastUntil=0,startedAt=0,rewardUntil=0,saveAvailable=true,opening=false,lastArea='',lastContext='',shownCash=null,cashUntil=0;
let streetRadio=null,chapter=null,race=null,cab=null,course=0,kind='cruise',garageTab='performance',studioYaw=2.34,rewardMode='story';
const drift=new DriftChain(),keyboardHolds=new Map(),touchHolds=new Map();
let lookPointer=null,ignoreUnlock=false,swallowEscape=0;
let shownSceneAction=null,shownCarAction=null;
const idleKeys=new Set(),storyTarget=()=>missions[save.mission]?.steps[save.step];
function resetControls(){
 keyboardHolds.clear();
 for(const [id,button] of touchHolds){
  button.classList.remove('held');
  if(button.hasPointerCapture(id))button.releasePointerCapture(id);
 }
 touchHolds.clear();
}
const patrolBuf=[];
function visiblePatrols(){
 patrolBuf.length=0;
 if(sim?.heat){if(sim.patrol?.visible)patrolBuf.push(sim.patrol.position);if(sim.patrol2?.visible)patrolBuf.push(sim.patrol2.position)}
 return patrolBuf;
}
let pinCache=null;
function target(){
 if(race?.active)return race.target;
 if(cab?.target)return cab.target;
 const story=chapter?.target??storyTarget();
 if(story)return story;
 const pin=save.pin;if(!pin)return null;
 if(!pinCache||pinCache.x!==pin.x||pinCache.z!==pin.z||pinCache.name!==pin.name||pinCache.vehicleKey!==pin.vehicleKey)pinCache={...pin,label:'导航 · '+pin.name,type:'pin'};
 return pinCache;
}
function stopRace(){if(race?.active){race.stop();sim.raceClosed=false}}
function bookmark(){sprintLock=false;if(save.mission>=0){save.bookmark={id:save.mission,step:missions[save.mission].time?0:save.step};save.mission=-1;save.step=0;timer=null}}
function clearFare(){save.cab=null;cab?.reset()}
function eventStart(){chapter?.suspend();drift.reset();rewardUntil=0;bookmark();closePanel();startedAt=elapsed}
function startFare(){
 eventStart();stopRace();
 if(!save.cab){
  cab.reset();save.cab=save.heldCab??newFare(save,sim.pos,kind);save.heldCab=null;
  if(save.cab.stage==='ride'&&(!sim.inCar||sim.carId!==save.cab.car)){
   const car=sim.cars[save.cab.car];
   if(car){
    if(sim.inCar)sim.resetVehicleMotion(sim.car);
    sim.resetVehicleMotion(car);sim.carId=save.cab.car;sim.car=car;sim.inCar=true;sim.hero.visible=false;
    sim.pos={x:car.position.x,z:car.position.z,a:car.rotation.y};sim.speed=0;sim.motionA=sim.pos.a;
    sim.walkV.x=sim.walkV.z=0;sim.resetCamera();
   }
  }
 }
 sim.setNight(true);toast('夜班调度 · '+guests[save.cab.guest].name+' 等待接送');persist();updateHUD();
}
function startRace(){eventStart();clearFare();sim.setNight(true);sim.raceClosed=true;race.start(circuits[course],sim);audio.chime();toast('跟住薄荷绿旗门 · 对手车尾可补充氮气',4);persist();updateHUD()}
function receipt(mode,title,amount,note,next){rewardMode=mode;rewardUntil=Infinity;audio.chime();$('toast').classList.remove('show');toastUntil=0;$('reward').firstElementChild.textContent=mode==='race'?'COAST MOTOR CLUB　/　比赛成绩':mode==='chapter'?'CHAPTER 01　/　工资':'COAST CABS　/　车费收据';$('rewardname').textContent=title;$('rewardcash').textContent=mode==='chapter'?money(amount):'＋'+money(amount);$('rewardnote').textContent=note;$('rewardbalance').textContent='当前余额 '+money(save.money);$('nextjob').textContent=next;persist();updateHUD()}
function finishChapter(){receipt('chapter','已入伙',save.money,'他还是没有房子。钱还在身上。保险箱留在纸条上的地址。','回到街头')}
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
window.addEventListener('storage',e=>{if(e.key===editionKey)onOtherSave(readEdition())});
function toast(text,seconds=3.3){$('toast').textContent=text;$('toast').classList.add('show');toastUntil=elapsed+seconds}
function refreshMenu(){
 $('donecount').textContent=save.done.length+' / '+missions.length;$('tapecount').textContent=save.tapes.length+' / 6';
 $('story').querySelector('span').textContent=save.chapter.stage==='new'?'进入工资':save.chapter.stage==='done'?'回到街区':'继续工资';
 $('tagline').textContent=save.chapter.stage==='done'?'他正式跟着牛子干。钱还在身上。':'没有房子，钱在身上。活断了，就去把活续上。';
 $('edition').innerHTML='<i></i>CHAPTER 01 <em>/</em> 工资';
 document.querySelectorAll('.sound').forEach(b=>{b.innerHTML=icon(save.sound?'audio':'off');b.setAttribute('aria-label',save.sound?'关闭声音':'打开声音');b.setAttribute('aria-pressed',String(save.sound))});
}
let photoYaw=-.75,photoHeight=2.6,photoRadius=6.3,dragPoint=null;
let relay=0,sprintLock=false,lastCheck=null;const lastSample={x:0,z:0};
function beginJob(id){
 const resume=save.bookmark?.id===id?save.bookmark.step:0;chapter?.suspend();relay=0;drift.reset();stopRace();clearFare();rewardMode='story';
 save.mission=id;save.bookmark=null;save.step=resume;timer=null;sprintLock=false;lastCheck=null;rewardUntil=0;audio.chime();toast(missions[id].from+'　“先到湾岸通集合，再开始计时。”',5);
 persist();updateHUD();
}
function trackChapter(){
 stopRace();if(save.cab){save.heldCab={...save.cab};clearFare()}bookmark();drift.reset();rewardUntil=0;chapter.activate();updateHUD();
}
function dialogUI([name,role],line,choices){
 audio.update(false,save,0,false,false);
 releaseLook();resetControls();$('hud').hidden=true;$('conversation').hidden=false;$('speaker').textContent=name;$('speakerrole').textContent=role;$('spoken').textContent=line;
 $('mixdesk').hidden=true;const answers=$('answers');answers.replaceChildren();
 choices.forEach(([label],i)=>{const b=document.createElement('button');const k=document.createElement('kbd');k.textContent=String(i+1);b.append(k,label);b.onclick=()=>chapter.pick(i);answers.append(b)});answers.firstElementChild?.focus({preventScroll:true});
}
function mixUI(phase,hits,feedback){$('mixdesk').hidden=false;$('track').lastElementChild.style.left=(phase*100)+'%';if(feedback) $('beats').dataset.msg=feedback;$('beats').textContent='● '.repeat(hits)+'○ '.repeat(3-hits)+'　'+($('beats').dataset.msg??'')}
function hideTalk(){
 resetControls();$('conversation').hidden=true;$('hud').hidden=false;updateHUD();
 ($('sceneAction').hidden?$('missionbtn'):$('sceneAction')).focus({preventScroll:true});
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
async function enter(story){
 if(opening)return;opening=true;audio.init();$('loading').hidden=false;
 await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
 $('worldview').hidden=false;
 try{if(!sim){await loadStudio();sim=new Simulation($('scene'),save,toast);cab=new CabShift(sim);race=new StreetRace(sim.scene,(color,i)=>flattenTraffic(makeCar(color,i,false)));chapter=new LedgerChapter(sim,save,{persist,toast,refresh:updateHUD,dialogue:dialogUI,hide:hideTalk,chime:()=>audio.chime(),bark:()=>{if(save.sound)audio.bark()},complete:finishChapter,start:trackChapter,free:()=>!race.active&&!save.cab&&save.mission<0});
  streetRadio=new StreetRadio(sim,save,{persist,toast,chime:()=>audio.chime(),free:()=>!race.active&&!save.cab&&save.mission<0});
  sim.restoreFootClearance();
 }sim.resize()}
 catch(e){console.warn('3D initialization:',e.message);$('worldview').hidden=true;$('loading').hidden=true;opening=false;showPanel('error');return}
 $('menu').classList.remove('daypreview');$('menu').hidden=true;$('loading').hidden=true;screen='play';opening=false;startedAt=elapsed;resetControls();lastContext='';$('context').textContent='';lastArea='';sim.resetCamera();
 if(story){trackChapter();toast(chapter.journal,4.5)}
 else{stopRace();if(save.cab){save.heldCab={...save.cab};clearFare()}bookmark();chapter.suspend();toast('自由漫游 · 在城市手记里查看联系人和故事');persist()}
 chapter.update(0);
 updateHUD();sim.update(0,idleKeys,target());sim.render();$('worldview').classList.remove('arrival');requestAnimationFrame(()=>$('worldview').classList.add('arrival'));
}
function backMenu(){streetRadio?.stop(false);chapter?.close();drift.reset();closePanel();stopRace();rewardUntil=0;screen='menu';persist();$('worldview').hidden=true;$('menu').hidden=false;refreshMenu();audio.update(false,save,0,false,false);$('story').focus()}
function atGate(job,step){
 const reach=step.foot?2.5:job.time?5.2:7.5;
 if(dist(sim.pos,step)<=reach)return true;
 if(!job.time||!lastCheck)return false;
 const ax=sim.pos.x-lastCheck.x,az=sim.pos.z-lastCheck.z,span=Math.hypot(ax,az);
 if(span<1e-6||span>30)return false;
 const t=Math.max(0,Math.min(1,((step.x-lastCheck.x)*ax+(step.z-lastCheck.z)*az)/(span*span)));
 return Math.hypot(lastCheck.x+ax*t-step.x,lastCheck.z+az*t-step.z)<=reach;
}
function failSprint(){
 save.step=0;timer=null;sprintLock=true;toast('计时结束 · 回到发车点可重试');audio.chime(false);persist();updateHUD();
}
function finishStep(dt){
 const job=missions[save.mission],step=storyTarget(),here=!!(sim&&job&&step&&atGate(job,step));
 if(!here){if(sprintLock&&sim&&job?.time&&step&&save.step===0)sprintLock=false;relay=0;return}
 // Expiry while still inside the start gate must not immediately re-arm the clock.
 if(sprintLock&&job.time&&save.step===0)return;
 if(step.foot?sim.inCar:!sim.inCar){relay=0;return}
 if(!job.time&&!step.foot){if(Math.abs(sim.speed)>3.4){relay=0;return}relay+=dt;if(relay<.52)return}
 const id=save.mission;relay=0;save.step++;sprintLock=false;audio.chime();
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
const textShown=new WeakMap(),hudPoint=new Vector3();
const mapPose={x:null,z:null,a:null,tx:null,tz:null,type:'',tapes:'',heat:-1,passed:-1,race:0,p0x:null,p0z:null,p1x:null,p1z:null};
let boostShown='',driftFill='';
function write(node,value){if(!node||textShown.get(node)===value)return;textShown.set(node,value);node.textContent=value}
function minimapDirty(p,step,patrols){
 let raceKey=0,passed=-1;
 if(race?.active){passed=race.passed;for(const v of race.cars)raceKey+=v.car.position.x+v.car.position.z}
 const tx=step?step.x:null,tz=step?step.z:null,type=step?.type??'',tapes=save.tapes.join(',');
 const p0=patrols[0],p1=patrols[1],p0x=p0?p0.x:null,p0z=p0?p0.z:null,p1x=p1?p1.x:null,p1z=p1?p1.z:null;
 if(mapPose.x===p.x&&mapPose.z===p.z&&mapPose.a===p.a&&mapPose.tx===tx&&mapPose.tz===tz&&mapPose.type===type&&mapPose.tapes===tapes&&mapPose.heat===sim.heat&&mapPose.passed===passed&&mapPose.race===raceKey&&mapPose.p0x===p0x&&mapPose.p0z===p0z&&mapPose.p1x===p1x&&mapPose.p1z===p1z)return false;
 Object.assign(mapPose,{x:p.x,z:p.z,a:p.a,tx,tz,type,tapes,heat:sim.heat,passed,race:raceKey,p0x,p0z,p1x,p1z});return true;
}
function updateHUD(){
 if(!sim)return;streetRadio?.hud();const p=sim.pos,job=missions[save.mission],step=target(),driving=sim.inCar;
 let top=job?'ON AIR　/　'+job.name:'TOKYO BAY　/　自由漫游';
 let text=step?.label??'查看城市委托';
 let distText=step?'◆ '+Math.round(dist(p,step))+' m　·　'+(save.step+1)+' / '+(job?.steps.length??1):'计时赛 '+save.done.length+'/'+missions.length+'　·　录音带 '+save.tapes.length+'/6';
 if(race?.active){const rel=Math.atan2(p.x-step.x,p.z-step.z)-p.a;const behind=Math.cos(rel)<-.55&&dist(p,step)>12;
  top='COAST MOTOR CLUB　/　'+race.spec.name;text='P'+race.rank+' / 4　·　第 '+race.lap+' / '+race.spec.laps+' 圈';distText=(behind?'↶ 旗门在后方':race.draft?'尾流充能 ↑':'旗门 '+(race.passed%race.track.gates.length+1)+' / '+race.track.gates.length)+'　·　'+clock(race.time)}
 else if(save.cab){const f=save.cab;top='COAST CABS　/　'+guests[f.guest].name;distText=Math.round(dist(p,step))+' m　·　'+(f.stage==='pickup'?'停车接客':'舒适 '+Math.round(f.comfort)+'%　小费 '+money(farePay(f).tip)+(f.kind==='express'?'　'+Math.max(0,Math.ceil(fareTerms(f).limit-f.seconds))+'s':''))}
 else if(step?.type==='pin'){top='TOKYO BAY　/　导航';distText=Math.round(dist(p,step))+' m　·　自设路标'}
 if(save.chapter.active&&step?.type!=='pin'){top='CHAPTER 01　/　工资';text=step?.label??(save.chapter.stage==='done'?'工资 · 已入伙':'工资');distText=step?(sim.inCar?'驾车':'步行')+'　·　'+Math.round(dist(p,step))+' m':chapter.journal}
 const wanted=$('wanted'),heat=sim.heat||0;wanted.hidden=heat<=0;if(heat>0){const hold=sim.raceClosed&&!sim.storyAlert;$('wantedhold').hidden=!hold;wanted.querySelectorAll('svg').forEach((star,i)=>star.classList.toggle('on',i<heat));const label=(hold?'警戒暂缓，':'')+'通缉 '+heat+' 星';if(wanted.getAttribute('aria-label')!==label)wanted.setAttribute('aria-label',label)}
 const fighting=!driving&&(!!sim.punch||sim.time<sim.comboUntil);
 const vitals=$('vitals'),showVitals=!driving&&((sim.health??100)<100||fighting||heat>0);vitals.hidden=!showVitals;
 if(showVitals){const pct=Math.max(0,Math.min(100,Math.round(sim.health??100))),width=pct+'%';if($('vitalfill').style.width!==width)$('vitalfill').style.width=width;vitals.classList.toggle('low',pct<=25);const vlabel='血量 '+pct;if(vitals.getAttribute('aria-label')!==vlabel)vitals.setAttribute('aria-label',vlabel)}
 $('weapon').hidden=driving||!(fighting||heat>0);
 $('cash').hidden=false;write($('cash'),money(save.money));
 if(chapter.carrying)distText+='　·　'+(driving?'保险箱在车上':'保险箱在身上');
 write($('objtop'),top);write($('objtext'),text);write($('objdist'),distText);
 const count=$('countin');count.hidden=!race?.active||(race.countdown<=0&&race.time>.8);if(!count.hidden)write(count,race.countdown>0?Math.ceil(race.countdown):'GO');
 const chip=$('driftScore');chip.hidden=drift.score<8;if(!chip.hidden){write(chip.querySelector('b'),Math.floor(drift.score)+' PT');write(chip.querySelector('small'),'漂移 ×'+drift.multiplier.toFixed(1)+(drift.idle>.2?'　即将入账':''));const fill=(100-100*drift.idle/2.25)+'%';if(driftFill!==fill){driftFill=fill;chip.style.setProperty('--driftfill',fill)}}
 const hud=$('hud'),draft=String(!!race?.draft),activity=race?.active?'race':save.cab?'cab':'city';
 if(hud.dataset.draft!==draft)hud.dataset.draft=draft;if(hud.dataset.activity!==activity)hud.dataset.activity=activity;
 const action=chapter?.nearby();shownSceneAction=action;$('sceneAction').hidden=!action;write($('sceneAction').lastElementChild,action?chapter.prompt(action):'');
 const pressed=String(save.radio);if($('radio').getAttribute('aria-pressed')!==pressed)$('radio').setAttribute('aria-pressed',pressed);
 write($('radiotxt'),sim.airTrack?'LIVE 98.4':save.radio?'FM 98.6':'RADIO OFF');
 write($('speed'),String(Math.round(Math.abs(sim.speed)*3.6)).padStart(3,'0'));
 write($('gear'),sim.speed<-.4?'R':sim.speed<.4?'N':String(Math.min(6,1+Math.floor(sim.speed/7))));
 const boostWidth=(sim.boost*100)+'%';if(boostShown!==boostWidth){boostShown=boostWidth;$('boostbar').style.width=boostWidth}
 write($('vehicle'),sim.carName());$('gauge').hidden=!driving;
 $('timer').hidden=timer===null;write($('timer'),timer===null?'':Math.max(0,timer).toFixed(1)+' s');$('timer').classList.toggle('urgent',timer!==null&&timer<=15);
 $('reward').hidden=rewardUntil<=elapsed;
 const area=district(p.x,p.z);if(area!==lastArea){$('area').innerHTML=area+'<small>'+districtEn(p.x,p.z)+'</small>';lastArea=area}
 const nearby=!driving&&sim.nearCar();let context='';
 const useCar=$('touchF');
 useCar.hidden=driving?!sim.canExitAtSpeed()||race.active||save.cab?.stage==='ride':!nearby;
 shownCarAction=useCar.hidden?null:driving?sim.car:nearby;
 let carActionLabel=driving?'下车':'上车';
 write(useCar.lastElementChild,nearby?carActionLabel+' · '+sim.carName(nearby):carActionLabel);
 write(useCar.querySelector('kbd'),'F');
 if(touch()){const jump=$('touchJump'),fist=$('touchPunch');write(document.querySelector('[data-hold="ShiftLeft"]'),driving?'氮气':'奔跑');jump.hidden=false;write(jump,driving?'手刹':'跳跃');const jumpLabel=driving?'手刹':'跳跃';if(jump.getAttribute('aria-label')!==jumpLabel)jump.setAttribute('aria-label',jumpLabel);fist.hidden=driving;write(document.querySelector('[data-hold="KeyW"]'),driving?'油门':'前进');write(document.querySelector('[data-hold="KeyS"]'),driving?'刹车':'后退');const left=document.querySelector('[data-hold="KeyA"]'),right=document.querySelector('[data-hold="KeyD"]');write(left,driving?'◀':'左');write(right,driving?'▶':'右');const leftLabel=driving?'左转':'左移',rightLabel=driving?'右转':'右移';if(left.getAttribute('aria-label')!==leftLabel)left.setAttribute('aria-label',leftLabel);if(right.getAttribute('aria-label')!==rightLabel)right.setAttribute('aria-label',rightLabel)}
 const combo=$('combo'),chain=!driving&&sim.combo>0&&sim.time<sim.comboUntil;combo.hidden=!chain;if(chain)write(combo.querySelector('b'),String(sim.combo));
 if(save.cab&&dist(p,step)<35)context=cab.hold>0?(save.cab.stage==='pickup'?'乘客正在上车…':'乘客正在下车…'):'在琥珀色圈内刹停';else if(race?.draft)context='尾流充能 ↑　按住加速冲刺';else if(job&&step&&!step.foot&&driving&&!job.time&&dist(p,step)<42)context=relay>0?'正在交接…':(touch()?'刹车入圈，停车交接':'S　刹车入圈，停车交接');
 else if(job&&step?.foot&&driving&&!useCar.hidden&&dist(p,step)<19)context=touch()?'点「下车」取件':'按 F 下车取件';
 else if(touch()&&!driving&&elapsed-startedAt<13)context='拖动画面转向　·　左右平移　·　跳跃　·　出拳';
 else if(!touch()&&elapsed-startedAt<13)context=driving?'W 加速　·　A / D 转向　·　S 刹车　·　空格 手刹':'点击画面转向　·　WASD 行走　·　空格 跳跃　·　左键出拳';
 if(sim.inCar&&sim.car.userData.model===2&&streetRadio?.mode==='off'&&!context)context='停稳后按 B，在这个街区开一场流动电台';
 if(!context&&save.chapter.active&&sim.inCar&&step?.type==='chapter'&&dist(p,step)<18)context='停下车，走过去';
 if(action||nearby)context='';if(context!==lastContext){$('context').textContent=context;lastContext=context}
 const wp=$('waypoint');wp.hidden=true;if(step){sim.camera.updateMatrixWorld();const dst=dist(p,step),v=hudPoint.set(step.x,5.8,step.z).project(sim.camera);
  if(dst>8&&dst<200&&v.z<1&&v.z>0&&Math.abs(v.x)<.88&&Math.abs(v.y)<.70){wp.hidden=false;wp.style.left=((v.x+1)*50)+'%';wp.style.top=((1-v.y)*50)+'%';write(wp.lastElementChild,Math.round(dst)+' m')}}
 const patrols=visiblePatrols();if(minimapDirty(p,step,patrols))paintMap($('minimap'),p,step,save,sim.world.footprints,false,race,patrols,sim.heat);
}
const headers={chapters:['STORY ARCHIVE','选章试玩'],sync:['CITY ARCHIVE','另一窗口已保存进度'],help:['CONTROLS','操作指南'],pause:['PAUSE MENU','已暂停'],jobs:['TOKYO BAY JOURNAL','城市手记'],map:['TOKYO BAY / NAVIGATION','城市地图'],drift:['SIDEWAYS CLUB','漂移练习'],cab:['NIGHT DISPATCH','夜班载客'],race:['RACE CONTROL','街头竞速'],garage:['MARLIN CUSTOMS','私人车库'],error:['GRAPHICS','暂时无法进入街区']};
function showPanel(name){
 releaseLook();if(chapter?.talk&&name!=='sync')chapter.close();
 if(!panel)previousFocus=document.activeElement;
 resetControls();panel=name;$('overlay').hidden=false;$('panelKicker').textContent=headers[name][0];$('panelTitle').textContent=headers[name][1];const body=$('panelbody');
 const btn=(key,label)=>'<button class="btn" data-act="'+key+'">'+label+'</button>';
 if(name==='sync'){
  body.innerHTML='<p class="panelcopy">载入最新的城市档案，可以从同一笔余额和活动进度继续。</p>'+btn('reload','载入最新进度');
 }else if(name==='chapters'){
  const journal=chapter?.journal??'夜市档口还有人在谈价。';
  body.innerHTML='<div class="chaptercard"><small>CHAPTER 01</small><h3>工资</h3><p>'+journal+'</p>'+btn('playstory',save.chapter.stage==='new'?'开始这一章':'继续这一章')+'</div>';
 }else if(name==='help'){
  body.innerHTML='<div class="helpgrid">'+[['鼠标','步行时转动视角，上下略微俯仰'],['鼠标左键','徒手攻击，身前有人会先贴上去再打'],['W / ↑','驾车油门，步行沿视角前进'],['S / ↓','驾车刹车或倒车，步行后退'],['A / D / ← →','驾车转向，步行左右平移'],['空格','驾车手刹，步行跳跃'],['Shift','氮气加速 / 奔跑'],['E','与附近人物交谈 / 查看物件'],['F','下车 / 就近上车'],['M / J / G','地图 / 调度 / 车库'],['C / R','切换镜头 / 电台'],['B','转播车停稳后，开播或收天线'],['V','明信片相机'],['Esc / P','暂停或恢复']].map(([k,s])=>'<p><kbd>'+k+'</kbd>'+s+'</p>').join('')+'</div><p class="helpnote">金色菱形指向当前剧情目标。对话中可用数字键选择回答。步行时点击画面锁定鼠标；浏览器拒绝锁定时按住右键拖动。触屏拖动空画面转向，左右键是平移，跳跃键在驾车时变为手刹，出拳只在步行时出现。</p>';
 }else if(name==='pause'){
  body.innerHTML='<div class="ledger"><span>钱包 '+money(save.money)+'</span><span>载客 '+save.trips+' 单</span><span>完赛 '+Object.values(save.records).reduce((n,r)=>n+r.runs,0)+' 场</span></div><div class="menulist">'+[['resume','继续游玩'],['map','城市地图'],['jobs','城市手记'],['garage','私人车库'],['drift','漂移练习'],['night',save.night?'切换至日落':'切换至午夜'],['photo','拍摄明信片'],['view','切换驾驶视角'],['help','操作指南'],['sound',save.sound?'关闭声音':'打开声音'],['rescue','道路救援'],['menu','返回主菜单']].map(([k,s])=>'<button data-act="'+k+'">'+s+icon('arrow')+'</button>').join('')+'</div>';
 }else if(name==='map'){
  const picker='<details class="fleetfinder"><summary>找街车 · 11 款</summary><div class="mapstops">'+additions.map(v=>'<button data-findcar="'+v.key+'">'+v.name+'</button>').join('')+'</div></details>';
  body.innerHTML=navigation(save,sim)+'<div class="mapstops">'+Object.entries(localStops).map(([id,{name}])=>'<button data-place="'+id+'">'+name+'</button>').join('')+'</div>'+picker;paintMap($('bigmap'),sim.pos,target(),save,sim.world.footprints,true,race,visiblePatrols());
 }else if(name==='drift'){body.innerHTML='<div class="ticket raceticket"><div class="tickethead"><b>SIDEWAYS CLUB</b><small>自由漫游</small></div><div class="ticketbody"><small>个人最佳连段</small><h3>'+save.driftBest+' PT</h3><p>单次连段达到 450 分，解锁「午夜极光」车漆。</p></div></div><p class="helpnote">开到有空间的路段，加速到 30 km/h 以上，按住空格再转向。连续左右甩尾可叠到 3 倍；平稳行驶 2 秒即可结算，碰撞会中断连段。</p><div class="actions"><button class="btn hot" data-act="freeDrift">进入自由练习</button></div>';
 }else if(name==='cab'){body.innerHTML=cabPanel(save,sim,kind);
 }else if(name==='race'){body.innerHTML=racePanel(save,race,course);drawTrack($('diagram'),course);
 }else if(name==='jobs'){
  const m=missions[selectedJob];body.innerHTML='<div class="chaptercard"><small>CHAPTER 01</small><h3>工资</h3><p>'+chapter.journal+'</p><button class="btn hot" data-act="track">'+(save.chapter.active?'返回街头':save.chapter.stage==='new'?'开始故事':'继续这个故事')+'</button>'+(save.chapter.active?btn('untrack','自由漫游'):'')+'</div>'+tabs('jobs')+'<div class="joblist">'+missions.map((j,i)=>'<button class="job '+(i===selectedJob?'active':'')+'" data-job="'+i+'"><strong>'+j.name+(save.done.includes(i)?'　✓':'')+'</strong><small>'+j.en+'</small><span>'+money(j.reward)+'</span></button>').join('')+'</div><p class="panelcopy"><strong>'+m.from+'</strong><br>'+m.line+(m.time&&save.best?'<br>个人最佳 '+save.best.toFixed(1)+' 秒':'')+'</p><div class="actions"><button class="btn hot" data-act="accept">'+(save.mission===selectedJob?'继续当前委托':save.done.includes(selectedJob)?'重玩委托':'接下委托')+'</button>'+(save.mission>=0?btn('leave','转为自由漫游'):'')+'</div>';
 }else if(name==='garage'){
  body.innerHTML='<div class="studio"><canvas id="studio" width="760" height="225" aria-label="私人跑车三维预览"></canvas><button data-act="rotate" aria-label="旋转车辆">↻</button></div><div class="ledger"><span>MARLIN TURBO</span><b>'+money(save.money)+'</b></div><div class="switches"><button data-garage="performance" aria-pressed="'+(garageTab==='performance')+'">性能改装</button><button data-garage="paint" aria-pressed="'+(garageTab==='paint')+'">车身涂装</button></div>'+(garageTab==='performance'?modPanel(save):'<div class="swatches">'+paints.map(p=>'<button class="swatch '+(save.paint===p.id?'selected':'')+'" data-paint="'+p.id+'" '+(!save.owned.includes(p.id)&&(p.unlock||save.money<garagePrice(save,p.price))?'disabled':'')+'><i style="background:#'+p.color.toString(16).padStart(6,'0')+'"></i><strong>'+p.name+'</strong><small>'+(save.paint===p.id?'已装备':save.owned.includes(p.id)?'装备':p.unlock?'漂移 '+p.unlock+' 分':money(garagePrice(save,p.price)))+'</small></button>').join('')+'</div>');drawStudio();
 }else if(name==='error')body.innerHTML='<p class="panelcopy">浏览器未能建立 3D 画面。请启用浏览器的图形加速，或在支持 WebGL 2 的浏览器中重新打开游戏。</p>'+btn('resume','返回');
 $('close').focus();if(screen==='play')audio.update(false,save,0,false,false);
}
function drawStudio(){const c=$('studio');if(c)showroom(c,sim,paints.find(p=>p.id===save.paint).color,studioYaw)}
function closePanel(){if(panel==='sync'){location.reload();return}panel='';$('overlay').hidden=true;resetControls();if(previousFocus instanceof HTMLElement&&previousFocus.offsetParent)previousFocus.focus({preventScroll:true});previousFocus=null}
function toggleSound(){audio.init();save.sound=!save.sound;audio.update(screen==='play'&&!panel,save,sim?.speed||0,false,!!sim?.inCar);if(save.sound)audio.chime();refreshMenu();persist()}
function toggleRadio(){audio.init();save.radio=!save.radio;toast(save.radio?'FM 98.6 · Bay Wave 正在播放':'车载电台已关闭');persist();updateHUD()}
function pressE(){if(chapter?.nearby())chapter.action()}
function interact(car){
 if(!sim||screen!=='play'||panel||chapter?.talk)return;
 if(sim.inCar&&(race?.active||save.cab?.stage==='ride')){toast(race?.active?'完赛后可下车':'先送乘客到目的地');return}
 const wasDriving=sim.inCar;
 sim.interact(car);
 if(sim.inCar!==wasDriving){relay=0;resetControls();if(sim.inCar)releaseLook();persist()}
 updateHUD();
}
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
 if(act==='playstory'){closePanel();enter(true);return}
 if(act==='reload'){location.reload();return}if(headers[act]){showPanel(act);return}
 if(act==='track'){closePanel();if(!save.chapter.active)trackChapter();return}if(act==='untrack'){chapter.suspend();closePanel();persist();updateHUD();return}
 if(act==='freeDrift'){eventStart();clearFare();stopRace();persist();toast('漂移练习 · 加速后转向');updateHUD();return}
 if(act==='rotate'){studioYaw+=Math.PI/3;drawStudio();return}
 if(act==='clearPin'){save.pin=null;persist();showPanel('map');return}
 if(act==='takeCab'){startFare();return}
 if(act==='startRace'){if(race.active&&race.spec.id===circuits[course].id)closePanel();else startRace();return}
 if(act==='endEvent'){stopRace();clearFare();rewardUntil=0;closePanel();persist();updateHUD();return}
 if(act==='night'){sim.setNight(!save.night);persist();closePanel();return}
 if(act==='accept'){closePanel();if(save.mission!==selectedJob)beginJob(selectedJob)}
 if(act==='leave'){save.bookmark=null;save.mission=-1;save.step=0;timer=null;sprintLock=false;persist();closePanel();toast('自由漫游 · 随时可以接下委托');updateHUD()}
 if(act==='photo'){closePanel();openPhoto()}
 if(act==='resume')closePanel();if(act==='menu')backMenu();if(act==='sound'){toggleSound();showPanel('pause')}
 if(act==='rescue'){if(race.active||save.cab){closePanel();toast('请先在调度中结束当前活动再呼叫救援');return}sim.rescue();persist();closePanel()}
 if(act==='view'){changeView();closePanel()}
});
$('chapters').onclick=()=>showPanel('chapters');$('sceneAction').onclick=()=>{if(shownSceneAction&&chapter.nearby()===shownSceneAction)chapter.action();else updateHUD()};$('walkAway').onclick=()=>chapter.close();$('story').onclick=()=>enter(true);$('roam').onclick=enterShiba;$('legacyRoam').onclick=()=>enter(false);$('help').onclick=()=>showPanel('help');$('close').onclick=closePanel;$('pause').onclick=()=>showPanel('pause');
$('missionbtn').onclick=()=>{if(save.mission>=0)selectedJob=save.mission;showPanel(race?.active?'race':save.cab?'cab':'jobs')};$('minimapbtn').onclick=()=>showPanel('map');$('radio').onclick=toggleRadio;$('touchF').onclick=()=>{if(shownCarAction)interact(shownCarAction)};
$('nextjob').onclick=()=>{rewardUntil=0;if(rewardMode==='race')startRace();else if(rewardMode==='cab')startFare();else if(rewardMode==='chapter')updateHUD();else beginJob(selectedJob)};$('rewardpaint').onclick=()=>{rewardUntil=0;showPanel('garage')};$('cruise').onclick=()=>{rewardUntil=0;updateHUD()};
$('overlay').addEventListener('click',e=>{if(e.target===$('overlay'))closePanel()});
document.querySelector('.sound').onclick=toggleSound;
const full=document.querySelector('.fullscreen');if(!document.documentElement.requestFullscreen&&!document.documentElement.webkitRequestFullscreen)full.hidden=true;
full.onclick=async()=>{try{if(document.fullscreenElement||document.webkitFullscreenElement){await (document.exitFullscreen?.()??document.webkitExitFullscreen?.())}else{const n=document.documentElement;await (n.requestFullscreen?.()??n.webkitRequestFullscreen?.())}}catch{full.title='当前窗口无法全屏'}};
function redrawPhoto(){if(screen==='photo')sim.photo(photoYaw,photoHeight,photoRadius)}
function openPhoto(){releaseLook();screen='photo';resetControls();audio.update(false,save,0,false,false);photoYaw=-.85;photoHeight=2.6;photoRadius=sim.camera.aspect<.8?7.5:6.3;
 $('hud').hidden=true;$('photo').hidden=false;$('photoplace').textContent=district(sim.pos.x,sim.pos.z);$('shutter').textContent='保存明信片';sim.station.group.visible=false;redrawPhoto();$('shutter').focus()}
function leavePhoto(){screen='play';$('photo').hidden=true;$('hud').hidden=false;dragPoint=null;sim.resetCamera();sim.update(0,idleKeys,target());sim.render();$('pause').focus()}
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
  const answerButtons=()=>[...$('answers').querySelectorAll('button')].filter(el=>el.getClientRects().length);
  if(e.code==='Escape'){e.preventDefault();chapter.close()}
  else if(/^(Digit|Numpad)[1-3]$/.test(e.code)&&!e.repeat){e.preventDefault();chapter.pick(Number(e.code.slice(-1))-1)}
  else if(e.code==='ArrowUp'||e.code==='ArrowDown'){if(e.target.tagName==='INPUT')return;e.preventDefault();const btns=answerButtons();if(!btns.length)return;let i=btns.indexOf(document.activeElement);i=i<0?0:(i+(e.code==='ArrowDown'?1:-1)+btns.length)%btns.length;btns[i].focus({preventScroll:true})}
  else if(e.code==='Enter'&&!e.repeat&&e.target.tagName!=='INPUT'){e.preventDefault();const current=document.activeElement;if(current&&$('conversation').contains(current)&&current.tagName==='BUTTON')current.click();else $('answers').querySelector('button')?.click()}
  else if(e.code==='Tab'){const btns=[...$('conversation').querySelectorAll('button,input')].filter(el=>el.getClientRects().length);if(e.shiftKey&&document.activeElement===btns[0]){e.preventDefault();btns.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===btns.at(-1)){e.preventDefault();btns[0].focus()}}
  return;
 }
 if(screen==='photo'){if(['Escape','KeyV'].includes(e.code)){e.preventDefault();if(!e.repeat)leavePhoto()}else if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();photoYaw+=e.code==='ArrowLeft'?-.1:.1;redrawPhoto()}return}
 if(panel){
  if(e.code==='Tab'){const list=[...$('overlay').querySelectorAll('button:not(:disabled)')];if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus()}}
  if(['Escape','KeyP'].includes(e.code)||(panel==='map'&&e.code==='KeyM')||(panel==='jobs'&&e.code==='KeyJ')){if(e.code==='Escape'&&performance.now()-swallowEscape<200){swallowEscape=0;e.preventDefault();return}e.preventDefault();if(!e.repeat)closePanel()}return
 }
 if(screen==='menu'){if(e.code==='Enter'&&document.activeElement.tagName!=='BUTTON'){e.preventDefault();enterShiba()}return}
 const k=keyCode(e);if(['Space','KeyW','KeyA','KeyS','KeyD','ShiftLeft'].includes(k)){e.preventDefault();if(!e.repeat)keyboardHolds.set(e.code,k);return}
 if(e.repeat)return;
 switch(k){case 'KeyB':streetRadio.toggle();break;case 'KeyE':pressE();break;case 'KeyG':showPanel('garage');break;case 'KeyV':openPhoto();break;case 'KeyF':interact();break;case 'KeyM':showPanel('map');break;case 'KeyJ':$('missionbtn').click();break;case 'KeyR':toggleRadio();break;case 'KeyC':changeView();break;case 'KeyP':case 'Escape':e.preventDefault();showPanel('pause');break}
});
window.addEventListener('keyup',e=>keyboardHolds.delete(e.code));
function releaseLook(){
 const node=$('scene'),id=lookPointer;lookPointer=null;
 if(id!==null&&node.hasPointerCapture(id))node.releasePointerCapture(id);
 if(document.pointerLockElement===node){ignoreUnlock=true;document.exitPointerLock()}
}
function footLook(){return screen==='play'&&!panel&&!chapter?.talk&&sim&&!sim.inCar}
function requestLookLock(){
 const node=$('scene');
 try{const request=node.requestPointerLock??node.webkitRequestPointerLock;request?.call(node)?.catch?.(()=>{})}catch{}
}
const scene=$('scene');
let lookX=0,lookY=0;
scene.addEventListener('contextmenu',e=>{if(screen==='play')e.preventDefault()});
scene.addEventListener('pointerdown',e=>{
 if(!footLook())return;
 if(e.target.closest&&e.target.closest('button,a,input,select,textarea,label'))return;
 if(e.pointerType!=='mouse'||e.button===2)e.preventDefault();
 if(e.pointerType==='mouse'&&e.button===0){requestLookLock();sim.attack();return}
 if(e.pointerType==='mouse'&&e.button!==2)return;
 lookPointer=e.pointerId;lookX=e.clientX;lookY=e.clientY;try{scene.setPointerCapture(e.pointerId)}catch{}
},{passive:false});
scene.addEventListener('pointermove',e=>{
 if(document.pointerLockElement===scene||e.pointerId!==lookPointer||!footLook())return;
 const dx=e.clientX-lookX,dy=e.clientY-lookY;lookX=e.clientX;lookY=e.clientY;sim.look(dx,dy);
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])scene.addEventListener(name,e=>{if(e.pointerId===lookPointer)lookPointer=null});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==scene||!footLook())return;sim.look(e.movementX,e.movementY)});
document.addEventListener('pointerlockchange',()=>{
 if(document.pointerLockElement){if(!footLook())releaseLook();return}
 if(ignoreUnlock){ignoreUnlock=false;return}
 swallowEscape=performance.now();
 if(screen==='play'&&!panel&&!chapter?.talk)showPanel('pause');
});
document.querySelectorAll('[data-hold]').forEach(button=>{
 button.addEventListener('pointerdown',e=>{
  if(screen!=='play'||panel||chapter?.talk||e.button!==0)return;
  e.preventDefault();button.setPointerCapture(e.pointerId);touchHolds.set(e.pointerId,button);button.classList.add('held');
 });
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,e=>{
  if(touchHolds.get(e.pointerId)!==button)return;
  touchHolds.delete(e.pointerId);
  if(![...touchHolds.values()].includes(button))button.classList.remove('held');
 });
});
$('touchPunch').addEventListener('pointerdown',e=>{
 if(screen!=='play'||panel||chapter?.talk||!sim||sim.inCar||e.button!==0)return;
 e.preventDefault();sim.attack();
});
window.addEventListener('blur',()=>{resetControls();if(screen==='play'&&!panel)showPanel('pause')});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(sim)persist();resetControls();if(screen==='play'&&!panel)showPanel('pause')}});
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
 if(sim.busted){sim.busted=false;persist();updateHUD()}
 if(race.active){const result=race.update(dt,sim);if(result)podium(result)}
 updateDrift(dt,controls);
 const fare=cab.update(dt,controls,line=>{audio.chime();toast('乘客上车 · “'+line+'”');persist()});
 if(fare)dropoff(fare);
}
const frameKeys=new Set();
function loop(now){
 const dt=then?Math.min((now-then)/1000,.12):0;then=now;
 if(screen==='play'&&!panel&&chapter?.talk){audio.stopVehicleContacts();chapter.update(dt,true);sim.render(false)}else if(screen==='play'&&!panel&&sim){
  elapsed+=dt;
  frameKeys.clear();for(const key of keyboardHolds.values())frameKeys.add(key);let touchBoost=false;
  for(const button of touchHolds.values()){
   const key=button.dataset.hold;frameKeys.add(key);
   if(key==='ShiftLeft')touchBoost=true;
  }
  // The right thumb can hold boost while the left thumb steers.
  if(touchBoost&&sim.inCar&&!frameKeys.has('KeyS'))frameKeys.add('KeyW');
  let remaining=dt;
  while(remaining>0){
   const step=Math.min(remaining,1/40);updateActivities(step,frameKeys);
   finishStep(step);if(timer!==null&&save.mission!==-1){timer-=step;if(timer<=0)failSprint()}
   lastSample.x=sim.pos.x;lastSample.z=sim.pos.z;lastCheck=lastSample;remaining-=step;
  }
  chapter.update(dt);streetRadio.update(dt);
  if(!race.active)collect();if(target()?.type==='pin'&&dist(sim.pos,save.pin)<5){save.pin=null;persist();toast('已抵达导航终点')}if(elapsed>=toastUntil)$('toast').classList.remove('show');
  if(elapsed>=uiAt){updateHUD();uiAt=elapsed+.09}
  if(elapsed>=savedAt){persist();savedAt=elapsed+2.5}
  let patrolDistance=Infinity;
  if(sim.heat){if(sim.patrol?.visible)patrolDistance=Math.min(patrolDistance,dist(sim.pos,sim.patrol.position));if(sim.patrol2?.visible)patrolDistance=Math.min(patrolDistance,dist(sim.pos,sim.patrol2.position))}
  audio.update(true,save,sim.speed,frameKeys.has('KeyW'),sim.inCar,sim.airTrack,patrolDistance);
  audio.vehicleContacts(save.sound,sim.vehicleImpacts,sim.vehicleScrapes,sim.camera,sim.time);
  if(sim.vehicleImpacts)sim.vehicleImpacts.length=0;
  sim.render();
 }
 requestAnimationFrame(loop)
}
refreshMenu();requestAnimationFrame(loop);
