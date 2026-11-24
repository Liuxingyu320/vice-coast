import * as T from 'three';
import {makePerson,animatePerson,personDetail} from './people.js';
import {shadow} from './models.js';
import {MidnightDistrict,midnightTitles,midnightSpeakers} from './midnight.js';
import {routes} from './ledger-state.js';
import {streetVoices} from './street-catalog.js';

const point=(x,z,label)=>({x,z,label,type:'chapter'});
const places={
 intro:point(144.9,54.2,'找唱片店门口的玛拉'),sleeve:point(134.7,51.6,'进唱片店，看柜台上的首版封套'),
 ride:point(65.4,-108.1,'和玛拉去火烈鸟俱乐部后院'),deal:point(52,-122,'找卡洛斯谈条件'),
 mix:point(42.1,-130.2,'到调音台找玛拉'),stand:point(43,-123.6,'走上舞台，使用立麦'),
 board:point(56.5,-110,'侧台灯光台'),case:point(48,-118.4,'到长桌取回母带箱'),escape:point(65.4,-108.1,'带玛拉离开，或找门房核对封套'),
 return:point(178,-127,'到日落码头找老维克'),farewell:point(178,-127,'和老维克告别'),shop:point(139.4,52.35,'回访海浪唱片'),club:point(65.4,-108.1,'回访火烈鸟后院')
};
const names={mara:['玛拉','MARA SOTO  /  录音师'],vic:['老维克','VIC RIVERA  /  海浪唱片'],carlos:['卡洛斯','CARLOS VEGA  /  俱乐部经理'],door:['妮娜','NINA CRUZ  /  看场人'],mic:['里科','RICO  /  舞台立麦'],sleeve:['首版封套','WAVE RECORDS  /  ARCHIVE 02'],case:['母带箱','MASTER REEL  /  02'],board:['灯光台','LIGHTING DESK  /  FLAMINGO']};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function prop(group,size,mat,x,y,z){const mesh=new T.Mesh(new T.BoxGeometry(...size),new T.MeshStandardMaterial({color:mat,roughness:.64}));mesh.position.set(x,y,z);group.add(mesh);return mesh}
function equipment(scene){
 const bag=new T.Group();scene.add(bag);prop(bag,[.77,.46,.26],0x314c51,0,.25,0);
 for(const x of [-.30,.30])prop(bag,[.052,.48,.27],0xc1ac83,x,.25,0);
 for(const x of [-.12,.12])prop(bag,[.035,.10,.045],0xc1ac83,x,.52,0);
 prop(bag,[.26,.035,.045],0x392e39,0,.58,0);prop(bag,[.23,.085,.018],0xffcd85,.08,.28,-.14);
 const mic=new T.Group();mic.position.set(43,.53,-123.6);scene.add(mic);
 prop(mic,[.44,.06,.39],0x373541,0,.04,0);prop(mic,[.045,1.32,.045],0xa7b4b6,0,.71,0);prop(mic,[.085,.085,.31],0x292b35,0,1.43,-.07);
 const sleeve=new T.Group();scene.add(sleeve);sleeve.position.set(134.7,1.45,50.45);sleeve.rotation.x=-.46;prop(sleeve,[.72,.72,.045],0x244c52,0,0,0);
 const ring=new T.Mesh(new T.TorusGeometry(.205,.016,8,40),new T.MeshBasicMaterial({color:0xf9b387}));ring.position.set(.033,.06,.029);sleeve.add(ring);
 for(let i=0;i<4;i++)prop(sleeve,[.46-i*.065,.014,.019],0xf0c6a0,0,-.20-i*.028,.026);
 const board=new T.Group();board.position.set(56.5,.24,-110);scene.add(board);
 prop(board,[.91,.09,.63],0x47605f,0,1.03,0);for(const side of [-.35,.35])prop(board,[.06,.96,.08],0x42434a,side,.53,0);
 for(let i=0;i<5;i++){prop(board,[.08,.033,.34],0x292837,-.26+i*.113,1.09,0);prop(board,[.092,.045,.058],i===4?0xf0a569:0xa8c6bb,-.26+i*.113,1.124,.09*Math.sin(i))}
 return {bag,mic,sleeve,board};
}
export class LedgerChapter{
 constructor(sim,save,api){
  this.sim=sim;this.save=save;this.s=save.chapter;this.api=api;this.cast={};this.guests=[];this.farewell=this.s.stage==='done'&&distance(sim.pos,places.return)<28;this.clock=0;this.talk=null;this.mixer=null;this.sequence=0;this.lastStage='';this.blackout=0;this.cameraBlend=0;
  const add=(role,x,z,a,seed=0)=>{const p=makePerson(role,seed);p.position.set(x,.22,z);p.rotation.y=a;shadow(p,1.03,.76);sim.scene.add(p);return p};
  this.cast.mara=add('mara',144.9,54.2,-1.36);this.cast.vic=add('vic',139.4,52.35,-1.75);this.cast.carlos=add('carlos',52,-122,-1);
  this.cast.door=add('civilian',65.4,-108.1,2.5,2);this.cast.mic=sim.hero;
  for(const [i,[x,z]] of [[54,-115],[50,-126],[46,-112],[57,-121],[59,-127],[46,-135],[54,-107]].entries())this.guests.push({p:add('civilian',x,z,i+.4,i+2),x,z,i});
  const amber=new T.MeshBasicMaterial({color:0xffbd57}),screen=new T.MeshBasicMaterial({color:0xd4f9ff});
  const beamMat=new T.MeshBasicMaterial({color:0xcce8ff,transparent:true,opacity:.145,depthWrite:false,side:T.DoubleSide});
  this.crew=[[62,-116],[46,-109]].map(([x,z],i)=>{
   const p=add('civilian',x,z,0,i?3:0);prop(p,[.27,.085,.22],0x324351,0,1.76,0);
   const indicator=new T.Mesh(new T.OctahedronGeometry(.12),amber);indicator.position.y=2.25;p.add(indicator);
   const light=new T.Mesh(new T.ConeGeometry(.31,1.95,12,1,true),beamMat);light.rotation.x=Math.PI*.55;light.position.set(.24,.98,-1.05);p.add(light);return {p,x,z,i,indicator,light};
  });
  for(const {p,i} of this.guests){const phone=new T.Mesh(new T.BoxGeometry(.083,.146,.014),screen);p.userData.elbows[0].add(phone);phone.position.set(0,-.22,-.061);p.userData.phone=phone}
  this.props=equipment(sim.scene);shadow(sim.hero,1.09,.78);
  this.keyLight=new T.DirectionalLight(0xffddc4,1.1);this.keyLight.visible=false;sim.scene.add(this.keyLight,this.keyLight.target);this.rim=new T.DirectionalLight(0x82efed,1.7);this.rim.visible=false;sim.scene.add(this.rim,this.rim.target);this.listener=makePerson('rico');sim.scene.add(this.listener);this.listener.visible=false;
  this.clubLight=new T.PointLight(0xff9a78,110,32,1.3);this.clubLight.position.set(48,5,-121);sim.scene.add(this.clubLight);
  this.marker=new T.Mesh(new T.OctahedronGeometry(.23),new T.MeshBasicMaterial({color:0xffd18a}));sim.scene.add(this.marker);
  this.town=new MidnightDistrict(this);
  this.residents=new Map(sim.walkers.filter(n=>streetVoices[n.p.userData.role]).map(n=>[n.p.userData.role,n.p]));
  this.props.deckPress=new T.Object3D();this.props.deckPress.position.set(40.15,1.7,-128.7);
  this.props.frequencyCard=this.town.set.pass;this.props.canvasBag=this.town.set.bag;
  this.props.consoleDesk=new T.Object3D();this.props.consoleDesk.position.set(185,1.28,-129.4);
  this.stageCast(true);
 }
 get carryingMaster(){return ['escape','return'].includes(this.s.stage)}
 get target(){
  const s=this.s;if(!s.active)return null;
  if(s.stage==='party')return places[s.lead];
  if(s.stage==='done')return this.town.target;
  return places[s.stage]??places.intro;
 }
 get journal(){
  const s=this.s;if(s.stage==='done')return s.ending==='return'?'私账已经归还。老维克替你谈妥了车库八折。':'你和玛拉分了现金。火烈鸟俱乐部记住了你的面孔。';
  if(s.stage==='party')return places[s.lead]?.label??'可以找卡洛斯谈、帮玛拉混音，或使用舞台立麦。后院入口旁的灯光台还能试一次黑场。';
  return places[s.stage]?.label??'海景大道的唱片店，还有人等着你。';
 }
 activate(){
  const s=this.s;s.active=true;
  if(s.stage==='new'){
   s.stage='intro';this.sim.setNight(false);
   if(!this.save.fleet&&this.sim.carId===0){this.sim.car.position.set(155.8,.07,62);this.sim.car.rotation.y=0}
   this.sim.placeOnFoot(148.45,54.85,1.52);
  }
  if(s.stage==='escape'&&!this.sim.storyAlert)this.armAlert();
  this.stageCast(true);this.api.persist();
 }
 suspend(){this.s.active=false;if(this.sim.storyAlert)this.sim.clearAlert();this.close();this.stageCast(true)}
 stageCast(force=false){
  const stage=this.s.stage;if(!force&&stage===this.lastStage)return;this.lastStage=stage;
  const m=this.cast.mara,club=['party','case'].includes(stage);
  if(club)m.position.set(42.1,.55,-130.2);
  else if(stage==='done'&&this.farewell)m.position.set(179.45,.355,-127.8);
  else if(stage==='done'||stage==='new'||stage==='intro'||stage==='sleeve')m.position.set(144.9,.21,54.2);
  else if(force||stage==='escape'){const p=this.sim.pos;m.position.set(p.x+1.35,.20,p.z+1.75)}
  const pier=stage==='return'||stage==='done'&&this.farewell;
  this.cast.vic.position.set(pier?178:139.4,pier?.355:.22,pier?-127:52.35);
  this.cast.vic.rotation.y=pier?.4:-1.80;
  this.cast.carlos.rotation.y=-1.1;m.rotation.y=club?-1.17:-1.38;
  if(!this.blackout)this.sim.world.venues.partyMood(true);
 }
 move(stage,line){
  this.close();this.s.stage=stage;this.stageCast();this.api.persist();if(line)this.api.toast(line,5);this.api.refresh();
 }
 close(){if(!this.talk)return;this.talk=null;this.mixer=null;this.town.close();this.keyLight.visible=false;this.rim.visible=false;this.listener.visible=false;this.sim.hero.visible=!this.sim.inCar;this.api.hide();this.sim.resetCamera()}
 say(who,line,choices){
  const same=this.talk?.who===who,open=!this.talk;
  this.talk={who,line,choices};this.api.dialogue(names[who]??midnightSpeakers[who]??streetVoices[who]??({deckPress:['后台唱盘','FLAMINGO / DECK B'],frequencyCard:['调频磁卡','PALM WAVE / ENGINEERING'],canvasBag:['帆布相机包','MAR AZUL / LOST PROPERTY'],consoleDesk:['流动电台','PALM WAVE / REMOTE UNIT']})[who],line,choices);
  if(!same){const cam=this.sim.camera;this.cameraEase=open;this.cameraBlend=open?0:1;this.cameraStart=performance.now();this.origin=cam.position.clone();this.rotation=cam.quaternion.clone();this.initialFov=cam.fov}
  this.camera();
 }
 pick(i){const action=this.talk?.choices[i]?.[1];if(action)action()}
 camera(){
  if(!this.talk)return;
  const who=this.talk.who,sim=this.sim,actor=this.cast[who]??this.town.set.actors[who]??this.residents.get(who),object=actor??this.props[who==='case'?'bag':who];
  const pos=object.position,small=!actor,portrait=sim.camera.aspect<.82;
  let dx=1,dz=.28;
  if(who==='mic'){dx=.56;dz=.83}
  if(who==='sleeve'||who==='board'){dx=.23;dz=1}
  if(who==='case'){dx=.3;dz=1}
  if(actor){if(actor.userData.far)personDetail(actor,true);actor.rotation.y=Math.atan2(-dx,-dz)+.41;actor.visible=true}
  const len=Math.hypot(dx,dz);dx/=len;dz/=len;
  const range=small?(who==='case'?1.95:1.37):portrait?2.15:2.30;
  const eye=pos.y+(small?(who==='case'?.28:who==='board'?1.05:0):1.57);
  const cam=sim.camera,overShoulder=!!actor&&who!=='mic'&&!portrait;
  cam.fov=portrait?49:overShoulder?34:38;cam.updateProjectionMatrix();
  this.listener.visible=overShoulder;sim.hero.visible=who==='mic';
  if(overShoulder){
   const side=-.5,lx=pos.x+dx*1.15+dz*side,ly=pos.y-.17,lz=pos.z+dz*1.15-dx*side;
   this.listener.position.set(lx,ly,lz);this.listener.rotation.y=Math.atan2(dx,dz)-.12;
   if(this.listener.userData.far)personDetail(this.listener,true);
   cam.position.set(lx+dx*.4-dz*.9,ly+1.48,lz+dz*.4+dx*.9);cam.lookAt(pos.x,eye,pos.z);
   actor.rotation.y=Math.atan2(-(cam.position.x-pos.x),-(cam.position.z-pos.z))+.5;
  }else{
   cam.position.set(pos.x+dx*range,eye+(small?.38:.08),pos.z+dz*range);
   const slide=portrait?-.06:-.38;cam.lookAt(pos.x+dz*slide,eye-(small?.11:portrait?.33:.17),pos.z-dx*slide);
  }
  this.keyLight.position.set(pos.x+dx*3+dz*2,eye+2.0,pos.z+dz*3-dx*2);this.keyLight.target.position.set(pos.x,eye,pos.z);this.keyLight.visible=true;
  this.rim.visible=!!actor;this.rim.target.position.copy(this.keyLight.target.position);this.rim.position.set(pos.x-dx*2.2-dz*1.7,eye+1.85,pos.z-dz*2.2+dx*1.7);this.rim.intensity=this.save.night?2.15:.9;
  if(this.cameraBlend<1){const n=this.cameraBlend*this.cameraBlend*(3-2*this.cameraBlend);cam.position.lerp(this.origin,1-n);cam.quaternion.slerp(this.rotation,1-n);cam.fov=this.initialFov+(cam.fov-this.initialFov)*n;cam.updateProjectionMatrix()}
  sim.station.group.visible=false;this.marker.visible=false;
 }
 nearby(){
  const s=this.s,p=this.sim.pos;if(this.sim.inCar)return null;
  let options=[];
  if(!s.active){if(s.stage==='done')options=this.farewell?['farewell','club']:['shop','club'];else if(s.stage==='new'&&this.api.free())options=['intro'];}
  else if(s.stage==='party')options=['deal','mix','stand','board','ride'];
  else if(s.stage==='done')options=this.farewell?['farewell','club']:['shop','club'];else options=[s.stage];
  const reach={farewell:3.8,board:2.65,intro:4.5,sleeve:3.1,ride:4.0,case:2.9,escape:3.9,return:3.8,shop:3.4,club:3.8,deal:3.25,mix:3.1,stand:2.9};
  const adjacent=this.town.nearby();
  const scene=options.map(k=>({k,d:places[k]?distance(p,places[k]):Infinity})).filter(o=>o.d<(reach[o.k]??3)).concat(adjacent).sort((a,b)=>a.d-b.d)[0];
  if(scene)return scene.k;
  if(this.sim.heat||!this.api.free())return null;
  const car=this.sim.nearCar();let nearest=null,range=car?Math.min(2.9,distance(p,car.position)):2.9;
  for(const [key,actor] of this.residents){const d=distance(p,actor.position);if(actor.visible&&d<range){nearest=key;range=d}}
  return nearest;
 }
 prompt(k){if(streetVoices[k])return '和'+streetVoices[k][0]+'聊聊';if(k?.startsWith('mid-'))return midnightTitles[k.slice(4)];return ({farewell:'和老维克告别',board:'操作演出灯光台',intro:'和玛拉交谈',sleeve:'查看首版封套',ride:'询问后院的情况',deal:'和卡洛斯谈谈',mix:'帮玛拉接入调音台',stand:'拿起舞台立麦',case:'打开母带箱',escape:'请妮娜核验封套',return:'把母带交给老维克',shop:'和老维克叙旧',club:'找妮娜打听后院'})[k]}
 action(){
  const k=this.nearby(),s=this.s,leave=['回头再说',()=>this.close()];
  if(k?.startsWith('mid-')){this.town.action(k.slice(4));return}
  if(streetVoices[k]){
   const [, ,line,question,answer]=streetVoices[k],bye=['下次见',()=>this.close()];
   this.say(k,line,[[question,()=>this.say(k,answer,[bye])],bye]);return
  }
  switch(k){
  case 'intro':
   if(!s.active)this.api.start();
   this.say('mara','你听。橱窗里放的是我十七岁那晚的首演。卡洛斯扣了原带，说明天要把整段掌声剪掉。没有那一下，我妈的口哨也没了。',[
    ['老维克怎么说？',()=>this.say('vic','那晚上全街停电，我从车上拆了块电池给她录完。原带箱里还压着乐手的账。你在我这沙发上睡过三个月，里科。这次帮我把他们的名字带回来。',[
     ['接下这桩事',()=>this.move('sleeve','老维克指了指柜台上的蓝绿色封套。')],leave])],leave]);break;
  case 'sleeve':
   this.say('sleeve','A 面　《退潮以后》　玛拉现场录音。标签上的“火烈鸟首演”被一支红笔划去了。',[
    ['翻到有签名的 B 面',()=>{s.clue=true;this.api.persist();this.say('sleeve','B 面　“首演在海浪唱片，给替我们拉来电池的维克。”下方有玛拉和卡洛斯两个人的签名。',[
     ['收好封套，去俱乐部',()=>this.move('ride','玛拉跟上了你。你们可以步行，也可以坐街边的车。')]])}],['只记下地址，出发',()=>this.move('ride','火烈鸟俱乐部在霓虹中心。玛拉跟上了你。')]]);break;
  case 'ride':
   this.say('door','卡洛斯在舞池边，玛拉的台子在左后方。台上那支立麦也开着。今晚谁说的话，全场都听得见。',Object.entries(routes).map(([key,label])=>[label,()=>{s.lead=key;this.sim.setNight(true);this.move('party','选定了方向。走进后院后仍可改主意。')} ]));break;
  case 'board':
   this.say('board','黑场提示灯还亮着。这是玛拉为最后一首歌准备的舞台效果，十余秒后灯光会自动回场。',[
    ['按下黑场键',()=>{this.close();this.blackout=14;this.sim.world.venues.partyMood(false);this.api.chime();this.api.toast('后院黑场 · 灯光师亮起手电，观众纷纷举起手机。',4)}],['回到舞池',()=>this.close()]]);break;
  case 'deal':
   this.say('carlos','首演场地写我的名字，这箱带子你现在就能拿走。你有比我手里那份节目单更早的东西？',[
    [s.clue?'给他看两个人的签名':'让玛拉当面作证',()=>this.say('carlos',s.clue?'……这字真是我签的。把封套收起来。我给老维克留一份原版。':'她还记得停电那晚？我欠她一个署名。你拿带子，今晚的演出照常。',[['握手成交',()=>this.resolve('deal')]])],
    ['去听听玛拉的办法',()=>{s.lead='mix';this.close();this.api.persist()}],leave]);break;
  case 'mix':
   this.say('mara','箱子的编号只有老维克知道。我把原版的三个鼓点送进返听。等指针落进金色区域，帮我把每个鼓点推上去。',[
    ['接过推子',()=>this.startMix()],leave]);break;
  case 'stand':
   this.say('mic','麦克风还热着。鼓手放下了刷子，第一排向你转过身来。',[
    ['当众点名，把乐手请上台',()=>this.say('carlos','行，大家都在听。母带和账本放在长桌上。里科，今晚收场的时候你最好还记得自己说了什么。',[['让全场见证交接',()=>this.resolve('stand')]])],leave]);break;
  case 'case':
   this.say('case','两盘原带，一本软皮账簿。夹层比看起来厚，你扣上搭扣，门口的对讲机随即响了。',[
    ['拿上母带，带玛拉离开',()=>{this.move('escape');this.armAlert();this.api.toast(this.broadcast(),6)}]]);break;
  case 'escape':
   this.say('door','先停一下。对讲机说有一箱母带被带离现场。给我看盒子上的编号，我可以当面和唱片店核对。',[
    ['让老维克接电话',()=>{this.sim.clearAlert();this.move('return','妮娜放下对讲机。老维克在日落码头等你们。')}],leave]);break;
  case 'return':
   this.say('vic','带子还在。等一下……这七百块是上周乐手的尾款。账本上有数，信封上没有名字。里科，你来分。',[
    ['把私账归还乐手　＋$400',()=>this.finish('return')],['和玛拉留下现金　＋$1,100',()=>this.finish('keep')],['再想想',()=>this.close()]]);break;
  case 'farewell':
   this.say('vic',s.ending==='return'?'明早开门前，我会把每个信封都放到乐手手里。里科，你那张靠窗的沙发还在。':'明早开门，鼓手会来找我。里科，今晚剩下的事我自己处理。',[['回到街头',()=>this.close()]]);break;
  case 'shop':case 'club':{
   const honest=s.ending==='return',shop=k==='shop';
   this.say(shop?'vic':'door',shop?(honest?'鼓手一早来拿了那份钱。车库知道你的名字了，喷漆、改装都按八折算。':'账本回来了，信封却是空的。那张你最爱的首版，我先从橱窗撤下了。'):(honest?'后院今天对你敞着。玛拉的新盘首发，给你留了个位子。':'卡洛斯把你的名字写进了谢绝入场名单。今晚后院不招待你。'),[
    ['记下这件事',()=>{if((honest&&shop)||(!honest&&!shop))s.visited=true;this.close();this.api.persist();this.api.refresh()}]]);break}
  }
 }
 startMix(){
  this.say('mara','听我的拍子。指针进金色区时，按下推子。', [['压下推子',()=>this.beat()],['放下耳机',()=>this.close()]]);
  this.mixer={phase:0,hits:0,locked:false};this.api.meter(0,0,'等第一拍');
 }
 beat(){
  const m=this.mixer;if(!m)return;
  if(m.locked){this.api.meter(m.phase,m.hits,'接住了。等下一拍');return}
  if(m.phase>=.36&&m.phase<=.78){m.hits++;m.locked=true;this.api.chime();if(m.hits===3){this.resolve('mix');return}}
  this.api.meter(m.phase,m.hits,m.locked?'接住了。等下一拍':'差一点，再听一拍');
 }
 resolve(route){this.s.route=route;this.move('case',({deal:'卡洛斯和你握手。宾客让开了通向长桌的路。',mix:'三段鼓点合在一起，宾客涌向舞台。玛拉认出了原带。',stand:'现场安静下来，宾客举起手机记录交接。'})[route])}
 armAlert(){const n=this.s.route==='stand'?2:1;this.sim.beginAlert(n,this.s.route==='stand'?74:83,-111);this.custody=this.sim.custody}
 broadcast(){
  if(this.town.s.outcome)return this.town.s.outcome==='live'?'FM 98.4　玛拉《退潮以后》 · 日落码头现场':'FM 98.4　雷蒙呈献 · 海岸午夜购物台';
  const text=this.s.stage==='done'?(this.s.ending==='return'?'海浪唱片今夜把酬劳逐一送还乐手。':'火烈鸟称一笔演出款项下落不明。'):({deal:'火烈鸟宣布重新标注首演场地。',mix:'听众刚刚认出了玛拉失传的三个鼓点。',stand:'听众发来一段后院公开交接的现场录音。'})[this.s.route];
  return (this.save.radio?'FM 98.6　':'街区传闻　')+(text??'海浪唱片今天营业。');
 }
 finish(ending){
  if(this.s.stage!=='return')return;
  this.farewell=true;this.s.ending=ending;this.save.money+=ending==='return'?400:1100;this.api.chime();
  this.move('done',ending==='return'?'海浪账本 · 完　＋$400　／　熟人车库永久八折':'海浪账本 · 完　＋$1,100　／　火烈鸟将你列入黑名单');
 }
 update(dt,dialogue=false){
  const sim=this.sim,s=this.s,p=sim.pos;this.clock+=dt;const t=this.clock;
  if(this.farewell&&distance(p,places.return)>29){this.farewell=false;this.stageCast(true)}
  this.props.sleeve.visible=s.ending!=='keep';
  const follow=s.active&&['ride','escape','return'].includes(s.stage),m=this.cast.mara;
  m.visible=!follow||!sim.inCar;
  let moving=0;
  if(follow&&!sim.inCar&&!dialogue){
   const tx=p.x+Math.sin(p.a+.58)*1.6,tz=p.z+Math.cos(p.a+.58)*1.6,dx=tx-m.position.x,dz=tz-m.position.z,d=Math.hypot(dx,dz);
   if(d>22){m.position.set(tx,.2,tz)}else if(d>.62){const f=Math.min(1,dt*(d>4?8:4.1)/d);if(!sim.blocked(m.position.x+dx*f,m.position.z,.22,false))m.position.x+=dx*f;if(!sim.blocked(m.position.x,m.position.z+dz*f,.22,false))m.position.z+=dz*f;m.rotation.y=Math.atan2(-dx,-dz);moving=.8}
  }
  if(s.active&&s.stage==='ride'&&sim.inCar&&!s.carLine){s.carLine=true;const lines=['这辆马林的低音可真沉。','这辆索拉诺的音箱还是原装的。','转播车里的监听还在。'];this.api.toast('玛拉　“'+(lines[sim.car.userData.model]??'坐这辆'+sim.carName()+'去正好。')+'到了后院让我先听一耳朵。”',6);this.api.persist()}
  const party=s.stage==='party'||s.stage==='case'||s.stage==='escape';
  const reaction=['case','escape'].includes(s.stage)?s.route:null;
  const dark=this.blackout>0;
  if(dark){this.blackout=Math.max(0,this.blackout-dt);if(!this.blackout)this.sim.world.venues.partyMood(true)}
  for(const {p:g,x,z,i,light,indicator} of this.crew){
   g.visible=distance(p,g.position)<68;if(!g.visible)continue;
   const tx=dark?56+(i?1:-1)*1.5:x,tz=dark?-108.2:z,dx=tx-g.position.x,dz=tz-g.position.z,dd=Math.hypot(dx,dz);
   const f=Math.min(1,dt*2.6/Math.max(.01,dd));g.position.x+=dx*f;g.position.z+=dz*f;personDetail(g,distance(p,g.position)<17||dark);if(dd>.2)g.rotation.y=Math.atan2(-dx,-dz);
   animatePerson(g,t*6+i,dd>.2?.65:.035);light.visible=indicator.visible=dark
  }
  this.clubLight.color.setHex(reaction==='mix'?0x62f4ce:reaction==='stand'?0xff7678:0xffc294);
  this.clubLight.intensity=dark?0:(reaction==='mix'?140+48*Math.sin(t*5):105);
  for(const [role,actor] of Object.entries(this.cast)){
   if(role==='mic')continue;actor.visible=(role!=='mara'||!follow||!sim.inCar)&&distance(actor.position,p)<92;
   if(actor.visible){personDetail(actor,distance(p,actor.position)<18||this.talk?.who===role);animatePerson(actor,t*(moving&&role==='mara'?7:2.4),role==='mara'&&moving?moving:.025);actor.userData.head.rotation.y=.075*Math.sin(t*.8+role.length)}
  }
  for(const {p:g,x,z,i} of this.guests){
   g.visible=distance(p,g.position)<78;if(!g.visible)continue;
   personDetail(g,distance(p,g.position)<17||dark);
   const tx=dark&&i%2?63-i*.3:reaction==='mix'?43+(x-43)*.56:reaction==='deal'?x+2.2:x,tz=reaction==='mix'?-128+(z+128)*.55:z;
   g.position.x+=(tx-g.position.x)*Math.min(1,dt*1.2);g.position.z+=(tz-g.position.z)*Math.min(1,dt*1.2);
   g.rotation.y=reaction==='stand'?Math.atan2(g.position.x-43,g.position.z+123.6):i+.32*Math.sin(t*.4+i);
   animatePerson(g,t*(reaction==='mix'?6:3)+i,party?.19:.06);
   const phone=(dark&&i%2===0)||reaction==='stand';
   g.userData.phone.visible=phone;
   if(phone){g.userData.arms[0].rotation.x=1.08;g.userData.elbows[0].rotation.x=.80}
   if(dark&&!phone)animatePerson(g,t*6+i,Math.abs(tx-g.position.x)>.4?.65:.02);
   g.userData.arms[0].rotation.z=-.12;
   g.userData.torso.position.y+=party&&!dark&&reaction!=='stand'?.035*Math.sin(t*4+i):0;
  }
  const bag=this.props.bag;
  if(this.carryingMaster){bag.visible=true;const a=p.a;
   if(sim.inCar){const back=sim.carSpec.cargoBack??1.66;bag.position.set(p.x+back*Math.sin(a),sim.carSpec.cargoHeight??.99,p.z+back*Math.cos(a))}
   else{bag.position.set(p.x+.31*Math.cos(a),sim.hero.position.y+.15,p.z-.31*Math.sin(a))}bag.rotation.y=a}
  else{bag.visible=['party','case'].includes(s.stage);bag.position.set(48,1.28,-119.88);bag.rotation.y=.28}
  if(!dialogue&&s.active&&s.stage==='escape'&&!sim.heat){
   if(sim.custody!==this.custody){sim.clearAlert();s.route=null;sim.placeOnFoot(70.25,-113.8,1.53);this.move('party','玛拉替你保住了封套。回到后院入口，换个办法再试。')}
   else{sim.clearAlert();this.move('return','警戒解除。带母带去码头见老维克。')}
  }
  if(s.ending==='keep'&&!sim.inCar&&p.x<68.1&&p.x>66.9&&p.z>-117&&p.z<-109){sim.placeOnFoot(70,-113.8,-1.57);this.api.toast('妮娜拦住了你。火烈鸟后院谢绝入场。')}
  this.town.update(dt,dialogue);
  const goal=this.target;this.marker.visible=!!goal&&!dialogue&&distance(p,goal)<55&&distance(p,goal)>3.1;
  if(this.marker.visible){this.marker.position.set(goal.x,2.65+.10*Math.sin(t*3),goal.z);this.marker.rotation.y=t*1.4}
  if(dialogue&&this.mixer){const m=this.mixer;const phase=(m.phase+dt*.78)%1;if(phase<m.phase)m.locked=false;if(phase>=.36&&m.phase<.36)this.api.cue();m.phase=phase;this.api.meter(phase,m.hits)}
  const zone=sim.inCar||this.mixer?null:distance(p,places.case)<29&&!dark?'club':distance(p,places.sleeve)<17?'shop':null;
  this.api.venue(zone);
  if(dialogue&&this.talk){if(this.cameraEase)this.cameraBlend=Math.min(1,(performance.now()-this.cameraStart)/380);this.camera();}
 }
}
