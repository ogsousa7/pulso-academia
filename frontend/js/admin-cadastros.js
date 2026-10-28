/* =========================================================
   admin-cadastros.js — Abas do painel da recepção (UC07)
   Planos, alunos e professores (cadastro/edição/desativação),
   agendamentos gerais, pagamentos com filtros e pedidos de
   cancelamento de plano. Carregado DEPOIS de admin.js
   (reaproveita tratarErro, renderPedidos e carregarTudo).
   ========================================================= */

const $ = (id) => document.getElementById(id);
let opcoesAdmin = null;
const ABAS = ['geral', 'agendamentos', 'planos', 'alunos', 'professores', 'solicitacoes', 'pagamentos', 'academia'];

/* ---------- Abas ---------- */

function abrirAba(nome) {
  document.querySelectorAll('.painel').forEach((p) => p.classList.toggle('hidden', p.id !== `painel-${nome}`));
  document.querySelectorAll('.aba').forEach((b) => {
    const ativa = b.dataset.aba === nome;
    b.setAttribute('aria-selected', ativa); // o visual da aba ativa vem do CSS (.segmentado / .tabbar)
  });
  const carregar = {
    geral: () => carregarTudo(), agendamentos: carregarAgendamentos, planos: () => CADASTROS.planos.carregar(),
    alunos: () => CADASTROS.alunos.carregar(), professores: () => CADASTROS.professores.carregar(),
    solicitacoes: carregarSolicitacoes, pagamentos: carregarPagamentos,
  };
  if (carregar[nome]) carregar[nome]();
  history.replaceState(null, '', `#${nome}`);
}
document.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

const SIM_NAO = (v) => (v
  ? '<span class="px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-oliva/10 text-oliva">Ativo</span>'
  : '<span class="px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-terracota/10 text-terracota">Inativo</span>');

/* ---------- Cadastros genéricos (planos, alunos, professores) ---------- */

/**
 * Cada cadastro descreve: título, colunas da tabela e campos do formulário.
 * Os dados vão para Api.admListar / admCriar / admAtualizar (rotas /api/admin/<recurso>).
 */
const CADASTROS = {
  planos: {
    recurso: 'planos', singular: 'plano', plural: 'Planos', chave: 'planos',
    colunas: [
      ['Nome', (p) => `<span class="font-medium">${escapeHtml(p.nome)}</span>`],
      ['Preço', (p) => `${formatarPreco(p.preco)} <span class="text-grafite/65 text-xs">${escapeHtml(p.periodo)}</span>`],
      ['Alunos ativos', (p) => p.alunos_ativos],
      ['Situação', (p) => SIM_NAO(p.ativo)],
    ],
    campos: () => [
      { nome: 'nome', rotulo: 'Nome do plano', max: 60 },
      { nome: 'preco', rotulo: 'Preço (R$)', tipo: 'number', step: '0.01', min: '0.01' },
      { nome: 'periodo', rotulo: 'Período', tipo: 'select', opcoes: opcoesAdmin.periodos },
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', max: 300, opcional: true },
      { nome: 'ativo', rotulo: 'Disponível na loja', tipo: 'check', soEdicao: true },
    ],
    novo: { periodo: 'por mês', ativo: true },
  },
  alunos: {
    recurso: 'alunos', singular: 'aluno', plural: 'Alunos', chave: 'alunos', busca: true,
    colunas: [
      ['Nome', (a) => `<span class="font-medium">${escapeHtml(a.nome)}</span><br><span class="text-xs text-grafite/65">${escapeHtml(a.email)}</span>`],
      ['Plano', (a) => (a.plano ? `${escapeHtml(a.plano)} <span class="text-xs text-grafite/65">até ${formatarDataISO(a.vencimento)}</span>` : '<span class="text-grafite/65">Sem plano</span>')],
      ['Situação', (a) => SIM_NAO(a.ativo)],
    ],
    campos: () => [
      { nome: 'nome', rotulo: 'Nome', max: 100 },
      { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 150 },
      { nome: 'senha', rotulo: 'Senha', tipo: 'password', min: 6, senha: true },
      { nome: 'ativo', rotulo: 'Conta ativa', tipo: 'check', soEdicao: true },
    ],
    novo: { ativo: true },
  },
  professores: {
    recurso: 'professores', singular: 'professor', plural: 'Professores', chave: 'professores',
    colunas: [
      ['Nome', (p) => `<span class="font-medium">${escapeHtml(p.nome)}</span><br><span class="text-xs text-grafite/65">${escapeHtml(p.email)}</span>`],
      ['Especialidade', (p) => escapeHtml(p.especialidade)],
      ['Horários/semana', (p) => p.horarios_semana],
      ['Situação', (p) => SIM_NAO(p.ativo)],
    ],
    campos: () => [
      { nome: 'nome', rotulo: 'Nome', max: 100 },
      { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 150 },
      { nome: 'especialidade', rotulo: 'Especialidade', tipo: 'select', opcoes: opcoesAdmin.tiposTreino },
      { nome: 'senha', rotulo: 'Senha', tipo: 'password', min: 6, senha: true },
      { nome: 'ativo', rotulo: 'Conta ativa', tipo: 'check', soEdicao: true },
    ],
    novo: { especialidade: 'Musculação', ativo: true },
  },
};

