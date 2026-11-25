// Drive with the same buttons, mouse look and keyboard as a player. Record the actual pose from the canvas.
module.exports = async function verifyGrassDrive(page, click, measureFrames, capture) {
  const assert = require('node:assert/strict');
  const canvas = page.locator('#shibaCanvas'),
    pose = () => canvas.getAttribute('data-pose').then((p) => p.split(',').map(Number));
  async function enterAt(pin, target) {
    await click('#shibaMapBtn');
    await page
      .getByRole('button', { name: pin, exact: true, includeHidden: true })
      .evaluate((b) => b.click());
    await canvas.focus();
    await page.waitForTimeout(150);
    const origin = await pose();
    const angle = Math.atan2(Math.sin(target - origin[2]), Math.cos(target - origin[2]));
    await page.mouse.move(720, 470);
    await page.mouse.down();
    await page.mouse.move(720 + angle / 0.0055, 470, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.press('f');
    await page.waitForFunction(() => document.querySelector('#shibaCanvas').dataset.mode === 'drive');
    return origin;
  }
  const target = 0.44,
    origin = await enterAt('三解脱门', target);
  const contacts = () =>
    page.evaluate(() => {
      const car = window.qaScene.children.find((o) => o.userData.tyres);
      return car.userData.tyres.map((tyre, i) => {
        const p = tyre.clone();
        p.y += car.userData.wheelTravel.value.getComponent(i);
        car.localToWorld(p);
        return [p.x, -p.z, p.y];
      });
    });
  const onRoad = await contacts();
  const start = await pose();
  assert.ok(
    Math.hypot(start[0] - origin[0], start[1] - origin[1]) < 0.06,
    'Entering the car moved the player',
  );
  const route = { x: start[0], y: start[1], dx: Math.sin(target), dy: Math.cos(target) };
  // A short acceleration, then coasting and reversing, keeps the entire manœuvre in the mapped opening.
  await page.keyboard.down('w');
  await page.waitForTimeout(1250);
  await page.keyboard.up('w');
  await page.waitForFunction(
    ({ x, y, dx, dy }) => {
      const [a, b] = document.querySelector('#shibaCanvas').dataset.pose.split(',').map(Number);
      return (a - x) * dx + (b - y) * dy > 34;
    },
    route,
    { timeout: 9000 },
  );
  const lawn = await pose(),
    onGrass = await contacts();
  if (capture) await capture('驶入公园草地');
  await page.keyboard.down('s');
  await page.waitForFunction(
    ({ x, y, dx, dy }) => {
      const [a, b] = document.querySelector('#shibaCanvas').dataset.pose.split(',').map(Number);
      return (a - x) * dx + (b - y) * dy < 0.45;
    },
    route,
    { timeout: 14000 },
  );
  await page.keyboard.up('s');
  const back = await pose();
  assert.ok(Math.hypot(back[0] - origin[0], back[1] - origin[1]) < 0.75);
  await page.keyboard.press('f');
  const daimonStart = await enterAt('大门路口', 0.118);
  const drivePace = measureFrames(page);
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(
      () => Number(document.querySelector('#shibaCanvas').dataset.pose.split(',')[1]) > -83,
      null,
      { timeout: 11000 },
    );
  } finally {
    await page.keyboard.up('w');
  }
  const daimonExit = await pose();
  const pace = await drivePace;
  if (capture) await capture('大门向北通行');
  await page.keyboard.press('f');
  return {
    daimon: {
      pace,
      start: daimonStart,
      exit: daimonExit,
      distanceM: +Math.hypot(daimonExit[0] - daimonStart[0], daimonExit[1] - daimonStart[1]).toFixed(2),
    },
    start,
    lawn,
    back,
    tyreContacts: { onRoad, onGrass },
    outwardM: +Math.hypot(lawn[0] - start[0], lawn[1] - start[1]).toFixed(2),
    returnErrorM: +Math.hypot(back[0] - start[0], back[1] - start[1]).toFixed(2),
  };
};
