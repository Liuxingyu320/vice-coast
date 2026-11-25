// Bake the live static street meshes and shared texture charts into the editable Blender scene.
const { chromium } = require('playwright');
const { build } = require('esbuild');
const fs = require('node:fs/promises'),
  path = require('node:path');
(async () => {
  const cache = process.argv[2],
    root = path.resolve(__dirname, '../..');
  if (!cache) throw Error('Pass the survey cache directory.');
  const bundle = await build({
    entryPoints: [path.join(__dirname, 'street_reference.js')],
    loader: { '.jpg': 'dataurl' },
    bundle: true,
    format: 'iife',
    globalName: 'Facade',
    write: false,
  });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const { meshes, images } = await page.evaluate(() => Facade.streetReference());
    await fs.writeFile(path.join(cache, 'street-reference.json'), JSON.stringify(meshes));
    for (const [i, image] of images.entries())
      await fs.writeFile(
        path.join(cache, 'street-chart-' + i + (image.startsWith('data:image/png') ? '.png' : '.jpg')),
        Buffer.from(image.split(',')[1], 'base64'),
      );
    const lettering = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const g = canvas.getContext('2d');
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#382e28';
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#c0a36c';
      g.save();
      g.scale(1, 2.3);
      g.font = 'bold 69px serif';
      g.fillText('山縁三', 128, 58);
      g.restore();
      g.fillStyle = '#a48f70';
      g.fillRect(256, 0, 256, 256);
      g.fillStyle = '#413328';
      g.save();
      g.translate(384, 0);
      g.scale(4, 1);
      g.font = 'bold 34px serif';
      [...'大本山増上寺'].forEach((c, i) => g.fillText(c, 0, 22 + 42 * i));
      g.restore();
      return canvas.toDataURL().split(',')[1];
    });
    await fs.writeFile(path.join(cache, 'gate-lettering.png'), Buffer.from(lettering, 'base64'));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
