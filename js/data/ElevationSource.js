// Fonte de elevação: tiles Terrarium (Web Mercator, 256 px) com cache LRU, fila de download
// com concorrência limitada, amostragem bilinear em grades geográficas e "patches" de alta
// resolução (ex.: GeoTIFF do OpenTopography) que sobrepõem os tiles base.
//
// TODA elevação aqui é REAL (metros, ~nível médio do mar). O exagero vertical é aplicado
// somente na GPU pelo Cesium (Scene.verticalExaggeration).

const TILE = 256;
const MAX_LAT = 85.0511287798;
const D2R = Math.PI / 180;
const ZERO_TILE = new Float32Array(TILE * TILE);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mod = (a, n) => ((a % n) + n) % n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const lonToGx = (lon, z) => ((lon + 180) / 360) * TILE * 2 ** z;
export function latToGy(lat, z) {
  const l = clamp(lat, -MAX_LAT, MAX_LAT) * D2R;
  return ((1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2) * TILE * 2 ** z;
}
export const metersPerPixel = (lat, z) => (40075016.686 * Math.cos(clamp(lat, -85, 85) * D2R)) / (TILE * 2 ** z);

export class ElevationSource {
  constructor({ urls, maxZoom = 15, cacheSize = 600, concurrency = 12 }) {
    this.urls = Array.isArray(urls) ? urls : [urls];
    this.maxZoom = maxZoom;
    this.cacheSize = cacheSize;
    this.concurrency = concurrency;
    this.cache = new Map();
    this.inflight = new Map();
    this.queue = [];
    this.active = 0;
    this.patches = [];
    this.version = 0; // incrementado quando patches mudam
    this.stats = { fetched: 0, failed: 0, bytes: 0 };
    this.onActivity = null;
    // OffscreenCanvas 2D só existe no Safari 16.4+; cai para um <canvas> comum se faltar
    this._canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(TILE, TILE)
      : Object.assign(document.createElement('canvas'), { width: TILE, height: TILE });
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
  }

  _key(z, x, y) { return z * 1e10 + y * 1e5 + x; }

  peek(z, x, y) {
    const k = this._key(z, x, y);
    const t = this.cache.get(k);
    if (t) { this.cache.delete(k); this.cache.set(k, t); }
    return t;
  }

  getTile(z, x, y) {
    const k = this._key(z, x, y);
    const t = this.peek(z, x, y);
    if (t) return Promise.resolve(t);
    let p = this.inflight.get(k);
    if (p) return p;
    p = this._schedule(() => this._load(z, x, y)).then(
      (data) => {
        this.inflight.delete(k);
        this.cache.set(k, data);
        if (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
        return data;
      },
      (err) => {
        this.inflight.delete(k);
        this.stats.failed++;
        console.warn(`Tile de elevação ${z}/${x}/${y} falhou:`, err.message || err);
        return ZERO_TILE;
      },
    );
    this.inflight.set(k, p);
    return p;
  }

  get busy() { return this.active + this.queue.length; }

  _schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._pump();
    });
  }

  _pump() {
    // LIFO: as requisições mais recentes (vista atual da câmera) são atendidas primeiro.
    while (this.active < this.concurrency && this.queue.length) {
      const job = this.queue.pop();
      this.active++;
      job.fn().then(job.resolve, job.reject).finally(() => {
        this.active--;
        this._pump();
        this.onActivity?.(this.busy);
      });
    }
    this.onActivity?.(this.busy);
  }

  async _load(z, x, y) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this._fetchDecode(z, x, y);
      } catch (e) {
        if (attempt >= 2) throw e;
        await sleep(500 * (attempt + 1));
      }
    }
  }

  async _fetchDecode(z, x, y) {
    // host fixo por tile => o cache HTTP do navegador continua eficaz
    const tpl = this.urls[(x + y * 3 + z) % this.urls.length];
    const url = tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    this.stats.bytes += blob.size;
    // sem conversão de espaço de cor/premultiplicação: os bytes RGB são dados, não cor
    const bmp = await decodeImage(blob);
    const ctx = this._ctx;
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    const d = ctx.getImageData(0, 0, TILE, TILE).data;
    const out = new Float32Array(TILE * TILE);
    for (let i = 0, j = 0; i < out.length; i++, j += 4) {
      out[i] = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768;
    }
    this.stats.fetched++;
    return out;
  }

  /**
   * Amostra uma grade geográfica regular (linhas de norte para sul).
   * @param {{lon0:number, lat0:number, dLon:number, dLat:number, cols:number, rows:number, z:number, maxTiles?:number}} g
   * @returns {Promise<Float32Array>}
   */
  async sampleGrid(g) {
    const { lon0, lat0, dLon, dLat, cols, rows } = g;
    const maxTiles = g.maxTiles || 48;
    let z = clamp(Math.round(g.z), 0, this.maxZoom);
    const lonB = lon0 + dLon * (cols - 1);
    const latB = lat0 - dLat * (rows - 1);
    let n, tx0, tx1, ty0, ty1;
    for (;;) {
      n = 2 ** z;
      tx0 = Math.floor((lonToGx(lon0, z) - 1) / TILE);
      tx1 = Math.floor((lonToGx(lonB, z) + 1) / TILE);
      ty0 = clamp(Math.floor((latToGy(lat0, z) - 1) / TILE), 0, n - 1);
      ty1 = clamp(Math.floor((latToGy(latB, z) + 1) / TILE), 0, n - 1);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= maxTiles || z === 0) break;
      z--;
    }
    const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1;
    const jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push(this.getTile(z, mod(tx, n), ty));
    const tiles = await Promise.all(jobs);

    const out = new Float32Array(cols * rows);
    const maxG = n * TILE - 1;
    const gxs = new Float64Array(cols);
    for (let c = 0; c < cols; c++) gxs[c] = lonToGx(lon0 + c * dLon, z) - 0.5;
    const baseX = tx0 * TILE;

    for (let r = 0; r < rows; r++) {
      const gy = clamp(latToGy(lat0 - r * dLat, z) - 0.5, 0, maxG);
      const y0 = Math.floor(gy), y1 = Math.min(y0 + 1, maxG), fy = gy - y0;
      const tA = clamp((y0 >> 8) - ty0, 0, ny - 1) * nx, tB = clamp((y1 >> 8) - ty0, 0, ny - 1) * nx;
      const pA = (y0 & 255) * TILE, pB = (y1 & 255) * TILE;
      const o = r * cols;
      for (let c = 0; c < cols; c++) {
        const gx = gxs[c];
        const x0 = Math.floor(gx), fx = gx - x0;
        const rx0 = x0 - baseX, rx1 = rx0 + 1;
        const i0 = clamp(Math.floor(rx0 / TILE), 0, nx - 1), i1 = clamp(Math.floor(rx1 / TILE), 0, nx - 1);
        const p0 = mod(rx0, TILE), p1 = mod(rx1, TILE);
        const a = tiles[tA + i0], b = tiles[tA + i1], cc = tiles[tB + i0], d = tiles[tB + i1];
        const top = a[pA + p0] * (1 - fx) + b[pA + p1] * fx;
        const bot = cc[pB + p0] * (1 - fx) + d[pB + p1] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
    }
    if (this.patches.length) this._applyPatches(out, g);
    return out;
  }

  _applyPatches(out, g) {
    const { lon0, lat0, dLon, dLat, cols, rows } = g;
    const lonB = lon0 + dLon * (cols - 1), latB = lat0 - dLat * (rows - 1);
    for (const p of this.patches) {
      if (p.east < lon0 || p.west > lonB || p.north < latB || p.south > lat0) continue;
      for (let r = 0; r < rows; r++) {
        const lat = lat0 - r * dLat;
        if (lat < p.south || lat > p.north) continue;
        for (let c = 0; c < cols; c++) {
          const lon = lon0 + c * dLon;
          if (lon < p.west || lon > p.east) continue;
          const v = samplePatch(p, lon, lat);
          if (!Number.isNaN(v)) out[r * cols + c] = v;
        }
      }
    }
  }

  /**
   * Varre TODOS os pixels dos tiles no zoom z dentro do retângulo [w,s,e,n] e devolve os extremos
   * (com posição). Mais preciso que a grade amostrada para máximo/mínimo.
   */
  async rectExtrema([w, s, e, n], z, maxTiles = 64) {
    z = clamp(Math.round(z), 0, this.maxZoom);
    let x0, x1, y0, y1;
    for (;;) {
      x0 = Math.floor(lonToGx(w, z)); x1 = Math.ceil(lonToGx(e, z));
      y0 = Math.floor(latToGy(n, z)); y1 = Math.ceil(latToGy(s, z));
      const tiles = (Math.floor(x1 / TILE) - Math.floor(x0 / TILE) + 1) * (Math.floor(y1 / TILE) - Math.floor(y0 / TILE) + 1);
      if (tiles <= maxTiles || z === 0) break;
      z--;
    }
    const nT = 2 ** z;
    let max = -Infinity, min = Infinity, maxAt = null, minAt = null;
    const jobs = [];
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) {
      for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
        jobs.push(this.getTile(z, mod(tx, nT), clamp(ty, 0, nT - 1)).then((t) => {
          const px0 = Math.max(x0 - tx * TILE, 0), px1 = Math.min(x1 - tx * TILE, TILE - 1);
          const py0 = Math.max(y0 - ty * TILE, 0), py1 = Math.min(y1 - ty * TILE, TILE - 1);
          for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
            const v = t[py * TILE + px];
            if (v > max) { max = v; maxAt = [tx * TILE + px, ty * TILE + py]; }
            if (v < min) { min = v; minAt = [tx * TILE + px, ty * TILE + py]; }
          }
        }));
      }
    }
    await Promise.all(jobs);
    const toLL = ([gx, gy]) => {
      const W = TILE * nT;
      const lon = ((gx + 0.5) / W) * 360 - 180;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (gy + 0.5)) / W))) * 180) / Math.PI;
      return [lon, lat];
    };
    return { z, max, min, maxAt: maxAt && toLL(maxAt), minAt: minAt && toLL(minAt), res: metersPerPixel((s + n) / 2, z) };
  }

  /** Amostra uma lista de pontos [lon, lat] no zoom z (bilinear, atravessando tiles). */
  async sampleMany(points, z) {
    z = clamp(Math.round(z), 0, this.maxZoom);
    const n = 2 ** z, maxG = n * TILE - 1;
    const need = new Map();
    const coords = new Float64Array(points.length * 2);
    points.forEach(([lon, lat], i) => {
      const gx = lonToGx(lon, z) - 0.5, gy = clamp(latToGy(lat, z) - 0.5, 0, maxG);
      coords[i * 2] = gx; coords[i * 2 + 1] = gy;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      for (const xx of [x0, x0 + 1]) for (const yy of [y0, Math.min(y0 + 1, maxG)]) {
        const tx = mod(Math.floor(xx / TILE), n), ty = yy >> 8;
        const k = ty * n + tx;
        if (!need.has(k)) need.set(k, [tx, ty]);
      }
    });
    const tiles = new Map();
    await Promise.all([...need].map(async ([k, [tx, ty]]) => tiles.set(k, await this.getTile(z, tx, ty))));
    const px = (x, y) => {
      const tx = mod(Math.floor(x / TILE), n), ty = y >> 8;
      return tiles.get(ty * n + tx)[(y & 255) * TILE + mod(x, TILE)];
    };
    const out = new Float32Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const gx = coords[i * 2], gy = coords[i * 2 + 1];
      const x0 = Math.floor(gx), y0 = Math.floor(gy), y1 = Math.min(y0 + 1, maxG);
      const fx = gx - x0, fy = gy - y0;
      const top = px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx;
      const bot = px(x0, y1) * (1 - fx) + px(x0 + 1, y1) * fx;
      out[i] = top * (1 - fy) + bot * fy;
      if (this.patches.length) {
        const [lon, lat] = points[i];
        for (const p of this.patches) {
          const v = samplePatch(p, lon, lat);
          if (!Number.isNaN(v)) { out[i] = v; break; }
        }
      }
    }
    return out;
  }

  /** Amostra síncrona usando apenas o que já está em cache (tile mais detalhado disponível). */
  sampleCached(lon, lat, maxZ = this.maxZoom) {
    for (const p of this.patches) {
      const v = samplePatch(p, lon, lat);
      if (!Number.isNaN(v)) return { h: v, z: null, patch: p };
    }
    for (let z = Math.min(maxZ, this.maxZoom); z >= 0; z--) {
      const n = 2 ** z;
      const gx = lonToGx(lon, z) - 0.5, gy = clamp(latToGy(lat, z) - 0.5, 0, n * TILE - 1);
      const tx = mod(Math.floor((gx + 0.5) / TILE), n), ty = Math.floor((gy + 0.5) / TILE);
      const t = this.cache.get(this._key(z, tx, ty));
      if (!t) continue;
      const lx = clamp(gx - tx * TILE, 0, TILE - 1), ly = clamp(gy - ty * TILE, 0, TILE - 1);
      const x0 = Math.floor(lx), y0 = Math.floor(ly);
      const x1 = Math.min(x0 + 1, TILE - 1), y1 = Math.min(y0 + 1, TILE - 1);
      const fx = lx - x0, fy = ly - y0;
      const h = (t[y0 * TILE + x0] * (1 - fx) + t[y0 * TILE + x1] * fx) * (1 - fy)
        + (t[y1 * TILE + x0] * (1 - fx) + t[y1 * TILE + x1] * fx) * fy;
      return { h, z };
    }
    return null;
  }

  addPatch(patch) {
    patch.id = patch.id || `p${Date.now()}`;
    this.patches.push(patch);
    this.version++;
    return patch;
  }

  removePatch(id) {
    this.patches = this.patches.filter((p) => p.id !== id);
    this.version++;
  }
}

/** Patch: { west, south, east, north, cols, rows, resX, resY, data: Float32Array, nodata } */
export function samplePatch(p, lon, lat) {
  if (lon < p.west || lon > p.east || lat < p.south || lat > p.north) return NaN;
  const fx = clamp((lon - p.west) / p.resX - 0.5, 0, p.cols - 1);
  const fy = clamp((p.north - lat) / p.resY - 0.5, 0, p.rows - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, p.cols - 1), y1 = Math.min(y0 + 1, p.rows - 1);
  const d = p.data, nd = p.nodata;
  const a = d[y0 * p.cols + x0], b = d[y0 * p.cols + x1], c = d[y1 * p.cols + x0], e = d[y1 * p.cols + x1];
  if (a === nd || b === nd || c === nd || e === nd || Number.isNaN(a + b + c + e)) return NaN;
  const tx = fx - x0, ty = fy - y0;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
}

// createImageBitmap com opções pode falhar em WebKits antigos; nesse caso usa <img>.
async function decodeImage(blob) {
  try {
    return await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
