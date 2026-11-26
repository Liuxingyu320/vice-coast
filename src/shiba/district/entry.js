import {gunzipSync} from 'three/addons/libs/fflate.module.js';
import {failLoading} from './loading.js';
try {
  const params=new URLSearchParams(location.search),original=document.getElementById('original-game');
  if(params.get('mode')==='original'||params.has('replay')||params.has('sample')){
    const encoded=original.textContent,bytes=Uint8Array.fromBase64?Uint8Array.fromBase64(encoded):Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    const data=JSON.parse(new TextDecoder().decode(gunzipSync(bytes)));
    const doc=new DOMParser().parseFromString(data.html,'text/html');
    document.head.replaceChildren(...doc.head.childNodes);document.body.replaceChildren(...doc.body.childNodes);
    const run=document.createElement('script');run.textContent=data.js;document.body.append(run);
  }else{
    original.remove();const {enterDistrict}=await import('./client.js');await enterDistrict();
  }
}catch(error){failLoading();throw error;}
