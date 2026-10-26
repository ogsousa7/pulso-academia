import { Router } from 'express';
import { listarPlanos, listarProdutos } from '../controllers/lojaController.js';
import { listar as listarAvisos } from '../controllers/avisosController.js';
import { obter as obterAcademia } from '../controllers/academiaController.js';

const router = Router();

// Rotas públicas — index.html/loja.html buscam estes dados sem precisar de login.
router.get('/planos', listarPlanos);
router.get('/produtos', listarProdutos);
router.get('/academia', obterAcademia); // endereço, contato, horários e dados do mapa
router.get('/avisos', listarAvisos); // leitura de avisos é pública; só a criação exige ADMIN

export default router;
