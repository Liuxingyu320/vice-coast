// Integrate height-dependent extinction along the view ray. The scene's existing fog and sun
// supply the period transition, including for instanced furniture and the distant survey.
export function installAir(scene, sky) {
  const visited = new Set();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    for (const mat of [].concat(object.material)) {
      if (visited.has(mat) || !mat.fog || mat.isShaderMaterial) continue;
      visited.add(mat);
      const compile = mat.onBeforeCompile,
        cacheKey = mat.customProgramCacheKey();
      mat.onBeforeCompile = function (sh, renderer) {
        compile.call(this, sh, renderer);
        if (!sh.vertexShader.includes('#include <fog_vertex>')) return;
        sh.uniforms.airSun = sky.sun;
        sh.uniforms.airNight = sky.night;
        sh.uniforms.airTint = sky.halo;
        sh.vertexShader =
          'varying vec3 airRay;\n' +
          sh.vertexShader.replace(
            '#include <fog_vertex>',
            '#include <fog_vertex>\nairRay=(vec4(mvPosition.xyz,0.)*viewMatrix).xyz;',
          );
        sh.fragmentShader =
          'varying vec3 airRay;uniform vec3 airSun,airTint;uniform float airNight;\n' +
          sh.fragmentShader.replace(
            '#include <fog_fragment>',
            `
          #ifdef USE_FOG
            float travel=length(airRay);vec3 heading=airRay/max(1.,travel);
            float h0=clamp(cameraPosition.y/185.,-1.,8.), dh=clamp(airRay.y/185.,-8.,8.);
            float integral=exp(-h0)*(abs(dh)<.025?1.-.5*dh:(1.-exp(-dh))/dh);
            float airThickness=travel*fogDensity*(.40+.84*clamp(integral,0.,1.7));
            float haze=1.-exp(-airThickness*airThickness*.92);
            float cosSun=max(0.,dot(heading,airSun));
            float mie=.055/pow(max(.095,1.5329-1.46*cosSun),1.45);
            vec3 fogTint=mix(fogColor,mix(fogColor,airTint,.62),clamp(mie,0.,.62)*(1.-airNight));
            gl_FragColor.rgb=mix(gl_FragColor.rgb,fogTint,haze);
          #endif`,
          );
      };
      mat.customProgramCacheKey = () => cacheKey + '-shiba-air';
      mat.needsUpdate = true;
    }
  });
}
