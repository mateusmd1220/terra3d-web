// Gráficos em canvas: perfil topográfico e histograma de elevação (cores = paleta ativa).
import { cssColorAt } from '../render/palettes.js';
import { meters, distance, n0 } from './format.js';

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceStep(range, target) {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

/**
 * @param {object} opts { palette, mode: 'fit'|'scale', exag, seaLevel, hover }
 * @returns {object} geometria do gráfico (para hit-test do mouse)
 */
export function drawProfile(canvas, prof, opts) {
  const { ctx, w, h } = setup(canvas);
  const m = { l: 58, r: 14, t: 16, b: 26 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const { dist, heights, total, stats } = prof;
  const N = heights.length;

  let y0, y1;
  const mppX = total / pw;
  if (opts.mode === 'scale') {
    // proporção real × exagero: 1 px vertical = (m/px horizontal) / exagero
    const mppY = mppX / Math.max(opts.exag, 0.01);
    const mid = (stats.min + stats.max) / 2;
    y0 = mid - (ph * mppY) / 2;
    y1 = mid + (ph * mppY) / 2;
  } else {
    const pad = Math.max(20, stats.range * 0.08);
    y0 = stats.min - pad;
    y1 = stats.max + pad;
    if (opts.seaLevel !== undefined && stats.min < opts.seaLevel + pad && stats.max > opts.seaLevel - pad) {
      y0 = Math.min(y0, opts.seaLevel - pad);
      y1 = Math.max(y1, opts.seaLevel + pad);
    }
  }
  const effExag = mppX / ((y1 - y0) / ph);
  const X = (d) => m.l + (d / total) * pw;
  const Y = (v) => m.t + ph - ((v - y0) / (y1 - y0)) * ph;

  // grade
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  const ys = niceStep(y1 - y0, 5);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) {
    const y = Math.round(Y(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
    ctx.fillText(meters(v, { kmFrom: 100000 }), m.l - 6, y);
  }
  const xs = niceStep(total, 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let d = 0; d <= total; d += xs) {
    const x = Math.round(X(d)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
    ctx.fillText(distance(d), x, m.t + ph + 6);
  }

  // preenchimento colorido pela paleta (uma coluna por pixel)
  ctx.save();
  ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
  const bottom = m.t + ph;
  for (let px = 0; px < pw; px++) {
    const i = Math.min(N - 1, Math.round((px / pw) * (N - 1)));
    const v = heights[i];
    const y = Y(v);
    ctx.fillStyle = cssColorAt(opts.palette, v - (opts.seaLevel || 0));
    ctx.fillRect(m.l + px, y, 1.2, bottom - y);
  }
  // nível do mar simulado
  if (opts.seaLevel !== undefined) {
    const ys0 = Y(opts.seaLevel);
    ctx.fillStyle = 'rgba(40,120,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(m.l, ys0);
    for (let px = 0; px <= pw; px++) {
      const i = Math.min(N - 1, Math.round((px / pw) * (N - 1)));
      ctx.lineTo(m.l + px, Math.max(ys0, Y(heights[i])));
    }
    ctx.lineTo(m.l + pw, ys0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,200,255,0.9)';
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(m.l, ys0); ctx.lineTo(m.l + pw, ys0); ctx.stroke();
    ctx.setLineDash([]);
  }
  // linha do perfil
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const x = X(dist[i]), y = Y(heights[i]);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();

  // máx/mín
  const mark = (i, label) => {
    const x = X(dist[i]), y = Y(heights[i]);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = x > m.l + pw - 80 ? 'right' : 'left';
    const below = y < m.t + 16;
    ctx.textBaseline = below ? 'top' : 'bottom';
    ctx.fillText(label, x + (ctx.textAlign === 'left' ? 5 : -5), below ? y + 4 : y - 3);
  };
  mark(stats.iMax, `máx ${meters(stats.max)}`);
  mark(stats.iMin, `mín ${meters(stats.min)}`);

  // hover
  if (opts.hover !== null && opts.hover !== undefined) {
    const i = opts.hover;
    const x = X(dist[i]), y = Y(heights[i]);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
    ctx.fillStyle = '#ffde59';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    const label = `${distance(dist[i])} · ${meters(heights[i])}`;
    ctx.font = '12px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 12;
    const bx = Math.min(Math.max(x - tw / 2, m.l), m.l + pw - tw);
    ctx.fillStyle = 'rgba(10,12,20,0.85)';
    ctx.fillRect(bx, m.t + 2, tw, 20);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 6, m.t + 12);
  }
  ctx.restore();

  return { m, pw, ph, total, N, effExag, clipped: opts.mode === 'scale' && (stats.max > y1 || stats.min < y0) };
}

export function drawHistogram(canvas, stats, { palette, seaLevel = 0, color }) {
  const { ctx, w, h } = setup(canvas);
  const m = { l: 34, r: 8, t: 8, b: 22 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const { bins, min, width } = stats.hist;
  const maxv = Math.max(...bins, 0.001);
  const bw = pw / bins.length;
  for (let i = 0; i < bins.length; i++) {
    const v = bins[i];
    const bh = (v / maxv) * ph;
    ctx.fillStyle = color || cssColorAt(palette, min + (i + 0.5) * width - seaLevel);
    ctx.fillRect(m.l + i * bw + 0.5, m.t + ph - bh, Math.max(1, bw - 1), bh);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(meters(min, { kmFrom: 1e9 }), m.l, m.t + ph + 5);
  ctx.textAlign = 'right';
  ctx.fillText(meters(min + width * bins.length, { kmFrom: 1e9 }), m.l + pw, m.t + ph + 5);
  ctx.textAlign = 'center';
  ctx.fillText('elevação →', m.l + pw / 2, m.t + ph + 5);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`${n0(maxv)}%`, m.l - 4, m.t);
}
