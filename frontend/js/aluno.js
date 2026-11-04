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
    b.setAttribute('aria-selected', ativa); // o visual da aba ativa vem do CSS (.segmentado / .tabbar)
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

  lista.innerHTML = '<p class="text-sm text-grafite/65">Buscando horários...</p>';
  try {
    const { horarios } = await Api.alunoHorarios(professorId, data);
    if (!horarios.length) {
      lista.innerHTML = '<p class="text-sm text-grafite/65">Sem horários livres nesse dia. Tente outra data ou outro professor.</p>';
      return;
    }
    lista.innerHTML = horarios
      .map((h) => `<button type="button" data-hora="${h}" class="chip-hora px-4 py-2.5 rounded-xl bg-offwhite text-[15px] font-semibold tabular-nums hover:bg-tinta/[0.07] transition">${h}</button>`)
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
    b.classList.toggle('bg-offwhite', !ativo);
  });
  el('btnAgendar').disabled = !planoAtivo;
});

el('agProfessor').addEventListener('change', carregarHorarios);
el('agData').addEventListener('change', carregarHorarios);

/** "2026-11-05" -> "quinta, 05/11" */
function diaCurto(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const nome = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(a, m - 1, d).getDay()];
  return `${nome}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Janela de comemoração depois de agendar: check desenhado, linha do pulso e confetes da marca. */
function comemorarAgendamento({ data, hora, tipo, professor }) {
  const janela = document.createElement('dialog');
  janela.className = 'comemora';
  const cores = ['#A4532F', '#F2A07A', '#425B63', '#5C6B3B', '#ffffff'];
  const confetes = Array.from({ length: 26 }, (_, i) =>
    `<i style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 0.6).toFixed(2)}s;--r:${Math.round(Math.random() * 360)}deg;--c:${cores[i % cores.length]}"></i>`).join('');
  janela.innerHTML = `
    <div class="comemora-confete" aria-hidden="true">${confetes}</div>
    <svg class="comemora-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23"/><path d="M15 27l7 7 15-16"/></svg>
    <p class="rotulo-secao !text-[#F2A07A] mt-6">Tudo certo</p>
    <h2 class="comemora-titulo">Aula agendada!</h2>
    <p class="comemora-detalhe">${escapeHtml(diaCurto(data))} às ${escapeHtml(hora)}<br>${escapeHtml(tipo)} com ${escapeHtml(professor)}</p>
    <svg class="comemora-pulso" viewBox="0 0 300 60" fill="none" aria-hidden="true"><path d="M0 30h96l12-22 16 44 14-36 10 14h152" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <button type="button" class="botao-destaque w-full mt-6">Ver minhas aulas</button>`;
  document.body.appendChild(janela);
  // Fecha pelo botão ou pela tecla Esc (evento "close"); o que vier primeiro.
  let fechada = false;
  const fechar = () => {
    if (fechada) return;
    fechada = true;
    if (janela.open) janela.close();
    janela.remove();
    abrirAba('aulas');
  };
  janela.addEventListener('close', fechar);
  janela.querySelector('button').addEventListener('click', fechar);
  janela.showModal();
}

el('formAgendar').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!horarioEscolhido) return;
  const botao = el('btnAgendar');
  botao.disabled = true;
  const opcaoProfessor = el('agProfessor').selectedOptions[0];
  const agendado = { data: el('agData').value, hora: horarioEscolhido, tipo: el('agTipo').value, professor: opcaoProfessor ? opcaoProfessor.textContent : '' };
  try {
    await Api.alunoAgendar({
      professorId: Number(el('agProfessor').value),
      tipoTreino: el('agTipo').value,
      nivel: el('agNivel').value,
      data: el('agData').value,
      hora: horarioEscolhido,
    });
    atualizarLado();
    comemorarAgendamento(agendado);
  } catch (erro) {
    tratarErro(erro);
    carregarHorarios(); // o horário pode ter sido ocupado por outra pessoa
  }
});

// Só aparecem os professores da modalidade escolhida.
let todosProfessores = [];
function filtrarProfessores() {
  const tipo = el('agTipo').value;
  const daModalidade = todosProfessores.filter((p) => p.especialidade === tipo);
  opcoesSelect(el('agProfessor'), daModalidade, (p) => p.nome, (p) => p.id);
  if (!daModalidade.length) el('agProfessor').innerHTML = '<option value="">Nenhum professor nessa modalidade</option>';
  carregarHorarios();
}
el('agTipo').addEventListener('change', filtrarProfessores);

async function iniciarAgendar() {
  const o = await Api.alunoOpcoes();
  opcoesSelect(el('agTipo'), o.tiposTreino);
  opcoesSelect(el('agNivel'), o.niveis);
  todosProfessores = o.professores;
  el('agData').min = o.dataMinima;
  el('agData').max = o.dataMaxima;
  el('agData').value = o.dataMinima;
  window.ANTECEDENCIA = o.antecedenciaCancelamentoHoras;
  filtrarProfessores();
}

