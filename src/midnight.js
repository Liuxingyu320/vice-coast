import {localStops,recordStall} from './data.js';
import {makeMidnightSet} from './midnight-set.js';
import {personDetail,animatePerson} from './people.js';

const point=(x,z,label)=>({x,z,label,type:'chapter'});
const spots={
 new:point(145,54.2,'到波音唱片找玛拉'),door:point(69.6,-113.8,'在火烈鸟正门找妮娜'),
 bar:point(46,-104.6,'到后院吧台找鼓手蒂托'),needle:point(42.1,-128.5,'在调音台放老维克的唱片'),
 crew:point(localStops.crew.x,localStops.crew.z,'去后巷找搬运工帕兹'),haul:point(55,-100,'从装货门把音箱送到黄线旁'),
 card:point(41.8,-131.75,'到调音台拿调频磁卡'),dial:point(localStops.dial.x,localStops.dial.z,'在潮见码头调试流动电台'),offer:point(187,-127.5,'和雷蒙谈午夜时段'),
 stall:point(localStops.stall.x,localStops.stall.z,'和旧唱片摊主露兹聊聊'),crate:point(141,54.7,'把唱片筐送进波音唱片'),
 photo:point(localStops.photo.x,localStops.photo.z,'和摄影师伊内丝聊聊'),bag:point(localStops.bag.x,localStops.bag.z,'在海蓝亭台阶边寻找相机包'),
 deliver:point(176.5,-102.6,'把相机包交还伊内丝'),sell:point(64.5,-91.8,'向帕兹转让相机包')
};
const people={luz:['露兹','LUZ  /  旧唱片摊主'],ines:['伊内丝','INÉS  /  街头摄影师'],tito:['蒂托','TITO  /  夜班鼓手'],paz:['帕兹','PAZ  /  搬运班长'],ramon:['雷蒙','RAMÓN VEGA  /  午夜时段买手']};
const titles={new:'听玛拉的午夜计划',door:'问妮娜后台怎么走',bar:'和鼓手蒂托碰面',needle:'播放维克的首版',crew:'问帕兹要装货班牌',haul:'交付巡演音箱',card:'取走调频磁卡',dial:'接通码头调频台',offer:'和雷蒙决定午夜档归属',stall:'听听唱片摊的争执',crate:'交付露兹的唱片筐',photo:'听听摄影师的呼喊',bag:'拾起帆布相机包',deliver:'交还相机包',sell:'转让相机包'};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const $=id=>document.getElementById(id);
export class MidnightDistrict{
 constructor(chapter, locations=spots, set=null, copy={}){
  this.copy=copy;
  this.spots=locations;
  this.host=chapter;this.sim=chapter.sim;this.save=chapter.save;this.s=this.save.midnight;this.set=set??makeMidnightSet(this.sim);this.api=chapter.api;
 }
 get honest(){return this.save.chapter.ending==='return'}
 get unlocked(){return !!this.save.chapter.ending}
 get target(){return this.unlocked?this.spots[this.s.stage]:null}
 get journal(){return this.s.outcome==='live'?'玛拉的现场原声正在 FM 98.4 播放。':this.s.outcome==='sponsor'?'雷蒙接手了午夜档。车库替你预留了免费薄荷涂装。':this.target?.label??'等海浪账本分账后，回唱片店见玛拉。'}
 get sideNote(){
  const s=this.s,lines=[];
  if(s.vinyl==='carrying')lines.push('露兹的唱片筐要送到唱片店门口。');
  else if(s.vinyl!=='idle')lines.push('露兹给你留了一张稀有首版。');
  if(s.bag==='looking')lines.push(this.copy.bagNote??'伊内丝把包落在码头以南的海蓝亭，留意临街的台阶。');
  else if(s.bag==='found')lines.push(this.copy.returnNote??'相机包可以还给海边的伊内丝，也可以带去火烈鸟后巷找帕兹。');
  else if(s.bag==='returned')lines.push('海边的公告栏挂上了伊内丝的新照片。');
  else if(s.bag==='sold')lines.push('伊内丝还在海滨等她的底片。');
  return lines.join(' ');
 }
 available(){
  const s=this.s,ids=[];
  if(this.unlocked&&(this.save.chapter.active||s.stage==='new'&&this.api.free())&&this.spots[s.stage])ids.push(s.stage);
  if(s.vinyl==='idle')ids.push('stall');else if(s.vinyl==='carrying')ids.push('crate');
  if(s.bag==='idle')ids.push('photo');else if(s.bag==='looking')ids.push('bag');else if(s.bag==='found')ids.push('deliver','sell');
  return ids;
 }
 nearby(){return this.available().map(id=>({k:'mid-'+id,d:distance(this.sim.pos,this.spots[id])})).filter(o=>o.d<3.35).sort((a,b)=>a.d-b.d)}
 hint(){
  if(this.sim.inCar)return '';
  for(const id of this.available().filter(k=>['stall','photo','bag'].includes(k)))if(distance(this.sim.pos,this.spots[id])<13)return ({stall:'路旁传来吆喝声　·　旧唱片摊',photo:'有人在叫你　·　海滨摄影师',bag:'台阶边露出一截帆布背带'})[id];
  return '';
 }
 say(who,line,buttons){this.host.say(who,line,buttons)}
 commit(line){this.host.close();this.api.persist();this.api.refresh();if(line)this.api.toast(line,5)}
 next(stage,line){this.s.stage=stage;this.commit(line)}
 close(){this.tuner=null;$('tuning').hidden=true}
 action(k){
  const s=this.s,save=this.save,leave=['稍后再来',()=>this.host.close()];
  switch(k){
  case 'new':this.say('mara',this.copy.newSignal??'半夜十二点，码头上那根旧天线还留着一格空档。雷蒙想买走它，循环播他的广告。我想让海岸先听完那晚停电后的掌声。',[
   ['把午夜档接回来',()=>{this.api.start();this.sim.setNight(true);this.next('door',this.honest?'维克递来一张首版。后院的乐手记得你。':'门房的名单上还有你的名字。先去听听妮娜怎么说。')}],leave]);break;
  case 'door':this.say('door',this.honest?'鼓手昨天收到了尾款。他说你来，就留正门。蒂托在吧台候着，别把首版忘了。':'你上次拿走了乐手的钱。正门的名单不变。装货班还缺人，班长只认做完的工。',[[this.honest?'从正门去吧台':'去后巷找搬运班长',()=>this.next(this.honest?'bar':'crew')],leave]);break;
  case 'bar':this.say('tito','我拿那笔尾款换了新鼓皮。想上电台？帮我把维克那张老唱片放一遍。最后一拍响时，磁卡就是你的。',[['把首版带到调音台',()=>this.next('needle')],leave]);break;
  case 'needle':this.say('deckPress','唱针刚刚落下。你听，断电后第一排的脚跟还在打拍子。那张奶油色的卡就在调音台另一端。',[['让整段掌声放完',()=>{this.api.chime();this.next('card')}],leave]);break;
  case 'crew':{
   const choices=[['跟班搬音箱，免费领班牌',()=>{s.pass=true;this.next('haul','装货卷闸已升起。音箱可以随身搬，也可以装车。')}]];
   if(save.money>=200)choices.push(['付 $200 请搬运班代送',()=>{if(save.money<200||s.stage!=='crew')return;save.money-=200;s.pass=true;this.next('card','帕兹叫同事接手搬运。装货门已开，你可以直接去后台取磁卡。')}]);
   this.say('paz','前门的客人名单不归我管。你可以替我搬一趟，我给你签班牌。赶时间就付两百，我让夜班替你把箱子搬进去。黄线在卷闸里头。',[...choices,leave]);break}
  case 'haul':this.say('paz','音箱到位。把箱扣朝外，夜班的人才摸得着。磁卡在舞台左后方的调音台。',[['卸下音箱，去取磁卡',()=>this.next('card')],leave]);break;
  case 'card':this.say('frequencyCard','薄薄的磁条背面写着铅笔字。“98.4，灯阵六成。两只旋钮稳住，等我数完二拍半。”',[[this.copy.dialChoice??'装好磁卡，到码头接台',()=>this.next('dial',this.copy.dialDirections??'码头边停着一辆 Bay Wave 转播车，谁都可以开。')],leave]);break;
  case 'dial':this.startTuner();break;
  case 'offer':this.say('ramon','我出一千二买今晚的时段。播完广告，明天这台车就能换上新漆。你也可以给玛拉开麦。磁卡在你手里。',[
   ['推起玛拉的现场原声　＋$500',()=>this.finish('live')],['把午夜时段签给雷蒙　＋$1,200',()=>this.finish('sponsor')],leave]);break;
  case 'stall':{
   const choices=[['替露兹把唱片搬进店里寄售',()=>{s.vinyl='carrying';this.commit(this.copy.crateDirections??'旧唱片筐已拿好。波音唱片在这条人行道北边。')}]];
   if(this.honest)choices.push(['用乐手联名担保摊位',()=>{s.vinyl='catalogued';this.commit('露兹把一张首版《Side B》套进了你的纸袋。')}]);
   this.say('luz','雨一来，这些头版就得泡在路上。维克愿意给我腾半格货架，可我得守摊。你能搭把手吗？',[...choices,leave]);break}
  case 'crate':this.say('vic','这张头版我当年找了半年。放心，露兹的名字我写第一行。跑腿的钱和她留给你的首版都在这。',[['把整筐唱片交给维克',()=>{s.vinyl='delivered';save.money+=180;this.commit('街头见闻 · 寄售完成　＋$180　／　稀有首版《Side B》')}],leave]);break;
  case 'photo':this.say('ines',this.copy.lostCamera??'我绕着海蓝亭拍了一卷底片，现在肩上只剩一条带子。帆布包有黄铜扣。能帮我看看临街的台阶吗？',[[this.copy.searchChoice??'沿海边找找',()=>{s.bag='looking';this.commit(this.copy.searchDirections??'伊内丝指了指海滨南边卖明信片的亭子。')}],leave]);break;
  case 'bag':this.say('canvasBag','黄铜扣已经磨亮。包里只有旧镜头和一卷底片，吊牌上写着“伊内丝”。',[['收好相机包',()=>{s.bag='found';this.commit('可以把包还给伊内丝，也可以去后巷找收旧器材的帕兹。')}],leave]);break;
  case 'deliver':this.say('ines','你知道这卷里有什么吗？大家撑着雨棚收摊的背影。等天亮我就洗一张，挂在这里。',[['交还底片和镜头　＋$250',()=>{s.bag='returned';save.money+=250;this.commit('街头见闻 · 失物归还　／　海滨公告栏更新')}],leave]);break;
  case 'sell':this.say('paz','镜头我收，五百。底片不会再回到摄影师手里。你自己定。',[['转让镜头和底片　＋$500',()=>{s.bag='sold';save.money+=500;this.commit('街头见闻 · 已转让相机包　＋$500')}],leave]);break;
  }
 }
 startTuner(){
  this.say('consoleDesk','磁卡的标记是 FM 98.4、相位 60%。把两处刻度调到标记上，同时稳住两秒半。',[['收起耳机',()=>this.host.close()]]);
  this.tuner={time:20,hold:0};$('tuning').hidden=false;$('freq').value=976;$('phase').value=30;this.tickTuner(0);$('freq').focus({preventScroll:true});
 }
 tickTuner(dt){
  const t=this.tuner;if(!t)return;
  const f=Number($('freq').value),phase=Number($('phase').value),aligned=f===984&&Math.abs(phase-60)<=3;
  t.time-=dt;t.hold=aligned?t.hold+dt:0;$('freqVal').value=(f/10).toFixed(1);$('phaseVal').value=phase+'%';$('signalLock').value=Math.min(2.5,t.hold);
  $('lockTime').textContent=(aligned?'正在锁定':'寻找信号')+'　·　'+Math.max(0,Math.ceil(t.time))+' s';
  if(t.hold>=2.5){this.api.chime();this.next('offer','信号锁定。雷蒙推了推眼镜，等你表态。')}
  else if(t.time<=0){this.close();this.say('consoleDesk','这一轮信号过去了。下一轮就快到了，磁卡仍在机内。',[['再调一次',()=>this.startTuner()],['回到街头',()=>this.host.close()]])}
 }
 finish(outcome){if(this.s.stage!=='offer'||this.s.outcome)return;
  this.s.outcome=outcome;this.save.money+=outcome==='live'?500:1200;
  if(outcome==='sponsor'&&!this.save.owned.includes('lagoon'))this.save.owned.push('lagoon');
  this.api.chime();this.next('done',outcome==='live'?'午夜暗频 · 完　／　FM 98.4 正在播放玛拉的现场原声　＋$500':'午夜暗频 · 完　／　雷蒙接手午夜档，获得薄荷涂装　＋$1,200');
 }
 update(dt,dialogue){
  const {s,set,sim,host}=this,p=sim.pos,t=host.clock;
  sim.world.venues.setLoadingDoor(s.pass);sim.walkScale=s.stage==='haul'?.7:1;
  set.amp.visible=['crew','haul'].includes(s.stage);set.pass.visible=s.stage==='card';set.bag.visible=s.bag==='looking';set.photo.visible=s.bag==='returned';
  set.crate.visible=['idle','carrying'].includes(s.vinyl);set.beacon.scale.setScalar(.91+.17*Math.sin(t*3));set.beacon.material.color.setHex(s.outcome==='live'?0x95edcf:0xff847d);
  const carry=(obj,side)=>{obj.rotation.y=p.a;const back=sim.inCar?(sim.carSpec.cargoBack??1.45):.09;obj.position.set(p.x+side*Math.cos(p.a)+back*Math.sin(p.a),sim.inCar?(sim.car.userData.model===2?2.48:sim.carSpec.cargoHeight??.99):.49,p.z-side*Math.sin(p.a)+back*Math.cos(p.a))};
  if(s.stage==='haul')carry(set.amp,.35);else set.amp.position.set(65,.2,-90.7);
  if(s.vinyl==='carrying')carry(set.crate,-.37);else set.crate.position.set(recordStall.x-1.53,1.29,recordStall.z+.08);
  for(const [id,a] of Object.entries(set.actors)){
   a.visible=distance(p,a.position)<77&&(id!=='ramon'||['offer','done'].includes(s.stage));
   if(a.visible&&a.userData.far){personDetail(a,distance(p,a.position)<17||host.talk?.who===id);animatePerson(a,t*2,.04)}
  }
  if(this.unlocked&&['dial','offer','done'].includes(s.stage)&&!host.farewell){host.cast.mara.position.set(s.outcome==='sponsor'?144.9:183.1,s.outcome==='sponsor'?.22:.355,s.outcome==='sponsor'?54.2:-127.1)}
  if(s.outcome==='live'&&set.actors.tito.visible)set.actors.tito.userData.arms[0].rotation.x=.8+.16*Math.sin(t*3);
  if(dialogue)this.tickTuner(dt);
 }
}
export {titles as midnightTitles,people as midnightSpeakers};
