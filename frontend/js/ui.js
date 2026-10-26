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

  const cores = { success: 'bg-oliva', error: 'bg-terracota', info: 'bg-grafite' };
  const toast = document.createElement('div');
  toast.className = `toast-enter ${cores[tipo] || cores.info} text-white text-sm font-medium px-5 py-3.5 rounded-xl shadow-xl max-w-xs`;
  toast.setAttribute('role', 'status');
  toast.textContent = mensagem;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/**
 * Ajusta o header conforme a sessão:
 *   visitante -> [Entrar]
 *   logado    -> [Painel | Minha agenda | Minha área]  [Sair]
 */
function atualizarBotaoEntrar() {
  const btn = document.getElementById('btnEntrar');
  if (!btn) return;

  // Remove o que uma chamada anterior inseriu (a função pode rodar mais de uma vez).
  document.querySelectorAll('[data-sessao]').forEach((el) => el.remove());
  btn.classList.remove('hidden');

  const usuario = Auth.estaLogado() ? Auth.getUsuario() : null;

  if (!usuario) {
    btn.textContent = 'Entrar';
    btn.onclick = () => (window.location.href = 'login.html');
    return;
  }

  // Cada perfil tem a sua página: Painel (recepção), Minha agenda (professor), Minha área (aluno).
  const rotulos = { ADMIN: 'Painel', PROFESSOR: 'Minha agenda', ALUNO: 'Minha área' };
  btn.textContent = rotulos[usuario.role] || 'Minha conta';
  btn.onclick = () => (window.location.href = Auth.paginaInicial(usuario));

  const sair = document.createElement('button');
  sair.dataset.sessao = 'sair';
  sair.type = 'button';
  sair.textContent = 'Sair';
  sair.className = 'px-4 py-2.5 rounded-full border border-grafite/20 text-sm font-semibold hover:bg-grafite/5 transition';
  sair.addEventListener('click', () => Auth.logout());
  btn.parentElement.insertBefore(sair, document.getElementById('mobileMenuBtn'));
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
