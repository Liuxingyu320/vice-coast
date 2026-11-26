import * as T from 'three';
import {editionKey,readEdition,loadSave,paints} from '../../data.js';
import {vehicles} from '../../street-catalog.js';
import {makePerson,animatePerson,seatedPerson} from '../../people.js';
import {makeCar,shadow} from '../../models.js';
import {advanceDrive} from '../../vehicle-motion.js';
import {CoastAudio} from '../../sound.js';
import {loadCarAsset,loadDistrictCast} from './cast-assets.js';
import {readShibaFile} from './local-assets.js';
import {buildNavigation} from './navigation.js';
import {DistrictStory} from './district-story.js';
import {DistrictInterface} from './district-interface.js';
import {createRadar} from './radar.js';
import {streetSpawn} from './district-places.js';

const poseKey='vicecoast.shiba.street.1';
const $=id=>document.getElementById(id);
const json=file=>JSON.parse(new TextDecoder().decode(readShibaFile(file)));
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const point=new T.Vector3();
const sharedFields=['chapter','midnight','money','owned','sound'];

export async function createDistrictGame(app,params){
  const {manifest,streamer}=app;
  const roads=json(manifest.roads),structures=json(manifest.structures);
  const nav=buildNavigation({manifest,roads,structures,grid:streamer.grid,surface:streamer.surface,tileBytes:readShibaFile});
  await loadDistrictCast();
  return new DistrictGame(app,nav,roads,params);
}

