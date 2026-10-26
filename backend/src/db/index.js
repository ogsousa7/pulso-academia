/**
 * src/db/index.js
 * ---------------------------------------------------------------------
 * Camada de acesso ao banco de dados da Pulso Academia.
 *
 * Usamos o módulo nativo "node:sqlite" (disponível a partir do Node 22.5,
 * sem precisar instalar nenhum pacote nem compilar binário nativo — por
 * isso foi escolhido no lugar de "better-sqlite3" ou de um ORM como o
 * Prisma: para um MVP escolar, o objetivo é rodar em qualquer máquina
 * com "npm install" e nada mais).
 *
 * Este arquivo, a cada inicialização:
 *   1) abre (ou cria) o arquivo de banco em /data/pulso.sqlite
 *   2) cria as tabelas que não existem (CREATE TABLE IF NOT EXISTS)
 *   3) MIGRA bancos de versões anteriores (colunas novas, tabela de usuários)
 *   4) sincroniza catálogo, professores e informações da academia
 *   5) popula dados de exemplo na primeira execução (seed)
 *
 * As queries ficam em cada controller — aqui só exportamos a conexão.
 * --------------------------------------------------------------------- */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { hojeISO, somarMeses, somarDias } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'pulso.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

// Garante integridade referencial (SQLite não aplica FOREIGN KEY por padrão)
db.exec('PRAGMA foreign_keys = ON;');

/** Executa `fn` dentro de uma transação (tudo ou nada). Exportada para os controllers. */
export function transacao(fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

/* ----------------------------- SCHEMA -------------------------------- */

/** Definição da tabela de usuários (reutilizada na migração que a reconstrói). */
const ddlUsuarios = (nomeTabela) => `
  CREATE TABLE ${nomeTabela} (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    senha_hash    TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('ALUNO', 'PROFESSOR', 'ADMIN')) DEFAULT 'ALUNO',
    ativo         INTEGER NOT NULL DEFAULT 1,
    google_sub    TEXT,
    criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'").get()) {
  db.exec(ddlUsuarios('usuarios'));
}

db.exec(`
  CREATE TABLE IF NOT EXISTS planos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT NOT NULL,
    preco         REAL NOT NULL,
    periodo       TEXT NOT NULL,
    descricao     TEXT NOT NULL DEFAULT '',
    ativo         INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS produtos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT NOT NULL,
    preco         REAL NOT NULL,
    categoria     TEXT NOT NULL DEFAULT 'geral',
    descricao     TEXT NOT NULL DEFAULT '',
    imagem        TEXT NOT NULL DEFAULT ''
  );

  -- Pedidos da loja (planos + produtos). O pagamento é SIMULADO.
  -- Ciclo: PENDENTE (Pix/boleto aguardando) -> PAGO | EXPIRADO.  Cartão aprovado já nasce PAGO.
  -- Do cartão guardamos apenas bandeira e os 4 últimos dígitos (nunca o número completo nem o CVV).
  CREATE TABLE IF NOT EXISTS pedidos (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    total             REAL NOT NULL,
    metodo            TEXT NOT NULL CHECK (metodo IN ('PIX', 'CARTAO', 'BOLETO')),
    status            TEXT NOT NULL DEFAULT 'PAGO',
    parcelas          INTEGER NOT NULL DEFAULT 1,
    bandeira          TEXT,
    cartao_final      TEXT,
    codigo_pagamento  TEXT,
    expira_em         TEXT,
    pago_em           TEXT,
    vencimento        TEXT,
    criado_em         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Os itens guardam nome e preço NO MOMENTO da compra (histórico não muda
  -- se o preço do produto for alterado depois).
  CREATE TABLE IF NOT EXISTS pedido_itens (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id     INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    tipo          TEXT NOT NULL CHECK (tipo IN ('PLANO', 'PRODUTO')),
    item_id       INTEGER NOT NULL,
    nome          TEXT NOT NULL,
    preco_unit    REAL NOT NULL,
    quantidade    INTEGER NOT NULL CHECK (quantidade > 0)
  );

  CREATE TABLE IF NOT EXISTS matriculas (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    plano_id          INTEGER NOT NULL REFERENCES planos(id)   ON DELETE RESTRICT,
    data_vencimento   TEXT NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('ATIVO', 'VENCIDO', 'CANCELADO')) DEFAULT 'ATIVO'
  );

  -- O aluno pede o cancelamento; a recepção aprova ou recusa (regra da academia).
  CREATE TABLE IF NOT EXISTS solicitacoes_cancelamento (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula_id  INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
    motivo        TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('PENDENTE', 'APROVADA', 'RECUSADA')) DEFAULT 'PENDENTE',
    resposta      TEXT,
    criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
    resolvido_em  TEXT
  );

  -- Cada professor tem um usuário (role PROFESSOR) para entrar no sistema.
  CREATE TABLE IF NOT EXISTS professores (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id    INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
    especialidade TEXT NOT NULL DEFAULT 'Musculação'
  );

  -- Disponibilidade semanal: cada linha é um horário de início (aula de 1 h)
  -- em que o professor atende num dia da semana (0 = domingo … 6 = sábado).
  CREATE TABLE IF NOT EXISTS disponibilidades (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    professor_id  INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    dia_semana    INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora          TEXT NOT NULL,
    UNIQUE (professor_id, dia_semana, hora)
  );

  CREATE TABLE IF NOT EXISTS agendamentos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    aluno_id      INTEGER REFERENCES usuarios(id)    ON DELETE SET NULL,
    professor_id  INTEGER REFERENCES professores(id) ON DELETE SET NULL,
    aluno_nome    TEXT NOT NULL,
    professor     TEXT NOT NULL,
    tipo_treino   TEXT NOT NULL DEFAULT 'Musculação',
    nivel         TEXT NOT NULL DEFAULT 'Iniciante',
    data          TEXT NOT NULL,
    hora          TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('Confirmado', 'Em andamento', 'Cancelado')) DEFAULT 'Confirmado',
    criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS avisos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    texto         TEXT NOT NULL,
    criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Informações públicas da academia (uma única linha, id = 1) — UC07.
  CREATE TABLE IF NOT EXISTS academia (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    endereco        TEXT NOT NULL,
    email           TEXT NOT NULL,
    telefone        TEXT NOT NULL,
    horario_semana  TEXT NOT NULL,
    horario_sabado  TEXT NOT NULL,
    descricao       TEXT NOT NULL,
    mapa_consulta   TEXT NOT NULL DEFAULT 'Heliópolis, São Paulo - SP, Brasil'
  );
