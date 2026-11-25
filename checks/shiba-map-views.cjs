const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'),
  map = JSON.parse(fs.readFileSync(path.join(root, 'assets/shiba-layout.json')));
const output = path.resolve(process.argv[2] || path.join(root, '验收/电影级地图'));
const poses = [
  ['qa-01-daimon-cross-day', '大门路口', 'day', [814, -200.8, 1], [842, -193.5, 2.45], 65],
  ['qa-02-daimon-cross-night', '大门路口', 'night', [815.5, -200.1, 1], [766, -185, 5.7], 66],
  ['qa-03-shibakoen-curve-dusk', '芝公园站', 'dusk', [66, -217.6, 1], [54, -192, 2.1], 63],
  ['qa-04-slope-grounding-day', '东京塔', 'day', [190.09, 32.19, 1], [185.51, 29.55, 1.07], 64],
  ['qa-05-shopfront-closeup-dusk', '大门路口', 'dusk', [800.2, -202.1, 1.5], [792.2, -209.6, 3.45], 68],
  ['qa-06-sangedatsumon-axis-dusk', '三解脱门', 'dusk', [456, -151, 1.55], [205, -103, 62], 62],
  ['qa-07-zojoji-mainhall-day', '增上寺大殿', 'day', [313.4, -136.2, 1.35], [257, -128.9, 14.5], 61],
  ['qa-08-tower-foottown-night', '东京塔', 'night', [32, 40, 1.4], [6, 9, 25], 76],
  ['qa-09-metro-station-dusk', '大门路口', 'dusk', [762.85, -182.15, 1.98], [769.7, -182.02, 0.25], 72],
  ['qa-10-underpass-bridge-day', '芝公园站', 'day', [-33.5, -419.2, 1.25], [9.4, -429.9, 3.35], 68],
  ['qa-11-rooftop-oblique-dusk', '大门路口', 'dusk', [583, -119, 64], [552, -73.0, 24.5], 56],
  ['qa-12-full-overview-night', 'overview', 'night', null, null, 55],
];
const sweep = process.env.SHIBA_SWEEP === '1';
const draft = process.env.SHIBA_DRAFT === '1';
// Centres of the occupied cells of a 4 × 3 survey grid, in local east/north metres.
const districts = [
  ['1-1', '芝公园站', -17.88, -458.03],
  ['1-2', '东京塔', -103.28, -241.71],
  ['1-3', '东京塔', -99.31, -34.3],
  ['2-1', '芝公园站', 171.41, -561.42],
  ['2-2', '增上寺大殿', 147.4, -264.8],
  ['2-3', '增上寺大殿', 220.56, 7.39],
  ['3-1', '芝公园站', 352.94, -591.64],
  ['3-2', '三解脱门', 424.64, -265.33],
  ['3-3', '三解脱门', 462.59, -27.74],
  ['4-2', '大门路口', 777.67, -197.26],
  ['4-3', '增上寺大门', 670.38, -59.83],
].map(([cell, pin, x, y]) => ['block-' + cell, pin, 'day', [x + 48, y - 62, 91], [x, y, 1.5], 72]);
districts.push(['gate-daimon', '增上寺大门', 'day', [678, -179.5, 1.55], [640, -172, 3.5], 54]);
const inspections = process.env.SHIBA_REGIONS === '1' ? districts : poses;
const captures = sweep
  ? inspections.flatMap((row) =>
      ['day', 'dusk', 'night'].map((t) => [row[0] + '-' + t, row[1], t, ...row.slice(3)]),
    )
  : inspections;
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
function measureFrames(page, durationMs = 6000) {
  return page.evaluate(
    (durationMs) =>
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
          if (now - start < durationMs) return requestAnimationFrame(frame);
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
    durationMs,
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
          if (scene === window.qaScene && !r.getRenderTarget()) {
            const calls = r.info.render.calls;
            if (calls > (window.qaPeakFrame?.calls || 0))
              window.qaPeakFrame = {
                calls,
                eye: camera.position.toArray(),
                mode: r.domElement.dataset.mode,
                pin: window.qaLocation || 'initial',
                period: document.querySelector('[data-shiba-time][aria-pressed=true]')?.dataset.shibaTime,
              };
          }
        };
      });
    });
    await p.goto(pathToFileURL(path.join(root, 'index.html')).href, { timeout: 120000 });
    await p.locator('#roam').click();
    await p.waitForFunction(() => !!window.qaActual, {}, { timeout: 90000 });
    if (process.env.SHIBA_FIX === '1') {
      await require('./shiba-fix-views.cjs')({
        browser,
        p,
        output,
        point,
        measureFrames,
        draft,
        map,
        errors,
        pageErrors,
      });
      return;
    }
    if (process.env.SHIBA_ORBIT === '1') {
      await p.locator('#shibaOverview').evaluate((b) => b.click());
      await p.locator('#shibaCanvas').focus();
      await p.waitForTimeout(1900);
      const orbit = [];
      for (const period of ['day', 'dusk', 'night']) {
        await p.locator('[data-shiba-time=' + period + ']').evaluate((b) => b.click());
        await p.waitForTimeout(1200);
        await p.keyboard.down('d');
        try {
          orbit.push({ period, ...(await measureFrames(p, 10600)) });
        } finally {
          await p.keyboard.up('d');
        }
      }
      const peak = Number(await p.locator('#shibaCanvas').getAttribute('data-peak-draw-calls'));
      fs.writeFileSync(
        path.join(output, '环视实测.json'),
        JSON.stringify(
          {
            chrome: browser.version(),
            viewport: [1440, 900],
            orbit,
            scenePeak: peak,
            consoleErrors: errors,
            pageErrors,
          },
          null,
          2,
        ) + '\n',
      );
      console.log(
        '360 degree orbit',
        peak,
        orbit.map((q) => [q.fps, q.p95ms]),
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(pageErrors, []);
      assert.ok(
        peak <= 220 &&
          orbit.every((q) => q.p95ms <= 20 && q.fps >= 59 && Math.abs(q.sceneFrames - q.frames) <= 1),
      );
      return;
    }
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
    for (const [file, pin, time, eye, target, fov] of captures) {
      await p.evaluate((file) => {
        window.qaLens = null;
        window.qaLocation = file;
      }, file);
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
      await p.waitForTimeout(draft ? 950 : 2400);
      const metrics =
        draft || sweep
          ? await p.evaluate(() => ({
              ...window.qaActual,
              peakDrawCalls: +document.querySelector('#shibaCanvas').dataset.drawCalls,
            }))
          : await measureFrames(p);
      if (lens) assert.ok(metrics.eye.every((n, i) => Math.abs(n - lens.eye[i]) < 1e-4));
      await p.locator('#shibaCanvas').screenshot({ path: path.join(output, file + '.png'), timeout: 60000 });
      views.push({ file: file + '.png', pin, time, eyeAboveDEM: eye?.[2], ...metrics });
      console.log(
        file,
        metrics.fps === undefined
          ? { drawCalls: metrics.peakDrawCalls }
          : { fps: metrics.fps, p95ms: metrics.p95ms },
      );
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
    await p.evaluate(() => (window.qaLocation = 'grass drive'));
    await click('[data-shiba-time=day]');
    const proof = path.join(output, '复核');
    fs.mkdirSync(proof, { recursive: true });
    const photograph = (name) =>
      p.locator('#shibaCanvas').screenshot({ path: path.join(proof, name + '.png') });
    const grassDrive = await require('./shiba-grass-drive.cjs')(p, click, measureFrames, photograph);
    // Read the actual land-cover atlas at each tyre's measured world position.
    grassDrive.parkCoverage = await p.evaluate(
      async ({ png, grid, wheels }) => {
        const mask = new Image();
        mask.src = 'data:image/png;base64,' + png;
        await mask.decode();
        const ctx = new OffscreenCanvas(mask.width, mask.height).getContext('2d', {
          willReadFrequently: true,
        });
        ctx.drawImage(mask, 0, 0);
        return wheels.map(([x, y]) => {
          const u = Math.floor(((x - grid.x) / grid.width) * mask.width);
          const v = Math.floor((1 - (y - grid.y) / grid.height) * mask.height);
          return ctx.getImageData(u, v, 1, 1).data[1];
        });
      },
      {
        png: fs.readFileSync(path.join(root, 'assets/shiba-land-cover.png')).toString('base64'),
        grid: {
          x: map.height.x,
          y: map.height.y,
          width: (map.height.w - 1) * map.height.step,
          height: (map.height.h - 1) * map.height.step,
        },
        wheels: grassDrive.tyreContacts.onGrass,
      },
    );
    assert.ok(
      grassDrive.parkCoverage.every((value) => value > 210),
      'All four wheels must reach surveyed park cover',
    );
    if (!draft && !sweep)
      assert.ok(
        grassDrive.daimon.pace.fps >= 59 && grassDrive.daimon.pace.p95ms <= 20,
        'Daimon driving frame pacing',
      );
    const { createCollision } = await import('../src/shiba/collision.js');
    const { sidewalkLift } = createCollision(
      map.boundary,
      JSON.parse(fs.readFileSync(path.join(root, 'assets/shiba-solids.json'))),
    );
    grassDrive.maximumTyreGapM = Math.max(
      ...Object.values(grassDrive.tyreContacts)
        .flat()
        .map(([x, y, h]) => Math.abs(point([x, y, 0])[1] + sidewalkLift(x, y) - h)),
    );
    assert.ok(
      grassDrive.maximumTyreGapM < 0.025,
      'Tyre contacts leave the real ground plane: ' + grassDrive.maximumTyreGapM,
    );
    const peakFrame = await p.evaluate(() => window.qaPeakFrame);
    await click('#shibaOverview');
    await p.waitForFunction(() => document.querySelector('#shibaCanvas').dataset.mode === 'overview');
    const gl = await p.evaluate(() => {
      const gl = window.qaRenderer.getContext(),
        ex = gl.getExtension('WEBGL_debug_renderer_info');
      return ex ? gl.getParameter(ex.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    const scenePeak = Number(await p.locator('#shibaCanvas').getAttribute('data-peak-draw-calls'));
    fs.writeFileSync(
      path.join(output, '实测.json'),
      JSON.stringify(
        {
          chrome: browser.version(),
          gpu: gl,
          viewport: [1440, 900],
          dpr: 1,
          streetBases,
          grassDrive,
          scenePeak,
          peakFrame,
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
    assert.ok(scenePeak <= 220, 'Draw calls during navigation: ' + scenePeak);
    assert.ok(
      [...views, walk].every((v) => v.peakDrawCalls <= 220),
      'Draw calls exceed 220',
    );
    if (!draft && !sweep)
      assert.ok(
        [...views, walk].every(
          (v) => v.fps >= 59 && v.p95ms <= 20 && Math.abs(v.sceneFrames - v.frames) <= 1,
        ),
        '60 Hz frame pacing',
      );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
