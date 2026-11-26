import * as T from 'three';
import wearUrl from '../../assets/shiba-road-wear.jpg';
import poolsUrl from '../../assets/shiba-street-light.jpg';
import detailUrl from '../../assets/shiba-ground-detail.jpg';
import coverUrl from '../../assets/shiba-land-cover.png';

export function finishPavement(district, data, evening) {
  const loader = new T.TextureLoader(),
    detail = loader.load(detailUrl),
    cover = loader.load(coverUrl),
    wear = loader.load(wearUrl),
    pools = loader.load(poolsUrl);
  detail.colorSpace = T.SRGBColorSpace;
  detail.anisotropy = 8;
  const g = data.height,
    frame = new T.Vector4(g.x, g.y, (g.w - 1) * g.step, (g.h - 1) * g.step);
  district.traverse((o) => {
    if (!o.isMesh) return;
    const ground = ['shiba-ground', 'skyline-ground'].includes(o.name),
      paved = o.name.startsWith('paving-') || o.name.startsWith('skyline-street-');
    if (!ground && !paved) return;
    const m = (o.material = ground ? o.material.clone() : o.material);
    if (m.userData.siteFinish) return;
    m.userData.siteFinish = true;
    if (m.map) m.map.anisotropy = 8;
    if (ground) {
      m.emissiveIntensity = 0;
      m.metalness = 0;
      m.roughness = 0.97;
    }
    const asphalt = m.name === 'Cold asphalt',
      paint = ['White paint', 'Amber paint'].includes(m.name);
    if (m.name === 'Canal water') {
      m.roughness = 0.23;
      m.metalness = 0.32;
      m.color.set('#b0cfca');
      m.envMapIntensity = 0.85;
      m.onBeforeCompile = (sh) => {
        sh.vertexShader =
          'varying vec2 waterEN;\n' +
          sh.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nwaterEN=(modelMatrix*vec4(transformed,1.)).xz;',
          );
        sh.fragmentShader =
          'varying vec2 waterEN;\n' +
          sh.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
          vec2 ripple=vec2(sin(waterEN.x*6.4+waterEN.y*3.8+sin(waterEN.y*1.7)),sin(waterEN.y*4.1-waterEN.x*2.9));
          normal=normalize(normal+mat3(viewMatrix)*vec3(ripple.x*.020,0.,ripple.y*.012));`,
          );
      };
      m.customProgramCacheKey = () => 'furukawa-water';
      return;
    }
    if (asphalt) {
      m.metalness = 0;
      m.envMapIntensity = 0.72;
      m.bumpMap = m.map;
      m.bumpScale = 0.014;
      m.emissive.setRGB(0.018, 0.021, 0.027);
      m.emissiveIntensity = 0.55;
    } else if (paint) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -0.6;
      m.polygonOffsetUnits = -1;
      m.color.multiplyScalar(0.92);
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0.12;
      m.roughness = 0.78;
    } else if (paved && m.map) {
      m.bumpMap = m.map;
      m.bumpScale = m.name === 'Tenji yellow' ? 0.025 : 0.012;
      m.roughness = 0.88;
    }
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        evening,
        groundAtlas: { value: detail },
        landCover: { value: cover },
        landFrame: { value: frame },
        streetPools: { value: pools },
        roadWear: { value: wear },
      });
      sh.vertexShader =
        'varying vec2 siteEN;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvec3 site=(modelMatrix*vec4(transformed,1.)).xyz;siteEN=vec2(site.x,-site.z);',
        );
      sh.fragmentShader =
        `varying vec2 siteEN;uniform float evening;uniform sampler2D groundAtlas,landCover,streetPools,roadWear;uniform vec4 landFrame;
        vec3 grainMap(float id,vec2 p) {
          vec2 uv=vec2((id+.004+.992*fract(p.x))/3.,.004+.992*fract(p.y));
          return textureGrad(groundAtlas,uv,dFdx(p)*vec2(.992/3.,.992),dFdy(p)*vec2(.992/3.,.992)).rgb;
        }\n` +
        sh.fragmentShader
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
        vec2 mapEN=(siteEN-landFrame.xy)/landFrame.zw;vec3 land=texture2D(landCover,mapEN).rgb;
        float surveyMix=smoothstep(0.,.014,min(min(mapEN.x,mapEN.y),min(1.-mapEN.x,1.-mapEN.y)));
        land=mix(vec3(1.,0.,0.),land,surveyMix);
        vec3 pool=texture2D(streetPools,mapEN).rgb*surveyMix;
        ${
          asphalt
            ? `vec3 wear=mix(vec3(.06,.5,.12),texture2D(roadWear,mapEN).rgb,surveyMix);
          float chips=texture2D(map,siteEN*.91+vec2(.17,-.23)).g;
          diffuseColor.rgb*=1.12+.35*(wear.g-.5)-.13*wear.r;
          diffuseColor.rgb+=vec3(.013,.015,.018)*(.57+7.*chips);`
            : ''
        }
        ${
          ground
            ? `vec3 ortho=diffuseColor.rgb;
          float green=smoothstep(-.024,.034,ortho.g-ortho.r);
          float grass=clamp(.95*land.g+.81*smoothstep(.016,.092,ortho.g-ortho.r),0.,1.);
          float dirt=clamp(.35+2.8*(ortho.r-ortho.b),.12,.87);
          vec3 fabric=mix(mix(grainMap(2.,siteEN/1.48),grainMap(1.,siteEN/1.96),dirt),grainMap(0.,siteEN/1.65),grass);
          float distanceToViewer=length(siteEN-vec2(cameraPosition.x,-cameraPosition.z));
          float strength=.94*(1.-smoothstep(30.,220.,distanceToViewer));
          ${o.name === 'skyline-ground' ? 'strength*=mix(.48,1.,surveyMix);' : ''}
          diffuseColor.rgb=mix(ortho,fabric*(.75+.55*smoothstep(.015,.45,dot(ortho,vec3(.21,.72,.07)))),strength);`
            : ''
        }
        diffuseColor.rgb*=land.r;`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
          ${asphalt ? 'totalEmissiveRadiance+=evening*diffuseColor.rgb*(.09+.27*clamp(chips*12.,0.,1.));' : ''}
          float slant=1.-clamp(abs(dot(normalize(vViewPosition),normal)),0.,1.);
          totalEmissiveRadiance+=evening*(pool*pool*vec3(.32,.30,.27)*(.72+.36*slant)+land.b*vec3(.042,.032,.020));`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
          ${
            asphalt
              ? `vec2 macro=vMapUv*.43;float field=.50+.22*sin(macro.x+.57*sin(macro.y))+.17*cos(macro.y*.61-macro.x*.43)+.11*sin(macro.y*.53+macro.x*.81);
          roughnessFactor=clamp(.56+.32*(field*.55+wear.g*.45)-.06*wear.r-.055*evening*wear.b,.48,.85);`
              : ''
          }`,
          )
          .replace(
            '#include <lights_physical_fragment>',
            `#include <lights_physical_fragment>
          ${asphalt ? 'material.specularColor*=.53;material.specularF90=.19;' : ground ? 'material.specularColor*=.3;material.specularF90=.14;' : 'material.specularColor*=.67;material.specularF90=.34;'}`,
          );
    };
    m.customProgramCacheKey = () => 'survey-ground-' + m.name + '-' + ground;
  });
}
