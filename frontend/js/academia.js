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

  // Endereço do mapa. Começa com o bairro e é trocado pelo endereço da API quando ela responde.
  let enderecoMapa = `${ORIGEM_MAPAS}?q=${encodeURIComponent('Heliópolis, São Paulo')}&hl=pt-BR&z=15&output=embed`;

  function montarMapa(mapa) {
    const consulta = encodeURIComponent(mapa.consulta);

    const comoChegar = document.getElementById('linkComoChegar');
    if (comoChegar) comoChegar.href = `${ORIGEM_MAPAS}/dir/?api=1&destination=${consulta}`;
    const abrir = document.getElementById('linkAbrirMapa');
    if (abrir) abrir.href = `${ORIGEM_MAPAS}/search/?api=1&query=${consulta}`;

    enderecoMapa = mapa.chave
      ? `${ORIGEM_MAPAS}/embed/v1/place?key=${encodeURIComponent(mapa.chave)}&q=${consulta}&language=pt-BR&zoom=15`
      : `${ORIGEM_MAPAS}?q=${consulta}&hl=pt-BR&z=15&output=embed`;
  }

  // O mapa do Google é pesado: só é criado quando a pessoa abre o pop-up.
  const dialogo = document.getElementById('dialogMapa');
  function abrirMapa() {
    const alvo = document.getElementById('mapaAcademia');
    const atual = alvo.querySelector('iframe');
    if (!atual || atual.src !== enderecoMapa) {
      const iframe = document.createElement('iframe');
      iframe.title = 'Mapa com a localização da Pulso Academia';
      iframe.referrerPolicy = 'no-referrer-when-downgrade'; // a chave da Embed API é validada pelo referrer
      iframe.allowFullscreen = true;
      iframe.className = 'absolute inset-0 w-full h-full border-0';
      iframe.src = enderecoMapa;
      alvo.replaceChildren(iframe);
    }
    dialogo.showModal();
  }
  if (dialogo) {
    document.querySelectorAll('[data-abrir-mapa]').forEach((b) => b.addEventListener('click', abrirMapa));
    dialogo.querySelector('[data-fechar-mapa]').addEventListener('click', () => dialogo.close());
    // Clicar no fundo escuro também fecha.
    dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
  }

  // Lê "6h – 22h" do texto do horário. Domingo: fechado (a academia não tem horário de domingo).
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function faixaDoDia(dia) {
    if (dia === 0) return null;
    const campo = dia === 6 ? 'horario_sabado' : 'horario_semana';
    const texto = document.querySelector(`[data-academia="${campo}"]`)?.textContent || '';
    const m = /(\d{1,2})h\s*[–-]\s*(\d{1,2})h/.exec(texto);
    return m ? [Number(m[1]), Number(m[2])] : null;
  }

  function mostrarStatus() {
    const el = document.getElementById('statusAcademia');
    if (!el) return;
    const agora = new Date();
    const dia = agora.getDay();
    const hora = agora.getHours() + agora.getMinutes() / 60;
    const hoje = faixaDoDia(dia);
    if (hoje && hora >= hoje[0] && hora < hoje[1]) {
      el.dataset.aberto = 'sim';
      el.textContent = `Aberto agora · fecha às ${hoje[1]}h`;
    } else {
      el.dataset.aberto = 'nao';
      let quando = '';
      for (let i = 0; i < 7 && !quando; i += 1) {
        const faixa = faixaDoDia((dia + i) % 7);
        if (!faixa || (i === 0 && hora >= faixa[0])) continue;
        quando = i === 0 ? `abre às ${faixa[0]}h` : i === 1 ? `abre amanhã às ${faixa[0]}h` : `abre ${DIAS[(dia + i) % 7]} às ${faixa[0]}h`;
      }
      el.textContent = quando ? `Fechado agora · ${quando}` : 'Fechado agora';
    }
    el.hidden = false;
  }

  mostrarStatus();
  Api.obterAcademia()
    .then(({ academia, mapa }) => {
      preencherTextos(academia);
      montarMapa(mapa);
      mostrarStatus();
    })
    .catch(() => {
      // API fora do ar: os textos padrão do HTML continuam e o mapa mostra o bairro.
    });
})();
