// Terra 3D — ponto de entrada. Conecta estado, globo(s) Cesium, ferramentas e interface.
import { CONFIG, IS_MOBILE, EXAG_PRESETS, EXAG_MIN, EXAG_MAX, SEA_SCENARIOS } from './config.js';
import { isNative } from './platform.js';
import { createStore } from './state.js';
import { ElevationSource, metersPerPixel } from './data/ElevationSource.js';
import { PLACES } from './data/places.js';
import { OVERLAYS } from './data/overlays.js';
import { WorkerPool } from './workers/WorkerPool.js';
import { GlobeView } from './cesium/GlobeView.js';
import { CameraControls } from './cesium/CameraControls.js';
import { PinchZoom } from './cesium/PinchZoom.js';
import { GlobeSpin } from './cesium/GlobeSpin.js';
import { PALETTES, cssColorAt } from './render/palettes.js';
import { initSearch } from './ui/search.js';
import { PlaceLabels } from './ui/placeLabels.js';
import { loadBoundaryFeatures } from './data/boundaries.js';
import { ProfileTool } from './ui/profileTool.js';
import { AnalysisPanel } from './ui/analysisPanel.js';
import { initHDPatches } from './ui/hdPatches.js';
import { renderScale } from './ui/scale.js';
import { HELP_HTML, HELP_TOUCH_HTML, ABOUT_HTML } from './ui/help.js';
import * as fmt from './ui/format.js';
import { initPwa } from './ui/install.js';
import { PADRAO } from './padrao.js';

const C = Cesium;
const $ = (id) => document.getElementById(id);

// No celular o painel vira uma gaveta inferior, começa fechada e o app guarda a última vista.
if (IS_MOBILE) document.body.classList.add('mobile', 'side-hidden');
if (IS_MOBILE) $('searchInput').placeholder = 'Buscar lugar ou lat, lon';
if (isNative()) document.body.classList.add('native');

// ============================================================ estado
const state = createStore({
  exaggeration: 50,
  seaLevel: 0,
  palette: 'video',
  hillshade: 0.85,
  zFactor: 1.5,
  sunAzimuth: 315,
  sunAltitude: 40,
  multi: true,
  followExag: false,
  contour: 0,
  bandOn: false,
  bandMin: 3000,
  bandMax: 9000,
  waterMode: 'none',
  flatSea: false,
  coast: false,
  baseMode: 'relief', // 'relief' | 'satellite' | 'standard'
  overlayHillshade: true, // sombreamento sobre Satélite/Padrão
  boundaries: { countries: true, states: true, municipalities: false },
  places: true,
  overlays: { sanAndreas: true, plates: false },
  pois: true,
  atmosphere: false,
  dayNight: false,
  dayNightOffset: 0, // horas em relação a agora
  terrainSource: 'terrarium',
  split: false,
  splitExag: 1,
  ...PADRAO.estado, // como o app abre: web/js/padrao.js
});
readUrlState();

function styleOf(s) {
  return {
    palette: s.palette, seaLevel: s.seaLevel, hillshade: s.hillshade, zFactor: s.zFactor,
    sunAzimuth: s.sunAzimuth, sunAltitude: s.sunAltitude, multi: s.multi, followExag: s.followExag,
    exaggeration: s.followExag ? s.exaggeration : 1, contour: s.contour,
    bandOn: s.bandOn, bandMin: s.bandMin, bandMax: s.bandMax, waterMode: s.waterMode, coast: s.coast,
    overlayHillshade: s.overlayHillshade && s.baseMode === 'standard',
  };
}

// ============================================================ dados + globo
const source = new ElevationSource({
  urls: CONFIG.terrariumUrls,
  maxZoom: CONFIG.terrariumMaxZoom,
  cacheSize: CONFIG.elevationCacheTiles,
  concurrency: CONFIG.fetchConcurrency,
});
const pool = new WorkerPool(new URL('./workers/shade.worker.js', import.meta.url), Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1)));

const main = new GlobeView($('viewMain'), { source, pool, style: styleOf(state.get()), baseMode: state.get().baseMode, creditContainer: $('credits') });
new PinchZoom(main, { canDoubleTap: () => !profile?.active }); // sem duplo toque durante o perfil A→B
new GlobeSpin(main); // giro de longe com velocidade constante (sem disparar perto dos polos)
const views = [main];
let split = null;
window.terra = { state, source, main, views, C }; // útil para depuração no console

const cam = new CameraControls(main, { source, getExag: () => state.get().exaggeration });
window.terra.cam = cam;
const placeLabels = new PlaceLabels(main, { source, getExag: () => state.get().exaggeration });
window.terra.placeLabels = placeLabels;
main.setExaggeration(state.get().exaggeration);
// vista inicial definida em web/js/padrao.js (também usada pelo botão ⌂)
function homeView(duration = 0) {
  const c = PADRAO.camera;
  const view = {
    destination: C.Cartesian3.fromDegrees(c.lon, c.lat, c.alturaKm * 1000),
    orientation: { heading: C.Math.toRadians(c.rumo), pitch: C.Math.toRadians(c.inclinacao), roll: 0 },
  };
  if (duration) main.camera.flyTo({ ...view, duration });
  else main.camera.setView(view);
}
if (!applyUrlCamera()) homeView();

let ionToken = null;
let profile = null; // ProfileTool (criado mais abaixo)
const dragging = new Map(); // barra → instante do último arrasto (ver setSlider)
let pois = [];
const overlayCache = new Map();
const annotations = new Map();

