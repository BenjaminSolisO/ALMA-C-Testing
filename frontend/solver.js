// ─── STATE ───────────────────────────────────────────
const DEFAULTS = {
  sigma: 1.0, beta: 0.99, lambda: 0.10, rho: 0.75, phi: 1.5,
  shockAmp: 1.0, rhoShock: 0.85
};
let params = { ...DEFAULTS };
let shockType = 'demand';
let horizon = 24;

const TWEAK_DEFAULTS = { chartThickness: 2 };
let tweaks = { ...TWEAK_DEFAULTS };

// ─── SOLVE: Blanchard-Kahn via full-path LU decomposition ────────────────────
//
// Model (Galí 2008):
//   IS:  y_t  = y_{t+1} - σ(r_t - π_{t+1}) + u_t
//   PC:  π_t  = β π_{t+1} + λ y_t
//   MP:  r_t  = ρ r_{t-1} + (1-ρ)φ π_t + ε_t   ← backward Taylor (Galí 2008)
//   GM:  c_t  = y_t
//
// Shocks: AR(1) — shock_t = ρ_ε^t · ε₀
// Boundary: y_T = π_T = 0 (terminal),  r_{-1} = 0 (initial)
//
// Cast as linear system A·x = b of size 3(T+1) × 3(T+1).
// Variables: x = [y₀,π₀,r₀, y₁,π₁,r₁, ..., y_T,π_T,r_T]
// Solved via math.lusolve (LU decomposition, Blanchard-Kahn equivalent).

function computeT(h, rhoShock) {
  const decay = Math.max(20, Math.ceil(Math.log(0.001) / Math.log(rhoShock + 1e-10)));
  return h + Math.min(decay, 500); // cap at h+500 for browser performance
}

