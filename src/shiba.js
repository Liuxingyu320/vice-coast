import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import compressedDistrict from '../assets/shiba-park.glb';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';
import vehicleBytes from '../assets/solano-gt.glb';
import data from '../assets/shiba-layout.json';
import { createLighting } from './shiba/lighting.js';
import { createTrees, makeStreets } from './shiba/street.js';
import { createHud } from './shiba/hud.js';
import { buildFurniture } from './shiba/furniture.js';
import { traffic } from './shiba/traffic.js';
import { createDriving, batchCar } from './shiba/driving.js';

const byId = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const boundsOf = (ring) => [
  Math.min(...ring.map((p) => p[0])),
  Math.min(...ring.map((p) => p[1])),
  Math.max(...ring.map((p) => p[0])),
  Math.max(...ring.map((p) => p[1])),
];
const bounds = boundsOf(data.boundary);
function inside(x, y, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i],
      [bx, by] = ring[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}
function terrain(x, y) {
  const { height: g } = data;
  const fx = clamp((x - g.x) / g.step, 0, g.w - 1.001),
    fy = clamp((y - g.y) / g.step, 0, g.h - 1.001);
  const i = Math.floor(fx),
    j = Math.floor(fy),
    a = fx - i,
    b = fy - j,
    n = j * g.w + i;
  return (
    ((g.cm[n] * (1 - a) + g.cm[n + 1] * a) * (1 - b) +
      (g.cm[n + g.w] * (1 - a) + g.cm[n + g.w + 1] * a) * b) /
    100
  );
}
const footprints = data.footprints.map((p) => ({ ...p, box: boundsOf(p.rings[0]) }));
const gates = [data.verifiedBuildings['三解脱门'], data.verifiedBuildings['增上寺大门']];
function passable(x, y) {
  if (!inside(x, y, data.boundary)) return false;
  for (const f of footprints) {
    const [a, b, c, d] = f.box;
    if (x < a || x > c || y < b || y > d) continue;
    if (inside(x, y, f.rings[0]) && !f.rings.slice(1).some((h) => inside(x, y, h))) {
      const gate = gates.indexOf(f.id);
      if (gate >= 0 && Math.abs(y - data.pins[gate + 2][2]) < 2.2) continue;
      return false;
    }
  }
  return true;
}
let instance, loading;
async function create() {
  const canvas = byId('shibaCanvas'),
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.55));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.info.autoReset = false;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(55, 1, 0.21, 4400);
  const loader = new GLTFLoader();
  let district, car;
  try {
    [district, car] = await Promise.all(
      [gunzipSync(compressedDistrict), vehicleBytes].map(async (bytes) => {
        const buffer =
          bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
            ? bytes.buffer
            : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        return (await loader.parseAsync(buffer, '')).scene;
      }),
    );
  } catch (e) {
    renderer.dispose();
    throw e;
  }
  batchCar(car);
  scene.add(district, car);
  car.visible = false;
  const lighting = createLighting(renderer, scene, district, car);
  const streets = makeStreets(scene, data, terrain, district);
  createTrees(scene, data.trees);
  const furniture = buildFurniture(scene, streets, terrain, data, lighting.texture);
  const actors = traffic(scene, streets, terrain, data.startWalk);
  const driving = createDriving(car, terrain, passable, footprints, data.boundary, streets);
  const hud = createHud(data);
  let dark = 0.7;
  const skyline = ['surveyed-skyline', 'skyline-photofacades', 'skyline-ground']
    .map((name) => district.getObjectByName(name))
    .filter(Boolean);
  function showSkyline(visible) {
    for (const object of skyline) object.visible = visible;
  }
  const state = {
    mode: 'overview',
    x: data.startWalk[0],
    y: data.startWalk[1],
    heading: 0,
    pitch: 0.24,
    speed: 0,
    range: 960,
    angle: 0.66,
    tilt: 0.54,
    focusX: 170,
    focusY: -140,
  };
  let on = false,
    prev = 0,
    frame = 0,
    closeCallback,
    mapShown = false,
    drag = null,
    uiTime = 0;
  const keys = new Set(),
    stick = new Set(),
    map = byId('shibaMap');
  const nearest = () =>
    data.pins.reduce((a, b) =>
      Math.hypot(b[1] - state.x, b[2] - state.y) < Math.hypot(a[1] - state.x, a[2] - state.y) ? b : a,
    );
  function locationLabel() {
    const pin = nearest(),
      park = state.y < -205 && state.x < 510 && Math.hypot(pin[1] - state.x, pin[2] - state.y) > 65;
    return park ? [5, '芝公园'] : [data.pins.indexOf(pin), pin[0]];
  }
  function info() {
    hud.mode(state);
    if (state.mode !== 'drive' && camera.fov !== 55) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
    byId('shibaPlace').textContent = state.mode === 'overview' ? '芝公园 · 东京塔' : locationLabel()[1];
    byId('shibaReadout').textContent =
      state.mode === 'overview' ? '全域俯瞰' : state.mode === 'walk' ? '步行' : '驾驶';
    hud.full(state);
    if (state.mode !== 'overview') hud.place(locationLabel()[0]);
  }
  function turnToTower() {
    state.heading = Math.atan2(-state.x, -state.y);
    state.pitch = Math.max(
      0.18,
      Math.atan2(351.39 - terrain(state.x, state.y) - 1.69, Math.max(1, Math.hypot(state.x, state.y))) - 0.42,
    );
  }
  function walk() {
    state.mode = 'walk';
    showSkyline(true);
    state.speed = 0;
    car.visible = false;
    turnToTower();
    info();
  }
  const overviewPoints = data.boundary.map(([x, y]) => new T.Vector3(x, terrain(x, y), -y));
  overviewPoints.push(new T.Vector3(0, 351.391, 0));
  const overviewTarget = new T.Vector3(250, 45, 245);
  function frameDistrict() {
    const sin = Math.sin(state.angle),
      cos = Math.cos(state.angle);
    const rise = Math.sin(state.tilt),
      run = Math.cos(state.tilt);
    const right = new T.Vector3(cos, 0, -sin);
    const up = new T.Vector3(-sin * rise, run, -cos * rise);
    const back = new T.Vector3(sin * run, rise, cos * run);
    const tangent = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    state.range = Math.max(
      ...overviewPoints.map((point) => {
        const vector = point.clone().sub(overviewTarget);
        const horizontal = Math.abs(vector.dot(right)) / (tangent * camera.aspect);
        const vertical = Math.abs(vector.dot(up)) / tangent;
        return vector.dot(back) + 1.18 * Math.max(horizontal, vertical);
      }),
    );
  }
  function overview() {
    state.mode = 'overview';
    showSkyline(false);
    state.speed = 0;
    car.visible = false;
    state.tilt = 0.71;
    state.angle = 0.62;
    state.focusX = overviewTarget.x;
    state.focusY = -overviewTarget.z;
    frameDistrict();
    info();
  }
  function setMap(show) {
    mapShown = show;
    hud.open(show, state);
    map.hidden = !show;
    byId('shibaMapBtn').setAttribute('aria-expanded', String(show));
    keys.clear();
    stick.clear();
    if (show) {
      hud.full(state);
      byId('shibaCloseMap').focus();
    } else canvas.focus({ preventScroll: true });
  }
  function drive() {
    if (state.mode === 'drive') {
      walk();
      return;
    }
    const previousHeading = state.heading;
    let spot = streets.nearest(state.x, state.y);
    if (!passable(spot.x, spot.y)) {
      const q = data.vehicleArrivals[data.pins.indexOf(nearest())];
      spot = { x: q[0], y: q[1], heading: Math.atan2(q[2], q[3]) };
    }
    state.x = spot.x;
    state.y = spot.y;
    state.heading = spot.heading;
    if (spot.road?.oneway === 'no' && Math.cos(previousHeading - state.heading) < 0) state.heading += Math.PI;
    driving.reset();
    state.mode = 'drive';
    showSkyline(true);
    state.speed = 0;
    state.pitch = 0.05;
    car.visible = true;
    info();
  }
  function jump(i) {
    const a = data.arrivals[i];
    state.x = a[0];
    state.y = a[1];
    walk();
    if (i > 0) {
      state.heading = Math.atan2(data.pins[i][1] - a[0], data.pins[i][2] - a[1]);
      state.pitch = 0.13;
    }
    setMap(false);
  }
  function motion(dx, dy) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.62));
    for (let k = 0; k < steps; k++) {
      const x = state.x + dx / steps,
        y = state.y + dy / steps;
      if (!passable(x, y)) {
        state.speed = 0;
        return;
      }
      state.x = x;
      state.y = y;
    }
  }
  function tick(now) {
    if (!on) return;
    const dt = prev ? Math.min(0.065, (now - prev) / 1000) : 0;
    prev = now;
    renderer.info.reset();
    const has = (...v) => v.some((s) => keys.has(s) || stick.has(s));
    if (!mapShown) {
      const forward = +has('KeyW', 'ArrowUp') - +has('KeyS', 'ArrowDown'),
        side = +has('KeyD', 'ArrowRight') - +has('KeyA', 'ArrowLeft');
      if (state.mode === 'overview') {
        state.angle += side * dt * 0.62;
        state.range = clamp(state.range - forward * dt * 380, 260, 4000);
      } else {
        if (state.mode === 'drive') {
          driving.steer(state, forward, side, dt);
        } else {
          state.heading += side * dt * 1.45;
          state.speed = forward * (has('ShiftLeft', 'ShiftRight') ? 7.2 : 3.3);
        }
        if (Math.abs(state.speed) > 0.005)
          (state.mode === 'drive' ? driving.move.bind(null, state) : motion)(
            Math.sin(state.heading) * state.speed * dt,
            Math.cos(state.heading) * state.speed * dt,
          );
      }
    }
    const ground = terrain(state.x, state.y);
    if (state.mode === 'overview') {
      const r = state.range * Math.cos(state.tilt);
      camera.position.set(
        state.focusX + Math.sin(state.angle) * r,
        overviewTarget.y + state.range * Math.sin(state.tilt),
        -state.focusY + Math.cos(state.angle) * r,
      );
      camera.lookAt(overviewTarget);
    } else if (state.mode === 'walk') {
      camera.position.set(state.x, ground + 1.69, -state.y);
      camera.lookAt(
        state.x + Math.sin(state.heading) * Math.cos(state.pitch),
        ground + 1.69 + Math.sin(state.pitch),
        -state.y - Math.cos(state.heading) * Math.cos(state.pitch),
      );
    } else {
      driving.cameraMove(camera, state, ground, dt, now / 1000, !!drag, dark);
    }
    dark = lighting.update(dt, now / 1000, camera, state, ground);
    furniture(now / 1000, dark);
    actors.update(dt, now / 1000, dark, state);
    hud.draw(state, now);
    renderer.render(scene, camera);
    canvas.dataset.drawCalls = renderer.info.render.calls;
    canvas.dataset.peakDrawCalls = Math.max(
      Number(canvas.dataset.peakDrawCalls) || 0,
      renderer.info.render.calls,
    );
    canvas.dataset.actors = actors.cars.length + ',' + actors.walkers.length;
    canvas.dataset.fov = camera.fov.toFixed(2);
    canvas.dataset.orbit = driving.orbitAngle.toFixed(3);
    canvas.dataset.mode = state.mode;
    canvas.dataset.period = lighting.period;
    canvas.dataset.pose = [state.x.toFixed(2), state.y.toFixed(2), state.heading.toFixed(3)].join(',');

    if (now - uiTime > 350) {
      uiTime = now;
      byId('shibaReadout').textContent =
        state.mode === 'overview' ? '全域俯瞰' : state.mode === 'walk' ? '步行' : '驾驶';
      if (mapShown) hud.full(state);
      if (state.mode !== 'overview') {
        const [i, label] = locationLabel();
        byId('shibaPlace').textContent = label;
        hud.place(i);
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function resize() {
    if (!on) return;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (state.mode === 'overview') frameDistrict();
  }
  new ResizeObserver(resize).observe(canvas);
  function close() {
    on = false;
    cancelAnimationFrame(frame);
    keys.clear();
    stick.clear();
    map.hidden = true;
    mapShown = false;
    byId('shiba').hidden = true;
    closeCallback();
  }
  byId('shibaBack').onclick = close;
  byId('shibaWalk').onclick = walk;
  byId('shibaOverview').onclick = overview;
  document
    .querySelectorAll('[data-shiba-time]')
    .forEach((b) => (b.onclick = () => lighting.set(b.dataset.shibaTime)));
  byId('shibaDrive').onclick = () => {
    if (state.mode !== 'drive') drive();
  };
  byId('shibaMapBtn').onclick = () => setMap(!mapShown);
  byId('shibaCloseMap').onclick = () => setMap(false);
  data.pins.forEach(([name], i) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => jump(i);
    byId('shibaStops').append(b);
  });
  for (const btn of byId('shibaPads').querySelectorAll('button')) {
    btn.onpointerdown = (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      stick.add(btn.dataset.key);
    };
    btn.onpointerup = btn.onpointercancel = btn.onlostpointercapture = () => stick.delete(btn.dataset.key);
  }
  canvas.onpointerdown = (e) => {
    if (mapShown) return;
    drag = [e.pointerId, e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!drag || drag[0] !== e.pointerId) return;
    const dx = e.clientX - drag[1],
      dy = e.clientY - drag[2];
    drag = [e.pointerId, e.clientX, e.clientY];
    if (state.mode === 'overview') {
      state.angle -= dx * 0.007;
      state.tilt = clamp(state.tilt + dy * 0.006, 0.16, 1.46);
    } else if (state.mode === 'walk') {
      state.heading += dx * 0.0055;
      state.pitch = clamp(state.pitch - dy * 0.005, -1.14, 1.35);
    } else if (state.mode === 'drive') driving.orbit(dx, dy);
  };
  canvas.onpointerup =
    canvas.onpointercancel =
    canvas.onlostpointercapture =
      () => {
        if (drag && state.mode === 'drive') driving.release();
        drag = null;
      };
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (on && state.mode === 'overview') {
        e.preventDefault();
        state.range = clamp(state.range * Math.exp(e.deltaY * 0.001), 250, 4000);
      }
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if (!on) return;
    if (['Tab', 'Enter'].includes(e.code)) return;
    if (
      ![
        'Escape',
        'KeyM',
        'KeyH',
        'KeyV',
        'KeyF',
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'ShiftLeft',
        'ShiftRight',
      ].includes(e.code)
    )
      return;
    e.preventDefault();
    if (e.code === 'Escape') {
      if (!e.repeat) {
        if (mapShown) setMap(false);
        else close();
      }
      return;
    }
    if (e.code === 'KeyH') {
      hud.hint();
      return;
    }
    if (e.code === 'KeyM') {
      if (!e.repeat) setMap(!mapShown);
      return;
    }
    if (mapShown) return;
    if (e.code === 'KeyV') {
      if (!e.repeat) {
        if (state.mode === 'overview') walk();
        else overview();
      }
      return;
    }
    if (e.code === 'KeyF') {
      if (!e.repeat) drive();
      return;
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    stick.clear();
    state.speed = 0;
  });
  return {
    open(back) {
      closeCallback = back;
      on = true;
      byId('shiba').hidden = false;
      prev = 0;
      state.x = data.startWalk[0];
      state.y = data.startWalk[1];
      mapShown = false;
      map.hidden = true;
      byId('shibaMapBtn').setAttribute('aria-expanded', 'false');
      lighting.set('dusk');
      hud.reset();
      walk();
      resize();
      canvas.focus();
      frame = requestAnimationFrame(tick);
    },
  };
}
export async function visitShiba(back) {
  if (!instance) {
    if (!loading)
      loading = create().catch((e) => {
        loading = null;
        throw e;
      });
    instance = await loading;
  }
  instance.open(back);
}
