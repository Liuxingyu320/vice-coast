import * as T from 'three';
export function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function canvasMap(width, height, paint, color = true) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  paint(c.getContext('2d'), width, height);
  const t = new T.CanvasTexture(c);
  if (color) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function instances(scene, name, geometry, material, rows, shadow = false) {
  if (!rows.length) return null;
  const mesh = new T.InstancedMesh(geometry, material, rows.length),
    o = new T.Object3D(),
    color = new T.Color();
  rows.forEach(([x, y, z, w, h, d, yaw = 0, tint, pitch = 0, roll = 0], i) => {
    o.position.set(x, y, z);
    o.scale.set(w, h, d);
    o.rotation.set(pitch, yaw, roll, 'YXZ');
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (tint !== undefined) mesh.setColorAt(i, color.set(tint));
  });
  mesh.name = name;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}
