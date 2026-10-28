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

/** "detalhes" é guardado como texto JSON; devolve sempre uma lista (nunca quebra a vitrine). */
function lerLista(texto) {
  try {
    const lista = JSON.parse(texto);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/** GET /api/produtos */
export function listarProdutos(req, res) {
  const produtos = db
    .prepare('SELECT id, nome, preco, categoria, descricao, imagem, detalhes FROM produtos ORDER BY categoria, nome ASC')
    .all()
    .map((p) => ({ ...p, detalhes: lerLista(p.detalhes) }));
  res.json({ produtos });
}
