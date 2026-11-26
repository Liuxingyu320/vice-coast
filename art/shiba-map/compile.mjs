import {trimBoundary} from './boundary.mjs';
import {bakeGateSupports} from './gate-collision.mjs';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {ShapeUtils,Vector2} from 'three';
import {zipSync} from 'three/addons/libs/fflate.module.js';

export const cellSize = 160;
export const surveyInputs = ['assets/shiba-park.glb','assets/shiba-pavement.glb','assets/shiba-horizon.glb',
  'assets/shiba-layout.json','assets/shiba-solids.json','assets/shiba-hall-steps.json','assets/shiba-game/skyline.json.gz','assets/shiba-game/land.json','assets/shiba-gate-supports.json'];
const align = n => Math.ceil(n/4)*4;
const stamp = new Date(2020,0,1);
const field = {POSITION:['position',3],NORMAL:['normal',3],TEXCOORD_0:['uv',2],
  _PANEL_U:['_panel_u',1],_PANEL_V:['_panel_v',1],_PLINTH:['_plinth',1]};
const cell = (x,z,size=cellSize) => Math.floor(x/size)+'_'+Math.floor(z/size);

function parseGlb(bytes) {
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2)throw Error('Expected a GLB 2 model');
  const end=20+bytes.readUInt32LE(12), doc=JSON.parse(bytes.subarray(20,end));
  return {doc,bin:bytes.subarray(end+8)};
}

// Expand strided accessors once. All three survey meshes have metre coordinates baked into their vertices.
function accessor(doc,bin,id) {
  const a=doc.accessors[id], v=doc.bufferViews[a.bufferView];
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const Ctor={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];
  if(!Ctor||!components||a.sparse||a.normalized)throw Error('Unsupported survey accessor '+id);
  const start=bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0), stride=(v.byteStride||components*Ctor.BYTES_PER_ELEMENT)/Ctor.BYTES_PER_ELEMENT;
  if(stride===components)return new Ctor(bin.buffer,start,a.count*components);
  const src=new Ctor(bin.buffer,start,(a.count-1)*stride+components), out=new Ctor(a.count*components);
  for(let i=0;i<a.count;i++)out.set(src.subarray(i*stride,i*stride+components),i*components);
  return out;
}

function encodeMesh(layer,material,source,remap,triangles) {
  const attributes={};
  for(const [key,[name,n]] of Object.entries(field)){
    const data=source[key];if(!data)continue;
    const packed=key==='NORMAL'?new Int8Array(n*remap.size):new Float32Array(n*remap.size);
    for(const [old,i] of remap){
      for(let c=0;c<n;c++){
        const v=data[old*n+c];
        packed[i*n+c]=key==='NORMAL'?Math.round(Math.max(-1,Math.min(1,v))*127):v;
      }
    }
    attributes[name]=packed;
  }
  return {layer,material,attributes,indices:remap.size>65535?Uint32Array.from(triangles):Uint16Array.from(triangles)};
}

function encodeTile(parts){
  const chunks=[], descriptors=[];
  let length=0;
  function append(array){
    const offset=length,buf=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    chunks.push(buf);length+=buf.length;
    const padding=align(length)-length;
    if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
    return offset;
  }
  for(const {layer,material,attributes,indices} of parts){
    const offsets={};
    for(const [name,data] of Object.entries(attributes))offsets[name]=append(data);
    descriptors.push({layer,material,offsets,vertices:attributes.position.length/3,
      indices:indices.length,wide:indices.BYTES_PER_ELEMENT===4,indexOffset:append(indices)});
  }
  const header=Buffer.from(JSON.stringify(descriptors)), prefix=Buffer.alloc(8+align(header.length));
  prefix.write('BAY1');prefix.writeUInt32LE(header.length,4);header.copy(prefix,8);
  return Buffer.concat([prefix,...chunks],prefix.length+length);
}

