/**
 * src/routes/professor.routes.js — área do professor (/api/professor). Só role PROFESSOR.
 */
import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { carregarProfessor, agenda, obterDisponibilidade, salvarDisponibilidade } from '../controllers/professorController.js';

const router = Router();
router.use(authenticateToken, requireRole('PROFESSOR'), carregarProfessor);

router.get('/agenda', agenda);
router.get('/disponibilidade', obterDisponibilidade);
router.put('/disponibilidade', salvarDisponibilidade);

export default router;
