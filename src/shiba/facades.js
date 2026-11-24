import * as T from 'three';
import templeJoineryUrl from '../../assets/shiba-temple-joinery.jpg';

const styles = ['Curtain wall', 'Ribbon office', 'Porcelain tile', 'Metal sash'];

export function buildingFinish(district, evening, height) {
  const charts = {};
  district.traverse((o) => {
    if (o.isMesh && styles.includes(o.material.name)) charts[o.material.name] = o.material;
  });
  const detail = charts['Metal sash'],
    stone = district.getObjectByName('building-foundations');
  let baseStone;
  stone?.traverse((o) => {
    if (o.isMesh) baseStone = o.material.map;
  });
  function compose(property) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    styles.forEach((name, i) =>
      ctx.drawImage(charts[name][property].image, (i % 2) * 1024, (1 - Math.floor(i / 2)) * 1024, 1024, 1024),
    );
    const atlas = new T.CanvasTexture(canvas);
    atlas.colorSpace = T.SRGBColorSpace;
    atlas.anisotropy = 8;
    return atlas;
  }
  const facadeChart = compose('map'),
    windowChart = compose('emissiveMap');
  const joinery = new T.TextureLoader().load(templeJoineryUrl);
  joinery.colorSpace = T.SRGBColorSpace;
  joinery.wrapS = joinery.wrapT = T.RepeatWrapping;
  joinery.anisotropy = 8;
  const dem = new T.DataTexture(
    Float32Array.from(height.gradeCm, (v) => v * 0.01),
    height.w,
    height.h,
    T.RedFormat,
    T.FloatType,
  );
  dem.needsUpdate = true;
  const gradeDecl = `uniform highp sampler2D gradeGrid;float baseZ(vec3 p){
    vec2 q=clamp((vec2(p.x,-p.z)-vec2(${height.x.toFixed(1)},${height.y.toFixed(1)}))/${height.step.toFixed(1)},vec2(0.),vec2(${height.w - 1.001},${height.h - 1.001}));
    ivec2 i=ivec2(q);vec2 f=fract(q);return (1.-max(f.x,f.y))*texelFetch(gradeGrid,i,0).r+max(0.,f.x-f.y)*texelFetch(gradeGrid,i+ivec2(1,0),0).r+
    max(0.,f.y-f.x)*texelFetch(gradeGrid,i+ivec2(0,1),0).r+min(f.x,f.y)*texelFetch(gradeGrid,i+ivec2(1,1),0).r;}`;
  const plinth = `float rise=wallXYZ.y-baseZ(wallXYZ);
    vec2 block=vec2(dot(wallXYZ.xz,tangent)/1.16,rise/.38);
    block.x+=.5*mod(floor(block.y),2.);vec2 margin=min(fract(block),1.-fract(block));
    float seam=smoothstep(.003,.015,min(margin.x,margin.y));
    vec3 stoneFinish=texture2D(stoneDetail,vec2(dot(wallXYZ.xz,tangent),wallXYZ.y)/2.4).rgb*(.56+.34*seam);
    diffuseColor.rgb=mix(diffuseColor.rgb,stoneFinish,wall*(1.-smoothstep(1.08,1.13,rise)));`;
  // Use the embedded 1024 px charts with their copper, aluminium, glass and masonry colours in all viewers.
  return (mat) => {
    const plain = styles.includes(mat.name);
    const sacred = mat.name.startsWith('Temple Facade');
    const tower = mat.name.startsWith('Tower Facade');
    if (mat.map) mat.map.anisotropy = 8;
    if (plain) {
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { evening, gradeGrid: { value: dem }, stoneDetail: { value: baseStone } });
        sh.vertexShader =
          'varying vec3 wallXYZ,wallN;\n' +
          sh.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nwallXYZ=(modelMatrix*vec4(transformed,1.)).xyz;wallN=mat3(modelMatrix)*normal;',
          );
        sh.fragmentShader =
          'varying vec3 wallXYZ,wallN;uniform sampler2D stoneDetail;uniform float evening;' +
          gradeDecl +
          '\n' +
          sh.fragmentShader
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
            vec3 n=normalize(wallN);float wall=1.-smoothstep(.28,.65,abs(n.y));vec2 tangent=normalize(vec2(-n.z,n.x)+.00001);
            ${plinth}`,
            )
            .replace(
              '#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= evening*smoothstep(1.10,1.25,rise);',
            )
            .replace(
              '#include <roughnessmap_fragment>',
              `#include <roughnessmap_fragment>
            float reflection=clamp((diffuseColor.b-diffuseColor.r)*5.+.10,0.,1.);
            roughnessFactor=mix(.80,.34,reflection);`,
            );
      };
      mat.customProgramCacheKey = () => 'japan-metric-facade';
      return;
    }
    if (!detail || !baseStone) return;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        panes: { value: facadeChart },
        litPanes: { value: windowChart },
        gradeGrid: { value: dem },
        stoneDetail: { value: baseStone },
        templeJoinery: { value: joinery },
        evening,
      });
      sh.vertexShader =
        'attribute float _facade_style; varying float styleId;varying vec3 wallXYZ; varying vec3 surveyN;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nwallXYZ=(modelMatrix*vec4(transformed,1.)).xyz;surveyN=mat3(modelMatrix)*normal;styleId=_facade_style;',
        );
      sh.fragmentShader =
        gradeDecl +
        '\nvarying float styleId;varying vec3 wallXYZ,surveyN;uniform sampler2D panes,litPanes,stoneDetail,templeJoinery;uniform float evening;\n' +
        sh.fragmentShader
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
          vec3 n=normalize(surveyN),aw=abs(n),weights=pow(aw,vec3(6.));
          weights/=max(dot(weights,vec3(1.)),.0001);
          float nearWall=1.-smoothstep(75.,230.,distance(wallXYZ,cameraPosition));
          float wall=1.-smoothstep(.28,.68,aw.y);
          // Triplanar fine aggregate and a metre-true tangent projection for the straight window frames.
          float grit=dot(weights,vec3(texture2D(stoneDetail,wallXYZ.zy/.83).r,
            texture2D(stoneDetail,wallXYZ.xz/.83).r,texture2D(stoneDetail,wallXYZ.xy/.83).r));
          vec2 tangent=normalize(vec2(-n.z,n.x)+vec2(.000001));if(tangent.x<-.0001)tangent=-tangent;
          vec2 metric=vec2(dot(wallXYZ.xz,tangent),wallXYZ.y);
          vec2 st=metric/vec2(19.2,26.4);vec3 photo=diffuseColor.rgb;
          vec2 cell=vec2(mod(floor(styleId+.5),2.),floor((styleId+.5)/2.));vec2 atlasUV=(cell+.003+fract(st)*.994)/2.;
          vec3 chart=textureGrad(panes,atlasUV,dFdx(st)*.497,dFdy(st)*.497).rgb;
          float wallLight=dot(photo,vec3(.22,.70,.08));
          ${
            sacred || tower
              ? `
          float grain=sin(metric.x*49.+sin(metric.y*2.2)*1.5)*.045+(grit-.084)*1.25;
          float tileWave=cos(dot(wallXYZ.xz,vec2(.993,-.12))*32.)*.080;
          diffuseColor.rgb=photo*(1.+nearWall*mix(tileWave,grain,wall));
          ${
            sacred
              ? `
          float roll=fract(metric.x/.29);
          float ridge=.68+.38*smoothstep(.22,.43,roll)*(1.-smoothstep(.55,.79,roll));
          float joint=1.-.20*(1.-smoothstep(.011,.041,abs(fract(metric.y/.37)-.5)));
          vec3 roof=mix(photo,vec3(.115,.130,.136),.55)*ridge*joint;
          diffuseColor.rgb=mix(diffuseColor.rgb,roof,(1.-wall)*(.50+.40*nearWall));
          vec3 lattice=texture2D(templeJoinery,(metric-vec2(0.,7.5))/vec2(7.2,3.3)).rgb;
          vec3 wood=lattice*(.75+.42*clamp(wallLight*1.7,0.,1.))+.055*photo;
          float rise=wallXYZ.y-baseZ(wallXYZ);
          vec3 foot=texture2D(stoneDetail,metric/2.4).rgb*.86;
          wood=mix(foot,wood,smoothstep(.40,.46,rise));
          diffuseColor.rgb=mix(diffuseColor.rgb,wood,wall*(.55+.32*nearWall));`
              : ''
          }
          ${
            tower
              ? `
          float gallery=wall*max(step(138.,wallXYZ.y)*(1.-step(150.,wallXYZ.y)),step(242.,wallXYZ.y)*(1.-step(270.,wallXYZ.y)));
          float glazing=max(step(141.9,wallXYZ.y)*(1.-step(146.4,wallXYZ.y)),step(258.7,wallXYZ.y)*(1.-step(263.5,wallXYZ.y)));
          float pane=fract(metric.x/1.22),frame=1.-smoothstep(.02,.057,min(pane,1.-pane));
          float metal=clamp(.54+grit*1.8+.10*cos(metric.y*8.),.42,.83);
          vec3 cladding=mix(photo,vec3(.22,.26,.27)*metal,.52);
          vec3 glass=mix(vec3(.048,.086,.106)+photo*.24,vec3(.19,.23,.24),frame);
          diffuseColor.rgb=mix(diffuseColor.rgb,mix(cladding,glass,glazing),gallery*.93);`
              : ''
          }`
              : `
          vec2 metersPerPixel=vec2(length(dFdx(wallXYZ)),length(dFdy(wallXYZ)));
          vec2 texelsPerPixel=vec2(length(dFdx(vMapUv)),length(dFdy(vMapUv)))*vec2(textureSize(map,0));
          float density=max(texelsPerPixel.x/max(metersPerPixel.x,.0001),texelsPerPixel.y/max(metersPerPixel.y,.0001));
          float lowDensity=1.-smoothstep(11.,38.,density);
          float bay=dot(chart,vec3(.23,.68,.09));
          vec3 transferred=(.045+.86*photo)*clamp(.49+3.55*bay,.48,1.66);
          vec3 finished=mix(transferred,chart,.24+.22*lowDensity);
          diffuseColor.rgb=mix(photo,finished,wall*(.34+.45*lowDensity+.18*nearWall));
          diffuseColor.rgb*=1.+nearWall*(grit-.084)*.86;
          ${plinth}`
          }`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.76-.30*clamp((chart.b-chart.r)*5.+.2,0.,1.),wall*nearWall);`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
        ${sacred || tower ? '' : 'totalEmissiveRadiance+=textureGrad(litPanes,atlasUV,dFdx(st)*.497,dFdy(st)*.497).rgb*wall*smoothstep(1.1,1.25,rise)*evening*(.20+.17*(1.-smoothstep(.05,.4,wallLight)));'}`,
          );
    };
    mat.customProgramCacheKey = () =>
      tower ? 'survey-tower-gallery' : sacred ? 'survey-temple-grain' : 'survey-facade-details';
  };
}
