// Paletas hipsométricas/batimétricas. Stops: [elevação em metros, cor].
// Usado tanto no worker de sombreamento quanto na interface (legenda, perfil, histograma).

export const LUT_MIN = -12000;
export const LUT_MAX = 9000;
export const LUT_SIZE = LUT_MAX - LUT_MIN + 1;

function turboStops() {
  // Aproximação polinomial do colormap "Turbo" (Google, Apache-2.0).
  const turbo = (t) => {
    const r = 0.13572138 + t * (4.6153926 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))));
    const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))));
    const b = 0.1066733 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))));
    const c = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
    return [c(r), c(g), c(b)];
  };
  const stops = [];
  const lo = -9000, hi = 6500, n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // mais resolução perto do nível do mar
    const e = t < 0.58 ? lo + (0 - lo) * Math.pow(t / 0.58, 0.8) : 0 + (hi - 0) * Math.pow((t - 0.58) / 0.42, 1.5);
    stops.push([Math.round(e), turbo(0.03 + t * 0.94)]);
  }
  return stops;
}

export const PALETTES = {
  video: {
    name: 'Espectral (estilo do vídeo)',
    stops: [
      [-11000, '#16002e'], [-8000, '#260260'], [-6500, '#310f96'], [-5500, '#3a24c8'],
      [-4700, '#2f42e6'], [-4000, '#2766f0'], [-3200, '#2890f4'], [-2400, '#31b2f6'],
      [-1500, '#46cff4'], [-600, '#66e2f0'], [-150, '#92eee6'], [-1, '#b8f3dc'],
      [0, '#c4f3a4'], [60, '#e8f59a'], [180, '#fff27c'], [380, '#ffd75c'],
      [700, '#ffb14a'], [1100, '#ff8a43'], [1600, '#ff6450'], [2300, '#ff6a7e'],
      [3100, '#ff94aa'], [4000, '#ffc4d0'], [5000, '#ffe9ee'], [6000, '#ffffff'], [9000, '#ffffff'],
    ],
  },
  hypso: {
    name: 'Hipsométrica clássica',
    stops: [
      [-11000, '#050a36'], [-7000, '#0a1d62'], [-5000, '#123a8c'], [-3500, '#1f5aa8'],
      [-2000, '#3a7fc2'], [-500, '#6aa8d8'], [-100, '#9ccbe8'], [-1, '#c6e4f4'],
      [0, '#4b8f4a'], [150, '#79ab5c'], [400, '#aec676'], [800, '#e0d58c'],
      [1300, '#d7b06a'], [2000, '#b98352'], [2800, '#946247'], [3600, '#8b7466'],
      [4500, '#c9bdb4'], [5500, '#f4f1ee'], [9000, '#ffffff'],
    ],
  },
  turbo: { name: 'Turbo (contraste máximo)', stops: turboStops() },
  bathy: {
    name: 'Foco na batimetria',
    stops: [
      [-11000, '#0b0020'], [-9000, '#2c0b5a'], [-7000, '#4b1d9c'], [-6000, '#3d3fd6'],
      [-5200, '#2c6ce8'], [-4500, '#1c98e0'], [-3800, '#12bfd0'], [-3000, '#2fdcb4'],
      [-2000, '#8aeb9c'], [-1000, '#d9f28e'], [-200, '#fff3a8'], [-1, '#fffbe0'],
      [0, '#6b6b6b'], [2000, '#a8a8a8'], [5000, '#e6e6e6'], [9000, '#ffffff'],
    ],
  },
  gray: {
    name: 'Relevo sombreado (cinza)',
    stops: [[-11000, '#1c1c24'], [-6000, '#40404c'], [-3000, '#6d6d78'], [-1, '#9a9aa2'], [0, '#b4b4b0'], [2000, '#d6d6d0'], [6000, '#ffffff'], [9000, '#ffffff']],
  },
  bands: {
    name: 'Faixas de altitude',
    discrete: true,
    stops: [
      [-12000, '#1a0548'], [-6000, '#2a2aa8'], [-4000, '#2f6fd6'], [-2000, '#3fa9e8'], [-200, '#8fdcf0'],
      [0, '#2e9e5b'], [500, '#a6d96a'], [1000, '#fee08b'], [2000, '#f99d59'], [3000, '#d7301f'], [4000, '#f2c6d6'], [5000, '#ffffff'],
    ],
  },
};

export function hexToRgb(hex) {
  if (Array.isArray(hex)) return hex;
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const lutCache = new Map();

/** LUT RGB por metro de elevação, de LUT_MIN a LUT_MAX. */
export function buildLUT(key) {
  if (lutCache.has(key)) return lutCache.get(key);
  const pal = PALETTES[key] || PALETTES.video;
  const stops = pal.stops.map(([e, c]) => [e, hexToRgb(c)]);
  const lut = new Uint8Array(LUT_SIZE * 3);
  let s = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const e = LUT_MIN + i;
    while (s < stops.length - 2 && e >= stops[s + 1][0]) s++;
    const [e0, c0] = stops[s];
    const [e1, c1] = stops[Math.min(s + 1, stops.length - 1)];
    let t = e1 === e0 ? 0 : (e - e0) / (e1 - e0);
    t = Math.max(0, Math.min(1, t));
    if (pal.discrete) t = e >= e1 ? 1 : 0;
    lut[i * 3] = c0[0] + (c1[0] - c0[0]) * t;
    lut[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * t;
    lut[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * t;
  }
  lutCache.set(key, lut);
  return lut;
}

export function colorAt(key, elevation) {
  const lut = buildLUT(key);
  let i = Math.round(elevation) - LUT_MIN;
  i = i < 0 ? 0 : i >= LUT_SIZE ? LUT_SIZE - 1 : i;
  return [lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2]];
}

export function cssColorAt(key, elevation) {
  const [r, g, b] = colorAt(key, elevation);
  return `rgb(${r},${g},${b})`;
}
