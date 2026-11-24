import bumpClip from '../assets/vehicle-bump.wav';
import crashClip from '../assets/vehicle-crash.wav';
import scrapeClip from '../assets/vehicle-scrape.wav';

// The radio is sequenced locally, including its synths and drum voices.
export class CoastAudio{
 constructor(){this.ctx=null;this.beat=0;this.next=0;this.voices=[];this.roomVoices=[];this.collisionVoices=new Set();this.scrapes=new Map()}
 init(){
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});return}
  try{const c=this.ctx=new Audio();this.master=c.createGain();this.master.gain.value=.46;this.master.connect(c.destination);
   this.motor=c.createOscillator();this.motor.type='sawtooth';this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=175;
   this.motorLevel=c.createGain();this.motorLevel.gain.value=0;this.motor.connect(this.filter).connect(this.motorLevel).connect(this.master);this.motor.start();
   this.siren=c.createOscillator();this.siren.type='triangle';this.siren.frequency.value=630;
   this.sirenLevel=c.createGain();this.sirenLevel.gain.value=0;this.siren.connect(this.sirenLevel).connect(this.master);this.siren.start();
   this.noise=c.createBuffer(1,Math.floor(c.sampleRate*.25),c.sampleRate);const arr=this.noise.getChannelData(0);
   for(let i=0;i<arr.length;i++)arr[i]=(Math.random()-.5)*2;
  }catch{this.ctx=null}
  if(this.ctx)this.loadVehicleSamples().catch(error=>console.warn('Could not decode vehicle audio',error));
 }
 cut(list){
  if(!list.length)return;const t=this.ctx?this.ctx.currentTime:0,pending=list.splice(0,list.length);
  for(const voice of pending){try{voice.node.stop(Math.max(t,voice.at))}catch{}try{voice.node.disconnect()}catch{}}
 }
 tone(at,f,len,level,type='triangle',end=0,bucket=null){
  if(!this.ctx)return;const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f,at);if(end)o.frequency.exponentialRampToValueAtTime(end,at+len);
  g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(level,at+.009);g.gain.exponentialRampToValueAtTime(.0001,at+len);
  o.connect(g).connect(this.master);o.start(at);o.stop(at+len+.01);if(bucket)bucket.push({node:o,at});
  o.onended=()=>{o.disconnect();g.disconnect();if(!bucket)return;const i=bucket.findIndex(v=>v.node===o);if(i>=0)bucket.splice(i,1)};
 }
 hat(at,level,dur,cutoff,bucket=null){const c=this.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;f.type='highpass';f.frequency.value=cutoff;g.gain.setValueAtTime(level,at);g.gain.exponentialRampToValueAtTime(.0001,at+dur);s.connect(f).connect(g).connect(this.master);s.start(at);s.stop(at+dur);if(bucket)bucket.push({node:s,at});s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();if(!bucket)return;const i=bucket.findIndex(v=>v.node===s);if(i>=0)bucket.splice(i,1)}}
 chime(ok=true){if(!this.ctx)return;const at=this.ctx.currentTime;for(const [i,f] of (ok?[392,494,587]:[185,139]).entries())this.tone(at+i*.09,f,.22,.08)}
 venue(zone,sound){
  if(!this.ctx)return;const t=this.ctx.currentTime;
  if(!zone||!sound){if(sound)this.cut(this.roomVoices);this.roomNext=0;if(!zone)this.roomZone=null;return}
  if(this.roomZone!==zone||!this.roomNext||this.roomNext<t-.2){if(this.roomZone!==zone)this.cut(this.roomVoices);this.roomNext=t+.025;this.roomBeat=0}
  this.roomZone=zone;const club=zone==='club',voices=this.roomVoices;
  while(this.roomNext<t+.12){const beat=this.roomBeat++,at=this.roomNext,n=beat%8,root=(club?[110,130.81,98,146.83]:[146.83,174.61,130.81,164.81])[Math.floor(beat/16)%4];
   if(n%2===0)this.tone(at,club?95:130,club?.15:.12,club?.084:.035,'sine',44,voices);
   if(n%4===2)this.hat(at,club?.035:.012,.085,1700,voices);
   if(n%2)this.hat(at,.011,.045,6100,voices);
   if(n%4===0)this.tone(at,root/2,.38,club?.047:.029,'triangle',0,voices);
   if([0,3,5].includes(n))this.tone(at,root*(n===0?2:n===3?2.5:3),.37,club?.021:.031,'sine',0,voices);
   this.roomNext+=60/(club?112:84)/2;
  }
 }
 cue(){if(this.ctx)this.tone(this.ctx.currentTime,115,.14,.11,'sine',43)}
 async loadVehicleSamples(){
  const c=this.ctx;
  const [bump,crash,scrape]=await Promise.all([bumpClip,crashClip,scrapeClip]
   .map(bytes=>c.decodeAudioData(bytes.slice().buffer)));
  const bus=c.createDynamicsCompressor();
  bus.threshold.value=-9;bus.knee.value=8;bus.ratio.value=10;
  bus.attack.value=.002;bus.release.value=.14;
  bus.connect(this.master);
  this.collisionBus=bus;this.vehicleSamples={bump,crash,scrape};
 }
 collisionChannel(pan){
  const c=this.ctx,gain=c.createGain(),panner=c.createStereoPanner?.();
  gain.gain.value=0;
  if(panner){panner.pan.value=pan;gain.connect(panner).connect(this.collisionBus)}else gain.connect(this.collisionBus);
  return {gain,panner};
 }
 collisionHit({kind,strength},volume,pan){
  const c=this.ctx,{gain,panner}=this.collisionChannel(pan),hard=strength>=.52;
  const source=c.createBufferSource(),filter=c.createBiquadFilter();
  source.buffer=hard?this.vehicleSamples.crash:this.vehicleSamples.bump;
  source.playbackRate.value=(hard?.92:.99)+Math.random()*.12;
  filter.type='lowpass';filter.frequency.value=kind==='vehicle'?(hard?9200:5200):(hard?3400:2000);
  gain.gain.value=volume;
  source.connect(filter).connect(gain);
  this.collisionVoices.add(source);
  source.onended=()=>{this.collisionVoices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();panner?.disconnect()};
  source.start();
 }
 stopScrape(key,voice){
  const at=this.ctx.currentTime;
  this.scrapes.delete(key);
  voice.gain.gain.setTargetAtTime(0,at,.012);
  voice.source.stop(at+.055);
 }
 stopVehicleContacts(){
  if(!this.ctx)return;
  const at=this.ctx.currentTime;
  for(const source of this.collisionVoices)source.stop(at);
  this.collisionVoices.clear();
  for(const [key,voice] of this.scrapes)this.stopScrape(key,voice);
 }
 vehicleContacts(enabled,impacts,scrapes,camera,time){
  if(!enabled){this.stopVehicleContacts();return}
  if(this.ctx?.state!=='running'||!this.vehicleSamples||(!impacts?.length&&!scrapes?.size&&!this.scrapes.size))return;
  const c=this.ctx,at=c.currentTime;
  camera.updateMatrixWorld();
  const [rightX,,rightZ]=camera.matrixWorld.elements,listener=camera.position;
  const audible=event=>{
   const dx=event.x-listener.x,dz=event.z-listener.z,distance=Math.hypot(dx,dz);
   const gain=Math.pow(Math.max(0,1-Math.max(0,distance-8)/34),1.5);
   return {gain,pan:Math.max(-.85,Math.min(.85,(dx*rightX+dz*rightZ)/Math.max(distance,3)))};
  };
  const hits=(impacts??[]).map(hit=>({...hit,...audible(hit)})).sort((a,b)=>b.gain*b.strength-a.gain*a.strength);
  for(const hit of hits){
   if(this.collisionVoices.size>=5)break;
   if(hit.gain>.015)this.collisionHit(hit,(.28+.94*Math.pow(hit.strength,.78))*hit.gain,hit.pan);
  }
  const active=new Set();
  const slides=Array.from(scrapes??[],([key,event])=>({key,...event,...audible(event)}))
   .filter(event=>time-event.at<=.12&&event.gain>.015&&event.strength>0)
   .sort((a,b)=>b.gain*b.strength-a.gain*a.strength).slice(0,3);
  for(const slide of slides){
   active.add(slide.key);
   let voice=this.scrapes.get(slide.key);
   if(!voice){
    const {gain,panner}=this.collisionChannel(slide.pan),source=c.createBufferSource(),filter=c.createBiquadFilter();
    source.buffer=this.vehicleSamples.scrape;source.loop=true;filter.type='lowpass';
    source.connect(filter).connect(gain);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();panner?.disconnect()};
    voice={source,filter,gain,panner};this.scrapes.set(slide.key,voice);source.start(at);
   }
   voice.filter.frequency.setTargetAtTime((slide.kind==='vehicle'?2600:1350)+1200*slide.strength,at,.06);
   voice.source.playbackRate.setTargetAtTime(.83+.48*slide.strength,at,.06);
   voice.gain.gain.setTargetAtTime(.32*slide.gain*Math.sqrt(slide.strength),at,.035);
   voice.panner?.pan.setTargetAtTime(slide.pan,at,.045);
  }
  for(const [key,voice] of this.scrapes)if(!active.has(key))this.stopScrape(key,voice);
 }
 update(active,save,speed,gas,driving,track=null,patrolDistance=Infinity){
  if(!this.ctx)return;const c=this.ctx,t=c.currentTime;
  if(!active||!save.sound)this.stopVehicleContacts();
  this.master.gain.setTargetAtTime(save.sound?.46:0,t,.04);this.motorLevel.gain.setTargetAtTime(active&&driving?(gas?.047:.02):0,t,.06);
  this.motor.frequency.setTargetAtTime(32+(Math.abs(speed)%14)*2.7+(gas?9:0),t,.09);
  const siren=active&&save.sound?Math.max(0,1-patrolDistance/68):0;
  this.sirenLevel.gain.setTargetAtTime(.085*siren*siren,t,.10);
  if(siren>0)this.siren.frequency.setTargetAtTime(685+235*Math.sin(t*5.2),t,.04);
  const show=track??save.midnight?.outcome;
  if(!active||!save.sound||(!save.radio&&!track)||!driving){if(save.sound)this.cut(this.voices);this.next=t;return}
  if(this.tune!==track||this.show!==show){this.cut(this.voices);this.tune=track;this.show=show;this.next=t}
  if(this.next<t)this.next=t+.02;
  const bass=show==='live'?[146.83,174.61,130.81,164.81]:show==='sponsor'?[164.81,220,196,146.83]:[130.81,103.83,155.56,116.54];
  const arp=show==='live'?[0,3,7,10,12,7,5,3]:show==='sponsor'?[12,7,4,7,12,16,14,7]:[0,7,12,15,7,10,12,7];
  const voices=this.voices;
  while(this.next<t+.16){
   const beat=this.beat++,n=beat%16,root=bass[Math.floor(beat/16)%4],at=this.next;
   if(n%4===0)this.tone(at,94,.16,.105,'sine',41,voices);
   if(n%4===2)this.hat(at,.047,.1,1400,voices);this.hat(at,.021,n%2?.049:.027,6100,voices);
   if(n%2===0)this.tone(at,root/2*(n%8===6?1.5:1),.21,.057,'triangle',0,voices);
   const variation=show==='sideb'?5:show?.startsWith('tape')?Number(show.slice(4))+1:0;this.tone(at,root*Math.pow(2,(arp[(beat+variation)%8]+variation)/12)*2,.23,.024,variation?'triangle':'sine',0,voices);
   if(n===0)for(const m of [0,3,7])this.tone(at,root*Math.pow(2,m/12),1.4,.013,'triangle',0,voices);
   this.next+=60/(show==='live'?88:show==='sponsor'?118:104)/2;
  }
 }
}