function partition(primitive,doc,bin,resource,layer,materials,partitions,stats,decks){
  if(primitive.mode!==undefined&&primitive.mode!==4)throw Error('Expected triangles in '+layer);
  const data={};
  for(const key of Object.keys(field))if(key in primitive.attributes)data[key]=accessor(doc,bin,primitive.attributes[key]);
  const pos=data.POSITION, index=primitive.indices===undefined?null:accessor(doc,bin,primitive.indices);
  const material=resource[primitive.material],label=materials[material].name;
  const prototype=layer.startsWith('tree-prototype-');
  const ground=layer==='shiba-ground'||layer==='skyline-ground';
  const fixed=prototype?'trees/'+layer.at(-1):/^(sangedatsumon-gate|daimon-gate|tower-lattice)$/.test(layer)?'sites/'+layer:
    /^(Tower Facade|FootTown )/.test(label)&&layer==='Survey buildings'?'sites/tower-lattice':null;
  const deckSurface=(layer.startsWith('brid_')||layer==='skyline-viaduct')&&['Bridge concrete','Viaduct deck'].includes(label);
  const cells=new Map(), count=index?.length??pos.length/3;
  if(count%3)throw Error('Incomplete triangle in '+layer);
  for(let t=0;t<count;t+=3){
    stats.sourceTriangles++;
    const a=index?index[t]:t,b=index?index[t+1]:t+1,c=index?index[t+2]:t+2;
    const ai=a*3,bi=b*3,ci=c*3;
    const dx=pos[bi]-pos[ai],dy=pos[bi+1]-pos[ai+1],dz=pos[bi+2]-pos[ai+2];
    const ex=pos[ci]-pos[ai],ey=pos[ci+1]-pos[ai+1],ez=pos[ci+2]-pos[ai+2];
    if((dy*ez-dz*ey)**2+(dz*ex-dx*ez)**2+(dx*ey-dy*ex)**2<1e-15){stats.degenerate++;continue;}
    if(deckSurface&&[ai,bi,ci].every(i=>data.NORMAL[i+1]>.82)){
      decks.push([ai,bi,ci].flatMap(i=>[pos[i],-pos[i+2],pos[i+1]].map(v=>Math.round(v*1000)/1000)));
    }
    const id=fixed??(ground?'ground/':'detail/')+cell((pos[ai]+pos[bi]+pos[ci])/3,(pos[ai+2]+pos[bi+2]+pos[ci+2])/3,ground?cellSize*4:cellSize);
    let batch=cells.get(id);
    if(!batch){batch={remap:new Map(),triangles:[]};cells.set(id,batch);}
    for(const old of [a,b,c]){
      let mapped=batch.remap.get(old);
      if(mapped===undefined){mapped=batch.remap.size;batch.remap.set(old,mapped);}
      batch.triangles.push(mapped);
    }
  }
  for(const [key,{remap,triangles}] of cells){
    if(!partitions.has(key))partitions.set(key,[]);
    partitions.get(key).push(encodeMesh(layer,material,data,remap,triangles));
    stats.triangles+=triangles.length/3;
  }
}

function registerMaterials(doc,bin,files,materials,known){
  const imageNames=(doc.images||[]).map(img=>{
    const v=doc.bufferViews[img.bufferView],start=v.byteOffset??0,bytes=bin.subarray(start,start+v.byteLength);
    const hash=createHash('sha256').update(bytes).digest('hex').slice(0,32);
    const key='images/'+hash+(img.mimeType==='image/png'?'.png':'.jpg');
    files[key]=[bytes,{level:0}];return key;
  });
  const imageFor=texture=>texture===undefined?null:imageNames[doc.textures[texture.index].source];
  return doc.materials.map(m=>{
    const p=m.pbrMetallicRoughness||{};
    const spec={name:m.name,color:p.baseColorFactor??[1,1,1,1],map:imageFor(p.baseColorTexture),
      normal:imageFor(m.normalTexture),normalScale:m.normalTexture?.scale??1,rough:p.roughnessFactor??1,metal:p.metallicFactor??1,
      mr:imageFor(p.metallicRoughnessTexture),emissive:m.emissiveFactor??[0,0,0],emissiveMap:imageFor(m.emissiveTexture),
      side:m.doubleSided??false,alpha:m.alphaMode??'OPAQUE',cutoff:m.alphaCutoff??.5};
    const signature=JSON.stringify(spec);
    if(!known.has(signature)){known.set(signature,materials.length);materials.push(spec);}
    return known.get(signature);
  });
}