function toast(msg, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

// ============================================================ reações ao estado
let lastStyleKey = JSON.stringify(styleOf(state.get()));
let terrainTimer = null;

state.subscribe((s, prev) => {
  // exagero: só GPU, instantâneo
  if (s.exaggeration !== prev.exaggeration) {
    main.setExaggeration(s.exaggeration);
    keepCameraAboveGround(s.exaggeration, prev.exaggeration);
    updateExagUI();
  }
  // estilo do relevo: recolore (crossfade)
  const key = JSON.stringify(styleOf(s));
  if (key !== lastStyleKey) {
    lastStyleKey = key;
    const st = styleOf(s);
    views.forEach((v) => v.setStyle(st));
    drawLegend();
  }
  // terreno (água plana altera a malha)
  if (s.flatSea !== prev.flatSea || (s.flatSea && s.seaLevel !== prev.seaLevel) || s.terrainSource !== prev.terrainSource) {
    clearTimeout(terrainTimer);
    terrainTimer = setTimeout(applyTerrain, 350);
  }
  if (s.baseMode !== prev.baseMode) applyBaseMode();
  if (s.overlays !== prev.overlays || s.atmosphere !== prev.atmosphere) applyLayers();
  if (s.dayNight !== prev.dayNight || s.dayNightOffset !== prev.dayNightOffset) applyDayNight();
  if (s.boundaries !== prev.boundaries || s.baseMode !== prev.baseMode) applyBoundaries();
  if (s.places !== prev.places) placeLabels.setEnabled(s.places).catch((e) => toast(`Falha ao carregar lugares: ${e.message}`));
  if (s.exaggeration !== prev.exaggeration) placeLabels.schedule(60);
  if (s.pois !== prev.pois) pois.forEach((e) => { e.show = s.pois; });
  if (s.seaLevel !== prev.seaLevel) updateSeaUI();
  syncControls(s);
  if (s.split !== prev.split || s.splitExag !== prev.splitExag) applySplit();
  if (s.palette !== prev.palette || s.seaLevel !== prev.seaLevel || s.exaggeration !== prev.exaggeration) profile?.draw();
  scheduleUrl();
});

// Ao mudar o exagero o relevo "estica" verticalmente em torno do nível do mar. Se a câmera está
// dentro da faixa vertical do relevo, ela é esticada junto (mesma posição relativa ao terreno),
// evitando ficar enterrada entre picos que crescem. Longe (visão global) nada muda.
function keepCameraAboveGround(ex, prevEx) {
  const cam3 = main.camera;
  const c = cam3.positionCartographic;
  let h = c.height;
  if ($('camFollow').checked && prevEx > 0 && Math.abs(h) < 12000 * Math.max(prevEx, 1)) h *= ex / prevEx;
  const res = source.sampleCached(C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude));
  if (res) {
    const ground = res.h * ex;
    h = Math.max(h, ground + Math.max(300, Math.abs(res.h) * ex * 0.08));
  }
  if (Math.abs(h - c.height) < 1) return;
  cam3.setView({
    destination: C.Cartesian3.fromRadians(c.longitude, c.latitude, h),
    orientation: { heading: cam3.heading, pitch: cam3.pitch, roll: cam3.roll },
  });
}

function applyTerrain() {
  const s = state.get();
  const floor = s.flatSea ? s.seaLevel : null;
  views.forEach((v) => v.setTerrain(s.terrainSource, floor, ionToken));
}

async function applyLayers() {
  const s = state.get();
  for (const v of views) {
    v.setAtmosphere(s.atmosphere);
  }
  applyDayNight();
  for (const ov of OVERLAYS) {
    const on = s.overlays[ov.id];
    let feats = null;
    if (on) {
      if (!overlayCache.has(ov.id)) {
        overlayCache.set(ov.id, ov.load().catch((e) => { toast(`Falha ao carregar "${ov.name}": ${e.message}`); overlayCache.delete(ov.id); return null; }));
      }
      feats = await overlayCache.get(ov.id);
    }
    views.forEach((v) => v.setOverlay(ov.id, feats, ov.credit));
  }
  for (const [id, feats] of annotations) views.forEach((v) => v.setOverlay(`ann:${id}`, feats));
}

// ------------------------------------------------------------ mapa base e divisão territorial
function applyBaseMode() {
  const m = state.get().baseMode;
  views.forEach((v) => v.setBaseMode(m));
  placeLabels.setBaseMode(m);
  document.querySelectorAll('#baseModes .base-card').forEach((b) => b.classList.toggle('on', b.dataset.v === m));
  $('reliefOnly').classList.toggle('hidden', m !== 'relief');
  $('legend').classList.toggle('hidden', m !== 'relief');
  $('overlayShadeRow').classList.toggle('hidden', m !== 'standard');
}

let boundarySeq = 0;
async function applyBoundaries() {
  const s = state.get();
  const b = s.boundaries;
  const my = ++boundarySeq;
  if (!b.countries && !b.states && !b.municipalities) {
    views.forEach((v) => v.setOverlay('boundaries', null));
    return;
  }
  try {
    const feats = await loadBoundaryFeatures(b, s.baseMode);
    if (my !== boundarySeq) return;
    views.forEach((v) => v.setOverlay('boundaries', feats, 'Divisas: Natural Earth; municípios: IBGE'));
  } catch (e) {
    toast(`Falha ao carregar divisão territorial: ${e.message}`);
  }
}

function setAnnotation(id, feats) {
  annotations.set(id, feats);
  views.forEach((v) => v.setOverlay(`ann:${id}`, feats));
}

// ============================================================ exagero vertical
const LN_MAX = Math.log(EXAG_MAX / EXAG_MIN);
const exagToSlider = (v) => Math.round((Math.log(Math.max(EXAG_MIN, v) / EXAG_MIN) / LN_MAX) * 1000);
const sliderToExag = (t) => {
  const v = EXAG_MIN * Math.exp((t / 1000) * LN_MAX);
  return v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
};

