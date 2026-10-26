/**
 * src/services/agenda.js
 * ---------------------------------------------------------------------
 * Regras de agenda usadas pelo aluno, pelo professor e pela recepção:
 * quais horários de um professor estão livres numa data e o cancelamento
 * de aulas (com ou sem regra de antecedência).
 * --------------------------------------------------------------------- */

import { db } from '../db/index.js';
import { diaDaSemana, hojeISO, minutosAte } from '../utils.js';

/** Professor (com nome) a partir do id da tabela professores. */
export function obterProfessor(professorId) {
  return db
    .prepare(
      `SELECT p.id, p.usuario_id, p.especialidade, u.nome, u.ativo
       FROM professores p JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = ?`
    )
    .get(professorId);
}

/** Professor ligado a um usuário logado (role PROFESSOR). */
export function professorDoUsuario(usuarioId) {
  return db
    .prepare(
      `SELECT p.id, p.usuario_id, p.especialidade, u.nome
       FROM professores p JOIN usuarios u ON u.id = p.usuario_id WHERE p.usuario_id = ?`
    )
    .get(usuarioId);
}

/**
 * Horários livres do professor em `data`: estão na disponibilidade semanal
 * dele, não têm aula marcada (não cancelada) e ainda não passaram.
 */
export function horariosLivres(professorId, data) {
  const dia = diaDaSemana(data);
  const disponiveis = db
    .prepare('SELECT hora FROM disponibilidades WHERE professor_id = ? AND dia_semana = ? ORDER BY hora')
    .all(professorId, dia)
    .map((d) => d.hora);
  const ocupados = new Set(
    db
      .prepare("SELECT hora FROM agendamentos WHERE professor_id = ? AND data = ? AND status <> 'Cancelado'")
      .all(professorId, data)
      .map((a) => a.hora)
  );
  return disponiveis.filter((h) => !ocupados.has(h) && minutosAte(data, h) > 0);
}

/** Cancela as aulas futuras (não canceladas) de um aluno. Devolve quantas foram. */
export function cancelarAulasFuturasDoAluno(alunoId) {
  const hoje = hojeISO();
  const futuras = db
    .prepare("SELECT id, data, hora FROM agendamentos WHERE aluno_id = ? AND status <> 'Cancelado' AND data >= ?")
    .all(alunoId, hoje)
    .filter((a) => minutosAte(a.data, a.hora) > 0);
  const cancelar = db.prepare("UPDATE agendamentos SET status = 'Cancelado' WHERE id = ?");
  futuras.forEach((a) => cancelar.run(a.id));
  return futuras.length;
}
