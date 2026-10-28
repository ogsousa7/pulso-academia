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
let cupomAplicado = null;   // { codigo, descricao, desconto } — confirmado pelo servidor
let academia = null;        // endereço e horários para o bloco de retirada

/** Total a pagar = soma do carrinho − desconto do cupom (o servidor refaz a mesma conta). */
const totalAPagar = () => Math.max(0, Math.round((Carrinho.total() - (cupomAplicado?.desconto || 0)) * 100) / 100);

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
    ? `<img src="${escapeHtml(i.imagem)}" alt="" onerror="fotoReserva(this)" class="w-14 h-14 rounded-xl object-cover bg-offwhite shrink-0">`
    : ICONE_PLANO_RESUMO;
  const controles = i.tipo === 'PLANO'
    ? `<p class="text-xs text-grafite/65 mt-1">Plano de assinatura</p>`
    : `<div class="flex items-center gap-1 mt-1">
         <button type="button" data-acao="menos" data-tipo="${i.tipo}" data-id="${i.id}" aria-label="Diminuir quantidade de ${escapeHtml(i.nome)}" class="w-6 h-6 rounded-full bg-tinta/[0.06] hover:bg-tinta/10 text-sm font-bold">−</button>
         <span class="w-6 text-center text-sm font-semibold">${i.quantidade}</span>
         <button type="button" data-acao="mais" data-tipo="${i.tipo}" data-id="${i.id}" aria-label="Aumentar quantidade de ${escapeHtml(i.nome)}" class="w-6 h-6 rounded-full bg-tinta/[0.06] hover:bg-tinta/10 text-sm font-bold">+</button>
       </div>`;
  return `
    <div class="flex gap-3 py-3 border-b border-tinta/[0.06] last:border-0">
      ${foto}
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-[14px] leading-snug">${escapeHtml(i.nome)}</p>
        ${controles}
      </div>
      <div class="text-right shrink-0">
        <p class="font-semibold text-[14px] tabular-nums">${formatarPreco(i.preco * i.quantidade)}</p>
        <button type="button" data-acao="remover" data-tipo="${i.tipo}" data-id="${i.id}" class="text-[11px] text-grafite/65 hover:text-terracota mt-2">Remover</button>
      </div>
    </div>`;
}

function atualizarResumo() {
  const itens = Carrinho.itens();
  if (itens.length === 0) { renderVazio(); return; }

  const qtd = itens.reduce((n, i) => n + i.quantidade, 0);
  document.getElementById('resumoItens').innerHTML = itens.map(linhaItem).join('');
  document.getElementById('resumoQtd').textContent = `${qtd} ${qtd === 1 ? 'item' : 'itens'}`;
  document.getElementById('resumoSubtotal').textContent = formatarPreco(Carrinho.total());
  const temProduto = itens.some((i) => i.tipo === 'PRODUTO');
  document.getElementById('linhaRetirada').classList.toggle('hidden', !temProduto);
  document.getElementById('linhaDesconto').classList.toggle('hidden', !cupomAplicado);
  if (cupomAplicado) {
    document.getElementById('resumoDesconto').textContent = `− ${formatarPreco(cupomAplicado.desconto)}`;
    document.getElementById('rotuloDesconto').textContent = `Cupom ${cupomAplicado.codigo}`;
  }
  document.getElementById('resumoTotal').textContent = formatarPreco(totalAPagar());
  const maxParcelas = Math.max(1, Math.min(MAX_PARCELAS, Math.floor(totalAPagar() / PARCELA_MINIMA)));
  document.getElementById('resumoParcelado').textContent = maxParcelas > 1
    ? `ou até ${maxParcelas}x de ${formatarPreco(totalAPagar() / maxParcelas)} sem juros`
    : '';
  renderRecebimento(itens);
  atualizarParcelas();
  atualizarBotaoPagar();
}

/** Bloco "Como você recebe": retirada dos produtos e/ou ativação do plano. */
function renderRecebimento(itens) {
  const caixa = document.getElementById('blocoRecebimento');
  if (!caixa) return;
  const plano = itens.find((i) => i.tipo === 'PLANO');
  const produtos = itens.filter((i) => i.tipo === 'PRODUTO');
  const linhas = [];
  if (produtos.length) {
    linhas.push(`
      <div class="flex gap-4 px-5 py-4">
        <span class="w-10 h-10 rounded-full bg-petroleo/10 text-petroleo flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5V20H3v-9.5Z"/><path d="M9.5 20v-5h5v5"/></svg>
        </span>
        <div class="min-w-0">
          <p class="text-[15px] font-semibold">Retirada na recepção <span class="ml-1 text-oliva font-semibold">Grátis</span></p>
          <p class="text-[14px] text-grafite/65 mt-0.5">${escapeHtml(academia?.endereco || 'Recepção da Pulso Academia')}</p>
          <p class="text-[13px] text-grafite/65 mt-0.5">${escapeHtml([academia?.horario_semana, academia?.horario_sabado].filter(Boolean).join(' · ') || '')}</p>
          <p class="text-[13px] text-grafite/65 mt-1">Separamos ${produtos.length === 1 ? 'seu produto' : 'seus produtos'} assim que o pagamento for aprovado. Leve um documento com foto.</p>
        </div>
      </div>`);
  }
  if (plano) {
    linhas.push(`
      <div class="flex gap-4 px-5 py-4">
        <span class="w-10 h-10 rounded-full bg-oliva/10 text-oliva flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5l2 2 4-4"/></svg>
        </span>
        <div class="min-w-0">
          <p class="text-[15px] font-semibold">${escapeHtml(plano.nome)}: acesso liberado na hora</p>
          <p class="text-[14px] text-grafite/65 mt-0.5">Assim que o pagamento for aprovado, você já pode agendar aulas na sua área. Se ainda tiver um plano ativo, os dias novos são somados ao vencimento atual.</p>
        </div>
      </div>`);
  }
  caixa.innerHTML = linhas.join('');
}

