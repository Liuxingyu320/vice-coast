import * as T from 'three';

// Draw empty bays on the measured outdoor parking polygons, including lots visible in the aerial photograph.
export function finishParking(group,areas,grid){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1536;
  const ctx=canvas.getContext('2d'),w=(grid.w-1)*grid.step,h=(grid.h-1)*grid.step;
  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(canvas.width/w,0,0,-canvas.height/h,-grid.x*canvas.width/w,(grid.y+h)*canvas.height/h);
  for(const {kind,rings} of areas){
    if(kind!=='parking')continue;
    const ring=rings[0];let angle=0,longest=0;
    ring.forEach(([x,y],i)=>{
      const [u,v]=ring[(i+1)%ring.length],len=Math.hypot(u-x,v-y);
      if(len>longest){longest=len;angle=Math.atan2(v-y,u-x);}
    });
    ctx.fillStyle='rgb(255,'+Math.round((Math.cos(angle)*.5+.5)*255)+','+Math.round((Math.sin(angle)*.5+.5)*255)+')';
    ctx.beginPath();for(const r of rings){r.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}ctx.fill('evenodd');
  }
  const mask=new T.CanvasTexture(canvas);
  group.traverse(o=>{
    if(!['shiba-ground','skyline-ground'].includes(o.name))return;
    const mat=o.material,apply=mat.onBeforeCompile;
    mat.onBeforeCompile=function(shader,renderer){
      apply.call(this,shader,renderer);shader.uniforms.parkingMask={value:mask};
      shader.fragmentShader='uniform sampler2D parkingMask;\n'+shader.fragmentShader.replace('diffuseColor.rgb*=land.r;',`
        vec3 lot=texture2D(parkingMask,mapEN).rgb;
        if(lot.r>.01&&all(greaterThanEqual(mapEN,vec2(0.)))&&all(lessThanEqual(mapEN,vec2(1.)))){
          vec2 axis=normalize(lot.gb*2.-1.+vec2(.0001)), meters=vec2(dot(siteEN,axis),dot(siteEN,vec2(-axis.y,axis.x)));
          float row=mod(meters.y,15.4),px=max(.04,fwidth(meters.x)),py=max(.04,fwidth(meters.y));
          float stripe=1.-smoothstep(.045,.045+px,abs(fract(meters.x/2.55+.5)-.5)*2.55);
          float aisle=smoothstep(4.9,5.1,row)*(1.-smoothstep(10.3,10.5,row));
          float back=1.-smoothstep(.055,.055+py,min(row,15.4-row));
          float marking=max(stripe*(1.-aisle),back)*(1.-smoothstep(.3,1.5,max(px,py)));
          vec3 asphalt=vec3(.084,.091,.099)+.015*grainMap(2.,siteEN/2.).rgb;
          diffuseColor.rgb=mix(diffuseColor.rgb,mix(asphalt,vec3(.57,.55,.47),marking),smoothstep(.02,.9,lot.r));
        }
        diffuseColor.rgb*=land.r;`);
    };
    const previous=mat.customProgramCacheKey();mat.customProgramCacheKey=()=>previous+'-parking';
  });
}
