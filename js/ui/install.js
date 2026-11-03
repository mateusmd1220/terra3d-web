// Versão web (PWA): registra o service worker e sugere instalar o app na tela de início.
// No app do iPhone (Capacitor) não faz nada.
// - iPhone/iPad: o Safari não tem botão de instalar; mostramos o caminho (Compartilhar → Tela de Início).
// - Android/Chrome/Edge: usamos o pedido de instalação do navegador (beforeinstallprompt).
// O aviso some para sempre depois de fechado ou quando o app já está instalado.
import { isNative } from '../platform.js';

const DISMISS_KEY = 'terra3d-install-dismissed';

export function initPwa({ isMobile }) {
  if (isNative()) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker:', e));
  }

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let dismissed = false;
  try { dismissed = !!localStorage.getItem(DISMISS_KEY); } catch { /* ignore */ }
  if (standalone || dismissed) return;

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && isMobile) {
    setTimeout(() => show('Instale o Terra 3D: toque em <b>Compartilhar</b> <span class="ih-ico">⬆︎</span> e depois em <b>Adicionar à Tela de Início</b>.'), 4000);
    return;
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const btn = show('Instale o Terra 3D como app neste aparelho.', 'Instalar');
    btn.onclick = async () => {
      e.prompt();
      try { await e.userChoice; } catch { /* ignore */ }
      close(true);
    };
  });
}

function show(html, action) {
  close(false);
  const box = document.createElement('div');
  box.id = 'installHint';
  box.innerHTML = `<div class="ih-text">${html}</div>${action ? `<button class="ih-act">${action}</button>` : ''}<button class="ih-close" title="Fechar">✕</button>`;
  box.querySelector('.ih-close').onclick = () => close(true);
  document.body.appendChild(box);
  return box.querySelector('.ih-act');
}

function close(remember) {
  document.getElementById('installHint')?.remove();
  if (remember) { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } }
}
