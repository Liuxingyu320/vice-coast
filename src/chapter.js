import * as T from 'three';
import {makePerson,animatePerson,personDetail} from './people.js';
import {shadow} from './models.js';
import {streetVoices} from './street-catalog.js';

// 金额按早期跑腿占位。暗号已定为「卷帘闭了」。
const DEPOSIT=200,PAY=500,CODE='卷帘闭了';
const point=(x,z)=>({x,z,type:'chapter'});
const spot={
 stall:point(-68.5,106),
 door:point(148.6,52),
 pay:point(171.3,-36),
 shop:point(-62,118),drop:point(-148,96),fight:point(-68,16),alley:point(-58,22)
};
const goals={
 stall:['到夜市档口',spot.stall],deposit:['听侧面的人把话说完',spot.stall],
 door:['到商店里的卷帘门',spot.door],pay:['到偏开商店的地方领尾款',spot.pay],
 again:['再到商店里的卷帘门',spot.door],againPay:['再到偏开的地方领尾款',spot.pay],
 note:['再到偏开的地方取钱',spot.pay],shop:['去夜市边上的小店',spot.shop],
 drop:['把保险箱放到纸条上的地址',spot.drop],wait:['到偏开的老地方等下一单',spot.pay],
 fight:['到街上找到派活的人',spot.fight],alley:['把纸条交给牛子',spot.alley]
};
const names={
 aside:['旁白','工资'],jiahao:['嘉豪','玩家'],boss:['老板','夜市档口'],guest:['客人','夜市档口'],
 stranger:['神秘人','不留名'],door:['门后','老街卷帘门'],payer:['取钱的人','路口'],
 fresh:['取钱的人','生脸'],niuzi:['牛子','']
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function box(parent,size,color,x,y,z){
 const mesh=new T.Mesh(new T.BoxGeometry(...size),new T.MeshStandardMaterial({color,roughness:.58}));
 mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function glasses(head){
 const mat=new T.MeshStandardMaterial({color:0x141414,roughness:.18,metalness:.35});
 const frame=new T.Group();
 frame.position.set(0,1.647,-.142);
 for(const x of [-.04,.04]){const lens=new T.Mesh(new T.BoxGeometry(.055,.026,.008),mat);lens.position.set(x,0,0);frame.add(lens)}
 const bridge=new T.Mesh(new T.BoxGeometry(.018,.007,.008),mat);frame.add(bridge);
 (head.getObjectByName('rico_head_surface')??head).add(frame);
}
export class LedgerChapter{
 constructor(sim,save,api){
  this.sim=sim;this.save=save;this.s=save.chapter;this.api=api;this.talk=null;this.focus=null;this.clock=0;this.cameraBlend=1;
  const add=(role,x,z,a,seed=0)=>{const p=makePerson(role,seed);p.position.set(x,.14,z);p.rotation.y=a;shadow(p,1.03,.76);sim.scene.add(p);return p};
  this.cast={
   boss:add('civilian',-69.4,105.2,-.4,1),guest:add('civilian',-67.6,105.6,2.4,4),
   stranger:add('civilian',-66.2,103.4,2.2,8),payer:add('civilian',-67.2,67.4,1.2,3),
   fresh:add('civilian',-67.2,67.4,.8,11)
  };
  this.fighters=[[-71,18],[-64,14],[-66,20]].map(([x,z],i)=>{const p=add('civilian',x,z,i,i+6);p.userData.home={x,z};return p});
  if(sim.hero?.userData?.head)glasses(sim.hero.userData.head);
  const shutter=new T.Group();sim.scene.add(shutter);shutter.position.set(spot.door.x+3.4,.14,spot.door.z);
  box(shutter,[2.4,2.6,.12],0x6d5c4a,0,1.3,0);box(shutter,[2.5,.12,2.2],0x3e342c,0,2.55,0);
  const safe=new T.Group();sim.scene.add(safe);
  box(safe,[.46,.32,.34],0x8a9298,0,.2,0);box(safe,[.12,.08,.02],0x23262b,0,.22,.18);
  this.props={shutter,safe};
  this.marker=new T.Mesh(new T.OctahedronGeometry(.23),new T.MeshBasicMaterial({color:0xffd18a}));sim.scene.add(this.marker);
  this.residents=new Map(sim.walkers.filter(n=>streetVoices[n.p.userData.role]).map(n=>[n.p.userData.role,n]));
  this.layout();
 }
 get carrying(){return this.s.stage==='drop'}
 get target(){
  if(!this.s.active)return null;
  const goal=goals[this.s.stage];if(!goal)return null;
  return {...goal[1],label:goal[0],type:'chapter'};
 }
 get journal(){
  const goal=goals[this.s.stage];
  if(this.s.stage==='done')return '嘉豪正式跟着牛子干。他还是没有房子。钱还在身上。';
  return goal?goal[0]:'夜市档口还有人在谈价。';
 }
 place(actor,x,z,a,lie=false){
  const y=this.sim.footHeight(x,z);
  actor.position.set(x,lie?y+.08:y,z);
  actor.rotation.set(lie?1.25:0,a,0);
  actor.visible=true;
 }
 layout(){
  const s=this.s.stage,early=s==='stall'||s==='deposit';
  this.cast.boss.visible=this.cast.guest.visible=early;
  const showStranger=s==='deposit'||s==='fight'||s==='alley';
  this.cast.stranger.visible=showStranger;
  if(s==='deposit')this.place(this.cast.stranger,-66.2,103.4,2.2);
  if(s==='fight')this.place(this.cast.stranger,spot.fight.x,spot.fight.z,.6,true);
  if(s==='alley')this.place(this.cast.stranger,spot.alley.x,spot.alley.z,-1.2);
  const paying=s==='pay'||s==='againPay';
  this.cast.payer.visible=paying;
  if(paying)this.place(this.cast.payer,spot.pay.x,spot.pay.z,-.4);
  this.cast.fresh.visible=s==='note';
  if(s==='note')this.place(this.cast.fresh,spot.pay.x+.8,spot.pay.z,.6);
  for(const p of this.fighters){
   p.visible=s==='fight';
   if(p.visible)this.place(p,p.userData.home.x,p.userData.home.z,1);
  }
  const held=s==='drop',left=this.s.dropped||['wait','fight','alley','done'].includes(s);
  this.props.safe.visible=s==='shop'||held||left;
  if(s==='shop'){this.props.safe.position.set(spot.shop.x,this.sim.footHeight(spot.shop.x,spot.shop.z)+.55,spot.shop.z);this.props.safe.rotation.y=.2}
  if(left){this.props.safe.position.set(spot.drop.x,this.sim.footHeight(spot.drop.x,spot.drop.z)+.16,spot.drop.z);this.props.safe.rotation.y=.4}
 }
 activate(){
  const s=this.s;s.active=true;
  if(s.stage==='new'){
   s.stage='stall';this.sim.setNight(true);
   this.sim.placeOnFoot(-67.4,107.2,2.4);
  }
  this.layout();this.api.persist();
 }
 suspend(){this.s.active=false;this.close();this.layout()}
 move(stage){this.close();this.s.stage=stage;this.layout();this.api.persist();this.api.refresh()}
 gain(amount){this.save.money+=amount;this.api.chime();this.api.persist()}
 close(){if(!this.talk)return;this.talk=null;this.focus=null;this.sim.hero.visible=!this.sim.inCar;this.api.hide();this.sim.resetCamera();this.api.refresh()}
 say(who,line,choices,tone){
  const prev=this.talk?.who,first=!this.talk,switched=who!==prev;
  this.talk={who,line,choices};
  if(tone)this.api.bark(tone);
  this.api.dialogue(names[who]??streetVoices[who]??['路人','街头'],line,choices);
  const cam=this.sim.camera;
  if(first||switched){this.cameraEase=true;this.cameraBlend=0;this.cameraStart=performance.now();this.origin=cam.position.clone();this.rotation=cam.quaternion.clone();this.initialFov=cam.fov}
  this.camera();
 }
 chatPool(){
  const s=this.s.stage;
  if(['wait','fight','alley'].includes(s))return 'tight';
  if(['note','shop','drop'].includes(s))return 'tight';
  if(['door','again','pay','againPay'].includes(s))return 'hush';
  return 'street';
 }
 pick(i){const action=this.talk?.choices[i]?.[1];if(action)action()}
 actor(who){if(who==='niuzi')return this.cast.stranger;return this.cast[who]??this.residents.get(who)?.p??null}
 prop(who){if(who==='door')return this.props.shutter;if(who==='safe')return this.props.safe;return this.focus}
 camera(){
  if(!this.talk)return;
  const who=this.talk.who,sim=this.sim,cam=sim.camera;
  const talkingToProp=who==='jiahao'&&this.focus&&!this.focus.userData?.head;
  const speaker=talkingToProp?null:who==='jiahao'?sim.hero:who==='aside'?null:this.actor(who);
  const target=talkingToProp?this.focus.position.clone().setY(this.focus.position.y+1.35):this.eyeOf(speaker)??(who==='aside'&&this.focus?.userData?.head?this.eyeOf(this.focus):null)??this.propPoint(who);
  const listener=who==='aside'?null:(who==='jiahao'&&this.focus?.userData?.head?this.focus:sim.hero);
  const shoulder=listener&&!sim.inCar?this.eyeOf(listener):null;
  const portrait=cam.aspect<.82;
  if(speaker?.userData?.far)personDetail(speaker,true);
  if(listener?.userData?.far)personDetail(listener,true);
  let pos,fov,look=target;
  if(shoulder&&target){
   const back=shoulder.clone().sub(target);if(back.lengthSq()<.2)back.set(0,0,1);back.y=0;back.normalize();
   const side=new T.Vector3(back.z,0,-back.x);
   pos=shoulder.clone().addScaledVector(back,1.55).addScaledVector(side,.62);pos.y=shoulder.y+.18;
   fov=portrait?42:34;
   this.face(speaker,shoulder);this.face(listener,target);
  }else{
   const base=target??this.props.shutter.position.clone().setY(1.4);
   look=base;
   pos=base.clone().add(new T.Vector3(1.15,.28,1.55));
   fov=portrait?46:40;
   if(speaker)this.face(speaker,pos);
  }
  cam.fov=fov;cam.updateProjectionMatrix();
  cam.position.copy(pos);cam.lookAt(look);
  const desired=cam.quaternion.clone(),desiredFov=fov;
  if(this.cameraBlend<1){
   const n=this.cameraBlend*this.cameraBlend*(3-2*this.cameraBlend);
   cam.position.lerp(this.origin,1-n);cam.quaternion.copy(this.rotation).slerp(desired,n);
   cam.fov=this.initialFov+(desiredFov-this.initialFov)*n;cam.updateProjectionMatrix();
  }
  this.marker.visible=false;sim.hero.visible=!sim.inCar;
 }
 eyeOf(actor){
  if(!actor)return null;
  const v=new T.Vector3();
  if(actor.userData?.head){actor.updateWorldMatrix(true,true);actor.userData.head.getWorldPosition(v);v.y+=.16;return v}
  return actor.position.clone().setY(actor.position.y+1.55);
 }
 propPoint(who){
  const prop=who==='door'?this.props.shutter:who==='safe'?this.props.safe:this.focus;
  if(!prop?.position)return null;
  return prop.position.clone().setY(prop.position.y+1.35);
 }
 face(actor,point){
  if(!actor?.position||!point)return;
  actor.rotation.y=Math.atan2(point.x-actor.position.x,point.z-actor.position.z)+Math.PI;
 }
 nearby(){
  if(this.sim.inCar||this.talk)return null;
  const s=this.s,p=this.sim.pos,here=key=>spot[key]&&distance(p,spot[key])<4.8;
  if(!s.active){if(s.stage==='new'&&this.api.free()&&here('stall'))return 'stall'}
  else{
  const key={stall:'stall',deposit:'stall',door:'door',pay:'pay',again:'door',againPay:'pay',note:'pay',shop:'shop',drop:'drop',wait:'pay',fight:'fight',alley:'alley'}[s.stage];
   if(key&&distance(p,spot[key])<4.8)return s.stage;
  }
  if(this.sim.heat||!this.api.free())return null;
  let nearest=null,range=2.9;
  for(const [key,n] of this.residents){const d=distance(p,n.p.position);if(n.health>0&&n.p.visible&&d<range){nearest=key;range=d}}
  return nearest;
 }
 prompt(k){
  if(streetVoices[k])return '和'+streetVoices[k][0]+'聊聊';
  return ({stall:'听档口上的价',deposit:'听侧面的人说话',door:'对门后说暗号',again:'再对一次暗号',pay:'把信封接过来',againPay:'再把信封接过来',note:'把信封接过来',shop:'抱起保险箱',drop:'放下保险箱',wait:'在老地方等一等',fight:'走到牛子身边',alley:'把纸条交给牛子'})[k]??'交谈';
 }
 action(){
  const k=this.nearby(),leave=['回头再说',()=>this.close()];
  if(streetVoices[k]){
   const [, ,line,question,answer]=streetVoices[k],bye=['下次见',()=>this.close()];
   this.focus=this.residents.get(k).p;
   this.say(k,line,[[question,()=>this.say(k,answer,[bye])],bye],this.chatPool());return;
  }
  if(k==='stall'){if(!this.s.active)this.api.start();this.focus=this.cast.boss;this.openStall(leave);return}
  if(k==='deposit'){this.focus=this.cast.stranger;this.openDeposit();return}
  if(k==='door'||k==='again'){this.focus=this.props.shutter;this.openDoor();return}
  if(k==='pay'){this.focus=this.cast.payer;this.openPay('first');return}
  if(k==='againPay'){this.focus=this.cast.payer;this.openPay('habit');return}
  if(k==='note'){this.focus=this.cast.fresh;this.openNote();return}
  if(k==='shop'){this.focus=this.props.safe;this.openShop();return}
  if(k==='drop'){this.focus=this.props.safe;this.openDrop();return}
  if(k==='wait'){this.focus=this.sim.hero;this.openWait();return}
  if(k==='fight'){this.focus=this.cast.stranger;this.openFight();return}
  if(k==='alley'){this.focus=this.cast.stranger;this.openAlley();return}
 }
 openStall(leave){
  const haggle=[
   ['两边劝',()=>this.settle()],
   ['帮老板说话',()=>this.heatUp()],
   ['帮客人说话',()=>this.heatUp()]
  ];
  this.say('aside','档口前围着一圈人。',[
   ['走近去听',()=>this.say('boss','就这个价。爱要不要。',[
    ['听客人还价',()=>this.say('guest','你这价，我在别处早买了。',haggle,'street')]
   ],'street')],
   leave
  ]);
 }
 heatUp(){
  this.say('boss','再顶嘴，我就动手。',[['看客人',()=>this.say('guest','你动手啊。',[['把话圆回来',()=>this.settle()]],'snap')]],'snap');
 }
 settle(){
  this.say('jiahao','你再让一点，他再添一点。这单成了，你们都不用在这儿耗着。',[['看结果',()=>this.say('aside','价谈拢了。围着的人笑出声。',[['听老板',()=>this.say('boss','少在这儿充大尾巴狼，赶紧滚蛋！',[['应一声',()=>this.say('jiahao','承让承让，小事一桩。',[['看侧面',()=>this.move('deposit')]])]],'snap')]],'laugh')]]);
 }
 openDeposit(){
  this.say('stranger','嘴皮子挺利索。别问我是谁。',[['听下去',()=>this.say('stranger','去商店里的卷帘门递句话。办完了，到偏开商店的地方领尾款。',[['问暗号',()=>this.say('stranger','到了门后，你说，'+CODE+'。',[['接下定金',()=>this.takeDeposit()]])]])]],'hush');
 }
 takeDeposit(){
  if(!this.s.deposit){this.s.deposit=true;this.gain(DEPOSIT)}
  this.say('jiahao','干完还有下一单吗？',[['等他答',()=>this.say('stranger','干完就有下一单。',[['去卷帘门',()=>this.move('door')]])]]);
 }
 openDoor(){
  const choices=[
   [CODE,()=>this.doorYes()],
   ['我来取货',()=>this.doorNo()],
   ['夜市的人让我来',()=>this.doorNo()]
  ];
  this.say('door','人不在。找错地方了。',choices,'snap');
 }
 doorNo(){this.say('door','人不在。',[[CODE,()=>this.doorYes()],['我来取货',()=>this.doorNo()],['夜市的人让我来',()=>this.doorNo()]],'snap')}
 doorYes(){
  const next=this.s.stage==='again'?'againPay':'pay';
  if(next==='pay')this.s.message=true;
  this.say('jiahao','（传话）',[['等门后',()=>this.say('aside','门后安静了一下。',[['听门后',()=>this.say('door','话我收到了。你走吧。',[['去领钱',()=>this.move(next)]],'hush')]])]]);
 }
 openPay(kind){
  const counted=kind==='first'?'嘉豪当着街面把钱数完。':'口袋里的钱厚了一点。';
  const next=kind==='first'?'again':'note';
  this.say('aside','对方把信封交过来。',[['把钱数完',()=>{
   if(kind==='first'&&!this.s.firstPay){this.s.firstPay=true;this.gain(PAY)}
   if(kind==='habit'&&!this.s.habit){this.s.habit=true;this.gain(PAY)}
   const after=kind==='first'?[['听清楚',()=>this.say('aside','这是他头一回靠传话拿到的钱。',[['离开路口',()=>this.move(next)]])]]:[['离开路口',()=>this.move(next)]];
   this.say('aside',counted,after);
  }]],'hush');
 }
 openNote(){
  this.say('aside','对方把信封塞过来，转身走了。',[['把钱数完',()=>{
   if(!this.s.note){this.s.note=true;this.gain(PAY)}
   this.say('aside','去夜市边那家小店，找线人取走小型保险箱。拿到后，放到纸条上写的地址。',[['把纸条放回钱底下',()=>this.say('jiahao','尾款已经在兜里了。这一单也做。',[['去小店',()=>this.move('shop')]])]]);
  }]],'snap');
 }
 openShop(){
  this.say('aside','街上有人吵起来。店里的人跑出去看。',[['抱起保险箱',()=>this.say('aside','有人回头，看清了他的脸，也看清了那副墨镜。',[['带着箱子走',()=>{this.s.carrying=true;this.move('drop')}]],'shock')]]);
 }
 openDrop(){
  this.say('aside','他放下箱子，人就离开了。',[['离开',()=>{this.s.carrying=false;this.s.dropped=true;this.move('wait')}]]);
 }
 openWait(){
  this.s.wagesCut=true;
  this.say('aside','他在老地方等了等。没有人来。',[['开口',()=>this.say('jiahao','活没了。',[['去街上找人',()=>this.move('fight')]])]]);
 }
 openFight(){
  this.say('aside','牛子要倒在对方手里。',[['走到他身边',()=>this.say('jiahao','你别倒在这儿。活还没续上。',[['把他拖出来',()=>{this.s.rescued=true;this.move('alley')}]])]],'shock');
 }
 openAlley(){
  const hired=()=>this.say('niuzi','从今天起，你跟我干。',[['看自己身上',()=>this.finish()]],'hush');
  const planted=()=>this.say('niuzi','他们让你去抢，再把东西放到他们那儿。',[['听他收口',hired]]);
  const owned=()=>this.say('niuzi','这地方是B的。店和箱子都是我们的。',[['听下去',planted]],'tight');
  const told=()=>this.say('jiahao','我拿到保险箱，就放到了纸条上的地址。',[['把纸条交给他',owned]]);
  const face=()=>this.say('jiahao','递钱的是张生脸。门口没有线人。',[['把地址说完',told]]);
  const note=()=>this.say('jiahao','取钱时，信封里有纸条。',[['接着说',face]]);
  this.say('niuzi','小店里的保险箱，你放哪儿了？',[['回答',note]],'tight');
 }
 finish(){
  this.s.joined=true;this.s.stage='done';this.layout();this.close();this.api.persist();this.api.complete();
 }
 update(dt,dialogue=false){
  this.clock+=dt;const t=this.clock,p=this.sim.pos,s=this.s;
  this.layout();
  const people=[this.cast.boss,this.cast.guest,this.cast.stranger,this.cast.payer,this.cast.fresh,...this.fighters];
  for(const actor of people){
   if(!actor.visible)continue;
   personDetail(actor,distance(p,actor.position)<18||this.talk&&this.actor(this.talk.who)===actor);
   if(!dialogue)animatePerson(actor,t*2.2,.03);
  }
  if(s.stage==='drop'){
   const safe=this.props.safe,a=p.a,y=this.sim.hero.position.y;
   if(this.sim.inCar){const back=this.sim.carSpec?.cargoBack??1.66;safe.position.set(p.x+back*Math.sin(a),(this.sim.carSpec?.cargoHeight??.99),p.z+back*Math.cos(a))}
   else safe.position.set(p.x+.34*Math.cos(a),y+.42,p.z-.34*Math.sin(a));
   safe.rotation.y=a;safe.visible=true;
  }
  const goal=this.target;
  this.marker.visible=!!goal&&!dialogue&&distance(p,goal)>3.2&&distance(p,goal)<180;
  if(this.marker.visible){this.marker.position.set(goal.x,2.5+.1*Math.sin(t*3),goal.z);this.marker.rotation.y=t}
  if(dialogue&&this.talk){if(this.cameraEase)this.cameraBlend=Math.min(1,(performance.now()-this.cameraStart)/380);this.camera()}
 }
}
