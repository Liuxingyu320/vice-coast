import * as T from 'three';
import {LedgerStory,ledgerSpeakers} from '../../ledger-story.js';
import {MidnightDistrict,midnightSpeakers} from '../../midnight.js';
import {makePerson,animatePerson,personDetail} from '../../people.js';
import {shadow} from '../../models.js';
import {streetVoices} from '../../street-catalog.js';
import {labelEquipment} from './decals.js';
import {equipment,prop} from '../../ledger-props.js';
import {chapterSites,nightSites,fitSites,nightCopy} from './district-places.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const propNames={deckPress:['后台唱盘','BAY WAVE'],frequencyCard:['调频磁卡','BAY WAVE'],
  canvasBag:['帆布相机包','芝公园'],consoleDesk:['流动电台','FM 98.4']};
const propKeys={case:'bag',deckPress:'deck',frequencyCard:'pass',canvasBag:'cameraBag',consoleDesk:'console'};
const propHeights={sleeve:1.17,case:.96,board:1.07,deckPress:1.04,frequencyCard:1.05,canvasBag:.3,consoleDesk:1.08};

export class DistrictStory extends LedgerStory {
  constructor(sim,save,api) {
    super();
    this.sim=sim; this.save=save; this.s=save.chapter; this.api=api;
    this.sites=fitSites(chapterSites,sim.nav); this.nightSites=fitSites(nightSites,sim.nav);
    const group=this.group=new T.Group();
    group.name='东京湾街区 · 角色与任务'; sim.scene.add(group);
    this.cast={mic:sim.hero};
    const actor=(id,role,site,seed=0,heading=-1.67)=>{
      const p=makePerson(role,seed); p.name=id; shadow(p,1,.65); group.add(p);
      p.rotation.y=heading;this.place(p,site);this.cast[id]=p;
    };
    const site=this.sites, night=this.nightSites;
    actor('mara','mara',site.intro);actor('vic','vic',{x:site.sleeve.x+1.45,z:site.sleeve.z-.6});
    actor('carlos','carlos',site.deal);actor('door','civilian',site.ride,2);
    actor('tito','civilian',night.bar,5);actor('ines','civilian',night.photo,1);
    actor('luz','civilian',night.stall,4);actor('paz','civilian',night.crew,3);actor('ramon','ramon',night.offer);
    this.residents=[];
    for(const [role,x,z,span] of [['skater',459,163,5],['florist',463,124,0],['busker',449,219,0],['cook',448,181,0],['courier',456,225,7]]){
      const [px,py]=sim.nav.walkNear(x,-z);
      actor(role,role,{x:px,z:-py});
      this.residents.push({role,from:-py,to:-py+span,towards:1,walk:span>0});
    }
    this.props=equipment(group);
    const table=(id,site,color)=>{
      const g=new T.Group();group.add(g);this.place(g,site);this.props[id]=g;
      prop(g,[1.55,.09,.72],color,0,.87,0);
      for(const x of [-.62,.62])for(const z of [-.23,.23])prop(g,[.05,.83,.05],0x473e3c,x,.42,z);
      return g;
    };
    table('counter',site.sleeve,0x67503b);this.place(this.props.sleeve,site.sleeve,1.16);
    table('masterTable',site.case,0x4a4741);
    const deck=table('deck',site.mix,0x3d4c51);prop(deck,[.75,.11,.43],0x252e37,0,.97,0);
    const console=table('console',night.dial,0x504339);prop(console,[1.15,.41,.53],0x38716f,0,1.12,0);
    labelEquipment(this.props.counter,console);
    this.place(this.props.mic,site.stand);this.place(this.props.board,site.board);
    for(const [id,loc,dim,col,y] of [['pass',night.card,[.21,.025,.14],0xffcd80,1.0],
      ['cameraBag',night.bag,[.43,.31,.24],0x695641,.18],['amp',night.crew,[.57,.68,.42],0x343633,.35],
      ['crate',night.stall,[.57,.35,.40],0xac7850,.19]]) {
      const g=new T.Group();group.add(g);prop(g,dim,col,0,0,0);this.place(g,loc,y);this.props[id]=g;
    }
    this.town=new MidnightDistrict(this,this.nightSites,{actors:this.cast},nightCopy);
    this.marker=new T.Mesh(new T.OctahedronGeometry(.17),new T.MeshBasicMaterial({color:0xffc475,toneMapped:false}));
    group.add(this.marker);
    this.stageLight=new T.PointLight(0xffbd81,0,16);this.place(this.stageLight,site.mix,2.8);group.add(this.stageLight);
    this.portraitLight=new T.HemisphereLight(0xffead2,0xae9e8c,0);group.add(this.portraitLight);
    this.clock=0;this.blackout=0;this.talk=null;this.mixer=null;this.farewell=false;
    this.syncCast();
  }
  place(object,site,raise=0) {
    object.position.set(site.x,this.sim.height(site.x,site.z)+raise,site.z);
  }
  get target() {
    if(!this.s.active)return null;
    if(this.s.stage==='done')return this.town.target;
    return this.sites[this.s.stage==='party'?this.s.lead:this.s.stage]??this.sites.intro;
  }
  get title(){return this.s.ending?'午夜暗频':'海浪账本';}
  get journal(){return this.target?.label ?? (this.town.s.outcome?this.town.journal:'自由探索芝公园');}
  start(){
    this.s.active=true;if(this.s.stage==='new')this.s.stage='intro';
    this.syncCast();this.api.persist();
  }
  syncCast(){
    const s=this.s, site=this.sites, mara=this.cast.mara, vic=this.cast.vic;
    if(['new','intro','sleeve'].includes(s.stage))this.place(mara,site.intro);
    if(['party','case'].includes(s.stage))this.place(mara,site.mix);
    if(s.stage==='done')this.place(mara,this.town.s.stage==='new'?this.nightSites.new:['dial','offer','done'].includes(this.town.s.stage)?this.nightSites.dial:site.mix);
    this.place(vic,s.stage==='return'||(s.stage==='done'&&this.farewell)?site.return:{x:site.sleeve.x+1.45,z:site.sleeve.z-.6});
    this.props.sleeve.visible=s.ending!=='keep';
    this.cast.ramon.visible=['offer','done'].includes(this.town.s.stage);
    this.props.pass.visible=this.town.s.stage==='card';this.props.cameraBag.visible=this.town.s.bag==='looking';
    this.props.amp.visible=['crew','haul'].includes(this.town.s.stage);this.props.crate.visible=['idle','carrying'].includes(this.town.s.vinyl);
    this.sim.heat=s.stage==='escape'?(s.route==='stand'?2:1):0;
  }
  prompt(id){return id?.startsWith('mid-')?this.nightSites[id.slice(4)]?.label:super.prompt(id);}
  nearby(){
    if(this.sim.inCar)return null;
    const s=this.s, pos=this.sim.pos;
    const names=s.active?(s.stage==='party'?['deal','mix','stand','board']:s.stage==='done'?['shop','club']:s.stage==='new'?['intro']:[s.stage]):['intro'];
    const options=names.filter(k=>this.sites[k]).map(k=>({k,d:distance(pos,this.sites[k])})).filter(o=>o.d<(o.k==='intro'?4.6:3.2));
    if(options.length&&s.stage!=='done')return options.sort((a,b)=>a.d-b.d)[0].k;
    const people=this.residents.map(r=>({k:r.role,d:distance(pos,this.cast[r.role].position)})).filter(o=>o.d<2.9);
    const side=this.town.nearby();
    const main=side.find(o=>this.town.unlocked&&o.k==='mid-'+this.town.s.stage);
    if(main)return main.k;
    if(this.farewell&&distance(pos,this.sites.farewell)<2.6)return 'farewell';
    return options.concat(side,people).sort((a,b)=>a.d-b.d)[0]?.k??null;
  }
  move(stage,line){
    this.close();this.s.stage=stage;this.syncCast();this.api.persist();this.api.refresh();
    const here={ride:'带上封套，和玛拉前往芝公园演出入口。',return:'母带编号已核实。去公园转播点找老维克。'};
    if(line||here[stage])this.api.toast(here[stage]??line);
  }
  armAlert(){this.sim.heat=this.s.route==='stand'?2:1;}
  say(who,line,choices){
    this.talk={who,choices};this.sim.clearKeys();
    this.api.dialogue(ledgerSpeakers[who]??midnightSpeakers[who]??streetVoices[who]??propNames[who],line,choices);
    this.portraitLight.intensity=.95;
  }
  close(){
    if(!this.talk)return;
    if(this.s.stage==='done'&&this.talk.who==='vic'&&this.farewell)this.farewell=false;
    this.talk=null;this.mixer=null;this.town.close();this.portraitLight.intensity=0;
    this.api.hide();this.sim.clearKeys();this.sim.resetCamera();
  }
  portrait(camera){
    const who=this.talk.who, actor=this.cast[who], obj=actor??this.props[propKeys[who]??who];
    if(!obj)return;
    const eye=actor?1.46:(propHeights[who]??.8);
    const site=obj.position, floor=this.sim.height(site.x,site.z);
    const span=actor?(camera.aspect<.8?2.45:2.10):1.6;
    camera.position.set(site.x+span,floor+eye+.22,site.z+.82);
    camera.lookAt(site.x,floor+eye-.15,site.z);
    if(actor)actor.rotation.y=Math.atan2(-span,-.82);
  }
  update(dt){
    this.clock+=dt;
    const s=this.s.stage, pos=this.sim.pos, m=this.cast.mara;
    if(this.blackout>0)this.blackout=Math.max(0,this.blackout-dt);
    this.stageLight.intensity=(s==='party'||s==='case')&&!this.blackout?27:0;
    const follows=['ride','escape','return'].includes(s);
    let walking=false;
    if(follows&&!this.sim.inCar&&!this.talk){
      const tx=pos.x+1.5*Math.sin(pos.a+.67),tz=pos.z+1.5*Math.cos(pos.a+.67);
      const dx=tx-m.position.x,dz=tz-m.position.z,d=Math.hypot(dx,dz);
      if(d>25){const next=this.sim.nav.walkNear(tx,-tz);if(next)this.place(m,{x:next[0],z:-next[1]});}
      else if(d>.7){const f=Math.min(1,dt*(d>4?7:3.8)/d);const x=m.position.x,z=m.position.z;
        if(this.sim.walkable(x+dx*f,z))m.position.x=x+dx*f;
        if(this.sim.walkable(m.position.x,z+dz*f))m.position.z=z+dz*f;
        m.position.y=this.sim.height(m.position.x,m.position.z);m.rotation.y=Math.atan2(-dx,-dz);walking=true;}
    }
    const strolling=new Set();
    for(const person of this.residents){
      const actor=this.cast[person.role],p=actor.position;
      if(!person.walk||distance(pos,p)>80||distance(pos,p)<3||this.talk?.who===person.role)continue;
      const z=p.z+person.towards*dt;
      if(z<person.from||z>person.to||!this.sim.walkable(p.x,z)){person.towards*=-1;continue;}
      p.z=z;p.y=this.sim.height(p.x,z);actor.rotation.y=person.towards>0?Math.PI:0;strolling.add(person.role);
    }
    for(const [key,a] of Object.entries(this.cast)){
      if(key==='mic')continue;
      const d=distance(pos,a.position);a.visible=d<130 && (key!=='mara'||!follows||!this.sim.inCar) &&
        (key!=='ramon'||['offer','done'].includes(this.town.s.stage));
      if(!a.visible)continue;
      personDetail(a,d<33||this.talk?.who===key);
      const moving=(key==='mara'&&walking)||strolling.has(key);
      animatePerson(a,this.clock*(moving?7:2.2),moving?.8:.035);
    }
    const bag=this.props.bag, carried=['escape','return'].includes(s);
    bag.visible=carried || ['case','party'].includes(s);
    if(carried){const back=this.sim.inCar?1.1:.1;
      bag.position.set(pos.x+.31*Math.cos(pos.a)+back*Math.sin(pos.a),this.sim.floor+(this.sim.inCar?.9:.18),pos.z-.31*Math.sin(pos.a)+back*Math.cos(pos.a));bag.rotation.y=pos.a;}
    else this.place(bag,this.sites.case,.925);
    if(this.town.s.stage==='haul'||this.town.s.vinyl==='carrying'){
      const obj=this.town.s.stage==='haul'?this.props.amp:this.props.crate;
      obj.position.set(pos.x-.38*Math.cos(pos.a),this.sim.floor+.57,pos.z+.38*Math.sin(pos.a));
    }
    if(this.mixer){
      const m=this.mixer,phase=(m.phase+dt*.78)%1;
      if(phase<m.phase)m.locked=false;
      if(phase>=.36&&m.phase<.36)this.api.cue();
      m.phase=phase;this.api.meter(phase,m.hits);
    }
    if(this.town.tuner)this.town.tickTuner(dt);
    const goal=this.target;
    this.marker.visible=!!goal && !this.talk && distance(pos,goal)<150;
    if(this.marker.visible){this.place(this.marker,goal,2.27+.08*Math.sin(this.clock*2));this.marker.rotation.y=this.clock;}
  }
}