function atualizarParcelas() {
  const select = document.getElementById('cartaoParcelas');
  if (!select) return;
  const total = totalAPagar();
  const maximo = Math.max(1, Math.min(MAX_PARCELAS, Math.floor(total / PARCELA_MINIMA)));
  const escolhida = Math.min(Number(select.value) || 1, maximo);
  select.innerHTML = Array.from({ length: maximo }, (_, k) => k + 1)
    .map((n) => `<option value="${n}" ${n === escolhida ? 'selected' : ''}>${n}x de ${formatarPreco(total / n)} ${n === 1 ? '(à vista)' : 'sem juros'}</option>`)
    .join('');
}

function atualizarBotaoPagar() {
  const total = formatarPreco(totalAPagar());
  const rotulo = {
    CARTAO: `Pagar ${total}`,
    PIX: 'Gerar QR Code Pix',
    BOLETO: 'Gerar boleto',
  }[metodo];
  document.getElementById('btnPagarTexto').textContent = rotulo;
  const barra = document.getElementById('btnPagarBarra');
  if (barra) {
    barra.textContent = rotulo;
    document.getElementById('barraTotal').textContent = total;
  }
}

/* --------------------------------- Etapas --------------------------------- */

/** Barra de etapas no topo: 1 Carrinho · 2 Pagamento · 3 Confirmação. */
function etapas(atual) {
  const nomes = ['Carrinho', 'Pagamento', 'Confirmação'];
  return `
    <ol class="flex items-center gap-2 md:gap-3 mb-8 text-[13px] md:text-[14px] print:hidden" aria-label="Etapas da compra">
      ${nomes.map((nome, i) => {
        const n = i + 1;
        const feito = n < atual;
        const agora = n === atual;
        const bolinha = feito
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          : n;
        return `
          <li class="flex items-center gap-2 ${agora ? 'text-grafite font-semibold' : feito ? 'text-petroleo font-medium' : 'text-grafite/65'}" ${agora ? 'aria-current="step"' : ''}>
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold ${agora ? 'bg-grafite text-superficie' : feito ? 'bg-petroleo/15 text-petroleo' : 'bg-tinta/[0.06]'}">${bolinha}</span>
            ${nome}
          </li>
          ${n < nomes.length ? '<li aria-hidden="true" class="flex-1 max-w-[64px] h-px bg-tinta/10"></li>' : ''}`;
      }).join('')}
    </ol>`;
}

/* ------------------------------ Telas simples ------------------------------ */

function renderVazio() {
  limparTimers();
  emFormulario = false;
  raiz.innerHTML = `
    <div class="bg-superficie rounded-3xl p-10 text-center max-w-lg mx-auto">
      <p class="font-bold text-[21px] mb-1">Seu carrinho está vazio</p>
      <p class="text-grafite/65 text-sm mb-6">Escolha um plano ou um produto na loja para continuar.</p>
      <a href="loja.html" class="inline-block px-6 py-3 rounded-full bg-petroleo text-white text-[15px] font-medium hover:brightness-110 transition">Ir para a loja</a>
    </div>`;
}

