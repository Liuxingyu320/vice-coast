const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const output = path.resolve(process.argv[2] || '验收/街景近景');
const entry = pathToFileURL(path.resolve(process.argv[3] || 'index.html')).href;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const b = await chromium.launch({
    channel: 'chrome',
    args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [],
    views = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  async function look(dx, dy) {
    await p.mouse.move(650, 425);
    await p.mouse.down();
    await p.mouse.move(650 + dx, 425 + dy);
    await p.mouse.up();
  }
  async function capture(name) {
    await p.clock.runFor(4000);
    const d = await p.locator('#shibaCanvas').evaluate((c) => ({ ...c.dataset }));
    assert.ok(+d.peakDrawCalls <= 180);
    await p.screenshot({ path: path.join(output, name + '.png'), type: 'png' });
    views.push({ name, pose: d.pose, fov: d.fov, drawCalls: +d.drawCalls, peak: +d.peakDrawCalls });
  }
  try {
    await p.goto(entry);
    await p.locator('#roam').click();
    await p.waitForFunction(() => document.querySelector('#shibaCanvas').dataset.mode === 'walk');
    await p.clock.install({ time: new Date('2026-11-24T08:00:00Z') });
    await p.clock.pauseAt(new Date('2026-11-24T08:00:01Z'));
    await look(27, 48);
    await capture('芝公园步行');
    await p.locator('#shibaMapBtn').evaluate((b) => b.click());
    await p.getByRole('button', { name: '大门路口', exact: true }).evaluate((b) => b.click());
    await look(-216, 18);
    await capture('大门路口');
    // A fresh street entry gives the same district spawn and camera spring state on both revisions.
    await p.locator('#shibaBack').evaluate((b) => b.click());
    await p.locator('#roam').evaluate((b) => b.click());
    await p.clock.runFor(250);
    await p.locator('[data-shiba-time=night]').evaluate((b) => b.click());
    await p.locator('#shibaDrive').evaluate((b) => b.click());
    await p.clock.runFor(2500);
    await p.keyboard.down('w');
    await p.clock.runFor(1000);
    await p.keyboard.up('w');
    await capture('初夜驾驶');
    assert.deepEqual(errors, []);
    const previous = path.join(output, '修复前', '机位.json');
    if (fs.existsSync(previous)) {
      const base = JSON.parse(fs.readFileSync(previous, 'utf8'));
      const positions = (rows) => rows.map(({ name, pose, fov }) => ({ name, pose, fov }));
      assert.deepEqual(positions(views), positions(base.views), 'Camera position, heading or FOV drifted');
    }
    fs.writeFileSync(
      path.join(output, '机位.json'),
      JSON.stringify({ viewport: [1440, 900], views, errors }, null, 2) + '\n',
    );
    console.log(JSON.stringify(views));
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