let exagAnim = null;
function setExag(target, animate = $('exagSmooth').checked) {
  cancelAnimationFrame(exagAnim);
  const from = state.get().exaggeration;
  if (!animate || from === target) { state.set({ exaggeration: target }); return; }
  const t0 = performance.now(), dur = 900;
  // interpolação logarítmica: a transição "parece" uniforme entre 1× e 100×
  const a = Math.log(Math.max(from, 0.01)), b = Math.log(Math.max(target, 0.01));
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    state.set({ exaggeration: t >= 1 ? target : Math.exp(a + (b - a) * e) });
    if (t < 1) exagAnim = requestAnimationFrame(step);
  };
  exagAnim = requestAnimationFrame(step);
}

$('exagChips').innerHTML = EXAG_PRESETS.map((v) => `<button class="chip" data-v="${v}">${v}×</button>`).join('');
$('exagChips').onclick = (e) => { const b = e.target.closest('.chip'); if (b) setExag(Number(b.dataset.v)); };
$('exagSlider').oninput = (e) => { cancelAnimationFrame(exagAnim); state.set({ exaggeration: sliderToExag(Number(e.target.value)) }); };
$('qExag').oninput = (e) => { cancelAnimationFrame(exagAnim); markDrag(e.target); state.set({ exaggeration: sliderToExag(Number(e.target.value)) }); };

// Barras que o usuário está arrastando não são reposicionadas pelo estado (evita "pulos" de arredondamento).
function markDrag(el) { dragging.set(el, performance.now()); }
function setSlider(el, value) {
  if (document.activeElement === el || performance.now() - (dragging.get(el) || 0) < 500) return;
  el.value = value;
}

function updateExagUI() {
  const v = state.get().exaggeration;
  const label = v < 10 ? `${fmt.n1(v).replace(',0', '')}×` : `${fmt.n0(v)}×`;
  $('exagValue').textContent = label;
  $('hudExagValue').textContent = label;
  $('qExagV').textContent = label;
  setSlider($('qExag'), exagToSlider(v));
  if (document.activeElement !== $('exagSlider')) $('exagSlider').value = exagToSlider(v);
  document.querySelectorAll('#exagChips .chip').forEach((c) => c.classList.toggle('on', Math.abs(Number(c.dataset.v) - v) < 0.05));
  $('exagHint').innerHTML = `Everest: 8.849 m reais → <b>${fmt.meters(8849 * v)}</b> visuais · Fossa das Marianas: −10.935 m → <b>${fmt.meters(-10935 * v)}</b>`;
  $('splitTagL').textContent = `${label} (exagerado)`;
  renderScale($('scaleBody'), v);
}

// ============================================================ nível do mar
const seaToSlider = (v) => Math.sign(v) * Math.round(1000 * Math.pow(Math.min(Math.abs(v), 11000) / 11000, 1 / 2.2));
const sliderToSea = (t) => {
  const v = Math.sign(t) * 11000 * Math.pow(Math.abs(t) / 1000, 2.2);
  const a = Math.abs(v);
  const r = a < 100 ? 1 : a < 1000 ? 10 : 100;
  return Math.round(v / r) * r;
};
$('seaChips').innerHTML = SEA_SCENARIOS.map((s) => `<button class="chip" data-v="${s.value}" title="${s.info}">${s.label}</button>`).join('');
$('seaChips').onclick = (e) => { const b = e.target.closest('.chip'); if (b) state.set({ seaLevel: Number(b.dataset.v) }); };
$('seaSlider').oninput = (e) => state.set({ seaLevel: sliderToSea(Number(e.target.value)) });
$('qSea').oninput = (e) => { markDrag(e.target); state.set({ seaLevel: sliderToSea(Number(e.target.value)) }); };
$('seaInput').onchange = (e) => state.set({ seaLevel: Math.max(-11000, Math.min(9000, Number(e.target.value) || 0)) });

