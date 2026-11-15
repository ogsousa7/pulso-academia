/* =========================================================
   planos.js — Cartões dos planos (loja.html e página inicial)
   Os valores vêm sempre de GET /api/planos (o mesmo cadastro que a
   recepção edita no painel): nenhum preço fica escrito no HTML.
   Depende de: escapeHtml/formatarPreco (ui.js), Carrinho/CarrinhoUI (cart.js).
   ========================================================= */

const Planos = (() => {
  /** Meses de cada plano (mesma regra do servidor), para o valor por mês e a economia. */
  function mesesDoPlano(periodo) {
    const p = String(periodo || '').toLowerCase();
    if (p.includes('trimestre')) return 3;
    if (p.includes('ano')) return 12;
    return 1;
  }

  /** Desenha os cartões dentro de `grid`. O trimestral é o destaque ("Mais escolhido"). */
  function montar(grid, planos) {
    if (!planos.length) {
      grid.innerHTML = '<p class="text-grafite/65 text-sm col-span-3">Nenhum plano cadastrado no momento.</p>';
      return;
    }
    // Preço mensal de referência = o do plano mais curto, para mostrar quanto o aluno economiza.
    const mensal = planos.find((p) => mesesDoPlano(p.periodo) === 1);
    const temTrimestral = planos.some((p) => mesesDoPlano(p.periodo) === 3);

    grid.innerHTML = planos.map((plano, i) => {
      const meses = mesesDoPlano(plano.periodo);
      const destaque = temTrimestral ? meses === 3 : i === 1;
      const economia = mensal && meses > 1 ? mensal.preco * meses - plano.preco : 0;
      const detalhe = meses > 1 ? `Total de ${formatarPreco(plano.preco)} (${escapeHtml(plano.periodo)})` : 'Sem fidelidade · cancele quando quiser';
      // Blocos de cor da marca: escuro, terracota (o destaque) e petróleo. Cores fixas: contraste igual nos dois temas.
      const cor = destaque ? 'plano-destaque' : meses === 1 ? 'plano-escuro' : 'plano-marca';
      return `
      <article class="plano ${cor}">
        <p class="plano-selo">${destaque ? 'Mais escolhido' : escapeHtml(plano.periodo)}</p>
        <h3 class="plano-nome">${escapeHtml(plano.nome)}</h3>
        <p class="plano-desc">${escapeHtml(plano.descricao || '')}</p>
        <p class="plano-preco">${formatarPreco(plano.preco / meses)}<small>/mês</small></p>
        <p class="plano-detalhe">${detalhe}</p>
        <p class="plano-economia">${economia > 0 ? `Você economiza ${formatarPreco(economia)}` : ''}</p>
        <button type="button" data-plano="${plano.id}" class="plano-botao">Assinar <span class="sr-only">o ${escapeHtml(plano.nome)}</span></button>
      </article>`;
    }).join('');
  }

  /** "Assinar": coloca o plano no carrinho e abre o carrinho (com o botão "Ir para o pagamento"). */
  function ligar(grid, obterPlanos) {
    grid.addEventListener('click', (e) => {
      const botao = e.target.closest('[data-plano]');
      if (!botao) return;
      const plano = obterPlanos().find((p) => p.id === Number(botao.dataset.plano));
      if (!plano) return;
      Carrinho.adicionar({ tipo: 'PLANO', id: plano.id, nome: plano.nome, preco: plano.preco });
      CarrinhoUI.abrir();
    });
  }

  return { mesesDoPlano, montar, ligar };
})();
