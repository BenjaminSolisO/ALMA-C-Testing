// ─── STATE ───────────────────────────────────────────
const DEFAULTS = { sigma: 1.0, beta: 0.99, lambda: 0.10, rho: 0.75, phi: 1.5 };
let params = { ...DEFAULTS };
let shockType = 'demand'; // 'demand' | 'monetary'
let horizon = 24;

const TWEAK_DEFAULTS = {
  shockSize: 1.7,
  chartThickness: 2
};
let tweaks = { ...TWEAK_DEFAULTS };

// ─── SOLVE MODEL (backward recursion) ────────────────
function solveIRF(p, T, shock) {
  const { sigma, beta, lambda, rho, phi } = p;
  const N = T + 1;

  const y = new Array(N).fill(0);
  const pi = new Array(N).fill(0);
  const r = new Array(N).fill(0);

  const denom = (1 / lambda) + sigma * (1 - rho) * phi;

  const u_demand = (t) => (shock === 'demand' && t === 0) ? 1 : 0;
  const eps_r   = (t) => (shock === 'monetary' && t === 0) ? 1 : 0;

  for (let t = T - 1; t >= 0; t--) {
    const y1  = y[t + 1];
    const pi1 = pi[t + 1];
    const r1  = r[t + 1];

    const rhs = y1 + sigma * pi1 - sigma * rho * r1 + (beta * pi1 / lambda)
              + u_demand(t)
              - sigma * eps_r(t);

    pi[t] = rhs / denom;
    r[t]  = rho * r1 + (1 - rho) * phi * pi[t] + eps_r(t);
    y[t]  = (pi[t] - beta * pi1) / lambda;
  }

  return { y, pi, r, c: [...y] };
}

function solveIRFTweaked(p, T, shock) {
  const { sigma, beta, lambda, rho, phi } = p;
  const N = T + 1;
  const y = new Array(N).fill(0);
  const pi = new Array(N).fill(0);
  const r = new Array(N).fill(0);
  const denom = (1 / lambda) + sigma * (1 - rho) * phi;
  const amp = tweaks.shockSize;
  const u_demand = (t) => (shock === 'demand' && t === 0) ? amp : 0;
  const eps_r = (t) => (shock === 'monetary' && t === 0) ? amp : 0;

  for (let t = T - 1; t >= 0; t--) {
    const y1 = y[t + 1], pi1 = pi[t + 1], r1 = r[t + 1];
    const rhs = y1 + sigma * pi1 - sigma * rho * r1 + (beta * pi1 / lambda)
              + u_demand(t) - sigma * eps_r(t);
    pi[t] = rhs / denom;
    r[t] = rho * r1 + (1 - rho) * phi * pi[t] + eps_r(t);
    y[t] = (pi[t] - beta * pi1) / lambda;
  }
  return { y, pi, r, c: [...y] };
}

// ─── CHART HELPERS ────────────────────────────────────
const CHART_OPTS = (color) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 180 },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1A2E42',
      titleColor: 'rgba(255,255,255,0.5)',
      bodyColor: 'white',
      padding: 10,
      titleFont: { family: 'IBM Plex Mono', size: 10 },
      bodyFont: { family: 'IBM Plex Mono', size: 12 },
      callbacks: {
        label: ctx => `  ${ctx.parsed.y.toFixed(4)}`
      }
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(0,0,0,0.04)', lineWidth: 1 },
      border: { display: false },
      ticks: {
        font: { family: 'IBM Plex Mono', size: 9 },
        color: '#AAA49A',
        maxTicksLimit: 9,
        callback: v => v === 0 ? '0' : `Q${v}`
      }
    },
    y: {
      grid: { color: 'rgba(0,0,0,0.04)', lineWidth: 1 },
      border: { display: false },
      ticks: {
        font: { family: 'IBM Plex Mono', size: 9 },
        color: '#AAA49A',
        maxTicksLimit: 6,
        callback: v => v.toFixed(3)
      }
    }
  }
});

function makeDataset(data, color) {
  return {
    data,
    borderColor: color,
    backgroundColor: color + '14',
    fill: true,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHoverBackgroundColor: color,
    tension: 0.3
  };
}

function makeChart(canvasId, color) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [makeDataset([], color)] },
    options: CHART_OPTS(color)
  });
}

const charts = {
  y:  makeChart('ch-y',  '#2563EB'),
  pi: makeChart('ch-pi', '#C0392B'),
  r:  makeChart('ch-r',  '#16A34A'),
  c:  makeChart('ch-c',  '#B45309')
};

// ─── UPDATE ───────────────────────────────────────────
function fmt(v) {
  const s = v >= 0 ? '+' : '';
  return `peak ${s}${v.toFixed(4)}`;
}

function update() {
  const T = horizon + 5;
  const irf = solveIRFTweaked(params, T, shockType);
  const labels = Array.from({ length: horizon }, (_, i) => i);

  ['y', 'pi', 'r', 'c'].forEach(key => {
    const data = irf[key].slice(0, horizon);
    charts[key].data.labels = labels;
    charts[key].data.datasets[0].data = data;
    charts[key].update();
    const peak = data.reduce((a, v) => Math.abs(v) > Math.abs(a) ? v : a, 0);
    document.getElementById(`peak-${key}`).textContent = fmt(peak);
  });
}

