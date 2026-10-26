/**
 * src/routes/pedidos.routes.js
 * ---------------------------------------------------------------------
 * Pedidos da loja (qualquer usuário logado). A listagem para a recepção
 * fica em admin.routes.js (GET /api/admin/pedidos).
 *
 *  - POST /pedidos             cria o pedido (cartão aprova; Pix/boleto ficam pendentes)
 *  - GET  /pedidos/meus        histórico do próprio usuário
 *  - GET  /pedidos/:id         um pedido (dono ou ADMIN) — usado para acompanhar Pix/boleto
 *  - POST /pedidos/:id/pagar   simula a confirmação do banco (só em modo demonstração)
 * --------------------------------------------------------------------- */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { criar, meus, obter, pagar } from '../controllers/pedidosController.js';

const router = Router();

router.post('/pedidos', authenticateToken, criar);
router.get('/pedidos/meus', authenticateToken, meus); // antes de /pedidos/:id, senão "meus" viraria um :id
router.get('/pedidos/:id', authenticateToken, obter);
router.post('/pedidos/:id/pagar', authenticateToken, pagar);

export default router;