for (const cfg of Object.values(CADASTROS)) {
  cfg.itens = [];
  cfg.raiz = $(`cad-${cfg.recurso}`);

  cfg.desenhar = () => {
    cfg.raiz.innerHTML = `
      <section class="bg-superficie rounded-3xl overflow-hidden">
        <div class="px-6 pt-5 pb-3 flex flex-wrap items-center gap-3 justify-between">
          <h2 class="text-[19px] font-semibold tracking-tight">${cfg.plural}</h2>
          <div class="flex items-center gap-2">
            ${cfg.busca ? `<input type="search" data-busca placeholder="Buscar por nome ou e-mail" aria-label="Buscar"
              class="border border-grafite/15 rounded-full px-4 py-2 text-xs focus:outline-none focus:border-petroleo">` : ''}
            <button data-novo class="px-4 py-2 rounded-full bg-petroleo text-white text-[14px] font-medium hover:brightness-110 transition">Novo ${cfg.singular}</button>
          </div>
        </div>
        <div class="overflow-x-auto"><table class="w-full text-sm min-w-[520px]">
          <thead><tr class="text-left text-[13px] text-grafite/65 border-b border-tinta/[0.08]">
            ${cfg.colunas.map(([t]) => `<th class="px-6 py-3 font-medium">${t}</th>`).join('')}<th class="px-6 py-3"></th>
          </tr></thead>
          <tbody>${cfg.itens.length ? cfg.itens.map((it, i) => `
            <tr class="border-b border-tinta/[0.06] last:border-0">
              ${cfg.colunas.map(([, f]) => `<td class="px-6 py-3.5 text-grafite/80">${f(it)}</td>`).join('')}
              <td class="px-6 py-3.5 text-right"><button data-editar="${i}" class="text-petroleo font-semibold hover:underline">Editar</button></td>
            </tr>`).join('') : `<tr><td colspan="${cfg.colunas.length + 1}" class="px-6 py-6 text-grafite/65">Nada cadastrado.</td></tr>`}
          </tbody></table></div>
      </section>`;
  };

  cfg.carregar = async (busca = '') => {
    try {
      const resposta = await Api.admListar(cfg.recurso, busca ? `?busca=${encodeURIComponent(busca)}` : '');
      cfg.itens = resposta[cfg.chave];
      const campoBusca = cfg.raiz.querySelector('[data-busca]');
      const foco = campoBusca && document.activeElement === campoBusca;
      cfg.desenhar();
      if (cfg.busca) {
        const novo = cfg.raiz.querySelector('[data-busca]');
        novo.value = busca;
        if (foco) { novo.focus(); novo.setSelectionRange(busca.length, busca.length); }
      }
    } catch (erro) { tratarErro(erro); }
  };

  cfg.raiz.addEventListener('click', (e) => {
    if (e.target.closest('[data-novo]')) abrirCadastro(cfg, null);
    const editar = e.target.closest('[data-editar]');
    if (editar) abrirCadastro(cfg, cfg.itens[Number(editar.dataset.editar)]);
  });
  let temporizador;
  cfg.raiz.addEventListener('input', (e) => {
    if (!e.target.matches('[data-busca]')) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => cfg.carregar(e.target.value.trim()), 300);
  });
}

