/* =========================================================
   cart.js — Carrinho de compras (estado + gaveta lateral)
   - "Carrinho": estado salvo no localStorage (sobrevive ao recarregar a página).
   - "CarrinhoUI": botão com contador no header + gaveta com os itens e o
     botão "Ir para o pagamento". É injetada sozinha em qualquer página que
     tenha o header (#btnEntrar), então basta incluir este script.
   Depende de: escapeHtml/formatarPreco (ui.js).

   IMPORTANTE: o preço guardado aqui serve só para EXIBIR. No checkout o
   servidor recalcula tudo a partir do banco (nunca confia no navegador).
   ========================================================= */

const MAX_QUANTIDADE_ITEM = 10;

const Carrinho = {
  CHAVE: 'pulso_carrinho',

  /** Lê o carrinho já validado; qualquer item estranho (JSON editado à mão) é descartado. */
  itens() {
    let lista = [];
    try {
      const bruto = JSON.parse(localStorage.getItem(Carrinho.CHAVE));
      if (Array.isArray(bruto)) lista = bruto;
    } catch {
      /* storage indisponível ou JSON quebrado: carrinho vazio */
    }
    return lista.filter(
      (i) =>
        i &&
        (i.tipo === 'PLANO' || i.tipo === 'PRODUTO') &&
        Number.isInteger(i.id) &&
        typeof i.nome === 'string' &&
        typeof i.preco === 'number' &&
        Number.isInteger(i.quantidade) &&
        i.quantidade >= 1 &&
        i.quantidade <= MAX_QUANTIDADE_ITEM
    );
  },

  _salvar(itens) {
    try {
      localStorage.setItem(Carrinho.CHAVE, JSON.stringify(itens));
    } catch {
      /* sem storage: o carrinho só vale até recarregar */
    }
    document.dispatchEvent(new CustomEvent('carrinho:atualizado'));
  },

  /** Só pode haver UM plano: escolher outro substitui o anterior. */
  adicionar({ tipo, id, nome, preco, imagem = '' }) {
    let itens = Carrinho.itens();

    if (tipo === 'PLANO') {
      itens = itens.filter((i) => i.tipo !== 'PLANO');
      itens.push({ tipo, id, nome, preco, imagem, quantidade: 1 });
    } else {
      const existente = itens.find((i) => i.tipo === tipo && i.id === id);
      if (existente) existente.quantidade = Math.min(MAX_QUANTIDADE_ITEM, existente.quantidade + 1);
      else itens.push({ tipo, id, nome, preco, imagem, quantidade: 1 });
    }
    Carrinho._salvar(itens);
  },

  alterarQuantidade(tipo, id, delta) {
    const itens = Carrinho.itens();
    const item = itens.find((i) => i.tipo === tipo && i.id === id);
    if (!item || tipo === 'PLANO') return;
    item.quantidade = Math.min(MAX_QUANTIDADE_ITEM, item.quantidade + delta);
    Carrinho._salvar(item.quantidade < 1 ? itens.filter((i) => i !== item) : itens);
  },

  remover(tipo, id) {
    Carrinho._salvar(Carrinho.itens().filter((i) => !(i.tipo === tipo && i.id === id)));
  },

  limpar() {
    Carrinho._salvar([]);
  },

  quantidadeTotal() {
    return Carrinho.itens().reduce((soma, i) => soma + i.quantidade, 0);
  },

  total() {
    return Carrinho.itens().reduce((soma, i) => soma + i.preco * i.quantidade, 0);
  },
};

/* ---------------------------- Interface (gaveta) ---------------------------- */

const ICONE_PLANO = `
  <div class="w-20 h-20 rounded-xl bg-petroleo/10 flex items-center justify-center shrink-0">
    <svg width="34" height="34" viewBox="0 0 100 100" fill="none"><path d="M8 52 L28 52 L36 40 L46 64 L56 30 L64 52 L92 52" stroke="#425B63" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div>`;

