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
    grid.innerHTML = `<p class="text-grafite/40 text-sm col-span-3">Nenhum plano cadastrado no momento.</p>`;
    return;
  }

  // Preço mensal de referência = o do plano mais curto, para mostrar quanto o aluno economiza.
  const mensal = planos.find((p) => mesesDoPlano(p.periodo) === 1);

  grid.innerHTML = planos
    .map((plano, i) => {
      const destaque = i === 1; // plano do meio em destaque
      const meses = mesesDoPlano(plano.periodo);
      const economia = mensal && meses > 1 ? mensal.preco * meses - plano.preco : 0;
      return `
      <div class="bg-white border ${destaque ? 'border-petroleo' : 'border-grafite/10'} rounded-2xl p-7 flex flex-col relative">
        ${destaque ? '<span class="absolute -top-3 left-7 bg-petroleo text-white text-[11px] font-bold px-3 py-1 rounded-full">MAIS POPULAR</span>' : ''}
        <p class="font-bold text-lg mb-1">${escapeHtml(plano.nome)}</p>
        <p class="text-3xl font-extrabold mb-1">${formatarPreco(plano.preco)}</p>
        <p class="text-grafite/50 text-sm mb-2">${escapeHtml(plano.periodo)}</p>
        <p class="text-oliva text-xs font-semibold mb-6 min-h-[16px]">${economia > 0 ? `Economize ${formatarPreco(economia)}` : ''}</p>
        <button type="button" data-plano="${plano.id}"
          class="mt-auto py-3 rounded-full ${destaque ? 'bg-petroleo text-white' : 'bg-grafite text-white'} font-semibold text-sm hover:opacity-90 transition">
          Assinar este plano
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
      return `<button type="button" data-categoria="${escapeHtml(cat)}" aria-pressed="${ativo}"
        class="px-4 py-2 rounded-full text-sm font-semibold border transition ${ativo ? 'bg-grafite text-white border-grafite' : 'border-grafite/20 text-grafite/70 hover:bg-grafite/5'}">${escapeHtml(nome)}</button>`;
    })
    .join('');
}

function renderProdutos() {
  const grid = document.getElementById('produtosGrid');
  const lista = produtosCarregados.filter((p) => categoriaAtiva === 'todos' || p.categoria === categoriaAtiva);

  if (lista.length === 0) {
    grid.innerHTML = `<p class="text-grafite/40 text-sm col-span-4">Nenhum produto nesta categoria.</p>`;
    return;
  }

  grid.innerHTML = lista
    .map(
      (p) => `
      <article class="bg-white border border-grafite/10 rounded-2xl overflow-hidden flex flex-col">
        <img src="${escapeHtml(p.imagem)}" alt="${escapeHtml(p.nome)}" loading="lazy" class="w-full aspect-square object-cover bg-grafite/5">
        <div class="p-5 flex flex-col flex-1">
          <span class="text-[11px] font-semibold tracking-wide uppercase text-grafite/40 mb-1">${escapeHtml(NOMES_CATEGORIA[p.categoria] || p.categoria)}</span>
          <h3 class="font-semibold text-sm leading-snug mb-1">${escapeHtml(p.nome)}</h3>
          <p class="text-xs text-grafite/55 leading-relaxed mb-4">${escapeHtml(p.descricao)}</p>
          <p class="text-petroleo font-extrabold text-lg mt-auto mb-3">${formatarPreco(p.preco)}</p>
          <button type="button" data-produto="${p.id}"
            class="w-full py-2.5 rounded-full bg-grafite text-white text-sm font-semibold hover:opacity-90 transition">
            Adicionar ao carrinho
          </button>
        </div>
      </article>`
    )
    .join('');
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
