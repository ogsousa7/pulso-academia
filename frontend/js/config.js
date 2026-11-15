/* =========================================================
   config.js — Configuração do site num lugar só.

   ATENÇÃO: TODOS OS DADOS ABAIXO SÃO FICTÍCIOS.
   A Pulso Academia é um projeto escolar (Fábrica de Software, Etec Heliópolis):
   o número de WhatsApp, as redes sociais e o CNPJ não pertencem a ninguém.
   Se um dia virar uma academia de verdade, troque só este arquivo.
   (Endereço, telefone e horários ficam no banco e são editados no painel da recepção.)
   ========================================================= */

window.PULSO_CONFIG = {
  ficticio: true,

  // Botão flutuante do WhatsApp (wa.me): número com DDI 55 + DDD, só dígitos.
  whatsapp: {
    numero: '5511900000000', // (11) 90000-0000 — FICTÍCIO
    mensagem: 'Olá! Vim pelo site da Pulso Academia e quero saber mais sobre os planos e a aula grátis.',
  },

  // Redes sociais do rodapé — FICTÍCIAS
  redes: {
    instagram: 'https://www.instagram.com/pulsoacademia.exemplo',
    facebook: 'https://www.facebook.com/pulsoacademia.exemplo',
    youtube: 'https://www.youtube.com/@pulsoacademia.exemplo',
  },

  // Dados da empresa no rodapé — FICTÍCIOS
  empresa: {
    razaoSocial: 'Pulso Academia Ltda. (empresa fictícia)',
    cnpj: '00.000.000/0001-00',
  },

  // Faixa de promoção no topo (o cupom existe de verdade no servidor: backend/src/constants.js)
  promocao: {
    cupom: 'PULSO10',
    texto: '10% de desconto na primeira compra da loja',
  },
};
