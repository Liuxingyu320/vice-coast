import * as T from 'three';
export function surveyHeight(g, x, y) {
  const cm = g.gradeCm;
  const fx = T.MathUtils.clamp((x - g.x) / g.step, 0, g.w - 1.001),
    fy = T.MathUtils.clamp((y - g.y) / g.step, 0, g.h - 1.001);
  const i = Math.floor(fx),
    j = Math.floor(fy),
    a = fx - i,
    b = fy - j,
    n = j * g.w + i;
  return (
    ((1 - Math.max(a, b)) * cm[n] +
      Math.max(a - b, 0) * cm[n + 1] +
      Math.max(b - a, 0) * cm[n + g.w] +
      Math.min(a, b) * cm[n + g.w + 1]) /
    100
  );
}
