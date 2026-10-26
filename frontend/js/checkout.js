/* =========================================================
   checkout.js — Pagamento (checkout.html)
   Estados:  formulário (cartão / Pix / boleto)  ->  aguardando (Pix/boleto)
             ->  confirmado  |  expirado.   Também abre "?pedido=ID" direto.

   O pagamento é SIMULADO, mas segue o fluxo de um real:
     • Cartão: validado aqui (Luhn, validade, CVV) e aprovado na hora.
       O número completo e o CVV NUNCA são enviados: o servidor recebe só
       bandeira, 4 últimos dígitos e parcelas.
     • Pix / boleto: o pedido fica PENDENTE com prazo; a tela acompanha o
       status e, no modo demonstração, tem um botão que simula o aviso do banco.
   Depende de: Api, Auth (api.js), ui.js, Carrinho (cart.js).
   ========================================================= */

const raiz = document.getElementById('checkoutRoot');
const PARCELA_MINIMA = 20; // mesma regra do servidor
const MAX_PARCELAS = 12;
const NOME_METODO = { PIX: 'Pix', CARTAO: 'Cartão de crédito', BOLETO: 'Boleto bancário' };
const CHAVE_PEDIDO_ABERTO = 'pulso_pedido_em_andamento';

let metodo = 'PIX';
let timers = [];
let emFormulario = false; // o carrinho só redesenha o resumo quando o formulário está na tela

const limparTimers = () => { timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); timers = []; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------- Utilidades ----------------------------- */

/** "YYYY-MM-DD HH:MM:SS" (UTC, do SQLite) -> Date. */
const dataUTC = (texto) => new Date(texto.replace(' ', 'T') + 'Z');

function copiarTexto(texto) {
  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  };
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(texto).then(() => true, () => fallback());
  }
  return Promise.resolve(fallback());
}

/** Algoritmo de Luhn: detecta números de cartão digitados errado. */
function luhn(numero) {
  let soma = 0;
  let dobrar = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let d = Number(numero[i]);
    if (dobrar) { d *= 2; if (d > 9) d -= 9; }
    soma += d;
    dobrar = !dobrar;
  }
  return soma % 10 === 0;
}

const PREFIXOS_ELO = /^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/;
function bandeiraDe(numero) {
  if (/^3[47]/.test(numero)) return 'AMEX';
  if (/^(606282|3841)/.test(numero)) return 'HIPERCARD';
  if (PREFIXOS_ELO.test(numero)) return 'ELO';
  if (/^4/.test(numero)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(numero)) return 'MASTERCARD';
  return 'OUTRA';
}
const NOME_BANDEIRA = { VISA: 'Visa', MASTERCARD: 'Mastercard', ELO: 'Elo', AMEX: 'Amex', HIPERCARD: 'Hipercard', OUTRA: '' };

function formatarNumeroCartao(digitos) {
  if (bandeiraDe(digitos) === 'AMEX') {
    const d = digitos.slice(0, 15);
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
  }
  return (digitos.slice(0, 16).match(/.{1,4}/g) || []).join(' ');
}

const soDigitos = (valor) => String(valor).replace(/\D/g, '');

/* ---------------------------- Resumo do pedido ---------------------------- */

// Nome diferente do ICONE_PLANO do cart.js: os dois scripts são carregados na mesma
// página e dois "const" com o mesmo nome no topo dão erro de sintaxe e derrubam o arquivo.
const ICONE_PLANO_RESUMO = `
  <div class="w-14 h-14 rounded-xl bg-petroleo/10 flex items-center justify-center shrink-0">
    <svg width="24" height="24" viewBox="0 0 100 100" fill="none"><path d="M8 52 L28 52 L36 40 L46 64 L56 30 L64 52 L92 52" stroke="#425B63" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div>`;

