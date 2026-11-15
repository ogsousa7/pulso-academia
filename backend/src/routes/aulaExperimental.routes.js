import { Router } from 'express';
import { criar, opcoes } from '../controllers/aulaExperimentalController.js';
import { criarRateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.get('/opcoes', opcoes);
// Rota pública: limite por IP para ninguém lotar a lista da recepção.
router.post('/', criarRateLimit({ maxTentativas: 5, janelaMs: 60 * 60 * 1000 }), criar);

export default router;
