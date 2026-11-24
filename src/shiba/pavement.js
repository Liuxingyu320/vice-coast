import * as T from 'three';
import detailUrl from '../../assets/shiba-ground-detail.jpg';
import coverUrl from '../../assets/shiba-land-cover.png';

export function finishPavement(district, data, evening) {
  const loader = new T.TextureLoader(),
    detail = loader.load(detailUrl),
    cover = loader.load(coverUrl);
  detail.colorSpace = T.SRGBColorSpace;
  detail.anisotropy = 8;
  const g = data.height,
    frame = new T.Vector4(g.x, g.y, (g.w - 1) * g.step, (g.h - 1) * g.step);
  district.traverse((o) => {
    if (!o.isMesh) return;
    const ground = ['shiba-ground', 'skyline-ground'].includes(o.name),
      paved = o.name.startsWith('paving-');
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
    if (asphalt) {
      m.metalness = 0;
      m.envMapIntensity = 0.22;
      m.emissive.setRGB(0.013, 0.016, 0.021);
      m.emissiveIntensity = 0.55;
    } else if (paint) {
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0.18;
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
      });
      sh.vertexShader =
        'varying vec2 siteEN;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvec3 site=(modelMatrix*vec4(transformed,1.)).xyz;siteEN=vec2(site.x,-site.z);',
        );
      sh.fragmentShader =
        `varying vec2 siteEN;uniform float evening;uniform sampler2D groundAtlas,landCover;uniform vec4 landFrame;
        vec3 grainMap(float id,vec2 p) {
          vec2 uv=vec2((id+.004+.992*fract(p.x))/3.,.004+.992*fract(p.y));
          return textureGrad(groundAtlas,uv,dFdx(p)*vec2(.992/3.,.992),dFdy(p)*vec2(.992/3.,.992)).rgb;
        }\n` +
        sh.fragmentShader
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
        vec3 land=texture2D(landCover,(siteEN-landFrame.xy)/landFrame.zw).rgb;
        ${
          ground
            ? `vec3 ortho=diffuseColor.rgb;
          float green=smoothstep(-.024,.034,ortho.g-ortho.r);
          float grass=clamp(.64*green+.56*land.g,0.,1.);
          float dirt=clamp(.35+2.8*(ortho.r-ortho.b),.12,.87);
          vec3 fabric=mix(mix(grainMap(2.,siteEN/1.48),grainMap(1.,siteEN/1.96),dirt),grainMap(0.,siteEN/1.65),grass);
          float distanceToViewer=length(siteEN-vec2(cameraPosition.x,-cameraPosition.z));
          float strength=.94*(1.-smoothstep(30.,220.,distanceToViewer));
          diffuseColor.rgb=mix(ortho,fabric*(.75+.55*smoothstep(.015,.45,dot(ortho,vec3(.21,.72,.07)))),strength);`
            : ''
        }
        diffuseColor.rgb*=land.r;`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=land.b*evening*vec3(.092,.064,.033);',
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
          ${
            asphalt
              ? `vec2 macro=vMapUv*.43;float field=.50+.22*sin(macro.x+.57*sin(macro.y))+.17*cos(macro.y*.61-macro.x*.43)+.11*sin(macro.y*.53+macro.x*.81);
          roughnessFactor=.45+.40*clamp(field,0.,1.);`
              : ''
          }`,
          )
          .replace(
            '#include <lights_physical_fragment>',
            `#include <lights_physical_fragment>
          ${asphalt ? 'material.specularColor*=.14;material.specularF90=.045;' : ground ? 'material.specularColor*=.3;material.specularF90=.14;' : 'material.specularColor*=.67;material.specularF90=.34;'}`,
          );
    };
    m.customProgramCacheKey = () => 'survey-ground-' + m.name + '-' + ground;
  });
}
