/**
 * src/controllers/professorController.js
 * ---------------------------------------------------------------------
 * Área do professor (role PROFESSOR) — UC08. O professor é identificado
 * pelo token e só enxerga/altera a PRÓPRIA agenda.
 * --------------------------------------------------------------------- */

import { db, transacao } from '../db/index.js';
import { HORAS_AULA } from '../constants.js';
import { dataISOValida, diaDaSemana, hojeISO, minutosAte, somarDias } from '../utils.js';
import { professorDoUsuario } from '../services/agenda.js';

/** Middleware: garante que o usuário PROFESSOR tem cadastro em "professores". */
export function carregarProfessor(req, res, next) {
  const professor = professorDoUsuario(req.user.sub);
  if (!professor) return res.status(403).json({ erro: 'Seu usuário não está cadastrado como professor.' });
  req.professor = professor;
  next();
}

/** GET /api/professor/agenda?de=YYYY-MM-DD&ate=YYYY-MM-DD (padrão: hoje + 14 dias). */
export function agenda(req, res) {
  const hoje = hojeISO();
  const de = dataISOValida(req.query.de) ? req.query.de : hoje;
  const ate = dataISOValida(req.query.ate) ? req.query.ate : somarDias(de, 14);
  const agendamentos = db
    .prepare(
      `SELECT id, aluno_nome, tipo_treino, nivel, data, hora, status
       FROM agendamentos
       WHERE professor_id = ? AND data BETWEEN ? AND ? AND status <> 'Cancelado'
       ORDER BY data, hora`
    )
    .all(req.professor.id, de, ate);
  res.json({ professor: { nome: req.professor.nome, especialidade: req.professor.especialidade }, de, ate, agendamentos });
}

/** GET /api/professor/disponibilidade — { "1": ["06:00", ...], ... } por dia da semana. */
export function obterDisponibilidade(req, res) {
  const linhas = db
    .prepare('SELECT dia_semana, hora FROM disponibilidades WHERE professor_id = ? ORDER BY dia_semana, hora')
    .all(req.professor.id);
  const dias = {};
  for (let d = 0; d <= 6; d++) dias[d] = [];
  linhas.forEach((l) => dias[l.dia_semana].push(l.hora));
  res.json({ dias, horasPossiveis: HORAS_AULA });
}

/**
 * PUT /api/professor/disponibilidade  body: { dias: { "0": [...], ..., "6": [...] } }
 * Substitui toda a disponibilidade. Se algum horário REMOVIDO tem aula marcada no
 * futuro, a operação é recusada (409) e nada muda — o professor precisa falar com a recepção.
 */
export function salvarDisponibilidade(req, res) {
  const { dias } = req.body ?? {};
  if (!dias || typeof dias !== 'object') return res.status(400).json({ erro: 'Envie os horários por dia da semana.' });

  const novos = new Set();
  for (let d = 0; d <= 6; d++) {
    const horas = dias[d] ?? dias[String(d)] ?? [];
    if (!Array.isArray(horas)) return res.status(400).json({ erro: 'Formato de horários inválido.' });
    for (const h of horas) {
      if (!HORAS_AULA.includes(h)) return res.status(400).json({ erro: `Horário inválido: ${h}.` });
      novos.add(`${d}|${h}`);
    }
  }

  const atuais = db.prepare('SELECT dia_semana, hora FROM disponibilidades WHERE professor_id = ?').all(req.professor.id);
  const removidos = atuais.filter((a) => !novos.has(`${a.dia_semana}|${a.hora}`));

  // Conflito: aula futura marcada num horário que o professor quer remover.
  const futuras = db
    .prepare("SELECT data, hora FROM agendamentos WHERE professor_id = ? AND status <> 'Cancelado' AND data >= ?")
    .all(req.professor.id, hojeISO())
    .filter((a) => minutosAte(a.data, a.hora) > 0);
  const conflitos = futuras.filter((a) => removidos.some((r) => r.dia_semana === diaDaSemana(a.data) && r.hora === a.hora));
  if (conflitos.length) {
    const lista = conflitos.slice(0, 3).map((c) => `${c.data.split('-').reverse().join('/')} ${c.hora}`).join(', ');
    return res.status(409).json({
      erro: `Há aulas marcadas em horários que você removeu (${lista}${conflitos.length > 3 ? '…' : ''}). Peça à recepção para remanejar antes.`,
    });
  }

  transacao(() => {
    db.prepare('DELETE FROM disponibilidades WHERE professor_id = ?').run(req.professor.id);
    const inserir = db.prepare('INSERT INTO disponibilidades (professor_id, dia_semana, hora) VALUES (?, ?, ?)');
    for (const chave of novos) {
      const [d, h] = chave.split('|');
      inserir.run(req.professor.id, Number(d), h);
    }
  });
  res.json({ ok: true, total: novos.size });
}

/**
 * PATCH /api/professor/agendamentos/:id  body: { status: 'Em andamento' | 'Confirmado' }
 * O professor marca o início da aula (ou desfaz). Só aulas DELE e só no dia da aula.
 * Cancelar continua sendo com o aluno ou com a recepção.
 */
export function mudarStatusAula(req, res) {
  const id = Number(req.params.id);
  const { status } = req.body ?? {};
  if (!['Em andamento', 'Confirmado'].includes(status)) {
    return res.status(400).json({ erro: 'Status inválido. Use "Em andamento" ou "Confirmado".' });
  }
  const aula = Number.isInteger(id) && id > 0
    ? db.prepare('SELECT id, data, status FROM agendamentos WHERE id = ? AND professor_id = ?').get(id, req.professor.id)
    : null;
  if (!aula) return res.status(404).json({ erro: 'Aula não encontrada na sua agenda.' });
  if (aula.status === 'Cancelado') return res.status(409).json({ erro: 'Esta aula foi cancelada.' });
  if (aula.data !== hojeISO()) return res.status(409).json({ erro: 'Só dá para iniciar aulas de hoje.' });
  db.prepare('UPDATE agendamentos SET status = ? WHERE id = ?').run(status, id);
  res.json({ ok: true, status });
}
