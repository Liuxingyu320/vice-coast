const labels = [
  ['東京タワー', 'TOKYO TOWER'],
  ['増上寺', 'ZOJO-JI'],
  ['三解脱門', 'SANGEDATSUMON'],
  ['大門', 'DAIMON GATE'],
  ['大門交差点', 'DAIMON'],
  ['芝公園', 'SHIBA PARK'],
];
export function createHud(data) {
  const by = (id) => document.getElementById(id),
    map = by('shibaChart'),
    radar = by('shibaRadar'),
    atlas = document.createElement('canvas'),
    g = atlas.getContext('2d');
  const xs = data.boundary.map((p) => p[0]),
    ys = data.boundary.map((p) => p[1]),
    west = Math.min(...xs) - 15,
    north = Math.max(...ys) + 15,
    width = Math.max(...xs) - west + 15,
    height = north - Math.min(...ys) + 15,
    ratio = 1.35;
  atlas.width = Math.ceil(width * ratio);
  atlas.height = Math.ceil(height * ratio);
  g.scale(ratio, ratio);
  const px = ([x, y]) => [x - west, north - y];
  function path(line) {
    g.beginPath();
    line.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p))));
  }
  path(data.boundary);
  g.closePath();
  g.fillStyle = '#182922';
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = '#1A2130';
  for (const b of data.footprints) {
    path(b.rings[0]);
    g.fill();
  }
  data.roads.forEach(([kind, line], i) => {
    path(line);
    g.lineWidth = kind === 'road' ? Math.max(2.2, data.roadInfo[i][0]) : 1.2;
    g.strokeStyle = kind === 'road' ? '#455168' : '#405243';
    g.stroke();
  });
  g.restore();
  path(data.boundary);
  g.closePath();
  g.lineWidth = 1.6;
  g.strokeStyle = '#738378';
  g.stroke();
  let region = null,
    hintTimer,
    lastRadar = -1000,
    open = false;
  function hint() {
    by('shibaHelp').hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (by('shibaHelp').hidden = true), 3000);
  }
  function place(i) {
    if (region === i) return;
    region = i;
    const title = by('shibaRegion');
    title.querySelector('b').textContent = labels[i][0];
    title.querySelector('small').textContent = labels[i][1];
    title.classList.remove('show-region');
    void title.offsetWidth;
    title.classList.add('show-region');
  }
  function player(c, cx, cy, a) {
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    c.fillStyle = '#fff5dc';
    c.strokeStyle = '#1b2028';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -8);
    c.lineTo(5.5, 6);
    c.lineTo(0, 3);
    c.lineTo(-5.5, 6);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
  function full(s) {
    const c = map.getContext('2d'),
      w = map.width,
      h = map.height,
      sc = Math.min((w - 35) / width, (h - 28) / height),
      ox = (w - width * sc) / 2,
      oy = (h - height * sc) / 2;
    c.fillStyle = '#0E131D';
    c.fillRect(0, 0, w, h);
    c.drawImage(atlas, ox, oy, width * sc, height * sc);
    data.pins.forEach(([name, x, y], i) => {
      const [a, b] = px([x, y]),
        cx = ox + a * sc,
        cy = oy + b * sc;
      c.fillStyle = i === 0 ? '#ff5a36' : '#ffb067';
      c.beginPath();
      c.arc(cx, cy, 4, 0, 7);
      c.fill();
      c.fillStyle = '#f3f5f8';
      c.font = '600 15px sans-serif';
      c.textAlign = i === 4 ? 'right' : 'center';
      c.lineWidth = 3;
      c.strokeStyle = '#121823';
      let ty = cy + ([1, 3, 5].includes(i) ? 18 : -9);
      c.strokeText(name, cx, ty);
      c.fillText(name, cx, ty);
    });
    if (s.mode !== 'overview') player(c, ox + (s.x - west) * sc, oy + (north - s.y) * sc, s.heading);
  }
  function draw(s, now) {
    if (now - lastRadar < 65) return;
    lastRadar = now;
    const c = radar.getContext('2d'),
      w = radar.width,
      h = radar.height;
    const scale = w / (s.mode === 'overview' ? 1200 : 180 + Math.abs(s.speed) * 2.7),
      a = s.mode === 'overview' ? 0 : s.heading;
    c.save();
    c.fillStyle = '#0E131D';
    c.fillRect(0, 0, w, h);
    c.translate(w / 2, h / 2);
    c.rotate(-a);
    c.scale(scale, scale);
    const fx = s.mode === 'overview' ? 235 : s.x,
      fy = s.mode === 'overview' ? -222 : s.y;
    c.drawImage(atlas, west - fx, fy - north, width, height);
    c.restore();
    const dx = -fx,
      dy = fy,
      xx = dx * Math.cos(a) + dy * Math.sin(a),
      yy = -dx * Math.sin(a) + dy * Math.cos(a),
      m = Math.min(
        1,
        (w / 2 - 16) / Math.max(0.1, Math.abs(xx) * scale),
        (h / 2 - 15) / Math.max(0.1, Math.abs(yy) * scale),
      );
    c.fillStyle = '#FF5A36';
    c.beginPath();
    c.arc(w / 2 + xx * scale * m, h / 2 + yy * scale * m, 5, 0, 7);
    c.fill();
    const nx = -Math.sin(a),
      ny = -Math.cos(a),
      dist = Math.min(
        (w / 2 - 14) / Math.max(0.01, Math.abs(nx)),
        (h / 2 - 12) / Math.max(0.01, Math.abs(ny)),
      );
    c.fillStyle = '#f2e6d0';
    c.font = 'bold 16px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', w / 2 + nx * dist, h / 2 + ny * dist);
    if (s.mode !== 'overview') player(c, w / 2, h / 2, 0);
    if (open) full(s);
    const speed = Math.round(Math.abs(s.speed) * 3.6);
    by('shibaSpeed').textContent = String(speed).padStart(2, '0');
    by('shibaGear').textContent =
      s.speed < -0.2 ? 'R' : speed < 2 ? 'N' : String(Math.min(6, 1 + Math.floor(speed / 23)));
  }
  function mode(s) {
    by('shibaGauge').hidden = s.mode !== 'drive';
    for (const b of document.querySelectorAll('[data-shiba-mode]'))
      b.setAttribute('aria-pressed', String(b.dataset.shibaMode === s.mode));
    by('shibaPads').hidden = s.mode === 'overview';
  }
  return {
    hint,
    place,
    mode,
    draw,
    full,
    open(v, s) {
      open = v;
      if (v) full(s);
    },
    reset() {
      region = null;
      lastRadar = -1000;
      hint();
    },
  };
}
