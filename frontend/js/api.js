/* =========================================================
   api.js — Cliente HTTP da Pulso Academia
   Centraliza toda comunicação com o backend (Fetch API),
   o armazenamento do JWT e os helpers de sessão.
   Carregado em TODAS as páginas, antes dos scripts específicos.
   ========================================================= */

// Quando o site é aberto pelo próprio servidor (http://localhost:3333) a API está
// na mesma origem: usamos caminho relativo ("/api") e não há CORS. Se o HTML for
// aberto direto do disco (file://) ou por Live Server (porta 5500), apontamos
// para o backend na porta 3333 — ajuste aqui se mudar PORT no .env.
const ABERTO_FORA_DO_SERVIDOR =
  window.location.protocol === 'file:' || window.location.port === '5500';
const API_BASE_URL = ABERTO_FORA_DO_SERVIDOR ? 'http://localhost:3333/api' : '/api';

const TOKEN_STORAGE_KEY = 'pulso_token';
const USUARIO_STORAGE_KEY = 'pulso_usuario';

/* ---------- Sessão (token + usuário) ---------- */

const Auth = {
  salvarSessao(token, usuario) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USUARIO_STORAGE_KEY, JSON.stringify(usuario));
  },

  limparSessao() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USUARIO_STORAGE_KEY);
  },

  getToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  },

  getUsuario() {
    const bruto = localStorage.getItem(USUARIO_STORAGE_KEY);
    if (!bruto) return null;
    try {
      return JSON.parse(bruto);
    } catch {
      return null;
    }
  },

  estaLogado() {
    return !!Auth.getToken();
  },

  isAdmin() {
    const usuario = Auth.getUsuario();
    return !!usuario && usuario.role === 'ADMIN';
  },

  /** Página "de casa" de cada perfil (usada no login e no botão do header). */
  paginaInicial(usuario) {
    const paginas = { ADMIN: 'admin.html', PROFESSOR: 'professor.html', ALUNO: 'aluno.html' };
    return (usuario && paginas[usuario.role]) || 'index.html';
  },

  logout() {
    Auth.limparSessao();
    window.location.href = 'index.html';
  },

  /**
   * Protege uma página: se não houver sessão (ou, quando exigirAdmin=true,
   * se o usuário logado não for ADMIN), redireciona para login.html.
   * Chame no topo de admin.html.
   */
  exigirLogin({ exigirAdmin = false, role = null } = {}) {
    if (!Auth.estaLogado()) {
      // "next" faz o login devolver o usuário para esta página (ex.: checkout).
      const atual = window.location.pathname.split('/').pop() || 'index.html';
      window.location.href = `login.html?next=${encodeURIComponent(atual)}`;
      return false;
    }
    const exigida = role || (exigirAdmin ? 'ADMIN' : null);
    if (exigida && (Auth.getUsuario() || {}).role !== exigida) {
      // Perfil errado: manda para a página do próprio perfil (ou o site).
      window.location.href = Auth.paginaInicial(Auth.getUsuario());
      return false;
    }
    return true;
  },
};

/* ---------- Cliente HTTP ---------- */

/**
 * Faz uma requisição à API, já tratando JSON, token e erros no formato
 * { erro: "mensagem" } que o backend sempre devolve.
 * @param {string} caminho - ex: "/planos" ou "/agendamentos"
 * @param {object} opcoes - mesmas opções do fetch (method, body, ...)
 */
async function apiFetch(caminho, opcoes = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opcoes.headers || {}) };

  const token = Auth.getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let resposta;
  try {
    resposta = await fetch(`${API_BASE_URL}${caminho}`, { ...opcoes, headers });
  } catch (erroDeRede) {
    // Backend fora do ar, CORS bloqueado, sem internet, etc.
    throw new Error('Não foi possível conectar à API. O servidor backend está rodando?');
  }

  // Sessão expirada/token inválido em qualquer rota protegida: desloga.
  if (resposta.status === 401 && token) {
    Auth.limparSessao();
  }

  let corpo = null;
  const temCorpo = resposta.status !== 204;
  if (temCorpo) {
    try {
      corpo = await resposta.json();
    } catch {
      corpo = null;
    }
  }

  if (!resposta.ok) {
    const mensagem = (corpo && corpo.erro) || `Erro ${resposta.status} ao acessar a API.`;
    throw new Error(mensagem);
  }

  return corpo;
}

