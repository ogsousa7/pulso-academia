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

/* ---------- Planos (os mesmos da loja, montados por planos.js) ---------- */
(async function carregarPlanos() {
  const grid = document.getElementById('planosGrid');
  if (!grid || typeof Planos === 'undefined') return;
  try {
    const { planos } = await Api.listarPlanos();
    Planos.montar(grid, planos);
    Planos.ligar(grid, () => planos);
  } catch {
    grid.innerHTML = '<p class="text-grafite/65 text-sm col-span-3">Não foi possível carregar os planos agora. <a href="loja.html#planos" class="link-forte">Ver na loja</a></p>';
  }
})();

/* ---------- Aula experimental: valida no navegador (o servidor confere de novo) ---------- */
(function aulaExperimental() {
  const form = document.getElementById('formExperimental');
  if (!form) return;
  const status = document.getElementById('expStatus');
  const botao = document.getElementById('expEnviar');
  const ERROS = { nome: 'expNomeErro', whatsapp: 'expWhatsErro', modalidade: 'expModalidadeErro', horario: 'expHorarioErro' };

  // Máscara do WhatsApp: (11) 91234-5678
  form.whatsapp.addEventListener('input', () => {
    const d = form.whatsapp.value.replace(/\D/g, '').slice(0, 11);
    form.whatsapp.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  });

  function validar() {
    const erros = {};
    const nome = form.nome.value.trim().replace(/\s+/g, ' ');
    if (nome.length < 3 || !/^[\p{L}][\p{L}' .-]*$/u.test(nome)) erros.nome = 'Escreva seu nome (só letras, pelo menos 3).';
    if (!/^[1-9]{2}9?\d{8}$/.test(form.whatsapp.value.replace(/\D/g, ''))) erros.whatsapp = 'Informe o WhatsApp com DDD, ex.: (11) 91234-5678.';
    if (!form.modalidade.value) erros.modalidade = 'Escolha uma modalidade.';
    if (!form.horario.value) erros.horario = 'Escolha o melhor horário.';
    return erros;
  }

  function mostrarErros(erros) {
    Object.entries(ERROS).forEach(([campo, idErro]) => {
      const msg = erros[campo] || '';
      document.getElementById(idErro).textContent = msg;
      form[campo].setAttribute('aria-invalid', msg ? 'true' : 'false');
    });
  }

  // Ao corrigir um campo, a mensagem dele some.
  form.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true' && !validar()[e.target.name]) mostrarErros({ ...validar(), [e.target.name]: '' });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erros = validar();
    mostrarErros(erros);
    if (Object.keys(erros).length) {
      status.className = 'experimental-status erro';
      status.textContent = 'Confira os campos destacados.';
      form[Object.keys(erros)[0]].focus();
      return;
    }
    botao.disabled = true;
    botao.textContent = 'Enviando…';
    status.className = 'experimental-status';
    status.textContent = '';
    try {
      const { mensagem } = await Api.criarAulaExperimental({
        nome: form.nome.value, whatsapp: form.whatsapp.value, modalidade: form.modalidade.value, horario: form.horario.value,
      });
      const primeiroNome = escapeHtml(form.nome.value.trim().split(' ')[0]);
      form.innerHTML = `
        <div class="experimental-ok" role="status" tabindex="-1">
          <span class="experimental-ok-icone" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4L19 7"/></svg></span>
          <h3 class="text-[26px] font-black uppercase tracking-tight leading-none mt-4">Pronto, ${primeiroNome}!</h3>
          <p class="mt-3 text-[16px] text-grafite/75">${escapeHtml(mensagem)}</p>
        </div>`;
      form.querySelector('.experimental-ok').focus();
    } catch (erro) {
      if (erro.campos) mostrarErros(erro.campos);
      status.className = 'experimental-status erro';
      status.textContent = erro.status === 429 ? 'Muitos pedidos seguidos. Tente de novo daqui a pouco ou fale com a gente no WhatsApp.' : erro.message;
      botao.disabled = false;
      botao.textContent = 'Quero minha aula grátis';
    }
  });
})();

/* ---------- Dados estruturados (JSON-LD, tipo HealthClub) para o Google ----------
   Montados com os mesmos dados da academia e dos planos que o site mostra (API), para
   endereço, horários e preços nunca ficarem desatualizados quando a recepção editar. */
