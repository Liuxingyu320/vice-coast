function distanceToSegment(p,a,b){
  const u=b[0]-a[0],v=b[1]-a[1],len=u*u+v*v;
  const t=len?Math.min(1,Math.max(0,((p[0]-a[0])*u+(p[1]-a[1])*v)/len)):0;
  return (p[0]-a[0]-t*u)**2+(p[1]-a[1]-t*v)**2;
}
function reduceLine(points,tolerance){
  const keep=new Set([0,points.length-1]),pending=[[0,points.length-1]];
  while(pending.length){
    const [a,b]=pending.pop();let maximum=tolerance*tolerance,index=-1;
    for(let i=a+1;i<b;i++){
      const d=distanceToSegment(points[i],points[a],points[b]);if(d>maximum){index=i;maximum=d;}
    }
    if(index!==-1){keep.add(index);pending.push([a,index],[index,b]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
const signedArea=r=>r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
function crosses(ring){
  const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    for(let j=i+2;j<ring.length;j++){
      if(i===0&&j===ring.length-1)continue;
      const c=ring[j],d=ring[(j+1)%ring.length];
      if(turn(a,b,c)*turn(a,b,d)<0&&turn(c,d,a)*turn(c,d,b)<0)return true;
    }
  }
  return false;
}
export function trimBoundary(ring,tolerance=.24){
  if(ring.length<6)return ring;
  // Split the closed ring into two open arcs. Keep the far anchor as well as the starting vertex.
  const pivot=ring.reduce((best,p,i)=>distanceToSegment(p,ring[0],ring[0])>distanceToSegment(ring[best],ring[0],ring[0])?i:best,0);
  const a=reduceLine(ring.slice(0,pivot+1),tolerance),b=reduceLine([...ring.slice(pivot),ring[0]],tolerance);
  const reduced=[...a.slice(0,-1),...b.slice(0,-1)],area=signedArea(ring);
  if(reduced.length<3||Math.abs(signedArea(reduced)-area)>.0005*Math.abs(area)||crosses(reduced))return ring;
  return reduced;
}
