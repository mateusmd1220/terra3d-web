// Coloração hipsométrica + hillshade de um tile de elevação.
// Executado em Web Workers (ver workers/shade.worker.js).
//
// Entrada: grade de elevação REAL (metros) com 1 px de borda: (cols x rows) = (W+2 x H+2),
// linhas de norte para sul, espaçamento geográfico constante (dLon, dLat em graus).
// Saída: RGBA W x H.

import { buildLUT, LUT_MIN, LUT_SIZE, hexToRgb } from './palettes.js';

const R = 6371008.8;
const D2R = Math.PI / 180;

const WATER_SHALLOW = hexToRgb('#5ec4ee');
const WATER_DEEP = hexToRgb('#0a2463');
const COAST = [255, 255, 255];

export function shadeTile(h, cols, rows, geo, style) {
  const W = cols - 2, H = rows - 2;
  const out = new Uint8ClampedArray(W * H * 4);
  const lut = buildLUT(style.palette);
  const sea = style.seaLevel || 0;
  const k = style.hillshade;
  const waterTint = style.waterMode === 'tint';
  const contour = style.contour || 0;
  const bandOn = !!style.bandOn;
  const bandMin = style.bandMin, bandMax = style.bandMax;
  const coast = !!style.coast;
  // 'overlay': camada TRANSPARENTE para ir sobre Satélite/Padrão (só costa, inundação,
  // isolinhas, faixas e sombreamento opcional); 'color' (padrão): textura de relevo opaca.
  const overlay = style.output === 'overlay';
  const ovShade = overlay && style.overlayHillshade ? k : 0;
  const flooding = sea !== 0;

  // Realce: tiles de zoom baixo têm pixels de dezenas de km e declividades pequenas;
  // aumentamos o fator vertical do sombreamento para manter a leitura do relevo no globo.
  const z = style.z || 0;
  // Em zoom alto (pixels de poucos metros) as encostas saturam; atenuamos suavemente.
  let zf = style.zFactor * (z < 9 ? Math.pow(2, (9 - z) * 0.42) : Math.pow(2, (9 - z) * 0.2));
  if (style.followExag) zf *= Math.sqrt(Math.max(1, style.exaggeration));

  // Luzes: principal no azimute escolhido + 2 auxiliares (multidirecional).
  const alt = (style.sunAltitude ?? 40) * D2R;
  const az0 = (style.sunAzimuth ?? 315) * D2R;
  const lights = style.multi
    ? [[az0 - 0.9, 0.22], [az0, 0.56], [az0 + 0.9, 0.22]]
    : [[az0, 1]];
  const L = lights.map(([az, w]) => [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt), w]);
  let flat = 0;
  for (const l of L) flat += l[2] * l[3];

  const dym = geo.dLat * D2R * R;
  const lutOff = -LUT_MIN - Math.round(sea);
  const lutLast = LUT_SIZE - 1;

  for (let r = 1; r <= H; r++) {
    const lat = Math.max(-90, Math.min(90, geo.lat0 - r * geo.dLat));
    const cosl = Math.max(Math.cos(lat * D2R), 0.03);
    const dxm = geo.dLon * D2R * R * cosl;
    const ix2 = 1 / (2 * dxm), iy2 = 1 / (2 * dym);
    let o = (r - 1) * W * 4;
    for (let c = 1; c <= W; c++, o += 4) {
      const i = r * cols + c;
      const e = h[i];
      const gx = (h[i + 1] - h[i - 1]) * ix2;
      const gy = (h[i - cols] - h[i + cols]) * iy2; // norte - sul
      const nx = -zf * gx, ny = -zf * gy;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      let shade = 0;
      for (let j = 0; j < L.length; j++) {
        const l = L[j];
        const d = (nx * l[0] + ny * l[1] + l[2]) * inv;
        if (d > 0) shade += d * l[3];
      }
      const f = shade / flat;

      if (overlay) {
        // composição "over" com alfa pré-multiplicado
        let pr = 0, pg = 0, pb = 0, pa = 0;
        const over = (r0, g0, b0, a0) => {
          pr = r0 * a0 + pr * (1 - a0); pg = g0 * a0 + pg * (1 - a0); pb = b0 * a0 + pb * (1 - a0);
          pa = a0 + pa * (1 - a0);
        };
        if (ovShade) {
          if (f < 1) over(0, 0, 0, Math.min(0.6, (1 - f) * ovShade * 0.6));
          else over(255, 255, 255, Math.min(0.35, (f - 1) * ovShade * 0.45));
        }
        if (flooding && e < sea && e >= 0) over(WATER_SHALLOW[0], WATER_SHALLOW[1], WATER_SHALLOW[2], 0.62); // terra inundada
        else if (flooding && e >= sea && e < 0) over(222, 198, 150, 0.6); // plataforma exposta
        else if (waterTint && e < sea) over(WATER_DEEP[0], WATER_DEEP[1], WATER_DEEP[2], 0.35);
        if (bandOn && (e < bandMin || e > bandMax)) over(20, 20, 26, 0.6);
        if (contour > 0) {
          const a = Math.floor(e / contour);
          if (a !== Math.floor(h[i + 1] / contour) || a !== Math.floor(h[i + cols] / contour)) {
            const major = (Math.max(a, Math.floor(h[i + 1] / contour), Math.floor(h[i + cols] / contour)) % 5) === 0;
            over(30, 20, 10, major ? 0.8 : 0.5);
          }
        }
        if (coast) {
          const s0 = e >= sea;
          if (s0 !== (h[i + 1] >= sea) || s0 !== (h[i + cols] >= sea) || s0 !== (h[i - 1] >= sea) || s0 !== (h[i - cols] >= sea)) {
            over(COAST[0], COAST[1], COAST[2], 0.95);
          }
        }
        if (pa > 0) { out[o] = pr / pa; out[o + 1] = pg / pa; out[o + 2] = pb / pa; out[o + 3] = pa * 255; }
        continue;
      }

      // cor pela elevação relativa ao nível do mar simulado
      let li = Math.round(e) + lutOff;
      li = li < 0 ? 0 : li > lutLast ? lutLast : li;
      let cr = lut[li * 3], cg = lut[li * 3 + 1], cb = lut[li * 3 + 2];
      let kk = k;

      if (waterTint && e < sea) {
        const t = Math.min(1, (sea - e) / 5500);
        const tt = Math.sqrt(t);
        const wr = WATER_SHALLOW[0] + (WATER_DEEP[0] - WATER_SHALLOW[0]) * tt;
        const wg = WATER_SHALLOW[1] + (WATER_DEEP[1] - WATER_SHALLOW[1]) * tt;
        const wb = WATER_SHALLOW[2] + (WATER_DEEP[2] - WATER_SHALLOW[2]) * tt;
        cr = cr * 0.18 + wr * 0.82; cg = cg * 0.18 + wg * 0.82; cb = cb * 0.18 + wb * 0.82;
        kk = k * 0.35;
      }

      if (bandOn && (e < bandMin || e > bandMax)) {
        const lum = (cr * 0.3 + cg * 0.59 + cb * 0.11) * 0.3 + 28;
        cr = cg = cb = lum;
      }

      // hillshade: escurece encostas opostas à luz, clareia (brilho) as voltadas para ela
      if (f < 1) {
        const m = Math.max(0.2, 1 - (1 - f) * kk * 0.9);
        cr *= m; cg *= m; cb *= m;
      } else {
        const t = Math.min(0.85, (f - 1) * kk * 0.9);
        cr += (255 - cr) * t; cg += (255 - cg) * t; cb += (255 - cb) * t;
      }

      if (contour > 0) {
        const a = Math.floor(e / contour);
        if (a !== Math.floor(h[i + 1] / contour) || a !== Math.floor(h[i + cols] / contour)) {
          const major = (Math.max(a, Math.floor(h[i + 1] / contour), Math.floor(h[i + cols] / contour)) % 5) === 0;
          const m = major ? 0.3 : 0.58;
          cr *= m; cg *= m; cb *= m;
        }
      }

      if (coast) {
        const s0 = e >= sea;
        if (s0 !== (h[i + 1] >= sea) || s0 !== (h[i + cols] >= sea) || s0 !== (h[i - 1] >= sea) || s0 !== (h[i - cols] >= sea)) {
          cr = cr * 0.1 + COAST[0] * 0.9; cg = cg * 0.1 + COAST[1] * 0.9; cb = cb * 0.1 + COAST[2] * 0.9;
        }
      }

      out[o] = cr; out[o + 1] = cg; out[o + 2] = cb; out[o + 3] = 255;
    }
  }
  return out;
}
