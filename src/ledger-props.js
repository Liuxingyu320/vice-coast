import * as T from 'three';

export function prop(group,size,mat,x,y,z){const mesh=new T.Mesh(new T.BoxGeometry(...size),new T.MeshStandardMaterial({color:mat,roughness:.64}));mesh.position.set(x,y,z);group.add(mesh);return mesh}
export function equipment(scene){
 const bag=new T.Group();scene.add(bag);prop(bag,[.77,.46,.26],0x314c51,0,.25,0);
 for(const x of [-.30,.30])prop(bag,[.052,.48,.27],0xc1ac83,x,.25,0);
 for(const x of [-.12,.12])prop(bag,[.035,.10,.045],0xc1ac83,x,.52,0);
 prop(bag,[.26,.035,.045],0x392e39,0,.58,0);prop(bag,[.23,.085,.018],0xffcd85,.08,.28,-.14);
 const mic=new T.Group();mic.position.set(43,.53,-123.6);scene.add(mic);
 prop(mic,[.44,.06,.39],0x373541,0,.04,0);prop(mic,[.045,1.32,.045],0xa7b4b6,0,.71,0);prop(mic,[.085,.085,.31],0x292b35,0,1.43,-.07);
 const sleeve=new T.Group();scene.add(sleeve);sleeve.position.set(134.7,1.45,50.45);sleeve.rotation.x=-.46;prop(sleeve,[.72,.72,.045],0x244c52,0,0,0);
 const ring=new T.Mesh(new T.TorusGeometry(.205,.016,8,40),new T.MeshBasicMaterial({color:0xf9b387}));ring.position.set(.033,.06,.029);sleeve.add(ring);
 for(let i=0;i<4;i++)prop(sleeve,[.46-i*.065,.014,.019],0xf0c6a0,0,-.20-i*.028,.026);
 const board=new T.Group();board.position.set(56.5,.24,-110);scene.add(board);
 prop(board,[.91,.09,.63],0x47605f,0,1.03,0);for(const side of [-.35,.35])prop(board,[.06,.96,.08],0x42434a,side,.53,0);
 for(let i=0;i<5;i++){prop(board,[.08,.033,.34],0x292837,-.26+i*.113,1.09,0);prop(board,[.092,.045,.058],i===4?0xf0a569:0xa8c6bb,-.26+i*.113,1.124,.09*Math.sin(i))}
 return {bag,mic,sleeve,board};
}