`);

/* ------------------------------ MIGRAÇÕES -----------------------------
   Bancos criados em versões anteriores continuam funcionando: o
   CREATE TABLE IF NOT EXISTS não altera tabelas que já existem, então
   adicionamos aqui o que faltar. Ninguém precisa rodar "db:reset".
------------------------------------------------------------------------ */

function garantirColuna(tabela, coluna, definicao) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!colunas.includes(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}

/**
 * A versão antiga só aceitava as roles ALUNO e ADMIN num CHECK. O SQLite não
 * permite alterar um CHECK, então a tabela é recriada (receita oficial: criar
 * a nova, copiar, apagar a antiga e renomear, com as chaves estrangeiras
 * desligadas durante a troca).
 */
function atualizarTabelaUsuarios() {
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'").get();
  if (sql.includes("'PROFESSOR'")) return;

  console.log('[db] Atualizando tabela de usuários (nova role PROFESSOR)...');
  const existentes = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);
  const copiar = ['id', 'nome', 'email', 'senha_hash', 'role', 'ativo', 'google_sub', 'criado_em']
    .filter((c) => existentes.includes(c))
    .join(', ');

  db.exec('PRAGMA foreign_keys = OFF'); // não pode ser alterado dentro de uma transação
  try {
    transacao(() => {
      db.exec(ddlUsuarios('usuarios_novo'));
      db.exec(`INSERT INTO usuarios_novo (${copiar}) SELECT ${copiar} FROM usuarios`);
      db.exec('DROP TABLE usuarios');
      db.exec('ALTER TABLE usuarios_novo RENAME TO usuarios');
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

atualizarTabelaUsuarios();

garantirColuna('usuarios', 'ativo', 'INTEGER NOT NULL DEFAULT 1');
garantirColuna('usuarios', 'google_sub', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_google_sub ON usuarios(google_sub)');

garantirColuna('planos', 'descricao', "TEXT NOT NULL DEFAULT ''");
garantirColuna('planos', 'ativo', 'INTEGER NOT NULL DEFAULT 1');

garantirColuna('produtos', 'descricao', "TEXT NOT NULL DEFAULT ''");
garantirColuna('produtos', 'imagem', "TEXT NOT NULL DEFAULT ''");

garantirColuna('pedidos', 'parcelas', 'INTEGER NOT NULL DEFAULT 1');
garantirColuna('pedidos', 'bandeira', 'TEXT');
garantirColuna('pedidos', 'cartao_final', 'TEXT');
garantirColuna('pedidos', 'codigo_pagamento', 'TEXT');
garantirColuna('pedidos', 'expira_em', 'TEXT');
garantirColuna('pedidos', 'pago_em', 'TEXT');
garantirColuna('pedidos', 'vencimento', 'TEXT');

// Texto que o Google Maps pesquisa para mostrar o mapa (endereço completo ou "lat,lng").
garantirColuna('academia', 'mapa_consulta', "TEXT NOT NULL DEFAULT 'Heliópolis, São Paulo - SP, Brasil'");

garantirColuna('agendamentos', 'aluno_id', 'INTEGER REFERENCES usuarios(id) ON DELETE SET NULL');
garantirColuna('agendamentos', 'professor_id', 'INTEGER REFERENCES professores(id) ON DELETE SET NULL');
garantirColuna('agendamentos', 'tipo_treino', "TEXT NOT NULL DEFAULT 'Musculação'");
garantirColuna('agendamentos', 'nivel', "TEXT NOT NULL DEFAULT 'Iniciante'");

/* ------------------------- CATÁLOGO DA LOJA --------------------------
   Fonte única dos produtos. É sincronizado a CADA start: o que já existe (pelo
   nome) é atualizado, o que falta é inserido. Seguro de repetir, e é assim que
   os produtos novos e as fotos chegam em bancos antigos.
------------------------------------------------------------------------ */

const CATALOGO = [
  ['Whey Protein Pulso 900g', 149.9, 'suplemento', 'Proteína do soro do leite, 25 g por dose. Sabor chocolate.', 'whey'],
  ['Creatina Monohidratada 300g', 89.9, 'suplemento', 'Creatina pura em pó, sem sabor. 100 doses de 3 g.', 'creatina'],
  ['BCAA 120 cápsulas', 69.9, 'suplemento', 'Aminoácidos de cadeia ramificada para a recuperação pós-treino.', 'bcaa'],
  ['Barra de Proteína (caixa com 12)', 59.9, 'suplemento', 'Barra com 15 g de proteína. Prática para levar na mochila.', 'barra'],
  ['Camiseta Dry-Fit Pulso', 79.9, 'vestuario', 'Tecido leve que seca rápido. Corte confortável para o treino.', 'camiseta'],
  ['Regata Treino Pulso', 69.9, 'vestuario', 'Regata cavada, ideal para musculação e dias quentes.', 'regata'],
  ['Shorts de Treino Pulso', 89.9, 'vestuario', 'Elástico firme e bolso lateral. Liberdade para agachar à vontade.', 'shorts'],
  ['Garrafa Térmica Pulso', 59.9, 'acessorio', 'Aço inox, 600 ml. Mantém a água gelada por até 12 horas.', 'garrafa'],
  ['Toalha de Treino Pulso', 39.9, 'acessorio', 'Microfibra de secagem rápida, 80 × 40 cm.', 'toalha'],
  ['Luva de Treino Pulso', 54.9, 'acessorio', 'Palma acolchoada e fecho em velcro. Mais pegada, menos calos.', 'luva'],
  ['Corda de Pular Pulso', 34.9, 'acessorio', 'Cabo de aço revestido com rolamento. Altura ajustável.', 'corda'],
  ['Kit 3 Faixas Elásticas', 44.9, 'acessorio', 'Três níveis de resistência para alongar e fortalecer.', 'faixas'],
  ['Shaker Pulso 600ml', 29.9, 'acessorio', 'Tampa rosqueável e mola misturadora. Livre de BPA.', 'shaker'],
  ['Bolsa Esportiva Pulso', 119.9, 'acessorio', 'Compartimento para tênis e bolso com zíper. Cabe tudo do dia.', 'bolsa'],
];

function sincronizarCatalogo() {
  const existe = db.prepare('SELECT id FROM produtos WHERE nome = ?');
  const inserir = db.prepare(
    'INSERT INTO produtos (nome, preco, categoria, descricao, imagem) VALUES (?, ?, ?, ?, ?)'
  );
  const atualizar = db.prepare(
    'UPDATE produtos SET preco = ?, categoria = ?, descricao = ?, imagem = ? WHERE id = ?'
  );

  for (const [nome, preco, categoria, descricao, slug] of CATALOGO) {
    const imagem = `img/produtos/${slug}.svg`;
    const atual = existe.get(nome);
    if (atual) atualizar.run(preco, categoria, descricao, imagem, atual.id);
    else inserir.run(nome, preco, categoria, descricao, imagem);
  }
}

/* ----------------------------- PROFESSORES ----------------------------
   Os cinco professores da academia. Cada um ganha um usuário (para logar) e,
   só quando é CRIADO agora, uma disponibilidade-padrão. Assim, se a recepção
   ou o próprio professor limpar a agenda depois, ela não "ressuscita".
------------------------------------------------------------------------ */

const PROFESSORES_PADRAO = [
  // nome, e-mail, especialidade, faixas de horas [início, fim) em dias úteis, faixas no sábado
  ['Marcos', 'marcos@pulso.com', 'Musculação', [[6, 11], [14, 18]], [[8, 13]]],
  ['Renata', 'renata@pulso.com', 'Funcional', [[7, 12], [16, 20]], [[8, 13]]],
  ['Diego', 'diego@pulso.com', 'Cardio', [[6, 9], [17, 21]], []],
  ['Ana Paula', 'anapaula@pulso.com', 'Alongamento', [[8, 12], [14, 17]], []],
  ['Bruno', 'bruno@pulso.com', 'Musculação', [[10, 13], [15, 20]], []],
];

function semearDisponibilidade(professorId, faixasUteis, faixasSabado) {
  const inserir = db.prepare('INSERT OR IGNORE INTO disponibilidades (professor_id, dia_semana, hora) VALUES (?, ?, ?)');
  const horas = ([ini, fim]) => Array.from({ length: fim - ini }, (_, i) => `${String(ini + i).padStart(2, '0')}:00`);
  for (let dia = 1; dia <= 5; dia++) faixasUteis.flatMap(horas).forEach((h) => inserir.run(professorId, dia, h));
  faixasSabado.flatMap(horas).forEach((h) => inserir.run(professorId, 6, h));
}

function sincronizarProfessores() {
  const senhaProfessor = bcrypt.hashSync('prof123', 10);

  for (const [nome, email, especialidade, uteis, sabado] of PROFESSORES_PADRAO) {
    let usuario = db.prepare('SELECT id, role FROM usuarios WHERE email = ?').get(email);
    if (!usuario) {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (?, ?, ?, 'PROFESSOR')")
        .run(nome, email, senhaProfessor);
      usuario = { id: Number(lastInsertRowid), role: 'PROFESSOR' };
    }
    if (usuario.role !== 'PROFESSOR') continue; // e-mail já usado por outra conta: não mexe

    if (!db.prepare('SELECT id FROM professores WHERE usuario_id = ?').get(usuario.id)) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO professores (usuario_id, especialidade) VALUES (?, ?)')
        .run(usuario.id, especialidade);
      semearDisponibilidade(Number(lastInsertRowid), uteis, sabado);
    }
  }
}

/** Liga agendamentos antigos (só com nomes em texto) aos cadastros de aluno e professor. */
function vincularAgendamentosAntigos() {
  db.exec(`
    UPDATE agendamentos SET professor_id = (
      SELECT p.id FROM professores p JOIN usuarios u ON u.id = p.usuario_id WHERE u.nome = agendamentos.professor
    ) WHERE professor_id IS NULL;

    UPDATE agendamentos SET aluno_id = (
      SELECT u.id FROM usuarios u WHERE u.nome = agendamentos.aluno_nome AND u.role = 'ALUNO'
    ) WHERE aluno_id IS NULL;
  `);
}

/* --------------------------- ÍNDICES DE REGRA --------------------------
   O banco também garante as regras (não só o código): um professor não
   pode ter duas aulas no mesmo horário, nem o aluno. Aulas canceladas não
   contam (índice parcial), então o horário volta a ficar livre.
------------------------------------------------------------------------ */

function criarIndicesDeAgenda() {
  const indices = [
    ['idx_agenda_professor_horario',
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_professor_horario ON agendamentos (professor_id, data, hora) WHERE status <> 'Cancelado' AND professor_id IS NOT NULL"],
    ['idx_agenda_aluno_horario',
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_aluno_horario ON agendamentos (aluno_id, data, hora) WHERE status <> 'Cancelado' AND aluno_id IS NOT NULL"],
    ['idx_cancelamento_pendente',
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_cancelamento_pendente ON solicitacoes_cancelamento (matricula_id) WHERE status = 'PENDENTE'"],
  ];
  for (const [nome, ddl] of indices) {
    try {
      db.exec(ddl);
    } catch (erro) {
      // Dados antigos já duplicados impedem o índice único. O código dos controllers
      // continua checando conflitos, então o sistema segue funcionando.
      console.warn(`[db] Índice ${nome} não criado (${erro.message}). Corrija os dados duplicados.`);
    }
  }
}

/* ------------------------------ ACADEMIA ------------------------------ */

function sincronizarAcademia() {
  db.prepare(
    `INSERT OR IGNORE INTO academia (id, endereco, email, telefone, horario_semana, horario_sabado, descricao)
     VALUES (1, ?, ?, ?, ?, ?, ?)`
  ).run(
    'Rua das Palmeiras, 245 — Heliópolis, São Paulo/SP',
    'contato@pulsoacademia.com.br',
    '(11) 4002-8922',
    'Segunda a sexta: 6h – 22h',
    'Sábado: 8h – 14h',
    'Academia de bairro, acolhedora e acessível. Projeto acadêmico de Fábrica de Software, inspirado no ODS 8 da ONU (trabalho decente e crescimento econômico).'
  );
}

/* ------------------------------ SEED ---------------------------------
   Dados de demonstração. Só roda se as tabelas estiverem vazias, então
   é seguro reiniciar o servidor várias vezes sem duplicar nada.
------------------------------------------------------------------------ */

const DESCRICAO_PLANOS = {
  'Plano Mensal': 'Acesso livre à academia por 1 mês. Ideal para experimentar.',
  'Plano Trimestral': 'Acesso livre por 3 meses com desconto. O favorito dos alunos.',
  'Plano Anual': 'Acesso livre por 12 meses com o melhor preço por mês.',
};

function seedSeNecessario() {
  const { total: totalUsuarios } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();

  if (totalUsuarios === 0) {
    console.log('[seed] Criando usuários de exemplo...');

    const inserirUsuario = db.prepare(
      'INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (?, ?, ?, ?)'
    );

    // Senhas de demonstração — troque/remova antes de usar em produção real.
    const senhaAdmin = bcrypt.hashSync('admin123', 10);
    const senhaAluno = bcrypt.hashSync('aluno123', 10);

    inserirUsuario.run('Recepção Pulso', 'admin@pulso.com', senhaAdmin, 'ADMIN');
    inserirUsuario.run('Camila Souza', 'camila@aluno.com', senhaAluno, 'ALUNO');
    inserirUsuario.run('João Pedro', 'joao@aluno.com', senhaAluno, 'ALUNO');
    inserirUsuario.run('Lucas Prado', 'lucas@aluno.com', senhaAluno, 'ALUNO'); // sem plano: demonstra a regra de agendamento
  }

  const { total: totalPlanos } = db.prepare('SELECT COUNT(*) AS total FROM planos').get();
  if (totalPlanos === 0) {
    console.log('[seed] Criando planos...');
    const inserirPlano = db.prepare('INSERT INTO planos (nome, preco, periodo) VALUES (?, ?, ?)');
    inserirPlano.run('Plano Mensal', 89.9, 'por mês');
    inserirPlano.run('Plano Trimestral', 239.7, 'por trimestre');
    inserirPlano.run('Plano Anual', 799.0, 'por ano');
  }
  // Descrição só é preenchida onde está vazia (não sobrescreve edição da recepção).
  for (const [nome, descricao] of Object.entries(DESCRICAO_PLANOS)) {
    db.prepare("UPDATE planos SET descricao = ? WHERE nome = ? AND descricao = ''").run(descricao, nome);
  }

  sincronizarCatalogo();
  sincronizarProfessores();
  sincronizarAcademia();

  const { total: totalMatriculas } = db.prepare('SELECT COUNT(*) AS total FROM matriculas').get();
  if (totalMatriculas === 0) {
    console.log('[seed] Criando matrículas de exemplo...');
    const hoje = hojeISO();
    const idDe = (email) => db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)?.id;
    const inserirMatricula = db.prepare(
      'INSERT INTO matriculas (usuario_id, plano_id, data_vencimento, status) VALUES (?, ?, ?, ?)'
    );
    // Camila: trimestral em dia (consegue agendar). João: mensal que vence HOJE
    // (alimenta o KPI "Vencimentos hoje" do admin). Lucas: sem plano.
    if (idDe('camila@aluno.com')) inserirMatricula.run(idDe('camila@aluno.com'), 2, somarMeses(hoje, 2), 'ATIVO');
    if (idDe('joao@aluno.com')) inserirMatricula.run(idDe('joao@aluno.com'), 1, hoje, 'ATIVO');
  }

  const { total: totalAgendamentos } = db.prepare('SELECT COUNT(*) AS total FROM agendamentos').get();
  if (totalAgendamentos === 0) {
    console.log('[seed] Criando agendamentos de hoje e de amanhã...');
    const hoje = hojeISO();
    const amanha = somarDias(hoje, 1);
    const prof = (nome) =>
      db.prepare('SELECT p.id FROM professores p JOIN usuarios u ON u.id = p.usuario_id WHERE u.nome = ?').get(nome)?.id ?? null;
    const aluno = (email) => db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)?.id ?? null;
    const inserir = db.prepare(
      `INSERT INTO agendamentos (aluno_id, professor_id, aluno_nome, professor, tipo_treino, nivel, data, hora, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    inserir.run(aluno('camila@aluno.com'), prof('Marcos'), 'Camila Souza', 'Marcos', 'Musculação', 'Intermediário', hoje, '08:00', 'Confirmado');
    inserir.run(aluno('joao@aluno.com'), prof('Renata'), 'João Pedro', 'Renata', 'Funcional', 'Iniciante', hoje, '09:00', 'Em andamento');
    inserir.run(null, prof('Diego'), 'Fernanda Lima', 'Diego', 'Cardio', 'Iniciante', hoje, '18:00', 'Confirmado'); // aluna sem conta (balcão)
    inserir.run(aluno('camila@aluno.com'), prof('Ana Paula'), 'Camila Souza', 'Ana Paula', 'Alongamento', 'Iniciante', amanha, '09:00', 'Confirmado');
  }

  const { total: totalAvisos } = db.prepare('SELECT COUNT(*) AS total FROM avisos').get();
  if (totalAvisos === 0) {
    console.log('[seed] Criando aviso de boas-vindas...');
    db.prepare('INSERT INTO avisos (texto) VALUES (?)').run(
      'Bem-vindo(a) à Pulso Academia! Fique de olho nesta página para avisos sobre horários e manutenções.'
    );
  }
}

// O seed cuida também de sincronizar catálogo, professores e academia — inclusive
// em bancos antigos (a ordem importa: usuários de demonstração ANTES dos professores).
seedSeNecessario();
vincularAgendamentosAntigos();
criarIndicesDeAgenda();

console.log(`[db] SQLite pronto em: ${DB_PATH}`);
