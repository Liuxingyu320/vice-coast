// Planar contacts are cut from the visible mesh at vehicle height. Survey x/y are east/north.
export function inRing(x, y, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[j],
      [c, d] = ring[i];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a) hit = !hit;
  }
  return hit;
}
const inSolid = (x, y, rings) => inRing(x, y, rings[0]) && !rings.slice(1).some((r) => inRing(x, y, r));
function edges(ring, visit) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (visit(ring[j], ring[i])) return true;
  return false;
}
function nearestEdge(rings, x, y) {
  let best = Infinity,
    tangent = [0, 0];
  for (const ring of rings)
    edges(ring, ([a, b], [c, d]) => {
      const u = c - a,
        v = d - b,
        ll = u * u + v * v;
      if (ll < 1e-10) return;
      const t = Math.min(1, Math.max(0, ((x - a) * u + (y - b) * v) / ll));
      const dd = (a + t * u - x) ** 2 + (b + t * v - y) ** 2;
      if (dd < best) {
        best = dd;
        tangent = [u / Math.sqrt(ll), v / Math.sqrt(ll)];
      }
    });
  return tangent;
}
function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function intersects(a, b, c, d) {
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}
function bounds(ring) {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  for (const [x, y] of ring) {
    a = Math.min(a, x);
    b = Math.min(b, y);
    c = Math.max(c, x);
    d = Math.max(d, y);
  }
  return [a, b, c, d];
}
function indexed(polygons) {
  const rows = polygons.map((rings) => ({ rings, box: bounds(rings[0]) })),
    bins = new Map(),
    step = 16;
  const key = (i, j) => i + 65536 * j;
  for (const row of rows) {
    const [a, b, c, d] = row.box;
    for (let i = Math.floor(a / step); i <= Math.floor(c / step); i++)
      for (let j = Math.floor(b / step); j <= Math.floor(d / step); j++) {
        const k = key(i, j);
        if (!bins.has(k)) bins.set(k, []);
        bins.get(k).push(row);
      }
  }
  return (a, b, c, d, callback) => {
    for (let i = Math.floor(a / step); i <= Math.floor(c / step); i++)
      for (let j = Math.floor(b / step); j <= Math.floor(d / step); j++) {
        const rows = bins.get(key(i, j));
        if (!rows) continue;
        for (const row of rows) {
          const [x, y, X, Y] = row.box;
          if (X < a || x > c || Y < b || y > d) continue;
          const hit = callback(row.rings);
          if (hit) return hit;
        }
      }
    return null;
  };
}
export function createCollision(coreBoundary, { solids, wells, walks, travelBoundary }) {
  const boundary = travelBoundary || coreBoundary;
  const world = indexed(solids),
    stairs = indexed(wells),
    raised = indexed(walks);
  // Bucket boundary edges by northing. Several real streets follow the 3,000-edge survey cut.
  const rows = new Map();
  edges(boundary, ([ax, ay], [bx, by]) => {
    for (let k = Math.floor(Math.min(ay, by) / 12); k <= Math.floor(Math.max(ay, by) / 12); k++) {
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push([ax, ay, bx, by]);
    }
  });
  const inBoundary = (x, y) => {
    let inside = false;
    for (const [ax, ay, bx, by] of rows.get(Math.floor(y / 12)) || [])
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    return inside;
  };
  const hitPoint = (x, y) => world(x, y, x, y, (r) => inSolid(x, y, r));
  function passable(x, y) {
    return inBoundary(x, y) && !hitPoint(x, y);
  }
  function contact(x, y, angle) {
    const cs = Math.cos(angle),
      sn = Math.sin(angle);
    // Chamfered corners follow the bumper and include the width between sample points.
    const hull = [
      [-0.72, 2.09],
      [0.72, 2.09],
      [0.91, 1.68],
      [0.91, -1.58],
      [0.73, -2.02],
      [-0.73, -2.02],
      [-0.91, -1.58],
      [-0.91, 1.68],
    ].map(([u, v]) => [x + u * cs + v * sn, y - u * sn + v * cs]);
    for (const [u, v] of hull) if (!inBoundary(u, v)) return nearestEdge([boundary], u, v);
    const inspect = (rings) => {
      for (const [u, v] of hull) if (inSolid(u, v, rings)) return nearestEdge(rings, u, v);
      for (const ring of rings)
        if (edges(ring, (a, b) => inRing(...a, hull) || edges(hull, (c, d) => intersects(a, b, c, d))))
          return nearestEdge(rings, x, y);
      return null;
    };
    const rect = bounds(hull);
    return world(...rect, inspect) || stairs(...rect, inspect);
  }
  return {
    passable,
    contact,
    sidewalkLift: (x, y) => (raised(x, y, x, y, (r) => inSolid(x, y, r)) ? 0.14 : 0),
  };
}
