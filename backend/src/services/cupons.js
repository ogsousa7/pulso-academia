/**
 * src/services/cupons.js
 * Regra única de cupom, usada na prévia (GET /api/cupons/:codigo) e na criação
 * do pedido. Assim o desconto que aparece na tela é o mesmo que o servidor cobra.
 */
import { CUPONS } from '../constants.js';

const centavos = (v) => Math.round(v * 100) / 100;

/** Devolve { codigo, descricao, desconto } ou { erro }. */
export function calcularCupom(codigoBruto, subtotal) {
  const codigo = String(codigoBruto ?? '').trim().toUpperCase();
  const cupom = CUPONS[codigo];
  if (!cupom) return { erro: 'Cupom inválido ou expirado.' };
  if (subtotal < cupom.minimo) {
    return { erro: `Este cupom vale para compras a partir de R$ ${cupom.minimo.toFixed(2).replace('.', ',')}.` };
  }
  const bruto = cupom.tipo === 'percentual' ? (subtotal * cupom.valor) / 100 : cupom.valor;
  // Nunca deixa o pedido zerado: o total mínimo é R$ 1,00.
  const desconto = centavos(Math.min(bruto, Math.max(0, subtotal - 1)));
  return { codigo, descricao: cupom.descricao, desconto };
}