(async function dadosEstruturados() {
  try {
    const [{ academia }, { planos }] = await Promise.all([Api.obterAcademia(), Api.listarPlanos()]);
    const faixa = (texto) => { const m = /(\d{1,2})h\s*[–-]\s*(\d{1,2})h/.exec(texto || ''); return m ? [`${m[1].padStart(2, '0')}:00`, `${m[2].padStart(2, '0')}:00`] : null; };
    // "Rua das Palmeiras, 245 — Heliópolis, São Paulo/SP" -> rua, bairro, cidade e UF
    const [rua, resto = ''] = academia.endereco.split(/\s*[—–]\s*/);
    const [bairro = '', cidadeUf = ''] = resto.split(',').map((s) => s.trim());
    const [cidade, uf] = cidadeUf.split('/');
    const ruaEBairro = bairro ? `${rua}, ${bairro}` : rua;
    const porMes = planos.map((p) => p.preco / Planos.mesesDoPlano(p.periodo));
    const real = (v) => v.toFixed(2).replace('.', ',');
    const horarios = [];
    const semana = faixa(academia.horario_semana);
    const sabado = faixa(academia.horario_sabado);
    if (semana) horarios.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: semana[0], closes: semana[1] });
    if (sabado) horarios.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: sabado[0], closes: sabado[1] });
    const dados = {
      '@context': 'https://schema.org',
      '@type': 'HealthClub',
      name: 'Pulso Academia',
      description: academia.descricao,
      url: `${location.origin}/`,
      image: `${location.origin}/img/home/abertura-1280.webp`,
      logo: `${location.origin}/img/icons/icon-512.png`,
      telephone: academia.telefone,
      email: academia.email,
      address: { '@type': 'PostalAddress', streetAddress: ruaEBairro, addressLocality: (cidade || 'São Paulo').trim(), addressRegion: (uf || 'SP').trim(), addressCountry: 'BR' },
      openingHoursSpecification: horarios,
      priceRange: porMes.length ? `R$ ${real(Math.min(...porMes))} a R$ ${real(Math.max(...porMes))} por mês` : undefined,
      currenciesAccepted: 'BRL',
      paymentAccepted: 'Pix, cartão de crédito, boleto',
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(dados);
    document.head.appendChild(script);
  } catch { /* sem API: a página segue normal, só sem os dados estruturados */ }
})();

/* ---------- Grade da semana (usada pela tabela e pelos detalhes) ---------- */
// [dias (1 = segunda), hora, modalidade, professor] — dentro dos horários de cada professor no sistema
const GRADE_AULAS = [
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
const NOMES_DIAS = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* ---------- Detalhe da modalidade e do professor ---------- */
(function detalhes() {
  const dialogo = document.getElementById('dialogDetalhe');
  if (!dialogo) return;
  const MODALIDADES = {
    Musculação: { foto: 'img/modalidades/musculacao-800.webp', texto: 'Treino com pesos e máquinas para ganhar força, massa muscular e definição. O professor monta a sua ficha e corrige a execução de perto.', paraQuem: 'Quem quer força e definição, ou começar do zero com segurança', intensidade: 'Do leve ao intenso, no seu ritmo' },
    Funcional: { foto: 'img/modalidades/funcional-800.webp', texto: 'Circuitos com o peso do corpo, elásticos e kettlebells que trabalham o corpo todo. Aula em grupo, dinâmica e diferente a cada dia.', paraQuem: 'Quem gosta de movimento e de treinar em turma', intensidade: 'Moderada a alta' },
    Cardio: { foto: 'img/modalidades/cardio-800.webp', texto: 'Esteira, bike e treinos intervalados para ganhar fôlego, gastar energia e cuidar do coração.', paraQuem: 'Quem quer emagrecer, ter mais disposição ou voltar a se exercitar', intensidade: 'Você escolhe o ritmo' },
    Alongamento: { foto: 'img/modalidades/alongamento-800.webp', texto: 'Mobilidade, postura e respiração. Alivia a tensão do dia, melhora a flexibilidade e ajuda a prevenir dores.', paraQuem: 'Todas as idades, inclusive quem está começando', intensidade: 'Leve' },
  };
  const el = (id) => document.getElementById(id);

  function abrir({ modalidade, professor, foto, alt }) {
    const info = MODALIDADES[modalidade];
    const aulas = GRADE_AULAS.filter((a) => a[2] === modalidade && (!professor || a[3] === professor));
    el('detalheFoto').src = foto || info.foto;
    el('detalheFoto').alt = alt || '';
    el('detalheRotulo').textContent = professor ? `Professor${/a$/.test(professor.split(' ')[0]) ? 'a' : ''} de ${modalidade}` : 'Modalidade';
    el('detalheTitulo').textContent = professor || modalidade;
    el('detalheTexto').textContent = professor
      ? `${professor} dá aulas de ${modalidade.toLowerCase()} na Pulso. Monta o treino para o seu objetivo e acompanha a sua evolução de perto. ${info.texto}`
      : info.texto;
    el('detalheInfo').innerHTML = `<div><dt>Para quem é</dt><dd>${escapeHtml(info.paraQuem)}</dd></div><div><dt>Intensidade</dt><dd>${escapeHtml(info.intensidade)}</dd></div>`;
    el('detalheGrade').innerHTML = aulas.length
      ? aulas.map((a) => `<li><strong>${a[0].map((d) => NOMES_DIAS[d]).join(', ')}</strong><span>${a[1]}${professor ? '' : ` · com ${escapeHtml(a[3])}`}</span></li>`).join('')
      : '<li class="vazio">Sem aula em grupo na grade: o horário é combinado direto no agendamento.</li>';
    const params = new URLSearchParams({ tipo: modalidade });
    if (professor) params.set('professor', professor);
    el('detalheAgendar').href = `aluno.html?${params}#agendar`;
    el('detalheAgendar').textContent = professor ? `Agendar com ${professor.split(' ')[0]}` : 'Agendar aula';
    el('detalheGratis').dataset.modalidade = modalidade;
    dialogo.showModal();
  }

  document.addEventListener('click', (e) => {
    const cartao = e.target.closest('[data-modalidade]');
    if (!cartao || cartao.id === 'detalheGratis' || !MODALIDADES[cartao.dataset.modalidade]) return;
    e.preventDefault();
    const img = cartao.querySelector('img:not(.painel-marca)');
    abrir({ modalidade: cartao.dataset.modalidade, professor: cartao.dataset.professor, foto: cartao.dataset.professor && img ? img.getAttribute('src') : null, alt: cartao.dataset.professor && img ? img.alt : '' });
  });
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo || e.target.closest('[data-fechar-detalhe]')) dialogo.close();
    const gratis = e.target.closest('#detalheGratis');
    if (gratis) {
      // Já deixa a modalidade escolhida no formulário da aula grátis.
      const select = document.getElementById('expModalidade');
      if (select) select.value = gratis.dataset.modalidade || '';
      dialogo.close();
    }
  });
})();

