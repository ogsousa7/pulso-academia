/* =========================================================
   home.js — Partes da página inicial (index.html)
   1. Galeria em tela cheia, estilo stories
   2. Painéis das modalidades
   3. Grade de aulas em grupo (com filtro)
   4. Avisos da academia (API)
   Depende de: Api (api.js), escapeHtml/formatarDataHora (ui.js).
   ========================================================= */

const semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 1. Galeria: a barra de progresso da foto atual é o relógio ---------- */
(function iniciarGaleria() {
  const galeria = document.getElementById('galeria');
  if (!galeria) return;
  const slides = [...galeria.querySelectorAll('.galeria-slide')];
  const barras = galeria.querySelector('.galeria-barras');
  let atual = 0;
  // Quem pediu menos movimento no sistema troca as fotos só pelas setas.
  galeria.classList.toggle('pausada', semMovimento);

  barras.innerHTML = slides.map(() => '<span><i></i></span>').join('');
  document.getElementById('galeriaTotal').textContent = String(slides.length).padStart(2, '0');

  function mostrar(indice) {
    atual = (indice + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('ativo', i === atual));
    [...barras.children].forEach((b, i) => {
      b.classList.toggle('vista', i < atual);
      b.classList.remove('rodando');
    });
    void barras.offsetWidth; // reinicia a animação da barra atual
    barras.children[atual].classList.add('rodando');
    document.getElementById('galeriaAtual').textContent = String(atual + 1).padStart(2, '0');
  }

  // Quando a barra da foto atual termina de encher, passa para a próxima.
  barras.addEventListener('animationend', () => mostrar(atual + 1));

  document.getElementById('galeriaAnterior').addEventListener('click', () => mostrar(atual - 1));
  document.getElementById('galeriaProxima').addEventListener('click', () => mostrar(atual + 1));

  // Arrastar o dedo para o lado troca a foto.
  let inicioX = null;
  galeria.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') inicioX = e.clientX; });
  galeria.addEventListener('pointerup', (e) => {
    if (inicioX === null) return;
    const distancia = e.clientX - inicioX;
    if (Math.abs(distancia) > 50) mostrar(atual + (distancia < 0 ? 1 : -1));
    inicioX = null;
  });
  galeria.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') mostrar(atual + 1);
    if (e.key === 'ArrowLeft') mostrar(atual - 1);
  });

  // Fora da tela, a galeria espera (a barra não corre enquanto ninguém está vendo).
  new IntersectionObserver(([e]) => galeria.classList.toggle('fora-da-tela', !e.isIntersecting)).observe(galeria);

  mostrar(0);
})();

/* ---------- 2. Modalidades: o painel em foco (mouse ou teclado) se abre ---------- */
(function iniciarPaineis() {
  const paineis = [...document.querySelectorAll('.painel-modalidade')];
  const abrir = (painel) => paineis.forEach((p) => p.classList.toggle('aberto', p === painel));
  paineis.forEach((p) => {
    p.addEventListener('mouseenter', () => abrir(p));
    p.addEventListener('focus', () => abrir(p));
  });
})();

/* ---------- 3. Grade de aulas em grupo ---------- */
(function iniciarGrade() {
  const tabela = document.getElementById('gradeTabela');
  if (!tabela) return;
  const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const CORES = { Musculação: '#425B63', Funcional: '#A4532F', Cardio: '#5C6B3B', Alongamento: '#2A2A2D' };
  // [dias (1 = segunda), hora, modalidade, professor] — dentro dos horários de cada professor no sistema
  const AULAS = [
    [[1, 3, 5], '07:00', 'Funcional', 'Renata'],
    [[2, 4], '07:00', 'Cardio', 'Diego'],
    [[1, 3, 5], '09:00', 'Alongamento', 'Ana Paula'],
    [[2, 4], '09:00', 'Musculação', 'Marcos'],
    [[6], '09:00', 'Funcional', 'Renata'],
    [[6], '11:00', 'Musculação', 'Marcos'],
    [[1, 3, 5], '12:00', 'Musculação', 'Bruno'],
    [[2, 4], '15:00', 'Alongamento', 'Ana Paula'],
    [[1, 3], '18:00', 'Funcional', 'Renata'],
    [[2, 4, 5], '18:00', 'Cardio', 'Diego'],
    [[1, 3], '19:00', 'Cardio', 'Diego'],
    [[2, 4], '19:00', 'Musculação', 'Bruno'],
  ];
  const horas = [...new Set(AULAS.map((a) => a[1]))].sort();
  const hoje = new Date().getDay(); // 0 = domingo
  let filtro = 'Todas';

  function desenhar() {
    tabela.innerHTML = `
      <thead><tr><th scope="col"><span class="sr-only">Horário</span></th>${DIAS.map((d, i) => `<th scope="col" class="${i + 1 === hoje ? 'hoje' : ''}">${d}${i + 1 === hoje ? '<small>hoje</small>' : ''}</th>`).join('')}</tr></thead>
      <tbody>${horas.map((h) => `
        <tr><th scope="row">${h}</th>${DIAS.map((_, i) => {
          const aula = AULAS.find((a) => a[1] === h && a[0].includes(i + 1));
          if (!aula) return `<td class="${i + 1 === hoje ? 'hoje' : ''}"></td>`;
          const apagada = filtro !== 'Todas' && aula[2] !== filtro;
          return `<td class="${i + 1 === hoje ? 'hoje' : ''}"><span class="aula ${apagada ? 'apagada' : ''}" style="--cor:${CORES[aula[2]]}"><strong>${aula[2]}</strong>${aula[3]}</span></td>`;
        }).join('')}</tr>`).join('')}
      </tbody>`;
  }

  const filtros = document.getElementById('gradeFiltros');
  filtros.innerHTML = ['Todas', ...Object.keys(CORES)].map((m) =>
    `<button type="button" class="filtro-grade" data-filtro="${m}" aria-pressed="${m === filtro}">${m}</button>`).join('');
  filtros.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-filtro]');
    if (!botao) return;
    filtro = botao.dataset.filtro;
    filtros.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', b === botao));
    desenhar();
  });
  desenhar();
})();

/* ---------- 4. Avisos da academia ---------- */
(async function carregarAvisos() {
  const container = document.getElementById('listaAvisos');
  try {
    const { avisos } = await Api.listarAvisos();
    if (avisos.length === 0) {
      container.innerHTML = '<p class="text-grafite/65 text-sm">Nenhum aviso no momento.</p>';
      return;
    }
    container.innerHTML = avisos.map((a) => `
      <div class="aviso">
        <p class="text-[13px] font-bold uppercase tracking-[0.1em] text-terracota mb-2">${formatarDataHora(a.criado_em)}</p>
        <p class="text-[17px] leading-snug">${escapeHtml(a.texto)}</p>
      </div>`).join('');
  } catch (erro) {
    container.innerHTML = `<p class="text-terracota text-sm">Não foi possível carregar os avisos (${escapeHtml(erro.message)}).</p>`;
  }
})();
