// Rasteriza linhas vetoriais (divisas, falhas, placas, anotações) em tiles transparentes.
// Como é uma camada de imagem, ela é "drapeada" sobre o terreno e acompanha automaticamente
// o exagero vertical — sem precisar recalcular alturas.

const { GeographicTilingScheme, Credit, Event, Math: CMath } = Cesium;
const SIZE = 256;
const CELL = 10; // graus por célula do índice espacial

let EMPTY = null;
function emptyImage() {
  if (!EMPTY) { EMPTY = document.createElement('canvas'); EMPTY.width = EMPTY.height = 1; }
  return EMPTY;
}

/**
 * feature: {
 *   coords?: [[lon,lat],...] | flat?: number[] (lon,lat intercalados),
 *   color: css, width: px | (level) => px, dash?: number[], halo?: css,
 *   minLevel?: number, maxLevel?: number   // nível da quadtree geográfica em que a linha aparece
 * }
 */
export class VectorImageryProvider {
  constructor(features = [], { credit = '', maxLevel = 18 } = {}) {
    this._tilingScheme = new GeographicTilingScheme();
    this._errorEvent = new Event();
    this._credit = credit ? new Credit(credit) : undefined;
    this._maxLevel = maxLevel;
    this.setFeatures(features);
  }

  setFeatures(features) {
    this._features = [];
    this._grid = new Map();
    for (const f of features) {
      let flat = f.flat;
      if (!flat) {
        if (!f.coords || f.coords.length < 2) continue;
        flat = f.coords.flat();
      }
      if (flat.length < 4) continue;
      let w = 180, e = -180, s = 90, n = -90;
      for (let i = 0; i < flat.length; i += 2) {
        const lon = flat[i], lat = flat[i + 1];
        if (lon < w) w = lon; if (lon > e) e = lon; if (lat < s) s = lat; if (lat > n) n = lat;
      }
      const feat = { ...f, flat, bbox: [w, s, e, n] };
      const idx = this._features.push(feat) - 1;
      for (let cx = Math.floor(w / CELL); cx <= Math.floor(e / CELL); cx++) {
        for (let cy = Math.floor(s / CELL); cy <= Math.floor(n / CELL); cy++) {
          const k = cx * 1000 + cy;
          let arr = this._grid.get(k);
          if (!arr) this._grid.set(k, (arr = []));
          arr.push(idx);
        }
      }
    }
  }

  _candidates(w, s, e, n) {
    const seen = new Set();
    const out = [];
    for (let cx = Math.floor(w / CELL); cx <= Math.floor(e / CELL); cx++) {
      for (let cy = Math.floor(s / CELL); cy <= Math.floor(n / CELL); cy++) {
        const arr = this._grid.get(cx * 1000 + cy);
        if (!arr) continue;
        for (const i of arr) if (!seen.has(i)) { seen.add(i); out.push(this._features[i]); }
      }
    }
    return out;
  }

  get tilingScheme() { return this._tilingScheme; }
  get rectangle() { return this._tilingScheme.rectangle; }
  get tileWidth() { return SIZE; }
  get tileHeight() { return SIZE; }
  get minimumLevel() { return 0; }
  get maximumLevel() { return this._maxLevel; }
  get tileDiscardPolicy() { return undefined; }
  get errorEvent() { return this._errorEvent; }
  get credit() { return this._credit; }
  get proxy() { return undefined; }
  get hasAlphaChannel() { return true; }
  get ready() { return true; }
  getTileCredits() { return undefined; }
  pickFeatures() { return undefined; }

  requestImage(x, y, level) {
    const r = this._tilingScheme.tileXYToRectangle(x, y, level);
    const w = CMath.toDegrees(r.west), e = CMath.toDegrees(r.east);
    const s = CMath.toDegrees(r.south), n = CMath.toDegrees(r.north);
    const sx = SIZE / (e - w), sy = SIZE / (n - s);
    const padX = 8 / sx, padY = 8 / sy;

    const feats = this._candidates(w - padX, s - padY, e + padX, n + padY).filter((f) => {
      if (f.minLevel !== undefined && level < f.minLevel) return false;
      if (f.maxLevel !== undefined && level > f.maxLevel) return false;
      const [bw, bs, be, bn] = f.bbox;
      return !(be < w - padX || bw > e + padX || bn < s - padY || bs > n + padY);
    });
    if (!feats.length) return Promise.resolve(emptyImage());

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const scale = level < 3 ? 0.75 : 1;
    // halos primeiro, depois as linhas (as linhas nunca ficam sob o halo de outra)
    const paths = feats.map((f) => {
      const path = new Path2D();
      const flat = f.flat;
      let prevLon = null;
      for (let i = 0; i < flat.length; i += 2) {
        const lon = flat[i], lat = flat[i + 1];
        const px = (lon - w) * sx, py = (n - lat) * sy;
        if (prevLon === null || Math.abs(lon - prevLon) > 180) path.moveTo(px, py);
        else path.lineTo(px, py);
        prevLon = lon;
      }
      const width = (typeof f.width === 'function' ? f.width(level) : f.width) * scale;
      return { f, path, width };
    });
    for (const { f, path, width } of paths) {
      if (!f.halo) continue;
      ctx.strokeStyle = f.halo;
      ctx.lineWidth = width + 2.5;
      ctx.setLineDash([]);
      ctx.stroke(path);
    }
    for (const { f, path, width } of paths) {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = width;
      ctx.setLineDash(f.dash || []);
      ctx.stroke(path);
    }
    return Promise.resolve(canvas);
  }
}
