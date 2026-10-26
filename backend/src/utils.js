/**
 * src/utils.js
 * ---------------------------------------------------------------------
 * Funções utilitárias compartilhadas pelo backend.
 *
 * Datas: o servidor trabalha SEMPRE no fuso local da máquina e com strings
 * "YYYY-MM-DD" (datas) e "HH:MM" (horas). Nunca usamos toISOString() para
 * "hoje", porque ele converte para UTC: no Brasil (UTC-3), depois das 21h o
 * UTC já está no dia seguinte e os "de hoje" mostrariam o dia errado.
 * --------------------------------------------------------------------- */

const doisDigitos = (n) => String(n).padStart(2, '0');

/** Data (objeto Date) -> "YYYY-MM-DD" usando os getters locais. */
export function paraISO(d) {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/** Data de HOJE no fuso local, "YYYY-MM-DD". */
export function hojeISO() {
  return paraISO(new Date());
}

/** Hora de AGORA no fuso local, "HH:MM". */
export function horaAgora() {
  const d = new Date();
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** true se for uma data real no formato "YYYY-MM-DD" (rejeita 2026-02-31). */
export function dataISOValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const data = new Date(a, m - 1, d);
  return data.getFullYear() === a && data.getMonth() === m - 1 && data.getDate() === d;
}

/** Soma N dias a "YYYY-MM-DD". */
export function somarDias(dataISO, dias) {
  const [a, m, d] = dataISO.split('-').map(Number);
  return paraISO(new Date(a, m - 1, d + dias));
}

/**
 * Soma N meses a uma data "YYYY-MM-DD".
 * Se o dia não existir no mês de destino (ex.: 31/01 + 1 mês), usa o último
 * dia daquele mês (28/29 de fevereiro) em vez de "pular" para março.
 */
export function somarMeses(dataISO, meses) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const alvo = new Date(ano, mes - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(dia, ultimoDia));
  return paraISO(alvo);
}

/** Dia da semana de "YYYY-MM-DD": 0 = domingo … 6 = sábado. */
export function diaDaSemana(dataISO) {
  const [a, m, d] = dataISO.split('-').map(Number);
  return new Date(a, m - 1, d).getDay();
}

/** Minutos entre AGORA e o início de uma aula ("YYYY-MM-DD" + "HH:MM"). Negativo = já começou. */
export function minutosAte(dataISO, hora) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  return Math.round((new Date(a, m - 1, d, h, min).getTime() - Date.now()) / 60000);
}

/** true se o valor é uma string não vazia (após trim) e com até `max` caracteres. */
export function textoValido(valor, max = 200) {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= max;
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Inteiro positivo vindo de req.params / req.query, ou null se inválido. */
export function idValido(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}
