// Integração híbrida com o OpenTopography: baixa um DEM de alta resolução (GeoTIFF) para a
// região visível direto da API (platform.js; a chave vem embutida no build do app) e o
// registra como "patch" na ElevationSource, que passa a ter prioridade sobre os tiles base
// tanto na malha 3D quanto na textura, perfis, estatísticas e leitura do cursor.
import { CONFIG } from '../config.js';
import { n0 } from './format.js';
import { getConfig, fetchOpenTopo } from '../platform.js';

const DATASET_INFO = {
  COP30: 'Copernicus GLO-30 (~30 m) — melhor DEM global de terra',
  NASADEM: 'NASADEM (~30 m) — SRTM reprocessado',
  SRTMGL1: 'SRTM GL1 (~30 m)',
  SRTMGL1_E: 'SRTM GL1 elipsoidal (~30 m)',
  SRTMGL3: 'SRTM GL3 (~90 m)',
  AW3D30: 'ALOS World 3D (~30 m)',
  AW3D30_E: 'ALOS World 3D elipsoidal (~30 m)',
  COP90: 'Copernicus GLO-90 (~90 m)',
  SRTM15Plus: 'SRTM15+ (~450 m) — terra + batimetria',
  GEBCOIceTopo: 'GEBCO 2023 (~450 m) — batimetria global',
  GEBCOSubIceTopo: 'GEBCO sub-gelo (~450 m)',
};

export async function initHDPatches({ source, getViewRect, onChanged, toast, setAnnotation }) {
  const sel = document.getElementById('otDataset');
  const btn = document.getElementById('otLoad');
  const status = document.getElementById('otStatus');
  const list = document.getElementById('patchList');

  let cfg = { openTopography: false, openTopographyDatasets: {} };
  try { cfg = getConfig(); } catch { /* sem configuração */ }

  const datasets = Object.keys(cfg.openTopographyDatasets || DATASET_INFO);
  sel.innerHTML = datasets.map((d) => `<option value="${d}" title="${DATASET_INFO[d] || ''}">${d}</option>`).join('');
  sel.value = 'COP30';

  if (!cfg.openTopography) {
    btn.disabled = true;
    status.innerHTML = 'Indisponível neste build: falta a chave <b>OPENTOPOGRAPHY_API_KEY</b> (secret do GitHub ou arquivo <b>.env</b>).';
  } else {
    status.textContent = DATASET_INFO[sel.value];
  }
  sel.onchange = () => { status.textContent = DATASET_INFO[sel.value] || ''; };

  const renderList = () => {
    list.innerHTML = source.patches.map((p) => `<li><span>${p.name}</span><span>${p.cols}×${p.rows} <button class="linklike" data-id="${p.id}">remover</button></span></li>`).join('');
    list.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { source.removePatch(b.dataset.id); renderList(); outline(); onChanged(); };
    });
  };
  const outline = () => setAnnotation('patches', source.patches.length ? source.patches.map((p) => ({
    coords: [[p.west, p.south], [p.east, p.south], [p.east, p.north], [p.west, p.north], [p.west, p.south]],
    color: '#b6ff8a', width: 1.5, dash: [3, 4],
  })) : null);

  btn.onclick = async () => {
    const demtype = sel.value;
    let [w, s, e, n] = getViewRect();
    if (e > 180) { toast('A vista cruza o antimeridiano; mova a câmera.'); return; }
    // limita ao retângulo realmente útil
    const limit = cfg.openTopographyDatasets[demtype];
    const R = 6371.0088, D2R = Math.PI / 180;
    const area = Math.abs(R * R * (e - w) * D2R * (Math.sin(n * D2R) - Math.sin(s * D2R)));
    if (area > limit) {
      toast(`A vista cobre ${n0(area)} km²; o limite do ${demtype} é ${n0(limit)} km². Aproxime a câmera.`);
      return;
    }
    btn.disabled = true;
    status.textContent = `Baixando ${demtype} (${n0(area)} km²)…`;
    try {
      const buf = await fetchOpenTopo({ demtype, south: s, north: n, west: w, east: e });
      status.textContent = 'Decodificando GeoTIFF…';
      const GeoTIFF = await import(CONFIG.geotiffModule);
      const tiff = await GeoTIFF.fromArrayBuffer(buf);
      const img = await tiff.getImage();
      const [bw, bs, be, bn] = img.getBoundingBox();
      const [rx, ry] = img.getResolution();
      const raster = await img.readRasters({ interleave: true, samples: [0] });
      const data = raster instanceof Float32Array ? raster : Float32Array.from(raster);
      const nd = img.getGDALNoData();
      const patch = source.addPatch({
        name: `${demtype} · ${(buf.byteLength / 1e6).toFixed(1)} MB`,
        west: bw, south: bs, east: be, north: bn,
        cols: img.getWidth(), rows: img.getHeight(),
        resX: Math.abs(rx), resY: Math.abs(ry),
        data, nodata: nd === null || nd === undefined ? -32768 : nd,
      });
      status.textContent = `${demtype} carregado: ${patch.cols}×${patch.rows} px (~${n0(Math.abs(rx) * 111320)} m/px).`;
      renderList();
      outline();
      onChanged();
    } catch (err) {
      console.error(err);
      status.textContent = `Erro: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  };

  return cfg;
}
