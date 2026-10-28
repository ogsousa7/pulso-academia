/**
 * src/controllers/pedidosController.js
 * ---------------------------------------------------------------------
 * Checkout da loja (pagamento SIMULADO, mas com o fluxo de um real).
 *
 *   Cartão  -> aprovado na hora (status PAGO)
 *   Pix     -> PENDENTE por 15 min, com QR Code e código "copia e cola"
 *   Boleto  -> PENDENTE por 3 dias, com linha digitável
 *   Pendente -> PAGO (quando a "confirmação do banco" chega) ou EXPIRADO
 *
 * Regra de ouro: o servidor NUNCA confia em preço, nome ou total vindos do
 * navegador. O cliente manda só "o que" (tipo, id, quantidade); preços e
 * nomes são lidos do banco. Do contrário, qualquer pessoa poderia abrir o
 * DevTools e comprar o plano anual por R$ 0,01.
 *
 * Dados de cartão: o número completo e o CVV NUNCA chegam aqui. O navegador
 * valida o cartão e envia só bandeira + 4 últimos dígitos + parcelas.
 * --------------------------------------------------------------------- */

import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { db, transacao } from '../db/index.js';
import { ativarMatricula, mesesDoPeriodo } from '../services/matriculas.js';
import { idValido } from '../utils.js';
import { calcularCupom } from '../services/cupons.js';

const METODOS_VALIDOS = ['PIX', 'CARTAO', 'BOLETO'];
const BANDEIRAS_VALIDAS = ['VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD', 'OUTRA'];
const MAX_ITENS = 20;
const MAX_QUANTIDADE = 10;
const MAX_PARCELAS = 12;
const PARCELA_MINIMA = 20; // R$
const PIX_VALIDADE_MS = 15 * 60 * 1000;
const BOLETO_VALIDADE_MS = 3 * 24 * 60 * 60 * 1000;

/** Arredonda para centavos (evita 149.89999999 na soma de floats). */
const centavos = (valor) => Math.round(valor * 100) / 100;

/** Datas no mesmo formato do SQLite (UTC "YYYY-MM-DD HH:MM:SS"), para comparar texto com texto. */
const utc = (deslocamentoMs = 0) => new Date(Date.now() + deslocamentoMs).toISOString().slice(0, 19).replace('T', ' ');

/** Pagamento "falso" só funciona em modo demonstração (PAGAMENTO_SIMULADO != false). */
const modoSimulado = () => String(process.env.PAGAMENTO_SIMULADO ?? 'true').toLowerCase() !== 'false';

/* ------------------------------ Códigos ------------------------------- */

