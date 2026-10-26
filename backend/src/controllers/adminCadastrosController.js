/**
 * src/controllers/adminCadastrosController.js
 * ---------------------------------------------------------------------
 * Cadastros da recepção (UC07): planos, alunos, professores, agendamentos
 * gerais e pedidos de cancelamento de plano. Todas as rotas daqui são
 * montadas atrás de authenticateToken + requireAdmin (admin.routes.js).
 * Nada é apagado de verdade: contas e planos são DESATIVADOS, para o
 * histórico (pedidos, aulas) continuar fazendo sentido.
 * --------------------------------------------------------------------- */

import bcrypt from 'bcryptjs';
import { db, transacao } from '../db/index.js';
import { STATUS_AGENDAMENTO, TIPOS_TREINO, NIVEIS } from '../constants.js';
import { EMAIL_REGEX, dataISOValida, hojeISO, idValido, textoValido } from '../utils.js';
import { cancelarAulasFuturasDoAluno } from '../services/agenda.js';

const PERIODOS = ['por mês', 'por trimestre', 'por ano'];
const MIN_SENHA = 6;

const erro = (res, status, mensagem) => res.status(status).json({ erro: mensagem });

/* ------------------------------- PLANOS ------------------------------- */

/** GET /api/admin/planos — todos, inclusive os desativados. */
export function listarPlanos(req, res) {
  const planos = db
    .prepare(
      `SELECT p.id, p.nome, p.preco, p.periodo, p.descricao, p.ativo,
              (SELECT COUNT(*) FROM matriculas m WHERE m.plano_id = p.id AND m.status = 'ATIVO' AND m.data_vencimento >= ?) AS alunos_ativos
       FROM planos p ORDER BY p.preco`
    )
    .all(hojeISO());
  res.json({ planos });
}

function lerPlano(body) {
  const { nome, preco, periodo, descricao = '' } = body ?? {};
  if (!textoValido(nome, 60)) return { erro: 'Informe o nome do plano.' };
  const valor = Number(preco);
  if (!Number.isFinite(valor) || valor <= 0 || valor > 100000) return { erro: 'Informe um preço válido (maior que zero).' };
  if (!PERIODOS.includes(periodo)) return { erro: `Período inválido. Use: ${PERIODOS.join(', ')}.` };
  if (typeof descricao !== 'string' || descricao.length > 300) return { erro: 'A descrição pode ter até 300 caracteres.' };
  return { dados: { nome: nome.trim(), preco: Math.round(valor * 100) / 100, periodo, descricao: descricao.trim() } };
}

/** POST /api/admin/planos */
export function criarPlano(req, res) {
  const { erro: msg, dados } = lerPlano(req.body);
  if (msg) return erro(res, 400, msg);
  const r = db
    .prepare('INSERT INTO planos (nome, preco, periodo, descricao, ativo) VALUES (?, ?, ?, ?, 1)')
    .run(dados.nome, dados.preco, dados.periodo, dados.descricao);
  res.status(201).json({ plano: db.prepare('SELECT * FROM planos WHERE id = ?').get(r.lastInsertRowid) });
}

/** PUT /api/admin/planos/:id — edita dados e/ou ativa/desativa (`ativo`). */
export function atualizarPlano(req, res) {
  const id = idValido(req.params.id);
  if (!id || !db.prepare('SELECT id FROM planos WHERE id = ?').get(id)) return erro(res, 404, 'Plano não encontrado.');
  const { erro: msg, dados } = lerPlano(req.body);
  if (msg) return erro(res, 400, msg);
  const ativo = req.body.ativo === false || req.body.ativo === 0 ? 0 : 1;
  db.prepare('UPDATE planos SET nome = ?, preco = ?, periodo = ?, descricao = ?, ativo = ? WHERE id = ?')
    .run(dados.nome, dados.preco, dados.periodo, dados.descricao, ativo, id);
  res.json({ plano: db.prepare('SELECT * FROM planos WHERE id = ?').get(id) });
}

/* ------------------------- ALUNOS / PROFESSORES ----------------------- */

/** Valida e-mail único. `ignorarId` permite manter o próprio e-mail na edição. */
function emailEmUso(email, ignorarId = 0) {
  return !!db.prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ?').get(email, ignorarId);
}

