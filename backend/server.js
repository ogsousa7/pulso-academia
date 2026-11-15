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
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import './src/db/index.js'; // garante schema + seed ANTES de aceitar requisições

import authRoutes from './src/routes/auth.routes.js';
import lojaRoutes from './src/routes/loja.routes.js';
import pedidosRoutes from './src/routes/pedidos.routes.js';
import alunoRoutes from './src/routes/aluno.routes.js';
import professorRoutes from './src/routes/professor.routes.js';
import adminRoutes from './src/routes/admin.routes.js';
import treinoRoutes from './src/routes/treino.routes.js';
import aulaExperimentalRoutes from './src/routes/aulaExperimental.routes.js';

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

// No Render o site fica atrás de um proxy: sem isto, todos os visitantes pareceriam o mesmo
// IP e os limites de tentativas (login, treinos) valeriam para o site inteiro.
if (process.env.RENDER) app.set('trust proxy', 1);

/* ------------------------------ Middlewares globais -------------------- */

// Cabeçalhos de segurança básicos (sem a lib "helmet" para manter o MVP enxuto).
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // No Render o site é sempre HTTPS: o navegador passa a recusar a versão sem cadeado.
  if (process.env.RENDER) res.set('Strict-Transport-Security', 'max-age=15552000');
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
app.use('/api/treino', treinoRoutes); // montador de treinos (público, com limite de usos)
app.use('/api/aula-experimental', aulaExperimentalRoutes); // pedido de aula grátis (público, com limite)

/* ---------------------------- Frontend estático -------------------------
   O mesmo servidor entrega as páginas HTML/JS/CSS. Assim basta UM comando
   (npm start) e o front fala com a API na mesma origem — sem CORS.
--------------------------------------------------------------------------- */

/* Cache com versão:
   - As páginas HTML saem com "?v=<versão>" em cada CSS/JS. A versão muda a cada deploy (é o commit
     que o Render informa em RENDER_GIT_COMMIT), então CSS/JS com ?v= podem ficar 1 ano no navegador:
     quando o código muda, o endereço muda junto.
   - HTML: no-cache (o navegador sempre confere se há versão nova).
   - Fotos e fontes: 30 dias (ao trocar uma foto, use um nome novo). */
const VERSAO_ARQUIVOS = (process.env.RENDER_GIT_COMMIT || Date.now().toString(36)).slice(0, 10);
const htmlEmCache = new Map(); // no Render o HTML só muda no próximo deploy: lê cada página uma vez

function htmlComVersao(arquivo) {
  if (process.env.RENDER && htmlEmCache.has(arquivo)) return htmlEmCache.get(arquivo);
  const caminho = path.join(FRONTEND_DIR, arquivo);
  if (!fs.existsSync(caminho)) return null;
  const html = fs.readFileSync(caminho, 'utf8')
    .replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=")((?:css|js)\/[^"?#]+\.(?:css|js))"/g, `$1$2?v=${VERSAO_ARQUIVOS}"`);
  if (process.env.RENDER) htmlEmCache.set(arquivo, html);
  return html;
}

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const arquivo = req.path === '/' ? 'index.html' : req.path.slice(1);
  if (!/^[\w-]+\.html$/.test(arquivo)) return next(); // só páginas da raiz (nada de ../)
  const html = htmlComVersao(arquivo);
  if (html === null) return next();
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

app.use(express.static(FRONTEND_DIR, {
  setHeaders(res, caminho) {
    if (/[\\/](css|js)[\\/]/.test(caminho)) {
      res.set('Cache-Control', res.req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
    } else if (/[\\/](img|fonts)[\\/]/.test(caminho)) {
      res.set('Cache-Control', 'public, max-age=2592000');
    } else {
      res.set('Cache-Control', 'no-cache'); // sw.js, manifest.json, robots.txt...
    }
  },
}));

/* ------------------------------ 404 padrão ------------------------------ */

// Rotas /api desconhecidas respondem JSON; o resto cai na página 404 do site.
app.use('/api', (req, res) => {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(FRONTEND_DIR, '404.html'));
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
