import {readArchives} from './archive.js';

let files;
export function openFiles(){
  const packs=Array.from(document.querySelectorAll('[data-game-pack]'),node=>{
    const encoded=node.textContent;node.remove();return encoded;
  });
  files=readArchives(packs);
}
export const readFile=name=>files.read(name);
export const readJSON=name=>JSON.parse(new TextDecoder().decode(readFile(name+'.json')));
