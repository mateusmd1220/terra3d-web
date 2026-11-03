// Busca: lugares pré-definidos (instantâneo, sem rede) + geocodificação Nominatim via proxy local
// + coordenadas digitadas ("-23.5, -46.6").
import { PLACES } from '../data/places.js';
import { geocode } from '../platform.js';
import { meters } from './format.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function initSearch({ input, results, clearBtn, onPlace, onBBox, onPoint, onClear }) {
  let items = [];
  let active = -1;
  let timer = null;
  let seq = 0;

  function render(local, remote, loading) {
    items = [];
    const html = [];
    if (local.length) {
      html.push('<div class="sr-section">Lugares em destaque</div>');
      for (const p of local) {
        items.push({ kind: 'place', p });
        html.push(`<div class="sr-item" data-i="${items.length - 1}"><span class="tag">${p.cat}</span><span class="t">${p.name}</span><span class="d">${p.elev ? meters(p.elev) : ''}</span></div>`);
      }
    }
    if (remote.length) {
      html.push('<div class="sr-section">OpenStreetMap (Nominatim)</div>');
      for (const r of remote) {
        items.push({ kind: 'osm', r });
        const [name, ...rest] = r.display_name.split(',');
        html.push(`<div class="sr-item" data-i="${items.length - 1}"><span class="t">${name}</span><span class="d">${rest.join(',').trim()}</span></div>`);
      }
    }
    if (loading) html.push('<div class="sr-section">buscando…</div>');
    if (!html.length) { results.classList.add('hidden'); return; }
    results.innerHTML = html.join('');
    results.classList.remove('hidden');
    active = -1;
  }

  let choose = function (i) {
    const it = items[i];
    if (!it) return;
    results.classList.add('hidden');
    input.blur();
    if (it.kind === 'place') { input.value = it.p.name; onPlace(it.p); }
    else {
      const [s, n, w, e] = it.r.boundingbox.map(Number);
      input.value = it.r.display_name.split(',')[0];
      onBBox(w, s, e, n, it.r);
    }
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q) { results.classList.add('hidden'); return; }
    const nq = norm(q);
    const local = PLACES.filter((p) => norm(`${p.name} ${p.aliases}`).includes(nq)).slice(0, 6);
    render(local, [], q.length >= 3);
    if (q.length < 3) return;
    const my = ++seq;
    timer = setTimeout(async () => {
      try {
        const data = await geocode(q);
        if (my === seq) render(local, Array.isArray(data) ? data : [], false);
      } catch {
        if (my === seq) render(local, [], false);
      }
    }, 450);
  });

  input.addEventListener('keydown', (e) => {
    const els = results.querySelectorAll('.sr-item');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % Math.max(1, els.length);
      els.forEach((el, i) => el.classList.toggle('active', i === active));
    } else if (e.key === 'Enter') {
      const m = input.value.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
      if (m) {
        results.classList.add('hidden');
        onPoint(Number(m[2]), Number(m[1]));
        return;
      }
      choose(active >= 0 ? active : 0);
    } else if (e.key === 'Escape') {
      results.classList.add('hidden');
      if (!input.value) onClear?.();
      input.blur();
    }
  });

  results.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.sr-item');
    if (el) { e.preventDefault(); choose(Number(el.dataset.i)); }
  });
  const syncClear = () => clearBtn?.classList.toggle('hidden', !input.value && !clearBtn.dataset.active);
  input.addEventListener('input', syncClear);
  if (clearBtn) {
    clearBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input.value = '';
      delete clearBtn.dataset.active;
      results.classList.add('hidden');
      onClear?.();
      syncClear();
    });
  }
  // mantém o ✕ visível enquanto houver destaque no mapa
  const origChoose = choose;
  choose = (i) => { if (clearBtn) clearBtn.dataset.active = '1'; origChoose(i); syncClear(); };

  input.addEventListener('blur', () => setTimeout(() => results.classList.add('hidden'), 150));
  input.addEventListener('focus', () => { if (input.value.trim()) input.dispatchEvent(new Event('input')); });
}