class DistrictGame {
  constructor(app,nav,roads,params){
    Object.assign(this,app);
    this.nav=nav;this.audio=new CoastAudio();this.keys=new Set();this.loading=true;
    this.snapshot=readEdition();this.save=loadSave(this.snapshot);
    this.pos={...streetSpawn};this.lastPose='';this.storageConflict=false;
    try{
      const p=JSON.parse(localStorage.getItem(poseKey));
      if(p&&[p.x,p.z,p.a].every(Number.isFinite)&&nav.canWalk(p.x,-p.z))this.pos={x:p.x,z:p.z,a:p.a};
    }catch{}
    this.floor=this.height(this.pos.x,this.pos.z);
    this.inCar=false;this.car=null;this.carId=0;this.carModels=new Map();this.delivery=0;this.speed=0;this.boost=1;
    this.emptyBoost=false;this.smoothSteer=0;this.motionA=this.pos.a;this.heat=0;this.step=0;this.hudClock=0;this.poseClock=0;
    this.hero=makePerson('rico');this.hero.name='里科';shadow(this.hero,1.08,.65);this.scene.add(this.hero);
    this.resetCamera();this.syncHero();
    this.radar=createRadar($('street-map').querySelector('canvas'),this.manifest.bounds,roads.edges,nav.land);
    this.ui=new DistrictInterface(this);
    this.world={venues:{partyMood:on=>{this.story.stageLight.intensity=on?27:0;}}};
    const ui=this.ui;
    this.story=new DistrictStory(this,this.save,{
      start:()=>this.story.start(),free:()=>true,chime:()=>this.audio.chime(),cue:()=>this.audio.cue(),
      persist:()=>this.persist(),refresh:()=>{this.story.syncCast();ui.refresh();},
      dialogue:(...args)=>ui.dialogue(...args),hide:()=>ui.hideDialogue(),
      meter:(...args)=>ui.meter(...args),toast:(...args)=>ui.toast(...args)
    });
    this.streetRadius=Number(params.get('radius'))||420;this.isMap=false;
    this.overviewRadius=Math.max(850,this.streetRadius);this.controls.enabled=false;this.controls.enableDamping=false;
    this.controls.enableRotate=false;this.controls.minDistance=80;this.controls.maxDistance=2100;
    this.controls.mouseButtons.LEFT=T.MOUSE.PAN;this.controls.touches.ONE=T.TOUCH.PAN;
    this.setMap(params.get('view')==='map');
    if(!this.isMap&&(!this.story.s.active||this.story.s.stage==='new'))this.story.start();
    this.story.update(0);ui.refresh();
    addEventListener('pagehide',()=>this.storePose());
    addEventListener('storage',e=>{if(e.key===editionKey&&readEdition()!==this.snapshot)this.otherSave();});
  }
  get carSpec(){return vehicles[this.carId];}
  height(x,z,prior){return this.nav.support(x,-z,prior)?.z??this.nav.ground(x,z);}
  walkable(x,z){return this.nav.canWalk(x,-z);}
  onFoot(x,z){
    if(!this.walkable(x,z))return false;
    if(!this.car)return true;
    const p=this.car.position,a=this.car.rotation.y,dx=x-p.x,dz=z-p.z;
    return Math.abs(dx*Math.cos(a)-dz*Math.sin(a))>1.03||Math.abs(dx*Math.sin(a)+dz*Math.cos(a))>2.15;
  }
  clearKeys(){this.keys.clear();}
  clearAlert(){this.heat=0;}
  setNight(on){this.clockTime.live=false;this.clockTime.hour=on?20.25:15.3;}
  otherSave(){
    if(this.storageConflict)return;
    this.storageConflict=true;this.ui.toast('另一窗口已更新存档，重新载入可继续保存。',9);
  }
  persist(){
    if(this.storageConflict)return;
    try{
      if(readEdition()!==this.snapshot){this.otherSave();return;}
      let previous;
      try{previous=JSON.parse(this.snapshot);}catch{}
      const merged=previous&&typeof previous==='object'&&!Array.isArray(previous)?{...previous}:{...this.save};
      for(const k of sharedFields)merged[k]=this.save[k];
      const next=JSON.stringify(merged);
      if(next!==this.snapshot){localStorage.setItem(editionKey,next);this.snapshot=next;}
    }catch{this.ui.toast('此浏览器暂时无法保存进度。');}
  }
  storePose(){
    if(this.storageConflict||this.loading||(!this.story.s.active&&this.isMap))return;
    const p=this.pos, pose=JSON.stringify({x:+p.x.toFixed(2),z:+p.z.toFixed(2),a:+p.a.toFixed(4)});
    if(pose===this.lastPose)return;
    try{localStorage.setItem(poseKey,pose);this.lastPose=pose;}catch{}
  }
  resetCamera(){this.yaw=this.pos.a;this.pitch=this.inCar?.01:.13;}
  syncHero(){
    this.hero.visible=!this.inCar;this.hero.position.set(this.pos.x,this.floor+.018,this.pos.z);this.hero.rotation.y=this.pos.a;
  }
  setMap(on){
    this.clearKeys();this.isMap=on;this.controls.enabled=on;
    this.streamer.radius=on?this.overviewRadius:this.streetRadius;
    this.camera.near=on?1:.12;this.camera.fov=on?52:63;this.camera.updateProjectionMatrix();
    document.body.classList.toggle('district-map',on);$('game-map-panel').hidden=!on;$('back-to-character').hidden=!on;
    if(on){
      const p=this.pos;
      this.controls.target.set(p.x,this.floor,p.z);this.camera.position.set(p.x,this.floor+285,p.z+145);
      this.controls.update();this.story.group.visible=false;
      this.updateMap();
    }else{
      this.story.group.visible=true;
      if(!this.loading&&(!this.story.s.active||this.story.s.stage==='new'))this.story.start();
      this.streetCamera();this.ui.refresh();
    }
  }
  updateMap(){
    const ref=this.controls.target,b=this.manifest.bounds;
    const x=Math.max(b.minX,Math.min(b.maxX,ref.x)),z=Math.max(b.minZ,Math.min(b.maxZ,ref.z));
    this.camera.position.x+=x-ref.x;this.camera.position.z+=z-ref.z;ref.x=x;ref.z=z;
    this.controls.update();this.camera.updateMatrixWorld();
    const marker=(id,loc)=>{
      const el=$(id);if(!loc){el.hidden=true;return;}
      point.set(loc.x,this.height(loc.x,loc.z)+2,loc.z).project(this.camera);
      el.hidden=Math.abs(point.x)>1||Math.abs(point.y)>1||point.z>1;
      el.style.left=(50+50*point.x)+'%';el.style.top=(50-50*point.y)+'%';
    };
    marker('map-player',this.pos);marker('map-objective',this.story.target);
    marker('map-vehicle',this.car&&!this.inCar?this.car.position:null);
    $('map-objective-label').textContent=this.story.journal;
  }
  async callCar(id){
    if(this.inCar||!Number.isInteger(id)||!vehicles[id])return;
    const ticket=++this.delivery;
    const {pos,nav}=this;const spot=nav.roadNear(pos.x,-pos.z);
    if(!spot)throw Error('No reachable road near the player');
    const model=vehicles[id];await loadCarAsset(model.key);
    if(ticket!==this.delivery||this.inCar)return;
    if(!this.carModels.has(id)){
      const color=id===0?paints.find(p=>p.id===this.save.paint)?.color:model.color;
      const car=makeCar(color??0x416773,id,true);car.name=model.name;this.carModels.set(id,car);
    }
    if(this.car)this.scene.remove(this.car);
    this.carId=id;this.car=this.carModels.get(id);this.scene.add(this.car);
    this.car.position.set(spot.x,spot.z+.035,-spot.y);this.car.rotation.y=-spot.heading;
    const meters=Math.round(Math.hypot(pos.x-spot.x,pos.z+spot.y));
    this.ui.toast(model.name+' 已送达，距你 '+meters+' 米。小地图上的薄荷色方块是取车点。',6);
    this.ui.refresh();
  }
  returnCar(){
    if(this.inCar)return;
    this.delivery++;if(this.car)this.scene.remove(this.car);this.car=null;this.ui.refresh();
  }
  seatOccupants(){
    if(!this.inCar){this.driver?.removeFromParent();this.passenger?.removeFromParent();return;}
    const height=this.carSpec.seatHeight??(this.carId===2?1.04:.48);
    const z=this.carId===2?-.91:.19,shell=this.car.userData.shell;
    this.driver??=seatedPerson('rico');shell.add(this.driver);this.driver.position.set(-.34,height-.74,z);
    if(['ride','escape','return'].includes(this.story.s.stage)){
      this.passenger??=seatedPerson('mara');shell.add(this.passenger);this.passenger.position.set(.34,height-.74,z);
    }
  }
  toggleCar(){
    if(this.isMap||this.story.talk||this.ui.panel)return;
    const p=this.pos,car=this.car;
    if(!car){this.ui.toast('按 G 打开私人车库叫车。');return;}
    if(this.inCar){
      if(Math.abs(this.speed)>2){this.ui.toast('先减速停车，再下车。');return;}
      const x=p.x+1.65*Math.cos(p.a),z=p.z-1.65*Math.sin(p.a);
      const safe=this.nav.walkNear(x,-z);
      if(!safe)return;
      p.x=safe[0];p.z=-safe[1];this.inCar=false;
    }else{
      if(Math.hypot(p.x-car.position.x,p.z-car.position.z)>3.9){this.ui.toast('走到小地图上的车辆旁，按 F 上车。');return;}
      this.inCar=true;p.x=car.position.x;p.z=car.position.z;p.a=car.rotation.y;
    }
    this.speed=0;this.smoothSteer=0;this.motionA=p.a;this.floor=this.height(p.x,p.z,this.floor);
    this.seatOccupants();this.clearKeys();this.resetCamera();this.syncHero();this.streetCamera();this.ui.refresh();
  }
  walk(dt){
    const k=this.keys,p=this.pos;
    const forward=Number(k.has('KeyW'))-Number(k.has('KeyS')),right=Number(k.has('KeyD'))-Number(k.has('KeyA'));
    const magnitude=Math.hypot(forward,right);
    if(magnitude){
      const pace=(k.has('ShiftLeft')?5.8:2.8)*(this.story.town.s.stage==='haul'?.7:1);
      const dx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*right)/magnitude;
      const dz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*right)/magnitude;
      const x=p.x+dx*pace*dt,z=p.z+dz*pace*dt;
      if(this.onFoot(x,p.z))p.x=x;
      if(this.onFoot(p.x,z))p.z=z;
      p.a+=angleDelta(Math.atan2(-dx,-dz),p.a)*(1-Math.exp(-dt*16));this.step+=dt*pace*3.1;
    }else this.step+=dt*2;
    this.floor=this.height(p.x,p.z,this.floor);this.syncHero();
    animatePerson(this.hero,this.step,magnitude?(k.has('ShiftLeft')?1:.72):.035);
  }
  drive(dt){
    const p=this.pos,car=this.car;
    for(let remaining=dt;remaining>.000001;){
      const step=Math.min(.022,remaining);remaining-=step;
      const oldYaw=p.a;advanceDrive(this,step,this.keys);
      const x=p.x-Math.sin(this.motionA)*this.speed*step,z=p.z-Math.cos(this.motionA)*this.speed*step;
      if(this.nav.vehicleContact({z:this.floor},x,-z,-p.a)){this.speed*=.38;p.a=oldYaw;this.motionA=oldYaw;break;}
      p.x=x;p.z=z;this.floor=this.nav.support(x,-z,this.floor,true).z;
      for(const w of car.userData.wheels)if(w)w.rotation.x-=this.speed*step/.39;
    }
    car.position.set(p.x,this.floor+.035,p.z);car.rotation.y=p.a;
    if(Math.abs(this.speed)>1)this.yaw+=angleDelta(p.a,this.yaw)*(1-Math.exp(-dt*2));
  }
  streetCamera(){
    const p=this.pos;this.controls.target.set(p.x,this.floor+1.0,p.z);
    if(this.story?.talk){this.story.portrait(this.camera);return;}
    const car=this.inCar,dist=car?7.6:3.9,h=car?2.65:1.82;
    const s=Math.sin(this.yaw),c=Math.cos(this.yaw),shoulder=car?0:.43;
    let back=dist;
    for(let r=.55;r<=dist;r+=.35){
      if(!this.walkable(p.x+s*r+c*shoulder,p.z+c*r-s*shoulder)){back=Math.max(.65,r-.35);break;}
    }
    const x=p.x+s*back+c*shoulder,z=p.z+c*back-s*shoulder;
    this.camera.position.set(x,Math.max(this.height(x,z,this.floor)+.25,this.floor+h-back*Math.sin(this.pitch)*.65),z);
    this.camera.lookAt(p.x-s*5+c*shoulder,this.floor+(car?1.25:1.52)+Math.tan(this.pitch)*5,p.z-c*5-s*shoulder);
  }
  update(dt){
    if(this.isMap){this.updateMap();this.audio.update(false,this.save,0,false,false);return;}
    const active=!this.ui.panel&&!this.loading;
    if(active){
      if(!this.story.talk){if(this.inCar)this.drive(dt);else this.walk(dt);}
      this.story.update(dt);
    }
    this.streetCamera();
    this.audio.update(active,this.save,this.speed,this.keys.has('KeyW'),this.inCar);
    this.hudClock+=dt;this.poseClock+=dt;
    if(this.hudClock>.12){this.hudClock=0;this.ui.refresh();}
    if(this.poseClock>2){this.poseClock=0;this.storePose();}
  }
}
