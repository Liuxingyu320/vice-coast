import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readArchives} from '../src/shiba/district/archive.js';
import {decodeTile} from '../src/shiba/district/tile.js';
import {buildNavigation} from '../src/shiba/district/navigation.js';
import {chapterSites,nightSites,streetSpawn,fitSites} from '../src/shiba/district/district-places.js';

const html=await readFile(process.env.GAME_HTML??'index.html','utf8');
const packs=[...html.matchAll(/data-game-pack="(?:district|cast)">([^<]+)<\/script>/g)].map(m=>m[1]);
assert.equal(packs.length,2);
const archive=readArchives(packs),text=new TextDecoder(),json=name=>JSON.parse(text.decode(archive.read(name+'.json')));
const manifest=json('manifest'),layout=json('layout'),physical=json('physical'),steps=json('steps'),decks=json('decks');
assert.equal(manifest.version,1);assert.equal(manifest.cellSize,160);
assert.ok(manifest.stats.outlines>10000);assert.ok(manifest.stats.degenerate>0);
assert.ok(layout.landUse.some(a=>a.kind==='parking'));assert.ok(layout.landUse.some(a=>a.kind==='park'));
assert.ok(!manifest.layers.some(name=>/parked|vehicle|truck|traffic|sedan|car\b/i.test(name)));
for(const name of ['rico','mara','marlin-turbo','street-fleet'])assert.ok(archive.has('studio/'+name+'.glb'));
for(const material of manifest.materials){
  for(const key of ['map','normal','mr','emissiveMap'])if(material[key])assert.ok(archive.has(material[key]),material[key]);
}
const names=new Set(),landmarks=new Map();let detailTriangles=0,coarseTriangles=0;
for(const tile of manifest.tiles){
  assert.ok(!names.has(tile.id));names.add(tile.id);
  for(const part of decodeTile(archive.read(tile.id+'.bin'))){
    const {position,normal,uv}=part.attributes;
    assert.equal(position.array.length,part.vertices*3);assert.ok(position.array.every(Number.isFinite));
    assert.equal(normal.array.length,part.vertices*3);
    if(uv)assert.ok(uv.array.every(Number.isFinite));
    assert.ok(part.index.every(i=>i<part.vertices));assert.equal(part.index.length%3,0);
    if(tile.id.startsWith('blocks/')){
      assert.equal(part.material,-1);coarseTriangles+=part.index.length/3;
    }else{
      assert.ok(manifest.materials[part.material]);detailTriangles+=part.index.length/3;
    }
    if(tile.id.startsWith('sites/')){
      const bounds=landmarks.get(tile.id)??[Infinity,-Infinity];
      for(let i=1;i<position.array.length;i+=3){bounds[0]=Math.min(bounds[0],position.array[i]);bounds[1]=Math.max(bounds[1],position.array[i]);}
      landmarks.set(tile.id,bounds);
    }
  }
}
assert.equal(detailTriangles,manifest.stats.triangles);
assert.equal(manifest.stats.sourceTriangles,detailTriangles+manifest.stats.degenerate);
assert.ok(coarseTriangles>manifest.stats.outlines*6);
assert.deepEqual([...landmarks.keys()].sort(),['sites/daimon-gate','sites/sangedatsumon-gate','sites/tower-lattice']);
assert.ok(landmarks.get('sites/tower-lattice')[1]>345);
assert.ok(landmarks.get('sites/sangedatsumon-gate')[1]>23);
const nav=buildNavigation(layout,physical,steps,decks);
assert.ok(nav.canWalk(streetSpawn.x,-streetSpawn.z));
const before=JSON.parse(await readFile('assets/shiba-solids.json','utf8')).travelBoundary;
const edge=physical.travelBoundary;
assert.ok(edge.length<before.length);
for(const [x,y] of before)assert.ok(nav.boundary.locate(x,y).distance<=.241,'Boundary moved by more than 24 cm');
assert.ok(nav.boundary.locate(streetSpawn.x,-streetSpawn.z).inside);
const outside=nav.boundary.locate(manifest.bounds.maxX+500,0);
assert.equal(outside.inside,false);assert.ok(nav.boundary.locate(outside.x,outside.y).inside);
for(const [start,end,fromY,toY] of [[400,425,-142.62,-145.745],[400,425,-146.52,-149.645],
  [400,425,-150.42,-153.545],[635,650,-175.1,-176.975]]){
  for(let x=start;x<=end;x+=.3)assert.ok(nav.canWalk(x,fromY+(toY-fromY)*(x-start)/(end-start)),'Blocked gate at '+x);
}
for(const [x,y] of [[406.406,-157.15],[644.639,-180.928],[-9.58,-442.90]])assert.equal(nav.canWalk(x,y),false);
for(const sites of [chapterSites,nightSites]){
  for(const [id,site] of Object.entries(fitSites(sites,nav))){
    assert.ok(nav.canWalk(site.x,-site.z));assert.ok(Math.hypot(site.x-sites[id].x,site.z-sites[id].z)<14,id);
  }
}
const delivery=nav.roadNear(streetSpawn.x,-streetSpawn.z);assert.ok(delivery&&delivery.dist<60);
for(let d=0;d<=7;d+=.5)assert.ok(!nav.vehicleContact(delivery,delivery.x+d*delivery.dx,delivery.y+d*delivery.dy,delivery.heading));
const surfaces=decks.filter(d=>Math.abs(d[2]-d[5])<.15&&Math.abs(d[2]-d[8])<.15);
assert.ok(surfaces.some(d=>{
  const x=(d[0]+d[3]+d[6])/3,y=(d[1]+d[4]+d[7])/3,h=(d[2]+d[5]+d[8])/3,g=nav.ground(x,-y);
  return h>g+3&&nav.support(x,y,h).layer==='bridge'&&nav.support(x,y,g).z<h-2;
}),'Elevated bridge and ground must remain distinct');
console.log(manifest.tiles.length+' map tiles, '+detailTriangles+' detailed triangles, '+manifest.stats.outlines+' distant building outlines. Boundary alignment, three temple passages, Daimon, walking sites, bridge levels and garage delivery passed.');
