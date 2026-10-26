import { Router } from 'express';
import { login, register, me, config, loginGoogle } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { criarRateLimit } from '../middleware/rateLimit.js';

const router = Router();

// 10 tentativas / 15 min por IP: freia força bruta de senha.
const limitador = criarRateLimit({ maxTentativas: 10, janelaMs: 15 * 60 * 1000 });

router.get('/config', config);
router.post('/login', limitador, login);
router.post('/register', limitador, register);
router.post('/google', limitador, loginGoogle);
router.get('/me', authenticateToken, me);

export default router;
