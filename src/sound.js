// The radio is sequenced locally, including its synths and drum voices.
export class CoastAudio{
 constructor(){this.ctx=null;this.beat=0;this.next=0}
 init(){
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});return}
  try{const c=this.ctx=new Audio();this.master=c.createGain();this.master.gain.value=.46;this.master.connect(c.destination);
   this.motor=c.createOscillator();this.motor.type='sawtooth';this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=175;
   this.motorLevel=c.createGain();this.motorLevel.gain.value=0;this.motor.connect(this.filter).connect(this.motorLevel).connect(this.master);this.motor.start();
   this.noise=c.createBuffer(1,Math.floor(c.sampleRate*.25),c.sampleRate);const arr=this.noise.getChannelData(0);
   for(let i=0;i<arr.length;i++)arr[i]=(Math.random()-.5)*2;
  }catch{this.ctx=null}
 }
 tone(at,f,len,level,type='triangle',end=0){
  if(!this.ctx)return;const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f,at);if(end)o.frequency.exponentialRampToValueAtTime(end,at+len);
  g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(level,at+.009);g.gain.exponentialRampToValueAtTime(.0001,at+len);
  o.connect(g).connect(this.master);o.start(at);o.stop(at+len+.01);o.onended=()=>{o.disconnect();g.disconnect()};
 }
 hat(at,level,dur,cutoff){const c=this.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;f.type='highpass';f.frequency.value=cutoff;g.gain.setValueAtTime(level,at);g.gain.exponentialRampToValueAtTime(.0001,at+dur);s.connect(f).connect(g).connect(this.master);s.start(at);s.stop(at+dur);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect()}}
 chime(ok=true){if(!this.ctx)return;const at=this.ctx.currentTime;for(const [i,f] of (ok?[392,494,587]:[185,139]).entries())this.tone(at+i*.09,f,.22,.08)}
 venue(zone,sound){
  if(!this.ctx)return;const t=this.ctx.currentTime;
  if(!zone||!sound){this.roomNext=0;return}
  if(this.roomZone!==zone||!this.roomNext||this.roomNext<t-.2){this.roomNext=t+.025;this.roomBeat=0}
  this.roomZone=zone;const club=zone==='club';
  while(this.roomNext<t+.12){const beat=this.roomBeat++,at=this.roomNext,n=beat%8,root=(club?[110,130.81,98,146.83]:[146.83,174.61,130.81,164.81])[Math.floor(beat/16)%4];
   if(n%2===0)this.tone(at,club?95:130,club?.15:.12,club?.084:.035,'sine',44);
   if(n%4===2)this.hat(at,club?.035:.012,.085,1700);
   if(n%2)this.hat(at,.011,.045,6100);
   if(n%4===0)this.tone(at,root/2,.38,club?.047:.029,'triangle');
   if([0,3,5].includes(n))this.tone(at,root*(n===0?2:n===3?2.5:3),.37,club?.021:.031,'sine');
   this.roomNext+=60/(club?112:84)/2;
  }
 }
 cue(){if(this.ctx)this.tone(this.ctx.currentTime,115,.14,.11,'sine',43)}
 update(active,save,speed,gas,driving,track=null){
  if(!this.ctx)return;const c=this.ctx,t=c.currentTime;
  this.master.gain.setTargetAtTime(save.sound?.46:0,t,.04);this.motorLevel.gain.setTargetAtTime(active&&driving?(gas?.047:.02):0,t,.06);
  this.motor.frequency.setTargetAtTime(32+(Math.abs(speed)%14)*2.7+(gas?9:0),t,.09);
  if(!active||!save.sound||(!save.radio&&!track)||!driving){this.next=t;return}
  if(this.next<t)this.next=t+.02;
  const show=track??save.midnight?.outcome;
  const bass=show==='live'?[146.83,174.61,130.81,164.81]:show==='sponsor'?[164.81,220,196,146.83]:[130.81,103.83,155.56,116.54];
  const arp=show==='live'?[0,3,7,10,12,7,5,3]:show==='sponsor'?[12,7,4,7,12,16,14,7]:[0,7,12,15,7,10,12,7];
  while(this.next<t+.16){
   const beat=this.beat++,n=beat%16,root=bass[Math.floor(beat/16)%4],at=this.next;
   if(n%4===0)this.tone(at,94,.16,.105,'sine',41);
   if(n%4===2)this.hat(at,.047,.1,1400);this.hat(at,.021,n%2?.049:.027,6100);
   if(n%2===0)this.tone(at,root/2*(n%8===6?1.5:1),.21,.057,'triangle');
   const variation=show==='sideb'?5:show?.startsWith('tape')?Number(show.slice(4))+1:0;this.tone(at,root*Math.pow(2,(arp[(beat+variation)%8]+variation)/12)*2,.23,.024,variation?'triangle':'sine');
   if(n===0)for(const m of [0,3,7])this.tone(at,root*Math.pow(2,m/12),1.4,.013,'triangle');
   this.next+=60/(show==='live'?88:show==='sponsor'?118:104)/2;
  }
 }
}
