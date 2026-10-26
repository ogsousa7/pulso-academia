/**
 * src/routes/aluno.routes.js — área do aluno (/api/aluno). Só role ALUNO.
 */
import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  opcoes, horarios, agendar, meusAgendamentos, cancelar, meuPlano, solicitarCancelamento,
} from '../controllers/alunoController.js';

const router = Router();
router.use(authenticateToken, requireRole('ALUNO'));

router.get('/opcoes', opcoes);
router.get('/horarios', horarios);
router.get('/agendamentos', meusAgendamentos);
router.post('/agendamentos', agendar);
router.delete('/agendamentos/:id', cancelar);
router.get('/plano', meuPlano);
router.post('/plano/cancelamento', solicitarCancelamento);

export default router;
