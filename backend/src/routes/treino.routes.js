import { Router } from 'express';
import { criarTreino } from '../controllers/treinoController.js';
import { criarRateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Rota pública que pode gastar a cota da IA: por isso o limite por IP.
router.post('/', criarRateLimit({ maxTentativas: 8, janelaMs: 60 * 60 * 1000 }), criarTreino);

export default router;
