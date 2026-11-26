const cover = document.getElementById('loader');
const stage = cover.querySelector('.step');
const number = cover.querySelector('.load-value b');
const bar = cover.querySelector('[role="progressbar"]');
const fill = bar.querySelector('.fill');
let percent = -1;

export function setLoading(fraction, message) {
  const next = Math.max(percent, Math.round(100 * Math.min(1, Math.max(0, fraction))));
  if (next !== percent) {
    percent = next;
    number.textContent = String(next);
    bar.setAttribute('aria-valuenow', String(next));
    fill.style.transform = 'scaleX(' + next / 100 + ')';
  }
  if (stage.textContent !== message) stage.textContent = message;
}

export function finishLoading() {
  setLoading(1, '街区已就绪');
  cover.setAttribute('aria-busy', 'false');
  cover.setAttribute('aria-hidden', 'true');
  cover.classList.add('done');
}

export function failLoading() {
  stage.textContent = '地图加载中断';
  cover.setAttribute('aria-busy', 'false');
  cover.querySelector('.load-retry').hidden = false;
}