/* ---------- 3. Grade de aulas em grupo ---------- */
(function iniciarGrade() {
  const tabela = document.getElementById('gradeTabela');
  if (!tabela) return;
  const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const CORES = { Musculação: '#425B63', Funcional: '#A4532F', Cardio: '#5C6B3B', Alongamento: '#2A2A2D' };
  const AULAS = GRADE_AULAS;
  const horas = [...new Set(AULAS.map((a) => a[1]))].sort();
  const hoje = new Date().getDay(); // 0 = domingo
  let filtro = 'Todas';

  // Celular: abas por dia e a lista das aulas daquele dia (domingo abre a segunda).
  let diaAberto = hoje >= 1 && hoje <= 6 ? hoje : 1;
  const abas = document.createElement('div');
  abas.className = 'grade-dias';
  abas.setAttribute('role', 'tablist');
  abas.setAttribute('aria-label', 'Dia da semana');
  const lista = document.createElement('ul');
  lista.className = 'grade-lista';
  tabela.closest('.grade-rolagem').after(abas, lista);
  abas.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-dia]');
    if (!botao) return;
    diaAberto = Number(botao.dataset.dia);
    desenhar();
  });

  function desenharLista() {
    abas.innerHTML = DIAS.map((d, i) => `<button type="button" role="tab" data-dia="${i + 1}" aria-selected="${i + 1 === diaAberto}">${d}${i + 1 === hoje ? '<small>hoje</small>' : ''}</button>`).join('');
    const doDia = AULAS.filter((a) => a[0].includes(diaAberto)).sort((a, b) => a[1].localeCompare(b[1]));
    lista.innerHTML = doDia.length
      ? doDia.map((a) => `<li class="${filtro !== 'Todas' && a[2] !== filtro ? 'apagada' : ''}" style="--cor:${CORES[a[2]]}"><time>${a[1]}</time><div><strong>${a[2]}</strong><span>com ${a[3]}</span></div></li>`).join('')
      : '<li class="vazio">Sem aulas em grupo nesse dia.</li>';
  }

  function desenhar() {
    desenharLista();
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
        <p class="aviso-data">${formatarDataHora(a.criado_em)}</p>
        <p class="text-[17px] leading-snug">${escapeHtml(a.texto)}</p>
      </div>`).join('');
  } catch (erro) {
    container.innerHTML = `<p class="text-terracota text-sm">Não foi possível carregar os avisos (${escapeHtml(erro.message)}).</p>`;
  }
})();
