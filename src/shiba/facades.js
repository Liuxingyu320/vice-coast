import * as T from 'three';
import roomUrl from '../../assets/shiba-rooms.jpg';

const office = ['Curtain wall', 'Ribbon office', 'Porcelain tile', 'Metal sash'];
const plaster = ['#86959a', '#b9b5a7', '#b49682', '#9fa7a6', '#c3b9a5'];

// fit is the unclamped position inside a whole-bay rectangle proven to lie in the surveyed polygon.
export function buildingFinish(district, evening) {
  const rooms = new T.TextureLoader().load(roomUrl);
  rooms.colorSpace = T.SRGBColorSpace;
  rooms.anisotropy = 8;
  const walls = new Map();
  district.traverse((o) => {
    if (o.isMesh) walls.set(o.material.name, o.material);
  });
  const stone = walls.get('Foundation concrete')?.map;
  const roomCode = `
    uniform float evening;
    uniform sampler2D roomChart;
    float seed(vec2 cell) {
      vec3 p=fract(vec3(cell.xyx)*vec3(.1031,.1030,.0973));
      p+=dot(p,p.yzx+33.33);
      return fract((p.x+p.y)*p.z);
    }
    vec3 interior(vec2 bay, vec3 n, vec2 axis, vec3 world, vec3 albedo, float glazing){
      vec2 id=floor(bay), f=fract(bay);
      vec2 wallID=floor((world.xz-axis*dot(world.xz,axis))*.31+vec2(.03));
      float r=seed(id+wallID), r2=seed(id.yx+wallID+37.);
      vec3 eye=normalize(cameraPosition-world);
      vec2 ray=-vec2(dot(eye.xz,axis),eye.y)/max(.26,abs(dot(n,eye)))*vec2(.49,.32);
      vec2 bound=(mix(vec2(.02),vec2(.98),step(vec2(0.),ray))-f)/(ray+vec2(.0001));
      vec2 uv=clamp(f+clamp(min(bound.x,bound.y),0.,1.)*ray,.02,.98);
      uv.x=mix(uv.x,1.-uv.x,step(.5,r2));
      uv=vec2(.024)+.95*(uv*mix(.68,.98,r2)+vec2(r,1.-r)*(.31-.30*r2));
      vec2 cell=vec2(step(.5,r),step(.5,r2));
      vec3 room=texture2D(roomChart,(cell+uv)*.5).rgb;
      float blind=step(.72,r2)*smoothstep(.30+.43*r,.34+.43*r,f.y);
      vec3 tint=mix(vec3(.69,.82,.87),vec3(1.12,.81,.57),r2);
      vec3 pane=albedo*(.74+.24*pow(1.-abs(dot(n,eye)),3.))+
        tint*room*(.12+.5*evening*smoothstep(.38,.72,r))*(1.-.91*blind);
      return mix(albedo,pane,glazing*(1.-smoothstep(32.,115.,length(world-cameraPosition))));
    }
  `;
  return (mat) => {
    if (mat.map) mat.map.anisotropy = 8;
    const ft = mat.name === 'FootTown glazing',
      park = mat.name === 'Park joinery',
      temple = mat.name === 'Temple joinery';
    if (!(ft || park || temple || office.includes(mat.name))) return;
    const tint = new T.Color(plaster[park || temple ? 4 : Math.max(0, office.indexOf(mat.name))]);
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        evening,
        roomChart: { value: rooms },
        stoneFinish: { value: stone },
        renderTint: { value: tint },
      });
      sh.vertexShader =
        `varying vec3 wallWorld,wallNormal;
        ${ft ? '' : 'attribute float _panel_u,_panel_v,_plinth; varying vec2 wallFit; varying float aboveBase;'}
        ` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          wallWorld=(modelMatrix*vec4(transformed,1.)).xyz;
          wallNormal=mat3(modelMatrix)*normal;
          ${ft ? '' : 'wallFit=vec2(_panel_u,_panel_v);aboveBase=wallWorld.y-_plinth;'}`,
        );
      sh.fragmentShader =
        roomCode +
        `varying vec3 wallWorld,wallNormal;
        uniform sampler2D stoneFinish; uniform vec3 renderTint;
        ${ft ? '' : 'varying vec2 wallFit; varying float aboveBase;'}
        ` +
        sh.fragmentShader
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
          vec3 N=normalize(wallNormal); vec2 axis=normalize(vec2(-N.z,N.x)+.00001);
          vec2 metres=vec2(dot(wallWorld.xz,axis),wallWorld.y);
          ${
            ft
              ? `
            diffuseColor.rgb=interior(metres/vec2(1.84,3.65),N,axis,wallWorld,diffuseColor.rgb,1.);
          `
              : `
            float whole=step(0.,min(min(wallFit.x,wallFit.y),min(1.-wallFit.x,1.-wallFit.y)));
            vec3 aggregate=texture2D(stoneFinish,metres/2.4).rgb;
            float noise=clamp((aggregate.g-.085)*.73,-.055,.06);
            vec2 skin=metres/vec2(1.6,.64);
            skin.x+=.5*mod(floor(skin.y),2.);
            vec2 cell=fract(skin), aa=max(fwidth(skin),vec2(.001));
            vec2 jointFade=smoothstep(vec2(.004)-aa,vec2(.009)+aa,min(cell,1.-cell));
            float panelTone=seed(floor(skin)+floor(dot(wallWorld.xz,N.xz)))*.072;
            vec3 render=renderTint*(.88+noise+panelTone+.055*min(jointFade.x,jointFade.y));
            render*=.88+.12*smoothstep(.005,.027,abs(fract((aboveBase-.60)/3.3)-.5));
            vec2 seam=abs(fract(metres/vec2(1.35,.55))-.5);
            float joint=1.-smoothstep(.476,.499,max(seam.x,seam.y));
            vec3 plinth=mix(vec3(.078,.086,.085),aggregate,.33)*(.83+.17*joint);
            vec3 base=mix(${park || temple ? 'mix(aggregate,render,.72)' : 'plinth'},render,smoothstep(-.012,.012,aboveBase));
            ${
              park || temple
                ? ''
                : `vec2 bay=vMapUv*8.;
              float glazing=smoothstep(.028,.11,diffuseColor.b-diffuseColor.r+.016);
              diffuseColor.rgb=interior(bay,N,axis,wallWorld,diffuseColor.rgb,glazing);
              float belt=fract(bay.y);
              diffuseColor.rgb*=1.-.16*(1.-smoothstep(.018,.047,belt))+.12*smoothstep(.965,.988,belt);
            `
            }
            diffuseColor.rgb=mix(base,diffuseColor.rgb,whole);
          `
          }`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            ${ft ? 'totalEmissiveRadiance+=diffuseColor.rgb*(.06+.17*evening);' : 'totalEmissiveRadiance*=whole*evening;'}
          `,
          );
    };
    mat.customProgramCacheKey = () => 'fitted-wall-' + mat.name;
  };
}
