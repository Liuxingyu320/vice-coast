export function districtBoundary(rings){
  const segments=[];
  for(const ring of rings)for(let i=0;i<ring.length;i++){
    const [ax,ay]=ring[i],[bx,by]=ring[(i+1)%ring.length],dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
    if(len)segments.push({ax,ay,bx,by,dx,dy,len});
  }
  function locate(x,y){
    let inside=false,best=Infinity,px=x,py=y;
    for(const {ax,ay,bx,by,dx,dy,len} of segments){
      if(ay>y!==by>y&&x<ax+(y-ay)*dx/dy)inside=!inside;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/len));
      const u=ax+t*dx,v=ay+t*dy,d=(u-x)**2+(v-y)**2;
      if(d<best){best=d;px=u;py=v;}
    }
    return {inside:inside||best<1e-8,distance:Math.sqrt(best),x:px,y:py};
  }
  return {rings,locate};
}
