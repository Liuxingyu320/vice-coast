// Join identical adjacent corners without changing triangle order. Comparing all
// shading attributes keeps hard edges, window seams and photo-atlas UVs separate.
export const facadeAttributes={position:3,normal:3,color:3,aFacade:4,aBldg:4,aPhoto:2,aMark:1};
export const roofAttributes={position:3,normal:3,uv:2,aMark:1};

export function indexSurface(surface, format) {
  const positions=surface.position, total=positions.length/3;
  if(total<12 || surface.index) return;
  const fields=Object.entries(format).map(([key,n])=>({key,n,data:surface[key]}));
  const recent=new Int32Array(6).fill(-1), indices=new Uint32Array(total);
  let unique=0,cursor=0;
  for(let i=0;i<total;i++) {
    const x=positions[3*i],y=positions[3*i+1],z=positions[3*i+2];
    let match=-1;
    candidate: for(let j=0;j<recent.length;j++) {
      const k=recent[j];
      if(k<0 || positions[3*k]!==x || positions[3*k+1]!==y || positions[3*k+2]!==z) continue;
      for(let s=1;s<fields.length;s++) {
        const {n,data}=fields[s];
        for(let c=0;c<n;c++) if(data[i*n+c]!==data[k*n+c]) continue candidate;
      }
      match=k;break;
    }
    if(match<0) {
      match=unique++;
      recent[cursor]=match;cursor=(cursor+1)%recent.length;
      if(i!==match) for(const {n,data} of fields) for(let c=0;c<n;c++) data[match*n+c]=data[i*n+c];
    }
    indices[i]=match;
  }
  if(unique===total) return;
  for(const {key,n,data} of fields) surface[key]=data.slice(0,unique*n);
  surface.index=unique<=65536?Uint16Array.from(indices):indices;
}