function lerPessoa(body, { senhaObrigatoria }) {
  const { nome, email, senha } = body ?? {};
  if (!textoValido(nome, 100)) return { erro: 'Informe o nome.' };
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_REGEX.test(mail) || mail.length > 150) return { erro: 'Informe um e-mail válido.' };
  if (senhaObrigatoria || (senha !== undefined && senha !== '')) {
    if (typeof senha !== 'string' || senha.length < MIN_SENHA) return { erro: `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.` };
  }
  return { dados: { nome: nome.trim(), email: mail, senha: senha || null } };
}

/** GET /api/admin/alunos?busca= */
export function listarAlunos(req, res) {
  const busca = `%${String(req.query.busca ?? '').trim()}%`;
  const alunos = db
    .prepare(
      `SELECT u.id, u.nome, u.email, u.ativo, u.criado_em,
              (SELECT p.nome FROM matriculas m JOIN planos p ON p.id = m.plano_id
                WHERE m.usuario_id = u.id AND m.status = 'ATIVO' AND m.data_vencimento >= ?
                ORDER BY m.data_vencimento DESC LIMIT 1) AS plano,
              (SELECT m.data_vencimento FROM matriculas m
                WHERE m.usuario_id = u.id AND m.status = 'ATIVO' AND m.data_vencimento >= ?
                ORDER BY m.data_vencimento DESC LIMIT 1) AS vencimento
       FROM usuarios u
       WHERE u.role = 'ALUNO' AND (u.nome LIKE ? OR u.email LIKE ?)
       ORDER BY u.nome LIMIT 200`
    )
    .all(hojeISO(), hojeISO(), busca, busca);
  res.json({ alunos });
}

/** POST /api/admin/alunos */
export function criarAluno(req, res) {
  const { erro: msg, dados } = lerPessoa(req.body, { senhaObrigatoria: true });
  if (msg) return erro(res, 400, msg);
  if (emailEmUso(dados.email)) return erro(res, 409, 'Já existe uma conta com esse e-mail.');
  const r = db
    .prepare("INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (?, ?, ?, 'ALUNO')")
    .run(dados.nome, dados.email, bcrypt.hashSync(dados.senha, 10));
  res.status(201).json({ aluno: { id: Number(r.lastInsertRowid), nome: dados.nome, email: dados.email, ativo: 1 } });
}

/** PUT /api/admin/alunos/:id — nome, e-mail, ativo e (opcional) nova senha. */
export function atualizarAluno(req, res) {
  const id = idValido(req.params.id);
  const atual = id && db.prepare("SELECT id FROM usuarios WHERE id = ? AND role = 'ALUNO'").get(id);
  if (!atual) return erro(res, 404, 'Aluno não encontrado.');
  const { erro: msg, dados } = lerPessoa(req.body, { senhaObrigatoria: false });
  if (msg) return erro(res, 400, msg);
  if (emailEmUso(dados.email, id)) return erro(res, 409, 'Já existe uma conta com esse e-mail.');
  const ativo = req.body.ativo === false || req.body.ativo === 0 ? 0 : 1;

  transacao(() => {
    db.prepare('UPDATE usuarios SET nome = ?, email = ?, ativo = ? WHERE id = ?').run(dados.nome, dados.email, ativo, id);
    if (dados.senha) db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(dados.senha, 10), id);
    if (!ativo) cancelarAulasFuturasDoAluno(id); // conta desativada libera os horários
  });
  res.json({ ok: true });
}

/** GET /api/admin/professores */
export function listarProfessores(req, res) {
  const professores = db
    .prepare(
      `SELECT p.id, u.nome, u.email, u.ativo, p.especialidade,
              (SELECT COUNT(*) FROM disponibilidades d WHERE d.professor_id = p.id) AS horarios_semana
       FROM professores p JOIN usuarios u ON u.id = p.usuario_id ORDER BY u.nome`
    )
    .all();
  res.json({ professores, tiposTreino: TIPOS_TREINO });
}

