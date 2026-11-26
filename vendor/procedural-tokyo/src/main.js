// Render the surveyed Shiba district for the Tokyo Bay game.
import * as THREE from 'three';
import {setLoading, finishLoading} from '../../../src/shiba/procedural/loading.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import {createDistrictGame} from '../../../src/shiba/procedural/district-game.js';
import { makeProjection } from './shared/geo.js';
import { createMaterials, shared, variant, setVariant } from './world/materials.js';
import { loadTextures } from './world/textures.js';
import { Streamer } from './world/streamer.js';
import {addDistrictDistance} from './world/district-distance.js';
import { Props } from './world/props.js';
import { Signs } from './world/signs.js';
import { buildRailways } from './world/rails.js';
import { buildFlyovers } from './world/flyovers.js';
import { buildStructures } from './world/structures.js';
import { loadOrtho } from './world/ortho.js';
import { Environment, installSkyLight } from './world/environment.js';
import { Atmosphere } from './world/atmosphere.js';
import { loadBackdrop } from './world/backdrop.js';
import { WaterMirror } from './world/mirror.js';
import { ContactShadows, asGround } from './world/contact.js';
import { LampLight, installLampLight } from './world/lamplight.js';

installLampLight(); // (before any material is compiled)
installSkyLight();

const params = new URLSearchParams(location.search);
const AREA = 'shiba';
// ---------------------------------------------------------------- renderer, scene, camera
setLoading(.03, '准备街区纹理');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false; // the composer renders several passes; count the whole frame
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// The scene is drawn several times per frame (shadows, the water mirror, the lamp light, the picture): where its
// things stand is worked out once, in tick(), and not again at every render.
scene.matrixWorldAutoUpdate = false;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 60000);
const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.3; // (the view keeps close to the hand; how it glides on after a drag is worked out below: glide)
controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
controls.minDistance = 8;
controls.maxDistance = 3500;
// MapControls handles two-finger pinch. The wheel uses the cursor-centred handler below.

const env = new Environment(scene, renderer);
// Time of day, as Tokyo's clock (JST = UTC + 9 h): the real time, or an hour set by hand.
const clockTime = {
  live:false, hour:15.3, play:false, speed:1,
  advance(dt) { if (this.play) { this.live = false; this.hour = (this.hour + dt * this.speed / 60) % 24; } },
  // the moment on today's Tokyo date at which its clock shows `hour`
  date() {
    const JST = 9 * 3600e3, now = Date.now();
    if (this.live) { const t = new Date(now + JST); this.hour = t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600; return new Date(now); }
    const midnight = Math.floor((now + JST) / 864e5) * 864e5 - JST;
    return new Date(midnight + this.hour * 3600e3);
  },
  // the hour and the minute on their own, for the panel; setting either stops the live clock
  get h() { return Math.floor(this.hour) % 24; },
  set h(v) { this.live = false; this.hour = v + this.m / 60; },
  get m() { return Math.floor((this.hour % 1) * 60 + 1e-6); },
  set m(v) { this.live = false; this.hour = this.h + v / 60; },
  label() { const h = this.h, m = this.m; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; },
};

