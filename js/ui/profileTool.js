// Ferramenta de perfil topográfico: clique para adicionar vértices no globo; o perfil é
// calculado com elevação REAL e desenhado no globo na altura VISUAL (real × exagero).
import { computeProfile } from '../tools/analysis.js';
import { drawProfile } from './charts.js';
import { meters, distance, n1, n0 } from './format.js';
import { IS_MOBILE } from '../config.js';

const TAP = IS_MOBILE ? 'Toque' : 'Clique';
const FINISH = IS_MOBILE ? 'Toque em “Concluir”' : 'Duplo-clique ou “Concluir”';

const C = Cesium;

export class ProfileTool {
  constructor({ view, source, getState, toast }) {
    this.view = view;
    this.source = source;
    this.getState = getState;
    this.toast = toast;
    this.active = false;
    this.vertices = [];
    this.result = null;
    this.mode = 'fit';
    this.hover = null;
    this.entities = [];

    this.panel = document.getElementById('profilePanel');
    this.canvas = document.getElementById('profileCanvas');
    this.statsEl = document.getElementById('profileStats');
    this.hint = document.getElementById('profileHint');

    document.getElementById('profileClose').onclick = () => this.close();
    document.getElementById('profileNew').onclick = () => this.start();
    document.getElementById('profileDone').onclick = () => this.finish();
    document.querySelectorAll('#profileMode button').forEach((b) => {
      b.onclick = () => {
        this.mode = b.dataset.v;
        document.querySelectorAll('#profileMode button').forEach((x) => x.classList.toggle('on', x === b));
        this.draw();
      };
    });
    this.canvas.addEventListener('mousemove', (e) => this._chartHover(e));
    this.canvas.addEventListener('mouseleave', () => { this.hover = null; this._updateHoverMarker(); this.draw(); });
    new ResizeObserver(() => this.draw()).observe(this.canvas);

    const handler = new C.ScreenSpaceEventHandler(view.scene.canvas);
    handler.setInputAction((e) => this._click(e.position), C.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(() => { if (this.active) this.finish(); }, C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  start() {
    this.clear();
    this.active = true;
    this.panel.classList.remove('hidden');
    document.body.classList.add('profile-open');
    this.hint.textContent = `${TAP} no globo para adicionar pontos (A, B, …). ${FINISH} para gerar o perfil.`;
    this.statsEl.innerHTML = '';
    this.draw();
    this.onToggle?.(true);
  }

  close() {
    this.active = false;
    this.clear();
    this.panel.classList.add('hidden');
    document.body.classList.remove('profile-open');
    this.onToggle?.(false);
  }

  clear() {
    this.vertices = [];
    this.result = null;
    this.hover = null;
    for (const e of this.entities) this.view.viewer.entities.remove(e);
    this.entities = [];
    this.line = this.previewLine = this.hoverEntity = null;
  }

  _click(pos) {
    if (!this.active) return;
    const p = this.view.pickLonLat(pos);
    if (!p) return;
    // ignora o segundo clique de um duplo-clique no mesmo lugar
    const last = this.vertices[this.vertices.length - 1];
    if (last && Math.abs(last[0] - p.lon) < 1e-7 && Math.abs(last[1] - p.lat) < 1e-7) return;
    this.vertices.push([p.lon, p.lat]);
    const label = String.fromCharCode(65 + ((this.vertices.length - 1) % 26));
    const ent = this.view.viewer.entities.add({
      position: new C.CallbackProperty(() => this._visualPos(p.lon, p.lat, 0), false),
      point: { pixelSize: 9, color: C.Color.fromCssColorString('#ffde59'), outlineColor: C.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: label, font: '700 14px Inter, sans-serif', fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -18), disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    ent._vertex = true;
    this.entities.push(ent);
    if (this.vertices.length === 2) {
      this.previewLine = this.view.viewer.entities.add({
        polyline: {
          positions: new C.CallbackProperty(() => this.vertices.map(([lo, la]) => this._visualPos(lo, la, 0)), false),
          width: 2, arcType: C.ArcType.GEODESIC,
          material: new C.PolylineDashMaterialProperty({ color: C.Color.fromCssColorString('#ffde59') }),
          depthFailMaterial: new C.PolylineDashMaterialProperty({ color: C.Color.fromCssColorString('#ffde59').withAlpha(0.5) }),
        },
      });
      this.entities.push(this.previewLine);
    }
    this.hint.textContent = `${this.vertices.length} ponto(s). ${this.vertices.length >= 2 ? `${FINISH} para gerar.` : `${TAP} no ponto B.`}`;
  }

  _visualPos(lon, lat, offset) {
    const h = this.source.sampleCached(lon, lat)?.h ?? 0;
    const ex = this.getState().exaggeration;
    return C.Cartesian3.fromDegrees(lon, lat, h * ex + offset + 30 * Math.max(1, ex));
  }

  async finish() {
    if (this.vertices.length < 2) { this.toast('Adicione pelo menos 2 pontos.'); return; }
    this.active = false;
    this.hint.textContent = 'Calculando perfil…';
    try {
      this.result = await computeProfile(this.source, this.vertices, 700);
    } catch (e) {
      console.error(e);
      this.hint.textContent = 'Falha ao calcular o perfil.';
      return;
    }
    if (this.previewLine) { this.view.viewer.entities.remove(this.previewLine); this.previewLine = null; }
    const r = this.result;
    const ex = () => this.getState().exaggeration;
    // linha 3D na altura visual do relevo (recalculada quando o exagero muda)
    this.line = this.view.viewer.entities.add({
      polyline: {
        positions: new C.CallbackProperty(() => {
          const e = ex();
          const out = [];
          for (let i = 0; i < r.points.length; i += 2) out.push(C.Cartesian3.fromDegrees(r.points[i][0], r.points[i][1], r.heights[i] * e + 25 * Math.max(1, e)));
          return out;
        }, false),
        width: 3,
        material: new C.PolylineOutlineMaterialProperty({ color: C.Color.fromCssColorString('#ffde59'), outlineColor: C.Color.BLACK, outlineWidth: 1 }),
        depthFailMaterial: new C.ColorMaterialProperty(C.Color.fromCssColorString('#ffde59').withAlpha(0.35)),
      },
    });
    this.entities.push(this.line);
    this.hoverEntity = this.view.viewer.entities.add({
      show: false,
      position: new C.CallbackProperty(() => {
        if (this.hover === null) return undefined;
        const [lo, la] = r.points[this.hover];
        return C.Cartesian3.fromDegrees(lo, la, r.heights[this.hover] * ex() + 25 * Math.max(1, ex()));
      }, false),
      point: { pixelSize: 11, color: C.Color.fromCssColorString('#ff6a7e'), outlineColor: C.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    this.entities.push(this.hoverEntity);
    this.hint.textContent = `${distance(r.total)} · ${r.vertices.length} vértices · resolução ~${distance(r.spacing)}/amostra`;
    this.draw();
  }

  draw() {
    if (this.panel.classList.contains('hidden')) return;
    const r = this.result;
    const ctx = this.canvas.getContext('2d');
    if (!r) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    const st = this.getState();
    const geo = drawProfile(this.canvas, r, { palette: st.palette, mode: this.mode, exag: st.exaggeration, seaLevel: st.seaLevel, hover: this.hover });
    this._geo = geo;
    const s = r.stats;
    const row = (k, v) => `<span class="k">${k}</span><span class="v">${v}</span>`;
    this.statsEl.innerHTML = [
      row('Distância', distance(r.total)),
      row('Elevação máxima', meters(s.max)),
      row('Elevação mínima', meters(s.min)),
      row('Amplitude (desnível)', meters(s.range)),
      row('Início → fim', `${meters(s.start)} → ${meters(s.end)}`),
      row('Subida acumulada', meters(s.gain)),
      row('Descida acumulada', meters(s.loss)),
      row('Inclinação média', `${n1(s.meanSlopePct)}%`),
      row('Inclinação máxima', `${n1(s.maxSlopePct)}%`),
      '<div class="sep"></div>',
      row('Exagero do globo', `${n0(st.exaggeration)}×`),
      row(this.mode === 'fit' ? 'Exagero do gráfico' : 'Gráfico', this.mode === 'fit' ? `${n0(geo.effExag)}×` : `${n0(st.exaggeration)}× ${geo.clipped ? '(recortado)' : ''}`),
      row('Relevo visual no globo', meters(s.range * st.exaggeration)),
    ].join('');
  }

  _chartHover(e) {
    if (!this.result || !this._geo) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this._geo.m.l;
    const t = x / this._geo.pw;
    if (t < 0 || t > 1) { this.hover = null; } else this.hover = Math.round(t * (this.result.heights.length - 1));
    this._updateHoverMarker();
    this.draw();
  }

  _updateHoverMarker() {
    if (this.hoverEntity) this.hoverEntity.show = this.hover !== null;
  }
}
