// Camada "Lugares": nomes de países, estados e cidades com densidade automática.
// A cada movimento da câmera: filtra candidatos pela altitude (≈ zoom) e pela área visível,
// descarta os que estão atrás do globo, ordena por importância e aceita gulosamente só os que
// não colidem em tela — como os mapas web fazem. Os rótulos ficam sobre o relevo exagerado.

import { loadGeo } from '../platform.js';

const C = Cesium;
const KIND = { country: 0, state: 1, city: 2 };

// Aparência por mapa base (texto claro sobre relevo/satélite; escuro sobre o Padrão).
const THEMES = {
  dark: {
    country: { fill: '#ffffff', outline: 'rgba(0,0,0,0.85)' },
    state: { fill: '#f1f1f1', outline: 'rgba(0,0,0,0.75)' },
    city: { fill: '#ffffff', outline: 'rgba(0,0,0,0.85)' },
    dot: '#ffffff', dotOutline: '#000000',
  },
  light: {
    country: { fill: '#2b2b33', outline: 'rgba(255,255,255,0.95)' },
    state: { fill: '#6b6b78', outline: 'rgba(255,255,255,0.9)' },
    city: { fill: '#3a3a44', outline: 'rgba(255,255,255,0.95)' },
    dot: '#5f6368', dotOutline: '#ffffff',
  },
};

const FONTS = {
  country: { px: 15, font: '700 15px Inter, "Segoe UI", sans-serif' },
  state: { px: 11, font: '600 11px Inter, "Segoe UI", sans-serif' },
  city: { px: 12, font: '500 12px Inter, "Segoe UI", sans-serif' },
  capital: { px: 13, font: '700 13px Inter, "Segoe UI", sans-serif' },
};

const MAX_LABELS = 90;

export class PlaceLabels {
  constructor(view, { source, getExag }) {
    this.view = view;
    this.scene = view.scene;
    this.camera = view.camera;
    this.source = source;
    this.getExag = getExag;
    this.enabled = false;
    this.theme = THEMES.dark;
    this.items = null;
    this.labels = this.scene.primitives.add(new C.LabelCollection({ scene: this.scene }));
    this.points = this.scene.primitives.add(new C.PointPrimitiveCollection());
    this._timer = null;
    this.camera.percentageChanged = 0.02;
    this.camera.changed.addEventListener(() => this.schedule());
    this.camera.moveEnd.addEventListener(() => this.schedule(0));
  }

  async setEnabled(on) {
    this.enabled = on;
    if (on && !this.items) await this._load();
    this.schedule(0);
  }

  setBaseMode(mode) {
    this.theme = mode === 'standard' ? THEMES.light : THEMES.dark;
    this.schedule(0);
  }

