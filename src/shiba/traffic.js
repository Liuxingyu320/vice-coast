import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { random } from './street.js';

function streetGraph(roads) {
  const graph = new Map(),
    edges = [];
  const key = (x, y) => Math.round(x * 2) + ',' + Math.round(y * 2);
  for (const r of roads)
    for (const s of r.segments) {
      function edge(x, y, dx, dy) {
        const from = key(x, y),
          to = key(x + dx * s.len, y + dy * s.len);
        if (from === to) return;
        const e = { x, y, dx, dy, len: s.len, from, to, r };
        if (!graph.has(from)) graph.set(from, []);
        graph.get(from).push(e);
        edges.push(e);
      }
      if (r.oneway !== '-1') edge(s.x, s.y, s.dx, s.dy);
      if (r.oneway !== 'yes' && r.oneway !== '1') edge(s.x + s.dx * s.len, s.y + s.dy * s.len, -s.dx, -s.dy);
    }
  return { edges, graph };
}
export function traffic(scene, streets, terrain, start) {
  const rng = random(21191),
    carCount = 30,
    personCount = 50,
    { edges, graph } = streetGraph(streets.roads);
  const dummy = new T.Object3D(),
    color = new T.Color(),
    box = new RoundedBoxGeometry(1, 1, 1, 1, 0.12);
  function batch(name, geo, mat, count) {
    const o = new T.InstancedMesh(geo, mat, count);
    o.name = name;
    o.instanceMatrix.setUsage(T.DynamicDrawUsage);
    o.frustumCulled = false;
    scene.add(o);
    return o;
  }
  function material(c, rough = 0.72, metal = 0) {
    return new T.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
  }
  const bodies = batch('Tokyo taxis, saloons and vans', box, material('white', 0.28, 0.45), carCount),
    windows = batch('Traffic glazing', box, material('#3b5061', 0.2, 0.58), carCount),
    wheels = batch(
      'Traffic tyres',
      new T.CylinderGeometry(0.5, 0.5, 1, 8).rotateZ(Math.PI / 2),
      material('#1c1e20'),
      carCount * 4,
    );
  const headlights = material('#FFF6DF');
  headlights.emissive.set('#FFF6DF');
  const tails = material('#FF2424');
  tails.emissive.set('#FF2424');
  const front = batch('Traffic headlights', box, headlights, carCount * 2),
    back = batch('Traffic tail lights', box, tails, carCount * 2),
    taxiTop = batch('Taxi roof lanterns', box, material('#fff0c0'), Math.ceil(carCount / 3));
  const shirt = batch('Pedestrian coats', box, material('white'), personCount),
    head = batch('Pedestrian heads', new T.SphereGeometry(0.5, 8, 6), material('white'), personCount),
    hair = batch('Pedestrian hair', new T.SphereGeometry(0.5, 8, 5), material('#2b2526'), personCount);
  const arms = batch('Walking arms', box, material('white'), personCount * 2),
    legs = batch('Walking legs', box, material('white'), personCount * 2);
  const broad = edges.filter((e) => e.len > 11 && e.r.width >= 5),
    d = Math.hypot(start[0], start[1]),
    forward = [-start[0] / d, -start[1] / d];
  function initialVehicle(i) {
    if (i >= 8) {
      const e = broad[Math.floor(rng() * broad.length)];
      return { e, t: rng() * e.len };
    }
    const t0 = [24, 46, 71, 95, 32, 61, 88, 120][i],
      side = i >= 4 ? 8 : -1;
    const x = start[0] + forward[0] * t0 + forward[1] * side,
      y = start[1] + forward[1] * t0 - forward[0] * side;
    let candidate = null,
      score = Infinity;
    for (const e of edges) {
      if (e.r.width < 6) continue;
      const t = T.MathUtils.clamp((x - e.x) * e.dx + (y - e.y) * e.dy, 0.01, e.len - 0.01);
      const aligned = (forward[0] * e.dx + forward[1] * e.dy) * (i >= 4 ? -1 : 1),
        cost = Math.hypot(e.x + t * e.dx - x, e.y + t * e.dy - y) + Math.max(0, 1 - aligned) * 8;
      if (cost < score) {
        score = cost;
        candidate = { e, t };
      }
    }
    return candidate;
  }
  const cars = Array.from({ length: carCount }, (_, i) => {
    const { e, t } = initialVehicle(i);
    return {
      e,
      t,
      speed: 3 + rng() * 4,
      cruise: i === 0 ? 2.4 : 5 + rng() * 4,
      van: i % 5 === 2,
      x: e.x + e.dx * t,
      y: e.y + e.dy * t,
      heading: Math.atan2(e.dx, e.dy),
    };
  });
  const areas = [
      [265, -140],
      [170, -350],
      [730, -180],
    ],
    walkers = [];
  for (let i = 0; i < personCount; i++) {
    const area = areas[i % 3],
      candidates = streets.paths.filter(
        (r) =>
          r.length > 11 && Math.min(...r.pts.map((p) => Math.hypot(p[0] - area[0], p[1] - area[1]))) < 155,
      );
    const path = candidates[Math.floor(rng() * candidates.length)] || streets.paths[i];
    walkers.push({
      path,
      t: rng() * path.length,
      dir: rng() > 0.5 ? 1 : -1,
      speed: 0.8 + rng() * 0.6,
      seed: rng() * 12,
      height: 0.92 + rng() * 0.13,
    });
  }
  function matrix(mesh, i, x, y, z, w, h, d, yaw = 0, pitch = 0) {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(pitch, yaw, 0, 'YXZ');
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  function tint(mesh, i, c) {
    mesh.setColorAt(i, color.set(c));
  }
  cars.forEach((c, i) =>
    tint(
      bodies,
      i,
      i % 3 === 0
        ? i % 2
          ? '#e8ba4a'
          : '#242932'
        : c.van
          ? '#aebac5'
          : ['#ece8e2', '#68717c', '#c8c7bd'][i % 3],
    ),
  );
  walkers.forEach((p, i) => {
    const coat = ['#344052', '#c8b9a0', '#82726a', '#b5b6ac', '#654d53', '#54645a', '#536d80'][i % 7];
    tint(shirt, i, coat);
    tint(head, i, ['#c29576', '#d5af92', '#ab806a'][i % 3]);
    for (let j = 0; j < 2; j++) {
      tint(arms, i * 2 + j, coat);
      tint(legs, i * 2 + j, i % 3 ? '#39404b' : '#656565');
    }
  });
  const dynamic = [bodies, windows, wheels, front, back, taxiTop, shirt, head, hair, arms, legs];
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 64;
  glowCanvas.height = 64;
  const gc = glowCanvas.getContext('2d'),
    gradient = gc.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, '#ffffffa8');
  gradient.addColorStop(0.38, '#ffffff44');
  gradient.addColorStop(1, '#ffffff00');
  gc.fillStyle = gradient;
  gc.fillRect(0, 0, 64, 64);
  const beamMap = new T.CanvasTexture(glowCanvas),
    floorQuad = new T.PlaneGeometry().rotateX(-Math.PI / 2);
  const reflections = batch(
    'Traffic lamp reflections',
    floorQuad,
    new T.MeshBasicMaterial({
      map: beamMap,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    carCount * 2,
  );
  dynamic.push(reflections);
  for (let i = 0; i < carCount; i++) {
    tint(reflections, i * 2, '#fff0cf');
    tint(reflections, i * 2 + 1, '#ff352b');
  }
  const signals = streets.sites.filter((s) => s.kind === 'traffic_signals');
  for (const e of edges) {
    const ex = e.x + e.dx * e.len,
      ey = e.y + e.dy * e.len;
    e.signal = signals.some((s) => Math.hypot(s.x - ex, s.y - ey) < 8);
    e.junction = (graph.get(e.to)?.length || 0) > 2;
  }
  function next(c) {
    const e = c.e,
      options = (graph.get(e.to) || []).filter((o) => o.to !== e.from);
    let chosen = options.length ? options[Math.floor(rng() * options.length)] : graph.get(e.to)?.[0];
    if (!chosen) {
      chosen = {
        ...e,
        x: e.x + e.dx * e.len,
        y: e.y + e.dy * e.len,
        dx: -e.dx,
        dy: -e.dy,
        from: e.to,
        to: e.from,
      };
    }
    c.e = chosen;
  }
  let accumulated = 0;
  return {
    cars,
    walkers,
    update(dt, time, night, state, force = false) {
      accumulated += dt;
      if (!force && accumulated < 1 / 32) return;
      dt = Math.min(0.1, accumulated);
      accumulated = 0;
      reflections.material.opacity = night * 0.48;
      headlights.emissiveIntensity = 0.25 + night * 2.6;
      tails.emissiveIntensity = 0.6 + night * 2;
      cars.forEach((c, i) => {
        const edge = c.e,
          remain = edge.len - c.t;
        let target = edge.junction && remain < 12 ? c.cruise * 0.55 : c.cruise;
        if (edge.signal && time % 13 > 7 && remain < 14)
          target = Math.min(target, Math.max(0, (remain - 3) * 0.65));
        const nearActor = (x, y) => {
          const dx = x - c.x,
            dy = y - c.y,
            along = dx * edge.dx + dy * edge.dy;
          return along > 0 && along < 9 && Math.abs(dx * edge.dy - dy * edge.dx) < 1.6
            ? Math.max(0, (along - 3.7) * 0.9)
            : Infinity;
        };
        for (let j = 0; j < cars.length; j++)
          if (i !== j) target = Math.min(target, nearActor(cars[j].x, cars[j].y));
        if (state.mode === 'drive') target = Math.min(target, nearActor(state.x, state.y));
        c.speed = T.MathUtils.damp(c.speed, target, 2.8, dt);
        c.t += c.speed * dt;
        while (c.t >= c.e.len) {
          c.t -= c.e.len;
          next(c);
        }
        const e = c.e,
          offset = (e.r.oneway === 'yes' ? 0.13 : 0.23) * e.r.width;
        c.x = e.x + e.dx * c.t - e.dy * offset;
        c.y = e.y + e.dy * c.t + e.dx * offset;
        const desired = Math.atan2(e.dx, e.dy);
        c.heading +=
          Math.atan2(Math.sin(desired - c.heading), Math.cos(desired - c.heading)) *
          (force ? 1 : 1 - Math.exp(-dt * 6.5));
        const a = c.heading,
          dx = Math.sin(a),
          dy = Math.cos(a),
          z = terrain(c.x, c.y) + 0.11,
          L = c.van ? 4.9 : 4.4;
        function part(mesh, index, side, fore, elev, w, h, d, pitch = 0) {
          matrix(
            mesh,
            index,
            c.x + dy * side + dx * fore,
            z + elev,
            -c.y + dx * side - dy * fore,
            w,
            h,
            d,
            -a,
            pitch,
          );
        }
        part(bodies, i, 0, 0, 0.67, 1.78, 0.76, L);
        part(windows, i, 0, -0.12, c.van ? 1.37 : 1.21, 1.53, c.van ? 0.9 : 0.63, c.van ? 3.55 : 2.33);
        for (let k = 0; k < 4; k++)
          part(wheels, i * 4 + k, k % 2 ? 0.87 : -0.87, k < 2 ? 1.38 : -1.34, 0.38, 0.22, 0.65, 0.65);
        for (let k = 0; k < 2; k++) {
          part(front, i * 2 + k, k ? 0.6 : -0.6, L * 0.5, 0.77, 0.4, 0.14, 0.07);
          part(back, i * 2 + k, k ? 0.66 : -0.66, -L * 0.5, 0.79, 0.32, 0.14, 0.07);
        }
        for (let k = 0; k < 2; k++) {
          const fore = k ? -3.0 : 4.3,
            xx = c.x + dx * fore,
            yy = c.y + dy * fore;
          matrix(
            reflections,
            i * 2 + k,
            xx,
            terrain(xx, yy) + 0.14,
            -yy,
            k ? 1.4 : 2.3,
            1,
            k ? 2.7 : 4.6,
            -a,
          );
        }
        if (i % 3 === 0) part(taxiTop, i / 3, 0, -0.05, c.van ? 1.93 : 1.62, 0.53, 0.17, 0.23);
      });
      walkers.forEach((p, i) => {
        p.t += p.dir * dt * p.speed;
        if (p.t >= p.path.length) {
          p.t = p.path.length - 0.01;
          p.dir = -1;
        }
        if (p.t < 0) {
          p.t = 0.01;
          p.dir = 1;
        }
        const s = p.path.segments.find((q) => q.start + q.len >= p.t) || p.path.segments.at(-1),
          x = s.x + s.dx * (p.t - s.start),
          y = s.y + s.dy * (p.t - s.start),
          a = Math.atan2(s.dx * p.dir, s.dy * p.dir),
          dx = Math.sin(a),
          dy = Math.cos(a),
          z = terrain(x, y),
          stride = Math.sin(time * p.speed * 5 + p.seed),
          h = p.height;
        function part(mesh, j, side, fore, elev, w, H, d, pitch = 0) {
          matrix(
            mesh,
            j,
            x + dy * side + dx * fore,
            z + elev * h,
            -y + dx * side - dy * fore,
            w * h,
            H * h,
            d * h,
            -a,
            pitch,
          );
        }
        part(shirt, i, 0, 0, 1.08, 0.4, 0.62, 0.25);
        part(head, i, 0, 0, 1.56, 0.23, 0.3, 0.23);
        part(hair, i, 0, -0.012, 1.64, 0.245, 0.18, 0.235);
        for (let k = 0; k < 2; k++) {
          const sign = k ? 1 : -1;
          part(
            legs,
            i * 2 + k,
            sign * 0.105,
            sign * stride * 0.12,
            0.42,
            0.14,
            0.78,
            0.16,
            -sign * stride * 0.32,
          );
          part(
            arms,
            i * 2 + k,
            sign * 0.25,
            -sign * stride * 0.09,
            1.07,
            0.115,
            0.55,
            0.13,
            sign * stride * 0.36,
          );
        }
      });
      for (const m of dynamic) m.instanceMatrix.needsUpdate = true;
    },
  };
}
