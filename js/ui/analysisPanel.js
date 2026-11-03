// Painel de estatísticas da vista atual e comparação entre regiões.
import { computeRegionStats } from '../tools/analysis.js';
import { REGIONS } from '../data/places.js';
import { drawHistogram } from './charts.js';
import { meters, pct, n0 } from './format.js';

const C = Cesium;

export class AnalysisPanel {
  constructor({ view, source, getState, setAnnotation, flyToRect }) {
    this.view = view;
    this.source = source;
    this.getState = getState;
    this.setAnnotation = setAnnotation;
    this.flyToRect = flyToRect;
    this.panel = document.getElementById('analysisPanel');
    this.body = document.getElementById('analysisBody');
    this.title = document.getElementById('analysisTitle');
    this.captured = null;
    document.getElementById('analysisClose').onclick = () => this.close();
    this._moveEnd = () => { if (this.mode === 'stats' && this.auto) this.runStats(); };
    view.camera.moveEnd.addEventListener(this._moveEnd);
  }

  viewRect() {
    const r = this.view.camera.computeViewRectangle(this.view.scene.globe.ellipsoid);
    if (!r) return [-180, -85, 180, 85];
    let w = C.Math.toDegrees(r.west), e = C.Math.toDegrees(r.east);
    if (e < w) e += 360; // cruza o antimeridiano
    return [w, C.Math.toDegrees(r.south), e, C.Math.toDegrees(r.north)];
  }

  close() {
    this.panel.classList.add('hidden');
    this.mode = null;
    this.setAnnotation('analysis', null);
  }

  _outline(rects) {
    const feats = rects.map(([w, s, e, n], i) => ({
      coords: [[w, s], [e, s], [e, n], [w, n], [w, s]],
      color: i === 0 ? '#ffde59' : '#46cff4', width: 2.5, dash: [8, 5], halo: 'rgba(0,0,0,.5)',
    }));
    this.setAnnotation('analysis', feats);
  }

  // ------------------------------------------------------------ estatísticas
  openStats() {
    this.mode = 'stats';
    this.auto = this.auto ?? true;
    this.title.textContent = 'Estatísticas da vista atual';
    this.panel.classList.remove('hidden');
    this.body.innerHTML = `
      <div class="row">
        <label class="check"><input type="checkbox" id="stAuto" ${this.auto ? 'checked' : ''}/> Atualizar ao mover a câmera</label>
        <label class="check"><input type="checkbox" id="stLand"/> Somente terra</label>
        <div class="spacer"></div>
        <button class="btn" id="stRun">Recalcular</button>
      </div>
      <div id="stOut"><p class="hint">Calculando…</p></div>`;
    this.body.querySelector('#stAuto').onchange = (e) => { this.auto = e.target.checked; };
    this.body.querySelector('#stLand').onchange = () => this.runStats();
    this.body.querySelector('#stRun').onclick = () => this.runStats();
    this.runStats();
  }

  async runStats() {
    const out = this.body.querySelector('#stOut');
    if (!out) return;
    const rect = this.viewRect();
    const st = this.getState();
    const landOnly = this.body.querySelector('#stLand')?.checked;
    this._outline([rect]);
    const my = (this._seq = (this._seq || 0) + 1);
    out.innerHTML = '<p class="hint">Calculando…</p>';
    const s = await computeRegionStats(this.source, rect, { seaLevel: st.seaLevel, landOnly });
    if (my !== this._seq) return;
    if (!s) { out.innerHTML = '<p class="hint">Nenhuma amostra (tente desmarcar "Somente terra").</p>'; return; }
    out.innerHTML = `
      <p class="hint">Região: ${s.rect.map((v) => v.toFixed(2)).join(', ')} · ${n0(s.areaKm2)} km² · ${n0(s.count)} amostras ponderadas por área (z${s.z});
      máx./mín. por varredura completa em z${s.extrema.z} (~${n0(s.extrema.res)} m/px).
      Ponto mais alto: ${s.maxAt ? s.maxAt.map((v) => v.toFixed(3)).join(', ') : '—'}</p>
      ${statsTable([s])}
      <canvas class="hist" id="stHist"></canvas>`;
    drawHistogram(out.querySelector('#stHist'), s, { palette: st.palette, seaLevel: st.seaLevel });
  }

