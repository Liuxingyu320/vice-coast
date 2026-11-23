import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean)
  .map(root => join(root,'Google/Chrome/Application/chrome.exe')),
 ...(process.env.PATH || '').split(delimiter).flatMap(dir => ['chromium','google-chrome','chromium-browser'].map(name => join(dir,name)))];
const browser = candidates.find(name => name && existsSync(name));
if (!browser) throw new Error('Set CHROME_BIN to an installed Chrome or Chromium executable.');
const temp = mkdtempSync(join(tmpdir(),'palm-city-check-'));
try {
 const html = join(temp,'index.html');
 writeFileSync(html,'<!doctype html><canvas width="16" height="16"></canvas><pre id="result">Starting</pre><script src="check.js"></script>');
 await build({entryPoints:[fileURLToPath(new URL('./city-layout.js',import.meta.url))],
  outfile:join(temp,'check.js'), bundle:true, minify:true, loader:{'.glb':'binary'}});
 const dom = execFileSync(browser,['--headless','--disable-dev-shm-usage','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--user-data-dir='+join(temp,'profile'),'--virtual-time-budget=20000',
  '--dump-dom',pathToFileURL(html).href],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
 const message = dom.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
 if (!message?.startsWith('PASS ')) throw new Error(message || 'City check did not produce a result.');
 console.log(message);
} finally {
 rmSync(temp,{recursive:true,force:true,maxRetries:3});
}