function applyDayNight() {
  const s = state.get();
  views.forEach((v) => v.setDayNight(s.dayNight, s.dayNightOffset));
  $('dnTimeRow').classList.toggle('hidden', !s.dayNight);
  $('dnTimeLabel').classList.toggle('hidden', !s.dayNight);
  $('qHourRow').classList.toggle('hidden', !s.dayNight);
  setSlider($('dnHour'), s.dayNightOffset);
  setSlider($('qHour'), s.dayNightOffset);
  updateDayNightLabel();
  updateQuickLayout();
}
// Mostra a hora UTC simulada e onde é meio-dia (longitude do ponto subsolar).
function updateDayNightLabel() {
  const s = state.get();
  if (!s.dayNight) return;
  const d = C.JulianDate.toDate(main.viewer.clock.currentTime);
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
  const off = s.dayNightOffset;
  const rel = off === 0 ? 'agora' : `${off > 0 ? '+' : '−'}${fmtHours(Math.abs(off))} em relação a agora`;
  let noon = 180 - (d.getUTCHours() + d.getUTCMinutes() / 60) * 15;
  if (noon < -180) noon += 360;
  $('qHourV').textContent = `${hh}:${mm} UTC`;
  $('dnTimeLabel').innerHTML = `<b>${hh}:${mm} UTC</b> (${rel}) · meio-dia em ${Math.abs(noon).toFixed(0)}° ${noon < 0 ? 'O' : 'L'}. Gire o globo para ver o lado noturno.`;
}
function fmtHours(h) { const m = Math.round(h * 60); return m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m / 60} h`; }
setInterval(updateDayNightLabel, 30000);

function updateSeaUI() {
  const v = state.get().seaLevel;
  $('seaBadge').textContent = fmt.meters(v, { sign: true });
  $('qSeaV').textContent = fmt.meters(v, { sign: true });
  setSlider($('qSea'), seaToSlider(v));
  if (document.activeElement !== $('seaSlider')) $('seaSlider').value = seaToSlider(v);
  if (document.activeElement !== $('seaInput')) $('seaInput').value = v;
  const sc = SEA_SCENARIOS.find((s) => s.value === v);
  document.querySelectorAll('#seaChips .chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.v) === v));
  $('seaInfo').innerHTML = `${sc ? `<b>${sc.info}</b><br>` : ''}Baseado na elevação <b>real</b> — independe do exagero vertical. As cores passam a ser relativas ao nível simulado.`;
}

// ============================================================ controles de estilo/camadas
// Mantém os controles coerentes quando o estado muda por código/URL (vínculo bidirecional).
const CHECKS = { multiLight: 'multi', followExag: 'followExag', flatSea: 'flatSea', coastLine: 'coast', bandOn: 'bandOn',
  poisOn: 'pois', atmoOn: 'atmosphere', dayNightOn: 'dayNight', splitOn: 'split', placesOn: 'places', overlayShade: 'overlayHillshade' };
function syncControls(s) {
  for (const [id, key] of Object.entries(CHECKS)) { const el = $(id); if (el && el.checked !== !!s[key]) el.checked = !!s[key]; }
  document.querySelectorAll('#waterMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.waterMode));
  if ($('palette').value !== s.palette) $('palette').value = s.palette;
  for (const k of ['countries', 'states', 'municipalities']) { const el = $(`bd_${k}`); if (el) el.checked = !!s.boundaries[k]; }
  $('bdOn').checked = s.boundaries.countries || s.boundaries.states || s.boundaries.municipalities;
  if ($('contour').value !== String(s.contour)) $('contour').value = String(s.contour);
}

function bindSeg(id, key) {
  const el = $(id);
  const sync = () => el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.get()[key]));
  el.onclick = (e) => { const b = e.target.closest('button'); if (b) { state.set({ [key]: b.dataset.v }); sync(); } };
  sync();
}
function bindCheck(id, key) {
  const el = $(id);
  el.checked = !!state.get()[key];
  el.onchange = () => state.set({ [key]: el.checked });
}
function bindRange(id, key, scale = 1) {
  const el = $(id);
  el.value = state.get()[key] * scale;
  el.oninput = () => state.set({ [key]: Number(el.value) / scale });
}

$('palette').innerHTML = Object.entries(PALETTES).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
$('palette').value = state.get().palette;
$('palette').onchange = (e) => state.set({ palette: e.target.value });
bindRange('hillshade', 'hillshade', 100);
bindRange('zFactor', 'zFactor', 100);
bindRange('sunAz', 'sunAzimuth');
bindRange('sunAlt', 'sunAltitude');
bindCheck('multiLight', 'multi');
bindCheck('followExag', 'followExag');
bindCheck('flatSea', 'flatSea');
bindCheck('coastLine', 'coast');
bindSeg('waterMode', 'waterMode');
$('contour').value = String(state.get().contour);
$('contour').onchange = (e) => state.set({ contour: Number(e.target.value) });
bindCheck('bandOn', 'bandOn');
$('bandMin').value = state.get().bandMin;
$('bandMax').value = state.get().bandMax;
$('bandMin').onchange = (e) => state.set({ bandMin: Number(e.target.value), bandOn: true });
$('bandMax').onchange = (e) => state.set({ bandMax: Number(e.target.value), bandOn: true });
const BANDS = [['> 3.000 m', 3000, 9000], ['> 1.000 m', 1000, 9000], ['0–500', 0, 500], ['500–1.000', 500, 1000], ['1.000–2.000', 1000, 2000], ['2.000–3.000', 2000, 3000], ['Fundo < −6.000', -11000, -6000]];
$('bandChips').innerHTML = BANDS.map(([l, a, b]) => `<button class="chip" data-a="${a}" data-b="${b}">${l}</button>`).join('');
$('bandChips').onclick = (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  state.set({ bandOn: true, bandMin: Number(b.dataset.a), bandMax: Number(b.dataset.b) });
  $('bandOn').checked = true; $('bandMin').value = b.dataset.a; $('bandMax').value = b.dataset.b;
};

bindCheck('placesOn', 'places');
bindCheck('overlayShade', 'overlayHillshade');
$('baseModes').onclick = (e) => { const b = e.target.closest('.base-card'); if (b) state.set({ baseMode: b.dataset.v }); };
for (const k of ['countries', 'states', 'municipalities']) {
  $(`bd_${k}`).checked = !!state.get().boundaries[k];
  $(`bd_${k}`).onchange = (e) => state.set({ boundaries: { ...state.get().boundaries, [k]: e.target.checked } });
}
$('bdOn').checked = Object.values(state.get().boundaries).some(Boolean);
$('bdOn').onchange = (e) => state.set({ boundaries: e.target.checked
  ? { countries: true, states: true, municipalities: state.get().boundaries.municipalities }
  : { countries: false, states: false, municipalities: false } });
bindCheck('poisOn', 'pois');
bindCheck('atmoOn', 'atmosphere');
bindCheck('dayNightOn', 'dayNight');
bindRange('dnHour', 'dayNightOffset');
$('dnHour').ondblclick = () => { $('dnHour').value = 0; state.set({ dayNightOffset: 0 }); };
$('dnHour').addEventListener('input', (e) => markDrag(e.target));
$('qHour').oninput = (e) => { markDrag(e.target); state.set({ dayNightOffset: Number(e.target.value) }); };
$('qHourV').onclick = () => { dragging.delete($('qHour')); dragging.delete($('dnHour')); state.set({ dayNightOffset: 0 }); };

// ============================================================ ajustes rápidos
// Painel escondido sobre o mapa com as barras de exagero, nível do mar e horário.
// Abre pelo botão 🎚️ da navegação ou tocando no indicador de exagero; lembra se ficou aberto.
function updateQuickLayout() {
  const open = !$('quick').classList.contains('hidden');
  document.body.classList.toggle('quick-open', open);
  document.body.style.setProperty('--quickH', `${open ? $('quick').offsetHeight : 0}px`);
}
function setQuick(open) {
  $('quick').classList.toggle('hidden', !open);
  $('navQuick').classList.toggle('on', open);
  try { localStorage.setItem('terra3d-quick', open ? '1' : '0'); } catch { /* ignore */ }
  updateQuickLayout();
}
$('navQuick').onclick = () => setQuick($('quick').classList.contains('hidden'));
$('hudExag').style.cursor = 'pointer';
$('hudExag').onclick = () => setQuick($('quick').classList.contains('hidden'));
{
  let saved = null;
  try { saved = PADRAO.lembrarUltimaVista ? localStorage.getItem('terra3d-quick') : null; } catch { /* ignore */ }
  setQuick(saved === null ? !!PADRAO.ajustesRapidosAbertos : saved === '1');
}
$('overlayToggles').innerHTML = OVERLAYS.map((o) => `<label class="check"><input type="checkbox" data-ov="${o.id}" ${state.get().overlays[o.id] ? 'checked' : ''}/> ${o.name}</label>`).join('');
$('overlayToggles').onchange = (e) => {
  const id = e.target.dataset.ov;
  if (id) state.set({ overlays: { ...state.get().overlays, [id]: e.target.checked } });
};
$('terrainSource').onchange = (e) => state.set({ terrainSource: e.target.value });

// seções recolhíveis
document.querySelectorAll('.collapsible h3').forEach((h) => { h.onclick = () => h.parentElement.classList.toggle('collapsed'); });
$('btnSidebar').onclick = () => document.body.classList.toggle('side-hidden');

// ============================================================ legenda
function drawLegend() {
  const s = state.get();
  const cv = $('legendCanvas');
  const ctx = cv.getContext('2d');
  const H = cv.height, top = 6500, bot = -9500;
  for (let y = 0; y < H; y++) {
    const e = top - ((top - bot) * y) / (H - 1);
    ctx.fillStyle = cssColorAt(s.palette, e);
    ctx.fillRect(0, y, cv.width, 1);
  }
  const labels = [6000, 4000, 2000, 0, -2000, -4000, -6000, -8000];
  $('legendLabels').innerHTML = labels.map((e) => {
    const y = ((top - e) / (top - bot)) * 100;
    const real = e + s.seaLevel;
    return `<span style="top:${y}%" class="${e === 0 ? 'sea' : ''}">${e === 0 && s.seaLevel ? '≈ mar ' : ''}${fmt.meters(real, { kmFrom: 1e9 })}</span>`;
  }).join('');
}

// ============================================================ pontos de interesse
pois = PLACES.filter((p) => p.poi).map((p) => {
  const e = main.viewer.entities.add({
    position: new C.CallbackProperty(() => C.Cartesian3.fromDegrees(p.lon, p.lat, p.elev * state.get().exaggeration + 200), false),
    point: { pixelSize: 7, color: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: 3e6,
      distanceDisplayCondition: new C.DistanceDisplayCondition(0, 1.4e7) },
    label: {
      text: `${p.name}\n${fmt.meters(p.elev)}`, font: '600 12px Inter, Segoe UI, sans-serif', fillColor: C.Color.WHITE,
      outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -24),
      verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: 3e6,
      distanceDisplayCondition: new C.DistanceDisplayCondition(0, 1.1e7), scaleByDistance: new C.NearFarScalar(2e5, 1, 1.2e7, 0.75),
    },
    show: state.get().pois,
  });
  e._place = p;
  return e;
});

// ============================================================ leitura sob o cursor
const readout = $('readout');
let mousePos = null, lastPick = 0, refineTimer = null, lastLL = null;
const handler = new C.ScreenSpaceEventHandler(main.scene.canvas);
handler.setInputAction((m) => { mousePos = m.endPosition; }, C.ScreenSpaceEventType.MOUSE_MOVE);
main.scene.canvas.addEventListener('mouseleave', () => { mousePos = null; readout.classList.add('hidden'); });
handler.setInputAction((e) => {
  if (profile.active) return;
  // toque: não há "cursor"; mostra a leitura do ponto tocado (tocar de novo perto esconde)
  if (IS_MOBILE && !document.body.classList.contains('side-hidden')) {
    document.body.classList.add('side-hidden'); // tocar no globo fecha a gaveta
    return;
  }
  if (IS_MOBILE) {
    const near = mousePos && Math.hypot(mousePos.x - e.position.x, mousePos.y - e.position.y) < 24;
    if (near && !readout.classList.contains('hidden')) { mousePos = null; readout.classList.add('hidden'); }
    else mousePos = C.Cartesian2.clone(e.position);
  }
  const picked = main.scene.pick(e.position);
  if (picked && picked.id && picked.id._place) cam.flyToPlace(picked.id._place);
}, C.ScreenSpaceEventType.LEFT_CLICK);

function renderReadout(ll, h, detail) {
  const s = state.get();
  const ex = s.exaggeration;
  const under = h < 0;
  const rel = h - s.seaLevel;
  readout.innerHTML = `
    <div><span class="k">Lat / Lon</span><span class="v">${fmt.coord(ll.lat, 'N', 'S')}</span> <span class="sub">${fmt.coord(ll.lon, 'L', 'O')}</span></div>
    <div><span class="k">${under ? 'Profundidade real' : 'Elevação real'}</span><span class="v big"><i class="sw" style="background:${cssColorAt(s.palette, rel)}"></i>${fmt.meters(under ? -h : h, { kmFrom: 1e9 })}</span></div>
    <div><span class="k">Exagero</span><span class="v">${fmt.exag(ex)}</span></div>
    <div><span class="k">Elevação visual</span><span class="v">${fmt.meters(h * ex, { kmFrom: 100000 })}</span></div>
    <div><span class="k">Nível do mar ${s.seaLevel ? `(${fmt.meters(s.seaLevel, { sign: true })})` : ''}</span><span class="v ${rel < 0 ? 'flood' : 'dry'}">${rel < 0 ? `submerso · ${fmt.meters(-rel)}` : `emerso · +${fmt.meters(rel)}`}</span></div>
    <div><span class="k">Fonte</span><span class="sub">${detail}</span></div>`;
  readout.classList.remove('hidden');
}

function sourceDetail(res, lat) {
  if (!res) return '—';
  if (res.patch) return `HD ${res.patch.name.split(' ')[0]}`;
  return `Terrarium z${res.z} · ~${fmt.distance(metersPerPixel(lat, res.z))}/px`;
}

main.scene.postRender.addEventListener(() => {
  // bússola e altitude da câmera
  $('compass').style.transform = `rotate(${-C.Math.toDegrees(main.camera.heading)}deg)`;
  const now = performance.now();
  if (now - lastPick < 70) return;
  lastPick = now;
  const h = main.camera.positionCartographic.height;
  $('camAlt').textContent = `Câmera: ${fmt.meters(h, { kmFrom: 5000 })} de altitude`;
  if (!mousePos) return;
  const ll = main.pickLonLat(mousePos);
  if (!ll) { readout.classList.add('hidden'); return; }
  const res = source.sampleCached(ll.lon, ll.lat);
  const elev = res ? res.h : ll.height / Math.max(state.get().exaggeration, 1e-3);
  renderReadout(ll, elev, sourceDetail(res, ll.lat));
  // refinamento: quando o cursor para, busca o tile de alta resolução do ponto
  if (!lastLL || Math.abs(lastLL.lon - ll.lon) > 1e-6 || Math.abs(lastLL.lat - ll.lat) > 1e-6) {
    lastLL = ll;
    clearTimeout(refineTimer);
    refineTimer = setTimeout(async () => {
      const z = 13;
      const [hr] = await source.sampleMany([[ll.lon, ll.lat]], z);
      if (lastLL === ll && mousePos) renderReadout(ll, hr, source.patches.length ? sourceDetail(source.sampleCached(ll.lon, ll.lat), ll.lat) : `Terrarium z${z} · ~${fmt.distance(metersPerPixel(ll.lat, z))}/px`);
    }, 300);
  }
});

// indicador de carregamento
main.scene.globe.tileLoadProgressEvent.addEventListener((n) => $('loading').classList.toggle('hidden', n === 0 && source.busy === 0));
source.onActivity = (n) => { if (n > 0) $('loading').classList.remove('hidden'); };

// ============================================================ navegação
const orbitBtn = $('navOrbit');
cam.onChange = () => orbitBtn.classList.toggle('on', !!cam.orbit);
$('navGlobal').onclick = () => cam.globalView();
$('navTop').onclick = () => cam.topView();
$('navOblique').onclick = () => cam.obliqueView();
$('navTiltUp').onclick = () => cam.tilt(12);
$('navTiltDown').onclick = () => cam.tilt(-12);
$('navNorth').onclick = () => cam.northUp();
$('navZoomIn').onclick = () => cam.zoom(0.5);
$('navZoomOut').onclick = () => cam.zoom(2);
$('navOrbit').onclick = () => cam.toggleOrbit();
$('navReset').onclick = () => {
  cam.stopOrbit();
  homeView(2.5);
};

// busca
initSearch({
  input: $('searchInput'),
  results: $('searchResults'),
  onPlace: (p) => cam.flyToPlace(p),
  onBBox: (w, s, e, n, r) => { highlightResult(r); cam.flyToBBox(w, s, e, n); },
  clearBtn: $('searchClear'),
  onClear: () => clearSearchHighlight(),
  onPoint: async (lon, lat) => {
    const [h] = await source.sampleMany([[lon, lat]], 10);
    cam.flyToPoint(lon, lat, h, 60000 + Math.max(0, h) * state.get().exaggeration * 2, 0, -35);
  },
});

// Destaque do lugar buscado: contorno oficial do OSM (município, estado, país…) + marcador com
// o nome. Visível em qualquer zoom e independente da camada de divisão territorial — longe
// demais para o contorno ser legível, o marcador continua indicando o lugar.
let searchPin = null;
function clearSearchHighlight() {
  setAnnotation('search', null);
  if (searchPin) { main.viewer.entities.remove(searchPin); searchPin = null; }
  placeLabels.schedule(0);
}
function highlightResult(r) {
  clearSearchHighlight();
  if (!r) return;
  const g = r.geojson;
  if (g && (g.type === 'Polygon' || g.type === 'MultiPolygon')) {
    const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
    setAnnotation('search', rings.map((ring) => ({
      coords: ring, color: '#ffde59', width: (l) => (l < 4 ? 2.2 : 3), halo: 'rgba(0,0,0,0.65)',
    })));
  }
  const lon = Number(r.lon), lat = Number(r.lat);
  const name = (r.name || r.display_name.split(',')[0]).trim();
  placeLabels.reserved = () => (searchPin ? [{ position: searchPin.position.getValue(C.JulianDate.now()), width: name.length * 9 + 20 }] : []);
  searchPin = main.viewer.entities.add({
    position: new C.CallbackProperty(() => {
      const h = source.sampleCached(lon, lat)?.h ?? 0;
      const ex = state.get().exaggeration;
      return C.Cartesian3.fromDegrees(lon, lat, Math.max(h, 0) * ex + 60 * Math.max(1, ex));
    }, false),
    point: { pixelSize: 11, color: C.Color.fromCssColorString('#ffde59'), outlineColor: C.Color.BLACK, outlineWidth: 2,
      disableDepthTestDistance: 1.5e6 },
    label: { text: name, font: '700 14px Inter, "Segoe UI", sans-serif', fillColor: C.Color.fromCssColorString('#ffde59'),
      outlineColor: C.Color.BLACK, outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: C.VerticalOrigin.BOTTOM, pixelOffset: new C.Cartesian2(0, -12), disableDepthTestDistance: 1.5e6 },
  });
}

// lista de lugares
{
  const cats = [...new Set(PLACES.map((p) => p.cat))];
  $('placeList').innerHTML = cats.map((c) => `<div class="place-cat">${c}</div>` + PLACES.filter((p) => p.cat === c)
    .map((p) => `<div class="place" data-id="${p.id}" title="${p.desc}"><span>${p.name}</span><small>${p.elev ? fmt.meters(p.elev) : ''}</small></div>`).join('')).join('');
  $('placeList').onclick = (e) => {
    const el = e.target.closest('.place');
    if (el) cam.flyToPlace(PLACES.find((p) => p.id === el.dataset.id));
  };
}

// ============================================================ ferramentas
profile = new ProfileTool({ view: main, source, getState: () => state.get(), toast });
profile.onToggle = (on) => $('toolProfile').classList.toggle('active', on);
$('toolProfile').onclick = () => (profile.panel.classList.contains('hidden') ? profile.start() : profile.close());

const viewRect = () => {
  const r = main.camera.computeViewRectangle();
  if (!r) return [-180, -85, 180, 85];
  let w = C.Math.toDegrees(r.west), e = C.Math.toDegrees(r.east);
  if (e < w) e += 360;
  return [w, C.Math.toDegrees(r.south), e, C.Math.toDegrees(r.north)];
};
const analysis = new AnalysisPanel({
  view: main, source, getState: () => state.get(), setAnnotation,
  flyToRect: ([w, s, e, n]) => cam.flyToBBox(w, s, e, n),
});
Object.assign(window.terra, { profile, analysis });
$('toolStats').onclick = () => analysis.openStats();
$('toolCompare').onclick = () => analysis.openCompare();

$('splitOn').checked = state.get().split;
$('splitOn').onchange = (e) => state.set({ split: e.target.checked });
$('splitExag').value = String(state.get().splitExag);
$('splitExag').onchange = (e) => state.set({ splitExag: Number(e.target.value) });

function applySplit() {
  const s = state.get();
  const on = s.split;
  $('viewSplit').classList.toggle('hidden', !on);
  $('splitTagL').classList.toggle('hidden', !on);
  $('splitTagR').classList.toggle('hidden', !on);
  if (on && !split) {
    split = new GlobeView($('viewSplit'), { source, pool, style: styleOf(s), baseMode: s.baseMode, interactive: false });
    views.push(split);
    split.setTerrain(s.terrainSource, s.flatSea ? s.seaLevel : null, ionToken);
    applyLayers();
    applyBoundaries();
    split._sync = () => {
      const c = main.camera;
      split.camera.setView({ destination: c.positionWC, orientation: { direction: c.directionWC, up: c.upWC } });
      split.camera.frustum.fov = c.frustum.fov;
    };
    main.scene.preRender.addEventListener(split._sync);
    split.scene.preRender.addEventListener(split._sync);
  } else if (!on && split) {
    main.scene.preRender.removeEventListener(split._sync);
    views.splice(views.indexOf(split), 1);
    split.destroy();
    split = null;
  }
  if (split) {
    split.setExaggeration(s.splitExag);
    $('splitTagR').textContent = `${s.splitExag}× ${s.splitExag === 1 ? '(real)' : ''}`;
  }
}

$('toolShot').onclick = () => {
  main.scene.render();
  main.scene.canvas.toBlob(async (b) => {
    const name = `terra3d-${Math.round(state.get().exaggeration)}x-${Date.now()}.png`;
    if (IS_MOBILE) {
      // iOS: "download" não funciona na WebView; usa a folha de compartilhar (Salvar imagem)
      const file = new File([b], name, { type: 'image/png' });
      try {
        if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      } catch (err) { if (err?.name === 'AbortError') return; }
      const url = URL.createObjectURL(b);
      modal(`<h2>Imagem capturada</h2><p class="hint">Toque e segure a imagem para salvar em Fotos.</p><img src="${url}" style="width:100%;border-radius:10px">`);
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `terra3d-${Math.round(state.get().exaggeration)}x-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
};
$('toolLink').onclick = async () => {
  writeUrl();
  if (isNative()) {
    // no app o endereço é interno (capacitor://); copia as coordenadas do centro da vista
    const c = main.camera.positionCartographic;
    const txt = `${C.Math.toDegrees(c.latitude).toFixed(5)}, ${C.Math.toDegrees(c.longitude).toFixed(5)}`;
    try { await navigator.clipboard.writeText(txt); toast(`Coordenadas copiadas: ${txt}`); } catch { toast(txt, 8000); }
    return;
  }
  try { await navigator.clipboard.writeText(location.href); toast('Link da vista copiado.'); }
  catch { toast(location.href, 8000); }
};

