export function createRadar(canvas,bounds,edges,land,boundary) {
  const scale=Math.min(.8,2048/Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)), base=document.createElement('canvas');
  base.width=Math.ceil((bounds.maxX-bounds.minX)*scale);
  base.height=Math.ceil((bounds.maxZ-bounds.minZ)*scale);
  const g=base.getContext('2d');
  g.setTransform(scale,0,0,scale,-bounds.minX*scale,-bounds.minZ*scale);
  g.fillStyle='#303b40';g.fillRect(bounds.minX,bounds.minZ,base.width/scale,base.height/scale);
  for(const {kind,rings} of land) {
    g.fillStyle={water:'#294d5b',park:'#405a4e',parking:'#465153',building:'#525e60'}[kind];g.beginPath();
    for(const ring of rings){ring.forEach(([x,y],i)=>i?g.lineTo(x,-y):g.moveTo(x,-y));g.closePath();}
    g.fill('evenodd');
  }
  const isArterial=r=>['primary','trunk','secondary','primary_link','trunk_link'].includes(r.category);
  const groups=[edges.filter(r=>!r.lanes),edges.filter(r=>r.lanes&&!isArterial(r)),edges.filter(isArterial)];
  g.lineCap=g.lineJoin='round';
  for(const [i,group] of groups.entries()){
    const widths=new Map();
    for(const road of group){
      const w=i===0?1.65:i===1?Math.min(8,Math.max(3.5,road.width)):Math.min(20,Math.max(9,road.width));
      const width=Math.round(w*2)/2;
      if(!widths.has(width))widths.set(width,new Path2D());
      const path=widths.get(width),pts=road.pts;
      path.moveTo(pts[0],pts[2]);for(let j=3;j<pts.length;j+=3)path.lineTo(pts[j],pts[j+2]);
    }
    for(const [width,path] of widths){
      if(i){g.strokeStyle='#303b3f';g.lineWidth=width+2;g.stroke(path);}
    }
    for(const [width,path] of widths){
      g.strokeStyle=['#798d85','#9ba8a5','#dbd9c5'][i];g.lineWidth=width;g.stroke(path);
    }
  }
  const border=new Path2D(),outside=new Path2D();
  for(const ring of boundary){ring.forEach(([x,y],i)=>i?border.lineTo(x,-y):border.moveTo(x,-y));border.closePath();}
  outside.rect(bounds.minX-1,bounds.minZ-1,base.width/scale+2,base.height/scale+2);outside.addPath(border);
  g.fillStyle='#233e4b';g.fill(outside,'evenodd');
  g.strokeStyle='#cbb588';g.lineWidth=1.6;g.setLineDash([5,4]);g.stroke(border);
  const ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height;
  function draw(pos,goal,car) {
    const zoom=1.55, spanX=w/zoom,spanZ=h/zoom;
    ctx.fillStyle='#2b3136';ctx.fillRect(0,0,w,h);
    ctx.drawImage(base,(pos.x-spanX/2-bounds.minX)*scale,(pos.z-spanZ/2-bounds.minZ)*scale,
      spanX*scale,spanZ*scale,0,0,w,h);
    if(goal){const x=(goal.x-pos.x)*zoom,z=(goal.z-pos.z)*zoom;
      const f=Math.min(1,(w*.5-12)/Math.max(1,Math.abs(x)),(h*.5-12)/Math.max(1,Math.abs(z)));
      ctx.save();ctx.translate(w/2+x*f,h/2+z*f);ctx.rotate(Math.PI/4);ctx.fillStyle='#ffd37e';ctx.fillRect(-5,-5,10,10);ctx.restore();}
    if(car){const x=w/2+(car.x-pos.x)*zoom,z=h/2+(car.z-pos.z)*zoom;ctx.fillStyle='#9de4d9';ctx.fillRect(x-4,z-4,8,8);}
    ctx.save();ctx.translate(w/2,h/2);ctx.rotate(-pos.a);
    ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(7,7);ctx.lineTo(0,4);ctx.lineTo(-7,7);ctx.closePath();
    ctx.fillStyle='#fff3dc';ctx.strokeStyle='#102021';ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.restore();
  }
  return {draw,base};
}