function renderExpirado(pedido) {
  limparTimers();
  emFormulario = false;
  raiz.innerHTML = `
    <div class="bg-superficie rounded-3xl p-8 max-w-lg">
      <div class="w-12 h-12 rounded-full bg-terracota/15 flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#C47A52" stroke-width="2"/><path d="M12 7v5l3 2" stroke="#C47A52" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <h2 class="text-xl font-bold mb-1">Pedido #${pedido.id} expirado</h2>
      <p class="text-grafite/65 text-sm mb-6">O prazo para pagar com ${escapeHtml(NOME_METODO[pedido.metodo] || pedido.metodo)} terminou. Seus itens continuam no carrinho — é só gerar um novo pagamento.</p>
      <a href="checkout.html" class="inline-block px-6 py-3 rounded-full bg-petroleo text-white text-[15px] font-medium hover:brightness-110 transition">Voltar ao pagamento</a>
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
      <div class="flex justify-between gap-4 text-[15px] py-2.5 border-b border-tinta/[0.06] last:border-0">
        <span>${i.quantidade}× ${escapeHtml(i.nome)}</span>
        <span class="font-semibold shrink-0">${formatarPreco(i.preco_unit * i.quantidade)}</span>
      </div>`)
    .join('');

  const detalhePagamento = pedido.metodo === 'CARTAO'
    ? `${escapeHtml(NOME_BANDEIRA[pedido.bandeira] || 'Cartão')} final ${escapeHtml(pedido.cartao_final || '')} · ${pedido.parcelas}x`
    : escapeHtml(NOME_METODO[pedido.metodo] || pedido.metodo);
  const temProduto = pedido.itens.some((i) => i.tipo === 'PRODUTO');

  const titulo = document.querySelector('main h1');
  if (titulo) titulo.textContent = 'Compra concluída';

  const proximos = [
    pedido.vencimento ? `Seu plano vale até <strong>${formatarDataISO(pedido.vencimento)}</strong>. Já dá para <a href="aluno.html" class="text-petroleo font-medium hover:underline">agendar sua primeira aula</a>.` : '',
    temProduto ? 'Retire seus produtos na recepção com um documento com foto. <a href="index.html#onde-estamos" class="text-petroleo font-medium hover:underline">Ver no mapa</a>' : '',
    'O comprovante fica salvo em <a href="aluno.html#pedidos" class="text-petroleo font-medium hover:underline">Meus pedidos</a>.',
  ].filter(Boolean);

  raiz.innerHTML = `
    ${etapas(4)}
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 lg:gap-8 items-start">
      <section class="bg-superficie rounded-3xl p-6 md:p-10 text-center">
        <div class="w-16 h-16 rounded-full bg-oliva/15 flex items-center justify-center mx-auto mb-5">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#6F7F4C" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h2 class="text-[28px] md:text-[34px] font-bold tracking-tight">Pagamento confirmado</h2>
        <p class="text-grafite/65 text-[15px] mt-2">Pedido nº ${pedido.id} · ${detalhePagamento} (simulado)</p>
        <ul class="mt-8 text-left max-w-md mx-auto flex flex-col gap-3 text-[15px] text-grafite/75">
          ${proximos.map((t) => `<li class="flex gap-3"><svg class="shrink-0 mt-0.5 text-petroleo" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4L19 7"/></svg><span>${t}</span></li>`).join('')}
        </ul>
        <div class="flex flex-wrap justify-center gap-3 mt-8 print:hidden">
          <a href="${pedido.vencimento ? 'aluno.html' : 'index.html'}" class="px-6 py-3 rounded-full bg-petroleo text-white text-[15px] font-medium hover:brightness-110 transition">${pedido.vencimento ? 'Ir para minha área' : 'Voltar ao início'}</a>
          <a href="loja.html" class="px-6 py-3 rounded-full bg-tinta/[0.06] text-[15px] font-medium hover:bg-tinta/10 transition">Continuar na loja</a>
          <button type="button" onclick="window.print()" class="px-6 py-3 rounded-full text-[15px] font-medium text-petroleo hover:underline">Imprimir comprovante</button>
        </div>
      </section>

      <aside class="bg-superficie rounded-3xl p-5 md:p-6">
        <h3 class="text-[19px] font-semibold tracking-tight mb-2">Itens do pedido</h3>
        <div>${linhas}</div>
        <dl class="mt-3 flex flex-col gap-2 text-[15px]">
          <div class="flex justify-between"><dt class="text-grafite/65">Subtotal</dt><dd class="tabular-nums">${formatarPreco(pedido.subtotal ?? pedido.total)}</dd></div>
          ${pedido.desconto > 0 ? `<div class="flex justify-between text-oliva"><dt>Cupom ${escapeHtml(pedido.cupom || '')}</dt><dd class="tabular-nums">− ${formatarPreco(pedido.desconto)}</dd></div>` : ''}
        </dl>
        <div class="flex justify-between items-end border-t border-tinta/[0.08] pt-4 mt-4">
          <span class="text-[17px] font-semibold">Total pago</span><span class="text-[24px] font-bold tracking-tight tabular-nums">${formatarPreco(pedido.total)}</span>
        </div>
      </aside>
    </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------- Aguardando Pix / boleto ------------------------- */

