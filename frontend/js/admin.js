/* =========================================================
   admin.js — Painel da recepção (admin.html)
   Busca KPIs, atendimentos e avisos REAIS da API (rotas protegidas por
   JWT + role ADMIN) e permite criar agendamentos e avisos.
   Depende de: Auth, Api (api.js) e showToast/escapeHtml (ui.js).
   ========================================================= */

const STATUS_ESTILOS = {
  Confirmado: 'bg-oliva/10 text-oliva',
  'Em andamento': 'bg-petroleo/10 text-petroleo',
  Cancelado: 'bg-terracota/10 text-terracota',
};

/* ---------- Sessão ---------- */

/**
 * Se a API devolver 401/403 (token expirado, usuário sem role ADMIN...),
 * o api.js já limpa a sessão em 401. Aqui só decidimos o que mostrar.
 */
function tratarErro(erro) {
  if (!Auth.estaLogado()) {
    window.location.href = 'login.html';
    return;
  }
  showToast(erro.message, 'error');
}

/* ---------- Renderização ---------- */

function renderKpis({ agendamentosHoje, alunosAtivos, vencimentosHoje }) {
  document.getElementById('kpiAgendamentos').textContent = agendamentosHoje;
  document.getElementById('kpiAlunos').textContent = alunosAtivos;
  document.getElementById('kpiVencimentos').textContent = vencimentosHoje;
}

function renderAgendamentos(agendamentos) {
  const tbody = document.getElementById('tabelaAtendimentos');

  if (agendamentos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-6 text-grafite/65">Nenhum atendimento agendado para hoje.</td></tr>`;
    return;
  }

  tbody.innerHTML = agendamentos
    .map(
      (a) => `
      <tr class="border-b border-tinta/[0.06] last:border-0">
        <td class="px-6 py-3.5 text-grafite/70">${escapeHtml(a.hora)}</td>
        <td class="px-6 py-3.5 font-medium">${escapeHtml(a.aluno_nome)}</td>
        <td class="px-6 py-3.5 text-grafite/70">${escapeHtml(a.professor)}</td>
        <td class="px-6 py-3.5">
          <span class="px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${STATUS_ESTILOS[a.status] || ''}">${escapeHtml(a.status)}</span>
        </td>
      </tr>`
    )
    .join('');
}

function renderAvisos(avisos) {
  const lista = document.getElementById('listaAvisos');

  if (avisos.length === 0) {
    lista.innerHTML = `<p class="text-grafite/65 text-sm">Nenhum aviso publicado ainda.</p>`;
    return;
  }

  lista.innerHTML = avisos
    .map(
      (a) => `
      <div class="bg-offwhite rounded-2xl p-3.5">
        <p class="text-[11px] text-grafite/65 mb-1">${formatarDataHora(a.criado_em)}</p>
        <p class="text-sm">${escapeHtml(a.texto)}</p>
      </div>`
    )
    .join('');
}

const NOME_METODO = { PIX: 'Pix', CARTAO: 'Cartão', BOLETO: 'Boleto' };
const ESTILO_PEDIDO = {
  PAGO: ['Pago', 'bg-oliva/10 text-oliva'],
  PENDENTE: ['Pendente', 'bg-petroleo/10 text-petroleo'],
  EXPIRADO: ['Expirado', 'bg-terracota/10 text-terracota'],
};

