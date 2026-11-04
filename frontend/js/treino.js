/* =========================================================
   treino.js — Montador de treinos (treino.html)
   Desenha as opções, envia as respostas para POST /api/treino e
   mostra o plano. Tudo que vem da API passa por escapeHtml.
   Depende de: Api (api.js), escapeHtml/showToast (ui.js).
   ========================================================= */

const form = document.getElementById('formTreino');
const carregando = document.getElementById('carregando');
const resultado = document.getElementById('resultado');
const botaoMontar = document.getElementById('btnMontar');

/* ---------- Opções em botões de escolha (rádios com aparência de etiqueta) ---------- */
document.querySelectorAll('.escolhas').forEach((grupo) => {
  const { campo, opcoes, marcado, sufixo = '' } = grupo.dataset;
  grupo.innerHTML = opcoes.split('|').map((valor) => `
    <label class="escolha">
      <input type="radio" name="${campo}" value="${escapeHtml(valor)}" class="sr-only" ${valor === marcado ? 'checked' : ''}>
      <span>${escapeHtml(valor)}${escapeHtml(sufixo)}</span>
    </label>`).join('');
});

function desenharPlano({ fonte, treino }) {
  const selo = fonte === 'ia'
    ? 'Montado por inteligência artificial (Gemini, do Google)'
    : 'Montado pelo nosso gerador automático';
  resultado.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5 nao-imprimir">
      <span class="px-3 py-1 rounded-full bg-oliva/10 text-oliva text-[13px] font-semibold">${selo}</span>
      <button type="button" id="btnImprimir" class="px-4 py-2 rounded-full bg-tinta/[0.06] text-[14px] font-semibold hover:bg-tinta/10 transition">Imprimir</button>
    </div>
    <h2 class="titulo-secao">${escapeHtml(treino.titulo)}</h2>
    <p class="mt-2 text-[17px] text-grafite/65 leading-snug">${escapeHtml(treino.resumo)}</p>

    <div class="mt-7 flex flex-col gap-4">
      ${treino.dias.map((dia, i) => `
        <article class="dia-treino bg-superficie rounded-3xl p-6 md:p-7" style="animation-delay:${i * 90}ms">
          <h3 class="text-[24px] font-black uppercase tracking-tight">${escapeHtml(dia.nome)}</h3>
          <p class="text-[15px] text-grafite/65">${escapeHtml(dia.foco)}</p>
          <ul class="lista-ios mt-3">
            ${dia.exercicios.map((e) => `
              <li class="py-3 flex items-start justify-between gap-4">
                <span>
                  <span class="block text-[16px] font-medium">${escapeHtml(e.nome)}</span>
                  ${e.dica ? `<span class="block text-[13px] text-grafite/65 mt-0.5">${escapeHtml(e.dica)}</span>` : ''}
                </span>
                <span class="text-right text-[14px] shrink-0">
                  <span class="block font-semibold">${e.series} × ${escapeHtml(e.repeticoes)}</span>
                  <span class="block text-grafite/65">descanso: ${escapeHtml(e.descanso)}</span>
                </span>
              </li>`).join('')}
          </ul>
        </article>`).join('')}
    </div>

    ${treino.dicas.length ? `
      <div class="mt-4 bg-superficie rounded-3xl p-6 md:p-7">
        <h3 class="text-[17px] font-semibold">Dicas</h3>
        <ul class="mt-2 list-disc pl-5 text-[15px] text-grafite/75 flex flex-col gap-1.5">
          ${treino.dicas.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}
        </ul>
      </div>` : ''}

    <p class="mt-5 text-[13px] text-grafite/65">Este plano é uma sugestão e não substitui a orientação de um profissional de educação física ou de um médico.</p>

    <div class="mt-6 flex flex-wrap gap-3 nao-imprimir">
      <a href="aluno.html" class="botao-destaque">Agendar aula com um professor</a>
      <button type="button" id="btnRefazer" class="px-6 py-3 rounded-full bg-tinta/[0.06] text-[15px] font-medium hover:bg-tinta/10 transition">Mudar as respostas</button>
    </div>`;

  document.getElementById('btnImprimir').addEventListener('click', () => window.print());
  document.getElementById('btnRefazer').addEventListener('click', () => {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(form));
  botaoMontar.disabled = true;
  resultado.classList.add('hidden');
  carregando.classList.remove('hidden');
  carregando.scrollIntoView({ behavior: 'smooth', block: 'center' });
  try {
    desenharPlano(await Api.montarTreino(dados));
    carregando.classList.add('hidden');
    resultado.classList.remove('hidden');
    resultado.focus({ preventScroll: true });
    resultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (erro) {
    carregando.classList.add('hidden');
    showToast(erro.message, 'error');
  } finally {
    botaoMontar.disabled = false;
  }
});
