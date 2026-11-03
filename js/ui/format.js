const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export const n0 = (v) => nf0.format(v);
export const n1 = (v) => nf1.format(v);
export const n2 = (v) => nf2.format(v);

/** Metros com troca automática para km quando grande. */
export function meters(v, { sign = false, kmFrom = 20000 } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const s = sign && v > 0 ? '+' : '';
  if (Math.abs(v) >= kmFrom) return `${s}${n1(v / 1000)} km`;
  return `${s}${n0(v)} m`;
}

export function distance(m) {
  if (m >= 10000) return `${n0(m / 1000)} km`;
  if (m >= 1000) return `${n1(m / 1000)} km`;
  return `${n0(m)} m`;
}

export function coord(v, pos, neg) {
  const a = Math.abs(v);
  return `${a.toFixed(4)}° ${v >= 0 ? pos : neg}`;
}

export const exag = (v) => (v < 1 ? `${n2(v)}×` : `${n0(v)}×`);
export const pct = (v) => `${n1(v)}%`;