  // ------------------------------------------------------------ comparação
  openCompare() {
    this.mode = 'compare';
    this.title.textContent = 'Comparar regiões';
    this.panel.classList.remove('hidden');
    const opts = (sel) => ['<option value="view">Vista atual da câmera</option>']
      .concat(REGIONS.map((r) => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${r.name}</option>`)).join('');
    this.body.innerHTML = `
      <div class="cmp-pick">
        <label>Região A <select id="cmpA">${opts('himalaya')}</select></label>
        <label>Região B <select id="cmpB">${opts('andes')}</select></label>
      </div>
      <div class="row">
        <label class="check"><input type="checkbox" id="cmpLand" checked/> Somente terra (acima do nível do mar)</label>
        <div class="spacer"></div>
        <button class="btn" id="cmpFlyA">Ver A</button><button class="btn" id="cmpFlyB">Ver B</button>
        <button class="btn active" id="cmpRun">Comparar</button>
      </div>
      <div id="cmpOut"></div>`;
    const rectOf = (id) => (id === 'view' ? this.viewRect() : REGIONS.find((r) => r.id === id).rect);
    this.body.querySelector('#cmpRun').onclick = () => this.runCompare(rectOf);
    this.body.querySelector('#cmpFlyA').onclick = () => this.flyToRect(rectOf(this.body.querySelector('#cmpA').value));
    this.body.querySelector('#cmpFlyB').onclick = () => this.flyToRect(rectOf(this.body.querySelector('#cmpB').value));
    this.runCompare(rectOf);
  }

  async runCompare(rectOf) {
    const out = this.body.querySelector('#cmpOut');
    const a = this.body.querySelector('#cmpA'), b = this.body.querySelector('#cmpB');
    const landOnly = this.body.querySelector('#cmpLand').checked;
    const st = this.getState();
    const ra = rectOf(a.value), rb = rectOf(b.value);
    this._outline([ra, rb]);
    out.innerHTML = '<p class="hint">Calculando (pode baixar alguns tiles)…</p>';
    const [sa, sb] = await Promise.all([
      computeRegionStats(this.source, ra, { seaLevel: st.seaLevel, landOnly }),
      computeRegionStats(this.source, rb, { seaLevel: st.seaLevel, landOnly }),
    ]);
    if (!sa || !sb) { out.innerHTML = '<p class="hint">Uma das regiões não tem amostras.</p>'; return; }
    const names = [a.selectedOptions[0].text, b.selectedOptions[0].text];
    out.innerHTML = `${statsTable([sa, sb], names)}
      <div class="row" style="gap:10px">
        <div style="flex:1"><div class="hint">A — ${names[0]}</div><canvas class="hist" id="hA"></canvas></div>
        <div style="flex:1"><div class="hint">B — ${names[1]}</div><canvas class="hist" id="hB"></canvas></div>
      </div>`;
    drawHistogram(out.querySelector('#hA'), sa, { palette: st.palette, seaLevel: st.seaLevel });
    drawHistogram(out.querySelector('#hB'), sb, { palette: st.palette, seaLevel: st.seaLevel });
  }
}

function statsTable(list, names) {
  const rows = [
    ['Área', (s) => `${n0(s.areaKm2)} km²`, (s) => s.areaKm2],
    ['Elevação máxima', (s) => meters(s.max), (s) => s.max],
    ['Elevação mínima', (s) => meters(s.min), (s) => -s.min],
    ['Média', (s) => meters(s.mean), (s) => s.mean],
    ['Mediana', (s) => meters(s.median), (s) => s.median],
    ['Amplitude', (s) => meters(s.range), (s) => s.range],
    ['Desvio padrão (rugosidade)', (s) => meters(s.std), (s) => s.std],
    ['Abaixo do nível do mar', (s) => pct(s.belowSea), (s) => s.belowSea],
    ...[0, 500, 1000, 2000, 3000, 4000, 5000].map((t) => [`Acima de ${n0(t)} m`, (s) => pct(s.above[t]), (s) => s.above[t]]),
  ];
  const head = names ? `<tr><th></th>${names.map((n, i) => `<th>${String.fromCharCode(65 + i)}</th>`).join('')}</tr>` : '';
  const body = rows.map(([k, f, score]) => {
    const scores = list.map(score);
    const best = list.length > 1 ? Math.max(...scores) : null;
    return `<tr><td>${k}</td>${list.map((s, i) => `<td class="${best !== null && scores[i] === best && scores[0] !== scores[1] ? 'win' : ''}">${f(s)}</td>`).join('')}</tr>`;
  }).join('');
  return `<table class="cmp">${head}${body}</table>`;
}
