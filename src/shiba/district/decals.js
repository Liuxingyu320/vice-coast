import * as T from 'three';
import {canvasMap} from '../primitives.js';

// Keep the labels in the local frame of their host prop as the story moves between locations.
export function labelEquipment(counter,consoleDesk){
  function sticker(host,name,ink,paper,headline,caption,width,x,y,z,tilt,turn){
    const map=canvasMap(512,224,g=>{
      g.fillStyle=paper;g.fillRect(0,0,512,224);
      g.strokeStyle=ink;g.lineWidth=6;g.strokeRect(12,12,488,200);
      g.fillStyle=ink;g.fillRect(25,151,462,4);
      g.font='italic 900 96px system-ui';g.fillText(headline,25,128,457);
      g.font='bold 31px system-ui';g.fillText(caption,31,193,440);
    });
    const mat=new T.MeshStandardMaterial({map,roughness:.89,metalness:0,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const sticker=new T.Mesh(new T.PlaneGeometry(width,width*224/512),mat);
    sticker.name=name;sticker.position.set(x,y,z);sticker.rotation.set(tilt,0,turn,'XYZ');sticker.receiveShadow=true;
    host.add(sticker);return sticker;
  }
  return [
    sticker(counter,'唱片摊标签','#253838','#d4bd8c','B-SIDE','波音唱片   /   SHIBA',.31,.46,.916,.255,-Math.PI/2,-.05),
    sticker(consoleDesk,'电台机身贴','#e9d7a6','#385255','98.4 FM','BAY WAVE   /   TOKYO',.33,.24,1.13,.266,0,.015)
  ];
}