/** Código Pix "copia e cola" de DEMONSTRAÇÃO. Propositalmente NÃO segue o padrão BR Code: nenhum banco aceita. */
function gerarCodigoPix(pedidoId, total) {
  return `PULSO-DEMO-PIX|pedido=${pedidoId}|valor=${total.toFixed(2)}|${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

/** Linha digitável de boleto de DEMONSTRAÇÃO: dígitos aleatórios com banco "000" (inexistente). */
function gerarLinhaDigitavel() {
  const d = (n) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');
  const c1 = '000' + d(7), c2 = d(11), c3 = d(11);
  return `${c1.slice(0, 5)}.${c1.slice(5)} ${c2.slice(0, 5)}.${c2.slice(5)} ${c3.slice(0, 5)}.${c3.slice(5)} ${d(1)} ${d(14)}`;
}

/* ------------------------------ Validação ------------------------------ */

/**
 * Valida o corpo e monta a lista de itens com dados REAIS do banco.
 * Devolve { itens } ou { erro } (mensagem pronta para o cliente).
 */
function montarItens(corpo) {
  const bruto = corpo?.itens;
  if (!Array.isArray(bruto) || bruto.length === 0) return { erro: 'O carrinho está vazio.' };
  if (bruto.length > MAX_ITENS) return { erro: `Máximo de ${MAX_ITENS} itens por pedido.` };

  const buscarPlano = db.prepare('SELECT id, nome, preco, periodo FROM planos WHERE id = ? AND ativo = 1');
  const buscarProduto = db.prepare('SELECT id, nome, preco FROM produtos WHERE id = ?');

  const itens = [];
  let planos = 0;

  for (const entrada of bruto) {
    const tipo = entrada?.tipo;
    const id = Number(entrada?.id);
    const quantidade = Number(entrada?.quantidade ?? 1);

    if (tipo !== 'PLANO' && tipo !== 'PRODUTO') return { erro: 'Item inválido no carrinho.' };
    if (!Number.isInteger(id) || id <= 0) return { erro: 'Item inválido no carrinho.' };
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_QUANTIDADE) {
      return { erro: `Quantidade deve ser de 1 a ${MAX_QUANTIDADE}.` };
    }

    if (tipo === 'PLANO') {
      planos += 1;
      if (planos > 1 || quantidade !== 1) return { erro: 'Escolha apenas um plano por pedido.' };
      const plano = buscarPlano.get(id);
      if (!plano) return { erro: 'Este plano não está mais disponível.' };
      itens.push({ tipo, id, nome: plano.nome, preco_unit: plano.preco, quantidade, meses: mesesDoPeriodo(plano.periodo) });
    } else {
      const produto = buscarProduto.get(id);
      if (!produto) return { erro: 'Um dos produtos do carrinho não existe mais.' };
      itens.push({ tipo, id, nome: produto.nome, preco_unit: produto.preco, quantidade });
    }
  }

  return { itens };
}

/** Valida parcelas/bandeira/final do cartão. Devolve { parcelas, bandeira, cartaoFinal } ou { erro }. */
function validarCartao(corpo, total) {
  const parcelas = Number(corpo.parcelas ?? 1);
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) {
    return { erro: `Escolha de 1 a ${MAX_PARCELAS} parcelas.` };
  }
  if (parcelas > 1 && total / parcelas < PARCELA_MINIMA - 0.005) {
    return { erro: `A parcela mínima é R$ ${PARCELA_MINIMA},00.` };
  }
  if (!BANDEIRAS_VALIDAS.includes(corpo.bandeira)) return { erro: 'Bandeira do cartão inválida.' };
  if (!/^\d{4}$/.test(String(corpo.cartaoFinal ?? ''))) return { erro: 'Informe os 4 últimos dígitos do cartão.' };
  return { parcelas, bandeira: corpo.bandeira, cartaoFinal: String(corpo.cartaoFinal) };
}

/* ------------------------------ Resposta ------------------------------- */

/** Pedido no formato da API (inclui os dados de pagamento enquanto estiver PENDENTE). */
async function montarResposta(pedidoId) {
  const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
  const itens = db
    .prepare('SELECT tipo, nome, preco_unit, quantidade FROM pedido_itens WHERE pedido_id = ? ORDER BY id')
    .all(pedidoId);

  const resposta = {
    id: p.id,
    total: p.total,
    subtotal: p.subtotal ?? p.total,
    desconto: p.desconto ?? 0,
    cupom: p.cupom,
    metodo: p.metodo,
    status: p.status,
    parcelas: p.parcelas,
    bandeira: p.bandeira,
    cartao_final: p.cartao_final,
    vencimento: p.vencimento,
    criado_em: p.criado_em,
    pago_em: p.pago_em,
    expira_em: p.expira_em,
    itens,
  };

  if (p.status === 'PENDENTE') {
    resposta.pagamento = { codigo: p.codigo_pagamento };
    if (p.metodo === 'PIX') {
      resposta.pagamento.qrcode = await QRCode.toDataURL(p.codigo_pagamento, { margin: 1, width: 260 });
    }
  }
  return resposta;
}

/** Marca como EXPIRADO os pedidos pendentes cujo prazo passou. */
function expirarPendentes(pedidoId = null) {
  const sql = "UPDATE pedidos SET status = 'EXPIRADO' WHERE status = 'PENDENTE' AND expira_em <= ?";
  if (pedidoId) db.prepare(`${sql} AND id = ?`).run(utc(), pedidoId);
  else db.prepare(sql).run(utc());
}

/** Confirma o pagamento e ativa a matrícula, se o pedido tiver plano. Chamar dentro de uma transação. */
function efetivarPagamento(pedidoId, usuarioId) {
  const itemPlano = db
    .prepare(
      `SELECT i.item_id AS plano_id, pl.periodo FROM pedido_itens i
       JOIN planos pl ON pl.id = i.item_id WHERE i.pedido_id = ? AND i.tipo = 'PLANO'`
    )
    .get(pedidoId);

  const vencimento = itemPlano ? ativarMatricula(usuarioId, itemPlano.plano_id, mesesDoPeriodo(itemPlano.periodo)) : null;
  db.prepare("UPDATE pedidos SET status = 'PAGO', pago_em = ?, vencimento = ? WHERE id = ?").run(utc(), vencimento, pedidoId);
}

/* ------------------------------ Endpoints ------------------------------ */

/**
 * POST /api/pedidos  (logado)
 * body: { itens: [{tipo,id,quantidade}], metodo, parcelas?, bandeira?, cartaoFinal?, cupom? }
 */
export async function criar(req, res) {
  const corpo = req.body ?? {};

  if (!METODOS_VALIDOS.includes(corpo.metodo)) {
    return res.status(400).json({ erro: 'Escolha uma forma de pagamento: PIX, CARTAO ou BOLETO.' });
  }

  const { itens, erro } = montarItens(corpo);
  if (erro) return res.status(400).json({ erro });

  const subtotal = centavos(itens.reduce((soma, i) => soma + i.preco_unit * i.quantidade, 0));

  // Cupom (opcional): o desconto é sempre recalculado aqui, nunca aceito do navegador.
  let cupom = null;
  if (corpo.cupom) {
    cupom = calcularCupom(corpo.cupom, subtotal);
    if (cupom.erro) return res.status(400).json({ erro: cupom.erro });
  }
  const desconto = cupom ? cupom.desconto : 0;
  const total = centavos(subtotal - desconto);

  let cartao = { parcelas: 1, bandeira: null, cartaoFinal: null };
  if (corpo.metodo === 'CARTAO') {
    cartao = validarCartao(corpo, total);
    if (cartao.erro) return res.status(400).json({ erro: cartao.erro });
  }

  const usuarioId = Number(req.user.sub);
  let pedidoId;

  // Transação: ou o pedido, os itens e a matrícula são gravados juntos, ou nada é.
  try {
    pedidoId = transacao(() => {
      const aVista = corpo.metodo === 'CARTAO'; // cartão aprovado na hora; Pix e boleto aguardam
      const validadeMs = corpo.metodo === 'PIX' ? PIX_VALIDADE_MS : BOLETO_VALIDADE_MS;

      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO pedidos (usuario_id, total, subtotal, desconto, cupom, metodo, status, parcelas, bandeira, cartao_final, expira_em)
           VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?, ?, ?)`
        )
        .run(usuarioId, total, subtotal, desconto, cupom?.codigo ?? null, corpo.metodo, cartao.parcelas, cartao.bandeira, cartao.cartaoFinal, aVista ? null : utc(validadeMs));
      const id = Number(lastInsertRowid);

      const inserirItem = db.prepare(
        'INSERT INTO pedido_itens (pedido_id, tipo, item_id, nome, preco_unit, quantidade) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const item of itens) inserirItem.run(id, item.tipo, item.id, item.nome, item.preco_unit, item.quantidade);

      if (corpo.metodo === 'PIX') {
        db.prepare('UPDATE pedidos SET codigo_pagamento = ? WHERE id = ?').run(gerarCodigoPix(id, total), id);
      } else if (corpo.metodo === 'BOLETO') {
        db.prepare('UPDATE pedidos SET codigo_pagamento = ? WHERE id = ?').run(gerarLinhaDigitavel(), id);
      } else {
        efetivarPagamento(id, usuarioId);
      }
      return id;
    });
  } catch (err) {
    console.error('[pedidos] falha ao gravar pedido', err);
    return res.status(500).json({ erro: 'Não foi possível concluir o pedido. Tente novamente.' });
  }

  res.status(201).json({ pedido: await montarResposta(pedidoId) });
}

