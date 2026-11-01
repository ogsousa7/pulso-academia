/**
 * src/constants.js
 * ---------------------------------------------------------------------
 * Regras de negócio e listas fixas em UM só lugar. Se a academia mudar uma
 * regra (ex.: cancelar com 4h de antecedência), basta alterar aqui.
 * --------------------------------------------------------------------- */

export const ROLES = ['ALUNO', 'PROFESSOR', 'ADMIN'];

/** Horários em que uma aula pode começar (cada aula dura 1 hora). */
export const HORAS_AULA = Array.from({ length: 16 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`); // 06:00 … 21:00

export const TIPOS_TREINO = ['Musculação', 'Funcional', 'Cardio', 'Alongamento'];
export const NIVEIS = ['Iniciante', 'Intermediário', 'Avançado'];
export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Categorias da loja: a chave vai para o banco, o rótulo aparece no painel e na vitrine. */
export const CATEGORIAS_PRODUTO = { suplemento: 'Suplementos', vestuario: 'Vestuário', acessorio: 'Acessórios' };

/** Opções do montador de treinos (treino.html). */
export const OBJETIVOS_TREINO = ['Ganhar massa muscular', 'Emagrecer', 'Ganhar força', 'Melhorar o condicionamento', 'Saúde e bem-estar'];
export const LOCAIS_TREINO = ['Academia completa', 'Halteres e elásticos', 'Em casa, sem equipamento'];
export const DURACOES_TREINO = [30, 45, 60, 90]; // minutos por sessão
export const DIAS_TREINO = { minimo: 2, maximo: 6 }; // dias por semana

export const STATUS_AGENDAMENTO = ['Confirmado', 'Em andamento', 'Cancelado'];

/** O aluno só pode cancelar uma aula que começa daqui a, no mínimo, X horas. */
export const ANTECEDENCIA_CANCELAMENTO_HORAS = 2;

/** Até quantos dias à frente é possível agendar. */
export const MAX_DIAS_AGENDAMENTO = 30;

/**
 * Cupons de desconto (demonstração). O servidor recalcula o desconto em cada
 * pedido: o navegador só manda o código. Para criar um cupom, adicione aqui.
 *   tipo 'percentual' -> valor em %  ·  tipo 'valor' -> valor em R$
 *   minimo -> subtotal mínimo do pedido para o cupom valer
 */
export const CUPONS = {
  PULSO10: { tipo: 'percentual', valor: 10, minimo: 0, descricao: '10% de desconto' },
  BEMVINDO20: { tipo: 'valor', valor: 20, minimo: 100, descricao: 'R$ 20 de desconto em compras a partir de R$ 100' },
};