const materials = createMaterials(await loadTextures(renderer));
const props = new Props();
props.root = scene;
const signs = new Signs();
const streamer = new Streamer(scene, materials, props, signs, { base: `tiles/${AREA}`, radius: 420 }); // (what lies round the view by default: the control panel can ask for the whole city)
setLoading(0.08, '读取地形');
const manifest = await streamer.init();
setLoading(0.12, '构建城市远景');
const distant = await addDistrictDistance(streamer,scene,materials);
setLoading(0.16, '铺设道路与铁轨');
const proj = makeProjection(manifest.origin.lon, manifest.origin.lat);
// Beyond the area: plain ground in the grey of the area's own unbuilt land, out to the haze of the horizon.
{
  const b = manifest.bounds, plain = new THREE.Mesh(new THREE.CircleGeometry(50000, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.95, metalness: 0 }));
  plain.position.set((b.minX + b.maxX) / 2, manifest.terrain.min - 1, (b.minZ + b.maxZ) / 2); // just under the lowest ground
  plain.receiveShadow = true;
  plain.name = 'plain';
  scene.add(asGround(plain));
  // an area with the land around it (mountains on the horizon): the plain becomes the sea, at sea level
  if (manifest.backdrop) {
    plain.position.y = -0.5; plain.material.color.set(0x2c4a5e); plain.material.roughness = 0.35;
    loadBackdrop(`tiles/${AREA}`, `ortho/${AREA}/backdrop`, manifest, proj, renderer).then((mesh) => scene.add(asGround(mesh)));
  }
}
const lampLight = new LampLight(renderer);
const waterMirror = new WaterMirror(renderer);
// post-processing: ambient occlusion, sky, aerial perspective, volumetric clouds, bloom, tone mapping
const atmosphere = new Atmosphere(renderer, scene, camera, manifest.origin, manifest.bounds);
const ao = atmosphere.ao;
env.lightFromSky(atmosphere.textures, atmosphere.worldToECEF, atmosphere.environmentSky(), () => atmosphere.ready);
atmosphere.antialias = 'smaa';
atmosphere.fog = .01;
atmosphere.shade = .42;
shared.uGlintOn.value = 2;
const contact = new ContactShadows(renderer);
setVariant({landmarks:true, relief:true});
loadOrtho(`ortho/${AREA}`, proj, manifest.bounds, renderer).then(ok => { shared.uOrthoOn.value = ok ? 1 : 0; });
const railways = await buildRailways(`tiles/${AREA}/${manifest.rails}`, (x, z) => streamer.ground(x, z), streamer.cover);
scene.add(railways);
scene.add(await buildFlyovers(`tiles/${AREA}/${manifest.roads}`, (x, z) => streamer.ground(x, z)));
if (manifest.structures) scene.add(await buildStructures(`tiles/${AREA}/${manifest.structures}`, (x, z) => streamer.ground(x, z)));
setLoading(0.20, '载入街区建筑');
setLoading(.20, '准备人物与任务');
const game = await createDistrictGame({scene,camera,controls,renderer,streamer,manifest,env,clockTime}, params);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  atmosphere.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- loop
let previousFrame=performance.now();
function tick() {
  const now=performance.now(),dt=Math.min((now-previousFrame)/1000,.1);
  previousFrame=now;
  clockTime.advance(dt);
  renderer.info.reset();
  game.update(dt);
  streamer.update(controls.target, camera.position);
  distant.update();
  // the loading screen stays until the tiles around the view are in
  if (game.loading) {
    const size = manifest.tileSize, wanted = manifest.tiles.filter((t) => Math.hypot((t.x + 0.5) * size - controls.target.x, (t.z + 0.5) * size - controls.target.z) <= Math.min(streamer.radius, 900)).length || 1;
    const got = Math.min(1, streamer.stats.loaded / wanted);
    setLoading(0.2 + 0.79 * got, got < 1 ? '载入街区建筑' : '进入东京湾街区');
    if (got >= 1 && !streamer.shown.length) {
      game.loading = false;
      finishLoading();
    }
  }
  // the clock the lit windows go by: it runs at their pace (and is kept small: the shader counts in floats)
  shared.uWindowLife.value.y = (shared.uWindowLife.value.y + dt * 6) % 1e5;
  props.update(dt);
  signs.update();
  env.setSky(...Object.values(atmosphere.setDate(clockTime.date())));
  env.update(dt);
  env.follow(controls.target, camera);
  scene.updateMatrixWorld(); // (once for all of the frame's renders: see matrixWorldAutoUpdate above)
  lampLight.update(controls.target, camera.position, env.night);
  contact.update(scene, controls.target, camera.position, []);
  atmosphere.bloom.intensity = env.bloom * 3;
  if (env.plain !== (atmosphere.curve === 'bruneton')) { env.plain = atmosphere.curve === 'bruneton'; env.apply(); }
  atmosphere.balance.uniforms.get('gain').value.copy(env.balance);
  atmosphere.curveEffect.uniforms.get('exposure').value = renderer.toneMappingExposure;
  waterMirror.enabled = atmosphere.reflect && !variant.abstract; // (the abstract model's water mirrors nothing)
  waterMirror.update(scene, camera, streamer.tiles, controls.target, []);
  atmosphere.lightFog(env.dark, env.warmth * env.daylight, controls.target.y);
  atmosphere.render(dt);

}

function frame() {tick();requestAnimationFrame(frame);}
window.__app = {game,scene,camera,controls,streamer,env,renderer,materials,atmosphere,shared,tick,clockTime,props,railways,distant,variant};
requestAnimationFrame(frame);