// ============================================================ modais
function modal(html) { $('modalBody').innerHTML = html; $('modal').classList.remove('hidden'); }
$('modalClose').onclick = () => $('modal').classList.add('hidden');
$('modal').onclick = (e) => { if (e.target === $('modal')) $('modal').classList.add('hidden'); };
$('btnHelp').onclick = () => modal(IS_MOBILE ? HELP_TOUCH_HTML : HELP_HTML);
$('btnAbout').onclick = () => modal(ABOUT_HTML);

// ============================================================ atalhos
window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  const ex = state.get().exaggeration;
  const presets = [1, ...EXAG_PRESETS.filter((v) => v > 1), 200];
  if (k === ']') setExag(presets.find((v) => v > ex + 0.01) ?? ex);
  else if (k === '[') setExag([...presets].reverse().find((v) => v < ex - 0.01) ?? ex);
  else if (k === 'g' || k === 'G') cam.globalView();
  else if (k === 't' || k === 'T') cam.topView();
  else if (k === 'o' || k === 'O') cam.obliqueView();
  else if (k === 'n' || k === 'N') cam.northUp();
  else if (k === 'r' || k === 'R') cam.toggleOrbit();
  else if (k === 'h' || k === 'H') document.body.classList.toggle('side-hidden');
  else if (k === 'p' || k === 'P') $('toolProfile').click();
  else if (k === 'PageUp') cam.tilt(10);
  else if (k === 'PageDown') cam.tilt(-10);
  else if (k === '+' || k === '=') cam.zoom(0.5);
  else if (k === '-') cam.zoom(2);
  else if (k === 'Home') $('navReset').click();
  else if (k === '?') $('btnHelp').click();
  else if (k === 'Escape') { $('modal').classList.add('hidden'); if (profile.active) profile.close(); }
  else if (k === '/') { e.preventDefault(); $('searchInput').focus(); }
  else return;
});