/** POST /api/admin/professores — cria o usuário (role PROFESSOR) e o cadastro, com agenda padrão seg–sex. */
export function criarProfessor(req, res) {
  const { erro: msg, dados } = lerPessoa(req.body, { senhaObrigatoria: true });
  if (msg) return erro(res, 400, msg);
  const especialidade = req.body.especialidade;
  if (!TIPOS_TREINO.includes(especialidade)) return erro(res, 400, 'Escolha uma especialidade válida.');
  if (emailEmUso(dados.email)) return erro(res, 409, 'Já existe uma conta com esse e-mail.');

  const id = transacao(() => {
    const u = db
      .prepare("INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (?, ?, ?, 'PROFESSOR')")
      .run(dados.nome, dados.email, bcrypt.hashSync(dados.senha, 10));
    const p = db.prepare('INSERT INTO professores (usuario_id, especialidade) VALUES (?, ?)').run(u.lastInsertRowid, especialidade);
    const inserir = db.prepare('INSERT INTO disponibilidades (professor_id, dia_semana, hora) VALUES (?, ?, ?)');
    for (let dia = 1; dia <= 5; dia++) {
      for (const h of ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']) inserir.run(p.lastInsertRowid, dia, h);
    }
    return Number(p.lastInsertRowid);
  });
  res.status(201).json({ professor: { id, nome: dados.nome, email: dados.email, especialidade } });
}

/** PUT /api/admin/professores/:id */
export function atualizarProfessor(req, res) {
  const id = idValido(req.params.id);
  const atual = id && db.prepare('SELECT id, usuario_id FROM professores WHERE id = ?').get(id);
  if (!atual) return erro(res, 404, 'Professor não encontrado.');
  const { erro: msg, dados } = lerPessoa(req.body, { senhaObrigatoria: false });
  if (msg) return erro(res, 400, msg);
  if (!TIPOS_TREINO.includes(req.body.especialidade)) return erro(res, 400, 'Escolha uma especialidade válida.');
  if (emailEmUso(dados.email, atual.usuario_id)) return erro(res, 409, 'Já existe uma conta com esse e-mail.');
  const ativo = req.body.ativo === false || req.body.ativo === 0 ? 0 : 1;

  transacao(() => {
    db.prepare('UPDATE usuarios SET nome = ?, email = ?, ativo = ? WHERE id = ?').run(dados.nome, dados.email, ativo, atual.usuario_id);
    if (dados.senha) db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(dados.senha, 10), atual.usuario_id);
    db.prepare('UPDATE professores SET especialidade = ? WHERE id = ?').run(req.body.especialidade, id);
    // O nome do professor também fica gravado nas aulas (histórico): mantém em dia.
    db.prepare('UPDATE agendamentos SET professor = ? WHERE professor_id = ?').run(dados.nome, id);
  });
  res.json({ ok: true });
}

/* ---------------------------- AGENDAMENTOS ---------------------------- */

/**
 * GET /api/admin/agendamentos
 * Sem filtros: aulas de HOJE. Filtros: ?data=YYYY-MM-DD | ?todas=1 (de hoje em diante e passadas),
 * &status=Confirmado|... &professorId=N
 */
export function listarAgendamentos(req, res) {
  const filtros = [];
  const params = [];
  if (req.query.todas !== '1') {
    const data = dataISOValida(req.query.data) ? req.query.data : hojeISO();
    filtros.push('a.data = ?');
    params.push(data);
  }
  if (STATUS_AGENDAMENTO.includes(req.query.status)) {
    filtros.push('a.status = ?');
    params.push(req.query.status);
  }
  const profId = idValido(req.query.professorId);
  if (profId) {
    filtros.push('a.professor_id = ?');
    params.push(profId);
  }
  const agendamentos = db
    .prepare(
      `SELECT a.id, a.aluno_nome, a.professor, a.tipo_treino, a.nivel, a.data, a.hora, a.status
       FROM agendamentos a
       ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
       ORDER BY a.data DESC, a.hora ASC, a.id ASC LIMIT 300`
    )
    .all(...params);
  res.json({ agendamentos });
}

