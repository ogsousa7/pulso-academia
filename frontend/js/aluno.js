/* =========================================================
   aluno.js — Área do aluno (aluno.html)
   UC05: agendar / consultar / cancelar aula
   UC06: consultar plano e solicitar cancelamento do plano
   Depende de: Auth, Api (api.js) e showToast/escapeHtml/format* (ui.js).
   ========================================================= */

const ESTILO_AULA = {
  Confirmado: 'bg-oliva/10 text-oliva',
  'Em andamento': 'bg-petroleo/10 text-petroleo',
  Cancelado: 'bg-terracota/10 text-terracota',
};
const NOME_METODO = { PIX: 'Pix', CARTAO: 'Cartão', BOLETO: 'Boleto' };
const ESTILO_PEDIDO = {
  PAGO: ['Pago', 'bg-oliva/10 text-oliva'],
  PENDENTE: ['Pendente', 'bg-petroleo/10 text-petroleo'],
  EXPIRADO: ['Expirado', 'bg-terracota/10 text-terracota'],
};

const el = (id) => document.getElementById(id);
let planoAtivo = null;
let horarioEscolhido = null;

function tratarErro(erro) {
  if (!Auth.estaLogado()) { window.location.href = 'login.html?next=aluno.html'; return; }
  showToast(erro.message, 'error');
}

/* ---------- Abas ---------- */

function abrirAba(nome) {
  document.querySelectorAll('.painel').forEach((p) => p.classList.toggle('hidden', p.id !== `painel-${nome}`));
  document.querySelectorAll('.aba').forEach((b) => {
    const ativa = b.dataset.aba === nome;
    b.setAttribute('aria-selected', ativa);
    b.className = `aba px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${
      ativa ? 'bg-grafite text-white' : 'bg-white border border-grafite/15 text-grafite/70 hover:bg-grafite/5'}`;
  });
  if (nome === 'aulas') carregarAulas();
  if (nome === 'plano') carregarPlano();
  if (nome === 'pedidos') carregarPedidos();
  history.replaceState(null, '', `#${nome}`);
}
document.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

/* ---------- Agendar ---------- */

function opcoesSelect(select, itens, rotulo = (x) => x, valor = (x) => x) {
  select.innerHTML = itens.map((i) => `<option value="${escapeHtml(valor(i))}">${escapeHtml(rotulo(i))}</option>`).join('');
}

async function carregarHorarios() {
  horarioEscolhido = null;
  el('btnAgendar').disabled = true;
  const professorId = el('agProfessor').value;
  const data = el('agData').value;
  const lista = el('listaHorarios');
  if (!professorId || !data) return;

  lista.innerHTML = '<p class="text-sm text-grafite/40">Buscando horários...</p>';
  try {
    const { horarios } = await Api.alunoHorarios(professorId, data);
    if (!horarios.length) {
      lista.innerHTML = '<p class="text-sm text-grafite/50">Sem horários livres nesse dia. Tente outra data ou outro professor.</p>';
      return;
    }
    lista.innerHTML = horarios
      .map((h) => `<button type="button" data-hora="${h}" class="chip-hora px-4 py-2 rounded-full border border-grafite/15 text-sm font-semibold hover:border-petroleo transition">${h}</button>`)
      .join('');
  } catch (erro) {
    lista.innerHTML = `<p class="text-sm text-terracota">${escapeHtml(erro.message)}</p>`;
  }
}

el('listaHorarios').addEventListener('click', (e) => {
  const botao = e.target.closest('.chip-hora');
  if (!botao) return;
  horarioEscolhido = botao.dataset.hora;
  document.querySelectorAll('.chip-hora').forEach((b) => {
    const ativo = b === botao;
    b.classList.toggle('bg-petroleo', ativo);
    b.classList.toggle('text-white', ativo);
    b.classList.toggle('border-petroleo', ativo);
  });
  el('btnAgendar').disabled = !planoAtivo;
});

el('agProfessor').addEventListener('change', carregarHorarios);
el('agData').addEventListener('change', carregarHorarios);