// ============================================================ URL compartilhável
let urlTimer = null;
function scheduleUrl() { clearTimeout(urlTimer); urlTimer = setTimeout(writeUrl, 600); }
main.camera.moveEnd.addEventListener(scheduleUrl);

function writeUrl() {
  const c = main.camera.positionCartographic;
  const s = state.get();
  const p = new URLSearchParams({
    cam: [C.Math.toDegrees(c.longitude).toFixed(5), C.Math.toDegrees(c.latitude).toFixed(5), Math.round(c.height),
      C.Math.toDegrees(main.camera.heading).toFixed(1), C.Math.toDegrees(main.camera.pitch).toFixed(1)].join(','),
    x: String(Math.round(s.exaggeration * 10) / 10),
    sea: String(s.seaLevel),
    pal: s.palette,
  });
  if (s.waterMode !== 'none') p.set('water', s.waterMode);
  if (s.baseMode !== 'relief') p.set('base', s.baseMode);
  history.replaceState(null, '', `#${p.toString()}`);
  try { localStorage.setItem('terra3d-last-view', p.toString()); } catch { /* sem armazenamento */ }
}

function readUrlState() {
  // app: sem link na barra de endereço, então reabre na última vista salva (se padrao.js permitir)
  if (!location.hash && PADRAO.lembrarUltimaVista) {
    const saved = (() => { try { return localStorage.getItem('terra3d-last-view'); } catch { return null; } })();
    if (saved) history.replaceState(null, '', `#${saved}`);
  }
  const p = new URLSearchParams(location.hash.slice(1));
  const patch = {};
  if (p.has('x')) patch.exaggeration = Math.max(0.1, Math.min(EXAG_MAX, Number(p.get('x')) || 1));
  if (p.has('sea')) patch.seaLevel = Number(p.get('sea')) || 0;
  if (p.has('pal') && PALETTES[p.get('pal')]) patch.palette = p.get('pal');
  if (p.get('water') === 'tint') patch.waterMode = 'tint';
  if (['satellite', 'standard'].includes(p.get('base'))) patch.baseMode = p.get('base');
  if (Object.keys(patch).length) state.set(patch);
}