/* ---------- Modal de cadastro ---------- */

const cadModal = $('cadModal');
const cadForm = $('cadForm');
let cadAtual = null; // { cfg, item }

function abrirCadastro(cfg, item) {
  cadAtual = { cfg, item };
  $('cadTitulo').textContent = item ? `Editar ${cfg.singular}` : `Novo ${cfg.singular}`;
  const valores = item ?? cfg.novo;
  cadForm.innerHTML = cfg.campos()
    .filter((c) => !(c.soEdicao && !item))
    .map((c) => {
      const id = `cad_${c.nome}`;
      const base = 'w-full mt-1 border border-grafite/15 rounded-xl px-4 py-3 text-sm bg-superficie focus:outline-none focus:border-petroleo';
      const v = valores[c.nome] ?? '';
      if (c.tipo === 'check') {
        return `<label class="flex items-center gap-2 text-sm font-medium"><input id="${id}" name="${c.nome}" type="checkbox" ${v ? 'checked' : ''}> ${c.rotulo}</label>`;
      }
      let campo;
      if (c.tipo === 'select') {
        campo = `<select id="${id}" name="${c.nome}" class="${base}">${c.opcoes.map((o) => `<option ${o === v ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
      } else if (c.tipo === 'textarea') {
        campo = `<textarea id="${id}" name="${c.nome}" rows="3" maxlength="${c.max}" class="${base} resize-none">${escapeHtml(v)}</textarea>`;
      } else {
        const obrigatorio = c.senha ? !item : !c.opcional;
        campo = `<input id="${id}" name="${c.nome}" type="${c.tipo || 'text'}" ${c.max ? `maxlength="${c.max}"` : ''} ${c.step ? `step="${c.step}"` : ''}
          ${c.tipo === 'number' && c.min ? `min="${c.min}"` : ''} ${c.senha ? `minlength="6" autocomplete="new-password" placeholder="${item ? 'Deixe em branco para manter a atual' : 'Mínimo de 6 caracteres'}"` : ''}
          ${obrigatorio ? 'required' : ''} value="${c.senha ? '' : escapeHtml(v)}" class="${base}">`;
      }
      return `<div><label class="text-[13px] font-medium text-grafite/65" for="${id}">${c.rotulo}</label>${campo}</div>`;
    }).join('') +
    `<button type="submit" id="cadSalvar" class="mt-2 w-full py-3.5 rounded-xl bg-petroleo text-white text-[17px] font-semibold hover:brightness-110 transition">Salvar</button>`;
  cadModal.classList.remove('hidden');
  cadModal.classList.add('flex');
  cadForm.querySelector('input,select,textarea')?.focus();
}

function fecharCadastro() {
  cadModal.classList.add('hidden');
  cadModal.classList.remove('flex');
}
$('cadFechar').addEventListener('click', fecharCadastro);
cadModal.addEventListener('click', (e) => { if (e.target === cadModal) fecharCadastro(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharCadastro(); });

cadForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const { cfg, item } = cadAtual;
  const dados = {};
  for (const c of cfg.campos()) {
    if (c.soEdicao && !item) continue;
    const campo = cadForm.elements[c.nome];
    dados[c.nome] = c.tipo === 'check' ? campo.checked : campo.value;
  }
  if (item && dados.senha === '') delete dados.senha;
  const botao = $('cadSalvar');
  botao.disabled = true;
  try {
    if (item) await Api.admAtualizar(cfg.recurso, item.id, dados);
    else await Api.admCriar(cfg.recurso, dados);
    fecharCadastro();
    showToast(`${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} salvo.`, 'success');
    cfg.carregar();
    if (cfg.recurso === 'professores') carregarProfessoresNosSelects();
  } catch (erro) {
    showToast(erro.message, 'error');
    botao.disabled = false;
  }
});

