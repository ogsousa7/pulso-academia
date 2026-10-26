/* =========================================================
   academia.js — Dados da academia + mapa do Google
   Busca GET /api/academia e:
     • preenche todo elemento com [data-academia="campo"] (endereço, telefone, horários...)
     • monta o mapa em #mapaAcademia e os links "Como chegar" / "Abrir no Google Maps"
   Assim a recepção edita as informações no painel (UC07) e o site inteiro acompanha.
   Depende de: Api (api.js).

   Mapa: com GOOGLE_MAPS_API_KEY no servidor usa a Maps Embed API oficial
   (gratuita e ilimitada); sem chave, usa o mapa incorporado simples do Google,
   então o site funciona mesmo sem configurar nada.
   ========================================================= */

(function iniciarAcademia() {
  const ORIGEM_MAPAS = 'https://www.google.com/maps';

  function preencherTextos(academia) {
    document.querySelectorAll('[data-academia]').forEach((el) => {
      const valor = academia[el.dataset.academia];
      if (typeof valor === 'string') el.textContent = valor; // textContent: nunca interpreta HTML
    });
    const email = document.querySelector('a[data-academia-email]');
    if (email && academia.email) email.href = `mailto:${academia.email}`;
  }

  function montarMapa(mapa) {
    const consulta = encodeURIComponent(mapa.consulta);

    const comoChegar = document.getElementById('linkComoChegar');
    if (comoChegar) comoChegar.href = `${ORIGEM_MAPAS}/dir/?api=1&destination=${consulta}`;
    const abrir = document.getElementById('linkAbrirMapa');
    if (abrir) abrir.href = `${ORIGEM_MAPAS}/search/?api=1&query=${consulta}`;

    const alvo = document.getElementById('mapaAcademia');
    if (!alvo) return;

    const iframe = document.createElement('iframe');
    iframe.title = 'Mapa com a localização da Pulso Academia';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade'; // a chave da Embed API é validada pelo referrer
    iframe.allowFullscreen = true;
    iframe.className = 'absolute inset-0 w-full h-full border-0';
    iframe.src = mapa.chave
      ? `${ORIGEM_MAPAS}/embed/v1/place?key=${encodeURIComponent(mapa.chave)}&q=${consulta}&language=pt-BR&zoom=15`
      : `${ORIGEM_MAPAS}?q=${consulta}&hl=pt-BR&z=15&output=embed`;

    alvo.replaceChildren(iframe);
  }

  Api.obterAcademia()
    .then(({ academia, mapa }) => {
      preencherTextos(academia);
      montarMapa(mapa);
    })
    .catch(() => {
      // API fora do ar: os textos padrão do HTML continuam e o mapa mostra um aviso.
      const alvo = document.getElementById('mapaAcademia');
      if (alvo) alvo.textContent = 'Não foi possível carregar o mapa agora.';
    });
})();
