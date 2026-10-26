/**
 * src/services/matriculas.js
 * ---------------------------------------------------------------------
 * Regras de plano/matrícula usadas por mais de um módulo (loja, agenda,
 * "meu plano" e painel). Ficam aqui para não haver duas versões da mesma regra.
 * --------------------------------------------------------------------- */

import { db } from '../db/index.js';
import { hojeISO, somarMeses } from '../utils.js';

/** Quantos meses de acesso um plano dá, a partir do texto do período. */
export function mesesDoPeriodo(periodo) {
  const p = String(periodo).toLowerCase();
  if (p.includes('trimestre')) return 3;
  if (p.includes('ano')) return 12;
  return 1; // "por mês"
}

/**
 * Matrícula ATIVA do aluno que ainda vale em `data` (padrão: hoje).
 * Devolve { id, data_vencimento, status, plano_id, plano_nome, preco, periodo } ou undefined.
 */
export function planoAtivoDoAluno(usuarioId, data = hojeISO()) {
  return db
    .prepare(
      `SELECT m.id, m.data_vencimento, m.status, m.plano_id, p.nome AS plano_nome, p.preco, p.periodo
       FROM matriculas m JOIN planos p ON p.id = m.plano_id
       WHERE m.usuario_id = ? AND m.status = 'ATIVO' AND m.data_vencimento >= ?
       ORDER BY m.data_vencimento DESC LIMIT 1`
    )
    .get(usuarioId, data);
}

/**
 * Ativa/renova a matrícula do aluno. Se ele já tem plano ativo, o novo período
 * é somado a partir do vencimento atual (não perde dias já pagos).
 * Devolve a data de vencimento resultante.
 */
export function ativarMatricula(usuarioId, planoId, meses) {
  const atual = planoAtivoDoAluno(usuarioId);
  const base = atual ? atual.data_vencimento : hojeISO();
  const vencimento = somarMeses(base, meses);

  if (atual) {
    db.prepare('UPDATE matriculas SET plano_id = ?, data_vencimento = ? WHERE id = ?').run(planoId, vencimento, atual.id);
  } else {
    db.prepare(
      "INSERT INTO matriculas (usuario_id, plano_id, data_vencimento, status) VALUES (?, ?, ?, 'ATIVO')"
    ).run(usuarioId, planoId, vencimento);
  }
  return vencimento;
}
