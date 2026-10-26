/**
 * src/controllers/alunoController.js
 * ---------------------------------------------------------------------
 * Área do aluno (role ALUNO):
 *   UC05 Agendar / Consultar / Cancelar aula
 *   UC06 Consultar plano e solicitar cancelamento do plano
 * Todas as rotas usam SEMPRE o id do token (req.user.sub): o aluno nunca
 * enxerga nem altera dados de outro aluno.
 * --------------------------------------------------------------------- */

import { db } from '../db/index.js';
import {
  TIPOS_TREINO, NIVEIS, ANTECEDENCIA_CANCELAMENTO_HORAS, MAX_DIAS_AGENDAMENTO,
} from '../constants.js';
import { dataISOValida, hojeISO, idValido, minutosAte, somarDias, textoValido } from '../utils.js';
import { planoAtivoDoAluno } from '../services/matriculas.js';
import { horariosLivres, obterProfessor } from '../services/agenda.js';

/** GET /api/aluno/opcoes — listas para montar o formulário de agendamento. */
export function opcoes(req, res) {
  const professores = db
    .prepare(
      `SELECT p.id, u.nome, p.especialidade
       FROM professores p JOIN usuarios u ON u.id = p.usuario_id
       WHERE u.ativo = 1 ORDER BY u.nome`
    )
    .all();
  const hoje = hojeISO();
  res.json({
    tiposTreino: TIPOS_TREINO,
    niveis: NIVEIS,
    professores,
    dataMinima: hoje,
    dataMaxima: somarDias(hoje, MAX_DIAS_AGENDAMENTO),
    antecedenciaCancelamentoHoras: ANTECEDENCIA_CANCELAMENTO_HORAS,
  });
}

/** Valida data (real, entre hoje e hoje+30). Devolve mensagem de erro ou null. */
function erroDeData(data) {
  if (!dataISOValida(data)) return 'Informe uma data válida.';
  const hoje = hojeISO();
  if (data < hoje) return 'Não é possível agendar em uma data que já passou.';
  if (data > somarDias(hoje, MAX_DIAS_AGENDAMENTO)) {
    return `Só é possível agendar até ${MAX_DIAS_AGENDAMENTO} dias à frente.`;
  }
  return null;
}

/** GET /api/aluno/horarios?professorId=1&data=2026-10-26 — horários livres (UC "Verificar Disponibilidade"). */
export function horarios(req, res) {
  const professorId = idValido(req.query.professorId);
  const { data } = req.query;
  if (!professorId || !obterProfessor(professorId)) {
    return res.status(400).json({ erro: 'Escolha um professor válido.' });
  }
  const erro = erroDeData(data);
  if (erro) return res.status(400).json({ erro });
  res.json({ horarios: horariosLivres(professorId, data) });
}

/** POST /api/aluno/agendamentos — agenda uma aula. */
export function agendar(req, res) {
  const { professorId, tipoTreino, nivel, data, hora } = req.body ?? {};
  const profId = idValido(professorId);

  const professor = profId ? obterProfessor(profId) : null;
  if (!professor || !professor.ativo) return res.status(400).json({ erro: 'Escolha um professor válido.' });
  if (!TIPOS_TREINO.includes(tipoTreino)) return res.status(400).json({ erro: 'Escolha um tipo de treino válido.' });
  if (!NIVEIS.includes(nivel)) return res.status(400).json({ erro: 'Escolha um nível válido.' });
  const erroData = erroDeData(data);
  if (erroData) return res.status(400).json({ erro: erroData });
  if (typeof hora !== 'string') return res.status(400).json({ erro: 'Escolha um horário.' });

  // Regra de negócio: precisa de plano ativo NA DATA da aula.
  if (!planoAtivoDoAluno(req.user.sub, data)) {
    return res.status(403).json({
      erro: 'Você precisa de um plano ativo na data da aula para agendar. Veja os planos na loja.',
    });
  }

  if (!horariosLivres(professor.id, data).includes(hora)) {
    return res.status(409).json({ erro: 'Esse horário não está mais disponível. Escolha outro.' });
  }

  const conflitoAluno = db
    .prepare("SELECT id FROM agendamentos WHERE aluno_id = ? AND data = ? AND hora = ? AND status <> 'Cancelado'")
    .get(req.user.sub, data, hora);
  if (conflitoAluno) return res.status(409).json({ erro: 'Você já tem uma aula nesse horário.' });

  try {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO agendamentos (aluno_id, professor_id, aluno_nome, professor, tipo_treino, nivel, data, hora, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Confirmado')`
      )
      .run(req.user.sub, professor.id, req.user.nome, professor.nome, tipoTreino, nivel, data, hora);
    const agendamento = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(lastInsertRowid);
    res.status(201).json({ agendamento });
  } catch (erro) {
    // Índice único do banco: duas pessoas pegaram o mesmo horário ao mesmo tempo.
    if (String(erro.message).includes('UNIQUE')) {
      return res.status(409).json({ erro: 'Esse horário acabou de ser ocupado. Escolha outro.' });
    }
    throw erro;
  }
}

