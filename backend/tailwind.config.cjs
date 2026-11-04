/* Tema do Tailwind (antes ficava em frontend/js/tw-config.js e era montado no navegador pelo CDN).
   Agora o CSS é gerado uma vez com:  npm run css   (dentro da pasta backend)
   e sai pronto em frontend/css/tailwind.css. Rode de novo sempre que usar uma classe nova no HTML/JS.

   As cores apontam para variáveis CSS (css/style.css): o mesmo HTML serve para o tema claro e o escuro. */
const cor = (variavel) => `rgb(var(--${variavel}) / <alpha-value>)`;

module.exports = {
  content: ['../frontend/**/*.html', '../frontend/js/**/*.js'],
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