/* ---------- Minhas aulas ---------- */

async function carregarAulas() {
  const lista = el('listaAulas');
  try {
    const { agendamentos } = await Api.alunoAgendamentos();
    if (!agendamentos.length) {
      lista.innerHTML = '<div class="bg-superficie rounded-3xl p-8 text-center"><p class="text-[17px] font-semibold">Nenhuma aula por aqui</p><p class="text-grafite/65 text-[15px] mt-1">Toque em Agendar para marcar sua primeira aula.</p></div>';
      return;
    }
    // Lista agrupada (estilo iOS): um cartão só, linhas separadas por fio.
    lista.innerHTML = `<div class="bg-superficie rounded-3xl overflow-hidden lista-ios">${agendamentos.map((a) => `
      <div class="px-5 py-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[17px] font-semibold">${formatarDataISO(a.data)}, ${escapeHtml(a.hora)}</p>
          <p class="text-[14px] text-grafite/65 mt-0.5">${escapeHtml(a.tipo_treino)}, ${escapeHtml(a.nivel.toLowerCase())}, com ${escapeHtml(a.professor)}</p>
        </div>
        <div class="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
          <span class="px-2.5 py-0.5 rounded text-[12px] font-semibold ${ESTILO_AULA[a.status] || ''}">${escapeHtml(a.status)}</span>
          ${a.podeCancelar ? `<button data-cancelar="${a.id}" class="text-[14px] font-medium text-terracota hover:underline">Cancelar</button>` : ''}
        </div>
      </div>`).join('')}</div>
      <p class="text-[13px] text-grafite/65 mt-3 px-5">Dá pra cancelar até ${window.ANTECEDENCIA || 2} horas antes da aula.</p>`;
  } catch (erro) { tratarErro(erro); }
}

el('listaAulas').addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-cancelar]');
  if (!botao || !confirm('Cancelar esta aula?')) return;
  try {
    await Api.alunoCancelarAula(botao.dataset.cancelar);
    showToast('Aula cancelada.', 'success');
    carregarAulas();
    atualizarLado();
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
      ? `<div class="mt-4 rounded-2xl bg-offwhite p-4 text-[15px]">
           <span class="px-2.5 py-0.5 rounded text-[12px] font-semibold ${aviso[1]}">${aviso[0]}</span>
           <p class="text-grafite/65 mt-2">Seu motivo: “${escapeHtml(solicitacao.motivo)}”</p>
           ${solicitacao.resposta ? `<p class="mt-1">Resposta da recepção: ${escapeHtml(solicitacao.resposta)}</p>` : ''}
         </div>` : '';

    if (!plano) {
      el('cartaoPlano').innerHTML = `
        <p class="font-bold mb-1">Você não tem um plano ativo.</p>
        <p class="text-sm text-grafite/65 mb-4">Escolha um plano na loja para poder agendar suas aulas.</p>
        <a href="loja.html#planos" class="inline-block px-6 py-3 rounded bg-petroleo text-white text-[15px] font-medium hover:brightness-110 transition">Ver planos</a>
        ${respostaHtml}`;
      form.classList.add('hidden');
    } else {
      el('cartaoPlano').innerHTML = `
        <p class="text-grafite/65 text-[15px]">Seu plano</p>
        <p class="text-[28px] font-bold tracking-tight">${escapeHtml(plano.plano_nome)}</p>
        <p class="text-sm text-grafite/65 mt-1">${formatarPreco(plano.preco)} ${escapeHtml(plano.periodo)}, válido até <strong>${formatarDataISO(plano.data_vencimento)}</strong></p>
        <a href="loja.html#planos" class="inline-block mt-4 text-sm font-semibold text-petroleo hover:underline">Renovar ou trocar de plano</a>
        ${respostaHtml}`;
      form.classList.toggle('hidden', !!(solicitacao && solicitacao.status === 'PENDENTE'));
    }
    resumirPlano();
  } catch (erro) { tratarErro(erro); }
}