// ─── SLIDER WIRING ────────────────────────────────────
function pct(el) {
  const min = parseFloat(el.min), max = parseFloat(el.max), val = parseFloat(el.value);
  return ((val - min) / (max - min) * 100).toFixed(1) + '%';
}

function wireSlider(id, key, decimals) {
  const el = document.getElementById(`sl-${id}`);
  const valEl = document.getElementById(`val-${id}`);
  const refresh = () => {
    const v = parseFloat(el.value);
    params[key] = v;
    valEl.textContent = v.toFixed(decimals);
    el.style.setProperty('--pct', pct(el));
    update();
  };
  el.addEventListener('input', refresh);
  refresh();
}

wireSlider('sigma',  'sigma',  2);
wireSlider('beta',   'beta',   3);
wireSlider('lambda', 'lambda', 2);
wireSlider('rho',    'rho',    2);
wireSlider('phi',    'phi',    2);

// ─── SHOCK BUTTONS ────────────────────────────────────
document.getElementById('btn-demand').addEventListener('click', () => {
  shockType = 'demand';
  document.getElementById('btn-demand').classList.add('active');
  document.getElementById('btn-monetary').classList.remove('active');
  update();
});
document.getElementById('btn-monetary').addEventListener('click', () => {
  shockType = 'monetary';
  document.getElementById('btn-monetary').classList.add('active');
  document.getElementById('btn-demand').classList.remove('active');
  update();
});

// ─── HORIZON BUTTONS ──────────────────────────────────
document.querySelectorAll('.hz-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.hz-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    horizon = parseInt(btn.dataset.h);
    update();
  });
});

// ─── RESET ────────────────────────────────────────────
document.getElementById('reset-btn').addEventListener('click', () => {
  params = { ...DEFAULTS };
  Object.entries(DEFAULTS).forEach(([k, v]) => {
    const id = k === 'sigma' ? 'sigma' : k === 'beta' ? 'beta' : k === 'lambda' ? 'lambda' : k === 'rho' ? 'rho' : 'phi';
    const el = document.getElementById(`sl-${id}`);
    el.value = v;
    el.style.setProperty('--pct', pct(el));
    const dec = k === 'beta' ? 3 : 2;
    document.getElementById(`val-${id}`).textContent = v.toFixed(dec);
  });
  update();
});

// ─── TWEAKS PANEL ─────────────────────────────────────
let tweakPanel = null;

function buildTweakPanel() {
  if (tweakPanel) return;
  tweakPanel = document.createElement('div');
  tweakPanel.style.cssText = `
    position:fixed; bottom:20px; right:20px; z-index:999;
    background:#0D1B2A; border:1px solid rgba(255,255,255,0.12);
    border-radius:6px; padding:16px 18px; width:220px;
    font-family:'IBM Plex Mono',monospace; display:none;
  `;
  tweakPanel.innerHTML = `
    <div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:14px">Tweaks</div>
    <div style="margin-bottom:12px">
      <div style="font-size:10px;color:rgba(255,255,255,.55);margin-bottom:6px">Shock size: <span id="tw-shockval">${tweaks.shockSize}</span></div>
      <input type="range" id="tw-shock" min="0.1" max="3" step="0.1" value="${tweaks.shockSize}" style="width:100%;height:2px;background:rgba(255,255,255,.2);border-radius:1px;-webkit-appearance:none;outline:none;cursor:pointer">
    </div>
    <div>
      <div style="font-size:10px;color:rgba(255,255,255,.55);margin-bottom:6px">Line weight: <span id="tw-lwval">${tweaks.chartThickness}</span></div>
      <input type="range" id="tw-lw" min="1" max="4" step="0.5" value="${tweaks.chartThickness}" style="width:100%;height:2px;background:rgba(255,255,255,.2);border-radius:1px;-webkit-appearance:none;outline:none;cursor:pointer">
    </div>
  `;
  document.body.appendChild(tweakPanel);

  const style = document.createElement('style');
  style.textContent = `#tw-shock::-webkit-slider-thumb,#tw-lw::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;background:white;border-radius:50%;cursor:pointer}`;
  document.head.appendChild(style);

  document.getElementById('tw-shock').addEventListener('input', e => {
    tweaks.shockSize = parseFloat(e.target.value);
    document.getElementById('tw-shockval').textContent = tweaks.shockSize.toFixed(1);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { shockSize: tweaks.shockSize } }, '*');
    update();
  });

  document.getElementById('tw-lw').addEventListener('input', e => {
    tweaks.chartThickness = parseFloat(e.target.value);
    document.getElementById('tw-lwval').textContent = tweaks.chartThickness.toFixed(1);
    Object.values(charts).forEach(ch => { ch.data.datasets[0].borderWidth = tweaks.chartThickness; ch.update(); });
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { chartThickness: tweaks.chartThickness } }, '*');
  });
}

window.addEventListener('message', e => {
  if (e.data?.type === '__activate_edit_mode') {
    buildTweakPanel();
    tweakPanel.style.display = 'block';
  }
  if (e.data?.type === '__deactivate_edit_mode' && tweakPanel) {
    tweakPanel.style.display = 'none';
  }
});
window.parent.postMessage({ type: '__edit_mode_available' }, '*');
