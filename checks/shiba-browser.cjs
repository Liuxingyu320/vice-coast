const { chromium, webkit } = require('playwright');
const { pathToFileURL } = require('node:url'),
  fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict');
const os = require('node:os');
const output = path.resolve(process.argv[2] || '验收'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'shiba-views-')),
  reports = [];
const url = pathToFileURL(path.resolve('index.html')).href;
async function check(kind) {
  const mobile = kind !== 'chrome',
    sizes = { chrome: [1280, 800], landscape: [844, 390], portrait: [390, 844] },
    [width, height] = sizes[kind];
  const browser = await (mobile ? webkit : chromium).launch(
    mobile ? {} : { channel: 'chrome', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] },
  );
  const errors = [],
    pageErrors = [],
    report = { kind, width, height, samples: [], errors, pageErrors };
  try {
    const p = await browser.newPage({
      viewport: { width, height },
      hasTouch: mobile,
      isMobile: mobile,
      deviceScaleFactor: 1,
    });
    p.on('console', (m) => {
      if (m.type() === 'error') {
        errors.push(m.text().slice(0, 480));
        console.log('CONSOLE', errors.at(-1));
      }
    });
    p.on('pageerror', (e) => {
      pageErrors.push(e.message);
      console.log('PAGE', e.message);
    });
    await p.goto(url, { timeout: 90000 });
    if (mobile) await p.locator('#roam').tap();
    else await p.locator('#roam').click();
    const canvas = p.locator('#shibaCanvas');
    await p.waitForFunction(
      () => document.querySelector('#shibaCanvas').dataset.mode === 'walk',
      {},
      { timeout: 90000 },
    );
    await p.waitForTimeout(3800);
    const screenshot = async (name) => p.screenshot({ path: path.join(mobile ? temp : output, name + '.png') });
    async function sample(name, duration) {
      const result = await p.evaluate(
        (ms) =>
          new Promise((resolve) => {
            const c = document.querySelector('#shibaCanvas');
            let first = 0,
              prev = 0,
              maxDraw = 0;
            const frames = [];
            function frame(now) {
              if (!first) first = now;
              if (prev) frames.push(now - prev);
              prev = now;
              maxDraw = Math.max(maxDraw, +c.dataset.drawCalls);
              if (now - first < ms) return requestAnimationFrame(frame);
              let ordered = frames.slice().sort((a, b) => a - b);
              resolve({
                fps: +((frames.length * 1000) / (now - first)).toFixed(1),
                medianMs: +ordered[Math.floor(ordered.length / 2)].toFixed(1),
                p95Ms: +ordered[Math.floor(ordered.length * 0.95)].toFixed(1),
                maxDraw,
                frames: frames.length,
                pose: c.dataset.pose,
                fov: c.dataset.fov,
              });
            }
            requestAnimationFrame(frame);
          }),
        duration,
      );
      report.samples.push({ name, ...result });
      console.log(kind, name, JSON.stringify(result));
      assert.ok(result.maxDraw <= 180, name + ' draw budget');
      if (!mobile && duration > 2000) {
        assert.ok(result.fps >= 54, name + ' below target frame rate');
        assert.ok(result.p95Ms <= 25, name + ' uneven frame pacing');
      }
    }
    assert.equal(await canvas.getAttribute('data-actors'), '0,0');
    report.avenue = JSON.parse(await canvas.getAttribute('data-avenue'));
    for (const [label, count] of Object.entries(report.avenue)) assert.ok(count > 0, 'Missing ' + label);
    assert.equal(await canvas.getAttribute('data-period'), 'dusk');
    if (!mobile) {
      await screenshot('01-黄金黄昏步行');
      await sample('dusk-walk', 4200);
    }
    await p.locator('[data-shiba-time=night]').click();
    await p.locator('#shibaDrive').click();
    await p.waitForTimeout(2200);
    if (mobile) {
      const button = await p.locator('#shibaPads [data-key=KeyW]').boundingBox();
      await p.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
      await p.mouse.down();
    } else await p.keyboard.down('w');
    await p.waitForTimeout(1800);
    if (!mobile) await screenshot('02-蓝调初夜驾驶');
    const speed = Number(await p.innerText('#shibaSpeed'));
    assert.ok(speed > 0, 'Vehicle did not accelerate');
    if (mobile) await p.mouse.up();
    else await p.keyboard.up('w');
    if (!mobile) {
      await sample('night-drive', 4200);
      let old = await canvas.getAttribute('data-pose');
      await p.keyboard.down('a');
      await p.waitForTimeout(450);
      await p.keyboard.up('a');
      assert.notEqual(old, await canvas.getAttribute('data-pose'));
      await p.mouse.move(width * 0.48, height * 0.5);
      await p.mouse.down();
      await p.mouse.move(width * 0.48 + 70, height * 0.5 + 7, { steps: 5 });
      await p.mouse.up();
      assert.ok(Math.abs(+(await canvas.getAttribute('data-orbit'))) > 0.04);
      await p.waitForTimeout(3650);
      assert.ok(Math.abs(+(await canvas.getAttribute('data-orbit'))) < 0.06, 'camera recentre');
    } else {
      await sample('night-drive', 1000);
      const boxes = await p.evaluate(() =>
        ['.shiba-console', '#shibaMapBtn', '#shibaGauge', '#shibaPads'].map((s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return [s, r.left, r.top, r.right, r.bottom];
        }),
      );
      for (const [, l, t, r, b] of boxes)
        assert.ok(
          l >= 0 && t >= 0 && r <= innerWidthSafe(width) && b <= height,
          'HUD outside ' + JSON.stringify(boxes),
        );
      function innerWidthSafe(w) {
        return w + 0.5;
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = 0; j < i; j++) {
          const [, a, b, c, d] = boxes[i],
            [, e, f, g, h] = boxes[j];
          assert.ok(c <= e || g <= a || d <= f || h <= b, 'HUD overlap');
        }
      await screenshot('04-移动' + (kind === 'portrait' ? '竖屏' : '横屏'));
    }
    await p.locator('#shibaMapBtn').click();
    assert.equal(await p.locator('#shibaStops button').count(), 6);
    assert.equal(await p.locator('#shibaMap footer a').count(), 4);
    if (!mobile) await screenshot('03-雷达与六地标地图');
    await p.getByRole('button', { name: '大门路口', exact: true }).click();
    await p.waitForFunction(() => document.querySelector('#shibaPlace').textContent === '大门路口');
    await p.locator('[data-shiba-time=day]').click();
    await p.locator('#shibaOverview').click();
    await p.waitForTimeout(700);
    assert.equal(await canvas.getAttribute('data-mode'), 'overview');
    await sample('day-overview', mobile ? 650 : 2600);
    if (!mobile) {
      for (const name of ['东京塔', '增上寺大殿', '三解脱门', '增上寺大门', '大门路口', '芝公园站']) {
        await p.keyboard.press('m');
        await p.getByRole('button', { name, exact: true }).click();
        await p.waitForTimeout(120);
        assert.equal(await canvas.getAttribute('data-mode'), 'walk');
        assert.ok(Number(await canvas.getAttribute('data-draw-calls')) <= 180);
        if (name === '三解脱门' || name === '增上寺大门') {
          await p.screenshot({ path: path.join(temp, name + '.png') });
        }
        await p.locator('#shibaDrive').click();
        await p.waitForFunction(() => document.querySelector('#shibaCanvas').dataset.mode === 'drive');
      }
    }
    report.peakDrawCalls = Number(await canvas.getAttribute('data-peak-draw-calls'));
    assert.ok(report.peakDrawCalls <= 180, 'total draw budget including environment and shadows');
    report.renderer = await canvas.evaluate((c) => {
      const gl = c.getContext('webgl2'),
        ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    await p.locator('#shibaBack').click();
    await p.locator('#menu').waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(pageErrors, []);
    report.ok = true;
  } finally {
    reports.push(report);
    await browser.close();
  }
}
async function combineMobile() {
  const b = await chromium.launch({ channel: 'chrome' });
  try {
    const p = await b.newPage({ viewport: { width: 1298, height: 914 }, deviceScaleFactor: 1 });
    const panel = (name, id) =>
      '<figure><figcaption>' +
      name +
      '</figcaption><img src="data:image/png;base64,' +
      fs.readFileSync(path.join(temp, id + '.png')).toString('base64') +
      '"></figure>';
    await p.setContent(
      '<style>*{box-sizing:border-box}body{margin:0;background:#11151c;color:#f0ece7;font:16px system-ui;display:flex;gap:24px;padding:20px;align-items:center}figure{margin:0}figcaption{font:500 14px monospace;letter-spacing:.05em;color:#e1b690;margin-bottom:10px}img{display:block;max-width:100%}</style>' +
        panel('WebKit · 844 × 390', '04-移动横屏') +
        panel('WebKit · 390 × 844', '04-移动竖屏'),
    );
    await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await p.screenshot({ path: path.join(output, '04-移动端横竖屏.png') });
  } finally {
    await b.close();
  }
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const kind of ['chrome', 'landscape', 'portrait']) await check(kind);
    await combineMobile();
  } finally {
    fs.writeFileSync(path.join(output, '浏览器实测.json'), JSON.stringify(reports, null, 2) + '\n');
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