const Api = {
  // Auth
  login: (email, senha) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) }),
  register: (nome, email, senha) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ nome, email, senha }) }),
  me: () => apiFetch('/auth/me'),
  configAuth: () => apiFetch('/auth/config'),
  loginGoogle: (credential) => apiFetch('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),

  // Loja (pública)
  listarPlanos: () => apiFetch('/planos'),
  listarProdutos: () => apiFetch('/produtos'),
  listarAvisos: () => apiFetch('/avisos'),
  obterAcademia: () => apiFetch('/academia'),

  // Pedidos (logado). O servidor recalcula preços: enviamos só tipo, id e quantidade.
  // `pagamento` = { metodo: 'PIX'|'CARTAO'|'BOLETO', parcelas?, bandeira?, cartaoFinal? }.
  // O número completo e o CVV do cartão NUNCA saem do navegador.
  criarPedido: (itens, pagamento) =>
    apiFetch('/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        itens: itens.map(({ tipo, id, quantidade }) => ({ tipo, id, quantidade })),
        ...pagamento,
      }),
    }),
  obterPedido: (id) => apiFetch(`/pedidos/${id}`),
  pagarPedido: (id) => apiFetch(`/pedidos/${id}/pagar`, { method: 'POST' }), // só no modo demonstração
  meusPedidos: () => apiFetch('/pedidos/meus'),

  // Aluno (role ALUNO)
  alunoOpcoes: () => apiFetch('/aluno/opcoes'),
  alunoHorarios: (professorId, data) => apiFetch(`/aluno/horarios?professorId=${professorId}&data=${data}`),
  alunoAgendar: (dados) => apiFetch('/aluno/agendamentos', { method: 'POST', body: JSON.stringify(dados) }),
  alunoAgendamentos: () => apiFetch('/aluno/agendamentos'),
  alunoCancelarAula: (id) => apiFetch(`/aluno/agendamentos/${id}`, { method: 'DELETE' }),
  alunoPlano: () => apiFetch('/aluno/plano'),
  alunoCancelarPlano: (motivo) => apiFetch('/aluno/plano/cancelamento', { method: 'POST', body: JSON.stringify({ motivo }) }),

  // Professor (role PROFESSOR)
  profAgenda: (de, ate) => apiFetch(`/professor/agenda${de ? `?de=${de}&ate=${ate}` : ''}`),
  profDisponibilidade: () => apiFetch('/professor/disponibilidade'),
  profSalvarDisponibilidade: (dias) => apiFetch('/professor/disponibilidade', { method: 'PUT', body: JSON.stringify({ dias }) }),

  // Admin (protegidas) — cadastros genéricos: recurso = planos | alunos | professores
  admOpcoes: () => apiFetch('/admin/opcoes'),
  admListar: (recurso, query = '') => apiFetch(`/admin/${recurso}${query}`),
  admCriar: (recurso, dados) => apiFetch(`/admin/${recurso}`, { method: 'POST', body: JSON.stringify(dados) }),
  admAtualizar: (recurso, id, dados) => apiFetch(`/admin/${recurso}/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
  admStatusAula: (id, status) => apiFetch(`/admin/agendamentos/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  admResolverSolicitacao: (id, decisao, resposta) =>
    apiFetch(`/admin/solicitacoes/${id}/resolver`, { method: 'POST', body: JSON.stringify({ decisao, resposta }) }),
  listarPedidos: (query = '') => apiFetch(`/admin/pedidos${query}`),
  atualizarAcademia: (dados) => apiFetch('/admin/academia', { method: 'PUT', body: JSON.stringify(dados) }),
  kpis: () => apiFetch('/admin/dashboard/kpis'),
  listarAgendamentosDeHoje: () => apiFetch('/admin/agendamentos'),
  criarAgendamento: (alunoNome, professor, hora) =>
    apiFetch('/admin/agendamentos', { method: 'POST', body: JSON.stringify({ alunoNome, professor, hora }) }),
  publicarAviso: (texto) => apiFetch('/admin/avisos', { method: 'POST', body: JSON.stringify({ texto }) }),
};
