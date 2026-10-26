/**
 * src/middleware/auth.js
 * ---------------------------------------------------------------------
 * Middlewares de segurança usados nas rotas protegidas.
 *
 *  - authenticateToken: exige um JWT válido no header Authorization e
 *    anexa os dados do usuário em "req.user".
 *  - requireRole(...roles): deve vir DEPOIS de authenticateToken; bloqueia
 *    quem não tiver uma das roles informadas. requireAdmin = requireRole('ADMIN').
 *
 * O token só prova QUEM é o usuário. A role e o status (ativo/desativado) são
 * relidos do banco a cada requisição: se a recepção desativar uma conta ou
 * mudar um perfil, o efeito é imediato — não fica valendo até o token vencer.
 * --------------------------------------------------------------------- */

import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.startsWith('troque-este-valor')) {
  // Falha cedo e de forma clara: sem segredo (ou com o valor de exemplo, que é
  // público) qualquer pessoa conseguiria forjar um token de ADMIN.
  throw new Error(
    'JWT_SECRET ausente ou ainda com o valor de exemplo. Copie backend/.env.example para ' +
    'backend/.env e gere um segredo: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization; // esperado: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ erro: 'Token não informado. Faça login novamente.' });
  }

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) {
      const mensagem =
        err.name === 'TokenExpiredError'
          ? 'Sessão expirada. Faça login novamente.'
          : 'Token inválido.';
      // 401 (não autenticado) e não 403: o cliente deve refazer o login.
      return res.status(401).json({ erro: mensagem });
    }

    const usuario = db
      .prepare('SELECT id, nome, email, role, ativo FROM usuarios WHERE id = ?')
      .get(payload.sub);

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ erro: 'Conta desativada ou inexistente. Procure a recepção.' });
    }

    // Dados do BANCO (não do token): role atualizada e nome correto.
    req.user = { sub: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role };
    next();
  });
}

export function requireRole(...roles) {
  return function verificarRole(req, res, next) {
    if (!req.user) {
      // Só acontece se usado sem authenticateToken antes — erro de programação.
      return res.status(500).json({ erro: 'requireRole usado sem authenticateToken.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ erro: 'Você não tem permissão para acessar este recurso.' });
    }
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
