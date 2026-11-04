/* =========================================================
   tw-config.js — tema do Tailwind compartilhado por TODAS as páginas.
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

const cor = (variavel) => `rgb(var(--${variavel}) / <alpha-value>)`;

tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        grafite: cor('grafite'),
        offwhite: cor('offwhite'),
        superficie: cor('superficie'),
        tinta: cor('tinta'),
        petroleo: cor('petroleo'),
        oliva: cor('oliva'),
        terracota: cor('terracota'),
        linha: cor('linha'),
      },
      // Cantos levemente arredondados (identidade da marca); rounded-full fica só para círculos.
      borderRadius: { DEFAULT: '6px', md: '6px', lg: '8px', xl: '10px', '2xl': '14px', '3xl': '16px' },
      letterSpacing: { apertado: '-0.022em', titulo: '-0.035em' },
    },
  },
};
