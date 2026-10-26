/**
 * src/controllers/authController.js
 * ---------------------------------------------------------------------
 * Login (e-mail/senha e Google), cadastro e dados do usuário logado.
 * Regra de negócio de autenticação fica TODA aqui — as rotas (routes/)
 * só direcionam a requisição para estas funções.
 * --------------------------------------------------------------------- */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { textoValido, EMAIL_REGEX } from '../utils.js';
import { googleClientId, googleConfigurado, verificarCredencialGoogle } from '../services/google.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function gerarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Remove campos sensíveis (hash da senha, id do Google) antes de devolver o usuário ao frontend. */
function paraPublico(usuario) {
  const { senha_hash, google_sub, ...resto } = usuario;
  return resto;
}

/** GET /api/auth/config — o frontend descobre se deve mostrar o botão do Google. */
export function config(req, res) {
  res.json({ googleClientId: googleClientId() });
}

/** POST /api/auth/login */
export function login(req, res) {
  const { email, senha } = req.body ?? {};

  if (typeof email !== 'string' || typeof senha !== 'string' || !email.trim() || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }

  const usuario = db
    .prepare('SELECT * FROM usuarios WHERE email = ?')
    .get(email.trim().toLowerCase());

  // Mensagem genérica de propósito: não revelamos se o problema foi o
  // e-mail ou a senha, para não ajudar tentativas de força bruta.
  if (!usuario) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }

  const senhaConfere = bcrypt.compareSync(senha, usuario.senha_hash);
  if (!senhaConfere) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }

  // Só depois de provar a senha dizemos que a conta está desativada.
  if (!usuario.ativo) {
    return res.status(403).json({ erro: 'Conta desativada. Procure a recepção da academia.' });
  }

  const token = gerarToken(usuario);
  res.json({ token, usuario: paraPublico(usuario) });
}

/** POST /api/auth/register — cadastro público, sempre como ALUNO. */
export function register(req, res) {
  const { nome, email, senha } = req.body ?? {};

  if (!textoValido(nome, 100) || !textoValido(email, 150) || typeof senha !== 'string') {
    return res.status(400).json({ erro: 'Informe nome, e-mail e senha.' });
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }
  // bcrypt só considera os primeiros 72 bytes da senha; limitar evita surpresas.
  if (senha.length < 6 || senha.length > 72) {
    return res.status(400).json({ erro: 'A senha precisa ter entre 6 e 72 caracteres.' });
  }

  const emailNormalizado = email.trim().toLowerCase();
  const jaExiste = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(emailNormalizado);
  if (jaExiste) {
    return res.status(409).json({ erro: 'Já existe uma conta com este e-mail.' });
  }

  const senhaHash = bcrypt.hashSync(senha, 10);

  // Cadastro público sempre cria ALUNO — virar ADMIN/PROFESSOR é ação da
  // recepção (painel administrativo), nunca um endpoint público.
  const resultado = db
    .prepare('INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (?, ?, ?, ?)')
    .run(nome.trim(), emailNormalizado, senhaHash, 'ALUNO');

  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(resultado.lastInsertRowid);
  const token = gerarToken(usuario);

  res.status(201).json({ token, usuario: paraPublico(usuario) });
}

/**
 * Decide quem é o usuário a partir de um perfil JÁ VERIFICADO pelo Google.
 * Separada do endpoint para poder ser testada sem falar com o Google.
 * Devolve { usuario } ou { erro, status }.
 */
export function resolverUsuarioGoogle(perfil) {
  if (!perfil.emailVerificado) {
    return { status: 403, erro: 'O e-mail da sua conta Google não está verificado.' };
  }

  const email = String(perfil.email).trim().toLowerCase();
  const porSub = db.prepare('SELECT * FROM usuarios WHERE google_sub = ?').get(perfil.sub);
  const porEmail = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);

  if (porSub && porEmail && porSub.id !== porEmail.id) {
    return { status: 409, erro: 'Esta conta Google já está ligada a outro cadastro.' };
  }

  const existente = porSub ?? porEmail;

  if (existente) {
    // Contas da equipe (recepção e professores) NUNCA entram por Google: o e-mail delas
    // poderia pertencer a outra pessoa num domínio Google Workspace (ex.: admin@pulso.com)
    // e isso daria acesso ao painel. Só contas de ALUNO usam o Google.
    if (existente.role !== 'ALUNO') {
      return { status: 403, erro: 'Contas da equipe (recepção e professores) entram com e-mail e senha.' };
    }
    if (!existente.ativo) {
      return { status: 403, erro: 'Conta desativada. Procure a recepção da academia.' };
    }
    if (existente.google_sub && existente.google_sub !== perfil.sub) {
      return { status: 409, erro: 'Este e-mail já está ligado a outra conta Google.' };
    }
    if (!existente.google_sub) {
      db.prepare('UPDATE usuarios SET google_sub = ? WHERE id = ?').run(perfil.sub, existente.id);
    }
    return { usuario: db.prepare('SELECT * FROM usuarios WHERE id = ?').get(existente.id) };
  }

  // Primeiro acesso: cria um ALUNO. A senha é aleatória e jamais divulgada, então
  // essa conta só entra pelo Google (ou depois de a recepção definir uma senha).
  const nome = String(perfil.nome || email).trim().slice(0, 100) || email;
  const senhaInutilizavel = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO usuarios (nome, email, senha_hash, role, google_sub) VALUES (?, ?, ?, 'ALUNO', ?)")
    .run(nome, email, senhaInutilizavel, perfil.sub);
  return { usuario: db.prepare('SELECT * FROM usuarios WHERE id = ?').get(lastInsertRowid) };
}

/** POST /api/auth/google — body: { credential } (o ID token entregue pelo botão do Google). */
export async function loginGoogle(req, res) {
  if (!googleConfigurado()) {
    return res.status(503).json({ erro: 'Login com Google não está configurado neste servidor.' });
  }

  const { credential } = req.body ?? {};
  if (typeof credential !== 'string' || !credential || credential.length > 4096) {
    return res.status(400).json({ erro: 'Credencial do Google ausente.' });
  }

  let perfil;
  try {
    perfil = await verificarCredencialGoogle(credential);
  } catch (erro) {
    console.warn('[google] credencial rejeitada:', erro.message);
    return res.status(401).json({ erro: 'Não foi possível validar sua conta Google. Tente novamente.' });
  }

  const resultado = resolverUsuarioGoogle(perfil);
  if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });

  res.json({ token: gerarToken(resultado.usuario), usuario: paraPublico(resultado.usuario) });
}

/** GET /api/auth/me — exige token; devolve os dados do usuário logado. */
export function me(req, res) {
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.sub);
  if (!usuario) {
    return res.status(404).json({ erro: 'Usuário não encontrado.' });
  }
  res.json({ usuario: paraPublico(usuario) });
}