function linhaItem(i) {
  const foto = i.imagem && i.imagem.startsWith('img/')
    ? `<img src="${escapeHtml(i.imagem)}" alt="" class="w-14 h-14 rounded-xl object-cover bg-grafite/5 shrink-0">`
    : ICONE_PLANO_RESUMO;
  const controles = i.tipo === 'PLANO'
    ? `<p class="text-xs text-grafite/50 mt-1">Plano de assinatura</p>`
    : `<div class="flex items-center gap-1 mt-1">
         <button type="button" data-acao="menos" data-tipo="${i.tipo}" data-id="${i.id}" aria-label="Diminuir quantidade de ${escapeHtml(i.nome)}" class="w-6 h-6 rounded-full border border-grafite/20 hover:bg-grafite/5 text-sm font-bold">−</button>
         <span class="w-6 text-center text-sm font-semibold">${i.quantidade}</span>
         <button type="button" data-acao="mais" data-tipo="${i.tipo}" data-id="${i.id}" aria-label="Aumentar quantidade de ${escapeHtml(i.nome)}" class="w-6 h-6 rounded-full border border-grafite/20 hover:bg-grafite/5 text-sm font-bold">+</button>
       </div>`;
  return `
    <div class="flex gap-3 py-3 border-b border-grafite/10 last:border-0">
      ${foto}
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-[13px] leading-snug">${escapeHtml(i.nome)}</p>
        ${controles}
      </div>
      <div class="text-right shrink-0">
        <p class="font-bold text-sm">${formatarPreco(i.preco * i.quantidade)}</p>
        <button type="button" data-acao="remover" data-tipo="${i.tipo}" data-id="${i.id}" class="text-[11px] text-grafite/40 hover:text-terracota mt-2">Remover</button>
      </div>
    </div>`;
}

function atualizarResumo() {
  const itens = Carrinho.itens();
  if (itens.length === 0) { renderVazio(); return; }

  document.getElementById('resumoItens').innerHTML = itens.map(linhaItem).join('');
  document.getElementById('resumoTotal').textContent = formatarPreco(Carrinho.total());
  document.getElementById('avisoRetirada').classList.toggle('hidden', !itens.some((i) => i.tipo === 'PRODUTO'));
  atualizarParcelas();
  atualizarBotaoPagar();
}

function atualizarParcelas() {
  const select = document.getElementById('cartaoParcelas');
  if (!select) return;
  const total = Carrinho.total();
  const maximo = Math.max(1, Math.min(MAX_PARCELAS, Math.floor(total / PARCELA_MINIMA)));
  const escolhida = Math.min(Number(select.value) || 1, maximo);
  select.innerHTML = Array.from({ length: maximo }, (_, k) => k + 1)
    .map((n) => `<option value="${n}" ${n === escolhida ? 'selected' : ''}>${n}x de ${formatarPreco(total / n)} ${n === 1 ? '(à vista)' : 'sem juros'}</option>`)
    .join('');
}

function atualizarBotaoPagar() {
  const total = formatarPreco(Carrinho.total());
  const rotulo = {
    CARTAO: `Pagar ${total}`,
    PIX: 'Gerar QR Code Pix',
    BOLETO: 'Gerar boleto',
  }[metodo];
  document.getElementById('btnPagarTexto').textContent = rotulo;
}

/* ------------------------------ Telas simples ------------------------------ */

function renderVazio() {
  limparTimers();
  emFormulario = false;
  raiz.innerHTML = `
    <div class="bg-white border border-grafite/10 rounded-2xl p-10 text-center max-w-lg">
      <p class="font-bold text-lg mb-1">Seu carrinho está vazio</p>
      <p class="text-grafite/60 text-sm mb-6">Escolha um plano ou um produto na loja para continuar.</p>
      <a href="loja.html" class="inline-block px-6 py-3 rounded-full bg-petroleo text-white text-sm font-semibold hover:opacity-90 transition">Ir para a loja</a>
    </div>`;
}

function renderExpirado(pedido) {
  limparTimers();
  emFormulario = false;
  raiz.innerHTML = `
    <div class="bg-white border border-grafite/10 rounded-2xl p-8 max-w-lg">
      <div class="w-12 h-12 rounded-full bg-terracota/15 flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#C47A52" stroke-width="2"/><path d="M12 7v5l3 2" stroke="#C47A52" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <h2 class="text-xl font-extrabold mb-1">Pedido #${pedido.id} expirado</h2>
      <p class="text-grafite/60 text-sm mb-6">O prazo para pagar com ${escapeHtml(NOME_METODO[pedido.metodo] || pedido.metodo)} terminou. Seus itens continuam no carrinho — é só gerar um novo pagamento.</p>
      <a href="checkout.html" class="inline-block px-6 py-3 rounded-full bg-petroleo text-white text-sm font-semibold hover:opacity-90 transition">Voltar ao pagamento</a>
    </div>`;
}

