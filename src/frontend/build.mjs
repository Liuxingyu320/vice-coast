import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const threeLicense = join(dirname(dirname(require.resolve('three'))), 'LICENSE');

await build({
  entryPoints: ['src/game.js'],
  outfile: 'dist/game.js',
  bundle: true,
  minify: true,
  target: 'es2022',
  loader: { '.gz': 'binary', '.wav': 'binary', '.mp3': 'binary' },
});

const shell = await readFile('src/shell.html', 'utf8');
await Promise.all([
  writeFile('dist/index.html', shell),
  copyFile('src/style.css', 'dist/style.css'),
  copyFile('assets/shiba-cover.webp', 'dist/shiba-cover.webp'),
  copyFile('env.json', 'dist/env.json'),
  copyFile(threeLicense, 'dist/three-LICENSE.txt'),
]);
