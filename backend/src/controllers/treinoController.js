/**
 * src/controllers/treinoController.js
 * ---------------------------------------------------------------------
 * POST /api/treino — monta um plano de treino a partir das respostas do
 * formulário de treino.html. Rota pública, com limite de usos por IP.
 * --------------------------------------------------------------------- */

import { DIAS_TREINO, DURACOES_TREINO, LOCAIS_TREINO, NIVEIS, OBJETIVOS_TREINO } from '../constants.js';
import { montarTreino } from '../services/treino.js';

const MAX_RESTRICOES = 200;

function lerPedido(body) {
  const { objetivo, nivel, local, restricoes = '' } = body ?? {};
  const dias = Number(body?.dias);
  const minutos = Number(body?.minutos);
  if (!OBJETIVOS_TREINO.includes(objetivo)) return { erro: 'Escolha um objetivo.' };
  if (!NIVEIS.includes(nivel)) return { erro: 'Escolha seu nível.' };
  if (!LOCAIS_TREINO.includes(local)) return { erro: 'Escolha onde você vai treinar.' };
  if (!Number.isInteger(dias) || dias < DIAS_TREINO.minimo || dias > DIAS_TREINO.maximo) return { erro: 'Escolha quantos dias por semana.' };
  if (!DURACOES_TREINO.includes(minutos)) return { erro: 'Escolha o tempo de cada treino.' };
  if (typeof restricoes !== 'string' || restricoes.length > MAX_RESTRICOES) return { erro: `As restrições podem ter até ${MAX_RESTRICOES} caracteres.` };
  return { pedido: { objetivo, nivel, local, dias, minutos, restricoes: restricoes.trim() } };
}

export async function criarTreino(req, res) {
  const { erro, pedido } = lerPedido(req.body);
  if (erro) return res.status(400).json({ erro });
  res.json(await montarTreino(pedido));
}