el('formAgendar').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!horarioEscolhido) return;
  const botao = el('btnAgendar');
  botao.disabled = true;
  try {
    await Api.alunoAgendar({
      professorId: Number(el('agProfessor').value),
      tipoTreino: el('agTipo').value,
      nivel: el('agNivel').value,
      data: el('agData').value,
      hora: horarioEscolhido,
    });
    showToast('Aula agendada!', 'success');
    abrirAba('aulas');
  } catch (erro) {
    tratarErro(erro);
    carregarHorarios(); // o horário pode ter sido ocupado por outra pessoa
  }
});

async function iniciarAgendar() {
  const o = await Api.alunoOpcoes();
  opcoesSelect(el('agTipo'), o.tiposTreino);
  opcoesSelect(el('agNivel'), o.niveis);
  opcoesSelect(el('agProfessor'), o.professores, (p) => `${p.nome} — ${p.especialidade}`, (p) => p.id);
  el('agData').min = o.dataMinima;
  el('agData').max = o.dataMaxima;
  el('agData').value = o.dataMinima;
  window.ANTECEDENCIA = o.antecedenciaCancelamentoHoras;
  carregarHorarios();
}

/* ---------- Minhas aulas ---------- */

async function carregarAulas() {
  const lista = el('listaAulas');
  try {
    const { agendamentos } = await Api.alunoAgendamentos();
    if (!agendamentos.length) {
      lista.innerHTML = '<div class="bg-white border border-grafite/10 rounded-2xl p-6 text-grafite/50 text-sm">Você ainda não agendou nenhuma aula.</div>';
      return;
    }
    lista.innerHTML = agendamentos.map((a) => `
      <div class="bg-white border border-grafite/10 rounded-2xl p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-bold">${formatarDataISO(a.data)} às ${escapeHtml(a.hora)}</p>
          <p class="text-sm text-grafite/60">${escapeHtml(a.tipo_treino)} · ${escapeHtml(a.nivel)} · com ${escapeHtml(a.professor)}</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${ESTILO_AULA[a.status] || ''}">${escapeHtml(a.status)}</span>
          ${a.podeCancelar ? `<button data-cancelar="${a.id}" class="text-sm font-semibold text-terracota hover:underline">Cancelar</button>` : ''}
        </div>
      </div>`).join('') +
      `<p class="text-xs text-grafite/40">Cancelamento: até ${window.ANTECEDENCIA || 2} horas antes da aula.</p>`;
  } catch (erro) { tratarErro(erro); }
}

el('listaAulas').addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-cancelar]');
  if (!botao || !confirm('Cancelar esta aula?')) return;
  try {
    await Api.alunoCancelarAula(botao.dataset.cancelar);
    showToast('Aula cancelada.', 'success');
    carregarAulas();
  } catch (erro) { tratarErro(erro); }
});

/* ---------- Plano ---------- */

const ROTULO_SOLICITACAO = {
  PENDENTE: ['Pedido de cancelamento em análise', 'bg-petroleo/10 text-petroleo'],
  APROVADA: ['Cancelamento aprovado', 'bg-oliva/10 text-oliva'],
  RECUSADA: ['Cancelamento recusado', 'bg-terracota/10 text-terracota'],
};

