import {surveyHeight} from '../../src/shiba/terrain.js';

const roadLayers={asphalt:['paving-district-asphalt','Cold asphalt'],walk:['paving-district-walk','Permeable pavers'],
  paint:['paving-district-stripe','White paint'],parking:['paving-district-lot','Cold asphalt']};

function push(parts,key,part){
  if(!parts.has(key))parts.set(key,[]);
  parts.get(key).push(part);
}

// Preprocessed vertices are in centimetres east/north/elevation. Keep every clipped intersection shared.
function makePart(xyz,indices,layer,material,uvAt){
  const position=new Float32Array(xyz.length),normal=new Int8Array(xyz.length),uv=new Float32Array(xyz.length/3*2);
  for(let k=0;k<xyz.length;k+=3){
    const x=xyz[k]/100,y=xyz[k+1]/100,h=xyz[k+2]/100;
    position.set([x,h,-y],k);normal[k+1]=127;uv.set(uvAt(x,y),k/3*2);
  }
  return {layer,material,attributes:{position,normal,uv},indices:xyz.length/3>65535?Uint32Array.from(indices):Uint16Array.from(indices)};
}

export function addRegion(region,streets,{layout,physical,decks,tiles,layers,materials,stats,outlines}){
  const material=name=>{
    const id=materials.findIndex(m=>m.name===name);
    if(id<0)throw Error('Missing measured material '+name);
    return id;
  };
  const metres=(x,y)=>[x/4,-y/4], batches=new Map();
  const store=(kind,layer,size,tri)=>{
    const x=(tri[0]+tri[3]+tri[6])/300,z=-(tri[1]+tri[4]+tri[7])/300;
    const id=kind+'/'+Math.floor(x/size)+'_'+Math.floor(z/size),key=layer+' '+id;
    if(!batches.has(key))batches.set(key,{id,layer,xyz:[],idx:[],vertices:new Map()});
    const batch=batches.get(key);
    for(let i=0;i<9;i+=3){
      const p=tri.slice(i,i+3),label=p.join(',');
      let index=batch.vertices.get(label);
      if(index===undefined){index=batch.xyz.length/3;batch.vertices.set(label,index);batch.xyz.push(...p);}
      batch.idx.push(index);
    }
  };
  stats.regionalTriangles=0;
  for(const [ix,iz,kind,coords,indices] of streets){
    const [name,mat]=roadLayers[kind];layers.add(name);
    push(tiles,'detail/'+ix+'_'+iz,makePart(coords,indices,name,material(mat),metres));
    stats.regionalTriangles+=indices.length/3;
  }
  for(const tri of region.groundFill)store('ground','skyline-ground',640,tri);
  // Drape each mapped water crossing between the two bank levels. Its top triangles also support the player and car.
  const start=decks.length,grid=region.height;
  for(const [points,width] of region.bridges){
    const first=points[0],last=points.at(-1);
    const lengths=[0];
    for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    if(lengths.at(-1)<.5)continue;
    const from=surveyHeight(grid,...first),to=surveyHeight(grid,...last);
    const rows=points.map(([x,y],i)=>{
      const a=points[Math.max(0,i-1)],b=points[Math.min(i+1,points.length-1)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
      const half=width/2+.22,grade=from+(to-from)*lengths[i]/lengths.at(-1)+.065;
      return [[x-dy/len*half,y+dx/len*half,grade],[x+dy/len*half,y-dx/len*half,grade]];
    });
    for(let i=1;i<rows.length;i++){
      const [a,b]=rows[i-1],[c,d]=rows[i];
      for(const tri of [[a,b,c],[c,b,d]]){
        const face=tri.flat();
        decks.push(face);store('detail','paving-district-bridge',160,face.map(v=>Math.round(v*100)));
      }
    }
  }
  const uv=(x,y)=>region.orthoUV.map(([a,b,c])=>a*x+b*y+c);
  for(const {id,layer,xyz,idx} of batches.values()){
    const ground=layer==='skyline-ground';layers.add(layer);
    push(tiles,id,makePart(xyz,idx,layer,material(ground?'Backdrop ortho':'Cold asphalt'),ground?uv:metres));
    stats.regionalTriangles+=idx.length/3;
  }
  layout.regionHeight=grid;layout.regionRoads=region.streets;layout.areaM2=region.areaM2;
  layout.coreTreeCount=layout.trees.length;layout.trees.push(...region.trees);
  for(const [x,y,,,crown] of region.trees){
    const radius=Math.max(.1,Math.min(.38,crown*.09));
    const trunk=Array.from({length:8},(_,i)=>[x+radius*Math.cos(i*Math.PI/4),y+radius*Math.sin(i*Math.PI/4)]);
    physical.solids.push([trunk]);
  }
  layout.landUse.push(...region.land.filter(a=>a.kind!=='water'));
  layout.waters.push(...region.land.filter(a=>a.kind==='water'));
  physical.regionalDeckCount=decks.length-start;
  physical.regionalBuildings=region.solidBuildings.map(index=>outlines[index][2].map(ring=>ring.map(([x,z])=>[x/10,-z/10])));
  stats.triangles+=stats.regionalTriangles;
  stats.regionStreets=region.streets.filter(([k])=>k==='road').length;
  stats.regionPaths=region.streets.length-stats.regionStreets;
  stats.regionBuildings=physical.regionalBuildings.length;
}