// Keep courtyards open in both the roof triangulation and the vertical inner walls.
function compileSkyline(records,tiles){
  const districts=new Map();
  for(const [low,high,rings] of records){
    const contours=rings.map(r=>r.map(([x,z])=>new Vector2(x/10,z/10)));
    const outer=contours[0], points=contours.flat();
    const ix=outer.reduce((n,p)=>n+p.x,0)/outer.length, iz=outer.reduce((n,p)=>n+p.y,0)/outer.length;
    const key='blocks/'+cell(ix,iz);
    if(!districts.has(key))districts.set(key,{p:[],n:[],idx:[]});
    const chunk=districts.get(key), base=chunk.p.length/3;
    for(const p of points){chunk.p.push(p.x,high/10,p.y);chunk.n.push(0,127,0);}
    for(const [a,b,c] of ShapeUtils.triangulateShape(outer,contours.slice(1)))chunk.idx.push(base+a,base+c,base+b);
    for(const [i,ring] of contours.entries()){
      const sign=(ShapeUtils.isClockWise(ring)?-1:1)*(i===0?1:-1);
      for(let j=0;j<ring.length;j++){
        const a=ring[j],b=ring[(j+1)%ring.length],dx=b.x-a.x,dz=b.y-a.y,len=Math.hypot(dx,dz);
        if(len<.01)continue;
        const v=chunk.p.length/3;
        chunk.p.push(a.x,low/10,a.y,a.x,high/10,a.y,b.x,high/10,b.y,b.x,low/10,b.y);
        const nx=Math.round(sign*127*dz/len),nz=Math.round(-sign*127*dx/len);
        for(let k=0;k<4;k++)chunk.n.push(nx,0,nz);
        if(sign>0)chunk.idx.push(v,v+1,v+2,v,v+2,v+3);
        else chunk.idx.push(v,v+2,v+1,v,v+3,v+2);
      }
    }
  }
  for(const [key,{p,n,idx}] of districts){
    tiles.set(key,[{layer:'skyline-outline',material:-1,attributes:{position:Float32Array.from(p),normal:Int8Array.from(n)},
      indices:p.length/3>65535?Uint32Array.from(idx):Uint16Array.from(idx)}]);
  }
}

export async function compileMap(){
  const files={},tiles=new Map(),materials=[],known=new Map(),layers=new Set(),decks=[];
  const stats={sourceTriangles:0,triangles:0,degenerate:0,outlines:0};
  for(const filename of surveyInputs.slice(0,3)){
    const bytes=await readFile(filename),{doc,bin}=parseGlb(bytes);
    const ids=registerMaterials(doc,bin,files,materials,known);
    for(const node of doc.nodes){
      if(node.mesh===undefined)continue;
      if(node.matrix||node.scale||node.rotation||node.translation||node.children)throw Error('Bake node transforms before compiling '+node.name);
      layers.add(node.name);
      for(const p of doc.meshes[node.mesh].primitives)partition(p,doc,bin,ids,node.name,materials,tiles,stats,decks);
    }
  }
  const [layout,solidSource,steps,outlines,areas,gates]=await Promise.all(surveyInputs.slice(3).map(async p=>{
    const bytes=await readFile(p);return JSON.parse(p.endsWith('.gz')?gunzipSync(bytes):bytes);
  }));
  const physical=bakeGateSupports(solidSource,gates);
  const originalEdge=physical.travelBoundary??layout.boundary;
  physical.travelBoundary=trimBoundary(originalEdge);
  stats.boundaryVertices=[originalEdge.length,physical.travelBoundary.length];
  layout.landUse=areas;
  compileSkyline(outlines,tiles);stats.outlines=outlines.length;
  const bindings=new Map();
  const entries=[...tiles].map(([id,parts])=>{
    for(const p of parts)if(p.material>=0)bindings.set(p.layer+':'+p.material,[p.layer,p.material]);
    files[id+'.bin']=encodeTile(parts);
    return {id,buildings:parts.some(p=>['Survey buildings','surveyed-skyline','skyline-photofacades'].includes(p.layer))};
  });
  const xy=physical.travelBoundary??layout.boundary,x=xy.map(p=>p[0]),z=xy.map(p=>-p[1]);
  const manifest={version:1,cellSize,bounds:{minX:Math.min(...x),maxX:Math.max(...x),minZ:Math.min(...z),maxZ:Math.max(...z)},
    origin:[layout.lon,layout.lat],layers:[...layers],bindings:[...bindings.values()],materials,tiles:entries,stats,
    attribution:['建筑与地形 © 东京都、国土交通省（PLATEAU，CC BY 4.0）','航拍影像来自日本国土地理院','道路 © OpenStreetMap contributors（ODbL）']};
  for(const [id,value] of Object.entries({manifest,layout,physical,steps,decks}))files[id+'.json']=Buffer.from(JSON.stringify(value));
  return {bytes:Buffer.from(zipSync(files,{level:4,mtime:stamp})),manifest};
}
