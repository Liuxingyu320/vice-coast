import * as T from 'three';
import { canvasMap, random } from './primitives.js';

function elevationTexture(h) {
  const lo = Math.min(...h.cm) / 100,
    hi = Math.max(...h.cm) / 100;
  const texture = new T.DataTexture(
    Uint8Array.from(h.cm, (v) => Math.round(((v / 100 - lo) / (hi - lo)) * 255)),
    h.w,
    h.h,
    T.RedFormat,
  );
  texture.magFilter = texture.minFilter = T.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return {
    texture,
    range: new T.Vector2(lo, hi - lo),
    grid: new T.Vector4(h.x - h.step / 2, h.y - h.step / 2, h.w * h.step, h.h * h.step),
  };
}
export const paintFacadeChart = (emission) => (g, w, h) => {
  const rand = random(1971);
  g.fillStyle = emission ? 'black' : '#959b99';
  g.fillRect(0, 0, w, h);
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 8; i++) {
      const x = i * 128,
        y = j * 128,
        shade = rand(),
        lit = rand(),
        blind = rand(),
        v = rand(),
        cold = rand();
      if (!emission) {
        g.fillStyle = ['#8d9292', '#b1b1a8', '#949a9a', '#a2a39c'][Math.floor(shade * 4)];
        g.fillRect(x, y, 128, 128);
        g.fillStyle = '#686d70';
        g.fillRect(x, y + 107, 128, 6);
        g.fillStyle = '#c4c5bd';
        g.fillRect(x, y + 113, 128, 3);
        g.fillStyle = '#575e60';
        g.fillRect(x + 5, y + 10, 118, 92);
      }
      const gr = g.createLinearGradient(x, y, x + 35, y + 106);
      if (emission) {
        gr.addColorStop(0, lit > 0.63 ? (cold > 0.65 ? '#e7e4d4' : '#ffd39b') : '#020303');
        gr.addColorStop(1, lit > 0.63 ? '#766752' : '#060707');
      } else {
        gr.addColorStop(0, ['#7c979f', '#778b91', '#8d9d9c'][Math.floor(v * 3)]);
        gr.addColorStop(0.56, '#62737a');
        gr.addColorStop(1, shade > 0.6 ? '#44545a' : '#586567');
      }
      g.fillStyle = gr;
      g.fillRect(x + 9, y + 14, 110, 83);
      g.fillStyle = emission ? '#181713' : '#738083';
      g.fillRect(x + 9, y + 14, 110, blind * 39);
      g.fillStyle = emission ? '#302b22' : '#8f9897';
      for (let k = 0; k < blind * 39; k += 5) g.fillRect(x + 9, y + 14 + k, 110, 1);
      if (v > 0.58) {
        g.fillStyle = emission ? '#302b23' : '#46565b';
        g.fillRect(x + 15, y + 75, 24, 20);
        g.fillRect(x + 27, y + 65, 3, 12);
      }
      g.fillStyle = emission ? '#020202' : '#474e51';
      g.fillRect(x + 61, y + 12, 4, 87);
      g.fillRect(x + 8, y + 42, 112, 3);
      if (!emission) {
        g.fillStyle = '#c8cac2';
        g.fillRect(x + 65, y + 13, 1, 85);
        g.fillRect(x + 7, y + 100, 113, 2);
        g.fillStyle = '#777e80';
        g.fillRect(x, y, 2, 128);
      }
    }
};

export function buildingFinish(evening, height) {
  // Eight floors of photographed-scale modules. The day and emission charts share every mullion.
  const atlas = canvasMap(1024, 1024, paintFacadeChart(false)),
    emissiveMap = canvasMap(1024, 1024, paintFacadeChart(true));
  for (const t of [atlas, emissiveMap]) t.wrapS = t.wrapT = T.RepeatWrapping;
  const dem = elevationTexture(height);
  return (mat, plain) => {
    if (plain) {
      mat.color.set(0xffffff);
      mat.roughness = 0.58;
      mat.metalness = 0.16;
    }
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        chart: { value: atlas },
        windowsMap: { value: emissiveMap },
        evening,
        siteDEM: { value: dem.texture },
        siteGrid: { value: dem.grid },
        siteRange: { value: dem.range },
      });
      sh.vertexShader =
        'varying vec3 siteWall; varying vec3 wallAxis;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nsiteWall=(modelMatrix*vec4(transformed,1.)).xyz;wallAxis=mat3(modelMatrix)*normal;',
        );
      sh.fragmentShader =
        'varying vec3 siteWall;varying vec3 wallAxis;uniform sampler2D chart,windowsMap,siteDEM;uniform vec4 siteGrid;uniform vec2 siteRange;uniform float evening;\n' +
        sh.fragmentShader
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
        vec3 surfaceNormal=normalize(wallAxis);
        float wall=1.-smoothstep(.20,.65,abs(surfaceNormal.y));
        vec2 along=normalize(floor(vec2(-surfaceNormal.z,surfaceNormal.x)*128.+.5)+vec2(.00001));
        if(along.x<-.01||(abs(along.x)<=.01 && along.y<0.))along=-along;
        float base=siteRange.x+siteRange.y*texture2D(siteDEM,(vec2(siteWall.x,-siteWall.z)-siteGrid.xy)/siteGrid.zw).r;
        float rise=siteWall.y-base;vec2 st=vec2(dot(siteWall.xz,along)/19.2,siteWall.y/26.4);
        vec3 panes=texture2D(chart,st).rgb;
        float nearWall=1.-smoothstep(45.,140.,distance(cameraPosition,siteWall));
        float panesOn=wall*smoothstep(.65,1.2,rise);
        ${
          plain
            ? `
        vec2 stone=fract(vec2(st.x*19.2/1.2,rise/.44));
        vec3 plinth=vec3(.12,.135,.14)*(.62+.38*smoothstep(.005,.027,min(stone.x,stone.y)));
        diffuseColor.rgb=mix(vec3(.32,.34,.34),mix(plinth,panes,smoothstep(.66,1.05,rise)),wall);
        `
            : `
        vec3 photo=diffuseColor.rgb;
        vec3 lifted=photo*.85+vec3(.04);
        float glassBand=1.-smoothstep(.12,.42,dot(photo,vec3(.21,.72,.07)));
        vec2 bay=fract(st*8.);vec2 fw=max(fwidth(st*8.),.002);
        float joint=(1.-smoothstep(.012,.014+fw.x,abs(bay.x-.5)))*.55;
        float floorJoint=1.-smoothstep(.010,.012+fw.y,abs(bay.y-.11));
        vec3 finish=mix(lifted,panes*.90+.012,.20+.32*glassBand);
        finish*=1.-joint*glassBand-floorJoint*.22;
        diffuseColor.rgb=mix(photo,finish,nearWall*panesOn);
        `
        }`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,clamp(.78-panes.b*1.20,.35,.82),panesOn*${plain ? '1.' : 'nearWall*.52'});`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
        totalEmissiveRadiance+=texture2D(windowsMap,st).rgb*panesOn*evening*${plain ? '1.15' : '.45'};`,
          );
    };
    mat.customProgramCacheKey = () => (plain ? 'metre-office-stone' : 'photo-mullions');
  };
}
