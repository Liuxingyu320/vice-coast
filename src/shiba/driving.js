import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasMap } from './primitives.js';

export function batchCar(car) {
  const parts = new Map();
  const names = ['LF', 'RF', 'LR', 'RR'],
    tyres = Array(4),
    travel = { value: new T.Vector4() };
  function suspension(mat) {
    const before = mat.onBeforeCompile;
    mat.onBeforeCompile = function (sh, r) {
      before.call(this, sh, r);
      sh.uniforms.shibaWheelTravel = travel;
      sh.vertexShader =
        'attribute float wheelId;uniform vec4 shibaWheelTravel;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nif(wheelId>=0.)transformed.y+=shibaWheelTravel[int(wheelId)];',
        );
    };
    mat.customProgramCacheKey = () => 'shiba-four-contact-patches';
  }
  car.updateMatrixWorld(true);
  car.traverse((o) => {
    if (!o.isMesh) return;
    const a = parts.get(o.material) || [];
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    let joint = o;
    while (joint && !joint.userData.rigSlot) joint = joint.parent;
    const id = names.indexOf(joint?.userData.rigSlot?.replace('wheel_', ''));
    g.setAttribute(
      'wheelId',
      new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(id), 1),
    );
    if (id >= 0 && o.material.name === 'Coal rubber') {
      g.computeBoundingBox();
      const point = g.boundingBox.getCenter(new T.Vector3());
      point.y = g.boundingBox.min.y;
      tyres[id] = point;
    }
    a.push(g);
    parts.set(o.material, a);
  });
  car.clear();
  if (tyres.filter(Boolean).length !== 4) throw Error('Four measured tyre contact patches required');
  car.userData.tyres = tyres;
  car.userData.wheelTravel = travel;
  const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
  suspension(depth);
  for (const [m, geometries] of parts) {
    const g = mergeGeometries(geometries);
    suspension(m);
    const mesh = new T.Mesh(g, m);
    mesh.customDepthMaterial = depth;
    car.add(mesh);
    for (const q of geometries) q.dispose();
  }
}
export function createDriving(car, terrain, contact) {
  const rotation = { yawRate: 0, bank: 0, pitch: 0, orbit: 0, lift: 0, release: -100 },
    look = new T.Vector3(),
    eye = new T.Vector3(),
    eyeVelocity = new T.Vector3(),
    lookVelocity = new T.Vector3(),
    desired = new T.Vector3(),
    desiredLook = new T.Vector3(),
    direction = new T.Vector3();
  let fresh = true,
    brake = false;
  const brakes = [],
    head = [];
  car.traverse((o) => {
    if (o.isMesh) {
      if (o.material.name === 'Brake lens') brakes.push(o.material);
      if (o.material.name === 'Headlamp') head.push(o.material);
    }
  });
  const pool = canvasMap(128, 256, (g, w, h) => {
    const grd = g.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.49);
    grd.addColorStop(0, '#fff5d8d8');
    grd.addColorStop(0.45, '#fff1c977');
    grd.addColorStop(1, '#fff1c900');
    g.scale(1, 2);
    g.fillStyle = grd;
    g.translate(0, -h * 0.23);
    g.fillRect(0, 0, w, h);
  });
  const beams = new T.InstancedMesh(
    new T.PlaneGeometry().rotateX(-Math.PI / 2),
    new T.MeshBasicMaterial({
      map: pool,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    2,
  );
  beams.name = 'Dipped headlight pools';
  car.add(beams);
  const dummy = new T.Object3D();
  const spot = new T.SpotLight(0xffeed4, 0, 32, 0.46, 0.78, 1.65);
  spot.position.set(0, 0.68, -1.88);
  spot.target.position.set(0, 0.05, -17);
  car.add(spot, spot.target);
  function reset() {
    fresh = true;
    Object.assign(rotation, { yawRate: 0, bank: 0, pitch: 0, orbit: 0, lift: 0, release: -100 });
    eyeVelocity.set(0, 0, 0);
    lookVelocity.set(0, 0, 0);
  }
  function steer(s, throttle, turn, dt) {
    const old = s.speed;
    brake = throttle < 0;
    const drag = 0.45 + s.speed * s.speed * 0.0017;
    if (throttle) {
      const stopping = Math.sign(throttle) !== Math.sign(s.speed) && Math.abs(s.speed) > 0.2;
      s.speed = T.MathUtils.clamp(
        s.speed + throttle * (stopping ? 13 : throttle > 0 ? 7.6 : 4) * dt,
        -6.8,
        32,
      );
    } else {
      s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - drag * dt);
    }
    const rate =
      ((turn * 1.45) / (1 + Math.abs(s.speed) * 0.035)) *
      T.MathUtils.smoothstep(Math.abs(s.speed), 0, 4) *
      Math.sign(s.speed);
    rotation.yawRate = T.MathUtils.damp(rotation.yawRate, rate, 5.25, dt);
    s.heading += rotation.yawRate * dt;
    rotation.bank = T.MathUtils.damp(
      rotation.bank,
      -rotation.yawRate * Math.min(0.1, Math.abs(s.speed) * 0.007),
      5,
      dt,
    );
    rotation.pitch = T.MathUtils.damp(
      rotation.pitch,
      T.MathUtils.clamp(((s.speed - old) / Math.max(0.001, dt)) * 0.009, -0.065, 0.06),
      4.7,
      dt,
    );
  }
  const move = roadMotion(contact);
  function spring(current, velocity, target, frequency, dt) {
    const steps = Math.max(1, Math.ceil(dt / 0.012));
    for (let i = 0; i < steps; i++) {
      const t = dt / steps;
      direction
        .copy(target)
        .sub(current)
        .multiplyScalar(frequency * frequency);
      direction.addScaledVector(velocity, -2 * frequency);
      velocity.addScaledVector(direction, t);
      current.addScaledVector(velocity, t);
    }
  }
  const wheelWorld = Array.from({ length: 4 }, () => new T.Vector3()),
    tyreHeight = new Float64Array(4);
  function alignCar(s) {
    const { tyres, wheelTravel } = car.userData,
      si = Math.sin(s.heading),
      co = Math.cos(s.heading);
    for (let i = 0; i < 4; i++) {
      const p = tyres[i];
      tyreHeight[i] = terrain(s.x + p.x * co - p.z * si, s.y - p.x * si - p.z * co);
    }
    const pitch = Math.atan2(
      (tyreHeight[0] + tyreHeight[1] - tyreHeight[2] - tyreHeight[3]) * 0.5,
      tyres[2].z - tyres[0].z,
    );
    const roll = Math.atan2(
      (tyreHeight[1] + tyreHeight[3] - tyreHeight[0] - tyreHeight[2]) * 0.5,
      tyres[1].x - tyres[0].x,
    );
    car.rotation.set(pitch + rotation.pitch * 0.4, -s.heading, roll + rotation.bank * 0.38, 'YXZ');
    car.position.set(s.x, 0, -s.y);
    car.updateMatrix();
    let height = 0;
    for (let i = 0; i < 4; i++) {
      wheelWorld[i].copy(tyres[i]).applyMatrix4(car.matrix);
      height += tyreHeight[i] - wheelWorld[i].y;
    }
    car.position.y = height / 4;
    car.updateMatrix();
    for (let i = 0; i < 4; i++) {
      const p = wheelWorld[i],
        actual = terrain(p.x, -p.z);
      wheelTravel.value.setComponent(i, (actual - car.position.y - p.y) / car.matrix.elements[5]);
    }
  }
  function cameraMove(camera, s, ground, dt, now, dragging, night) {
    const dx = Math.sin(s.heading),
      dy = Math.cos(s.heading);
    alignCar(s);
    brakes.forEach((m) => {
      m.emissive.set('#FF2424');
      m.emissiveIntensity = brake || s.speed < -0.1 ? 3.1 : 0.3 + night * 0.6;
    });
    head.forEach((m) => {
      m.emissive.set('#FFF6DF');
      m.emissiveIntensity = 0.15 + night * 3;
    });
    beams.material.opacity = night * 0.62;
    spot.intensity = night * 21;
    for (let i = 0; i < 2; i++) {
      const side = (i - 0.5) * 1.35;
      dummy.position.set(
        side,
        terrain(s.x + dx * 6 + dy * side, s.y + dy * 6 - dx * side) - ground + 0.032,
        -6.2,
      );
      dummy.scale.set(2.9, 1, 8);
      dummy.rotation.set(-car.rotation.x, 0, 0);
      dummy.updateMatrix();
      beams.setMatrixAt(i, dummy.matrix);
    }
    beams.instanceMatrix.needsUpdate = true;
    if (!dragging && now - rotation.release > 2.2) {
      rotation.orbit = T.MathUtils.damp(rotation.orbit, 0, 2.9, dt);
      rotation.lift = T.MathUtils.damp(rotation.lift, 0, 2.9, dt);
    }
    const a = s.heading + rotation.orbit,
      range = 7.7 + Math.abs(s.speed) * 0.032,
      cx = s.x - Math.sin(a) * range,
      cy = s.y - Math.cos(a) * range;
    desired.set(cx, Math.max(ground + 2.75 + rotation.lift, terrain(cx, cy) + 1.15), -cy);
    desiredLook.set(
      s.x + Math.sin(a) * 5.5,
      ground + 2.85 + Math.max(0, -rotation.lift) * 0.35,
      -s.y - Math.cos(a) * 5.5,
    );
    if (fresh) {
      eye.copy(desired);
      look.copy(desiredLook);
      fresh = false;
    } else {
      spring(eye, eyeVelocity, desired, 9.8, dt);
      spring(look, lookVelocity, desiredLook, 12, dt);
    }
    camera.position.copy(eye);
    camera.lookAt(look);
    const f = T.MathUtils.damp(
      camera.fov,
      54 + 12 * T.MathUtils.smoothstep(Math.abs(s.speed), 0, 30),
      3.5,
      dt,
    );
    if (Math.abs(f - camera.fov) > 0.002) {
      camera.fov = f;
      camera.updateProjectionMatrix();
    }
  }
  return {
    reset,
    steer,
    move,
    cameraMove,
    orbit(dx, dy) {
      rotation.orbit -= dx * 0.007;
      rotation.lift = T.MathUtils.clamp(rotation.lift + dy * 0.024, -1.4, 4);
    },
    release() {
      rotation.release = performance.now() / 1000;
    },
    get orbitAngle() {
      return rotation.orbit;
    },
  };
}

export function roadMotion(contact) {
  function move(s, dx, dy) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.42));
    for (let i = 0; i < steps; i++) {
      const vx = dx / steps,
        vy = dy / steps,
        x = s.x + vx,
        y = s.y + vy;
      const tangent = contact(x, y, s.heading);
      if (!tangent) {
        s.x = x;
        s.y = y;
        continue;
      }
      const [tx, ty] = tangent,
        dot = vx * tx + vy * ty,
        slide = 0.87 * dot;
      if (Math.abs(slide) > 0.001 && !contact(s.x + tx * slide, s.y + ty * slide, s.heading)) {
        s.x += tx * slide;
        s.y += ty * slide;
        s.speed *= 0.94;
        const heading = Math.atan2(Math.sign(dot * s.speed || 1) * tx, Math.sign(dot * s.speed || 1) * ty);
        s.heading += Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading)) * 0.22;
      } else {
        s.speed *= 0.69;
        break;
      }
    }
  }
  return move;
}
