import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { advanceVehicleBodies, vehicleMass } from '../vehicle-physics.js';
import { canvasMap } from './primitives.js';

export function batchCar(car) {
  const parts = new Map();
  car.updateMatrixWorld(true);
  car.traverse((o) => {
    if (!o.isMesh) return;
    const a = parts.get(o.material) || [];
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    a.push(g);
    parts.set(o.material, a);
  });
  car.clear();
  for (const [m, geometries] of parts) {
    const g = mergeGeometries(geometries);
    car.add(new T.Mesh(g, m));
    for (const q of geometries) q.dispose();
  }
}
export function createDriving(car, terrain, passable, footprints, boundary, streets, actors) {
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
    smoothSteer = 0;
    boost = 1;
    emptyBoost = false;
    motionA = 0;
    Object.assign(rotation, { yawRate: 0, bank: 0, pitch: 0, orbit: 0, lift: 0, release: -100 });
    eyeVelocity.set(0, 0, 0);
    lookVelocity.set(0, 0, 0);
  }
  let smoothSteer = 0,
    boost = 1,
    emptyBoost = false,
    motionA = 0;
  function steer(s, throttle, turn, keys, dt) {
    const old = s.speed;
    brake = throttle < 0 || keys.has('Space');
    const forward = throttle > 0,
      reverse = throttle < 0;
    const nitro = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const boosting = nitro && forward && boost > 0.015 && !emptyBoost;
    if (!nitro || boost > 0.32) emptyBoost = false;
    boost = T.MathUtils.clamp(boost + (boosting ? -0.3 : 0.105) * dt, 0, 1);
    if (boost < 0.015) emptyBoost = true;
    smoothSteer += (turn - smoothSteer) * (1 - Math.exp(-dt * 7));
    const speedYaw = Math.min(Math.abs(s.speed) * 0.26, 1.42),
      parkYaw = 0.9 * (1 - Math.min(1, Math.abs(s.speed) / 2.5));
    s.heading +=
      smoothSteer * (Math.sign(s.speed) || 1) * Math.max(speedYaw, parkYaw) * dt;
    const fx = Math.sin(s.heading),
      fy = Math.cos(s.heading),
      rx = Math.cos(s.heading),
      ry = -Math.sin(s.heading);
    let vx = Math.sin(motionA || s.heading) * s.speed,
      vy = Math.cos(motionA || s.heading) * s.speed;
    let long = vx * fx + vy * fy,
      lat = vx * rx + vy * ry,
      oldLong = long;
    if (forward) long += (long < -1 ? 23 : boosting ? 20.5 : 12.8) * dt;
    if (reverse) long -= (long > 1 ? 25 : 7) * dt;
    long -= (0.16 * long + 0.004 * long * Math.abs(long)) * dt;
    const coast = (!forward && !reverse ? 2.1 : 0.23) * dt;
    long -= Math.sign(long) * Math.min(Math.abs(long), coast);
    long = T.MathUtils.clamp(long, -8, boosting ? 48 : Math.max(34, oldLong - dt * 6));
    let grip = keys.has('Space') ? 2 : 8;
    if (Math.abs(long) < 0.35) grip = Math.max(grip, 14);
    lat *= Math.exp(-grip * dt);
    vx = long * fx + lat * rx;
    vy = long * fy + lat * ry;
    const mag = Math.hypot(vx, vy);
    s.speed = long < 0 ? -mag : mag;
    if (mag > 1e-4) motionA = Math.atan2(vx / s.speed, vy / s.speed);
    rotation.yawRate = T.MathUtils.damp(rotation.yawRate, smoothSteer * Math.sign(s.speed || 1), 8, dt);
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
  const slide = roadMotion(passable, footprints, boundary, streets);
  function move(s, dx, dy, dt) {
    const player = {
      x: s.x,
      z: -s.y,
      a: -s.heading,
      hw: 1.05,
      hl: 2.35,
      vx: dx / Math.max(dt, 1e-4),
      vz: -dy / Math.max(dt, 1e-4),
      yaw: 0,
      ...vehicleMass({ hw: 1.05, hl: 2.35 }),
    };
    const others = (actors?.cars || []).map((c) => ({
      x: c.x,
      z: -c.y,
      a: -c.heading,
      hw: c.van ? 1.15 : 1.0,
      hl: c.van ? 2.7 : 2.2,
      vx: Math.sin(c.heading) * c.speed,
      vz: -Math.cos(c.heading) * c.speed,
      yaw: 0,
      ...vehicleMass({ hw: c.van ? 1.15 : 1.0, hl: c.van ? 2.7 : 2.2 }),
    }));
    const bodies = [player, ...others];
    advanceVehicleBodies(bodies, dt, {
      worldSweep() {
        return null;
      },
      vehicleSweep(a, b, sx, sz) {
        const reach = a.hl + a.hw + b.hl + b.hw;
        if (Math.abs(a.x - b.x) > reach + Math.abs(sx) || Math.abs(a.z - b.z) > reach + Math.abs(sz))
          return null;
        const nx = a.x - b.x,
          nz = a.z - b.z,
          dist = Math.hypot(nx, nz) || 1;
        const overlap = a.hl + b.hl - dist;
        if (overlap < 0) return null;
        return { fraction: 0, nx: nx / dist, nz: nz / dist, overlap };
      },
      record() {},
      onContact() {
        s.speed *= 0.72;
      },
    });
    s.x = player.x;
    s.y = -player.z;
    slide(s, dx, dy);
  }
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
  function cameraMove(camera, s, ground, dt, now, dragging, night) {
    const dx = Math.sin(s.heading),
      dy = Math.cos(s.heading),
      gFront = terrain(s.x + dx, s.y + dy),
      gBack = terrain(s.x - dx, s.y - dy);
    car.position.set(s.x, ground + 0.13, -s.y);
    car.rotation.set(rotation.pitch + Math.atan2(gFront - gBack, 2), -s.heading, rotation.bank, 'YXZ');
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

export function roadMotion(passable, footprints, boundary, streets) {
  function boundaryTangent(x, y) {
    let best = Infinity,
      tangent = [0, 0];
    const visit = (ring) => {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j],
          [bx, by] = ring[i],
          dx = bx - ax,
          dy = by - ay,
          L = dx * dx + dy * dy;
        if (!L) continue;
        const t = T.MathUtils.clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1),
          distance = (ax + dx * t - x) ** 2 + (ay + dy * t - y) ** 2;
        if (distance < best) {
          best = distance;
          tangent = [dx / Math.sqrt(L), dy / Math.sqrt(L)];
        }
      }
    };
    visit(boundary);
    for (const f of footprints) {
      if (x < f.box[0] - 3 || x > f.box[2] + 3 || y < f.box[1] - 3 || y > f.box[3] + 3) continue;
      f.rings.forEach(visit);
    }
    return tangent;
  }
  const probes = [
    [0, 0],
    [-0.85, 1.8],
    [0.85, 1.8],
    [-0.85, -1.7],
    [0.85, -1.7],
    [0, 2.14],
    [0, -2.05],
  ];
  function contact(x, y, heading) {
    const sn = Math.sin(heading),
      cs = Math.cos(heading);
    for (const [side, fore] of probes) {
      const px = x + cs * side + sn * fore,
        py = y - sn * side + cs * fore;
      if (!passable(px, py)) return boundaryTangent(px, py);
    }
    const r = streets.nearest(x, y);
    if (r.distance > r.width * 0.5 + 0.45) return [Math.sin(r.heading), Math.cos(r.heading)];
    return null;
  }
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
