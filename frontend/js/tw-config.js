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
      borderRadius: { '2xl': '1.125rem', '3xl': '1.5rem' },
      letterSpacing: { apertado: '-0.022em', titulo: '-0.035em' },
    },
  },
};
