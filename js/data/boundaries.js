// Divisão territorial: países e estados (Natural Earth, mundo) e municípios (IBGE, só Brasil).
// Os dados vêm embutidos no app já simplificados (web/data/geo/<conjunto>.json, gerados pelo geodata.py) e são
// desenhados pelo VectorImageryProvider, drapeados sobre o relevo exagerado.

import { loadGeo } from '../platform.js';

const cache = new Map();

async function load(name) {
  if (!cache.has(name)) {
    cache.set(name, loadGeo(name).then((d) => d.lines).catch((e) => { cache.delete(name); throw e; }));
  }
  return cache.get(name);
}

// Estilo das linhas por mapa base (claro sobre relevo/satélite, cinza sobre o "Padrão").
const STYLES = {
  relief: {
    countries: { color: 'rgba(255,255,255,0.95)', halo: 'rgba(0,0,0,0.45)' },
    states: { color: 'rgba(255,255,255,0.75)', halo: 'rgba(0,0,0,0.3)', dash: [5, 4] },
    municipios: { color: 'rgba(255,255,255,0.55)' },
  },
  satellite: {
    countries: { color: 'rgba(255,236,150,0.95)', halo: 'rgba(0,0,0,0.5)' },
    states: { color: 'rgba(255,255,255,0.8)', halo: 'rgba(0,0,0,0.35)', dash: [5, 4] },
    municipios: { color: 'rgba(255,255,255,0.55)' },
  },
  standard: {
    countries: { color: 'rgba(110,110,120,0.95)', halo: 'rgba(255,255,255,0.6)' },
    states: { color: 'rgba(140,140,150,0.85)', dash: [5, 4] },
    municipios: { color: 'rgba(160,160,170,0.7)' },
  },
};

// Níveis da quadtree geográfica (≈ altitude da câmera): municípios só de perto.
const LEVELS = {
  countries: { minLevel: 0, width: (l) => (l < 4 ? 1.3 : l < 8 ? 1.8 : 2.4) },
  states: { minLevel: 2, width: (l) => (l < 5 ? 0.8 : l < 9 ? 1.2 : 1.6) },
  municipios: { minLevel: 7, width: (l) => (l < 10 ? 0.8 : 1.2) },
};

/**
 * @param {{countries:boolean, states:boolean, municipalities:boolean}} opts
 * @param {'relief'|'satellite'|'standard'} baseMode
 * @returns {Promise<Array>} features para o VectorImageryProvider
 */
export async function loadBoundaryFeatures(opts, baseMode) {
  const style = STYLES[baseMode] || STYLES.relief;
  const kinds = [];
  // ordem de desenho: municípios por baixo, países por cima
  if (opts.municipalities) kinds.push('municipios');
  if (opts.states) kinds.push('states');
  if (opts.countries) kinds.push('countries');
  const out = [];
  for (const kind of kinds) {
    const lines = await load(kind);
    const st = style[kind], lv = LEVELS[kind];
    for (const flat of lines) out.push({ flat, ...st, ...lv });
  }
  return out;
}
