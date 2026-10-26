/**
 * src/controllers/avisosController.js
 * ---------------------------------------------------------------------
 * Avisos da recepção para os alunos — o coração do problema que a
 * Pulso Academia resolve (comunicação academia <-> aluno).
 * Leitura é pública (qualquer aluno vê); criação exige ADMIN.
 * --------------------------------------------------------------------- */

import { db } from '../db/index.js';
import { textoValido } from '../utils.js';

/** GET /api/avisos */
export function listar(req, res) {
  const avisos = db
    .prepare('SELECT id, texto, criado_em FROM avisos ORDER BY id DESC LIMIT 20')
    .all();
  res.json({ avisos });
}

/** POST /api/avisos — exige ADMIN (checado na rota). */
export function criar(req, res) {
  const { texto } = req.body ?? {};

  if (!textoValido(texto, 500)) {
    return res.status(400).json({ erro: 'O aviso não pode ficar vazio nem passar de 500 caracteres.' });
  }

  const resultado = db.prepare('INSERT INTO avisos (texto) VALUES (?)').run(texto.trim());
  const novoAviso = db
    .prepare('SELECT id, texto, criado_em FROM avisos WHERE id = ?')
    .get(resultado.lastInsertRowid);

  res.status(201).json({ aviso: novoAviso });
}