const CarrinhoUI = {
  _ultimoFoco: null,

  montar() {
    const btnEntrar = document.getElementById('btnEntrar');
    if (!btnEntrar || document.getElementById('cartDrawer')) return; // página sem header

    // Botão do carrinho no header, antes do "Entrar".
    const botao = document.createElement('button');
    botao.id = 'btnCarrinho';
    botao.type = 'button';
    botao.setAttribute('aria-label', 'Abrir carrinho');
    botao.className = 'relative w-9 h-9 rounded-full flex items-center justify-center text-grafite hover:bg-tinta/5 transition';
    botao.innerHTML = `
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 7h12l-1 13H7L6 7Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M9 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
      <span id="cartBadge" class="hidden absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-terracota text-white text-[11px] font-bold items-center justify-center">0</span>`;
    btnEntrar.parentElement.insertBefore(botao, btnEntrar);
    botao.addEventListener('click', () => CarrinhoUI.abrir());

    // Gaveta + fundo escurecido.
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div id="cartOverlay" class="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-[70] hidden"></div>
      <aside id="cartDrawer" role="dialog" aria-modal="true" aria-label="Carrinho de compras" inert
        class="fixed top-0 right-0 h-full w-full max-w-md bg-superficie z-[80] shadow-2xl translate-x-full transition-transform duration-300 flex flex-col">
        <div class="flex items-center justify-between px-6 pt-6 pb-2 shrink-0">
          <h2 class="text-[28px] font-bold tracking-tight">Carrinho</h2>
          <button id="cartFechar" type="button" aria-label="Fechar carrinho" class="w-8 h-8 flex items-center justify-center rounded-full bg-tinta/[0.06] text-grafite/65 hover:bg-tinta/10">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div id="cartItens" class="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5"></div>
        <div class="border-t border-tinta/[0.08] px-6 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))] shrink-0">
          <div class="flex items-center justify-between mb-4">
            <span class="text-grafite/65 text-sm">Total</span>
            <span id="cartTotal" class="text-xl font-semibold tracking-tight">R$ 0,00</span>
          </div>
          <a id="cartIrPagar" href="checkout.html" class="block text-center w-full py-3.5 rounded-xl bg-petroleo text-white text-[17px] font-semibold hover:bg-petroleo/90 transition">
            Ir para o pagamento
          </a>
          <button id="cartContinuar" type="button" class="mt-1 w-full py-3 text-[15px] font-medium text-petroleo hover:underline">
            Continuar comprando
          </button>
        </div>
      </aside>`
    );

    document.getElementById('cartOverlay').addEventListener('click', () => CarrinhoUI.fechar());
    document.getElementById('cartFechar').addEventListener('click', () => CarrinhoUI.fechar());
    document.getElementById('cartContinuar').addEventListener('click', () => CarrinhoUI.fechar());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') CarrinhoUI.fechar(); });

    // Delegação de eventos: um único listener cobre todos os botões +/−/remover.
    document.getElementById('cartItens').addEventListener('click', (e) => {
      const alvo = e.target.closest('[data-acao]');
      if (!alvo) return;
      const { acao, tipo } = alvo.dataset;
      const id = Number(alvo.dataset.id);
      if (acao === 'mais') Carrinho.alterarQuantidade(tipo, id, 1);
      if (acao === 'menos') Carrinho.alterarQuantidade(tipo, id, -1);
      if (acao === 'remover') Carrinho.remover(tipo, id);
    });

    document.addEventListener('carrinho:atualizado', () => CarrinhoUI.renderizar());
    CarrinhoUI.renderizar();
  },

  renderizar() {
    const itens = Carrinho.itens();
    const lista = document.getElementById('cartItens');
    if (!lista) return;

    // Contador do header
    const badge = document.getElementById('cartBadge');
    const qtd = Carrinho.quantidadeTotal();
    badge.textContent = qtd;
    badge.classList.toggle('hidden', qtd === 0);
    badge.classList.toggle('flex', qtd > 0);

    document.getElementById('cartTotal').textContent = formatarPreco(Carrinho.total());

    const pagar = document.getElementById('cartIrPagar');
    pagar.classList.toggle('hidden', itens.length === 0);

    if (itens.length === 0) {
      lista.innerHTML = `
        <div class="m-auto text-center text-grafite/65">
          <p class="font-semibold text-grafite mb-1">Seu carrinho está vazio</p>
          <p class="text-sm">Escolha um plano ou um produto para começar.</p>
        </div>`;
      return;
    }

    lista.innerHTML = itens
      .map((i) => {
        const foto = i.imagem && i.imagem.startsWith('img/')
          ? `<img src="${escapeHtml(i.imagem)}" alt="" onerror="fotoReserva(this)" class="w-20 h-20 rounded-2xl object-cover bg-offwhite shrink-0">`
          : ICONE_PLANO;
        const controles = i.tipo === 'PLANO'
          ? `<p class="text-xs text-grafite/65 mt-2">Plano de assinatura</p>`
          : `<div class="flex items-center gap-1 mt-2">
               <button type="button" data-acao="menos" data-tipo="${i.tipo}" data-id="${i.id}" aria-label="Diminuir quantidade de ${escapeHtml(i.nome)}" class="w-7 h-7 rounded-full bg-tinta/[0.06] hover:bg-tinta/10 font-semibold">−</button>
               <span class="w-7 text-center text-sm font-semibold" aria-live="polite">${i.quantidade}</span>
               <button type="button" data-acao="mais" data-tipo="${i.tipo}" data-id="${i.id}" aria-label="Aumentar quantidade de ${escapeHtml(i.nome)}" class="w-7 h-7 rounded-full bg-tinta/[0.06] hover:bg-tinta/10 font-semibold">+</button>
             </div>`;
        return `
          <div class="flex gap-4">
            ${foto}
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-sm leading-snug">${escapeHtml(i.nome)}</p>
              <p class="text-grafite/65 text-sm mt-0.5">${formatarPreco(i.preco * i.quantidade)}</p>
              ${controles}
            </div>
            <button type="button" data-acao="remover" data-tipo="${i.tipo}" data-id="${i.id}" aria-label="Remover ${escapeHtml(i.nome)} do carrinho"
              class="self-start w-8 h-8 flex items-center justify-center rounded-full text-grafite/65 hover:bg-grafite/5 hover:text-terracota">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
            </button>
          </div>`;
      })
      .join('');
  },

  abrir() {
    const gaveta = document.getElementById('cartDrawer');
    if (!gaveta) return;
    CarrinhoUI._ultimoFoco = document.activeElement;
    document.getElementById('cartOverlay').classList.remove('hidden');
    gaveta.inert = false;
    gaveta.classList.remove('translate-x-full');
    document.body.classList.add('overflow-hidden');
    document.getElementById('cartFechar').focus();
  },

  fechar() {
    const gaveta = document.getElementById('cartDrawer');
    if (!gaveta || gaveta.inert) return; // já fechada
    document.getElementById('cartOverlay').classList.add('hidden');
    gaveta.classList.add('translate-x-full');
    gaveta.inert = true;
    document.body.classList.remove('overflow-hidden');
    if (CarrinhoUI._ultimoFoco && CarrinhoUI._ultimoFoco.focus) CarrinhoUI._ultimoFoco.focus();
  },
};

document.addEventListener('DOMContentLoaded', () => CarrinhoUI.montar());