function renderConfirmado(pedido) {
  limparTimers();
  emFormulario = false;

  // Só esvazia o carrinho se ESTE pedido é o que acabamos de pagar (e não um pedido antigo reaberto pelo link).
  try {
    if (sessionStorage.getItem(CHAVE_PEDIDO_ABERTO) === String(pedido.id)) {
      Carrinho.limpar();
      sessionStorage.removeItem(CHAVE_PEDIDO_ABERTO);
    }
  } catch { /* sem sessionStorage: segue */ }

  const linhas = pedido.itens
    .map((i) => `
      <div class="flex justify-between gap-4 text-sm py-2 border-b border-grafite/10 last:border-0">
        <span>${i.quantidade}× ${escapeHtml(i.nome)}</span>
        <span class="font-semibold shrink-0">${formatarPreco(i.preco_unit * i.quantidade)}</span>
      </div>`)
    .join('');

  const detalhePagamento = pedido.metodo === 'CARTAO'
    ? `${escapeHtml(NOME_BANDEIRA[pedido.bandeira] || 'Cartão')} final ${escapeHtml(pedido.cartao_final || '')} · ${pedido.parcelas}x`
    : escapeHtml(NOME_METODO[pedido.metodo] || pedido.metodo);
  const temProduto = pedido.itens.some((i) => i.tipo === 'PRODUTO');

  raiz.innerHTML = `
    <div class="bg-white border border-grafite/10 rounded-2xl p-8 max-w-lg">
      <div class="w-12 h-12 rounded-full bg-oliva/15 flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#7C8A5A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h2 class="text-xl font-extrabold mb-1">Pagamento confirmado!</h2>
      <p class="text-grafite/60 text-sm mb-5">Pedido #${pedido.id} · ${detalhePagamento} (simulado)</p>
      ${pedido.vencimento
        ? `<div class="bg-oliva/10 text-oliva rounded-xl px-4 py-3 text-sm font-semibold mb-4">Seu plano está ativo até ${formatarDataISO(pedido.vencimento)}.</div>`
        : ''}
      ${temProduto
        ? `<div class="bg-petroleo/10 text-petroleo rounded-xl px-4 py-3 text-sm mb-4">Retire seus produtos na recepção da academia. <a href="index.html#onde-estamos" class="font-semibold underline">Ver no mapa</a></div>`
        : ''}
      <div class="mb-4">${linhas}</div>
      <div class="flex justify-between font-extrabold text-lg border-t border-grafite/15 pt-4 mb-6">
        <span>Total</span><span>${formatarPreco(pedido.total)}</span>
      </div>
      <div class="flex flex-wrap gap-3 print:hidden">
        <a href="index.html" class="px-6 py-3 rounded-full bg-petroleo text-white text-sm font-semibold hover:opacity-90 transition">Voltar ao início</a>
        <a href="loja.html" class="px-6 py-3 rounded-full border border-grafite/20 text-sm font-semibold hover:bg-grafite/5 transition">Continuar na loja</a>
      </div>
    </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------- Aguardando Pix / boleto ------------------------- */

const botaoCopiar = (alvoId, texto) => `
  <button type="button" data-copiar="${alvoId}" class="shrink-0 px-4 py-2 rounded-full border border-grafite/20 text-sm font-semibold hover:bg-grafite/5 transition">${texto}</button>`;

/** Barras decorativas a partir dos dígitos (não é um código de barras válido de propósito). */
function desenharBarras(digitos) {
  let x = 0;
  const barras = [];
  const larguras = [1, 2, 3, 1, 2, 4];
  digitos.split('').forEach((d, i) => {
    const n = Number(d);
    const w1 = larguras[(n + i) % larguras.length];
    const w2 = larguras[(n * 3 + 1) % larguras.length];
    barras.push(`<rect x="${x}" y="0" width="${w1}" height="60" fill="#1F1F1F"/>`);
    x += w1 + 2;
    barras.push(`<rect x="${x}" y="0" width="${w2}" height="60" fill="#1F1F1F"/>`);
    x += w2 + 1;
  });
  return `<svg viewBox="0 0 ${x} 60" preserveAspectRatio="none" class="w-full h-14" role="img" aria-label="Código de barras (ilustrativo)">${barras.join('')}</svg>`;
}

function renderAguardando(pedido) {
  limparTimers();
  emFormulario = false;
  const ehPix = pedido.metodo === 'PIX';
  const codigo = pedido.pagamento?.codigo || '';
  const prazo = dataUTC(pedido.expira_em);

  const qr = ehPix && String(pedido.pagamento?.qrcode || '').startsWith('data:image/png;base64,')
    ? `<img src="${pedido.pagamento.qrcode}" alt="QR Code do Pix (demonstração)" class="w-56 h-56 rounded-xl border border-grafite/10 bg-white p-2">`
    : '';

  const passos = ehPix
    ? ['Abra o app do seu banco e escolha <strong>Pix</strong>.', 'Leia o QR Code ou use o <strong>Pix Copia e Cola</strong>.', 'Confira o valor e confirme o pagamento.']
    : ['Copie a <strong>linha digitável</strong> ou imprima o boleto.', 'Pague no app do banco, em casa lotérica ou agência.', 'A compensação leva até <strong>2 dias úteis</strong>.'];

  raiz.innerHTML = `
    <div class="grid lg:grid-cols-5 gap-8 items-start">
      <section class="lg:col-span-3 bg-white border border-grafite/10 rounded-2xl p-6 md:p-8" aria-live="polite">
        <p class="text-xs font-semibold tracking-wide text-petroleo mb-1">PEDIDO #${pedido.id}</p>
        <h2 class="text-xl font-extrabold mb-1">${ehPix ? 'Pague com Pix' : 'Boleto gerado'}</h2>
        <p class="text-3xl font-extrabold mb-5">${formatarPreco(pedido.total)}</p>

        ${ehPix ? `
          <div class="flex justify-center mb-5">${qr}</div>
          <label class="text-xs font-semibold text-grafite/60" for="codigoPagamento">Pix Copia e Cola</label>
          <div class="flex gap-2 mt-1 mb-4">
            <input id="codigoPagamento" readonly value="${escapeHtml(codigo)}" class="flex-1 min-w-0 border border-grafite/15 rounded-xl px-4 py-3 text-xs font-mono bg-grafite/[0.03]">
            ${botaoCopiar('codigoPagamento', 'Copiar')}
          </div>
          <p id="contagem" class="text-sm font-semibold text-terracota mb-1"></p>` : `
          <div class="border border-grafite/15 rounded-xl p-4 mb-4 bg-white">${desenharBarras(codigo.replace(/\D/g, ''))}</div>
          <label class="text-xs font-semibold text-grafite/60" for="codigoPagamento">Linha digitável</label>
          <div class="flex gap-2 mt-1 mb-4">
            <input id="codigoPagamento" readonly value="${escapeHtml(codigo)}" class="flex-1 min-w-0 border border-grafite/15 rounded-xl px-3 py-3 text-xs font-mono bg-grafite/[0.03]">
            ${botaoCopiar('codigoPagamento', 'Copiar')}
          </div>
          <p class="text-sm text-grafite/70 mb-1">Vencimento: <strong>${prazo.toLocaleDateString('pt-BR')}</strong></p>
          <p id="contagem" class="text-xs text-grafite/50 mb-1"></p>
          <button type="button" onclick="window.print()" class="mt-2 text-sm font-semibold text-petroleo underline print:hidden">Imprimir boleto</button>`}

        <p class="flex items-center gap-2 text-sm text-grafite/60 mt-4">
          <svg class="spinner shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#425B63" stroke-opacity=".25" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#425B63" stroke-width="3" stroke-linecap="round"/></svg>
          Aguardando a confirmação do pagamento…
        </p>
      </section>

      <aside class="lg:col-span-2 flex flex-col gap-4 print:hidden">
        <div class="bg-white border border-grafite/10 rounded-2xl p-6">
          <h3 class="font-bold mb-3">Como pagar</h3>
          <ol class="flex flex-col gap-3 text-sm text-grafite/70">
            ${passos.map((p, n) => `<li class="flex gap-3"><span class="w-6 h-6 rounded-full bg-petroleo/10 text-petroleo text-xs font-bold flex items-center justify-center shrink-0">${n + 1}</span><span>${p}</span></li>`).join('')}
          </ol>
        </div>
        <div class="bg-grafite/[0.04] border border-dashed border-grafite/20 rounded-2xl p-6">
          <p class="text-xs font-semibold tracking-wide text-grafite/50 mb-1">AMBIENTE DE DEMONSTRAÇÃO</p>
          <p class="text-sm text-grafite/70 mb-4">Nenhum banco participa deste pagamento. Use o botão para simular o aviso de “pago” que o banco enviaria.</p>
          <button id="btnSimularPagamento" type="button" class="w-full py-3 rounded-full bg-petroleo text-white text-sm font-semibold hover:opacity-90 transition">Simular pagamento</button>
        </div>
      </aside>
    </div>`;

  // Contagem regressiva (Pix) / prazo restante (boleto).
  const atualizarContagem = () => {
    const falta = prazo.getTime() - Date.now();
    const rotulo = document.getElementById('contagem');
    if (!rotulo) return;
    if (falta <= 0) { consultarPedido(pedido.id); return; }
    if (ehPix) {
      const m = String(Math.floor(falta / 60000)).padStart(2, '0');
      const s = String(Math.floor((falta % 60000) / 1000)).padStart(2, '0');
      rotulo.textContent = `Este código expira em ${m}:${s}`;
    } else {
      rotulo.textContent = `Restam ${Math.ceil(falta / 86400000)} dia(s) para pagar.`;
    }
  };
  atualizarContagem();
  timers.push(setInterval(atualizarContagem, 1000));
  timers.push(setInterval(() => consultarPedido(pedido.id), 4000)); // acompanha o status
}

/** Busca o pedido e mostra a tela certa para o status atual. */
async function consultarPedido(id) {
  try {
    const { pedido } = await Api.obterPedido(id);
    if (pedido.status === 'PAGO') return renderConfirmado(pedido);
    if (pedido.status === 'EXPIRADO') return renderExpirado(pedido);
    // Ainda pendente: só redesenha se estivermos fora da tela de espera (ex.: link direto).
    if (!document.getElementById('btnSimularPagamento')) renderAguardando(pedido);
  } catch (erro) {
    if (!Auth.estaLogado()) { Auth.exigirLogin(); return; }
    limparTimers();
    showToast(erro.message, 'error');
    if (!document.getElementById('btnSimularPagamento')) {
      raiz.innerHTML = `<p class="text-terracota text-sm">${escapeHtml(erro.message)} <a href="loja.html" class="underline">Voltar à loja</a></p>`;
    }
  }
}

async function simularPagamento(pedidoId, botao) {
  botao.disabled = true;
  botao.textContent = 'Confirmando…';
  try {
    await esperar(900); // pequena pausa para parecer a resposta de um banco
    const { pedido } = await Api.pagarPedido(pedidoId);
    renderConfirmado(pedido);
  } catch (erro) {
    showToast(erro.message, 'error');
    botao.disabled = false;
    botao.textContent = 'Simular pagamento';
  }
}

/* -------------------------------- Formulário -------------------------------- */

function renderFormulario() {
  limparTimers();
  emFormulario = true;

  const abas = ['PIX', 'CARTAO', 'BOLETO'].map((m) => `
    <label class="cursor-pointer">
      <input type="radio" name="metodo" value="${m}" class="peer sr-only" ${m === metodo ? 'checked' : ''}>
      <div class="border border-grafite/15 rounded-xl px-3 py-3 text-center text-sm font-semibold transition peer-checked:border-petroleo peer-checked:bg-petroleo/5 peer-checked:text-petroleo peer-focus-visible:ring-2 peer-focus-visible:ring-petroleo">${NOME_METODO[m].replace(' de crédito', '').replace(' bancário', '')}</div>
    </label>`).join('');

  raiz.innerHTML = `
    <div class="grid lg:grid-cols-5 gap-8 items-start">

      <section class="lg:col-span-3 bg-white border border-grafite/10 rounded-2xl p-6 md:p-8 relative" aria-label="Pagamento">
        <h2 class="font-bold mb-4">Forma de pagamento</h2>
        <div class="grid grid-cols-3 gap-3 mb-6" role="radiogroup" aria-label="Forma de pagamento">${abas}</div>

        <!-- PIX -->
        <div id="painelPIX" class="text-sm text-grafite/70 leading-relaxed">
          <p class="mb-2"><strong class="text-grafite">Aprovação em segundos.</strong> Você verá um QR Code e o código “copia e cola”, válidos por 15 minutos.</p>
        </div>

        <!-- CARTÃO -->
        <form id="formCartao" class="hidden flex-col gap-4" novalidate autocomplete="on">
          <div>
            <label for="cartaoNumero" class="text-xs font-semibold text-grafite/60">Número do cartão</label>
            <div class="relative">
              <input id="cartaoNumero" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="19"
                class="w-full mt-1 border border-grafite/15 rounded-xl pl-4 pr-24 py-3 text-sm font-mono focus:outline-none focus:border-petroleo" aria-describedby="erro-cartaoNumero">
              <span id="cartaoBandeira" class="absolute right-4 top-1/2 -translate-y-1/2 mt-0.5 text-xs font-bold text-petroleo"></span>
            </div>
            <p id="erro-cartaoNumero" class="text-xs text-terracota mt-1 min-h-[16px]"></p>
          </div>
          <div>
            <label for="cartaoNome" class="text-xs font-semibold text-grafite/60">Nome impresso no cartão</label>
            <input id="cartaoNome" autocomplete="cc-name" placeholder="COMO ESTÁ NO CARTÃO" maxlength="40" style="text-transform:uppercase"
              class="w-full mt-1 border border-grafite/15 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-petroleo" aria-describedby="erro-cartaoNome">
            <p id="erro-cartaoNome" class="text-xs text-terracota mt-1 min-h-[16px]"></p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="cartaoValidade" class="text-xs font-semibold text-grafite/60">Validade</label>
              <input id="cartaoValidade" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5"
                class="w-full mt-1 border border-grafite/15 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-petroleo" aria-describedby="erro-cartaoValidade">
              <p id="erro-cartaoValidade" class="text-xs text-terracota mt-1 min-h-[16px]"></p>
            </div>
            <div>
              <label for="cartaoCvv" class="text-xs font-semibold text-grafite/60">CVV</label>
              <input id="cartaoCvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" type="password"
                class="w-full mt-1 border border-grafite/15 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-petroleo" aria-describedby="erro-cartaoCvv">
              <p id="erro-cartaoCvv" class="text-xs text-terracota mt-1 min-h-[16px]"></p>
            </div>
          </div>
          <div>
            <label for="cartaoParcelas" class="text-xs font-semibold text-grafite/60">Parcelas</label>
            <select id="cartaoParcelas" class="w-full mt-1 border border-grafite/15 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-petroleo"></select>
          </div>
          <div id="erroCartaoGeral" role="alert" class="hidden bg-terracota/10 text-terracota text-sm font-semibold rounded-xl px-4 py-3"></div>
          <div class="bg-grafite/[0.04] rounded-xl px-4 py-3 text-xs text-grafite/60 leading-relaxed">
            <strong class="text-grafite/80">Demonstração:</strong> não use um cartão real. Para testar:
            <button type="button" id="usarCartaoTeste" class="font-semibold text-petroleo underline">preencher cartão de teste aprovado</button>
            ou digite <span class="font-mono">4000 0000 0000 0002</span> para ver um pagamento recusado.
            O número e o CVV ficam só no seu navegador — o servidor recebe apenas a bandeira e os 4 últimos dígitos.
          </div>
        </form>

        <!-- BOLETO -->
        <div id="painelBOLETO" class="hidden text-sm text-grafite/70 leading-relaxed">
          <p class="mb-2"><strong class="text-grafite">Vence em 3 dias.</strong> Você poderá copiar a linha digitável ou imprimir. A compensação leva até 2 dias úteis.</p>
        </div>

        <div id="sobreposicao" class="hidden absolute inset-0 bg-white/90 rounded-2xl flex-col items-center justify-center gap-3 z-10" aria-live="assertive">
          <svg class="spinner" width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#425B63" stroke-opacity=".25" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#425B63" stroke-width="3" stroke-linecap="round"/></svg>
          <p class="font-semibold text-sm" id="sobreposicaoTexto">Processando pagamento…</p>
          <p class="text-xs text-grafite/50">Não feche esta página.</p>
        </div>
      </section>

      <aside class="lg:col-span-2 bg-white border border-grafite/10 rounded-2xl p-6 lg:sticky lg:top-6" aria-label="Resumo do pedido">
        <h2 class="font-bold mb-1">Resumo do pedido</h2>
        <div id="resumoItens"></div>
        <div id="avisoRetirada" class="hidden text-xs text-petroleo bg-petroleo/10 rounded-xl px-3 py-2 mt-3">Produtos: retirada na recepção da academia (sem frete). <a href="loja.html#retirada" target="_blank" rel="noopener" class="font-semibold underline">Ver como chegar</a></div>
        <div class="flex items-center justify-between border-t border-grafite/10 pt-5 mt-4 mb-5">
          <span class="text-grafite/60 text-sm">Total</span>
          <span id="resumoTotal" class="text-2xl font-extrabold"></span>
        </div>
        <button id="btnPagar" type="button" class="w-full py-3.5 rounded-full bg-petroleo text-white font-semibold hover:opacity-90 transition flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2"/></svg>
          <span id="btnPagarTexto"></span>
        </button>
        <p class="text-[11px] text-grafite/45 leading-relaxed mt-4">Ambiente de demonstração (projeto escolar): nenhuma cobrança real é feita.</p>
      </aside>
    </div>`;

  mostrarPainel();
  atualizarResumo();
}

function mostrarPainel() {
  document.getElementById('painelPIX').classList.toggle('hidden', metodo !== 'PIX');
  document.getElementById('painelBOLETO').classList.toggle('hidden', metodo !== 'BOLETO');
  const cartao = document.getElementById('formCartao');
  cartao.classList.toggle('hidden', metodo !== 'CARTAO');
  cartao.classList.toggle('flex', metodo === 'CARTAO');
  atualizarBotaoPagar();
}

/* ---------------------------- Validação do cartão ---------------------------- */

const erros = {};
function mostrarErro(campo, mensagem) {
  erros[campo] = mensagem;
  const caixa = document.getElementById(`erro-${campo}`);
  const input = document.getElementById(campo);
  if (caixa) caixa.textContent = mensagem || '';
  if (input) {
    input.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
    input.classList.toggle('border-terracota', !!mensagem);
  }
  return !mensagem;
}

function validarCampo(campo) {
  const valor = document.getElementById(campo).value;
  switch (campo) {
    case 'cartaoNumero': {
      const n = soDigitos(valor);
      const amex = bandeiraDe(n) === 'AMEX';
      if (n.length < (amex ? 15 : 16) || !luhn(n)) return mostrarErro(campo, 'Número de cartão inválido. Confira os dígitos.');
      return mostrarErro(campo, '');
    }
    case 'cartaoNome':
      return mostrarErro(campo, /^[A-Za-zÀ-ÿ' .-]{3,}$/.test(valor.trim()) ? '' : 'Informe o nome como está no cartão.');
    case 'cartaoValidade': {
      const m = valor.match(/^(\d{2})\/(\d{2})$/);
      if (!m) return mostrarErro(campo, 'Use o formato MM/AA.');
      const mes = Number(m[1]);
      const ano = 2000 + Number(m[2]);
      const agora = new Date();
      if (mes < 1 || mes > 12) return mostrarErro(campo, 'Mês inválido.');
      if (ano < agora.getFullYear() || (ano === agora.getFullYear() && mes < agora.getMonth() + 1)) {
        return mostrarErro(campo, 'Cartão vencido.');
      }
      if (ano > agora.getFullYear() + 20) return mostrarErro(campo, 'Validade inválida.');
      return mostrarErro(campo, '');
    }
    case 'cartaoCvv': {
      const tamanho = bandeiraDe(soDigitos(document.getElementById('cartaoNumero').value)) === 'AMEX' ? 4 : 3;
      return mostrarErro(campo, soDigitos(valor).length === tamanho ? '' : `O CVV tem ${tamanho} dígitos.`);
    }
    default:
      return true;
  }
}

const CAMPOS_CARTAO = ['cartaoNumero', 'cartaoNome', 'cartaoValidade', 'cartaoCvv'];

function configurarCartao() {
  const numero = document.getElementById('cartaoNumero');
  const validade = document.getElementById('cartaoValidade');
  const cvv = document.getElementById('cartaoCvv');

  numero.addEventListener('input', () => {
    const digitos = soDigitos(numero.value);
    numero.value = formatarNumeroCartao(digitos);
    const b = bandeiraDe(digitos);
    document.getElementById('cartaoBandeira').textContent = digitos.length >= 1 ? NOME_BANDEIRA[b] : '';
    cvv.maxLength = b === 'AMEX' ? 4 : 3;
  });
  validade.addEventListener('input', () => {
    const d = soDigitos(validade.value).slice(0, 4);
    validade.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  });
  cvv.addEventListener('input', () => { cvv.value = soDigitos(cvv.value); });
  CAMPOS_CARTAO.forEach((id) => document.getElementById(id).addEventListener('blur', () => validarCampo(id)));
  // Enter dentro do formulário paga (e não recarrega a página).
  document.getElementById('formCartao').addEventListener('submit', (e) => { e.preventDefault(); pagar(); });

  document.getElementById('usarCartaoTeste').addEventListener('click', () => {
    numero.value = '4242 4242 4242 4242';
    numero.dispatchEvent(new Event('input'));
    document.getElementById('cartaoNome').value = 'CLIENTE TESTE';
    validade.value = `12/${String((new Date().getFullYear() + 3) % 100).padStart(2, '0')}`;
    cvv.value = '123';
    CAMPOS_CARTAO.forEach(validarCampo);
  });
}

/* --------------------------------- Pagar --------------------------------- */

function sobreposicao(texto) {
  const caixa = document.getElementById('sobreposicao');
  if (!caixa) return;
  document.getElementById('sobreposicaoTexto').textContent = texto || '';
  caixa.classList.toggle('hidden', !texto);
  caixa.classList.toggle('flex', !!texto);
}

async function criarPedido(pagamento) {
  const { pedido } = await Api.criarPedido(Carrinho.itens(), pagamento);
  try { sessionStorage.setItem(CHAVE_PEDIDO_ABERTO, String(pedido.id)); } catch { /* ignora */ }
  history.replaceState(null, '', `checkout.html?pedido=${pedido.id}`);
  return pedido;
}

async function pagar() {
  const botao = document.getElementById('btnPagar');
  const geral = document.getElementById('erroCartaoGeral');
  geral.classList.add('hidden');

  let pagamento = { metodo };

  if (metodo === 'CARTAO') {
    const validos = CAMPOS_CARTAO.map(validarCampo);
    if (validos.includes(false)) {
      document.getElementById(CAMPOS_CARTAO[validos.indexOf(false)]).focus();
      return;
    }
    const digitos = soDigitos(document.getElementById('cartaoNumero').value);
    pagamento = {
      metodo,
      parcelas: Number(document.getElementById('cartaoParcelas').value) || 1,
      bandeira: bandeiraDe(digitos),
      cartaoFinal: digitos.slice(-4), // é TUDO que o servidor recebe do cartão
    };

    botao.disabled = true;
    sobreposicao('Processando pagamento…');
    await esperar(1600); // tempo de "operadora"

    // Cartão de teste recusado (decisão local: o número nunca é enviado ao servidor).
    if (digitos === '4000000000000002') {
      sobreposicao('');
      botao.disabled = false;
      geral.textContent = 'Pagamento recusado pelo emissor do cartão. Verifique os dados ou use outro cartão.';
      geral.classList.remove('hidden');
      return;
    }
  } else {
    botao.disabled = true;
    sobreposicao(metodo === 'PIX' ? 'Gerando QR Code…' : 'Gerando boleto…');
    await esperar(700);
  }

  try {
    const pedido = await criarPedido(pagamento);
    sobreposicao('');
    if (pedido.status === 'PAGO') renderConfirmado(pedido);
    else renderAguardando(pedido);
  } catch (erro) {
    sobreposicao('');
    botao.disabled = false;
    if (!Auth.estaLogado()) { Auth.exigirLogin(); return; }
    if (metodo === 'CARTAO') {
      geral.textContent = erro.message;
      geral.classList.remove('hidden');
    }
    showToast(erro.message, 'error');
  }
}

/* -------------------------------- Eventos -------------------------------- */

raiz.addEventListener('click', (e) => {
  if (e.target.closest('#btnPagar')) return pagar();

  const copiar = e.target.closest('[data-copiar]');
  if (copiar) {
    copiarTexto(document.getElementById(copiar.dataset.copiar).value).then((ok) => {
      showToast(ok ? 'Código copiado!' : 'Não foi possível copiar. Selecione o texto e copie manualmente.', ok ? 'success' : 'error');
    });
    return;
  }

  const simular = e.target.closest('#btnSimularPagamento');
  if (simular) {
    const id = Number(new URLSearchParams(window.location.search).get('pedido'));
    return simularPagamento(id, simular);
  }

  const alvo = e.target.closest('[data-acao]');
  if (!alvo) return;
  const { acao, tipo } = alvo.dataset;
  const id = Number(alvo.dataset.id);
  if (acao === 'mais') Carrinho.alterarQuantidade(tipo, id, 1);
  if (acao === 'menos') Carrinho.alterarQuantidade(tipo, id, -1);
  if (acao === 'remover') Carrinho.remover(tipo, id);
});

raiz.addEventListener('change', (e) => {
  if (e.target.name === 'metodo') { metodo = e.target.value; mostrarPainel(); }
});

document.addEventListener('carrinho:atualizado', () => {
  if (emFormulario) atualizarResumo();
});

/* ------------------------------- Inicialização ------------------------------- */

function iniciar() {
  const pedidoId = Number(new URLSearchParams(window.location.search).get('pedido'));
  if (pedidoId > 0) return consultarPedido(pedidoId); // link direto para um pedido (Pix/boleto em aberto, etc.)

  if (Carrinho.itens().length === 0) return renderVazio();
  renderFormulario();
  configurarCartao();
}

iniciar();
