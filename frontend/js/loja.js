/* =========================================================
   loja.js — Vitrine de planos e produtos (loja.html)
   Busca os dados reais do backend (Api.listarPlanos/listarProdutos),
   mostra fotos, filtro por categoria e botões que enviam ao carrinho.
   Depende de: Api (api.js), escapeHtml/formatarPreco/showToast (ui.js),
   Carrinho/CarrinhoUI (cart.js).
   ========================================================= */

const NOMES_CATEGORIA = {
  suplemento: 'Suplementos',
  vestuario: 'Vestuário',
  acessorio: 'Acessórios',
};

let planosCarregados = [];
let produtosCarregados = [];
let categoriaAtiva = 'todos';

/** Meses de cada plano (mesma regra do servidor), para calcular a economia. */
function mesesDoPlano(periodo) {
  const p = periodo.toLowerCase();
  if (p.includes('trimestre')) return 3;
  if (p.includes('ano')) return 12;
  return 1;
}

/* ------------------------------- Planos ------------------------------- */

function renderPlanos(planos) {
  const grid = document.getElementById('planosGrid');

  if (planos.length === 0) {
    grid.innerHTML = `<p class="text-grafite/65 text-sm col-span-3">Nenhum plano cadastrado no momento.</p>`;
    return;
  }

  // Preço mensal de referência = o do plano mais curto, para mostrar quanto o aluno economiza.
  const mensal = planos.find((p) => mesesDoPlano(p.periodo) === 1);

  grid.innerHTML = planos
    .map((plano, i) => {
      const destaque = i === 1; // plano do meio em destaque
      const meses = mesesDoPlano(plano.periodo);
      const economia = mensal && meses > 1 ? mensal.preco * meses - plano.preco : 0;
      const porMes = meses > 1 ? `ou ${formatarPreco(plano.preco / meses)} por mês` : 'sem fidelidade';
      return `
      <div class="bg-superficie rounded-3xl p-8 flex flex-col ${destaque ? 'ring-2 ring-terracota' : ''}">
        <p class="min-h-[24px]">${destaque ? '<span class="inline-block px-2.5 py-0.5 rounded-full bg-terracota text-white text-[12px] font-semibold">Mais escolhido</span>' : ''}</p>
        <p class="text-[21px] font-semibold tracking-tight mt-1">${escapeHtml(plano.nome)}</p>
        <p class="text-grafite/65 text-[15px] mt-2 leading-snug min-h-[44px]">${escapeHtml(plano.descricao || '')}</p>
        <p class="text-[40px] font-semibold tracking-tight mt-6 leading-none">${formatarPreco(plano.preco)}</p>
        <p class="text-grafite/65 text-[14px] mt-2">${escapeHtml(plano.periodo)} · ${porMes}</p>
        <p class="text-oliva text-[13px] font-semibold mt-1 min-h-[20px]">${economia > 0 ? `Você economiza ${formatarPreco(economia)}` : ''}</p>
        <button type="button" data-plano="${plano.id}"
          class="mt-8 py-3 rounded-full ${destaque ? 'bg-petroleo text-white hover:bg-petroleo/90' : 'bg-tinta/[0.06] text-grafite hover:bg-tinta/10'} font-medium text-[15px] transition">
          Assinar
        </button>
      </div>`;
    })
    .join('');
}

/* ------------------------------ Produtos ------------------------------ */

function renderFiltros() {
  const categorias = ['todos', ...new Set(produtosCarregados.map((p) => p.categoria))];
  document.getElementById('filtrosProdutos').innerHTML = categorias
    .map((cat) => {
      const ativo = cat === categoriaAtiva;
      const nome = cat === 'todos' ? 'Todos' : NOMES_CATEGORIA[cat] || cat;
      // Visual de "controle segmentado" vem do CSS (.segmentado .aba[aria-pressed=true]).
      return `<button type="button" class="aba" data-categoria="${escapeHtml(cat)}" aria-pressed="${ativo}">${escapeHtml(nome)}</button>`;
    })
    .join('');
}

function renderProdutos() {
  const grid = document.getElementById('produtosGrid');
  const lista = produtosCarregados.filter((p) => categoriaAtiva === 'todos' || p.categoria === categoriaAtiva);

  if (lista.length === 0) {
    grid.innerHTML = `<p class="text-grafite/65 text-sm col-span-4">Nenhum produto nesta categoria.</p>`;
    return;
  }

  grid.innerHTML = lista
    .map(
      (p) => `
      <article class="bg-superficie rounded-3xl overflow-hidden flex flex-col group">
        <button type="button" data-ver="${p.id}" class="block text-left" aria-label="Ver detalhes de ${escapeHtml(p.nome)}">
          <span class="block overflow-hidden">
            <img src="${escapeHtml(p.imagem)}" alt="${escapeHtml(p.nome)}" loading="lazy" onerror="fotoReserva(this)"
              class="w-full aspect-square object-cover transition-transform duration-500 group-hover:scale-[1.03]">
          </span>
          <span class="block px-4 md:px-5 pt-4">
            <span class="block font-semibold text-[15px] md:text-[17px] leading-snug tracking-tight">${escapeHtml(p.nome)}</span>
            <span class="hidden md:block text-[13px] text-grafite/65 leading-snug mt-1">${escapeHtml(p.descricao)}</span>
          </span>
        </button>
        <div class="px-4 md:px-5 pb-4 md:pb-5 mt-auto pt-3 md:pt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          <p class="text-[15px] md:text-[17px] font-medium">${formatarPreco(p.preco)}</p>
          <button type="button" data-produto="${p.id}" aria-label="Adicionar ${escapeHtml(p.nome)} ao carrinho"
            class="w-full md:w-auto px-4 py-2 md:py-1.5 rounded-full bg-petroleo text-white text-[13px] font-medium hover:bg-petroleo/90 transition">
            Adicionar
          </button>
        </div>
      </article>`
    )
    .join('');
}