const botaoCopiar = (alvoId, texto) => `
  <button type="button" data-copiar="${alvoId}" class="shrink-0 px-4 py-2 rounded-full bg-tinta/[0.06] text-sm font-semibold hover:bg-tinta/10 transition">${texto}</button>`;

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
    ? `<img src="${pedido.pagamento.qrcode}" alt="QR Code do Pix (demonstração)" class="w-56 h-56 rounded-2xl bg-superficie p-2 ring-1 ring-tinta/5">`
    : '';

  const passos = ehPix
    ? ['Abra o app do seu banco e escolha <strong>Pix</strong>.', 'Leia o QR Code ou use o <strong>Pix Copia e Cola</strong>.', 'Confira o valor e confirme o pagamento.']
    : ['Copie a <strong>linha digitável</strong> ou imprima o boleto.', 'Pague no app do banco, em casa lotérica ou agência.', 'A compensação leva até <strong>2 dias úteis</strong>.'];

  raiz.innerHTML = `
    ${etapas(2)}
    <div class="grid lg:grid-cols-5 gap-8 items-start">
      <section class="lg:col-span-3 bg-superficie rounded-3xl p-6 md:p-8" aria-live="polite">
        <p class="text-[13px] font-semibold text-petroleo mb-1">Pedido nº ${pedido.id}</p>
        <h2 class="text-xl font-bold mb-1">${ehPix ? 'Pague com Pix' : 'Boleto gerado'}</h2>
        <p class="text-3xl font-bold ${pedido.desconto > 0 ? 'mb-1' : 'mb-5'}">${formatarPreco(pedido.total)}</p>
        ${pedido.desconto > 0 ? `<p class="text-[13px] text-oliva font-medium mb-5">Cupom ${escapeHtml(pedido.cupom || '')} aplicado: − ${formatarPreco(pedido.desconto)}</p>` : ''}

        ${ehPix ? `
          <div class="flex justify-center mb-5">${qr}</div>
          <label class="text-[13px] font-medium text-grafite/65" for="codigoPagamento">Pix Copia e Cola</label>
          <div class="flex gap-2 mt-1 mb-4">
            <input id="codigoPagamento" readonly value="${escapeHtml(codigo)}" class="flex-1 min-w-0 border border-grafite/15 rounded-xl px-4 py-3 text-xs font-mono bg-grafite/[0.03]">
            ${botaoCopiar('codigoPagamento', 'Copiar')}
          </div>
          <p id="contagem" class="text-sm font-semibold text-terracota mb-1"></p>` : `
          <div class="border border-grafite/15 rounded-xl p-4 mb-4 bg-superficie">${desenharBarras(codigo.replace(/\D/g, ''))}</div>
          <label class="text-[13px] font-medium text-grafite/65" for="codigoPagamento">Linha digitável</label>
          <div class="flex gap-2 mt-1 mb-4">
            <input id="codigoPagamento" readonly value="${escapeHtml(codigo)}" class="flex-1 min-w-0 border border-grafite/15 rounded-xl px-3 py-3 text-xs font-mono bg-grafite/[0.03]">
            ${botaoCopiar('codigoPagamento', 'Copiar')}
          </div>
          <p class="text-sm text-grafite/70 mb-1">Vencimento: <strong>${prazo.toLocaleDateString('pt-BR')}</strong></p>
          <p id="contagem" class="text-xs text-grafite/65 mb-1"></p>
          <button type="button" onclick="window.print()" class="mt-2 text-sm font-semibold text-petroleo underline print:hidden">Imprimir boleto</button>`}

        <p class="flex items-center gap-2 text-sm text-grafite/65 mt-4">
          <svg class="spinner shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#425B63" stroke-opacity=".25" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#425B63" stroke-width="3" stroke-linecap="round"/></svg>
          Aguardando a confirmação do pagamento…
        </p>
      </section>

      <aside class="lg:col-span-2 flex flex-col gap-4 print:hidden">
        <div class="bg-superficie rounded-3xl p-6">
          <h3 class="font-bold mb-3">Como pagar</h3>
          <ol class="flex flex-col gap-3 text-sm text-grafite/70">
            ${passos.map((p, n) => `<li class="flex gap-3"><span class="w-6 h-6 rounded-full bg-petroleo/10 text-petroleo text-xs font-bold flex items-center justify-center shrink-0">${n + 1}</span><span>${p}</span></li>`).join('')}
          </ol>
        </div>
        <div class="bg-superficie/60 border border-dashed border-linha rounded-3xl p-6">
          <p class="text-[13px] font-semibold text-grafite/65 mb-1">Ambiente de demonstração</p>
          <p class="text-sm text-grafite/70 mb-4">Nenhum banco participa deste pagamento. Use o botão para simular o aviso de “pago” que o banco enviaria.</p>
          <button id="btnSimularPagamento" type="button" class="w-full py-3 rounded-full bg-petroleo text-white text-[15px] font-medium hover:brightness-110 transition">Simular pagamento</button>
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

const ICONES_METODO = {
  PIX: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 2.8 21.2 12 12 21.2 2.8 12 12 2.8Z"/><path d="M8.2 8.6 12 12.4l3.8-3.8M8.2 15.4 12 11.6l3.8 3.8"/></svg>',
  CARTAO: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6 14.5h4"/></svg>',
  BOLETO: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14"/></svg>',
};
const SUBTITULO_METODO = {
  PIX: 'Aprovação na hora, com QR Code',
  CARTAO: 'Crédito em até 12x sem juros',
  BOLETO: 'Vence em 3 dias úteis',
};

function renderFormulario() {
  limparTimers();
  emFormulario = true;
  const usuario = Auth.getUsuario() || {};

  const opcoes = ['PIX', 'CARTAO', 'BOLETO'].map((m) => `
    <label class="flex items-center gap-4 px-5 py-4 cursor-pointer has-[:checked]:bg-petroleo/[0.05]">
      <input type="radio" name="metodo" value="${m}" class="peer sr-only" ${m === metodo ? 'checked' : ''}>
      <span class="w-10 h-10 rounded-full bg-offwhite text-grafite/70 flex items-center justify-center shrink-0 peer-checked:bg-petroleo peer-checked:text-white transition">${ICONES_METODO[m]}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-[16px] font-semibold">${NOME_METODO[m]}</span>
        <span class="block text-[13px] text-grafite/65">${SUBTITULO_METODO[m]}</span>
      </span>
      ${m === 'PIX' ? '<span class="hidden sm:inline px-2.5 py-0.5 rounded-full bg-oliva/10 text-oliva text-[12px] font-semibold">Mais rápido</span>' : ''}
      <span class="w-5 h-5 rounded-full ring-2 ring-tinta/15 flex items-center justify-center shrink-0 peer-checked:ring-petroleo peer-checked:[&>span]:scale-100" aria-hidden="true"><span class="w-2.5 h-2.5 rounded-full bg-petroleo scale-0 transition-transform"></span></span>
    </label>`).join('');

  raiz.innerHTML = `
    ${etapas(2)}
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 lg:gap-8 items-start">

      <div class="flex flex-col gap-6 min-w-0">

        <!-- 1. Seus dados -->
        <section class="bg-superficie rounded-3xl p-5 md:p-6" aria-labelledby="tituloDados">
          <h2 id="tituloDados" class="text-[19px] font-semibold tracking-tight mb-4">Seus dados</h2>
          <div class="flex items-center gap-4">
            <span class="w-12 h-12 rounded-full bg-petroleo text-white flex items-center justify-center text-[15px] font-semibold shrink-0">${escapeHtml(iniciais(usuario.nome))}</span>
            <div class="min-w-0 flex-1">
              <p class="text-[16px] font-semibold truncate">${escapeHtml(usuario.nome || '')}</p>
              <p class="text-[14px] text-grafite/65 truncate">${escapeHtml(usuario.email || '')}</p>
            </div>
            <button type="button" id="btnTrocarConta" class="text-[14px] text-petroleo font-medium hover:underline shrink-0">Trocar de conta</button>
          </div>
          <p class="text-[13px] text-grafite/65 mt-4">O comprovante fica salvo em <a href="aluno.html#pedidos" class="text-petroleo hover:underline">Meus pedidos</a>.</p>
        </section>

        <!-- 2. Como você recebe -->
        <section class="bg-superficie rounded-3xl overflow-hidden" aria-labelledby="tituloRecebe">
          <h2 id="tituloRecebe" class="text-[19px] font-semibold tracking-tight px-5 md:px-6 pt-5 md:pt-6 pb-1">Como você recebe</h2>
          <div id="blocoRecebimento" class="lista-ios"></div>
        </section>

        <!-- 3. Pagamento -->
        <section class="bg-superficie rounded-3xl relative overflow-hidden" aria-labelledby="tituloPagamento">
          <h2 id="tituloPagamento" class="text-[19px] font-semibold tracking-tight px-5 md:px-6 pt-5 md:pt-6 pb-2">Forma de pagamento</h2>
          <div class="lista-ios border-y border-tinta/[0.06]" role="radiogroup" aria-labelledby="tituloPagamento">${opcoes}</div>

          <div class="p-5 md:p-6">
            <!-- PIX -->
            <div id="painelPIX" class="text-[15px] text-grafite/70 leading-relaxed">
              <p><strong class="text-grafite">Pague em segundos.</strong> Na próxima tela aparecem o QR Code e o código Pix Copia e Cola, válidos por 15 minutos. A confirmação chega aqui sozinha.</p>
            </div>

            <!-- CARTÃO -->
            <form id="formCartao" class="hidden flex-col gap-4" novalidate autocomplete="on">
              <!-- Prévia do cartão: atualiza enquanto você digita -->
              <div class="cartao-previa mx-auto w-full max-w-[340px] aspect-[1.586] rounded-2xl p-5 text-white flex flex-col justify-between shadow-[0_14px_30px_rgba(66,91,99,0.35)] mb-2" aria-hidden="true">
                <div class="flex items-start justify-between">
                  <span class="w-10 h-7 rounded-md bg-gradient-to-br from-[#e8d9a8] to-[#b9a46a] opacity-90"></span>
                  <span id="previaBandeira" class="text-[15px] font-semibold tracking-wide"></span>
                </div>
                <p id="previaNumero" class="text-[19px] sm:text-[21px] tracking-[0.12em] tabular-nums font-medium">•••• •••• •••• ••••</p>
                <div class="flex items-end justify-between gap-4 text-[11px] uppercase tracking-wider">
                  <div class="min-w-0"><p class="text-white/60">Nome</p><p id="previaNome" class="text-[13px] font-medium truncate">Seu nome aqui</p></div>
                  <div class="text-right shrink-0"><p class="text-white/60">Validade</p><p id="previaValidade" class="text-[13px] font-medium">MM/AA</p></div>
                </div>
              </div>

              <div>
                <label for="cartaoNumero" class="text-[13px] font-medium text-grafite/65">Número do cartão</label>
                <div class="relative">
                  <input id="cartaoNumero" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="19"
                    class="w-full mt-1 rounded-xl pl-4 pr-24 py-3 text-[17px] tabular-nums focus:outline-none" aria-describedby="erro-cartaoNumero">
                  <span id="cartaoBandeira" class="absolute right-4 top-1/2 -translate-y-1/2 mt-0.5 text-xs font-bold text-petroleo"></span>
                </div>
                <p id="erro-cartaoNumero" class="text-xs text-terracota mt-1 min-h-[16px]"></p>
              </div>
              <div>
                <label for="cartaoNome" class="text-[13px] font-medium text-grafite/65">Nome impresso no cartão</label>
                <input id="cartaoNome" autocomplete="cc-name" placeholder="Como está no cartão" maxlength="40" style="text-transform:uppercase"
                  class="w-full mt-1 rounded-xl px-4 py-3 text-[17px] focus:outline-none" aria-describedby="erro-cartaoNome">
                <p id="erro-cartaoNome" class="text-xs text-terracota mt-1 min-h-[16px]"></p>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label for="cartaoValidade" class="text-[13px] font-medium text-grafite/65">Validade</label>
                  <input id="cartaoValidade" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5"
                    class="w-full mt-1 rounded-xl px-4 py-3 text-[17px] tabular-nums focus:outline-none" aria-describedby="erro-cartaoValidade">
                  <p id="erro-cartaoValidade" class="text-xs text-terracota mt-1 min-h-[16px]"></p>
                </div>
                <div>
                  <label for="cartaoCvv" class="text-[13px] font-medium text-grafite/65">CVV</label>
                  <input id="cartaoCvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" type="password"
                    class="w-full mt-1 rounded-xl px-4 py-3 text-[17px] tabular-nums focus:outline-none" aria-describedby="erro-cartaoCvv">
                  <p id="erro-cartaoCvv" class="text-xs text-terracota mt-1 min-h-[16px]"></p>
                </div>
              </div>
              <div>
                <label for="cartaoParcelas" class="text-[13px] font-medium text-grafite/65">Parcelas</label>
                <select id="cartaoParcelas" class="w-full mt-1 rounded-xl px-4 py-3 text-[17px] focus:outline-none"></select>
              </div>
              <div id="erroCartaoGeral" role="alert" class="hidden bg-terracota/10 text-terracota text-sm font-semibold rounded-xl px-4 py-3"></div>
              <div class="bg-offwhite rounded-2xl px-4 py-3 text-[13px] text-grafite/65 leading-relaxed">
                <strong class="text-grafite/80">Demonstração:</strong> não use um cartão real.
                <button type="button" id="usarCartaoTeste" class="font-semibold text-petroleo underline">Preencher cartão de teste</button>
                (aprovado) ou digite <span class="font-mono">4000 0000 0000 0002</span> para ver um pagamento recusado.
                O número e o CVV ficam só no seu navegador: o servidor recebe apenas a bandeira e os 4 últimos dígitos.
              </div>
            </form>

            <!-- BOLETO -->
            <div id="painelBOLETO" class="hidden text-[15px] text-grafite/70 leading-relaxed">
              <p><strong class="text-grafite">Vence em 3 dias.</strong> Você poderá copiar a linha digitável ou imprimir o boleto. A compensação leva até 2 dias úteis, e só então o plano é ativado e os produtos ficam liberados.</p>
            </div>
          </div>

          <div id="sobreposicao" class="hidden absolute inset-0 bg-superficie/90 flex-col items-center justify-center gap-3 z-10" aria-live="assertive">
            <svg class="spinner" width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#425B63" stroke-opacity=".25" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#425B63" stroke-width="3" stroke-linecap="round"/></svg>
            <p class="font-semibold text-sm" id="sobreposicaoTexto">Processando pagamento…</p>
            <p class="text-xs text-grafite/65">Não feche esta página.</p>
          </div>
        </section>
      </div>

      <!-- RESUMO -->
      <aside class="bg-superficie rounded-3xl p-5 md:p-6 lg:sticky lg:top-[80px]" aria-label="Resumo do pedido">
        <div class="flex items-baseline justify-between">
          <h2 class="text-[19px] font-semibold tracking-tight">Resumo do pedido</h2>
          <span id="resumoQtd" class="text-[13px] text-grafite/65"></span>
        </div>
        <div id="resumoItens" class="mt-2"></div>

        <!-- Cupom -->
        <form id="formCupom" class="mt-3 flex gap-2" novalidate>
          <label for="cupomCodigo" class="sr-only">Cupom de desconto</label>
          <input id="cupomCodigo" placeholder="Cupom de desconto" maxlength="20" autocomplete="off" style="text-transform:uppercase"
            class="flex-1 min-w-0 rounded-xl px-4 py-2.5 text-[15px] focus:outline-none">
          <button type="submit" id="btnCupom" class="px-4 py-2.5 rounded-xl bg-tinta/[0.06] text-[14px] font-semibold hover:bg-tinta/10 transition">Aplicar</button>
        </form>
        <p id="cupomMensagem" class="text-[12px] mt-1.5 min-h-[16px] text-grafite/65">Teste com <button type="button" data-cupom-exemplo="PULSO10" class="font-semibold text-petroleo hover:underline">PULSO10</button>.</p>

        <dl class="mt-3 flex flex-col gap-2 text-[15px]">
          <div class="flex justify-between"><dt class="text-grafite/65">Subtotal</dt><dd id="resumoSubtotal" class="tabular-nums"></dd></div>
          <div id="linhaDesconto" class="hidden flex justify-between text-oliva">
            <dt><span id="rotuloDesconto"></span> <button type="button" id="btnRemoverCupom" class="ml-1 text-[12px] text-grafite/65 underline">remover</button></dt>
            <dd id="resumoDesconto" class="tabular-nums font-medium"></dd>
          </div>
          <div id="linhaRetirada" class="hidden flex justify-between"><dt class="text-grafite/65">Retirada na academia</dt><dd class="text-oliva font-medium">Grátis</dd></div>
        </dl>
        <div class="flex items-end justify-between border-t border-tinta/[0.08] pt-4 mt-4">
          <span class="text-[17px] font-semibold">Total</span>
          <div class="text-right">
            <p id="resumoTotal" class="text-[28px] leading-none font-bold tracking-tight tabular-nums"></p>
            <p id="resumoParcelado" class="text-[12px] text-grafite/65 mt-1"></p>
          </div>
        </div>

        <button id="btnPagar" type="button" class="mt-5 w-full py-3.5 rounded-xl bg-petroleo text-white text-[17px] font-semibold hover:brightness-110 transition flex items-center justify-center gap-2 disabled:opacity-60">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2"/></svg>
          <span id="btnPagarTexto"></span>
        </button>

        <ul class="mt-5 flex flex-col gap-3 text-[13px] text-grafite/65">
          <li class="flex gap-3"><svg class="shrink-0 text-petroleo" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg><span><strong class="text-grafite/80 font-semibold">Compra protegida.</strong> Seus dados viajam criptografados (HTTPS).</span></li>
          <li class="flex gap-3"><svg class="shrink-0 text-petroleo" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg><span><strong class="text-grafite/80 font-semibold">7 dias para desistir.</strong> Pelo Código de Defesa do Consumidor, compras on-line podem ser canceladas em até 7 dias.</span></li>
          <li class="flex gap-3"><svg class="shrink-0 text-petroleo" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/></svg><span><strong class="text-grafite/80 font-semibold">Dúvidas?</strong> Fale com a recepção: <span data-academia="telefone">(11) 4002-8922</span>.</span></li>
        </ul>

        <div class="mt-5 pt-4 border-t border-tinta/[0.06]">
          <p class="text-[12px] text-grafite/65 mb-2">Formas de pagamento aceitas</p>
          <div class="flex flex-wrap gap-1.5 text-[11px] font-semibold text-grafite/65">
            ${['Pix', 'Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Boleto'].map((n) => `<span class="px-2 py-1 rounded-md ring-1 ring-tinta/10">${n}</span>`).join('')}
          </div>
          <p class="text-[11px] text-grafite/65 leading-relaxed mt-4">Ambiente de demonstração (projeto escolar): nenhuma cobrança real é feita.</p>
        </div>
      </aside>
    </div>

    <!-- Celular: total e botão de pagar sempre à mão, presos embaixo da tela -->
    <div class="lg:hidden h-24" aria-hidden="true"></div>
    <div class="barra-pagar lg:hidden fixed inset-x-0 bottom-0 z-30 px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] flex items-center gap-4">
      <div class="min-w-0">
        <p class="text-[12px] text-grafite/65">Total</p>
        <p id="barraTotal" class="text-[20px] font-bold tracking-tight tabular-nums leading-tight"></p>
      </div>
      <button id="btnPagarBarra" type="button" class="flex-1 py-3.5 rounded-xl bg-petroleo text-white text-[16px] font-semibold hover:brightness-110 transition disabled:opacity-60"></button>
    </div>`;

  mostrarPainel();
  atualizarResumo();
  carregarAcademia();
}

/** Endereço e horário da academia (para a retirada). Falhar aqui não atrapalha o pagamento. */
async function carregarAcademia() {
  try {
    const dados = await Api.obterAcademia();
    academia = dados.academia;
    document.querySelectorAll('#checkoutRoot [data-academia="telefone"]').forEach((el) => { el.textContent = academia.telefone; });
    if (emFormulario) renderRecebimento(Carrinho.itens());
  } catch { /* segue com o texto padrão */ }
}

/* --------------------------------- Cupom --------------------------------- */

function mensagemCupom(texto, tipo) {
  const p = document.getElementById('cupomMensagem');
  if (!p) return;
  p.textContent = texto;
  p.className = `text-[12px] mt-1.5 min-h-[16px] ${tipo === 'erro' ? 'text-terracota' : tipo === 'ok' ? 'text-oliva font-medium' : 'text-grafite/65'}`;
}

async function aplicarCupom(codigo) {
  codigo = String(codigo || '').trim().toUpperCase();
  if (!codigo) { mensagemCupom('Digite o código do cupom.', 'erro'); return; }
  const botao = document.getElementById('btnCupom');
  botao.disabled = true;
  try {
    const { cupom } = await Api.verificarCupom(codigo, Carrinho.total());
    cupomAplicado = cupom;
    mensagemCupom(`${cupom.codigo} aplicado: ${cupom.descricao}.`, 'ok');
  } catch (erro) {
    cupomAplicado = null;
    mensagemCupom(erro.message, 'erro');
  } finally {
    botao.disabled = false;
    atualizarResumo();
  }
}

/** O carrinho mudou: o desconto pode mudar (10% de outro valor, ou o mínimo deixar de valer). */
async function recalcularCupom() {
  if (!cupomAplicado || !Carrinho.itens().length) return;
  try {
    const { cupom } = await Api.verificarCupom(cupomAplicado.codigo, Carrinho.total());
    cupomAplicado = cupom;
  } catch (erro) {
    mensagemCupom(erro.message, 'erro');
    cupomAplicado = null;
  }
  if (emFormulario) atualizarResumo();
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

  const nome = document.getElementById('cartaoNome');
  numero.addEventListener('input', () => {
    const digitos = soDigitos(numero.value);
    numero.value = formatarNumeroCartao(digitos);
    const b = bandeiraDe(digitos);
    document.getElementById('cartaoBandeira').textContent = digitos.length >= 1 ? NOME_BANDEIRA[b] : '';
    cvv.maxLength = b === 'AMEX' ? 4 : 3;
    atualizarPrevia();
  });
  validade.addEventListener('input', () => {
    const d = soDigitos(validade.value).slice(0, 4);
    validade.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    atualizarPrevia();
  });
  nome.addEventListener('input', atualizarPrevia);
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
    atualizarPrevia();
  });
}

/** Desenha na prévia o que foi digitado (sem guardar nada). */
function atualizarPrevia() {
  const digitos = soDigitos(document.getElementById('cartaoNumero').value);
  const molde = '•••• •••• •••• ••••';
  const formatado = formatarNumeroCartao(digitos);
  document.getElementById('previaNumero').textContent = formatado + molde.slice(formatado.length);
  document.getElementById('previaBandeira').textContent = digitos ? NOME_BANDEIRA[bandeiraDe(digitos)] : '';
  document.getElementById('previaNome').textContent = document.getElementById('cartaoNome').value.trim() || 'Seu nome aqui';
  document.getElementById('previaValidade').textContent = document.getElementById('cartaoValidade').value || 'MM/AA';
}

/* --------------------------------- Pagar --------------------------------- */

function sobreposicao(texto) {
  const barra = document.getElementById('btnPagarBarra');
  if (barra) barra.disabled = !!texto;
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

  let pagamento = { metodo, cupom: cupomAplicado?.codigo };

  if (metodo === 'CARTAO') {
    const validos = CAMPOS_CARTAO.map(validarCampo);
    if (validos.includes(false)) {
      document.getElementById(CAMPOS_CARTAO[validos.indexOf(false)]).focus();
      return;
    }
    const digitos = soDigitos(document.getElementById('cartaoNumero').value);
    pagamento = {
      metodo,
      cupom: cupomAplicado?.codigo,
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
  if (e.target.closest('#btnPagar, #btnPagarBarra')) return pagar();
  if (e.target.closest('#btnTrocarConta')) { Auth.limparSessao(); window.location.href = 'login.html?next=checkout.html'; return; }
  if (e.target.closest('#btnRemoverCupom')) { cupomAplicado = null; mensagemCupom('Cupom removido.', ''); atualizarResumo(); return; }
  const exemplo = e.target.closest('[data-cupom-exemplo]');
  if (exemplo) { document.getElementById('cupomCodigo').value = exemplo.dataset.cupomExemplo; aplicarCupom(exemplo.dataset.cupomExemplo); return; }

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

raiz.addEventListener('submit', (e) => {
  if (e.target.id === 'formCupom') { e.preventDefault(); aplicarCupom(document.getElementById('cupomCodigo').value); }
});

raiz.addEventListener('change', (e) => {
  if (e.target.name === 'metodo') { metodo = e.target.value; mostrarPainel(); }
});

document.addEventListener('carrinho:atualizado', () => {
  if (emFormulario) atualizarResumo();
  recalcularCupom();
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
