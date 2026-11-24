const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'),
  map = JSON.parse(fs.readFileSync(path.join(root, 'assets/shiba-layout.json')));
const output = path.resolve(process.argv[2] || path.join(root, '验收/地图压力测试'));
const poses = [
  ['qa-01-intersection-a', '大门路口', 'day', [814, -200.8, 1.0], [842, -193.5, 2.6], 65],
  ['qa-02-intersection-b', '芝公园站', 'day', [66.0, -217.6, 1.0], [54, -192, 1.95], 63],
  ['qa-03-slope-buildings', '东京塔', 'day', [190.09, 32.19, 1.0], [185.51, 29.55, 0.83], 64],
  ['qa-04-street-facades', '大门路口', 'day', [800.2, -202.1, 1.0], [794.0, -207.9, 5.35], 68],
  ['qa-05-landmark-axis', '三解脱门', 'dusk', [456, -151, 1.55], [205, -103, 62], 62],
  ['qa-06-night-overview', 'overview', 'night', null, null, 55],
];
function point([x, y, lift]) {
  const g = map.height,
    u = (x - g.x) / g.step,
    v = (y - g.y) / g.step,
    i = Math.floor(u),
    j = Math.floor(v),
    a = u - i,
    b = v - j,
    n = j * g.w + i,
    cm = g.gradeCm;
  const z =
    ((1 - Math.max(a, b)) * cm[n] +
      Math.max(a - b, 0) * cm[n + 1] +
      Math.max(b - a, 0) * cm[n + g.w] +
      Math.min(a, b) * cm[n + g.w + 1]) /
    100;
  return [x, z + lift, -y];
}
function measureFrames(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const dt = [];
        let firstRender,
          start,
          last,
          peak = 0;
        function frame(now) {
          if (start === undefined) {
            start = now;
            firstRender = window.qaFrames;
          }
          if (last !== undefined) dt.push(now - last);
          peak = Math.max(peak, +document.querySelector('#shibaCanvas').dataset.drawCalls);
          last = now;
          if (now - start < 6000) return requestAnimationFrame(frame);
          const ordered = dt.slice().sort((a, b) => a - b);
          resolve({
            fps: +((dt.length * 1000) / (now - start)).toFixed(2),
            p95ms: +ordered[Math.floor(ordered.length * 0.95)].toFixed(2),
            p99ms: +ordered[Math.floor(ordered.length * 0.99)].toFixed(2),
            frames: dt.length,
            sceneFrames: window.qaFrames - firstRender,
            peakDrawCalls: peak,
            ...window.qaActual,
          });
        }
        requestAnimationFrame(frame);
      }),
  );
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  });
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [],
    pageErrors = [],
    views = [];
  p.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(m.text().slice(0, 1600));
      console.error(errors.at(-1));
    }
  });
  p.on('pageerror', (e) => {
    pageErrors.push(e.message);
    console.error(e.message);
  });
  try {
    // Three's observer is installed only in the Playwright process. The distributed app exposes no test controls.
    await p.addInitScript(() => {
      window.__THREE_DEVTOOLS__ = new EventTarget();
      window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail: r }) => {
        if (!r.isWebGLRenderer || r.domElement.id !== 'shibaCanvas') return;
        const draw = r.render.bind(r);
        r.render = (scene, camera) => {
          if (scene.getObjectByName('tower-lattice') && !r.getRenderTarget()) {
            const pose = window.qaLens;
            if (pose) {
              const oldEye = camera.position.clone();
              camera.position.fromArray(pose.eye);
              camera.lookAt(...pose.target);
              camera.fov = pose.fov;
              camera.updateProjectionMatrix();
              const shift = camera.position.clone().sub(oldEye);
              for (const ob of scene.children) {
                if (ob.isDirectionalLight) {
                  ob.position.add(shift);
                  ob.target.position.add(shift);
                }
                if (ob.isMesh && ob.renderOrder === -10) ob.position.copy(camera.position);
              }
            }
            window.qaFrames = (window.qaFrames || 0) + 1;
            window.qaActual = {
              eye: camera.position.toArray(),
              fov: camera.fov,
              direction: camera.getWorldDirection(camera.position.clone()).toArray(),
            };
            window.qaRenderer = r;
            window.qaScene = scene;
          }
          draw(scene, camera);
        };
      });
    });
    await p.goto(pathToFileURL(path.join(root, 'index.html')).href, { timeout: 120000 });
    await p.locator('#roam').click();
    await p.waitForFunction(() => !!window.qaActual, {}, { timeout: 90000 });
    const streetBases = await p.evaluate((fixtures) => {
      function rows(name) {
        const node = window.qaScene.getObjectByName(name);
        return Array.from({ length: node.count }, (_, i) => {
          const m = node.instanceMatrix.array.subarray(i * 16);
          return [m[12], -m[14], m[13] - 0.5 * Math.hypot(m[4], m[5], m[6]), Math.hypot(m[4], m[5], m[6])];
        });
      }
      const masts = rows('Signal and lamp masts'),
        railPosts = rows('Reflector posts');
      const gantries = rows('Avenue • posts').filter((p) => Math.abs(p[3] - 7.3) < 0.0001);
      let tested = 0,
        maximumError = 0;
      for (const [rendered, survey] of [
        [masts, [...fixtures.signals, ...fixtures.lamps]],
        [railPosts, fixtures.rails.flat()],
        [gantries, fixtures.gantries],
      ]) {
        if (rendered.length !== survey.length) throw Error('Street instance count differs from the layout');
        survey.forEach((p, i) => {
          maximumError = Math.max(
            maximumError,
            Math.hypot(...rendered[i].slice(0, 3).map((v, k) => v - p[k])),
          );
          tested++;
        });
      }
      return { bases: tested, maximumPositionErrorM: +maximumError.toFixed(6) };
    }, map.fixtures);
    assert.ok(
      streetBases.maximumPositionErrorM < 0.0002,
      'Rendered mast or rail post moved off its surveyed base',
    );
    await p.addStyleTag({ content: '#shiba > :not(#shibaCanvas){visibility:hidden!important}' });
    const click = (selector) => p.locator(selector).evaluate((b) => b.click());
    for (const [file, pin, time, eye, target, fov] of poses) {
      await p.evaluate(() => {
        window.qaLens = null;
      });
      if (pin === 'overview') await click('#shibaOverview');
      else {
        await click('#shibaMapBtn');
        await p
          .getByRole('button', { name: pin, exact: true, includeHidden: true })
          .evaluate((b) => b.click());
      }
      await click('[data-shiba-time=' + time + ']');
      const lens = eye ? { eye: point(eye), target: point(target), fov } : null;
      await p.evaluate((lens) => {
        window.qaLens = lens;
      }, lens);
      await p.waitForTimeout(2400);
      const metrics = await measureFrames(p);
      if (lens) assert.ok(metrics.eye.every((n, i) => Math.abs(n - lens.eye[i]) < 1e-4));
      await p.locator('#shibaCanvas').screenshot({ path: path.join(output, file + '.png'), timeout: 60000 });
      views.push({ file: file + '.png', pin, time, eyeAboveDEM: eye?.[2], ...metrics });
      console.log(file, metrics.fps, metrics.p95ms);
    }
    await p.evaluate(() => {
      window.qaLens = null;
    });
    await click('#shibaMapBtn');
    await p
      .getByRole('button', { name: '三解脱门', exact: true, includeHidden: true })
      .evaluate((b) => b.click());
    await p.locator('#shibaCanvas').focus();
    await p.waitForTimeout(800);
    const startEye = await p.evaluate(() => window.qaActual.eye);
    await p.keyboard.down('w');
    const walk = await measureFrames(p);
    await p.keyboard.up('w');
    walk.travelledM = +Math.hypot(walk.eye[0] - startEye[0], walk.eye[2] - startEye[2]).toFixed(2);
    assert.ok(walk.travelledM > 0.75, 'Free walk camera must travel in the rendered world');
    await click('#shibaOverview');
    await p.waitForFunction(() => document.querySelector('#shibaCanvas').dataset.mode === 'overview');
    const gl = await p.evaluate(() => {
      const gl = window.qaRenderer.getContext(),
        ex = gl.getExtension('WEBGL_debug_renderer_info');
      return ex ? gl.getParameter(ex.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    fs.writeFileSync(
      path.join(output, '实测.json'),
      JSON.stringify(
        {
          chrome: browser.version(),
          gpu: gl,
          viewport: [1440, 900],
          dpr: 1,
          streetBases,
          freeWalkAndOverview: true,
          walk,
          sample: 'requestAnimationFrame, real time, 6 seconds per settled camera',
          views,
          consoleErrors: errors,
          pageErrors,
        },
        null,
        2,
      ) + '\n',
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(pageErrors, []);
    assert.ok(
      [...views, walk].every((v) => v.fps >= 59 && v.p95ms <= 20 && Math.abs(v.sceneFrames - v.frames) <= 1),
      '60 Hz frame pacing',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
