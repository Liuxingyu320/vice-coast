import * as T from 'three';

// Project the surveyed ground contour onto the map. Clip at the camera's near plane before filling the mask.
export function mapOutline(rings,ground,canvas){
  const ctx=canvas.getContext('2d'),previous=new T.Matrix4(),matrix=new T.Matrix4();
  const paths=rings.map(ring=>{
    const points=[];
    ring.forEach(([x,y],i)=>{
      const [bx,by]=ring[(i+1)%ring.length],n=Math.max(1,Math.ceil(Math.hypot(bx-x,by-y)/6));
      for(let j=0;j<n;j++){
        const px=x+(bx-x)*j/n,py=y+(by-y)*j/n;points.push(new T.Vector4(px,ground(px,-py)+.35,-py,1));
      }
    });
    return points;
  });
  let visible=false,lastWidth=0,lastHeight=0;
  function draw(camera){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!visible||!w||!h)return;
    matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    if(w===lastWidth&&h===lastHeight&&previous.equals(matrix))return;
    const dpr=Math.min(devicePixelRatio,2);
    if(w!==lastWidth||h!==lastHeight){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    previous.copy(matrix);lastWidth=w;lastHeight=h;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const boundary=new Path2D();
    for(const path of paths){
      const points=path.map(p=>p.clone().applyMatrix4(matrix)),clipped=[];
      let a=points.at(-1);
      for(const b of points){
        const da=a.z+a.w,db=b.z+b.w;
        if((da>=0)!==(db>=0))clipped.push(a.clone().lerp(b,da/(da-db)));
        if(db>=0)clipped.push(b);
        a=b;
      }
      if(clipped.length<3)continue;
      clipped.forEach((p,i)=>{
        const x=(1+p.x/p.w)*w/2,y=(1-p.y/p.w)*h/2;
        if(i===0)boundary.moveTo(x,y);else boundary.lineTo(x,y);
      });boundary.closePath();
    }
    const outside=new Path2D();outside.rect(0,0,w,h);outside.addPath(boundary);
    ctx.fillStyle='rgba(16,25,35,.33)';ctx.fill(outside,'evenodd');
    ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash([7,5]);ctx.strokeStyle='rgba(27,28,28,.86)';
    ctx.lineWidth=3.5;ctx.stroke(boundary);ctx.strokeStyle='#f8d596';ctx.lineWidth=1.7;ctx.stroke(boundary);
  }
  return {draw,get visible(){return visible;},set visible(value){visible=value;canvas.hidden=!value;previous.identity();}};
}
