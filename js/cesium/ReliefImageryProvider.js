// ImageryProvider que gera, no cliente, a textura hipsométrica + hillshade a partir da
// elevação real. Mesma quadtree geográfica do terreno => textura e malha alinhadas 1:1.
// O estilo (paleta, nível do mar, isolinhas, faixas…) é imutável por instância: para mudar o
// estilo cria-se uma nova camada (ver ReliefLayerManager), com crossfade.

const { GeographicTilingScheme, Credit, Event, Math: CMath } = Cesium;

const SIZE = 256;
const GRID = SIZE + 2;

// Cache de grades de elevação (com borda) compartilhado entre instâncias/estilos:
// mudar o estilo só recolore, sem reamostrar.
const gridCache = new Map();
const GRID_CACHE_MAX = 160;

export class ReliefImageryProvider {
  constructor(source, pool, style, { maxLevel = 14 } = {}) {
    this._source = source;
    this._pool = pool;
    this._style = { ...style };
    this._tilingScheme = new GeographicTilingScheme();
    this._maxLevel = maxLevel;
    this._errorEvent = new Event();
    this._credit = new Credit('Relevo sombreado gerado localmente');
    this._pending = 0;
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
  get hasAlphaChannel() { return this._style.output === 'overlay'; }
  get ready() { return true; }
  getTileCredits() { return undefined; }
  pickFeatures() { return undefined; }

  requestImage(x, y, level) {
    if (this._pending >= 40) return undefined;
    this._pending++;
    return this._render(x, y, level).finally(() => { this._pending--; });
  }

  async _grid(x, y, level) {
    const key = `${level}/${x}/${y}/${this._source.version}`;
    let g = gridCache.get(key);
    if (g) {
      gridCache.delete(key);
      gridCache.set(key, g);
      return g;
    }
    const r = this._tilingScheme.tileXYToRectangle(x, y, level);
    const w = CMath.toDegrees(r.west), e = CMath.toDegrees(r.east);
    const s = CMath.toDegrees(r.south), n = CMath.toDegrees(r.north);
    const dLon = (e - w) / SIZE, dLat = (n - s) / SIZE;
    const geo = { lon0: w - dLon / 2, lat0: n + dLat / 2, dLon, dLat };
    const heights = await this._source.sampleGrid({ ...geo, cols: GRID, rows: GRID, z: level + 1 });
    g = { heights, geo };
    gridCache.set(key, g);
    if (gridCache.size > GRID_CACHE_MAX) gridCache.delete(gridCache.keys().next().value);
    return g;
  }

  async _render(x, y, level) {
    const { heights, geo } = await this._grid(x, y, level);
    const copy = heights.slice();
    const { rgba } = await this._pool.run(
      { heights: copy, cols: GRID, rows: GRID, geo, style: { ...this._style, z: level + 1 } },
      [copy.buffer],
    );
    // O Cesium não aplica UNPACK_FLIP_Y em ImageBitmap: ele espera o bitmap já invertido.
    // A inversão é feita à mão porque o Safari (iOS) pode ignorar { imageOrientation: 'flipY' }.
    return createImageBitmap(new ImageData(flipRows(rgba, SIZE, SIZE), SIZE, SIZE));
  }
}

export function clearGridCache() { gridCache.clear(); }

function flipRows(rgba, w, h) {
  const row = w * 4;
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) out.set(rgba.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
  return out;
}