/** GET /api/aluno/agendamentos — só as aulas do próprio aluno. */
export function meusAgendamentos(req, res) {
  const agendamentos = db
    .prepare(
      `SELECT id, professor, tipo_treino, nivel, data, hora, status
       FROM agendamentos WHERE aluno_id = ?
       ORDER BY data DESC, hora DESC LIMIT 100`
    )
    .all(req.user.sub)
    .map((a) => ({
      ...a,
      podeCancelar: a.status === 'Confirmado' && minutosAte(a.data, a.hora) >= ANTECEDENCIA_CANCELAMENTO_HORAS * 60,
    }));
  res.json({ agendamentos });
}

/** DELETE /api/aluno/agendamentos/:id — cancela (com antecedência mínima). */
export function cancelar(req, res) {
  const id = idValido(req.params.id);
  const aula = id && db.prepare('SELECT * FROM agendamentos WHERE id = ? AND aluno_id = ?').get(id, req.user.sub);
  if (!aula) return res.status(404).json({ erro: 'Agendamento não encontrado.' });
  if (aula.status === 'Cancelado') return res.status(409).json({ erro: 'Esta aula já foi cancelada.' });
  if (minutosAte(aula.data, aula.hora) < ANTECEDENCIA_CANCELAMENTO_HORAS * 60) {
    return res.status(409).json({
      erro: `Só é possível cancelar com pelo menos ${ANTECEDENCIA_CANCELAMENTO_HORAS} horas de antecedência.`,
    });
  }
  db.prepare("UPDATE agendamentos SET status = 'Cancelado' WHERE id = ?").run(id);
  res.json({ ok: true });
}

/** GET /api/aluno/plano — plano atual e pedido de cancelamento (UC06). */
export function meuPlano(req, res) {
  const plano = planoAtivoDoAluno(req.user.sub) ?? null;
  const solicitacao = plano
    ? db
        .prepare(
          `SELECT id, motivo, status, resposta, criado_em FROM solicitacoes_cancelamento
           WHERE matricula_id = ? ORDER BY id DESC LIMIT 1`
        )
        .get(plano.id) ?? null
    : db
        .prepare(
          `SELECT id, motivo, status, resposta, criado_em FROM solicitacoes_cancelamento
           WHERE usuario_id = ? ORDER BY id DESC LIMIT 1`
        )
        .get(req.user.sub) ?? null;
  res.json({ plano, solicitacao });
}

/** POST /api/aluno/plano/cancelamento — pede o cancelamento; a recepção decide. */
export function solicitarCancelamento(req, res) {
  const { motivo } = req.body ?? {};
  if (!textoValido(motivo, 500)) return res.status(400).json({ erro: 'Conte o motivo do cancelamento.' });

  const plano = planoAtivoDoAluno(req.user.sub);
  if (!plano) return res.status(409).json({ erro: 'Você não tem um plano ativo para cancelar.' });

  const pendente = db
    .prepare("SELECT id FROM solicitacoes_cancelamento WHERE matricula_id = ? AND status = 'PENDENTE'")
    .get(plano.id);
  if (pendente) return res.status(409).json({ erro: 'Você já tem um pedido de cancelamento em análise.' });

  db.prepare('INSERT INTO solicitacoes_cancelamento (matricula_id, usuario_id, motivo) VALUES (?, ?, ?)')
    .run(plano.id, req.user.sub, motivo.trim());
  res.status(201).json({ ok: true });
}