/* -------------------------- Detalhes do produto -------------------------- */

const dialogo = document.getElementById('produtoDialog');
let produtoAberto = null;
let qtdDetalhe = 1;

function abrirDetalhes(id) {
  const p = produtosCarregados.find((x) => x.id === id);
  if (!p || !dialogo) return;
  produtoAberto = p;
  qtdDetalhe = 1;
  const foto = document.getElementById('pdFoto');
  foto.onerror = () => fotoReserva(foto);
  foto.src = p.imagem;
  foto.alt = p.nome;
  document.getElementById('pdCategoria').textContent = NOMES_CATEGORIA[p.categoria] || p.categoria;
  document.getElementById('pdNome').textContent = p.nome;
  document.getElementById('pdPreco').textContent = formatarPreco(p.preco);
  // Mesma regra do checkout: parcela mínima de R$ 20, até 12x sem juros.
  const parcelas = Math.min(12, Math.floor(p.preco / 20));
  document.getElementById('pdParcelas').textContent =
    parcelas >= 2 ? `ou ${parcelas}x de ${formatarPreco(p.preco / parcelas)} sem juros no cartão` : 'à vista no Pix, cartão ou boleto';
  document.getElementById('pdDescricao').textContent = p.descricao;
  document.getElementById('pdDetalhes').innerHTML = (p.detalhes || [])
    .map((d) => `<li class="flex gap-3 px-4 py-3"><svg class="shrink-0 mt-0.5 text-petroleo" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4L19 7"/></svg><span>${escapeHtml(d)}</span></li>`)
    .join('');
  document.getElementById('pdDetalhes').classList.toggle('hidden', !(p.detalhes || []).length);
  atualizarQtd();
  dialogo.showModal();
}

function atualizarQtd() {
  document.getElementById('pdQtd').textContent = qtdDetalhe;
  document.getElementById('pdAdicionar').textContent =
    `Adicionar ao carrinho · ${formatarPreco(produtoAberto.preco * qtdDetalhe)}`;
}

if (dialogo) {
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo || e.target.closest('[data-fechar]')) dialogo.close(); // fora da folha ou no X
  });
  document.getElementById('pdMenos').addEventListener('click', () => { qtdDetalhe = Math.max(1, qtdDetalhe - 1); atualizarQtd(); });
  document.getElementById('pdMais').addEventListener('click', () => { qtdDetalhe = Math.min(10, qtdDetalhe + 1); atualizarQtd(); });
  document.getElementById('pdAdicionar').addEventListener('click', () => {
    const p = produtoAberto;
    Carrinho.adicionar({ tipo: 'PRODUTO', id: p.id, nome: p.nome, preco: p.preco, imagem: p.imagem });
    if (qtdDetalhe > 1) Carrinho.alterarQuantidade('PRODUTO', p.id, qtdDetalhe - 1);
    dialogo.close();
    CarrinhoUI.abrir();
  });
}

/* -------------------------------- Eventos ------------------------------- */

function configurarEventos() {
  document.getElementById('planosGrid').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-plano]');
    if (!botao) return;
    const plano = planosCarregados.find((p) => p.id === Number(botao.dataset.plano));
    if (!plano) return;
    Carrinho.adicionar({ tipo: 'PLANO', id: plano.id, nome: plano.nome, preco: plano.preco });
    CarrinhoUI.abrir(); // abre o carrinho já com o botão "Ir para o pagamento"
  });

  document.getElementById('produtosGrid').addEventListener('click', (e) => {
    const ver = e.target.closest('[data-ver]');
    if (ver) { abrirDetalhes(Number(ver.dataset.ver)); return; }
    const botao = e.target.closest('[data-produto]');
    if (!botao) return;
    const produto = produtosCarregados.find((p) => p.id === Number(botao.dataset.produto));
    if (!produto) return;
    Carrinho.adicionar({
      tipo: 'PRODUTO', id: produto.id, nome: produto.nome, preco: produto.preco, imagem: produto.imagem,
    });
    CarrinhoUI.abrir();
  });

  document.getElementById('filtrosProdutos').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-categoria]');
    if (!botao) return;
    categoriaAtiva = botao.dataset.categoria;
    renderFiltros();
    renderProdutos();
  });
}

async function init() {
  configurarEventos();
  try {
    const [{ planos }, { produtos }] = await Promise.all([Api.listarPlanos(), Api.listarProdutos()]);
    planosCarregados = planos;
    produtosCarregados = produtos;
    renderPlanos(planos);
    renderFiltros();
    renderProdutos();
  } catch (erro) {
    showToast(erro.message, 'error');
    document.getElementById('planosGrid').innerHTML =
      `<p class="text-terracota text-sm col-span-3">Não foi possível carregar os planos.</p>`;
    document.getElementById('produtosGrid').innerHTML =
      `<p class="text-terracota text-sm col-span-4">Não foi possível carregar os produtos.</p>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
