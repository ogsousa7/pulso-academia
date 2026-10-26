/**
 * server.js
 * ---------------------------------------------------------------------
 * Ponto de entrada da API da Pulso Academia.
 * Monta o Express, aplica middlewares globais, registra as rotas e
 * sobe o servidor HTTP.
 * --------------------------------------------------------------------- */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './src/db/index.js'; // garante schema + seed ANTES de aceitar requisições

import authRoutes from './src/routes/auth.routes.js';
import lojaRoutes from './src/routes/loja.routes.js';
import pedidosRoutes from './src/routes/pedidos.routes.js';
import alunoRoutes from './src/routes/aluno.routes.js';
import professorRoutes from './src/routes/professor.routes.js';
import adminRoutes from './src/routes/admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

const app = express();
const PORT = process.env.PORT || 3333;

// CORS_ORIGIN aceita uma lista separada por vírgula. Quando o frontend é
// aberto pelo próprio servidor (http://localhost:3333) o CORS nem é usado;
// a lista serve para quando o front roda em outra porta (ex.: Live Server).
const ORIGENS_PERMITIDAS = (process.env.CORS_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.disable('x-powered-by'); // não anuncia que é Express

/* ------------------------------ Middlewares globais -------------------- */

// Cabeçalhos de segurança básicos (sem a lib "helmet" para manter o MVP enxuto).
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors({ origin: ORIGENS_PERMITIDAS }));
app.use(express.json({ limit: '100kb' })); // payload pequeno — API simples, evita abuso

// Log básico de requisições (suficiente para um MVP escolar; em produção
// real, trocar por uma lib como "morgan" ou um logger estruturado).
app.use((req, res, next) => {
  const agora = new Date().toISOString();
  console.log(`[${agora}] ${req.method} ${req.originalUrl}`);
  next();
});

/* --------------------------------- Rotas -------------------------------- */

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', servico: 'pulso-academia-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api', lojaRoutes);       // GET /api/planos, /api/produtos, /api/avisos
app.use('/api', pedidosRoutes);    // checkout e histórico de pedidos (usuário logado)
app.use('/api/aluno', alunoRoutes);         // agendamento e plano do aluno (role ALUNO)
app.use('/api/professor', professorRoutes); // agenda e disponibilidade (role PROFESSOR)
app.use('/api/admin', adminRoutes); // tudo da recepção: JWT + role ADMIN em todas as rotas

/* ---------------------------- Frontend estático -------------------------
   O mesmo servidor entrega as páginas HTML/JS/CSS. Assim basta UM comando
   (npm start) e o front fala com a API na mesma origem — sem CORS.
--------------------------------------------------------------------------- */

app.use(express.static(FRONTEND_DIR));

/* ------------------------------ 404 padrão ------------------------------ */

// Rotas /api desconhecidas respondem JSON; o resto cai no 404 em texto simples.
app.use('/api', (req, res) => {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

app.use((req, res) => {
  res.status(404).send('Página não encontrada.');
});

/* --------------------------- Tratamento de erros ------------------------
   Middleware de erro do Express: qualquer "next(err)" ou exceção síncrona
   dentro de uma rota cai aqui. Mantém o formato de resposta consistente
   e evita vazar stack trace para o cliente.
--------------------------------------------------------------------------- */

app.use((err, req, res, next) => {
  console.error('[erro não tratado]', err);

  // Corpo JSON malformado enviado pelo cliente → erro do cliente, não do servidor.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
  }

  res.status(err.status || 500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`\n🔥 Pulso Academia rodando em http://localhost:${PORT}`);
  console.log(`   Site:  http://localhost:${PORT}/index.html`);
  console.log(`   API:   http://localhost:${PORT}/api/health\n`);
});
