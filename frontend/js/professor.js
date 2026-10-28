/* =========================================================
   professor.js — Área do professor (professor.html) — UC08
   Consulta a PRÓPRIA agenda e configura a disponibilidade semanal.
   Depende de: Auth, Api (api.js) e showToast/escapeHtml/format* (ui.js).
   ========================================================= */

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_LONGOS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const ESTILO_AULA = {
  Confirmado: 'bg-oliva/10 text-oliva',
  'Em andamento': 'bg-petroleo/10 text-petroleo',
};
const el = (id) => document.getElementById(id);
const HOJE = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
let selecionados = new Set(); // "dia|hora"
let horasPossiveis = [];

function tratarErro(erro) {
  if (!Auth.estaLogado()) { window.location.href = 'login.html?next=index.html'; return; }
  showToast(erro.message, 'error');
}

function abrirAba(nome) {
  document.querySelectorAll('.painel').forEach((p) => p.classList.toggle('hidden', p.id !== `painel-${nome}`));
  document.querySelectorAll('.aba').forEach((b) => {
    const ativa = b.dataset.aba === nome;
    b.setAttribute('aria-selected', ativa); // o visual da aba ativa vem do CSS (.segmentado / .tabbar)
  });
  if (nome === 'agenda') carregarAgenda();
  if (nome === 'disponibilidade') carregarDisponibilidade();
  history.replaceState(null, '', `#${nome}`);
}
document.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

/* ---------- Agenda ---------- */

