/**
 * src/controllers/aulaExperimentalController.js
 * ---------------------------------------------------------------------
 * Aula experimental grátis: o visitante deixa nome, WhatsApp, modalidade
 * e o melhor horário (formulário da página inicial); a recepção vê os
 * pedidos no painel e marca quem já foi contatado.
 * As mesmas regras são conferidas no navegador (home.js) e aqui.
 * --------------------------------------------------------------------- */

import { db } from '../db/index.js';
import { TIPOS_TREINO } from '../constants.js';

export const HORARIOS_EXPERIMENTAL = ['Manhã (6h às 12h)', 'Tarde (12h às 18h)', 'Noite (18h às 22h)', 'Sábado (8h às 14h)'];
const STATUS = ['NOVO', 'CONTATADO'];

/** Confere os campos e devolve { dados } ou { campos } com a mensagem de cada campo errado. */
function validar(corpo) {
  const { nome, whatsapp, modalidade, horario } = corpo ?? {};
  const campos = {};

  const nomeLimpo = typeof nome === 'string' ? nome.trim().replace(/\s+/g, ' ') : '';
  if (nomeLimpo.length < 3 || nomeLimpo.length > 80 || !/^[\p{L}][\p{L}' .-]*$/u.test(nomeLimpo)) {
    campos.nome = 'Escreva seu nome (só letras, pelo menos 3).';
  }

  // Aceita (11) 91234-5678, 11912345678 ou +55 11 91234-5678; guarda só DDD + número.
  let digitos = typeof whatsapp === 'string' ? whatsapp.replace(/\D/g, '') : '';
  if (digitos.length >= 12 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (!/^[1-9]{2}9?\d{8}$/.test(digitos)) campos.whatsapp = 'Informe o WhatsApp com DDD, ex.: (11) 91234-5678.';

  if (!TIPOS_TREINO.includes(modalidade)) campos.modalidade = 'Escolha uma modalidade.';
  if (!HORARIOS_EXPERIMENTAL.includes(horario)) campos.horario = 'Escolha o melhor horário.';

  return Object.keys(campos).length ? { campos } : { dados: { nome: nomeLimpo, whatsapp: digitos, modalidade, horario } };
}

/** GET /api/aula-experimental/opcoes — modalidades e horários aceitos. */
export function opcoes(req, res) {
  res.json({ modalidades: TIPOS_TREINO, horarios: HORARIOS_EXPERIMENTAL });
}

/** POST /api/aula-experimental — público (com limite de pedidos por IP). */
export function criar(req, res) {
  const { dados, campos } = validar(req.body);
  if (campos) return res.status(400).json({ erro: 'Confira os campos destacados.', campos });
  const { lastInsertRowid } = db
    .prepare('INSERT INTO aulas_experimentais (nome, whatsapp, modalidade, horario) VALUES (?, ?, ?, ?)')
    .run(dados.nome, dados.whatsapp, dados.modalidade, dados.horario);
  res.status(201).json({
    id: Number(lastInsertRowid),
    mensagem: 'Pedido recebido! A recepção vai chamar você no WhatsApp para marcar o dia da aula.',
  });
}

/** GET /api/admin/aulas-experimentais — novos primeiro. */
export function listar(req, res) {
  const pedidos = db
    .prepare("SELECT * FROM aulas_experimentais ORDER BY status = 'NOVO' DESC, criado_em DESC, id DESC")
    .all();
  res.json({ pedidos });
}

/** PATCH /api/admin/aulas-experimentais/:id  body: { status: 'NOVO' | 'CONTATADO' } */
export function atualizarStatus(req, res) {
  const id = Number(req.params.id);
  const { status } = req.body ?? {};
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ erro: 'Pedido inválido.' });
  if (!STATUS.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
  const { changes } = db.prepare('UPDATE aulas_experimentais SET status = ? WHERE id = ?').run(status, id);
  if (!changes) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  res.json({ id, status });
}
