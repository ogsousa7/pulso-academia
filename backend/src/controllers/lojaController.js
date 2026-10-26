/**
 * src/controllers/lojaController.js
 * ---------------------------------------------------------------------
 * Endpoints públicos da vitrine: planos e produtos.
 * Não exigem login — qualquer visitante da loja.html pode ver os itens.
 * --------------------------------------------------------------------- */

import { db } from '../db/index.js';

/** GET /api/planos */
export function listarPlanos(req, res) {
  const planos = db.prepare('SELECT id, nome, preco, periodo, descricao FROM planos WHERE ativo = 1 ORDER BY preco ASC').all();
  res.json({ planos });
}

/** GET /api/produtos */
export function listarProdutos(req, res) {
  const produtos = db
    .prepare('SELECT id, nome, preco, categoria, descricao, imagem FROM produtos ORDER BY categoria, nome ASC')
    .all();
  res.json({ produtos });
}