function resumirPlano() {
  el('resumoPlano').textContent = planoAtivo
    ? `${planoAtivo.plano_nome}, válido até ${formatarDataISO(planoAtivo.data_vencimento)}`
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

/* ---------- Coluna ao lado ---------- */

async function atualizarLado() {
  const caixaAula = el('ladoProximaAula');
  const caixaPlano = el('ladoPlano');
  if (!caixaAula) return;
  try {
    const { agendamentos } = await Api.alunoAgendamentos();
    const agora = new Date();
    const hojeISO = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    const horaAgora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    const proxima = agendamentos
      .filter((a) => a.status !== 'Cancelado' && (a.data > hojeISO || (a.data === hojeISO && a.hora >= horaAgora)))
      .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`))[0];
    caixaAula.innerHTML = proxima
      ? `<p class="lado-hora">${escapeHtml(proxima.hora)}</p>
         <p class="text-[15px] font-semibold text-white first-letter:uppercase">${escapeHtml(diaCurto(proxima.data))}</p>
         <p class="text-[15px] text-white/75 mt-1">${escapeHtml(proxima.tipo_treino)} com ${escapeHtml(proxima.professor)}</p>`
      : `<p class="mt-3 text-[17px] font-semibold text-white">Nenhuma aula marcada</p>
         <button type="button" class="aba-atalho link-seta mt-4" data-aba="agendar">Agendar agora <span aria-hidden="true">→</span></button>`;
    caixaAula.querySelector('.aba-atalho')?.addEventListener('click', () => abrirAba('agendar'));
  } catch { caixaAula.innerHTML = '<p class="mt-3 text-white/70 text-[15px]">Não foi possível carregar.</p>'; }

  if (!planoAtivo) {
    caixaPlano.innerHTML = `<p class="mt-3 text-[17px] font-semibold">Sem plano ativo</p>
      <p class="text-[14px] text-grafite/65 mt-1">Escolha um plano para agendar suas aulas.</p>
      <a href="loja.html#planos" class="botao-destaque w-full mt-4">Ver planos</a>`;
    return;
  }
  const [a, m, d] = planoAtivo.data_vencimento.split('-').map(Number);
  const faltam = Math.max(0, Math.ceil((new Date(a, m - 1, d) - new Date()) / 86400000));
  const total = { mensal: 30, trimestral: 90, anual: 365 }[String(planoAtivo.periodo || '').toLowerCase()] || Math.max(30, faltam);
  caixaPlano.innerHTML = `<p class="mt-3 text-[22px] font-black uppercase tracking-tight leading-none">${escapeHtml(planoAtivo.plano_nome)}</p>
    <p class="text-[14px] text-grafite/65 mt-2">Válido até ${formatarDataISO(planoAtivo.data_vencimento)}</p>
    <div class="lado-progresso" role="img" aria-label="Faltam ${faltam} dias"><span style="--p:${Math.min(100, Math.round((faltam / total) * 100))}%"></span></div>
    <p class="text-[13px] font-bold mt-2">${faltam === 1 ? 'Falta 1 dia' : `Faltam ${faltam} dias`}</p>`;
}

/* ---------- Pedidos ---------- */

async function carregarPedidos() {
  const lista = el('listaPedidos');
  try {
    const { pedidos } = await Api.meusPedidos();
    if (!pedidos.length) {
      lista.innerHTML = '<div class="bg-superficie rounded-3xl p-8 text-center"><p class="text-[17px] font-semibold">Nenhuma compra ainda</p><p class="text-grafite/65 text-[15px] mt-1"><a href="loja.html" class="text-petroleo hover:underline">Abrir a loja</a></p></div>';
      return;
    }
    lista.innerHTML = `<div class="bg-superficie rounded-3xl overflow-hidden lista-ios">${pedidos.map((p) => {
      const [rotulo, cor] = ESTILO_PEDIDO[p.status] || [p.status, ''];
      return `
      <div class="px-5 py-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[17px] font-semibold">Pedido nº ${p.id}</p>
          <p class="text-[14px] text-grafite/65 truncate mt-0.5">${escapeHtml(p.itens_resumo || '')}</p>
          <p class="text-[13px] text-grafite/65 mt-0.5">${formatarDataHora(p.criado_em)}, ${escapeHtml(NOME_METODO[p.metodo] || p.metodo)}</p>
        </div>
        <div class="flex flex-col items-end gap-1.5 shrink-0">
          <span class="text-[17px] font-semibold">${formatarPreco(p.total)}</span>
          <span class="px-2.5 py-0.5 rounded text-[12px] font-semibold ${cor}">${escapeHtml(rotulo)}</span>
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch (erro) { tratarErro(erro); }
}

/* ---------- Inicialização ---------- */

// O botão Sair fica no menu da conta (avatar no topo), montado pelo ui.js.
const usuario = Auth.getUsuario();
if (usuario) el('saudacao').textContent = `Olá, ${String(usuario.nome).split(' ')[0]}!`;

(async function iniciar() {
  try {
    await Promise.all([iniciarAgendar(), Api.alunoPlano().then((r) => { planoAtivo = r.plano; resumirPlano(); })]);
  } catch (erro) { tratarErro(erro); }
  atualizarLado();
  const aba = location.hash.slice(1);
  abrirAba(['agendar', 'aulas', 'plano', 'pedidos'].includes(aba) ? aba : 'agendar');
})();