function renderPedidos(pedidos) {
  const tbody = document.getElementById('tabelaPedidos');

  if (pedidos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-6 text-grafite/65">Nenhum pedido feito na loja ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = pedidos
    .map(
      (p) => `
      <tr class="border-b border-tinta/[0.06] last:border-0">
        <td class="px-6 py-3.5 text-grafite/70">#${p.id} <span class="text-grafite/65 text-xs">${formatarDataHora(p.criado_em)}</span></td>
        <td class="px-6 py-3.5 font-medium">${escapeHtml(p.aluno_nome)}</td>
        <td class="px-6 py-3.5 text-grafite/70">${p.qtd_itens}</td>
        <td class="px-6 py-3.5 text-grafite/70">${escapeHtml(NOME_METODO[p.metodo] || p.metodo)}${p.parcelas > 1 ? ` · ${p.parcelas}x` : ''}</td>
        <td class="px-6 py-3.5"><span class="px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${(ESTILO_PEDIDO[p.status] || ['', ''])[1]}">${escapeHtml((ESTILO_PEDIDO[p.status] || [p.status])[0])}</span></td>
        <td class="px-6 py-3.5 text-right font-semibold">${formatarPreco(p.total)}</td>
      </tr>`
    )
    .join('');
}

/* ---------- Carregamento de dados ---------- */

async function carregarTudo() {
  try {
    // Em paralelo: as requisições são independentes.
    const [kpis, { agendamentos }, { avisos }, { pedidos }] = await Promise.all([
      Api.kpis(),
      Api.listarAgendamentosDeHoje(),
      Api.listarAvisos(),
      Api.listarPedidos(),
    ]);
    renderKpis(kpis);
    renderAgendamentos(agendamentos);
    renderAvisos(avisos);
    renderPedidos(pedidos);
  } catch (erro) {
    tratarErro(erro);
  }
}

/* ---------- Modal de novo agendamento ---------- */

const modal = document.getElementById('agendamentoModal');

function abrirModal() {
  document.getElementById('agendamentoForm').reset();
  const agora = new Date();
  document.getElementById('agHora').value =
    `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.getElementById('agAluno').focus();
}

function fecharModal() {
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

document.getElementById('btnNovoAgendamento').addEventListener('click', abrirModal);
document.getElementById('modalFechar').addEventListener('click', fecharModal);
modal.addEventListener('click', (e) => { if (e.target === modal) fecharModal(); }); // clique fora
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });

document.getElementById('agendamentoForm').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const botao = document.getElementById('agSubmit');
  const aluno = document.getElementById('agAluno').value.trim();
  const professor = document.getElementById('agProfessor').value;
  const hora = document.getElementById('agHora').value;

  botao.disabled = true;
  try {
    await Api.criarAgendamento(aluno, professor, hora);
    fecharModal();
    showToast(`Agendamento de ${aluno} com ${professor} criado.`, 'success');
    await carregarTudo(); // recarrega do servidor: KPIs e tabela refletem o banco
  } catch (erro) {
    tratarErro(erro);
  } finally {
    botao.disabled = false;
  }
});

/* ---------- Avisos ---------- */

document.getElementById('avisoForm').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const campo = document.getElementById('avisoTexto');
  try {
    await Api.publicarAviso(campo.value);
    campo.value = '';
    showToast('Aviso publicado para os alunos.', 'success');
    const { avisos } = await Api.listarAvisos();
    renderAvisos(avisos);
  } catch (erro) {
    tratarErro(erro);
  }
});

/* ---------- Informações da academia (UC07) ---------- */

const formAcademia = document.getElementById('academiaForm');
const CAMPOS_ACADEMIA = ['endereco', 'mapa_consulta', 'email', 'telefone', 'horario_semana', 'horario_sabado', 'descricao'];

function preencherFormAcademia({ academia, mapa }) {
  const valores = { ...academia, mapa_consulta: mapa.consulta };
  CAMPOS_ACADEMIA.forEach((campo) => { formAcademia.elements[campo].value = valores[campo] ?? ''; });
}

Api.obterAcademia().then(preencherFormAcademia).catch(tratarErro);

formAcademia.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const botao = document.getElementById('acSalvar');
  const dados = Object.fromEntries(CAMPOS_ACADEMIA.map((c) => [c, formAcademia.elements[c].value]));
  botao.disabled = true;
  try {
    preencherFormAcademia(await Api.atualizarAcademia(dados));
    showToast('Informações salvas. O site já mostra os novos dados.', 'success');
  } catch (erro) {
    tratarErro(erro);
  } finally {
    botao.disabled = false;
  }
});

/* ---------- Inicialização ---------- */

// O botão Sair fica no menu da conta (avatar no topo), montado pelo ui.js.

const usuario = Auth.getUsuario();
if (usuario) {
  document.getElementById('saudacao').textContent = `Olá, ${usuario.nome}!`;
}
document.getElementById('dataHoje').textContent = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long', day: 'numeric', month: 'long',
});

