/* =========================================================
   sw.js — Service Worker da Pulso Academia (PWA)
   - Guarda o "casco" do site (HTML, CSS, JS, ícones) para abrir rápido e
     funcionar mesmo sem internet (mostra offline.html quando não há rede).
   - NUNCA guarda respostas da API (/api/...): dados de conta, agenda e
     pagamentos sempre vêm do servidor.
   Para publicar uma versão nova do site, aumente VERSAO.
   ========================================================= */

const VERSAO = 'pulso-v1';
const CACHE_CASCO = `${VERSAO}-casco`;
const CACHE_EXTERNO = `${VERSAO}-externo`;

const CASCO = [
  'offline.html', 'index.html', 'loja.html', 'login.html', 'checkout.html', 'aluno.html', 'professor.html', 'admin.html',
  'css/style.css',
  'js/api.js', 'js/ui.js', 'js/cart.js', 'js/loja.js', 'js/login.js', 'js/checkout.js', 'js/academia.js',
  'js/aluno.js', 'js/professor.js', 'js/admin.js', 'js/admin-cadastros.js', 'js/pwa.js',
  'img/logo-icon.png', 'img/logo-icon-branco.png', 'img/logo-horizontal.png',
  'img/icons/icon-192.png', 'manifest.json',
];

// Bibliotecas externas que as páginas usam: guardamos a cópia para o modo offline.
const EXTERNOS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_CASCO)
      // allSettled: se um arquivo falhar, o resto ainda é guardado.
      .then((cache) => Promise.allSettled(CASCO.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => !n.startsWith(VERSAO)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/** Responde do cache na hora e atualiza o cache em segundo plano. */
async function cacheEDepoisRede(requisicao, nomeCache) {
  const cache = await caches.open(nomeCache);
  const guardada = await cache.match(requisicao);
  const buscando = fetch(requisicao)
    .then((resposta) => {
      if (resposta && (resposta.ok || resposta.type === 'opaque')) cache.put(requisicao, resposta.clone());
      return resposta;
    })
    .catch(() => null);
  return guardada || (await buscando) || Response.error();
}

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return; // POST/PUT/DELETE vão direto para a rede

  const url = new URL(requisicao.url);

  // Outro domínio: só as bibliotecas conhecidas; o resto (Google Maps, login do Google...) passa direto.
  if (url.origin !== self.location.origin) {
    if (EXTERNOS.includes(url.hostname)) evento.respondWith(cacheEDepoisRede(requisicao, CACHE_EXTERNO));
    return;
  }

  // API: sempre rede, nunca cache.
  if (url.pathname.startsWith('/api/')) return;

  // Páginas: tenta a rede (sempre a versão nova); sem internet, usa o cache ou a página offline.
  if (requisicao.mode === 'navigate') {
    evento.respondWith(
      fetch(requisicao)
        .then((resposta) => {
          const copia = resposta.clone();
          if (resposta.ok) caches.open(CACHE_CASCO).then((c) => c.put(requisicao, copia));
          return resposta;
        })
        .catch(async () => (await caches.match(requisicao, { ignoreSearch: true })) || caches.match('offline.html'))
    );
    return;
  }

  // Arquivos do site (JS, CSS, imagens): cache primeiro, atualiza em segundo plano.
  evento.respondWith(cacheEDepoisRede(requisicao, CACHE_CASCO));
});
