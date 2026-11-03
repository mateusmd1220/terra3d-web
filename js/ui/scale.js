// Painel educativo: o que o exagero vertical significa em escala humana/planetária.
import { meters, n0, n2 } from './format.js';

const EARTH_R = 6371000;
const REFS = [
  { name: 'Voo comercial', h: 11000 },
  { name: 'Linha de Kármán (início do espaço)', h: 100000 },
  { name: 'Estação Espacial Internacional', h: 408000 },
  { name: 'Satélites GPS', h: 20200000 },
];

function compare(v) {
  const above = REFS.filter((r) => v >= r.h);
  if (!above.length) return `abaixo da altitude de um voo comercial (${meters(11000)})`;
  const r = above[above.length - 1];
  return `acima de: ${r.name} (${meters(r.h)})`;
}

export function renderScale(el, exag) {
  const items = [
    { name: 'Monte Everest', real: 8849 },
    { name: 'Fossa das Marianas', real: -10935 },
    { name: 'Mauna Kea (base → cume)', real: 10210 },
    { name: 'Altiplano andino', real: 3800 },
    { name: 'Profundidade média do oceano', real: -3688 },
    { name: 'Altitude média dos continentes', real: 840 },
  ];
  const maxVis = Math.max(...items.map((i) => Math.abs(i.real * exag)));
  const relief = 8849 + 10935;
  const billiard = 57.15; // mm
  el.innerHTML = `
    ${items.map((i) => {
      const vis = i.real * exag;
      return `<div class="scale-item"><span>${i.name}</span><span class="v">${meters(vis)}</span>
        <div class="scale-bar"><i style="width:${(Math.abs(vis) / maxVis) * 100}%"></i></div>
        <span class="note">real ${meters(i.real)} · visual ${compare(Math.abs(vis))}</span></div>`;
    }).join('')}
    <p class="hint">Do fundo da Fossa das Marianas ao topo do Everest são <b>${meters(relief)}</b> — só
    <b>${n2((relief / EARTH_R) * 100)}%</b> do raio da Terra. Numa bola de bilhar (${n2(billiard)} mm),
    isso seria <b>${n2((relief / (EARTH_R * 2)) * billiard)} mm</b>; com ${n0(exag)}× de exagero,
    <b>${n2((relief * exag / (EARTH_R * 2)) * billiard)} mm</b>.</p>
    <p class="hint">Por isso a Terra real parece lisa vista do espaço: o exagero vertical é a “lupa”
    que revela dorsais, fossas e cordilheiras. As cores e todos os valores medidos continuam sendo a elevação <b>real</b>.</p>`;
}