/* ---------- Agendamentos gerais ---------- */

const fData = $('fData');

function dataLocalHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function carregarAgendamentos() {
  const q = new URLSearchParams();
  if ($('fTodas').checked) q.set('todas', '1');
  else if (fData.value) q.set('data', fData.value);
  if ($('fStatus').value) q.set('status', $('fStatus').value);
  if ($('fProfessor').value) q.set('professorId', $('fProfessor').value);
  try {
    const { agendamentos } = await Api.admListar('agendamentos', `?${q}`);
    $('tabelaTodosAgendamentos').innerHTML = agendamentos.length
      ? agendamentos.map((a) => `
        <tr class="border-b border-tinta/[0.06] last:border-0">
          <td class="px-6 py-3.5 text-grafite/70">${formatarDataISO(a.data)}</td>
          <td class="px-6 py-3.5 text-grafite/70">${escapeHtml(a.hora)}</td>
          <td class="px-6 py-3.5 font-medium">${escapeHtml(a.aluno_nome)}</td>
          <td class="px-6 py-3.5 text-grafite/70">${escapeHtml(a.professor)}</td>
          <td class="px-6 py-3.5 text-grafite/70">${escapeHtml(a.tipo_treino)}, ${escapeHtml(a.nivel.toLowerCase())}</td>
          <td class="px-6 py-3.5">
            <select data-aula="${a.id}" aria-label="Status da aula" class="border border-grafite/15 rounded-full px-3 py-1.5 text-xs font-semibold bg-superficie">
              ${opcoesAdmin.statusAgendamento.map((s) => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="px-6 py-6 text-grafite/65">Nenhum agendamento encontrado.</td></tr>';
  } catch (erro) { tratarErro(erro); }
}

['fData', 'fTodas', 'fStatus', 'fProfessor'].forEach((id) => $(id).addEventListener('change', carregarAgendamentos));
$('fTodas').addEventListener('change', () => { fData.disabled = $('fTodas').checked; });

$('tabelaTodosAgendamentos').addEventListener('change', async (e) => {
  const select = e.target.closest('[data-aula]');
  if (!select) return;
  try {
    await Api.admStatusAula(select.dataset.aula, select.value);
    showToast('Status atualizado.', 'success');
  } catch (erro) { tratarErro(erro); carregarAgendamentos(); }
});

async function carregarProfessoresNosSelects() {
  try {
    const { professores } = await Api.admListar('professores');
    const ativos = professores.filter((p) => p.ativo);
    $('agProfessor').innerHTML = ativos.map((p) => `<option>${escapeHtml(p.nome)}</option>`).join('');
    $('fProfessor').innerHTML = '<option value="">Todos os professores</option>' +
      professores.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
  } catch (erro) { tratarErro(erro); }
}

/* ---------- Solicitações de cancelamento ---------- */

const ROTULO_SOL = {
  PENDENTE: ['Pendente', 'bg-petroleo/10 text-petroleo'],
  APROVADA: ['Aprovada', 'bg-oliva/10 text-oliva'],
  RECUSADA: ['Recusada', 'bg-terracota/10 text-terracota'],
};

async function carregarSolicitacoes() {
  try {
    const { solicitacoes } = await Api.admListar('solicitacoes');
    atualizarBadge(solicitacoes);
    $('listaSolicitacoes').innerHTML = solicitacoes.length
      ? solicitacoes.map((s) => `
        <div class="bg-superficie rounded-3xl p-5 md:p-6">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div><p class="text-[17px] font-semibold">${escapeHtml(s.aluno_nome)}</p><p class="text-grafite/65 text-[13px]">${escapeHtml(s.plano_nome)}, pedido em ${formatarDataHora(s.criado_em)}</p></div>
            <span class="px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${ROTULO_SOL[s.status][1]}">${ROTULO_SOL[s.status][0]}</span>
          </div>
          <p class="text-sm text-grafite/70">“${escapeHtml(s.motivo)}”</p>
          ${s.status === 'PENDENTE' ? `
            <div class="mt-4 flex flex-wrap gap-2" data-sol="${s.id}">
              <input data-resposta placeholder="Resposta ao aluno (opcional)" maxlength="300" class="flex-1 min-w-[200px] border border-grafite/15 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-petroleo">
              <button data-decisao="APROVADA" class="px-5 py-2 rounded-full bg-petroleo text-white text-sm font-semibold hover:brightness-110">Aprovar</button>
              <button data-decisao="RECUSADA" class="px-5 py-2 rounded-full bg-terracota/10 text-terracota text-sm font-semibold hover:bg-terracota/15">Recusar</button>
            </div>` : (s.resposta ? `<p class="text-sm mt-2">Resposta: ${escapeHtml(s.resposta)}</p>` : '')}
        </div>`).join('')
      : '<div class="bg-superficie rounded-3xl p-8 text-center text-grafite/65 text-[15px]">Nenhum pedido de cancelamento.</div>';
  } catch (erro) { tratarErro(erro); }
}

function atualizarBadge(solicitacoes) {
  const pendentes = solicitacoes.filter((s) => s.status === 'PENDENTE').length;
  const badge = $('badgeSolicitacoes');
  badge.textContent = pendentes;
  badge.classList.toggle('hidden', pendentes === 0);
}

$('listaSolicitacoes').addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-decisao]');
  if (!botao) return;
  const caixa = botao.closest('[data-sol]');
  const decisao = botao.dataset.decisao;
  if (decisao === 'APROVADA' && !confirm('Aprovar? O plano será encerrado e as aulas futuras do aluno serão canceladas.')) return;
  try {
    await Api.admResolverSolicitacao(caixa.dataset.sol, decisao, caixa.querySelector('[data-resposta]').value);
    showToast(decisao === 'APROVADA' ? 'Cancelamento aprovado.' : 'Pedido recusado.', 'success');
    carregarSolicitacoes();
  } catch (erro) { tratarErro(erro); }
});

/* ---------- Pagamentos ---------- */

async function carregarPagamentos() {
  const q = new URLSearchParams();
  if ($('filtroPedStatus').value) q.set('status', $('filtroPedStatus').value);
  if ($('filtroPedMetodo').value) q.set('metodo', $('filtroPedMetodo').value);
  q.set('limite', '200');
  try {
    const { pedidos } = await Api.listarPedidos(`?${q}`);
    renderPedidos(pedidos);
  } catch (erro) { tratarErro(erro); }
}
['filtroPedStatus', 'filtroPedMetodo'].forEach((id) => $(id).addEventListener('change', carregarPagamentos));

/* ---------- Inicialização ---------- */

(async function iniciar() {
  fData.value = dataLocalHoje();
  try {
    opcoesAdmin = await Api.admOpcoes();
    $('fStatus').innerHTML = '<option value="">Todos os status</option>' +
      opcoesAdmin.statusAgendamento.map((s) => `<option>${s}</option>`).join('');
    await carregarProfessoresNosSelects();
    const { solicitacoes } = await Api.admListar('solicitacoes', '?status=PENDENTE');
    atualizarBadge(solicitacoes);
  } catch (erro) { tratarErro(erro); }
  const aba = location.hash.slice(1);
  abrirAba(ABAS.includes(aba) ? aba : 'geral');
})();
