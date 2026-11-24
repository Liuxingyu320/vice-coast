const epsilon=1e-7;
const separation=.00025;
const maxContacts=24;
const dot=(x,z,nx,nz)=>x*nx+z*nz;
const cross=(x,z,nx,nz)=>z*nx-x*nz;
const limit=(value,min,max)=>Math.max(min,Math.min(max,value));

export function vehicleMass(box){
 const mass=limit(box.hw*box.hl*.4,.65,1.6);
 return {invMass:1/mass,invInertia:3/(mass*(box.hw**2+box.hl**2))};
}

function supportFace(box,nx,nz,tx,tz){
 const c=Math.cos(box.a),s=Math.sin(box.a);
 let x=box.x,z=box.z,half=0;
 const add=(ux,uz,r)=>{
  const facing=dot(ux,uz,nx,nz);
  if(Math.abs(facing)<1e-5)half+=r*Math.abs(dot(ux,uz,tx,tz));
  else{x+=Math.sign(facing)*r*ux;z+=Math.sign(facing)*r*uz}
 };
 add(c,-s,box.hw);add(s,c,box.hl);
 const tangent=dot(x,z,tx,tz);
 return {normal:dot(x,z,nx,nz),min:tangent-half,max:tangent+half};
}

function contactPoint(a,b,nx,nz){
 const tx=-nz,tz=nx,near=supportFace(a,-nx,-nz,tx,tz);
 let normal=-near.normal,tangent=(near.min+near.max)/2;
 if(b){
  const far=supportFace(b,nx,nz,tx,tz);
  normal=(normal+far.normal)/2;
  tangent=(Math.max(near.min,far.min)+Math.min(near.max,far.max))/2;
 }
 return {x:normal*nx+tangent*tx,z:normal*nz+tangent*tz};
}

// The normal always points from the other body or scenery toward a.
function resolveVehicleContact(a,b,hit){
 const {nx,nz}=hit,tx=-nz,tz=nx;
 const xSpeed=a.vx-(b?.vx??0),zSpeed=a.vz-(b?.vz??0);
 const approach=-dot(xSpeed,zSpeed,nx,nz);
 if(approach<=epsilon)return null;
 const point=contactPoint(a,b??hit.obstacle,nx,nz);
 const ax=point.x-a.x,az=point.z-a.z,bx=b?point.x-b.x:0,bz=b?point.z-b.z:0;
 const leverA=cross(ax,az,nx,nz),leverB=cross(bx,bz,nx,nz);
 const totalInvMass=a.invMass+(b?.invMass??0);
 const relative=()=>({x:a.vx+a.yaw*az-(b?b.vx+b.yaw*bz:0),z:a.vz-a.yaw*ax-(b?b.vz-b.yaw*bx:0)});
 const apply=(forceX,forceZ)=>{
  a.vx+=forceX*a.invMass;a.vz+=forceZ*a.invMass;
  a.yaw=limit(a.yaw+cross(ax,az,forceX,forceZ)*a.invInertia,-3,3);
  if(b){
   b.vx-=forceX*b.invMass;b.vz-=forceZ*b.invMass;
   b.yaw=limit(b.yaw-cross(bx,bz,forceX,forceZ)*b.invInertia,-3,3);
  }
 };
 const start=relative(),tangentSpeed=Math.abs(dot(start.x,start.z,tx,tz));
 const normalSpeed=Math.max(0,-dot(start.x,start.z,nx,nz));
 const normalMass=totalInvMass+leverA**2*a.invInertia+leverB**2*(b?.invInertia??0);
 const restitution=approach>1.8?(b ? .12 : .18):0;
 const aApproach=-dot(a.vx,a.vz,nx,nz),bApproach=b?dot(b.vx,b.vz,nx,nz):0;
 const impulse=(1+restitution)*normalSpeed/normalMass;
 apply(impulse*nx,impulse*nz);
 const after=relative();
 const tangentMass=totalInvMass+cross(ax,az,tx,tz)**2*a.invInertia+cross(bx,bz,tx,tz)**2*(b?.invInertia??0);
 const friction=limit(-dot(after.x,after.z,tx,tz)/tangentMass,-impulse*.22,impulse*.22);
 apply(friction*tx,friction*tz);
 // Rotation is applied separately after the translational sweep. Remove any
 // inward center motion left by the off-center impulse within this slice.
 const separating=approach*restitution*.35;
 const remainder=Math.min(0,dot(a.vx-(b?.vx??0),a.vz-(b?.vz??0),nx,nz)-separating)/totalInvMass;
 if(remainder){
  a.vx-=remainder*nx*a.invMass;a.vz-=remainder*nz*a.invMass;
  if(b){b.vx+=remainder*nx*b.invMass;b.vz+=remainder*nz*b.invMass}
 }
 return {...point,approach,tangentSpeed,aApproach,bApproach,normalImpulse:impulse-remainder};
}

