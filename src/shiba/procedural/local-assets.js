import { readArchives } from './archive.js';

let cityArchive;
export function readShibaFile(file) { return cityArchive.read('tiles/shiba/'+file); }

export function readStudioFile(key) { return cityArchive.read('studio/'+key+'.glb'); }

const mime = { json:'application/json', bin:'application/octet-stream', jpg:'image/jpeg', png:'image/png' };

// The upstream app and its workers normally read a static HTTP directory. Supply
// that same directory from the embedded local archives, including under file://.
export function installAssets(packs, workerSource, loadingManager) {
  const archive = readArchives(packs), root = new URL('.', location.href).href;
  cityArchive = archive;
  const urls = new Map();
  function nameFor(request) {
    const url = new URL(request instanceof Request ? request.url : request, location.href);
    if (!url.href.startsWith(root)) return null;
    const name = decodeURIComponent(url.href.slice(root.length).split(/[?#]/)[0]);
    return /^(tiles|textures|ortho|assets)\//.test(name) ? name : null;
  }
  function contentType(path) { return mime[path.split('.').at(-1)] || 'application/octet-stream'; }
  function fileURL(path) {
    const name = nameFor(path);
    if (!name) return path;
    if (!urls.has(name)) urls.set(name, URL.createObjectURL(new Blob([archive.read(name)], {type:contentType(name)})));
    return urls.get(name);
  }
  const fetchNative = window.fetch.bind(window);
  window.fetch = (request, options) => {
    const name = nameFor(request);
    if (!name) return fetchNative(request, options);
    if (!archive.has(name)) return Promise.resolve(new Response(null, {status:404}));
    return Promise.resolve(new Response(archive.read(name), {headers:{'Content-Type':contentType(name)}}));
  };
  loadingManager.setURLModifier(fileURL);

  // A file-origin worker cannot fetch file-origin mesh URLs. Give it the requested
  // bytes as transferables and leave the original tile decoder and mesher untouched.
  const workerTransport = 'const fetchExternal=self.fetch.bind(self);self.fetch=(input,options)=>input instanceof ArrayBuffer?Promise.resolve(new Response(input)):fetchExternal(input,options);\n';
  const workerURL = URL.createObjectURL(new Blob([workerTransport,workerSource], {type:'text/javascript'}));
  const WorkerNative = window.Worker;
  window.Worker = class extends WorkerNative {
    constructor(url, options) {
      const tile = new URL(url, location.href).pathname.endsWith('/tileWorker.js');
      // Chrome rejects module Workers with an opaque file origin. The bundled
      // original worker is self-contained and executes as a classic script.
      super(tile ? workerURL : url, tile ? {...options,type:'classic'} : options);
    }
    postMessage(message, ...rest) {
      if (message.type !== 'tile') return super.postMessage(message, ...rest);
      const out = {...message}, transfers = [];
      for (const field of ['url','meshUrl']) {
        if (!out[field]) continue;
        const bytes = archive.read(nameFor(out[field]));
        out[field] = bytes.slice().buffer;
        transfers.push(out[field]);
      }
      super.postMessage(out, transfers);
    }
  };
  return archive;
}
