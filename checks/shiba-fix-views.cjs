const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Local east, north and eye height above the triangulated site. Each panel is a separate game frame.
const groups = [
  [
    'fix-01-foottown-base',
    '东京塔',
    [
      ['正面入口', 'day', [32, 40, 1.8], [14, 21, 6], 70],
      ['初夜入口雨棚', 'night', [31, 35, 2.1], [14, 20, 5.25], 63],
      ['西南承台', 'day', [-66.61, -14.01, 2.7], [-53.57, -10.69, 2.7], 55],
      ['东南承台', 'day', [12.74, -67.51, 2.6], [10.81, -54.19, 2.7], 55],
      ['东北承台', 'day', [68.39, 14.36, 2.5], [55.35, 11.04, 2.8], 55],
      ['西北承台', 'day', [-12.6, 66.77, 2.8], [-10.66, 53.46, 3.0], 55],
    ],
  ],
  [
    'fix-02-gable-and-corners',
    '东京塔',
    [
      ['坡地一楼与转角', 'day', [190.09, 32.19, 1.65], [182, 25.5, 2.7], 65],
      ['芝公园坡顶山墙', 'day', [78, -207, 3.1], [99.8, -225, 4.8], 58],
    ],
  ],
  [
    'fix-03-zojoji-annex-day',
    '增上寺大殿',
    [
      ['大殿与东西配殿', 'day', [317.4, -135.7, 3.45], [253, -128, 12.8], 67],
      ['二十五级石阶与寺门', 'day', [295.7, -134.5, 2.15], [264, -132, 7.2], 55],
      ['西配殿与附房檐口', 'day', [289, -158, 3.1], [272, -166, 6.0], 48],
      ['北侧木构配殿', 'day', [289, -91, 2.6], [258, -85, 6.2], 60],
    ],
  ],
  [
    'fix-04-park-clean-and-kiosks',
    '芝公园站',
    [
      ['弧形步道', 'dusk', [66, -217.6, 1.55], [52, -192, 1.45], 62],
      ['石板庭院', 'day', [309, -121, 3.3], [341, -139, 1.0], 64],
      ['绿地小屋', 'day', [42.7, -211, 1.6], [32.7, -204.5, 1.7], 57],
    ],
  ],
  [
    'fix-05-viaduct-and-riverbank',
    '芝公园站',
    [
      ['南侧高架与古川', 'day', [-33.5, -419.2, 2.35], [9, -433.5, 4.3], 65],
      ['横梁、支座与纵肋', 'day', [-3, -434, 3.2], [10.9, -433.5, 6.1], 56],
      ['临水护岸', 'day', [7, -440, 2.4], [28, -463, 1.5], 63],
      ['桥头护栏与混凝土压顶', 'day', [-33.5, -419.2, 2.35], [-22.2, -439.1, 1.2], 41],
      ['支座接触面', 'day', [6.1, -430.1, 6.15], [10.9, -433.5, 6.99], 46],
    ],
  ],
  [
    'fix-06-metro-and-shopfronts',
    '大门路口',
    [
      ['大门 A6 与店面', 'dusk', [760.3, -183.9, 2.3], [771, -181.6, 1.1], 66],
      ['首层招牌与退线铺装', 'day', [782.5, -198.7, 1.6], [775.8, -205.3, 2.15], 68],
      ['店角退线与盲道', 'day', [808, -204, 1.4], [816, -202, 0.08], 63],
      ['A6 地下通廊', 'dusk', [765.0, -181.51, 1.65], [773, -182.54, -1.0], 64],
      ['A6 地下转角', 'dusk', [773.8, -182.55, -1.23], [777.68, -184.02, -1.25], 69],
      ['芝公园 A3', 'day', null, null, 64],
      ['芝公园 A4', 'day', null, null, 64],
    ],
  ],
  [
    'fix-07-map-edge-road',
    '大门路口',
    [
      ['驾驶实拍', 'day', null, null, 65],
      ['屋顶向北俯瞰', 'dusk', [826, -121, 51], [860, 12, 2], 63],
    ],
  ],
  [
    'fix-08-asphalt-and-markings',
    '大门路口',
    [
      ['大门交叉口', 'day', [815, -203, 5], [841, -192, 0.0], 62],
      ['初夜路面骨料与轮迹', 'night', [799, -196.5, 1.04], [802.0, -197.2, 0.025], 63],
      ['芝公园弯道', 'day', [68, -217, 3.2], [52, -192, 0.4], 59],
      ['高架桥下', 'day', [-27, -414, 3.1], [9, -435, 0.1], 61],
    ],
  ],
  [
    'fix-09-daimon-signals-day',
    '大门路口',
    [
      ['白天的大门路口与地名牌', 'day', [790, -195, 2.5], [809, -190.7, 4.2], 59],
      ['行人信号灯和灯杆底座', 'day', [799.5, -190.3, 2.1], [808, -186.3, 2.65], 42],
      ...['绿', '黄', '红'].map((phase) => [
        phase + '灯相位',
        'day',
        [799.7, -192.8, 3.05],
        [808.5, -190.8, 4.94],
        43,
        phase,
      ]),
    ],
  ],
  [
    'fix-10-trees-and-ao',
    '芝公园站',
    [
      ['芝公园树林', 'day', [19, -222, 2.5], [7, -181, 8], 66],
      ['墙脚、树根与路缘', 'dusk', [43.8, -213.4, 1.15], [32, -201, 1.3], 67],
    ],
  ],
];

