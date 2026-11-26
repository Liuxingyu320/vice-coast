import {districtBoundary} from './boundary.js';
import {createCollision,inRing,vehicleHull} from '../collision.js';
import {surveyHeight} from '../terrain.js';

export function buildNavigation(layout,physical,steps,decks=[]){
  const collision=createCollision(layout.boundary,physical);
  const boundary=districtBoundary([physical.travelBoundary??layout.boundary,...(physical.travelHoles??[])]);
  const ground=(x,z)=>surveyHeight(layout.height,x,-z);
  const waterways=layout.waters.map(({rings})=>{
    const x=rings[0].map(p=>p[0]),y=rings[0].map(p=>p[1]);
    return {rings,minX:Math.min(...x),maxX:Math.max(...x),minY:Math.min(...y),maxY:Math.max(...y)};
  });
  const wet=(x,y)=>waterways.some(w=>x>=w.minX&&x<=w.maxX&&y>=w.minY&&y<=w.maxY&&inRing(x,y,w.rings[0])&&!w.rings.slice(1).some(r=>inRing(x,y,r)));
  const bins=new Map(),key=(x,y)=>Math.floor(x/24)+','+Math.floor(y/24);
  for(const face of decks){
    const xs=[face[0],face[3],face[6]],ys=[face[1],face[4],face[7]];
    for(let i=Math.floor(Math.min(...xs)/24);i<=Math.floor(Math.max(...xs)/24);i++)
      for(let j=Math.floor(Math.min(...ys)/24);j<=Math.floor(Math.max(...ys)/24);j++){
        const id=i+','+j;if(!bins.has(id))bins.set(id,[]);bins.get(id).push(face);
      }
  }
  function bridgeHeight(x,y,prior){
    let best=null;
    for(const [ax,ay,az,bx,by,bz,cx,cy,cz] of bins.get(key(x,y))??[]){
      const det=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.abs(det)<.0001)continue;
      const u=((x-ax)*(cy-ay)-(y-ay)*(cx-ax))/det, v=((bx-ax)*(y-ay)-(by-ay)*(x-ax))/det;
      if(u<-.001||v<-.001||u+v>1.001)continue;
      const h=az+u*(bz-az)+v*(cz-az);
      if(Math.abs(h-prior)<=1.1&&(best===null||Math.abs(h-prior)<Math.abs(best-prior)))best=h;
    }
    return best;
  }
  function walkingLevel(x,y,base){
    for(const station of layout.stations){
      const [a,b]=station.down,dx=x-station.mouth[0],dy=y-station.mouth[1],depth=dx*a+dy*b;
      if(depth<.08||depth>station.length-.54||Math.abs(dy*a-dx*b)>Math.min(2.38,station.width-.42)/2)continue;
      const n=Math.min(17,Math.floor((station.length-.62)/.37)-2);
      return ground(station.mouth[0],-station.mouth[1])-Math.min(n,Math.floor((depth-.08)/.32))*.155-.015;
    }
    const dx=x-steps.center[0],dy=y-steps.center[1],depth=steps.outer-dx*steps.front[0]-dy*steps.front[1];
    if(depth>=0&&depth<=steps.count*steps.tread+2.2&&Math.abs(dx*steps.along[0]+dy*steps.along[1])<=steps.halfWidth)
      return Math.max(base,steps.bottom+(steps.landing-steps.bottom)*Math.min(steps.count,Math.floor(depth/steps.tread)+1)/steps.count);
    return base;
  }
  function support(x,y,prior,drive=false){
    const base=ground(x,-y)+collision.sidewalkLift(x,y);
    const deck=bridgeHeight(x,y,prior??base);
    return deck!==null?{z:deck,layer:'bridge'}:{z:drive?base:walkingLevel(x,y,base),layer:'street'};
  }
  const canWalk=(x,y,prior)=>collision.passable(x,y)&&(!wet(x,y)||bridgeHeight(x,y,prior??ground(x,-y))!==null);
  function walkNear(x,y){
    if(canWalk(x,y))return [x,y];
    for(let r=.5;r<=48;r+=.75){
      const n=Math.ceil(2*Math.PI*r/1.4);
      for(let i=0;i<n;i++){
        const a=i/n*Math.PI*2,px=x+r*Math.cos(a),py=y+r*Math.sin(a);
        if(canWalk(px,py))return [px,py];
      }
    }
    return null;
  }
  const edges=[],streets=[];
  layout.roads.forEach(([kind,points],i)=>{
    const [width,category,oneway,lanes]=layout.roadInfo[i];
    edges.push({pts:points.flatMap(([x,y])=>[x,0,-y]),lanes:kind==='road'?lanes:0});
    if(kind!=='road'||['motorway','motorway_link'].includes(category))return;
    for(let j=1;j<points.length;j++){
      const [x,y]=points[j-1],[bx,by]=points[j],length=Math.hypot(bx-x,by-y);
      if(length>1)streets.push({x,y,dx:(bx-x)/length,dy:(by-y)/length,length,width,oneway});
    }
  });
  function vehicleContact(actor,x,y,heading){
    const hit=collision.contact(x,y,heading);if(hit)return hit;
    for(const [px,py] of vehicleHull(x,y,heading))if(wet(px,py)&&bridgeHeight(px,py,actor.z)===null)return [1,0];
    return null;
  }
  function roadNear(x,y){
    const options=[];
    for(const s of streets){
      const t=Math.min(s.length,Math.max(0,(x-s.x)*s.dx+(y-s.y)*s.dy));
      for(const sign of s.oneway==='yes'?[1]:s.oneway==='-1'?[-1]:[1,-1]){
        const dx=s.dx*sign,dy=s.dy*sign,offset=Math.min(2.4,Math.max(0,(s.width-2.4)*.27));
        // Japan drives on the left. Keep the delivery clear of both the caller and the kerb.
        for(const along of [0,5,-5,10,-10]){
          const at=t+along;if(at<0||at>s.length)continue;
          const px=s.x+s.dx*at-dy*offset,py=s.y+s.dy*at+dx*offset,dist=Math.hypot(px-x,py-y);
          if(dist>=3.1&&dist<=180)options.push({x:px,y:py,heading:Math.atan2(dx,dy),dx,dy,dist});
        }
      }
    }
    options.sort((a,b)=>a.dist-b.dist);
    for(const p of options){
      const {z,layer}=support(p.x,p.y,undefined,true);
      if([0,2,4,7].every(d=>!vehicleContact({z},p.x+p.dx*d,p.y+p.dy*d,p.heading)))return {...p,z,layer};
    }
    return null;
  }
  return {boundary,ground,support,canWalk,walkNear,roadNear,vehicleContact,roads:{edges},
    land:[...(layout.landUse??[]),...layout.waters.map(({rings})=>({kind:'water',rings})),
      ...layout.footprints.map(({rings})=>({kind:'building',rings}))]};
}
