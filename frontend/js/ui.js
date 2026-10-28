/* =========================================================
   ui.js — Componentes de UI compartilhados entre páginas
   Toasts, formatação, estado do header (Entrar / Painel / Sair) e menu mobile.
   Depende de: Auth (api.js), que deve ser carregado antes.
   ========================================================= */

/**
 * Escapa texto antes de inseri-lo via innerHTML. Evita XSS: sem isso, um aviso
 * como "<img src=x onerror=...>" executaria código no navegador dos alunos.
 */
function escapeHtml(valor) {
  return String(valor).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** O SQLite devolve "YYYY-MM-DD HH:MM:SS" em UTC; vira data/hora local legível. */
function formatarDataHora(sqliteDatetime) {
  const d = new Date(sqliteDatetime.replace(' ', 'T') + 'Z');
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** "2026-11-15" -> "15/11/2026" (sem passar por Date, para não deslocar o fuso). */
function formatarDataISO(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarPreco(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showToast(mensagem, tipo = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return; // página sem container de toast — falha silenciosa

  const cores = { success: 'bg-oliva text-white', error: 'bg-terracota text-white', info: 'bg-grafite text-superficie' };
  const toast = document.createElement('div');
  toast.className = `toast-enter ${cores[tipo] || cores.info} text-[15px] font-medium px-5 py-3.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.18)] max-w-xs`;
  toast.setAttribute('role', 'status');
  toast.textContent = mensagem;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/** Foto de produto que não carregou: usa a ilustração .svg de reserva (mesmo nome de arquivo). */
function fotoReserva(img) {
  img.onerror = null;
  const svg = img.src.replace('/fotos/', '/').replace(/\.(jpg|webp|png)(\?.*)?$/, '.svg');
  if (svg !== img.src) img.src = svg;
}

const ROTULO_AREA = { ADMIN: 'Painel da recepção', PROFESSOR: 'Minha agenda', ALUNO: 'Minha área' };

/** Iniciais para o avatar: "Camila Souza" -> "CS". */
function iniciais(nome) {
  const partes = String(nome || '?').trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

/**
 * Header conforme a sessão (todas as páginas que têm #btnEntrar):
 *   visitante -> botão [Entrar]
 *   logado    -> avatar com as iniciais; ao tocar, abre o menu da conta:
 *                nome/e-mail · Minha área (ou Painel/Agenda) · Início · Loja · Sair
 */
function atualizarBotaoEntrar() {
  const btn = document.getElementById('btnEntrar');
  if (!btn) return;

  document.querySelectorAll('[data-sessao]').forEach((el) => el.remove());
  const usuario = Auth.estaLogado() ? Auth.getUsuario() : null;

  if (!usuario) {
    btn.classList.remove('hidden');
    btn.textContent = 'Entrar';
    btn.onclick = () => (window.location.href = 'login.html');
    return;
  }

  btn.classList.add('hidden');
  const pagina = window.location.pathname.split('/').pop() || 'index.html';
  const area = Auth.paginaInicial(usuario);
  const item = (href, texto, atual) =>
    `<a href="${href}" role="menuitem" class="flex items-center justify-between px-4 py-2.5 text-[15px] hover:bg-tinta/[0.04] ${atual ? 'font-semibold' : ''}">${texto}${atual ? '<span class="w-1.5 h-1.5 rounded-full bg-petroleo"></span>' : ''}</a>`;

  const wrap = document.createElement('div');
  wrap.dataset.sessao = 'conta';
  wrap.className = 'relative';
  wrap.innerHTML = `
    <button type="button" data-conta-botao aria-haspopup="menu" aria-expanded="false" aria-label="Sua conta: ${escapeHtml(usuario.nome)}"
      class="w-9 h-9 rounded-full bg-petroleo text-white text-[13px] font-semibold flex items-center justify-center hover:brightness-110 transition">${escapeHtml(iniciais(usuario.nome))}</button>
    <div data-conta-menu role="menu" class="hidden absolute right-0 top-[calc(100%+10px)] w-64 bg-superficie rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.16)] ring-1 ring-tinta/5 overflow-hidden z-50">
      <div class="px-4 pt-4 pb-3 border-b border-tinta/[0.06]">
        <p class="text-[15px] font-semibold truncate">${escapeHtml(usuario.nome)}</p>
        <p class="text-[13px] text-grafite/65 truncate">${escapeHtml(usuario.email || '')}</p>
      </div>
      <div class="py-1.5">
        ${item(area, ROTULO_AREA[usuario.role] || 'Minha conta', pagina === area)}
        ${item('index.html', 'Início do site', pagina === 'index.html')}
        ${item('loja.html', 'Planos e loja', pagina === 'loja.html')}
      </div>
      <button type="button" data-conta-sair role="menuitem" class="w-full text-left px-4 py-3 text-[15px] text-terracota border-t border-tinta/[0.06] hover:bg-tinta/[0.04]">Sair da conta</button>
    </div>`;
  btn.parentElement.insertBefore(wrap, document.getElementById('mobileMenuBtn'));

  const botao = wrap.querySelector('[data-conta-botao]');
  const menu = wrap.querySelector('[data-conta-menu]');
  const abrir = (sim) => { menu.classList.toggle('hidden', !sim); botao.setAttribute('aria-expanded', sim); };
  botao.addEventListener('click', (e) => { e.stopPropagation(); abrir(menu.classList.contains('hidden')); });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) abrir(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrir(false); });
  wrap.querySelector('[data-conta-sair]').addEventListener('click', () => Auth.logout());
}

function initMenuMobile() {
  const btn = document.getElementById('mobileMenuBtn');
  const menu = document.getElementById('mobileMenu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    menu.classList.toggle('hidden');
    menu.classList.toggle('flex');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  atualizarBotaoEntrar();
  initMenuMobile();
});

/* =========================================================
   ACESSIBILIDADE
   • "Pular para o conteúdo" (primeira coisa que o Tab alcança)
   • Painel: tema Automático/Claro/Escuro, contraste reforçado e
     "Ouvir esta página" (leitura em voz alta, em português)
   • VLibras: tradução para Libras do Governo Federal (gratuito)
   Leitores de tela (VoiceOver, TalkBack, NVDA) já funcionam no site
   todo: o HTML usa rótulos, títulos e regiões (header, main, nav).
   ========================================================= */

const A11Y_ICONE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="7.3" r="1.3" fill="currentColor" stroke="none"/><path d="M7.5 10.2c3 .8 6 .8 9 0M12 10.8v3.4M12 14.2l-2.2 4M12 14.2l2.2 4"/></svg>';

function lerPreferencia(chave) { try { return localStorage.getItem(chave); } catch { return null; } }
function salvarPreferencia(chave, valor) { try { valor ? localStorage.setItem(chave, valor) : localStorage.removeItem(chave); } catch { /* sem armazenamento */ } }

/** tema: 'auto' | 'claro' | 'escuro' */
function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro' || tema === 'escuro') raiz.dataset.tema = tema;
  else delete raiz.dataset.tema;
  salvarPreferencia('pulso_tema', tema === 'auto' ? null : tema);
  const escuro = raiz.dataset.tema === 'escuro' || (!raiz.dataset.tema && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', escuro ? '#000000' : getComputedStyle(document.body).backgroundColor));
}

function aplicarContraste(alto) {
  if (alto) document.documentElement.dataset.contraste = 'alto';
  else delete document.documentElement.dataset.contraste;
  salvarPreferencia('pulso_contraste', alto ? 'alto' : null);
}

/* ---------- Ouvir esta página (Web Speech API, já vem no navegador) ---------- */
const Leitura = {
  ativa: false,
  suportada: () => 'speechSynthesis' in window,
  textos() {
    const area = document.getElementById('conteudo') || document.querySelector('main') || document.body;
    // innerText ignora o que está escondido; dividimos em frases curtas (o Chrome corta falas longas).
    return area.innerText.split(/\n+/).map((t) => t.trim()).filter((t) => t.length > 1)
      .flatMap((t) => t.match(/[^.!?]+[.!?]*/g) || [t]).map((t) => t.trim()).filter(Boolean);
  },
  iniciar(aoTerminar) {
    if (!Leitura.suportada()) return;
    speechSynthesis.cancel();
    const voz = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt-br'))
      || speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
    const frases = Leitura.textos();
    frases.forEach((frase, i) => {
      const fala = new SpeechSynthesisUtterance(frase);
      fala.lang = 'pt-BR';
      if (voz) fala.voice = voz;
      fala.rate = 1;
      if (i === frases.length - 1) fala.onend = () => { Leitura.ativa = false; aoTerminar?.(); };
      speechSynthesis.speak(fala);
    });
    Leitura.ativa = true;
  },
  parar() { if (Leitura.suportada()) speechSynthesis.cancel(); Leitura.ativa = false; },
};

function montarAcessibilidade() {
  // 1) Pular para o conteúdo
  const principal = document.querySelector('main');
  if (principal && !principal.id) principal.id = 'conteudo';
  if (principal && !document.querySelector('.pular-conteudo')) {
    principal.setAttribute('tabindex', '-1');
    document.body.insertAdjacentHTML('afterbegin',
      '<a href="#conteudo" class="pular-conteudo">Pular para o conteúdo</a>');
  }

  // 2) Botão do painel (no topo, ao lado do "Entrar"; ou num espaço marcado com data-a11y-slot)
  const slot = document.querySelector('[data-a11y-slot]');
  const ancora = document.getElementById('btnCarrinho') || document.getElementById('btnEntrar');
  if (!slot && !ancora) return;
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.id = 'btnAcessibilidade';
  botao.setAttribute('aria-label', 'Acessibilidade: tema, contraste e leitura em voz alta');
  botao.setAttribute('aria-haspopup', 'dialog');
  botao.className = 'w-9 h-9 rounded-full flex items-center justify-center text-grafite hover:bg-tinta/5 transition';
  botao.innerHTML = A11Y_ICONE;
  if (slot) slot.appendChild(botao);
  else ancora.parentElement.insertBefore(botao, ancora);

  const tema = lerPreferencia('pulso_tema') || 'auto';
  const opcaoTema = (valor, rotulo) => `
    <label class="flex-1">
      <input type="radio" name="a11yTema" value="${valor}" class="peer sr-only" ${tema === valor ? 'checked' : ''}>
      <span class="block text-center py-2 rounded-[9px] text-[14px] font-semibold cursor-pointer peer-checked:bg-superficie peer-checked:shadow peer-focus-visible:ring-2 peer-focus-visible:ring-petroleo">${rotulo}</span>
    </label>`;
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="painelA11y" class="folha folha-pequena p-0" aria-labelledby="a11yTitulo">
      <div class="p-6">
        <div class="flex items-center justify-between gap-4">
          <h2 id="a11yTitulo" class="text-[24px] font-bold tracking-tight">Acessibilidade</h2>
          <button type="button" data-fechar-a11y aria-label="Fechar" class="w-8 h-8 rounded-full bg-tinta/[0.06] text-grafite/65 hover:bg-tinta/10 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
          </button>
        </div>

        <fieldset class="mt-5">
          <legend class="text-[15px] font-semibold mb-2">Aparência</legend>
          <div class="seg-a11y flex gap-0.5 p-[3px] rounded-xl bg-tinta/[0.08]" role="radiogroup" aria-label="Aparência">
            ${opcaoTema('auto', 'Automático')}${opcaoTema('claro', 'Claro')}${opcaoTema('escuro', 'Escuro')}
          </div>
          <p class="text-[13px] text-grafite/65 mt-2">Automático segue o modo claro ou escuro do seu aparelho.</p>
        </fieldset>

        <div class="mt-5 flex items-center justify-between gap-4">
          <div>
            <p id="a11yContrasteRotulo" class="text-[15px] font-semibold">Contraste reforçado</p>
            <p class="text-[13px] text-grafite/65">Textos mais escuros, bordas visíveis e links sublinhados.</p>
          </div>
          <button type="button" id="a11yContraste" role="switch" aria-labelledby="a11yContrasteRotulo"
            aria-checked="${document.documentElement.dataset.contraste === 'alto'}" class="interruptor shrink-0"><span></span></button>
        </div>

        <div id="a11yLeituraBloco" class="mt-5 flex items-center justify-between gap-4">
          <div>
            <p class="text-[15px] font-semibold">Ouvir esta página</p>
            <p class="text-[13px] text-grafite/65">O navegador lê o conteúdo em voz alta.</p>
          </div>
          <button type="button" id="a11yOuvir" class="shrink-0 px-4 py-2 rounded-full bg-petroleo text-white text-[14px] font-semibold hover:brightness-110">Ouvir</button>
        </div>

        <ul class="mt-6 pt-5 border-t border-tinta/[0.08] flex flex-col gap-2.5 text-[13px] text-grafite/65">
          <li><strong class="text-grafite font-semibold">Libras:</strong> toque no botão azul do VLibras, na lateral da tela.</li>
          <li><strong class="text-grafite font-semibold">Leitor de tela:</strong> o site funciona com VoiceOver (iPhone), TalkBack (Android) e NVDA (computador).</li>
          <li><strong class="text-grafite font-semibold">Texto maior:</strong> use o zoom do navegador (Ctrl e +) ou do celular. O layout se adapta.</li>
          <li><strong class="text-grafite font-semibold">Teclado:</strong> navegue com Tab; Esc fecha janelas.</li>
        </ul>
      </div>
    </dialog>`);

  const painel = document.getElementById('painelA11y');
  const btnOuvir = document.getElementById('a11yOuvir');
  if (!Leitura.suportada()) document.getElementById('a11yLeituraBloco').remove();
  const atualizarOuvir = () => { if (btnOuvir) btnOuvir.textContent = Leitura.ativa ? 'Parar' : 'Ouvir'; };

  botao.addEventListener('click', () => painel.showModal());
  painel.addEventListener('click', (e) => { if (e.target === painel || e.target.closest('[data-fechar-a11y]')) painel.close(); });
  painel.addEventListener('change', (e) => { if (e.target.name === 'a11yTema') aplicarTema(e.target.value); });
  document.getElementById('a11yContraste').addEventListener('click', (e) => {
    const ligado = e.currentTarget.getAttribute('aria-checked') !== 'true';
    e.currentTarget.setAttribute('aria-checked', ligado);
    aplicarContraste(ligado);
  });
  btnOuvir?.addEventListener('click', () => {
    if (Leitura.ativa) Leitura.parar();
    else { painel.close(); Leitura.iniciar(atualizarOuvir); }
    atualizarOuvir();
  });

  // Se o sistema trocar de claro para escuro e o tema estiver em "Automático", acompanha.
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (!document.documentElement.dataset.tema) aplicarTema('auto');
  });
  aplicarTema(tema);
}

/* ---------- VLibras (tradutor de Libras do Governo Federal) ---------- */
function carregarVLibras() {
  if (window.__vlibras || /^(localhost|127\.)/.test(location.hostname) && navigator.webdriver) return; // não carrega em testes automatizados
  window.__vlibras = true;
  const s = document.createElement('script');
  s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
  s.async = true;
  s.onload = () => { try { new window.VLibras.Widget('https://vlibras.gov.br/app'); } catch { /* sem internet: segue sem Libras */ } };
  document.body.appendChild(s);
}

document.addEventListener('DOMContentLoaded', () => {
  montarAcessibilidade();
  carregarVLibras();
});
