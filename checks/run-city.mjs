import {execFile} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {delimiter, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {build} from 'esbuild';

const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean)
  .map(root => join(root,'Google/Chrome/Application/chrome.exe')),
 ...(process.env.PATH || '').split(delimiter).flatMap(dir => ['chromium','google-chrome','chromium-browser'].map(name => join(dir,name)))];
const browser = candidates.find(name => name && existsSync(name));
if (!browser) throw new Error('Set CHROME_BIN to an installed Chrome or Chromium executable.');
const temp = mkdtempSync(join(tmpdir(),'palm-city-check-'));
let server;
try {
 const {outputFiles} = await build({entryPoints:[fileURLToPath(new URL('./city-layout.js',import.meta.url))],
  bundle:true, minify:true, write:false, loader:{'.glb':'binary','.gz':'binary','.wav':'binary','.mp3':'binary'}});
 const html = `<!doctype html><canvas width="16" height="16"></canvas><pre id="result">Starting</pre>
 <script>
 const result = document.getElementById('result');
 new MutationObserver(() => fetch('/done', {method:'POST'})).observe(result, {childList:true});
 window.addEventListener('error', event => { if (event.message) result.textContent = 'FAIL ' + event.message; });
 </script><script src="check.js"></script><img src="/running" alt="">`;
 // Keep the page's load pending until the checks complete on Chrome's audio threads.
 let pending, done = false;
 server = createServer((request,response) => {
  switch (request.url) {
   case '/': response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);break;
   case '/check.js': response.writeHead(200,{'Content-Type':'text/javascript'}).end(outputFiles[0].contents);break;
   case '/running': if (done) response.writeHead(204).end();else pending = response;break;
   case '/done': done = true;pending?.writeHead(204).end();response.writeHead(204).end();break;
   default: response.writeHead(404).end();
  }
 });
 await new Promise((resolve,reject) => server.listen(0,'127.0.0.1',resolve).once('error',reject));
 const url = 'http://127.0.0.1:' + server.address().port;
 const {stdout} = await promisify(execFile)(browser,['--headless','--disable-dev-shm-usage','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--user-data-dir='+join(temp,'profile'),'--dump-dom',url],
 {encoding:'utf8',timeout:60000,windowsHide:true});
 const message = stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
 if (!message?.startsWith('PASS ')) throw new Error(message || 'City check did not produce a result.');
 console.log(message);
} finally {
 server?.closeAllConnections();
 server?.close();
 rmSync(temp,{recursive:true,force:true,maxRetries:3});
}
