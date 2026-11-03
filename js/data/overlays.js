// Camadas geológicas vetoriais. Cada overlay é um "loader" assíncrono que devolve features
// {coords, color, width, dash?, halo?}. Para adicionar novos dados (ex.: USGS Quaternary
// Fault and Fold Database, isócronas do fundo oceânico, reconstruções de placas por idade),
// basta registrar um novo loader aqui — a interface cria o toggle automaticamente.

import { CONFIG } from '../config.js';

// Traço APROXIMADO (simplificado, ~15 vértices) da Falha de San Andreas, de Cabo Mendocino
// ao Mar de Salton. Ilustrativo — para uso científico, substitua pela base do USGS.
const SAN_ANDREAS_TRACE = [
  [-124.35, 40.28], [-123.95, 39.8], [-123.7, 38.95], [-123.1, 38.35], [-122.8, 37.95],
  [-122.52, 37.66], [-122.2, 37.3], [-121.75, 36.95], [-121.38, 36.78], [-120.9, 36.3],
  [-120.43, 35.9], [-120.1, 35.55], [-119.8, 35.2], [-119.45, 34.95], [-118.9, 34.82],
  [-118.45, 34.65], [-118.1, 34.52], [-117.65, 34.35], [-117.3, 34.22], [-116.9, 34.0],
  [-116.5, 33.9], [-116.2, 33.72], [-115.95, 33.52], [-115.72, 33.35],
];

// Outras falhas importantes do sistema (também aproximadas).
const RELATED_FAULTS = {
  'San Jacinto': [[-117.45, 34.3], [-117.0, 33.9], [-116.6, 33.55], [-116.2, 33.2], [-115.9, 32.9]],
  'Hayward': [[-122.55, 38.1], [-122.25, 37.85], [-122.05, 37.6], [-121.85, 37.4]],
  'Garlock': [[-118.9, 34.85], [-118.4, 35.1], [-117.9, 35.3], [-117.3, 35.5], [-116.6, 35.6]],
};

async function loadSanAndreas() {
  const features = [{ coords: SAN_ANDREAS_TRACE, color: '#ff2d55', width: 3, halo: 'rgba(0,0,0,0.55)' }];
  for (const coords of Object.values(RELATED_FAULTS)) {
    features.push({ coords, color: '#ff8fa8', width: 2, dash: [6, 4], halo: 'rgba(0,0,0,0.4)' });
  }
  return features;
}

async function loadPlates() {
  const resp = await fetch(CONFIG.platesUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const gj = await resp.json();
  const colorByType = { subduction: '#ffffff', ridge: '#fff27a', transform: '#ff5ad1' };
  const out = [];
  for (const f of gj.features) {
    const g = f.geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    const name = (f.properties?.Type || f.properties?.type || '').toLowerCase();
    const color = colorByType[name] || '#fff6b0';
    for (const coords of lines) out.push({ coords, color, width: 1.6, halo: 'rgba(0,0,0,0.5)' });
  }
  return out;
}

export const OVERLAYS = [
  { id: 'sanAndreas', name: 'Falha de San Andreas (aprox.)', load: loadSanAndreas, credit: 'Traço aproximado da Falha de San Andreas (ilustrativo)' },
  { id: 'plates', name: 'Limites de placas (PB2002)', load: loadPlates, credit: 'Limites de placas: Bird (2002), PB2002 via github.com/fraxen/tectonicplates' },
];