function solveIRFBK(p, h, shock) {
  const { sigma, beta, lambda, rho, phi, shockAmp, rhoShock } = p;
  const T = computeT(h, rhoShock);
  const N = T + 1;
  const n = 3 * N;

  // AR(1) shock paths
  const u   = Array.from({length: N}, (_, t) => shock === 'demand'   ? Math.pow(rhoShock, t) * shockAmp : 0);
  const eps = Array.from({length: N}, (_, t) => shock === 'monetary' ? Math.pow(rhoShock, t) * shockAmp : 0);

  // Variable index: y_t → 3t, π_t → 3t+1, r_t → 3t+2
  const idx = (t, k) => 3 * t + k;

  const A = Array.from({length: n}, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  let eq = 0;

  // IS at t=0,...,T-1:  y_t - y_{t+1} + σ r_t - σ π_{t+1} = u[t]
  for (let t = 0; t < T; t++, eq++) {
    A[eq][idx(t,   0)] =  1;
    A[eq][idx(t+1, 0)] = -1;
    A[eq][idx(t,   2)] =  sigma;
    A[eq][idx(t+1, 1)] = -sigma;
    b[eq] = u[t];
  }

  // PC at t=0,...,T-1:  -λ y_t + π_t - β π_{t+1} = 0
  for (let t = 0; t < T; t++, eq++) {
    A[eq][idx(t,   0)] = -lambda;
    A[eq][idx(t,   1)] =  1;
    A[eq][idx(t+1, 1)] = -beta;
    b[eq] = 0;
  }

  // MP at t=0:  r₀ - (1-ρ)φ π₀ = ε[0]   [r_{-1} = 0]
  A[eq][idx(0, 2)] =  1;
  A[eq][idx(0, 1)] = -(1 - rho) * phi;
  b[eq] = eps[0];
  eq++;

  // MP at t=1,...,T:  r_t - ρ r_{t-1} - (1-ρ)φ π_t = ε[t]
  for (let t = 1; t <= T; t++, eq++) {
    A[eq][idx(t,   2)] =  1;
    A[eq][idx(t-1, 2)] = -rho;
    A[eq][idx(t,   1)] = -(1 - rho) * phi;
    b[eq] = eps[t];
  }

  // Terminal: y_T = 0
  A[eq][idx(T, 0)] = 1;  b[eq] = 0;  eq++;

  // Terminal: π_T = 0
  A[eq][idx(T, 1)] = 1;  b[eq] = 0;  eq++;

  // Solve via LU decomposition
  const x = math.lusolve(A, b);

  const y  = Array.from({length: N}, (_, t) => x[idx(t, 0)][0]);
  const pi = Array.from({length: N}, (_, t) => x[idx(t, 1)][0]);
  const r  = Array.from({length: N}, (_, t) => x[idx(t, 2)][0]);

  return { y, pi, r, c: [...y] };
}

// ─── CHART HELPERS ────────────────────────────────────
const CHART_OPTS = () => ({
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
      callbacks: { label: ctx => `  ${ctx.parsed.y.toFixed(4)}` }
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
    options: CHART_OPTS()
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
  const irf = solveIRFBK(params, horizon, shockType);
  const labels = Array.from({length: horizon}, (_, i) => i);

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

wireSlider('sigma',    'sigma',    2);
wireSlider('beta',     'beta',     3);
wireSlider('lambda',   'lambda',   2);
wireSlider('rho',      'rho',      2);
wireSlider('phi',      'phi',      2);
wireSlider('shockamp', 'shockAmp', 2);
wireSlider('rhoshock', 'rhoShock', 2);

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
const SLIDER_CONFIG = {
  sigma:    { id: 'sigma',    dec: 2 },
  beta:     { id: 'beta',     dec: 3 },
  lambda:   { id: 'lambda',   dec: 2 },
  rho:      { id: 'rho',      dec: 2 },
  phi:      { id: 'phi',      dec: 2 },
  shockAmp: { id: 'shockamp', dec: 2 },
  rhoShock: { id: 'rhoshock', dec: 2 },
};

document.getElementById('reset-btn').addEventListener('click', () => {
  params = { ...DEFAULTS };
  Object.entries(SLIDER_CONFIG).forEach(([key, { id, dec }]) => {
    const el = document.getElementById(`sl-${id}`);
    el.value = DEFAULTS[key];
    el.style.setProperty('--pct', pct(el));
    document.getElementById(`val-${id}`).textContent = DEFAULTS[key].toFixed(dec);
  });
  update();
});

// ─── TWEAKS PANEL (line weight only) ──────────────────
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
    <div>
      <div style="font-size:10px;color:rgba(255,255,255,.55);margin-bottom:6px">Line weight: <span id="tw-lwval">${tweaks.chartThickness}</span></div>
      <input type="range" id="tw-lw" min="1" max="4" step="0.5" value="${tweaks.chartThickness}" style="width:100%;height:2px;background:rgba(255,255,255,.2);border-radius:1px;-webkit-appearance:none;outline:none;cursor:pointer">
    </div>
  `;
  document.body.appendChild(tweakPanel);

  const style = document.createElement('style');
  style.textContent = `#tw-lw::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;background:white;border-radius:50%;cursor:pointer}`;
  document.head.appendChild(style);

  document.getElementById('tw-lw').addEventListener('input', e => {
    tweaks.chartThickness = parseFloat(e.target.value);
    document.getElementById('tw-lwval').textContent = tweaks.chartThickness.toFixed(1);
    Object.values(charts).forEach(ch => { ch.data.datasets[0].borderWidth = tweaks.chartThickness; ch.update(); });
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { chartThickness: tweaks.chartThickness } }, '*');
  });
}

window.addEventListener('message', e => {
  if (e.data?.type === '__activate_edit_mode') { buildTweakPanel(); tweakPanel.style.display = 'block'; }
  if (e.data?.type === '__deactivate_edit_mode' && tweakPanel) tweakPanel.style.display = 'none';
});
window.parent.postMessage({ type: '__edit_mode_available' }, '*');