function applyUrlCamera() {
  const p = new URLSearchParams(location.hash.slice(1));
  const v = (p.get('cam') || '').split(',').map(Number);
  if (v.length !== 5 || v.some(Number.isNaN)) return false;
  main.camera.setView({
    destination: C.Cartesian3.fromDegrees(v[0], v[1], v[2]),
    orientation: { heading: C.Math.toRadians(v[3]), pitch: C.Math.toRadians(v[4]), roll: 0 },
  });
  return true;
}

// ============================================================ inicialização
updateExagUI();
updateSeaUI();
drawLegend();
applyLayers();
applyBaseMode();
applyBoundaries();
placeLabels.setEnabled(state.get().places).catch((e) => toast(`Falha ao carregar lugares: ${e.message}`));

initHDPatches({
  source,
  getViewRect: viewRect,
  toast,
  setAnnotation,
  onChanged: () => views.forEach((v) => { v.reloadTerrain(); v.refreshRelief(); }),
}).then((cfg) => {
  if (cfg.cesiumIonToken) {
    ionToken = cfg.cesiumIonToken;
    const opt = $('terrainSource').querySelector('option[value="ion"]');
    opt.disabled = false;
  }
});

if (!localStorage.getItem('terra3d-help-seen')) {
  localStorage.setItem('terra3d-help-seen', '1');
  setTimeout(() => toast(IS_MOBILE
    ? 'Arraste para girar · pinça para zoom · dois dedos para cima/baixo inclinam · ☰ abre os controles'
    : 'Arraste para girar · roda para zoom · botão direito (ou Ctrl+arrastar) para inclinar · WASD para voar · ? para ajuda', 9000), 1200);
}

// guarda a vista atual (câmera + estilo) para o app reabrir no mesmo lugar
let saveTimer = null;
const saveView = () => { clearTimeout(saveTimer); saveTimer = setTimeout(writeUrl, 600); };
main.camera.moveEnd.addEventListener(saveView);
state.subscribe(saveView);
document.addEventListener('visibilitychange', () => { if (document.hidden) writeUrl(); });

// versão web: service worker e aviso de instalação (no app do iPhone não faz nada)
initPwa({ isMobile: IS_MOBILE });
