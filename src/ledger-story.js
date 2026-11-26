import {routes} from './ledger-state.js';
import {streetVoices} from './street-catalog.js';
import {midnightTitles} from './midnight.js';

export const ledgerSpeakers={mara:['玛拉','MARA SOTO  /  录音师'],vic:['老维克','VIC RIVERA  /  波音唱片'],carlos:['卡洛斯','CARLOS VEGA  /  俱乐部经理'],door:['妮娜','NINA CRUZ  /  看场人'],mic:['里科','RICO  /  舞台立麦'],sleeve:['首版封套','WAVE RECORDS  /  ARCHIVE 02'],case:['母带箱','MASTER REEL  /  02'],board:['灯光台','LIGHTING DESK  /  FLAMINGO']};

// The original game's chapter choices, rewards and rhythm interactions are shared by both districts.
export class LedgerStory {
 pick(i){const action=this.talk?.choices[i]?.[1];if(action)action()}
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
    ['翻到有签名的 B 面',()=>{s.clue=true;this.api.persist();this.say('sleeve','B 面　“首演在波音唱片，给替我们拉来电池的维克。”下方有玛拉和卡洛斯两个人的签名。',[
     ['收好封套，去俱乐部',()=>this.move('ride','玛拉跟上了你。你们可以步行，也可以坐街边的车。')]])}],['只记下地址，出发',()=>this.move('ride','火烈鸟俱乐部在新桥商区。玛拉跟上了你。')]]);break;
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
    ['让老维克接电话',()=>{this.sim.clearAlert();this.move('return','妮娜放下对讲机。老维克在潮见码头等你们。')}],leave]);break;
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
  const m=this.mixer;if(!m||m.locked)return;
  if(m.phase>=.36&&m.phase<=.78){m.hits++;m.locked=true;this.api.chime();if(m.hits===3){this.resolve('mix');return}}
  this.api.meter(m.phase,m.hits,m.locked?'接住了。等下一拍':'差一点，再听一拍');
 }
 resolve(route){this.s.route=route;this.move('case',({deal:'卡洛斯和你握手。宾客让开了通向长桌的路。',mix:'三段鼓点合在一起，宾客涌向舞台。玛拉认出了原带。',stand:'现场安静下来，宾客举起手机记录交接。'})[route])}
 broadcast(){
  if(this.town.s.outcome)return this.town.s.outcome==='live'?'FM 98.4　玛拉《退潮以后》 · 潮见码头现场':'FM 98.4　雷蒙呈献 · 海岸午夜购物台';
  const text=this.s.stage==='done'?(this.s.ending==='return'?'波音唱片今夜把酬劳逐一送还乐手。':'火烈鸟称一笔演出款项下落不明。'):({deal:'火烈鸟宣布重新标注首演场地。',mix:'听众刚刚认出了玛拉失传的三个鼓点。',stand:'听众发来一段后院公开交接的现场录音。'})[this.s.route];
  return (this.save.radio?'FM 98.6　':'街区传闻　')+(text??'波音唱片今天营业。');
 }
 finish(ending){
  if(this.s.stage!=='return')return;
  this.farewell=true;this.s.ending=ending;this.save.money+=ending==='return'?400:1100;this.api.chime();
  this.move('done',ending==='return'?'海浪账本 · 完　＋$400　／　熟人车库永久八折':'海浪账本 · 完　＋$1,100　／　火烈鸟将你列入黑名单');
 }
}
