/**
 * src/controllers/agendamentosController.js
 * KPIs do painel da recepção. (Listagem e criação de aulas ficam em
 * adminCadastrosController.js; as do aluno em alunoController.js.)
 */

import { db } from '../db/index.js';
import { hojeISO } from '../utils.js';

/** GET /api/admin/dashboard/kpis */
export function kpis(req, res) {
  const hoje = hojeISO();
  const um = (sql, ...p) => db.prepare(sql).get(...p).total;
  res.json({
    agendamentosHoje: um("SELECT COUNT(*) AS total FROM agendamentos WHERE data = ? AND status <> 'Cancelado'", hoje),
    alunosAtivos: um("SELECT COUNT(DISTINCT usuario_id) AS total FROM matriculas WHERE status = 'ATIVO' AND data_vencimento >= ?", hoje),
    vencimentosHoje: um("SELECT COUNT(*) AS total FROM matriculas WHERE data_vencimento = ? AND status = 'ATIVO'", hoje),
    cancelamentosPendentes: um("SELECT COUNT(*) AS total FROM solicitacoes_cancelamento WHERE status = 'PENDENTE'"),
  });
}