async function carregarPlano() {
  try {
    const { plano, solicitacao } = await Api.alunoPlano();
    planoAtivo = plano;
    const form = el('formCancelarPlano');
    const aviso = solicitacao ? ROTULO_SOLICITACAO[solicitacao.status] : null;
    const respostaHtml = solicitacao
      ? `<div class="mt-4 rounded-xl border border-grafite/10 p-4 text-sm">
           <span class="px-3 py-1 rounded-full text-xs font-semibold ${aviso[1]}">${aviso[0]}</span>
           <p class="text-grafite/60 mt-2">Seu motivo: “${escapeHtml(solicitacao.motivo)}”</p>
           ${solicitacao.resposta ? `<p class="mt-1">Resposta da recepção: ${escapeHtml(solicitacao.resposta)}</p>` : ''}
         </div>` : '';

    if (!plano) {
      el('cartaoPlano').innerHTML = `
        <p class="font-bold mb-1">Você não tem um plano ativo.</p>
        <p class="text-sm text-grafite/60 mb-4">Escolha um plano na loja para poder agendar suas aulas.</p>
        <a href="loja.html#planos" class="inline-block px-6 py-3 rounded-full bg-petroleo text-white text-sm font-semibold hover:opacity-90 transition">Ver planos</a>
        ${respostaHtml}`;
      form.classList.add('hidden');
    } else {
      el('cartaoPlano').innerHTML = `
        <p class="text-grafite/50 text-sm">Seu plano</p>
        <p class="text-2xl font-extrabold">${escapeHtml(plano.plano_nome)}</p>
        <p class="text-sm text-grafite/60 mt-1">${formatarPreco(plano.preco)} ${escapeHtml(plano.periodo)} · válido até <strong>${formatarDataISO(plano.data_vencimento)}</strong></p>
        <a href="loja.html#planos" class="inline-block mt-4 text-sm font-semibold text-petroleo hover:underline">Renovar ou trocar de plano</a>
        ${respostaHtml}`;
      form.classList.toggle('hidden', !!(solicitacao && solicitacao.status === 'PENDENTE'));
    }
    resumirPlano();
  } catch (erro) { tratarErro(erro); }
}

function resumirPlano() {
  el('resumoPlano').textContent = planoAtivo
    ? `${planoAtivo.plano_nome} · válido até ${formatarDataISO(planoAtivo.data_vencimento)}`
    : 'Sem plano ativo';
  el('avisoSemPlano').classList.toggle('hidden', !!planoAtivo);
  if (!planoAtivo) el('btnAgendar').disabled = true;
}

el('formCancelarPlano').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!confirm('Enviar o pedido de cancelamento do plano?')) return;
  try {
    await Api.alunoCancelarPlano(el('motivoCancelamento').value);
    el('motivoCancelamento').value = '';
    showToast('Pedido enviado. A recepção vai analisar.', 'success');
    carregarPlano();
  } catch (erro) { tratarErro(erro); }
});

/* ---------- Pedidos ---------- */

async function carregarPedidos() {
  const lista = el('listaPedidos');
  try {
    const { pedidos } = await Api.meusPedidos();
    if (!pedidos.length) {
      lista.innerHTML = '<div class="bg-white border border-grafite/10 rounded-2xl p-6 text-grafite/50 text-sm">Você ainda não fez compras na loja.</div>';
      return;
    }
    lista.innerHTML = pedidos.map((p) => {
      const [rotulo, cor] = ESTILO_PEDIDO[p.status] || [p.status, ''];
      return `
      <div class="bg-white border border-grafite/10 rounded-2xl p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-bold">Pedido #${p.id} <span class="text-grafite/40 text-xs font-normal">${formatarDataHora(p.criado_em)}</span></p>
          <p class="text-sm text-grafite/60 truncate">${escapeHtml(p.itens_resumo || '')}</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${cor}">${escapeHtml(rotulo)}</span>
          <span class="text-sm text-grafite/60">${escapeHtml(NOME_METODO[p.metodo] || p.metodo)}</span>
          <span class="font-bold">${formatarPreco(p.total)}</span>
        </div>
      </div>`;
    }).join('');
  } catch (erro) { tratarErro(erro); }
}

/* ---------- Inicialização ---------- */

el('btnSair').addEventListener('click', () => Auth.logout());
const usuario = Auth.getUsuario();
if (usuario) el('saudacao').textContent = `Olá, ${String(usuario.nome).split(' ')[0]}!`;

(async function iniciar() {
  try {
    await Promise.all([iniciarAgendar(), Api.alunoPlano().then((r) => { planoAtivo = r.plano; resumirPlano(); })]);
  } catch (erro) { tratarErro(erro); }
  const aba = location.hash.slice(1);
  abrirAba(['agendar', 'aulas', 'plano', 'pedidos'].includes(aba) ? aba : 'agendar');
})();
