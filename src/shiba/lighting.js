import * as T from 'three';

const periods = {
  dusk: [
    '#1A2245',
    '#7E3F67',
    '#FF8B42',
    '#FFD384',
    '#FFB067',
    2.85,
    '#CA7E8C',
    '#292533',
    1.15,
    '#6B4C5E',
    0.00046,
    1.12,
    13,
    0.42,
    0.7,
  ],
  night: [
    '#070B19',
    '#101D3E',
    '#293966',
    '#CFDEFF',
    '#6E90FF',
    0.78,
    '#283B6B',
    '#131620',
    0.85,
    '#0D1326',
    0.00056,
    1.24,
    28,
    0.95,
    1,
  ],
  day: [
    '#2C6AB5',
    '#7EB2DC',
    '#C1E2F6',
    '#FFF2D8',
    '#FFF2DC',
    2.45,
    '#DCEEFF',
    '#6E7B78',
    1.25,
    '#BED3E1',
    0.00025,
    1.02,
    48,
    0,
    0,
  ],
};
const toColor = (s) => new T.Color(s);
function skyMaterial() {
  return new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new T.Color() },
      mid: { value: new T.Color() },
      edge: { value: new T.Color() },
      halo: { value: new T.Color() },
      sun: { value: new T.Vector3() },
      night: { value: 0 },
    },
    vertexShader:
      'varying vec3 ray; void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 top,mid,edge,halo,sun;uniform float night;varying vec3 ray;
 float hash(vec2 p){return fract(sin(dot(p,vec2(37.31,91.17)))*42367.23);}
 float cloudnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
 void main(){vec3 d=normalize(ray);float h=max(0.,d.y);
 vec3 sky=mix(edge,mid,smoothstep(0.,.29,h));sky=mix(sky,top,smoothstep(.18,.89,h));
 vec2 cloudUV=d.xz/(.29+h)*vec2(3.1,9.8)+vec2(2.6,8.1);
 float layers=.57*cloudnoise(cloudUV)+.27*cloudnoise(cloudUV*2.12)+.16*cloudnoise(cloudUV*4.13);
 float cirrus=smoothstep(.48,.77,layers)*smoothstep(.0,.13,h)*(1.-smoothstep(.55,.96,h));
 sky=mix(sky,mix(mid,halo,.48),cirrus*(.135-.10*night));
 float s=max(dot(d,sun),0.);sky+=halo*(pow(s,24.)*.33+pow(s,220.)*.79+smoothstep(.9994,.99983,s)*2.5)*(1.-night*.81);
 gl_FragColor=vec4(sky,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
}
export function glowMap() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'),
    r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  [
    [0, '#fff'],
    [0.09, '#ffffffe8'],
    [0.26, '#ffffff62'],
    [0.6, '#ffffff15'],
    [1, '#ffffff00'],
  ].forEach(([p, v]) => r.addColorStop(p, v));
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}
export function createLighting(renderer, scene, district, car) {
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const sky = new T.Mesh(new T.SphereGeometry(1, 32, 18), skyMaterial());
  sky.scale.setScalar(3450);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  const light = new T.DirectionalLight(),
    hemi = new T.HemisphereLight();
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 2, far: 540 });
  light.shadow.bias = -0.00026;
  light.shadow.normalBias = 0.12;
  scene.add(light, light.target, hemi);
  scene.fog = new T.FogExp2();
  const eveningWindows = { value: 0 };
  function facadeNight(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.eveningWindows = eveningWindows;
      sh.vertexShader = 'varying vec3 facadePosition;\n' + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfacadePosition=(modelMatrix*vec4(transformed,1.)).xyz;',
      );
      sh.fragmentShader = 'varying vec3 facadePosition;uniform float eveningWindows;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
 vec3 wp=facadePosition;vec3 nn=normalize(cross(dFdx(wp),dFdy(wp)));
 vec2 cell=vec2(abs(nn.x)>abs(nn.z)?wp.z:wp.x,wp.y)/vec2(2.75,3.44);
 vec2 panel=fract(cell);float lottery=fract(sin(dot(floor(cell),vec2(19.77,31.91)))*7519.37);
 float window=smoothstep(.16,.22,panel.x)*(1.-smoothstep(.77,.85,panel.x))*smoothstep(.22,.30,panel.y)*(1.-smoothstep(.74,.8,panel.y));
 float lightMask=step(.73,lottery)*window*(1.-smoothstep(.18,.5,abs(nn.y)))*smoothstep(12.,26.,wp.y);
 totalEmissiveRadiance+=mix(vec3(.40,.56,.75),vec3(1.,.60,.26),lottery)*lightMask*eveningWindows*.77;`,
      );
    };
    mat.customProgramCacheKey = () => 'sampled-facade-evening';
  }
  const orange = [],
    glass = [],
    facades = [];
  district.traverse((o) => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    const mat = o.material,
      name = mat.name;
    if (name === 'International orange') {
      orange.push(mat);
      o.castShadow = true;
    }
    if (name === 'Ivory steel' || name === 'Antenna steel') o.castShadow = true;
    if (['Deck glazing', 'Warm windows'].includes(name)) glass.push(mat);
    if (name.startsWith('Facade') || name.startsWith('Backdrop facade')) {
      mat.roughness = 0.68;
      mat.metalness = 0.13;
      if (!facades.includes(mat)) {
        facades.push(mat);
        facadeNight(mat);
      }
    }
  });
  car.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (/Paintwork|glass/i.test(o.material.name)) {
      o.material.roughness = 0.19;
      o.material.metalness = 0.5;
      o.material.envMapIntensity = 1.35;
    }
  });
  // The survey galleries retain their photographic cladding. Narrow glass bands serve as the lit windows.
  const deckMat = new T.MeshStandardMaterial({
    name: 'Deck glazing',
    color: 0x302e31,
    metalness: 0.5,
    roughness: 0.25,
    emissive: 0xffd479,
  });
  const warm = deckMat.clone();
  warm.name = 'Warm windows';
  glass.push(deckMat, warm);
  const tower = district.getObjectByName('tower-lattice');
  const bearing = (-33.72 * Math.PI) / 180;
  const positions = [];
  const transform = (x, y, z) =>
    new T.Vector3(
      x * Math.cos(bearing) - y * Math.sin(bearing),
      z,
      -(x * Math.sin(bearing) + y * Math.cos(bearing)),
    );
  for (const [e, r] of [
    [147, 15.6],
    [264, 6.15],
  ]) {
    const rail = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), e === 147 ? deckMat : warm, 4);
    rail.name = 'Gallery glass';
    const dummy = new T.Object3D();
    for (let j = 0; j < 4; j++) {
      const a = (j * Math.PI) / 2;
      dummy.position.copy(transform(r * Math.cos(a), r * Math.sin(a), e));
      dummy.rotation.y = bearing + a;
      dummy.scale.set(0.34, 1.32, r * 1.55);
      dummy.updateMatrix();
      rail.setMatrixAt(j, dummy.matrix);
      positions.push(dummy.position.clone());
    }
    tower?.add(rail);
  }
  for (const e of [168.39, 268.39])
    for (let i = 0; i < 4; i++)
      positions.push(
        transform(
          Math.cos((i * Math.PI) / 2) * (e < 200 ? 9 : 5),
          Math.sin((i * Math.PI) / 2) * (e < 200 ? 9 : 5),
          e,
        ),
      );
  for (const x of [-39, 39]) for (const y of [-39, 39]) positions.push(transform(x, y, 22.5));
  const texture = glowMap(),
    glows = new T.Group(),
    glow = new T.SpriteMaterial({
      map: texture,
      color: 0xff9a45,
      blending: T.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
  // One geometry draws the complete set of tower glows.
  const p = new T.BufferGeometry();
  p.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      positions.flatMap((v) => v.toArray()),
      3,
    ),
  );
  const flare = new T.Points(
    p,
    new T.PointsMaterial({
      map: texture,
      color: 0xffa150,
      size: 10,
      opacity: 0.6,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      toneMapped: false,
    }),
  );
  glows.add(flare);
  const beacon = new T.Sprite(glow.clone());
  beacon.material.color.set('#FF1E1E');
  beacon.position.set(0, 351.4, 0);
  beacon.scale.setScalar(5);
  glows.add(beacon);
  scene.add(glows);
  const pmrem = new T.PMREMGenerator(renderer),
    cache = new Map(),
    envScene = new T.Scene(),
    envSky = new T.Mesh(sky.geometry, skyMaterial());
  envSky.scale.setScalar(25);
  envScene.add(envSky);
  // Include low-angle urban light sources in the reflection probe as well as the sky.
  const windowPositions = [],
    windowColors = [],
    probeColor = new T.Color();
  for (let i = 0; i < 84; i++) {
    const a = i * 2.39996,
      base = 0.3 + ((i * 73) % 37) / 16,
      level = i % 5,
      rr = 19 + (i % 3);
    for (let row = 0; row < level + 1; row++) {
      windowPositions.push(Math.cos(a) * rr, base + row * 0.32, Math.sin(a) * rr);
      windowColors.push(...probeColor.set([0xffce88, 0x9fe7fa, 0xff8b72, 0xf6d7a8][i % 4]).toArray());
    }
  }
  const probeGeo = new T.BufferGeometry();
  probeGeo.setAttribute('position', new T.Float32BufferAttribute(windowPositions, 3));
  probeGeo.setAttribute('color', new T.Float32BufferAttribute(windowColors, 3));
  const urbanLights = new T.PointsMaterial({ vertexColors: true, size: 0.38, toneMapped: false });
  envScene.add(new T.Points(probeGeo, urbanLights));
  const quadScene = new T.Scene(),
    quadCam = new T.Camera(),
    mixMat = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { oldMap: { value: null }, newMap: { value: null }, fraction: { value: 0 } },
      vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:
        'uniform sampler2D oldMap,newMap;uniform float fraction;varying vec2 v;void main(){gl_FragColor=mix(texture2D(oldMap,v),texture2D(newMap,v),fraction);}',
    });
  quadScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mixMat));
  let blendTarget = null,
    stillTarget = null,
    blendFrom = null,
    blendTo = null,
    envElapsed = 2;
  function mixInto(out, from, to, k) {
    const previous = renderer.getRenderTarget();
    mixMat.uniforms.oldMap.value = from;
    mixMat.uniforms.newMap.value = to;
    mixMat.uniforms.fraction.value = k;
    renderer.setRenderTarget(out);
    renderer.render(quadScene, quadCam);
    renderer.setRenderTarget(previous);
  }
  let name = 'dusk',
    nightness = 0,
    towerEnergy = 0,
    initial = true,
    transition = 0;
  const params = Object.fromEntries(
    Object.entries(periods).map(([k, a]) => [
      k,
      {
        sky: a.slice(0, 4).map(toColor),
        sun: toColor(a[4]),
        power: a[5],
        upper: toColor(a[6]),
        lower: toColor(a[7]),
        hemi: a[8],
        fog: toColor(a[9]),
        density: a[10],
        exposure: a[11],
        elevation: (a[12] * Math.PI) / 180,
        emission: a[13],
        dark: a[14],
      },
    ]),
  );
  const direction = new T.Vector3(),
    desired = new T.Vector3();
  const uniforms = sky.material.uniforms,
    skyKeys = ['top', 'mid', 'edge', 'halo'];
  function sunVector(p, out) {
    return out
      .set(-0.82 * Math.cos(p.elevation), Math.sin(p.elevation), -0.573 * Math.cos(p.elevation))
      .normalize();
  }
  function environment() {
    if (!cache.has(name)) {
      const p = params[name],
        u = envSky.material.uniforms;
      urbanLights.color.setScalar(name === 'night' ? 0.58 : name === 'dusk' ? 0.22 : 0.035);
      skyKeys.forEach((k, i) => u[k].value.copy(p.sky[i]));
      sunVector(p, u.sun.value);
      u.night.value = name === 'night' ? 1 : 0;
      cache.set(name, pmrem.fromScene(envScene, 0, 0.1, 60, { size: 64 }));
    }
    const target = cache.get(name);
    if (!blendTarget) {
      blendTarget = target.clone();
      stillTarget = target.clone();
    }
    if (!scene.environment) {
      scene.environment = target.texture;
      blendTo = target.texture;
      return;
    }
    if (scene.environment === blendTarget.texture) {
      mixInto(stillTarget, scene.environment, scene.environment, 0);
      blendFrom = stillTarget.texture;
    } else blendFrom = scene.environment;
    blendTo = target.texture;
    envElapsed = 0;
  }
  function set(value) {
    if (!params[value]) return;
    name = value;
    transition = 0;
    document
      .querySelectorAll('[data-shiba-time]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shibaTime === name)));
  }
  function update(dt, time, camera, state, ground) {
    const p = params[name],
      a = initial ? 1 : 1 - Math.exp(-dt * 3.8);
    transition += dt;
    if (initial || blendTo !== cache.get(name)?.texture || !cache.has(name)) environment();
    if (envElapsed < 1) {
      envElapsed = Math.min(1, envElapsed + dt / 1.05);
      mixInto(blendTarget, blendFrom, blendTo, envElapsed * envElapsed * (3 - 2 * envElapsed));
      scene.environment = envElapsed === 1 ? blendTo : blendTarget.texture;
    }
    skyKeys.forEach((k, i) => uniforms[k].value.lerp(p.sky[i], a));
    direction.lerp(sunVector(p, desired), a).normalize();
    uniforms.sun.value.copy(direction);
    uniforms.night.value = T.MathUtils.lerp(uniforms.night.value, name === 'night' ? 1 : 0, a);
    light.color.lerp(p.sun, a);
    light.intensity = T.MathUtils.lerp(light.intensity, p.power, a);
    hemi.color.lerp(p.upper, a);
    hemi.groundColor.lerp(p.lower, a);
    hemi.intensity = T.MathUtils.lerp(hemi.intensity, p.hemi, a);
    scene.fog.color.lerp(p.fog, a);
    scene.fog.density = T.MathUtils.lerp(scene.fog.density, p.density, a);
    renderer.toneMappingExposure = T.MathUtils.lerp(renderer.toneMappingExposure, p.exposure, a);
    nightness = T.MathUtils.lerp(nightness, p.dark, a);
    scene.environmentIntensity = T.MathUtils.lerp(1, 0.4, Math.pow(nightness, 3));
    towerEnergy = T.MathUtils.lerp(towerEnergy, p.emission, a);
    orange.forEach((m) => {
      m.emissive.set('#FF6218');
      m.emissiveIntensity = towerEnergy;
    });
    glass.forEach((m) => {
      m.emissive.set('#FFD479');
      m.emissiveIntensity = towerEnergy * 1.65;
    });
    eveningWindows.value = Math.pow(nightness, 4);
    for (const m of facades) m.emissiveIntensity = 0.11 + nightness * 0.08;
    flare.material.opacity = nightness * 0.8;
    beacon.material.opacity =
      (0.16 + 0.84 * (0.5 - 0.5 * Math.cos((time * 2 * Math.PI) / 1.2))) * (0.5 + 0.5 * nightness);
    light.target.position.set(
      state.mode === 'overview' ? 0 : state.x,
      state.mode === 'overview' ? 24 : ground,
      state.mode === 'overview' ? 0 : -state.y,
    );
    light.position.copy(light.target.position).addScaledVector(direction, 235);
    sky.position.copy(camera.position);
    initial = false;
    return nightness;
  }
  set('dusk');
  return {
    set,
    update,
    get period() {
      return name;
    },
    texture,
  };
}
