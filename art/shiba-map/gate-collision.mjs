// The temple approach has raised stone thresholds. Their thin front faces belong to the
// walking surface. Use the gate model's ground posts and walled bays for lateral collision.
export function bakeGateSupports(physical,gates){
  let solids=physical.solids;
  for(const rings of Object.values(gates)){
    const center=r=>r.reduce(([x,y],[a,b])=>[x+a/r.length,y+b/r.length],[0,0]);
    const a=center(rings[0]),b=center(rings[1]),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const dx=(b[0]-a[0])/length,dy=(b[1]-a[1])/length;
    const local=([x,y])=>[(x-a[0])*dx+(y-a[1])*dy,-(x-a[0])*dy+(y-a[1])*dx];
    const footprint=rings.flat().map(local),xs=footprint.map(p=>p[0]),ys=footprint.map(p=>p[1]);
    const minX=Math.min(...xs)-.7,maxX=Math.max(...xs)+.7,minY=Math.min(...ys)-.7,maxY=Math.max(...ys)+.7;
    function within(point){const [x,y]=local(point);return x>=minX&&x<=maxX&&y>=minY&&y<=maxY;}
    solids=solids.filter(([outer])=>!outer.every(within));
    for(const ring of rings)solids.push([ring]);
  }
  return {...physical,solids};
}
