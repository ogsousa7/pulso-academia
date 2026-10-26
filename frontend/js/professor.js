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
    b.className = `aba px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${
      ativa ? 'bg-grafite text-white' : 'bg-white border border-grafite/15 text-grafite/70 hover:bg-grafite/5'}`;
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
    el('subtitulo').textContent = `${professor.especialidade} · próximas aulas (${formatarDataISO(de)} a ${formatarDataISO(ate)})`;
    if (!agendamentos.length) {
      el('listaAgenda').innerHTML = '<div class="bg-white border border-grafite/10 rounded-2xl p-6 text-grafite/50 text-sm">Nenhuma aula marcada nos próximos 14 dias.</div>';
      return;
    }
    const porDia = {};
    agendamentos.forEach((a) => (porDia[a.data] ||= []).push(a));
    el('listaAgenda').innerHTML = Object.entries(porDia).map(([data, aulas]) => `
      <div>
        <h2 class="font-bold mb-2">${escapeHtml(tituloDoDia(data))}</h2>
        <div class="flex flex-col gap-2">
          ${aulas.map((a) => `
            <div class="bg-white border border-grafite/10 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-4">
                <span class="font-extrabold text-lg w-14">${escapeHtml(a.hora)}</span>
                <div>
                  <p class="font-semibold">${escapeHtml(a.aluno_nome)}</p>
                  <p class="text-xs text-grafite/50">${escapeHtml(a.tipo_treino)} · ${escapeHtml(a.nivel)}</p>
                </div>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-semibold ${ESTILO_AULA[a.status] || ''}">${escapeHtml(a.status)}</span>
            </div>`).join('')}
        </div>
      </div>`).join('');
  } catch (erro) { tratarErro(erro); }
}

/* ---------- Disponibilidade ---------- */

function desenharGrade() {
  const tabela = el('gradeHorarios');
  const cabecalho = DIAS.map((d, i) => `<th class="px-1 pb-2"><button type="button" data-coluna="${i}" class="w-12 py-1 rounded-lg text-xs font-bold hover:bg-grafite/5">${d}</button></th>`).join('');
  const linhas = horasPossiveis.map((h) => `
    <tr>
      <td class="pr-3 text-xs font-semibold text-grafite/60">${h}</td>
      ${DIAS.map((_, d) => {
        const on = selecionados.has(`${d}|${h}`);
        return `<td class="p-1"><button type="button" data-cel="${d}|${h}" aria-pressed="${on}" aria-label="${DIAS_LONGOS[d]} ${h}"
          class="w-12 h-9 rounded-lg border transition ${on ? 'bg-petroleo border-petroleo' : 'bg-white border-grafite/15 hover:border-petroleo'}"></button></td>`;
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

el('btnSair').addEventListener('click', () => Auth.logout());
const usuario = Auth.getUsuario();
if (usuario) el('saudacao').textContent = `Olá, ${String(usuario.nome).split(' ')[0]}!`;
const aba = location.hash.slice(1);
abrirAba(['agenda', 'disponibilidade'].includes(aba) ? aba : 'agenda');
