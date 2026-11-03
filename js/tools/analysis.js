// Cálculos de perfil topográfico e estatísticas de região — sempre sobre elevação REAL.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Perfil ao longo de uma polilinha geodésica.
 * @param {ElevationSource} source
 * @param {Array<[number,number]>} vertices [lon, lat] em graus
 */
export async function computeProfile(source, vertices, N = 600) {
  const C = Cesium;
  const segs = [];
  let total = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = C.Cartographic.fromDegrees(...vertices[i]);
    const b = C.Cartographic.fromDegrees(...vertices[i + 1]);
    const g = new C.EllipsoidGeodesic(a, b);
    segs.push({ g, start: total, len: g.surfaceDistance });
    total += g.surfaceDistance;
  }
  if (!total) return null;
  const points = [], dist = new Float64Array(N);
  let s = 0;
  const tmp = new C.Cartographic();
  for (let i = 0; i < N; i++) {
    const d = (total * i) / (N - 1);
    while (s < segs.length - 1 && d > segs[s].start + segs[s].len) s++;
    const seg = segs[s];
    seg.g.interpolateUsingSurfaceDistance(clamp(d - seg.start, 0, seg.len), tmp);
    points.push([C.Math.toDegrees(tmp.longitude), C.Math.toDegrees(tmp.latitude)]);
    dist[i] = d;
  }
  const spacing = total / (N - 1);
  const meanLat = points.reduce((a, p) => a + p[1], 0) / N;
  const z = clamp(Math.round(Math.log2((40075016 * Math.cos((meanLat * Math.PI) / 180)) / (256 * spacing))), 0, 14);
  const heights = await source.sampleMany(points, z);

  let min = Infinity, max = -Infinity, iMin = 0, iMax = 0, gain = 0, loss = 0, slopeSum = 0, maxSlope = 0;
  for (let i = 0; i < N; i++) {
    const h = heights[i];
    if (h < min) { min = h; iMin = i; }
    if (h > max) { max = h; iMax = i; }
    if (i) {
      const dh = h - heights[i - 1];
      if (dh > 0) gain += dh; else loss -= dh;
      const sl = Math.abs(dh) / spacing;
      slopeSum += sl;
      if (sl > maxSlope) maxSlope = sl;
    }
  }
  return {
    vertices, points, dist, heights, total, z, spacing,
    stats: {
      min, max, iMin, iMax, range: max - min, gain, loss,
      start: heights[0], end: heights[N - 1],
      meanSlopePct: (slopeSum / (N - 1)) * 100,
      maxSlopePct: maxSlope * 100,
    },
  };
}

/**
 * Estatísticas ponderadas por área (cos φ) de um retângulo [w, s, e, n].
 */
export async function computeRegionStats(source, rect, { seaLevel = 0, landOnly = false, samples = 256 } = {}) {
  let [w, s, e, n] = rect;
  s = clamp(s, -85, 85); n = clamp(n, -85, 85);
  const cols = samples, rows = samples;
  const dLon = (e - w) / (cols - 1), dLat = (n - s) / (rows - 1);
  const z = clamp(Math.floor(Math.log2(360 / (256 * Math.max(dLon, 1e-6)))) + 1, 0, 13);
  const [grid, ext] = await Promise.all([
    source.sampleGrid({ lon0: w, lat0: n, dLon, dLat, cols, rows, z, maxTiles: 64 }),
    // extremos exatos: varredura de todos os pixels num zoom mais fino
    source.rectExtrema([w, s, e, n], z + 3, 96),
  ]);

  const vals = [], wts = [];
  let wsum = 0, mean = 0, min = Infinity, max = -Infinity;
  for (let r = 0; r < rows; r++) {
    const wt = Math.cos(((n - r * dLat) * Math.PI) / 180);
    for (let c = 0; c < cols; c++) {
      const h = grid[r * cols + c];
      if (landOnly && h < seaLevel) continue;
      vals.push(h); wts.push(wt);
      wsum += wt; mean += h * wt;
      if (h < min) min = h; if (h > max) max = h;
    }
  }
  if (!vals.length) return null;
  mean /= wsum;
  // extremos exatos (quando "somente terra", o mínimo exato só vale se estiver acima do mar)
  if (ext.max > max) max = ext.max;
  if (!landOnly || ext.min >= seaLevel) min = Math.min(min, ext.min);
  let varr = 0;
  for (let i = 0; i < vals.length; i++) varr += wts[i] * (vals[i] - mean) ** 2;
  const std = Math.sqrt(varr / wsum);

  const order = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
  let acc = 0, median = vals[order[0]];
  for (const i of order) { acc += wts[i]; if (acc >= wsum / 2) { median = vals[i]; break; } }

  const pct = (pred) => { let a = 0; for (let i = 0; i < vals.length; i++) if (pred(vals[i])) a += wts[i]; return (a / wsum) * 100; };
  const thresholds = [0, 500, 1000, 2000, 3000, 4000, 5000];
  const above = Object.fromEntries(thresholds.map((t) => [t, pct((v) => v > t)]));

  const BINS = 40;
  const hmin = Math.floor(min), hmax = Math.ceil(max) + 1;
  const bw = (hmax - hmin) / BINS;
  const hist = new Float64Array(BINS);
  for (let i = 0; i < vals.length; i++) hist[clamp(Math.floor((vals[i] - hmin) / bw), 0, BINS - 1)] += wts[i];
  for (let i = 0; i < BINS; i++) hist[i] = (hist[i] / wsum) * 100;

  const R = 6371.0088, D2R = Math.PI / 180;
  const areaKm2 = Math.abs(R * R * (e - w) * D2R * (Math.sin(n * D2R) - Math.sin(s * D2R)));

  return {
    rect: [w, s, e, n], z, count: vals.length, areaKm2, landOnly, seaLevel,
    extrema: ext, maxAt: ext.maxAt, minAt: ext.minAt,
    min, max, mean, median, std, range: max - min,
    belowSea: pct((v) => v < seaLevel),
    above,
    hist: { bins: hist, min: hmin, width: bw },
  };
}
