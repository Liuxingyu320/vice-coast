import {vehicles} from '../../street-catalog.js';
const $=id=>document.getElementById(id);
const button=(label,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=handler;return b;};
const arrows={ArrowUp:'KeyW',ArrowLeft:'KeyA',ArrowDown:'KeyS',ArrowRight:'KeyD',ShiftRight:'ShiftLeft'};
const movement=new Set(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','Space']);

export class DistrictInterface {
  constructor(game){
    this.game=game;this.panel=null;this.toastTimer=0;
    const canvas=game.renderer.domElement;
    const action=()=>{if(this.actionKey==='F')game.toggleCar();else game.story.action();this.refresh();};
    $('street-action').onclick=action;
    $('street-map').onclick=()=>game.setMap(true);
    $('back-to-character').onclick=()=>game.setMap(false);
    $('street-pause').onclick=()=>this.pause();
    $('street-journal').onclick=()=>this.journal();
    $('touch-garage').onclick=()=>this.garage();
    $('walkAway').onclick=()=>game.story.close();
    addEventListener('keydown',e=>{
      if(e.metaKey||e.ctrlKey||e.altKey||game.loading)return;
      const key=arrows[e.code]??e.code;
      if(game.isMap){
        if(['KeyM','Escape'].includes(key)&&!e.repeat){e.preventDefault();game.setMap(false);}
        return;
      }
      if(key==='Escape'||key==='KeyP'){
        e.preventDefault();if(e.repeat)return;
        if(game.story.talk)game.story.close();else if(this.panel)this.hideMenu();else this.pause();
        return;
      }
      if(game.story.talk){
        if(!e.repeat&&/^Digit[1-9]$/.test(key)){e.preventDefault();game.story.pick(Number(key.slice(-1))-1);}
        return;
      }
      if(this.panel){if(!e.repeat&&((this.panel==='garage'&&key==='KeyG')||(this.panel==='journal'&&key==='KeyJ')))this.hideMenu();return;}
      if(movement.has(key)){e.preventDefault();game.keys.add(key);return;}
      if(e.repeat)return;
      const actions={KeyE:()=>game.story.action(),KeyF:()=>game.toggleCar(),KeyG:()=>this.garage(),KeyM:()=>game.setMap(true),KeyJ:()=>this.journal()};
      if(actions[key]){e.preventDefault();actions[key]();this.refresh();}
    });
    addEventListener('keyup',e=>game.keys.delete(arrows[e.code]??e.code));
    addEventListener('blur',()=>game.clearKeys());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)game.clearKeys();});
    const unlock=()=>game.audio.init();
    addEventListener('pointerdown',unlock,{once:true});addEventListener('keydown',unlock,{once:true});
    let pointer=null;
    canvas.style.touchAction='none';
    canvas.addEventListener('pointerdown',e=>{
      if(game.isMap||game.story.talk||this.panel||pointer)return;
      pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(pointer?.id!==e.pointerId)return;
      game.yaw-=(e.clientX-pointer.x)*.005;
      game.pitch=Math.max(-.48,Math.min(.78,game.pitch+(e.clientY-pointer.y)*.004));
      pointer.x=e.clientX;pointer.y=e.clientY;
    });
    canvas.addEventListener('lostpointercapture',()=>{pointer=null;});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    for(const el of document.querySelectorAll('#street-touch [data-key]')){
      el.addEventListener('pointerdown',e=>{if(game.loading)return;e.preventDefault();el.setPointerCapture(e.pointerId);game.keys.add(el.dataset.key);});
      el.addEventListener('lostpointercapture',()=>game.keys.delete(el.dataset.key));
    }
  }
  toast(line,seconds=3.5){
    clearTimeout(this.toastTimer);const el=$('district-toast');el.textContent=line;el.hidden=false;
    this.toastTimer=setTimeout(()=>{el.hidden=true;},seconds*1000);
  }
  hideMenu(){this.panel=null;$('district-menu').hidden=true;this.game.clearKeys();this.refresh();}
  menu(name,title,copy,items){
    this.panel=name;this.game.clearKeys();$('district-menu-title').textContent=title;$('district-menu-copy').textContent=copy;
    $('district-menu-actions').replaceChildren(...items);$('district-menu').hidden=false;
    $('district-menu-actions').firstElementChild?.focus({preventScroll:true});
  }
  pause(){
    const g=this.game;
    this.menu('pause','暂停',g.story.journal,[
      button('继续游戏',()=>this.hideMenu()),button('街区地图',()=>{this.hideMenu();g.setMap(true);}),
      button('私人车库',()=>this.garage()),button('任务手记',()=>this.journal()),
      button('原作章节与委托',()=>{g.persist();g.storePose();const u=new URL(location.href);u.search='?mode=original';u.hash='';location.assign(u);}),
      button('声音　'+(g.save.sound?'开启':'关闭'),()=>{g.save.sound=!g.save.sound;g.persist();this.pause();}),
      button('地图数据',()=>this.menu('credits','地图数据',g.manifest.attribution.join(' · '),[button('返回',()=>this.pause())]))
    ]);
  }
  journal(){
    const s=this.game.story,goal=s.target;
    const note=[goal?.label??s.journal,s.s.clue?'已取得双人签名封套。':'',s.town.sideNote].filter(Boolean).join('　');
    this.menu('journal',s.title,note,[button('返回街头',()=>this.hideMenu()),button('查看目标位置',()=>{this.hideMenu();this.game.setMap(true);})]);
  }
  garage(){
    const g=this.game;
    if(g.inCar){this.toast('停车下车后可以呼叫另一辆车。');return;}
    const select=document.createElement('select');select.setAttribute('aria-label','选择车辆');
    vehicles.forEach((v,i)=>select.add(new Option(v.name,String(i),false,i===g.carId)));
    const call=button('呼叫车辆',async()=>{
      call.disabled=true;
      try{await g.callCar(Number(select.value));if(call.isConnected&&this.panel==='garage')this.hideMenu();}
      catch(error){this.toast('车辆未能送达，可换个位置再试。');console.error(error);}
      finally{call.disabled=false;}
    });
    const items=[select,call];
    if(g.car)items.push(button('收车入库',()=>{g.returnCar();this.hideMenu();this.toast('车辆已送回私人车库。');}));
    items.push(button('返回街头',()=>this.hideMenu()));
    this.menu('garage','私人车库','选择车辆，车会送到附近道路。走到车旁按 F 上车。',items);
  }
  dialogue(person,line,choices){
    $('speaker').textContent=person[0];$('speakerrole').textContent=person[1];$('spoken').textContent=line;
    $('mixdesk').hidden=true;$('tuning').hidden=true;
    $('answers').replaceChildren(...choices.map(([name],i)=>button(name,()=>this.game.story.pick(i))));
    $('conversation').hidden=false;$('district-hud').hidden=true;$('answers').firstElementChild?.focus({preventScroll:true});
  }
  hideDialogue(){$('conversation').hidden=true;$('district-hud').hidden=false;this.refresh();}
  meter(phase,hits,line){
    $('mixdesk').hidden=false;$('track').querySelector('b').style.left=(phase*100)+'%';
    $('beats').textContent=hits+' / 3　'+(line??'按下推子');
  }
  refresh(){
    const g=this.game,s=g.story;if(!s)return;
    const near=s.nearby(),car=g.car,dist=car?Math.hypot(g.pos.x-car.position.x,g.pos.z-car.position.z):Infinity;
    let label=near?s.prompt(near):'',key='E';
    if(g.inCar||(!near&&dist<=3.9)){key='F';label=g.inCar?'停车下车':'驾驶 '+g.carSpec.name;}
    $('street-action').hidden=!label||this.panel||!!s.talk;
    $('street-action').querySelector('kbd').textContent=key;
    $('street-action').querySelector('span').textContent=label??'';this.actionKey=key;
    $('story-series').textContent=s.title;$('story-task').textContent=s.journal;
    $('street-alert').hidden=!g.heat;$('street-alert').textContent='★'.repeat(g.heat);
    $('game-time').textContent=g.clockTime.label();$('game-balance').textContent='$'+g.save.money.toLocaleString('en-US');
    $('game-speed').hidden=!g.inCar;$('game-speed').textContent=Math.round(Math.abs(g.speed)*3.6)+' km/h';
    const edge=g.nav.boundary.locate(g.pos.x,-g.pos.z),hint=$('street-boundary');
    const threshold=g.inCar?25:11;
    hint.hidden=edge.distance>(hint.hidden?threshold:threshold+3);
    $('touch-brake').hidden=!g.inCar;
    $('street-help').textContent=g.inCar?'W / S 油门与制动　·　A / D 转向　·　空格 手刹　·　F 下车':'WASD 移动　·　拖动环视　·　Shift 奔跑　·　G 车库　·　M 地图';
    g.radar(g.pos,s.target,car&&!g.inCar?car.position:null);
  }
}
