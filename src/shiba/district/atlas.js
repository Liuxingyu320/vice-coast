import {CanvasTexture,Color,DoubleSide,Mesh,MeshBasicMaterial,PlaneGeometry,SRGBColorSpace} from 'three';

// The radar and regional map share one georeferenced street drawing. The city map has its own camera layer.
export function createAtlas(scene,bounds,canvas){
  const tex=new CanvasTexture(canvas);tex.colorSpace=SRGBColorSpace;tex.anisotropy=4;
  const geometry=new PlaneGeometry(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ);
  geometry.rotateX(-Math.PI/2);
  const plane=new Mesh(geometry,new MeshBasicMaterial({map:tex,side:DoubleSide,toneMapped:false,fog:false}));
  plane.position.set((bounds.minX+bounds.maxX)/2,0,(bounds.minZ+bounds.maxZ)/2);
  plane.layers.set(2);scene.add(plane);
  const backdrop=new Color('#19232b'),original=scene.background;
  let enabled=false;
  return (camera,on)=>{
    if(on===enabled)return;
    enabled=on;camera.layers.set(on?2:0);scene.background=on?backdrop:original;
  };
}