  schedule(delay = 120) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.update(), delay);
  }

  async _load() {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const d = await loadGeo('labels');
      const items = [];
      for (const [name, lon, lat, minLabel, pop] of d.countries) {
        items.push({ kind: KIND.country, name, lon, lat, minLabel, pop });
      }
      for (const [name, lon, lat, minLabel] of d.states) {
        items.push({ kind: KIND.state, name, lon, lat, minLabel });
      }
      for (const [name, lon, lat, pop, cap] of d.cities) {
        items.push({ kind: KIND.city, name, lon, lat, pop, cap });
      }
      for (const it of items) it.surface = C.Cartesian3.fromDegrees(it.lon, it.lat, 0);
      this.items = items;
    })();
    try { await this._loading; } finally { this._loading = null; }
  }

  /** Altitude da câmera → "zoom" equivalente de mapa web (≈1 no globo inteiro, ≈12 a 10 km). */
  _zoomEq() {
    const h = Math.max(1000, this.camera.positionCartographic.height);
    return Math.log2(4.2e7 / h);
  }

  update() {
    this.labels.removeAll();
    this.points.removeAll();
    if (!this.enabled || !this.items) return;

    const z = this._zoomEq();
    const rect = this.camera.computeViewRectangle();
    let w = -180, s = -90, e = 180, n = 90;
    if (rect) {
      w = C.Math.toDegrees(rect.west); e = C.Math.toDegrees(rect.east);
      s = C.Math.toDegrees(rect.south); n = C.Math.toDegrees(rect.north);
    }
    const crosses = e < w;
    const inRect = (lon, lat) => lat >= s && lat <= n && (crosses ? lon >= w || lon <= e : lon >= w && lon <= e);
    const occluder = new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, this.camera.positionWC);
    // população mínima de cidade para o zoom atual (capitais nacionais têm bônus)
    const minPop = Math.pow(10, 7.6 - 0.5 * z);

    const cand = [];
    for (const it of this.items) {
      if (!inRect(it.lon, it.lat)) continue;
      let score;
      if (it.kind === KIND.country) {
        if (it.minLabel > z + 1.6 || z > 10.5) continue;
        score = 3e9 - it.minLabel * 1e8 + Math.log10(it.pop + 1);
      } else if (it.kind === KIND.state) {
        if (z < 3 || it.minLabel > z + 0.8) continue;
        score = 1e9 - it.minLabel * 1e7;
      } else {
        const pop = it.cap === 2 ? it.pop * 6 : it.cap === 1 ? it.pop * 2 : it.pop;
        if (pop < minPop) continue;
        score = (it.cap === 2 ? 2e9 : 0) + pop;
      }
      if (!occluder.isPointVisible(it.surface)) continue;
      cand.push([score, it]);
    }
    cand.sort((a, b) => b[0] - a[0]);

    const exag = this.getExag();
    const W = this.scene.canvas.clientWidth, H = this.scene.canvas.clientHeight;
    const taken = [];
    const toWin = C.SceneTransforms.worldToWindowCoordinates || C.SceneTransforms.wgs84ToWindowCoordinates;
    // espaço reservado (ex.: marcador do lugar buscado) — nenhum rótulo é colocado por cima
    for (const r of this.reserved?.() || []) {
      const wp = toWin(this.scene, r.position);
      if (wp) taken.push([wp.x - r.width / 2, wp.y - 34, r.width, 40]);
    }
    const th = this.theme;
    let count = 0;
    for (const [, it] of cand) {
      if (count >= MAX_LABELS) break;
      const h = this.source.sampleCached(it.lon, it.lat)?.h ?? 0;
      const pos = C.Cartesian3.fromDegrees(it.lon, it.lat, h * exag + 40 * Math.max(1, exag));
      const win = toWin(this.scene, pos);
      if (!win || win.x < 0 || win.y < 0 || win.x > W || win.y > H) continue;
      const kind = it.kind === KIND.country ? 'country' : it.kind === KIND.state ? 'state' : 'city';
      const f = kind === 'city' && it.cap === 2 ? FONTS.capital : FONTS[kind];
      const text = kind === 'state' ? it.name.toUpperCase() : it.name;
      const bw = text.length * f.px * (kind === 'state' ? 0.68 : 0.58) + 10;
      const bh = f.px + 8;
      const box = [win.x - bw / 2, win.y - bh - (kind === 'city' ? 4 : -bh / 2), bw, bh];
      if (taken.some((t) => box[0] < t[0] + t[2] && box[0] + box[2] > t[0] && box[1] < t[1] + t[3] && box[1] + box[3] > t[1])) continue;
      taken.push(box);
      count++;
      const col = th[kind];
      this.labels.add({
        position: pos,
        text,
        font: f.font,
        fillColor: C.Color.fromCssColorString(col.fill),
        outlineColor: C.Color.fromCssColorString(col.outline),
        outlineWidth: 3,
        style: C.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: kind === 'city' ? C.VerticalOrigin.BOTTOM : C.VerticalOrigin.CENTER,
        horizontalOrigin: C.HorizontalOrigin.CENTER,
        pixelOffset: kind === 'city' ? new C.Cartesian2(0, -6) : C.Cartesian2.ZERO,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      if (kind === 'city') {
        this.points.add({
          position: pos,
          pixelSize: it.cap === 2 ? 6 : 4.5,
          color: C.Color.fromCssColorString(th.dot),
          outlineColor: C.Color.fromCssColorString(th.dotOutline),
          outlineWidth: 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
    }
  }
}
