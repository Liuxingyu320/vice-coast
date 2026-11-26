import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {inRing} from '../src/shiba/collision.js';

const home=pathToFileURL(path.resolve(process.env.GAME_HTML??'index.html')).href;
const old=JSON.parse(await readFile('assets/shiba-solids.json')).travelBoundary;
const browser=await chromium.launch({...process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{channel:'chrome'},
  args:process.platform==='darwin'?['--use-angle=metal']:[]});
const errors=[],requests=[],out=process.env.GAME_SCREENSHOTS;
if(out)await mkdir(out,{recursive:true});
async function open(pose){
  const ctx=await browser.newContext({viewport:{width:1280,height:800},offline:true});
  await ctx.addInitScript(p=>{if(!localStorage.getItem('vicecoast.shiba.street.1'))localStorage.setItem('vicecoast.shiba.street.1',JSON.stringify(p));},pose);
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error'&&/shader|webgl/i.test(e.text()))errors.push(e.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(home);
  await page.waitForFunction(()=>window.__app?.game&&!__app.game.loading&&getComputedStyle(document.querySelector('#loader')).visibility==='hidden',null,{timeout:90000});
  return {page,ctx};
}
const state=p=>p.evaluate(()=>{const g=__app.game;return {...g.pos,inCar:g.inCar,car:g.car&&{x:g.car.position.x,z:g.car.position.z},
  angle:g.yaw,floor:g.floor};});
async function forward(page,metres,run=false){
  const p=await state(page);
  if(run)await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  try{
    await page.waitForFunction(({p,metres})=>Math.hypot(__app.game.pos.x-p.x,__app.game.pos.z-p.z)>metres,{p,metres},{timeout:27000});
  }finally{
    await page.keyboard.up('w');if(run)await page.keyboard.up('Shift');
  }
}
async function board(page){
  await page.keyboard.press('g');await page.locator('select').selectOption('0');
  await page.getByRole('button',{name:'呼叫车辆',exact:true}).click();
  await page.waitForFunction(()=>__app.game.car&&!__app.game.ui.panel);
  const p=await state(page),d=Math.hypot(p.car.x-p.x,p.car.z-p.z);
  assert.ok(d<24);
  if(d>3.7){
    const heading=Math.atan2(p.x-p.car.x,p.z-p.car.z),diff=Math.atan2(Math.sin(heading-p.angle),Math.cos(heading-p.angle));
    await page.mouse.move(650,360);await page.mouse.down();await page.mouse.move(650-diff/.005,360);await page.mouse.up();
    await forward(page,d-3.0);
  }
  await page.keyboard.press('f');assert.ok((await state(page)).inCar);
}
async function photo(page,name){
  if(out)await page.screenshot({path:path.join(out,name+'.jpg'),type:'jpeg',quality:91});
}
try{
  // A saved on-foot position on a one-way street, four metres inside the former southern cut.
  const {page,ctx}=await open({x:138.51,z:723.075,a:1.46855});
  const start=await state(page);assert.ok(inRing(start.x,-start.z,old));assert.equal(start.car,null);
  await forward(page,13,true);
  const walked=await state(page);assert.ok(!inRing(walked.x,-walked.z,old));
  await board(page);await forward(page,42);
  const drove=await state(page);assert.ok(!inRing(drove.x,-drove.z,old));
  await photo(page,'越过旧边界后驾驶');
  await page.keyboard.press('m');
  await page.waitForFunction(()=>__app.game.streetMapAtlas&&__app.camera.layers.isEnabled(2));
  assert.match(await page.locator('#map-area').innerText(),/11\.98/);
  await page.waitForFunction(()=>document.querySelector('#district-toast').hidden,{},{timeout:20000});
  await photo(page,'港区全域地图');
  await page.getByRole('button',{name:'定位里科'}).click();
  assert.ok(await page.evaluate(()=>!__app.game.streetMapAtlas&&__app.camera.layers.isEnabled(0)));
  await page.getByRole('button',{name:'查看全域'}).click();
  await page.keyboard.press('m');assert.ok((await state(page)).inCar);
  await page.reload();await page.waitForFunction(()=>window.__app?.game&&!__app.game.loading,null,{timeout:90000});
  const restored=await state(page);
  assert.ok(Math.hypot(drove.x-restored.x,drove.z-restored.z)<6&&!restored.inCar);
  await ctx.close();
  const west=await open({x:-1285.56,z:-504.38,a:-2.59114});
  assert.match(await west.page.locator('#street-map b').innerText(),/六本木/);
  await board(west.page);await forward(west.page,18);
  assert.ok((await state(west.page)).x< -1200);
  await photo(west.page,'六本木街头驾驶');
  await west.ctx.close();
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('Offline Chrome: walked over the prior boundary, called a private car, drove 42 m outside, changed map scales, resumed the saved position, and drove in Roppongi.');
}finally{await browser.close();}
