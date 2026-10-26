/**
 * src/routes/admin.routes.js
 * ---------------------------------------------------------------------
 * Rotas da recepção, todas sob /api/admin. O router.use() abaixo aplica
 * authenticateToken + requireAdmin a TODAS elas de uma vez, então nenhuma
 * rota deste arquivo fica acidentalmente pública.
 * --------------------------------------------------------------------- */

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { kpis } from '../controllers/agendamentosController.js';
import * as cad from '../controllers/adminCadastrosController.js';
import { criar as criarAviso } from '../controllers/avisosController.js';
import { listarParaAdmin as listarPedidos } from '../controllers/pedidosController.js';
import { atualizar as atualizarAcademia } from '../controllers/academiaController.js';

const router = Router();
router.use(authenticateToken, requireAdmin);

router.get('/dashboard/kpis', kpis);
router.get('/opcoes', cad.opcoesAdmin);

router.get('/agendamentos', cad.listarAgendamentos);
router.post('/agendamentos', cad.criarAgendamento);
router.patch('/agendamentos/:id', cad.mudarStatusAgendamento);

router.get('/planos', cad.listarPlanos);
router.post('/planos', cad.criarPlano);
router.put('/planos/:id', cad.atualizarPlano);

router.get('/alunos', cad.listarAlunos);
router.post('/alunos', cad.criarAluno);
router.put('/alunos/:id', cad.atualizarAluno);

router.get('/professores', cad.listarProfessores);
router.post('/professores', cad.criarProfessor);
router.put('/professores/:id', cad.atualizarProfessor);

router.get('/solicitacoes', cad.listarSolicitacoes);
router.post('/solicitacoes/:id/resolver', cad.resolverSolicitacao);

router.post('/avisos', criarAviso); // a leitura (GET /api/avisos) é pública, em loja.routes.js
router.get('/pedidos', listarPedidos);
router.put('/academia', atualizarAcademia);

export default router;
