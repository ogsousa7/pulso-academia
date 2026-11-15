/* =========================================================
   login.js — Tela de autenticação (login.html)
   Fluxo: envia credenciais para POST /api/auth/login, guarda o JWT
   no localStorage (via Auth.salvarSessao) e redireciona conforme a role.
   Depende de: Auth, Api (api.js) e showToast (ui.js).
   ========================================================= */

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// "?next=checkout.html" devolve o usuário à página de onde ele veio. Só aceitamos
// páginas desta lista: aceitar qualquer valor seria um "open redirect" (alguém
// poderia montar um link de login que, depois de entrar, manda a vítima a outro site).
const PAGINAS_DE_RETORNO = ['checkout.html', 'loja.html', 'index.html', 'aluno.html'];

/** "aluno.html?tipo=Cardio#agendar" -> o mesmo endereço, se for uma página desta lista e do próprio site; senão null. */
function destinoSeguro(next) {
  if (!next) return null;
  try {
    const url = new URL(next, window.location.origin);
    const pagina = url.pathname.split('/').pop();
    if (url.origin !== window.location.origin || !PAGINAS_DE_RETORNO.includes(pagina)) return null;
    return pagina + url.search + url.hash;
  } catch { return null; }
}
const DESTINO = destinoSeguro(new URLSearchParams(window.location.search).get('next'));

/** Destino depois do login: página de retorno (se houver), senão painel/recepção ou site. */
function redirecionarPorRole(usuario) {
  // O agendamento é do aluno: outros perfis vão para a própria área.
  if (DESTINO && !(DESTINO.startsWith('aluno.html') && usuario.role !== 'ALUNO')) {
    window.location.href = DESTINO;
    return;
  }
  window.location.href = Auth.paginaInicial(usuario);
}

// Veio de "Agendar": explica por que precisa entrar.
if (DESTINO && DESTINO.startsWith('aluno.html')) {
  const aviso = document.getElementById('avisoLogin');
  if (aviso) {
    const tipo = new URL(DESTINO, window.location.origin).searchParams.get('tipo');
    aviso.querySelector('[data-aviso-texto]').textContent = tipo
      ? `Entre para agendar sua aula de ${tipo.toLowerCase()}. Depois do login você volta direto para o agendamento.`
      : 'Entre para agendar sua aula. Depois do login você volta direto para o agendamento.';
    aviso.hidden = false;
  }
}

/* ---------------------------- Login com Google ---------------------------- */

/** Carrega um <script> externo; resolve true/false (nunca rejeita: sem internet o botão só não aparece). */
function carregarScript(src) {
  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.onload = () => resolve(true);
    tag.onerror = () => resolve(false);
    document.head.appendChild(tag);
  });
}

/** Chamado pelo Google com a "credential" (um JWT assinado por ele). O servidor é quem valida. */
async function aoReceberCredencialGoogle({ credential }) {
  try {
    const { token, usuario } = await Api.loginGoogle(credential);
    Auth.salvarSessao(token, usuario);
    showToast(`Bem-vindo(a), ${usuario.nome}!`, 'success');
    setTimeout(() => redirecionarPorRole(usuario), 600);
  } catch (erro) {
    showToast(erro.message, 'error');
  }
}

async function iniciarLoginGoogle() {
  let configuracao;
  try {
    configuracao = await Api.configAuth();
  } catch {
    return; // API fora do ar: o resto da tela já mostra o erro quando necessário
  }
  if (!configuracao.googleClientId) return; // recurso desligado no servidor

  const carregou = await carregarScript('https://accounts.google.com/gsi/client');
  if (!carregou || !window.google?.accounts?.id) return;

  google.accounts.id.initialize({
    client_id: configuracao.googleClientId,
    callback: aoReceberCredencialGoogle,
  });

  const area = document.getElementById('googleArea');
  const botao = document.getElementById('googleBtn');
  area.classList.remove('hidden');
  google.accounts.id.renderButton(botao, {
    type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'pt-BR',
    width: Math.min(320, Math.floor(area.clientWidth) || 320), // o Google exige largura em pixels
  });
}

/** Alterna entre as abas "Entrar" e "Criar conta". */
function mostrarAba(aba) {
  const login = aba === 'login';
  loginForm.classList.toggle('hidden', !login);
  registerForm.classList.toggle('hidden', login);
  registerForm.classList.toggle('flex', !login);
  // O visual da aba ativa vem do CSS (.segmentado .aba[aria-selected=true]).
  tabLogin.setAttribute('aria-selected', login);
  tabRegister.setAttribute('aria-selected', !login);
}

/** Desabilita o botão enquanto a requisição roda (evita duplo envio). */
async function comBotaoOcupado(botao, textoOcupado, acao) {
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.classList.add('opacity-60', 'cursor-not-allowed');
  botao.textContent = textoOcupado;
  try {
    await acao();
  } finally {
    botao.disabled = false;
    botao.classList.remove('opacity-60', 'cursor-not-allowed');
    botao.textContent = textoOriginal;
  }
}

tabLogin.addEventListener('click', () => mostrarAba('login'));

// Contas de demonstração: um toque preenche e-mail e senha (cada perfil abre a sua área).
document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
  const [email, senha] = b.dataset.demo.split('|');
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginSenha').value = senha;
  document.getElementById('loginSubmitBtn').focus();
}));
tabRegister.addEventListener('click', () => mostrarAba('register'));

loginForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;

  await comBotaoOcupado(document.getElementById('loginSubmitBtn'), 'Entrando...', async () => {
    try {
      const { token, usuario } = await Api.login(email, senha);
      Auth.salvarSessao(token, usuario);
      showToast(`Bem-vindo(a), ${usuario.nome}!`, 'success');
      setTimeout(() => redirecionarPorRole(usuario), 600);
    } catch (erro) {
      showToast(erro.message, 'error');
    }
  });
});

registerForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const nome = document.getElementById('regNome').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const senha = document.getElementById('regSenha').value;

  await comBotaoOcupado(document.getElementById('registerSubmitBtn'), 'Criando conta...', async () => {
    try {
      const { token, usuario } = await Api.register(nome, email, senha);
      Auth.salvarSessao(token, usuario);
      showToast('Conta criada com sucesso!', 'success');
      setTimeout(() => redirecionarPorRole(usuario), 600);
    } catch (erro) {
      showToast(erro.message, 'error');
    }
  });
});

// Quem já está logado não precisa ver a tela de login de novo.
if (Auth.estaLogado()) {
  const usuario = Auth.getUsuario();
  if (usuario) redirecionarPorRole(usuario);
}

iniciarLoginGoogle();

// "Esqueci minha senha": sem e-mail automático no projeto, a recepção redefine a senha.
document.getElementById('btnEsqueci')?.addEventListener('click', (e) => {
  const ajuda = document.getElementById('ajudaSenha');
  const abrir = ajuda.classList.contains('hidden');
  ajuda.classList.toggle('hidden', !abrir);
  e.currentTarget.setAttribute('aria-expanded', abrir);
});
