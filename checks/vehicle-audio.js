import {PerspectiveCamera} from 'three';
import {CoastAudio} from '../src/sound.js';

async function fixture(){
 const audio=new CoastAudio(),context=new OfflineAudioContext(2,57600,48000);
 audio.ctx=context;
 // Render the same voice graph offline without a browser autoplay gesture.
 Object.defineProperty(context,'state',{value:'running'});
 audio.master=context.createGain();
 audio.master.gain.value=.46;
 audio.master.connect(context.destination);
 await audio.loadVehicleSamples();
 return {audio,context,camera:new PerspectiveCamera()};
}

function energy(buffer,channel,start,end){
 const samples=buffer.getChannelData(channel);
 let sum=0;
 for(let i=start;i<end;i++)sum+=samples[i]*samples[i];
 return sum/(end-start);
}

export async function checkVehicleAudio(check){
 const tap={x:3,z:0,kind:'vehicle',strength:.2},crash={...tap,strength:.9};
 const [light,heavy,scrape,silent,pileup]=await Promise.all([fixture(),fixture(),fixture(),fixture(),fixture()]);
 light.audio.vehicleContacts(true,[tap],null,light.camera,0);
 heavy.audio.vehicleContacts(true,[crash],null,heavy.camera,0);
 const slides=new Map([['a-b',{...tap,strength:.7,at:1}]]);
 scrape.audio.vehicleContacts(true,[],slides,scrape.camera,1);
 const first=scrape.audio.scrapes.get('a-b');
 scrape.audio.vehicleContacts(true,[],slides,scrape.camera,1.105);
 check(first&&scrape.audio.scrapes.get('a-b')===first,'Scrape disappears or starts another voice during a slow frame');
 silent.audio.vehicleContacts(true,[{...crash,x:100}],null,silent.camera,0);
 silent.audio.vehicleContacts(false,[crash],slides,silent.camera,1);
 pileup.audio.vehicleContacts(true,Array(8).fill(crash),slides,pileup.camera,1);
 check(pileup.audio.collisionVoices.size===5,'Simultaneous collisions exceed the voice limit');
 const [tapBuffer,crashBuffer,scrapeBuffer,silentBuffer,pileupBuffer]=await Promise.all(
  [light,heavy,scrape,silent,pileup].map(({context})=>context.startRendering()));
 check(energy(tapBuffer,1,300,4800)>.0005,'A light contact lacks a loud, immediate hit');
 check(energy(crashBuffer,1,300,12000)>energy(tapBuffer,1,300,12000)*1.5,'Hard contact is no stronger than light contact');
 check(energy(crashBuffer,1,24000,34000)>.00005&&energy(tapBuffer,1,24000,34000)===0,'Hard contact lacks the longer debris tail');
 check(energy(crashBuffer,1,300,9500)>energy(crashBuffer,0,300,9500),'Collision panning ignores the contact position');
 check(energy(scrapeBuffer,1,38000,53000)>.00001,'The metal scrape does not loop audibly');
 check(energy(silentBuffer,1,0,57600)===0,'Muted or far-away collision leaks audio');
 check(pileupBuffer.getChannelData(1).every(sample=>Math.abs(sample)<1),'A pile-up clips the collision mix');
 const stop=await fixture();
 stop.audio.vehicleContacts(true,[],slides,stop.camera,1);
 stop.audio.vehicleContacts(true,[],slides,stop.camera,1.13);
 check(stop.audio.scrapes.size===0,'Scrape does not stop after separation');
 stop.audio.vehicleContacts(true,[crash],slides,stop.camera,1);
 stop.audio.stopVehicleContacts();
 check(!stop.audio.scrapes.size&&!stop.audio.collisionVoices.size,'Pause leaves vehicle collision voices active');
 await stop.context.startRendering();
}
