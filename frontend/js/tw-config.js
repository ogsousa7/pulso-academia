/* =========================================================
   tw-config.js — preferências de tema, contraste, texto e tela de abertura (todas as páginas).
   Carregado no <head>, logo depois do CDN do Tailwind.

   As cores NÃO são fixas: cada uma aponta para uma variável CSS
   (definidas em css/style.css). Assim o mesmo HTML funciona no modo
   claro e no escuro: só os valores das variáveis mudam.

     grafite    -> texto principal          superficie -> cartões, menus, janelas
     offwhite   -> fundo da página          tinta      -> fios e preenchimentos sutis
     petroleo   -> cor da marca (botões)    terracota  -> destaque / alerta
     oliva      -> confirmação              linha      -> divisórias
   ========================================================= */

/* Tema escolhido pela pessoa (painel de acessibilidade). Roda antes da página
   aparecer, para não "piscar" claro e depois escuro. */
(function aplicarPreferencias() {
  try {
    const tema = localStorage.getItem('pulso_tema'); // 'claro' | 'escuro' | null (automático)
    if (tema === 'claro' || tema === 'escuro') document.documentElement.dataset.tema = tema;
    if (localStorage.getItem('pulso_contraste') === 'alto') document.documentElement.dataset.contraste = 'alto';
    const texto = localStorage.getItem('pulso_texto'); // 'menor' | 'maior' | 'enorme' | null (normal)
    if (texto) document.documentElement.dataset.texto = texto;
  } catch { /* navegador sem localStorage: segue o sistema */ }
  // Tela de abertura com a logo: na primeira visita, ao recarregar ou depois de tocar na logo (ui.js marca).
  try {
    const navegacao = performance.getEntriesByType('navigation')[0];
    const recarregou = navegacao && navegacao.type === 'reload';
    const primeiraVisita = !sessionStorage.getItem('pulso_visitou');
    const pediu = sessionStorage.getItem('pulso_splash') === '1';
    const semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if ((primeiraVisita || recarregou || pediu) && !semMovimento) document.documentElement.dataset.splash = 'sim';
    sessionStorage.setItem('pulso_visitou', '1');
    sessionStorage.removeItem('pulso_splash');
  } catch { /* navegador sem localStorage: segue o sistema */ }
})();

/* O tema do Tailwind (cores, cantos, fonte) agora fica em backend/tailwind.config.cjs
   e o CSS sai pronto em css/tailwind.css (npm run css, na pasta backend). */