/** POST /api/admin/agendamentos — recepção marca uma aula de HOJE (balcão). */
export function criarAgendamento(req, res) {
  const { alunoNome, professor, hora } = req.body ?? {};
  if (!textoValido(alunoNome, 100)) return erro(res, 400, 'Informe o nome do aluno.');
  const prof = db
    .prepare('SELECT p.id, p.especialidade, u.nome FROM professores p JOIN usuarios u ON u.id = p.usuario_id WHERE u.nome = ? AND u.ativo = 1')
    .get(professor ?? '');
  if (!prof) return erro(res, 400, 'Professor inválido.');
  if (typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return erro(res, 400, 'Informe um horário válido (HH:MM).');

  const hoje = hojeISO();
  const ocupado = db
    .prepare("SELECT id FROM agendamentos WHERE professor_id = ? AND data = ? AND hora = ? AND status <> 'Cancelado'")
    .get(prof.id, hoje, hora);
  if (ocupado) return erro(res, 409, `${prof.nome} já tem uma aula às ${hora}.`);

  const aluno = db.prepare("SELECT id FROM usuarios WHERE role = 'ALUNO' AND nome = ?").get(alunoNome.trim());
  const r = db
    .prepare(
      `INSERT INTO agendamentos (aluno_id, professor_id, aluno_nome, professor, tipo_treino, nivel, data, hora, status)
       VALUES (?, ?, ?, ?, ?, 'Iniciante', ?, ?, 'Confirmado')`
    )
    .run(aluno?.id ?? null, prof.id, alunoNome.trim(), prof.nome, prof.especialidade, hoje, hora);
  res.status(201).json({ agendamento: db.prepare('SELECT id, aluno_nome, professor, hora, status FROM agendamentos WHERE id = ?').get(r.lastInsertRowid) });
}

/** PATCH /api/admin/agendamentos/:id  body: { status } */
export function mudarStatusAgendamento(req, res) {
  const id = idValido(req.params.id);
  const { status } = req.body ?? {};
  if (!STATUS_AGENDAMENTO.includes(status)) return erro(res, 400, `Status inválido. Use: ${STATUS_AGENDAMENTO.join(', ')}.`);
  const r = id ? db.prepare('UPDATE agendamentos SET status = ? WHERE id = ?').run(status, id) : { changes: 0 };
  if (!r.changes) return erro(res, 404, 'Agendamento não encontrado.');
  res.json({ ok: true });
}

/* ------------------- SOLICITAÇÕES DE CANCELAMENTO --------------------- */

/** GET /api/admin/solicitacoes?status=PENDENTE */
export function listarSolicitacoes(req, res) {
  const filtro = ['PENDENTE', 'APROVADA', 'RECUSADA'].includes(req.query.status) ? req.query.status : null;
  const solicitacoes = db
    .prepare(
      `SELECT s.id, s.motivo, s.status, s.resposta, s.criado_em, s.resolvido_em, u.nome AS aluno_nome, p.nome AS plano_nome
       FROM solicitacoes_cancelamento s
       JOIN usuarios u ON u.id = s.usuario_id
       JOIN matriculas m ON m.id = s.matricula_id
       JOIN planos p ON p.id = m.plano_id
       ${filtro ? 'WHERE s.status = ?' : ''}
       ORDER BY (s.status = 'PENDENTE') DESC, s.id DESC LIMIT 100`
    )
    .all(...(filtro ? [filtro] : []));
  res.json({ solicitacoes });
}

/** POST /api/admin/solicitacoes/:id/resolver  body: { decisao: 'APROVADA'|'RECUSADA', resposta? } */
export function resolverSolicitacao(req, res) {
  const id = idValido(req.params.id);
  const { decisao, resposta = '' } = req.body ?? {};
  if (!['APROVADA', 'RECUSADA'].includes(decisao)) return erro(res, 400, 'Decisão inválida.');
  if (typeof resposta !== 'string' || resposta.length > 300) return erro(res, 400, 'A resposta pode ter até 300 caracteres.');
  const s = id && db.prepare('SELECT * FROM solicitacoes_cancelamento WHERE id = ?').get(id);
  if (!s) return erro(res, 404, 'Solicitação não encontrada.');
  if (s.status !== 'PENDENTE') return erro(res, 409, 'Esta solicitação já foi respondida.');

  transacao(() => {
    db.prepare("UPDATE solicitacoes_cancelamento SET status = ?, resposta = ?, resolvido_em = datetime('now') WHERE id = ?")
      .run(decisao, resposta.trim() || null, id);
    if (decisao === 'APROVADA') {
      db.prepare("UPDATE matriculas SET status = 'CANCELADO' WHERE id = ?").run(s.matricula_id);
      cancelarAulasFuturasDoAluno(s.usuario_id);
    }
  });
  res.json({ ok: true });
}

/** Listas fixas para os formulários da recepção. */
export function opcoesAdmin(req, res) {
  res.json({ periodos: PERIODOS, tiposTreino: TIPOS_TREINO, niveis: NIVEIS, statusAgendamento: STATUS_AGENDAMENTO });
}
