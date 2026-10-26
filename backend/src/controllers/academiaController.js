/**
 * src/controllers/academiaController.js
 * ---------------------------------------------------------------------
 * UC02 (Visitante consulta as informações) e UC07 (Funcionário mantém as
 * informações da academia). Os dados vivem numa única linha da tabela
 * "academia", então o site (rodapé, mapa, contato) sempre mostra o que a
 * recepção cadastrou — nada fica "chumbado" no HTML.
 * --------------------------------------------------------------------- */

import { db } from '../db/index.js';
import { EMAIL_REGEX, textoValido } from '../utils.js';

/** Chave da Maps Embed API. É PÚBLICA por natureza (vai para o navegador): proteja-a por domínio no Google Cloud. */
const chaveMapas = () => (process.env.GOOGLE_MAPS_API_KEY || '').trim() || null;

function lerAcademia() {
  return db
    .prepare('SELECT endereco, email, telefone, horario_semana, horario_sabado, descricao, mapa_consulta FROM academia WHERE id = 1')
    .get();
}

/** GET /api/academia — público. */
export function obter(req, res) {
  const { mapa_consulta, ...dados } = lerAcademia();
  res.json({
    academia: dados,
    mapa: { consulta: mapa_consulta, chave: chaveMapas() },
  });
}

/** Campos editáveis e seus limites. */
const CAMPOS = {
  endereco: 200,
  email: 150,
  telefone: 30,
  horario_semana: 100,
  horario_sabado: 100,
  descricao: 500,
  mapa_consulta: 200,
};

/** PUT /api/admin/academia — só a recepção (a rota já exige ADMIN). */
export function atualizar(req, res) {
  const corpo = req.body ?? {};
  const invalidos = Object.keys(CAMPOS).filter((campo) => !textoValido(corpo[campo], CAMPOS[campo]));

  if (invalidos.length > 0) {
    return res.status(400).json({
      erro: 'Preencha todos os campos (respeitando o tamanho máximo).',
      campos: invalidos,
    });
  }
  if (!EMAIL_REGEX.test(corpo.email.trim())) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.', campos: ['email'] });
  }

  db.prepare(
    `UPDATE academia SET endereco = ?, email = ?, telefone = ?, horario_semana = ?,
       horario_sabado = ?, descricao = ?, mapa_consulta = ? WHERE id = 1`
  ).run(
    corpo.endereco.trim(),
    corpo.email.trim(),
    corpo.telefone.trim(),
    corpo.horario_semana.trim(),
    corpo.horario_sabado.trim(),
    corpo.descricao.trim(),
    corpo.mapa_consulta.trim()
  );

  obter(req, res);
}