/** GET /api/pedidos/meus  (logado) — histórico do próprio usuário. */
export function meus(req, res) {
  expirarPendentes();
  const pedidos = db
    .prepare(
      `SELECT p.id, p.total, p.metodo, p.status, p.criado_em, p.expira_em,
              (SELECT group_concat(nome, ', ') FROM pedido_itens WHERE pedido_id = p.id) AS itens_resumo
       FROM pedidos p WHERE p.usuario_id = ? ORDER BY p.id DESC LIMIT 50`
    )
    .all(Number(req.user.sub));
  res.json({ pedidos });
}

/** GET /api/pedidos/:id  (dono do pedido ou ADMIN) */
export async function obter(req, res) {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Identificador de pedido inválido.' });

  const pedido = db.prepare('SELECT id, usuario_id FROM pedidos WHERE id = ?').get(id);
  // 404 (e não 403) para pedido de outra pessoa: não revela que ele existe.
  if (!pedido || (pedido.usuario_id !== Number(req.user.sub) && req.user.role !== 'ADMIN')) {
    return res.status(404).json({ erro: 'Pedido não encontrado.' });
  }

  expirarPendentes(id);
  res.json({ pedido: await montarResposta(id) });
}

/**
 * POST /api/pedidos/:id/pagar  (dono do pedido)
 * SIMULA o aviso de pagamento que o banco/gateway mandaria. Em produção real,
 * esta rota NÃO existiria para o cliente: quem confirma é o gateway (webhook
 * assinado). Por isso fica desligada com PAGAMENTO_SIMULADO=false no .env.
 */