function advance(bodies,dt,record){
 if(dt<=epsilon)return;
 for(const body of bodies){
  const dx=body.vx*dt,dz=body.vz*dt;
  if(Math.abs(dx)+Math.abs(dz)<=epsilon)continue;
  record(body,dx,dz);
  body.x+=dx;body.z+=dz;
 }
}

function earliestContact(bodies,dt,worldSweep,vehicleSweep){
 let earliest=null;
 for(let i=0;i<bodies.length;i++){
  const a=bodies[i],dx=a.vx*dt,dz=a.vz*dt;
  if(Math.abs(dx)+Math.abs(dz)>epsilon){
   const hit=worldSweep(a,dx,dz);
   if(hit&&dot(a.vx,a.vz,hit.nx,hit.nz)<-epsilon&&(!earliest||hit.fraction<earliest.hit.fraction)){
    earliest={a,b:null,hit};
   }
  }
  for(let j=i+1;j<bodies.length;j++){
   const b=bodies[j],sx=dx-b.vx*dt,sz=dz-b.vz*dt;
   if(Math.abs(sx)+Math.abs(sz)<=epsilon)continue;
   const reach=a.hl+a.hw+b.hl+b.hw;
   if(Math.abs(a.x-b.x)>reach+Math.abs(sx)||Math.abs(a.z-b.z)>reach+Math.abs(sz))continue;
   const hit=vehicleSweep(a,b,sx,sz);
   if(hit&&(!earliest||hit.fraction<earliest.hit.fraction))earliest={a,b,hit};
  }
 }
 return earliest;
}

export function advanceVehicleBodies(bodies,dt,{worldSweep,vehicleSweep,record,onContact}){
 let remaining=dt;
 for(let i=0;i<maxContacts&&remaining>epsilon;i++){
  const next=earliestContact(bodies,remaining,worldSweep,vehicleSweep);
  if(!next){advance(bodies,remaining,record);return}
  const {a,b,hit}=next,relative=(a.vx-(b?.vx??0))*hit.nx+(a.vz-(b?.vz??0))*hit.nz;
  const elapsed=remaining*hit.fraction;
  const backoff=separation/Math.max(1,Math.abs(relative));
  advance(bodies,Math.max(0,elapsed-backoff),record);
  const contact=resolveVehicleContact(a,b,hit);
  if(contact)onContact(a,b,hit,contact);
  remaining-=Math.max(elapsed,epsilon);
 }
 // In a pile-up, leave the remaining interval unapplied. Bodies can still
 // steer or back out on the next step without moving through another car.
}

// Transform the circle's relative path into the rectangle's local space,
// then test the straight sides and the four rounded corners analytically.
export function sweepCircleAgainstVehicle(box,dx,dz,x,z,r){
 const c=Math.cos(box.a),s=Math.sin(box.a),rx=x-box.x,rz=z-box.z;
 const lx=rx*c-rz*s,lz=rx*s+rz*c,vx=-(dx*c-dz*s),vz=-(dx*s+dz*c);
 const {hw,hl}=box;
 let hit=null;
 const accept=(fraction,nx,nz)=>{
  if(fraction<0||fraction>1||hit&&fraction>=hit.fraction)return;
  hit={fraction,nx:nx*c+nz*s,nz:-nx*s+nz*c};
 };
 const px=lx-limit(lx,-hw,hw),pz=lz-limit(lz,-hl,hl),dist=Math.hypot(px,pz);
 if(dist<=r){
  if(dist>epsilon)accept(0,px/dist,pz/dist);
  else if(hw-Math.abs(lx)<hl-Math.abs(lz))accept(0,Math.sign(lx)||1,0);
  else accept(0,0,Math.sign(lz)||1);
  return hit;
 }
 for(const side of [-1,1]){
  if(vx*side<-epsilon){
   const t=(side*(hw+r)-lx)/vx;
   if(Math.abs(lz+vz*t)<=hl)accept(t,side,0);
  }
  if(vz*side<-epsilon){
   const t=(side*(hl+r)-lz)/vz;
   if(Math.abs(lx+vx*t)<=hw)accept(t,0,side);
  }
 }
 const speedSquared=vx*vx+vz*vz;
 if(speedSquared<=epsilon)return hit;
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const qx=lx-sx*hw,qz=lz-sz*hl,b=qx*vx+qz*vz;
  const discriminant=b*b-speedSquared*(qx*qx+qz*qz-r*r);
  if(b>=0||discriminant<0)continue;
  const t=(-b-Math.sqrt(discriminant))/speedSquared,nx=(qx+vx*t)/r,nz=(qz+vz*t)/r;
  if(nx*sx>=0&&nz*sz>=0)accept(t,nx,nz);
 }
 return hit;
}