/** "2026-10-26" -> "Segunda-feira, 26/10" (sem passar por fuso). */
function tituloDoDia(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const nome = DIAS_LONGOS[new Date(a, m - 1, d).getDay()];
  return `${iso === hojeISO ? 'Hoje · ' : ''}${nome}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

async function carregarAgenda() {
  try {
    const { professor, agendamentos, de, ate } = await Api.profAgenda();
    el('subtitulo').textContent = `${professor.especialidade}. Aulas de ${formatarDataISO(de)} a ${formatarDataISO(ate)}.`;
    renderResumoProfessor(agendamentos);
    if (!agendamentos.length) {
      el('listaAgenda').innerHTML = '<div class="bg-superficie rounded-3xl p-8 text-center"><p class="text-[17px] font-semibold">Agenda livre</p><p class="text-grafite/65 text-[15px] mt-1">Nenhuma aula marcada nos próximos 14 dias.</p></div>';
      return;
    }
    const porDia = {};
    agendamentos.forEach((a) => (porDia[a.data] ||= []).push(a));
    // Um grupo por dia, como a lista de compromissos do Calendário do iPhone.
    el('listaAgenda').innerHTML = Object.entries(porDia).map(([data, aulas]) => `
      <section>
        <h2 class="text-[13px] font-semibold text-grafite/65 px-5 mb-2">${escapeHtml(tituloDoDia(data))}</h2>
        <div class="bg-superficie rounded-3xl overflow-hidden lista-ios">
          ${aulas.map((a) => `
            <div class="px-5 py-3.5 flex items-center justify-between gap-3">
              <div class="flex items-center gap-4 min-w-0">
                <span class="text-[17px] font-semibold tabular-nums w-14 shrink-0">${escapeHtml(a.hora)}</span>
                <span class="w-[3px] self-stretch rounded-full bg-petroleo/70"></span>
                <div class="min-w-0">
                  <p class="text-[17px] font-medium truncate">${escapeHtml(a.aluno_nome)}</p>
                  <p class="text-[14px] text-grafite/65">${escapeHtml(a.tipo_treino)}, ${escapeHtml(a.nivel.toLowerCase())}</p>
                </div>
              </div>
              <div class="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                <span class="px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${ESTILO_AULA[a.status] || ''}">${escapeHtml(a.status)}</span>
                ${data === HOJE ? `<button type="button" data-aula="${a.id}" data-status="${a.status === 'Confirmado' ? 'Em andamento' : 'Confirmado'}"
                  class="text-[13px] font-semibold ${a.status === 'Confirmado' ? 'text-petroleo' : 'text-grafite/65'} hover:underline">${a.status === 'Confirmado' ? 'Iniciar aula' : 'Desfazer'}</button>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </section>`).join('');
  } catch (erro) { tratarErro(erro); }
}

/** Três números rápidos no topo da agenda: hoje, próximos 7 dias e alunos diferentes. */
function renderResumoProfessor(agendamentos) {
  const fim7 = new Date(); fim7.setDate(fim7.getDate() + 7);
  const limite = `${fim7.getFullYear()}-${String(fim7.getMonth() + 1).padStart(2, '0')}-${String(fim7.getDate()).padStart(2, '0')}`;
  const hoje = agendamentos.filter((a) => a.data === HOJE).length;
  const semana = agendamentos.filter((a) => a.data <= limite).length;
  const alunos = new Set(agendamentos.map((a) => a.aluno_nome)).size;
  const caixa = (n, rotulo) => `<div class="bg-superficie rounded-3xl p-4 md:p-5"><p class="text-[13px] text-grafite/65 leading-tight">${rotulo}</p><p class="text-[30px] md:text-[36px] font-semibold tracking-tight leading-none mt-2 tabular-nums">${n}</p></div>`;
  el('resumoProfessor').innerHTML = caixa(hoje, 'Aulas hoje') + caixa(semana, 'Próximos 7 dias') + caixa(alunos, 'Alunos na agenda');
}

el('listaAgenda').addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-aula]');
  if (!botao) return;
  botao.disabled = true;
  try {
    await Api.profStatusAula(botao.dataset.aula, botao.dataset.status);
    showToast(botao.dataset.status === 'Em andamento' ? 'Aula iniciada. Bom treino!' : 'Aula voltou para confirmada.', 'success');
    carregarAgenda();
  } catch (erro) { tratarErro(erro); botao.disabled = false; }
});

/* ---------- Disponibilidade ---------- */

function desenharGrade() {
  const tabela = el('gradeHorarios');
  const cabecalho = DIAS.map((d, i) => `<th class="px-1 pb-2"><button type="button" data-coluna="${i}" class="w-12 py-1 rounded-lg text-[12px] font-semibold text-grafite/65 hover:bg-tinta/5">${d}</button></th>`).join('');
  const linhas = horasPossiveis.map((h) => `
    <tr>
      <td class="pr-3 text-[13px] font-medium text-grafite/65">${h}</td>
      ${DIAS.map((_, d) => {
        const on = selecionados.has(`${d}|${h}`);
        return `<td class="p-1"><button type="button" data-cel="${d}|${h}" aria-pressed="${on}" aria-label="${DIAS_LONGOS[d]} ${h}"
          class="w-12 h-9 rounded-lg transition ${on ? 'bg-petroleo' : 'bg-offwhite hover:bg-tinta/[0.08]'}"></button></td>`;
      }).join('')}
    </tr>`).join('');
  tabela.innerHTML = `<thead><tr><th></th>${cabecalho}</tr></thead><tbody>${linhas}</tbody>`;
}

el('gradeHorarios').addEventListener('click', (e) => {
  const cel = e.target.closest('[data-cel]');
  const col = e.target.closest('[data-coluna]');
  if (cel) {
    const chave = cel.dataset.cel;
    selecionados.has(chave) ? selecionados.delete(chave) : selecionados.add(chave);
  } else if (col) {
    const d = Number(col.dataset.coluna);
    const todos = horasPossiveis.every((h) => selecionados.has(`${d}|${h}`));
    horasPossiveis.forEach((h) => (todos ? selecionados.delete(`${d}|${h}`) : selecionados.add(`${d}|${h}`)));
  } else return;
  desenharGrade();
});

async function carregarDisponibilidade() {
  try {
    const { dias, horasPossiveis: horas } = await Api.profDisponibilidade();
    horasPossiveis = horas;
    selecionados = new Set(Object.entries(dias).flatMap(([d, hs]) => hs.map((h) => `${d}|${h}`)));
    desenharGrade();
  } catch (erro) { tratarErro(erro); }
}

el('btnSalvarDisp').addEventListener('click', async () => {
  const dias = {};
  for (let d = 0; d <= 6; d++) dias[d] = horasPossiveis.filter((h) => selecionados.has(`${d}|${h}`));
  const botao = el('btnSalvarDisp');
  botao.disabled = true;
  try {
    const { total } = await Api.profSalvarDisponibilidade(dias);
    showToast(`Horários salvos (${total} por semana).`, 'success');
  } catch (erro) {
    showToast(erro.message, 'error'); // inclui o aviso de conflito com aulas já marcadas
  } finally {
    botao.disabled = false;
  }
});

/* ---------- Inicialização ---------- */

// O botão Sair fica no menu da conta (avatar no topo), montado pelo ui.js.
const usuario = Auth.getUsuario();
if (usuario) el('saudacao').textContent = `Olá, ${String(usuario.nome).split(' ')[0]}!`;
const aba = location.hash.slice(1);
abrirAba(['agenda', 'disponibilidade'].includes(aba) ? aba : 'agenda');
