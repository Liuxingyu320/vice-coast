import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const home=pathToFileURL(path.resolve(process.env.GAME_HTML??'index.html')).href;
const out=process.env.GAME_SCREENSHOTS;
if(out)await mkdir(out,{recursive:true});
const browser=await chromium.launch({...process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{channel:'chrome'},
  args:process.platform==='darwin'?['--use-angle=metal']:[]});
const errors=[],external=[];
function watch(page){
  page.on('console',m=>{if(m.type()==='error'&&/shader|webgl/i.test(m.text()))errors.push(m.text());});
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
  page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
}
async function ready(page){
  await page.waitForFunction(()=>window.__app?.game && !__app.game.loading && __app.streamer.count > 0
    &&document.getElementById('loader')?.getBoundingClientRect()&&getComputedStyle(document.getElementById('loader')).visibility==='hidden',null,{timeout:100000});
}
async function photo(page,name){
  if(out)await page.screenshot({path:path.join(out,name+'.jpg'),quality:89,type:'jpeg'});
}
async function snap(page){
  return page.evaluate(()=>{const g=__app.game;return {pos:{...g.pos},inCar:g.inCar,car:g.car?.name??null,stage:g.story.s.stage,
    money:g.save.money,speed:g.speed,map:g.isMap,near:g.story.nearby(),camera:g.camera.position.distanceTo(g.hero.position)};});
}
async function walkTo(page,to,range=2.35){
  // The collision mesh supplies waypoints. Actual camera drags and keyboard input steer Rico.
  for(let leg=0;leg<45;leg++){
    const next=await page.evaluate(({to,range})=>{
      const g=__app.game,p=g.pos,goal=to==='car'?g.car.position:to.startsWith('night-')?g.story.nightSites[to.slice(6)]:g.story.sites[to];
      const distance=(x,z)=>Math.hypot(goal.x-x,goal.z-z);
      if(distance(p.x,p.z)<=range+.015)return {done:true};
      const step=.95,origin={...p},world=(i,j)=>[origin.x+i*step,origin.z+j*step];
      const clear=(x,z)=>g.onFoot(x,z)&&[[.22,0],[-.22,0],[0,.22],[0,-.22]].every(([dx,dz])=>g.onFoot(x+dx,z+dz));
      const line=(x,z,xx,zz)=>{
        const n=Math.max(1,Math.ceil(Math.hypot(xx-x,zz-z)/.20));
        for(let i=1;i<=n;i++){const t=i/n;if(!clear(x+(xx-x)*t,z+(zz-z)*t))return false;}
        return true;
      };
      const start={i:0,j:0,cost:0,score:distance(p.x,p.z),prev:null},queue=[start],visited=new Map([['0,0',0]]);
      let target=null;
      while(queue.length&&visited.size<17000){
        queue.sort((a,b)=>b.score-a.score);const node=queue.pop(),[x,z]=world(node.i,node.j);
        if(distance(x,z)<range-.5){target=node;break;}
        for(const [i,j] of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]]){
          const ni=node.i+i,nj=node.j+j,[xx,zz]=world(ni,nj);
          const cost=node.cost+Math.hypot(i,j)*step,id=ni+','+nj;
          if((visited.get(id)??Infinity)<=cost+.001||!line(x,z,xx,zz))continue;
          visited.set(id,cost);queue.push({i:ni,j:nj,cost,score:cost+distance(xx,zz),prev:node});
        }
      }
      if(!target)throw Error('No pedestrian route from '+JSON.stringify(p)+' to '+to);
      let waypoint=target;
      while(waypoint.prev){
        const [x,z]=world(waypoint.i,waypoint.j);
        if(line(p.x,p.z,x,z))break;
        waypoint=waypoint.prev;
      }
      const [x,z]=world(waypoint.i,waypoint.j),dx=x-p.x,dz=z-p.z;
      const angle=Math.atan2(-dx,-dz)-g.yaw;
      return {turn:Math.atan2(Math.sin(angle),Math.cos(angle)),x,z,origin,len:Math.hypot(dx,dz)};
    },{to,range});
    if(next.done)return;
    const x=640,y=340;
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x-next.turn/.005,y);await page.mouse.up();await page.keyboard.down('Shift');await page.keyboard.down('w');
    try{
      await page.waitForFunction(({x,z,origin,len})=>{
        const p=__app.game.pos,projection=((p.x-origin.x)*(x-origin.x)+(p.z-origin.z)*(z-origin.z))/len;
        return Math.hypot(x-p.x,z-p.z)<.48||projection>=len-.3;
      },next,{timeout:Math.max(9000,next.len*2200)});
    }finally{await page.keyboard.up('w');await page.keyboard.up('Shift');}
  }
  throw Error('Could not finish walk to '+to);
}
const choose=(p,name)=>p.getByRole('button',{name,exact:true}).click();
async function interact(p,goal,...answers){
  await walkTo(p,goal);await p.keyboard.press('e');
  for(const name of answers)await choose(p,name);
}
try{
  const context=await browser.newContext({viewport:{width:1280,height:800},offline:true});
  const page=await context.newPage();watch(page);await page.goto(home);await ready(page);
  const first=await snap(page);
  assert.equal(first.inCar,false);assert.equal(first.car,null);assert.equal(first.map,false);
  assert.equal(first.near,'intro');assert.ok(first.camera>1&&first.camera<8);
  assert.deepEqual(await page.evaluate(()=>__app.manifest.layers.filter(k=>/vehicle|car|truck|bus(?!Stop)/i.test(k))),[]);
  assert.equal(await page.locator('.lil-gui,#mode,#github,#hud,#histogram').count(),0);
  await photo(page,'芝公园步行开局');
  await page.keyboard.press('e');await page.getByRole('button',{name:'老维克怎么说？'}).waitFor();
  assert.equal(await page.locator('#speaker').textContent(),'玛拉');await photo(page,'玛拉对话');
  await choose(page,'老维克怎么说？');await choose(page,'接下这桩事');
  assert.equal((await snap(page)).stage,'sleeve');
  await interact(page,'sleeve','翻到有签名的 B 面','收好封套，去俱乐部');
  const before=await snap(page);assert.equal(before.stage,'ride');assert.ok(Math.hypot(before.pos.x-first.pos.x,before.pos.z-first.pos.z)>2);
  await page.keyboard.press('m');await page.locator('#back-to-character').waitFor();
  assert.ok(await page.locator('#map-player').isVisible());assert.ok(await page.locator('#map-objective').isVisible());
  await page.waitForFunction(()=>__app.streamer.jobs.length===0);
  await photo(page,'游戏街区地图');
  const clamped=await page.evaluate(()=>{
    const g=__app.game,ref=g.controls.target,dx=240-ref.x,dz=g.manifest.bounds.maxZ+180-ref.z;
    ref.x+=dx;ref.z+=dz;g.camera.position.x+=dx;g.camera.position.z+=dz;g.updateMap();
    const e=g.nav.boundary.locate(ref.x,-ref.z);
    return g.outline.visible&&e.inside&&e.distance<.01;
  });
  assert.ok(clamped);await page.waitForFunction(()=>{
    const {streamer,controls}=__app;
    return Math.hypot(streamer.centerX-controls.target.x,streamer.centerZ-controls.target.z)<1&&streamer.jobs.length===0;
  });
  await photo(page,'街区可游玩边界');await page.click('#back-to-character');
  assert.deepEqual((await snap(page)).pos,before.pos);assert.equal((await snap(page)).map,false);
  await page.keyboard.press('g');await page.locator('select').selectOption('0');await choose(page,'呼叫车辆');
  await page.waitForFunction(()=>!!__app.game.car&&!__app.game.ui.panel);
  assert.equal((await snap(page)).car,'MARLIN TURBO');assert.equal((await snap(page)).inCar,false);
  await walkTo(page,'car',3.25);await page.keyboard.press('f');assert.equal((await snap(page)).inCar,true);
  const parked=(await snap(page)).pos;
  await page.keyboard.down('w');try{await page.waitForFunction(p=>Math.hypot(__app.game.pos.x-p.x,__app.game.pos.z-p.z)>6,parked,{timeout:20000});}finally{await page.keyboard.up('w');}
  assert.ok((await snap(page)).speed>2);await photo(page,'车库叫车后驾驶');
  await page.keyboard.down('Space');try{await page.waitForFunction(()=>Math.abs(__app.game.speed)<1.5);}finally{await page.keyboard.up('Space');}
  await page.keyboard.press('f');assert.equal((await snap(page)).inCar,false);
  await page.reload();await ready(page);assert.equal((await snap(page)).stage,'ride');assert.equal((await snap(page)).car,null);
  console.log('Street spawn, movement, choices, map, garage, original driving, exit and reload passed.');
  await interact(page,'ride','谈条件');await interact(page,'deal','给他看两个人的签名','握手成交');
  await interact(page,'case','拿上母带，带玛拉离开');await interact(page,'escape','让老维克接电话');
  await interact(page,'return','把私账归还乐手　＋$400');
  assert.equal((await snap(page)).money,400);assert.equal((await snap(page)).stage,'done');
  console.log('Walked the complete original ledger chapter in Shiba and received $400.');
  await interact(page,'night-new','把午夜档接回来');
  await interact(page,'night-door','从正门去吧台');
  await interact(page,'night-bar','把首版带到调音台');
  await interact(page,'night-needle','让整段掌声放完');
  await interact(page,'night-card','装好磁卡，到公园转播点接台');
  await interact(page,'night-dial');
  await page.locator('#freq').focus();await page.keyboard.press('Home');
  for(let i=0;i<12;i++)await page.keyboard.press('ArrowRight');
  await page.locator('#phase').focus();await page.keyboard.press('End');
  for(let i=0;i<4;i++)await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#phase').inputValue(),'60');
  await page.waitForFunction(()=>__app.game.story.town.s.stage==='offer');
  await interact(page,'night-offer','推起玛拉的现场原声　＋$500');
  assert.equal((await snap(page)).money,900);
  assert.equal(await page.evaluate(()=>__app.game.story.town.s.outcome),'live');
  console.log('Walked the Midnight Radio chapter, tuned FM 98.4 and received $500.');
  const details=await page.evaluate(wantPhoto=>{
    const g=__app.game,edge=g.nav.boundary.rings[0],saved={...g.pos};
    let near;
    for(const [x,y] of edge){
      near=[[x+2,y],[x-2,y],[x,y+2],[x,y-2]].find(([a,b])=>g.nav.canWalk(a,b));
      if(near)break;
    }
    g.pos.x=near[0];g.pos.z=-near[1];g.ui.refresh();const hint=!document.getElementById('street-boundary').hidden;
    Object.assign(g.pos,saved);g.ui.refresh();
    const stickers=['唱片摊标签','电台机身贴'].map(n=>g.scene.getObjectByName(n));
    const aligned=stickers.every(m=>m?.material.polygonOffset&&m.material.map.generateMipmaps)
      &&Math.abs(stickers[0].position.y-(.87+.09/2))<.003
      &&Math.abs(stickers[1].position.z-.53/2)<.003;
    let photo;
    if(wantPhoto){
      const cam=g.camera.clone(),point=stickers[0].getWorldPosition(cam.position.clone());
      cam.position.copy(point);cam.position.x+=.36;cam.position.y+=.64;cam.position.z+=.55;
      cam.lookAt(point);cam.updateMatrixWorld();g.renderer.render(g.scene,cam);
      photo=g.renderer.domElement.toDataURL('image/jpeg',.91);g.renderer.render(g.scene,g.camera);
    }
    return {hint,aligned,photo};
  },!!out);
  assert.ok(details.hint);assert.ok(details.aligned);
  if(out)await writeFile(path.join(out,'唱片摊贴纸.jpg'),Buffer.from(details.photo.split(',')[1],'base64'));
  console.log('Verified map panning at the street boundary, proximity feedback and surface-mounted decals.');
  await page.keyboard.press('p');await choose(page,'原作章节与委托');
  await page.locator('#story').waitFor();assert.equal(new URL(page.url()).searchParams.get('mode'),'original');
  await page.click('#story');await page.waitForFunction(()=>!document.getElementById('worldview').hidden&&document.getElementById('menu').hidden,null,{timeout:60000});
  assert.ok(await page.locator('#scene').isVisible());console.log('Original game entered 3D gameplay using the shared chapter save.');
  await context.close();
  const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1,offline:true});
  const phone=await mobile.newPage();watch(phone);await phone.goto(home);await ready(phone);
  const dir=phone.getByRole('button',{name:'前进',exact:true});assert.ok(await dir.isVisible());
  const start=(await snap(phone)).pos,box=await dir.boundingBox(),client=await mobile.newCDPSession(phone);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  await phone.waitForFunction(p=>Math.hypot(__app.game.pos.x-p.x,__app.game.pos.z-p.z)>.8,start);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await phone.locator('#street-action').tap();assert.equal(await phone.locator('#speaker').textContent(),'玛拉');
  await mobile.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Mobile touch movement and conversation passed offline.');
}finally{await browser.close();}