async function sheet(browser, shots) {
  if (shots.length === 1) return shots[0].buffer;
  const view = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    // Assemble lossless captures without cropping, resampling the smaller panels by the same factor.
    const n = shots.length,
      columns = n === 2 ? 1 : 2;
    const doubleLead = n > 2 && n % 2 === 0;
    const h = n === 2 ? 1880 : 940 + (doubleLead ? 940 : 0) + Math.floor((n - 1) / 2) * 485;
    await view.setViewportSize({ width: 1440, height: h });
    await view.setContent(
      '<style>*{box-sizing:border-box}body{margin:0;background:#182027;color:#f2f0e9;font:17px -apple-system,sans-serif}main{display:grid;grid-template-columns:repeat(' +
        columns +
        ',1fr)}figure{margin:0}figure:first-child' +
        (doubleLead ? ',figure:nth-child(2)' : '') +
        '{grid-column:1/-1}img{display:block;width:100%}figcaption{height:35px;padding:7px 12px}figure:first-child figcaption{height:40px}</style><main></main>',
    );
    await view.evaluate(
      async (data) => {
        for (const [caption, src] of data) {
          const fig = document.createElement('figure'),
            im = new Image(),
            label = document.createElement('figcaption');
          label.textContent = caption;
          im.src = 'data:image/png;base64,' + src;
          await im.decode();
          fig.append(im, label);
          document.querySelector('main').append(fig);
        }
      },
      shots.map((s) => [s.label, s.buffer.toString('base64')]),
    );
    return await view.locator('main').screenshot();
  } finally {
    await view.close();
  }
}

module.exports = async function captureFixes({
  browser,
  p,
  output,
  point,
  measureFrames,
  draft,
  map,
  errors,
  pageErrors,
}) {
  const click = (sel) => p.locator(sel).evaluate((el) => el.click());
  const selected = (process.env.SHIBA_FIX_GROUPS || '').split(',').filter(Boolean).map(Number);
  const report = {
    chrome: browser.version(),
    viewport: [1440, 900],
    views: [],
    consoleErrors: errors,
    pageErrors,
  };
  const canvas = p.locator('#shibaCanvas');
  await p.addStyleTag({ content: '#shiba > :not(#shibaCanvas){visibility:hidden!important}' });
  const visit = async (pin) => {
    await p.evaluate(() => {
      window.qaLens = null;
    });
    await click('#shibaMapBtn');
    await p.getByRole('button', { name: pin, exact: true, includeHidden: true }).evaluate((b) => b.click());
  };
  for (const [i, [file, pin, poses]] of groups.entries()) {
    if (selected.length && !selected.includes(i + 1)) continue;
    const shots = [];
    await visit(pin);
    for (const [label, period, start, end, fov, phase] of poses) {
      await click('[data-shiba-time=' + period + ']');
      let eye = start,
        target = end;
      if (label.startsWith('芝公园 A')) {
        const s = map.stations.find((st) => label.endsWith(st.exit)),
          [x, y] = s.mouth,
          [nx, ny] = s.down;
        eye = [x - nx * 4.6 + ny * 0.62, y - ny * 4.6 - nx * 0.62, 2.1];
        target = [x + nx * 3.6, y + ny * 3.6, 1.1];
      }
      if (!eye) {
        await p.evaluate(() => {
          window.qaLens = null;
        });
        await visit('三解脱门');
        const drive = await require('./shiba-grass-drive.cjs')(p, click, measureFrames, async (name) => {
          if (name === '大门向北通行') shots.push({ label, buffer: await canvas.screenshot() });
        });
        report.drive = drive.daimon;
        continue;
      }
      const lens = { eye: point(eye), target: point(target), fov };
      await p.evaluate((pose) => {
        window.qaLens = pose;
      }, lens);
      await p.waitForTimeout(draft ? 620 : 1750);
      const m = draft ? await p.evaluate(() => ({ ...window.qaActual })) : await measureFrames(p, 3500);
      assert.ok(
        m.eye.every((v, j) => Math.abs(v - lens.eye[j]) < 1e-4),
        label,
      );
      if (phase) {
        // Wait for the surveyed head to switch in the live traffic cycle without setting its clock.
        await p.waitForFunction(
          ({ phase, position }) => {
            const bulbs = window.qaScene.getObjectByName('Signal bulbs');
            const matrix = bulbs.instanceMatrix.array,
              colors = bulbs.instanceColor.array;
            for (let i = 0; i < bulbs.count; i++) {
              if (Math.hypot(matrix[16 * i + 12] - position[0], matrix[16 * i + 14] - position[2]) > 1.2)
                continue;
              const [r, g] = colors.subarray(3 * i, 3 * i + 2);
              if (
                (phase === '绿' && g > 0.25 && r < 0.1) ||
                (phase === '黄' && r > 0.4 && g > 0.18) ||
                (phase === '红' && r > 0.4 && g < 0.08)
              )
                return true;
            }
            return false;
          },
          { phase, position: lens.target },
          { timeout: 45000, polling: 'raf' },
        );
      }
      shots.push({ label, buffer: await canvas.screenshot({ timeout: 45000 }) });
      report.views.push({ file, label, period, ...m });
    }
    const buffer = await sheet(browser, shots);
    fs.writeFileSync(path.join(output, file + '.png'), buffer);
    console.log(file, shots.length);
  }
  report.gpu = await p.evaluate(() => {
    const gl = window.qaRenderer.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
  fs.writeFileSync(path.join(output, '近景实测.json'), JSON.stringify(report, null, 2) + '\n');
  assert.deepEqual(errors, []);
  assert.deepEqual(pageErrors, []);
  if (!draft) {
    const measured = [...report.views, ...(report.drive ? [report.drive.pace] : [])];
    for (const m of measured)
      assert.ok(
        m.fps >= 59 && m.p95ms <= 20 && Math.abs(m.sceneFrames - m.frames) <= 1 && m.peakDrawCalls <= 220,
        JSON.stringify(m),
      );
  }
};