export async function pagar(req, res) {
  if (!modoSimulado()) {
    return res.status(404).json({ erro: 'Rota disponível apenas no modo demonstração.' });
  }

  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Identificador de pedido inválido.' });

  const pedido = db.prepare('SELECT id, usuario_id FROM pedidos WHERE id = ?').get(id);
  if (!pedido || pedido.usuario_id !== Number(req.user.sub)) {
    return res.status(404).json({ erro: 'Pedido não encontrado.' });
  }

  expirarPendentes(id);
  const atual = db.prepare('SELECT status FROM pedidos WHERE id = ?').get(id);
  if (atual.status === 'PAGO') return res.status(409).json({ erro: 'Este pedido já foi pago.' });
  if (atual.status === 'EXPIRADO') return res.status(409).json({ erro: 'Este pedido expirou. Faça um novo pedido.' });

  transacao(() => efetivarPagamento(id, pedido.usuario_id));
  res.json({ pedido: await montarResposta(id) });
}

/** GET /api/admin/pedidos?status=&limite=  (ADMIN) */
export function listarParaAdmin(req, res) {
  expirarPendentes();
  const { status } = req.query;
  const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 200);

  const filtros = [];
  const params = [];
  if (['PAGO', 'PENDENTE', 'EXPIRADO'].includes(status)) {
    filtros.push('p.status = ?');
    params.push(status);
  }

  if (['PIX', 'CARTAO', 'BOLETO'].includes(req.query.metodo)) {
    filtros.push('p.metodo = ?');
    params.push(req.query.metodo);
  }

  const pedidos = db
    .prepare(
      `SELECT p.id, p.total, p.metodo, p.status, p.parcelas, p.criado_em, p.pago_em, u.nome AS aluno_nome,
              (SELECT COUNT(*) FROM pedido_itens WHERE pedido_id = p.id) AS qtd_itens,
              (SELECT group_concat(nome, ', ') FROM pedido_itens WHERE pedido_id = p.id) AS itens_resumo
       FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
       ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
       ORDER BY p.id DESC LIMIT ?`
    )
    .all(...params, limite);

  res.json({ pedidos });
}

/** GET /api/cupons/:codigo?subtotal=123.45 (público) — prévia do desconto para a tela de pagamento. */
export function verificarCupom(req, res) {
  const subtotal = Number(req.query.subtotal);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return res.status(400).json({ erro: 'Subtotal inválido.' });
  const r = calcularCupom(req.params.codigo, subtotal);
  if (r.erro) return res.status(404).json({ erro: r.erro });
  res.json({ cupom: r });
}
