import assert from 'node:assert/strict';
import {neighborhoods} from '../src/shiba/district/neighborhoods.js';

// Walk the original and expanded public road graph with the same car hull and grade lookup as gameplay.
export function checkRoutes(layout,nav,garage){
  const nodes=[],bins=new Map(),cell=2;
  function vertex(x,y){
    const ix=Math.floor(x/cell),iy=Math.floor(y/cell);
    for(let u=ix-1;u<=ix+1;u++)for(let v=iy-1;v<=iy+1;v++)
      for(const id of bins.get(u+','+v)??[]){
        const p=nodes[id];if(Math.hypot(x-p.x,y-p.y)<.28)return id;
      }
    const id=nodes.length,k=ix+','+iy;
    if(!bins.has(k))bins.set(k,[]);bins.get(k).push(id);nodes.push({x,y,id,links:[]});return id;
  }
  function link(kind,points,[width,type,oneway]){
    if(kind!=='road'||width<2.5||['motorway','motorway_link'].includes(type))return;
    let a=vertex(...points[0]);
    for(const p of points.slice(1)){
      const b=vertex(...p);
      if(a!==b){
        const edge={a,b};
        if(oneway!=='-1')nodes[a].links.push([b,edge]);
        if(oneway!=='yes')nodes[b].links.push([a,edge]);
      }
      a=b;
    }
  }
  layout.roads.forEach(([k,p],i)=>link(k,p,layout.roadInfo[i]));
  for(const row of layout.regionRoads)link(...row);
  function clear(edge){
    if(edge.clear!==undefined)return edge.clear;
    const p=nodes[edge.a],q=nodes[edge.b],dx=q.x-p.x,dy=q.y-p.y;
    const d=Math.hypot(dx,dy),n=Math.max(1,Math.ceil(d/1.65)),angle=Math.atan2(dx,dy);
    let z=nav.support(p.x,p.y,undefined,true).z;
    for(let i=0;i<=n;i++){
      const t=i/n,x=p.x+dx*t,y=p.y+dy*t;
      const next=nav.support(x,y,z,true).z;
      if(Math.abs(next-z)>1.1||!nav.canWalk(x,y,z)||nav.vehicleContact({z},x,y,angle))return edge.clear=false;
      z=next;
    }
    return edge.clear=true;
  }
  const nearest=(p,set)=>set.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(b.x-p.x,b.y-p.y)?a:b);
  const garageId=vertex(garage.x,garage.y);
  const approaches=nodes.filter(n=>n.links.length&&Math.hypot(n.x-garage.x,n.y-garage.y)<45
    &&clear({a:garageId,b:n.id})&&n.links.some(([,e])=>clear(e)));
  assert.ok(approaches.length,'A drivable connection must start at the actual garage delivery position');
  const start=nearest(garage,approaches);
  const queue=[start.id],dist=new Map([[start.id,0]]);
  for(let i=0;i<queue.length;i++){
    const p=nodes[queue[i]];
    for(const [id,edge] of p.links){
      if(dist.has(id)||!clear(edge))continue;
      const q=nodes[id];dist.set(id,dist.get(p.id)+Math.hypot(q.x-p.x,q.y-p.y));queue.push(id);
    }
  }
  const connected=queue.map(i=>nodes[i]),places=neighborhoods(layout);
  for(const name of ['六本木','麻布十番','虎之门','新桥','三田','竹芝']){
    const place=places.find(p=>p.name===name),target={x:place.x,y:-place.z};
    const goal=nearest(target,connected),away=Math.hypot(goal.x-target.x,goal.y-target.y);
    assert.ok(away<160,name+' closest connected street is '+away.toFixed(0)+' m away');
    const car=nav.roadNear(goal.x,goal.y);assert.ok(car&&car.dist<60,name+' garage');
    console.log(name+' · '+(dist.get(goal.id)/1000).toFixed(2)+' km connected drive, '+away.toFixed(0)+' m from station, garage '+car.dist.toFixed(1)+' m');
  }
  assert.ok(connected.length>5500,connected.length+' connected road vertices');
}
