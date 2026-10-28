/* =========================================================
   pwa.js — Registra o Service Worker e oferece "Instalar app".
   Carregado em todas as páginas.
   ========================================================= */

(function () {
  // Service Worker só funciona em https:// ou http://localhost.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((erro) => console.warn('[pwa] Service Worker não registrado:', erro));
    });
  }

  const instalado = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  // App aberto pelo ícone da tela inicial: quem já está logado cai direto na sua área.
  if (instalado && /(^|\/)(index\.html)?$/.test(location.pathname) && typeof Auth !== 'undefined' && Auth.estaLogado()) {
    location.replace(Auth.paginaInicial(Auth.getUsuario()));
    return;
  }

  // Convite de instalação: só nas páginas que pedem (<body data-instalar>) e se ainda não está instalado.
  if (instalado) return;
  let convite = null;
  let eventoInstalacao = null;

  function mostrarConvite(texto, comBotao) {
    if (convite || localStorage.getItem('pulso_convite_fechado')) return;
    convite = document.createElement('div');
    // Nas telas com barra de abas (aluno/professor no celular), o convite fica acima dela.
    const acimaDaBarra = document.body.classList.contains('com-tabbar') ? 'bottom-[calc(96px+env(safe-area-inset-bottom))] md:bottom-4' : 'bottom-4';
    convite.className = `fixed ${acimaDaBarra} left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 bg-superficie shadow-[0_10px_30px_rgba(0,0,0,0.14)] rounded-3xl p-4 flex items-center gap-3`;
    convite.innerHTML = `
      <img src="img/icons/icon-192.png" alt="" class="w-11 h-11 rounded-xl">
      <p class="text-sm flex-1"><strong>Instale o app da Pulso</strong><br><span class="text-grafite/65">${texto}</span></p>
      ${comBotao ? '<button data-instalar class="px-4 py-2 rounded-full bg-petroleo text-white text-sm font-semibold">Instalar</button>' : ''}
      <button data-fechar aria-label="Fechar" class="text-grafite/65 text-xl leading-none px-1">×</button>`;
    document.body.appendChild(convite);
    convite.querySelector('[data-fechar]').onclick = () => {
      try { localStorage.setItem('pulso_convite_fechado', '1'); } catch { /* sem armazenamento: só fecha */ }
      convite.remove();
    };
    const botao = convite.querySelector('[data-instalar]');
    if (botao) {
      botao.onclick = async () => {
        eventoInstalacao.prompt();
        await eventoInstalacao.userChoice;
        eventoInstalacao = null;
        convite.remove();
      };
    }
  }

  // Android / Chrome / Edge: o navegador avisa quando dá para instalar.
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    eventoInstalacao = evento;
    if (document.body.hasAttribute('data-instalar')) mostrarConvite('Acesso rápido às suas aulas direto da tela inicial.', true);
  });

  // iPhone/iPad (Safari) não tem esse evento: ensinamos o caminho manual.
  document.addEventListener('DOMContentLoaded', () => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios && document.body.hasAttribute('data-instalar')) {
      mostrarConvite('Toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.', false);
    }
  });

  window.addEventListener('appinstalled', () => convite && convite.remove());
})();
