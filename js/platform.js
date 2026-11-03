// Substitui o antigo servidor Python (server.py): tudo que era /api/* passa por aqui.
// - config / geo: dados estáticos embutidos no app
// - geocode / opentopo: chamadas diretas às APIs. No app iOS usa o HTTP nativo do Capacitor
//   (sem CORS e com User-Agent próprio); no navegador cai para fetch().
import { OPENTOPOGRAPHY_API_KEY } from './secrets.js';

const USER_AGENT = 'Terra3D-iOS/1.0 (visualizador de relevo; app pessoal)';

// Área máxima por requisição (km²) da API globaldem do OpenTopography.
export const OPENTOPO_DATASETS = {
  COP30: 450_000,
  COP90: 4_050_000,
  NASADEM: 450_000,
  SRTMGL1: 450_000,
  SRTMGL1_E: 450_000,
  SRTMGL3: 4_050_000,
  AW3D30: 450_000,
  AW3D30_E: 450_000,
  SRTM15Plus: 125_000_000,
  GEBCOIceTopo: 125_000_000,
  GEBCOSubIceTopo: 125_000_000,
};

export const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const nativeHttp = () => (isNative() ? window.Capacitor.Plugins?.CapacitorHttp : null);

export function getConfig() {
  return {
    openTopography: !!OPENTOPOGRAPHY_API_KEY,
    openTopographyDatasets: OPENTOPO_DATASETS,
    cesiumIonToken: null,
  };
}

// ---------------------------------------------------------------- dados embutidos
export async function loadGeo(name) {
  const r = await fetch(`data/geo/${name}.json`);
  if (!r.ok) throw new Error(`HTTP ${r.status} ao ler ${name}`);
  return r.json();
}

// ---------------------------------------------------------------- busca (Nominatim)
const geocodeCache = new Map();
let geocodeLast = 0;
let geocodeChain = Promise.resolve();

export function geocode(text) {
  const q = text.trim();
  if (!q) return Promise.resolve([]);
  const key = q.toLowerCase();
  if (geocodeCache.has(key)) return Promise.resolve(geocodeCache.get(key));

  // política do Nominatim: no máximo 1 requisição por segundo
  const job = geocodeChain.then(async () => {
    const wait = 1050 - (Date.now() - geocodeLast);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    geocodeLast = Date.now();
    const params = new URLSearchParams({
      q, format: 'jsonv2', limit: '8', 'accept-language': 'pt-BR,en',
      polygon_geojson: '1', polygon_threshold: '0.0005',
    });
    const url = `https://nominatim.openstreetmap.org/search?${params}`;
    const http = nativeHttp();
    let data;
    if (http) {
      const r = await http.get({ url, headers: { 'User-Agent': USER_AGENT }, responseType: 'json', connectTimeout: 15000, readTimeout: 15000 });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    } else {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = await r.json();
    }
    geocodeCache.set(key, data);
    return data;
  });
  geocodeChain = job.catch(() => {});
  return job;
}

// ---------------------------------------------------------------- DEM HD (OpenTopography)
const opentopoCache = new Map();

export function bboxAreaKm2(s, n, w, e) {
  const R = 6371.0088, D2R = Math.PI / 180;
  return Math.abs(R * R * (e - w) * D2R * (Math.sin(n * D2R) - Math.sin(s * D2R)));
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function isTiff(buf) {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  return (b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d);
}

function errorText(buf) {
  try { return new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(300, buf.byteLength))); } catch { return ''; }
}

export async function fetchOpenTopo({ demtype, south, north, west, east }) {
  if (!OPENTOPOGRAPHY_API_KEY) throw new Error('chave do OpenTopography não configurada neste build');
  if (!(demtype in OPENTOPO_DATASETS)) throw new Error(`dataset não suportado: ${demtype}`);
  if (!(south >= -90 && south < north && north <= 90 && west >= -180 && west < east && east <= 180)) {
    throw new Error('retângulo inválido');
  }
  const area = bboxAreaKm2(south, north, west, east);
  if (area > OPENTOPO_DATASETS[demtype]) throw new Error(`área de ${Math.round(area)} km² excede o limite de ${demtype}`);

  const params = new URLSearchParams({
    demtype, south: south.toFixed(5), north: north.toFixed(5), west: west.toFixed(5), east: east.toFixed(5),
    outputFormat: 'GTiff',
  });
  const cacheKey = params.toString();
  if (opentopoCache.has(cacheKey)) return opentopoCache.get(cacheKey);
  params.set('API_Key', OPENTOPOGRAPHY_API_KEY);
  const url = `https://portal.opentopography.org/API/globaldem?${params}`;

  let buf;
  const http = nativeHttp();
  if (http) {
    const r = await http.get({ url, headers: { 'User-Agent': USER_AGENT }, responseType: 'arraybuffer', connectTimeout: 30000, readTimeout: 180000 });
    buf = typeof r.data === 'string' ? base64ToArrayBuffer(r.data) : r.data;
    if (r.status !== 200) throw new Error(`OpenTopography HTTP ${r.status}: ${errorText(buf)}`);
  } else {
    const r = await fetch(url);
    buf = await r.arrayBuffer();
    if (!r.ok) throw new Error(`OpenTopography HTTP ${r.status}: ${errorText(buf)}`);
  }
  if (!isTiff(buf)) throw new Error(`resposta não é GeoTIFF: ${errorText(buf)}`);
  // guarda poucos arquivos para não estourar a memória do iPhone
  if (opentopoCache.size >= 3) opentopoCache.delete(opentopoCache.keys().next().value);
  opentopoCache.set(cacheKey, buf);
  return buf;
}
