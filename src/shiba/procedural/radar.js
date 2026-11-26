import {AREA} from '../../../vendor/procedural-tokyo/src/shared/tileformat.js';

export function createRadar(canvas,bounds,edges,land) {
  const scale=.8, base=document.createElement('canvas');
  base.width=Math.ceil((bounds.maxX-bounds.minX)*scale);
  base.height=Math.ceil((bounds.maxZ-bounds.minZ)*scale);
  const g=base.getContext('2d');
  g.setTransform(scale,0,0,scale,-bounds.minX*scale,-bounds.minZ*scale);
  g.fillStyle='#2b3136';g.fillRect(bounds.minX,bounds.minZ,base.width/scale,base.height/scale);
  for(const {kind,rings} of land) {
    g.fillStyle=kind===AREA.WATER?'#315766':'#465e50';g.beginPath();
    for(const ring of rings){ring.forEach(([x,y],i)=>i?g.lineTo(x,-y):g.moveTo(x,-y));g.closePath();}
    g.fill('evenodd');
  }
  for(const r of edges){
    if(r.tunnel)continue;
    g.lineWidth=r.lanes>1?3.7:1.8;g.strokeStyle=r.flyover?'#a3a9ac':r.lanes>1?'#87908d':'#697172';g.beginPath();
    for(let i=0;i<r.pts.length;i+=3){if(i)g.lineTo(r.pts[i],r.pts[i+2]);else g.moveTo(r.pts[i],r.pts[i+2]);}
    g.stroke();
  }
  const ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height;
  return function draw(pos,goal,car) {
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
  };
}
