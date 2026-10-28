# Pulso Academia — Sistema Full-Stack

Site, loja, pagamento e painel administrativo de uma academia de bairro.
**Node.js + Express 5 · SQLite · JWT · Tailwind (CDN) · JavaScript puro.**

Um único comando (`npm start`) sobe a API **e** o site na mesma porta.

**Site no ar:** https://pulso-academia.onrender.com (Render; cada `git push` publica a versão nova)

Desenvolvido por [True Ember](https://true-ember-site.netlify.app).

---

## 1. Pré-requisitos

- **Node.js 22.13 ou superior** (LTS). Confira com `node -v`. Baixe em https://nodejs.org
  - O projeto usa o módulo nativo `node:sqlite`, então não é preciso instalar banco nenhum.
- Um editor (VS Code) e um terminal.

## 2. Instalação passo a passo

```bash
# 1) Entre na pasta do backend
cd backend

# 2) Instale as dependências (rode de novo sempre que receber uma versão nova do projeto)
npm install

# 3) Crie seu arquivo de configuração
cp .env.example .env            # Windows (PowerShell): copy .env.example .env

# 4) Gere um segredo forte para assinar os JWTs
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#    Copie o resultado e cole em JWT_SECRET=... dentro do arquivo .env

# 5) Suba o sistema
npm start
```

Abra **http://localhost:3333/index.html**.

> O servidor **recusa iniciar** se `JWT_SECRET` estiver vazio ou com o valor de exemplo. É proposital: um segredo fraco permite forjar tokens de administrador.

> O arquivo `.env` começa com ponto e pode ficar escondido no Explorador de Arquivos. No VS Code ele aparece normalmente na barra lateral.

## 3. Contas de demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Recepção (ADMIN) | admin@pulso.com | admin123 |
| Aluno | camila@aluno.com | aluno123 |
| Aluno | joao@aluno.com | aluno123 |
| Aluno sem plano (não consegue agendar) | lucas@aluno.com | aluno123 |
| Professores (PROFESSOR) | marcos@, renata@, diego@, anapaula@, bruno@ `pulso.com` | prof123 |

Na tela de login, as contas de demonstração ficam num quadro: um toque preenche e-mail e senha.

**Troque essas senhas antes de qualquer uso real.** Contas criadas pelo site (ou pelo Google) são sempre `ALUNO`; a role nunca vem do navegador.

Para recriar o banco do zero: `npm run db:reset` (e depois `npm start`). Bancos de versões anteriores são atualizados sozinhos, sem precisar disso.

## 4. Páginas

| Página | Acesso | O que faz |
|---|---|---|
| `index.html` | público | Home, avisos, **mapa "Onde estamos"** e contato |
| `loja.html` | público | 3 planos e 14 produtos com foto, filtro por categoria, carrinho e **mapa de retirada** |
| `checkout.html` | logado | Pagamento por cartão, Pix ou boleto (simulado) e confirmação |
| `login.html` | público | Entrar, criar conta e **entrar com Google** |
| `aluno.html` | só ALUNO | **Agendar aula** (tipo, nível, professor, data, horário livre), **minhas aulas** (cancelar com 2 h de antecedência), **meu plano** (e pedido de cancelamento) e meus pedidos |
| `professor.html` | só PROFESSOR | **Minha agenda** (só as próprias aulas) e **meus horários** (disponibilidade por dia da semana) |
| `admin.html` | só ADMIN | Abas: visão geral, agendamentos, **planos, alunos e professores (cadastros)**, solicitações de cancelamento, pagamentos (filtros) e informações da academia |

Depois do login cada perfil cai na própria página (aluno → `aluno.html`, professor → `professor.html`, recepção → `admin.html`).

**PWA:** o site é instalável no celular (menu do navegador → *Adicionar à tela inicial*). Tem `manifest.json`, ícones, favicon, service worker (`sw.js`) e `offline.html`. O service worker guarda só HTML/CSS/JS/imagens; **nunca** respostas da API. Ao publicar uma versão nova, aumente `VERSAO` em `sw.js`. Em desenvolvimento, se o navegador mostrar arquivo antigo, use *Ctrl+Shift+R* ou limpe os dados do site.

**Visual:** estilo Apple. Fonte do sistema (SF Pro no iPhone/Mac) com Inter como reserva, servida da pasta `frontend/fonts` (funciona offline e não depende do Google Fonts). As cores e a fonte do Tailwind ficam num lugar só, `frontend/js/tw-config.js`; os componentes repetidos (barra translúcida, campos, abas segmentadas, barra de abas do app no celular, listas agrupadas) ficam em `frontend/css/style.css`. No celular, as áreas do aluno e do professor têm barra de abas embaixo, como um app.

**Loja:** fotos reais dos produtos (Unsplash, licença livre, recortadas com fundo transparente para todas terem o mesmo visual, em `frontend/img/produtos/fotos`, créditos em `CREDITOS.txt`); se uma foto faltar, aparece a ilustração `.svg`. Tocar no produto abre a tela de detalhes (foto grande, descrição, características, quantidade). A lista de características fica no `CATALOGO` de `backend/src/db/index.js`.

**Pagamento:** etapas da compra, seus dados, como você recebe (retirada e/ou ativação do plano), formas de pagamento com prévia do cartão, cupom de desconto e comprovante para imprimir. Cupons de teste: `PULSO10` (10%) e `BEMVINDO20` (R$ 20 a partir de R$ 100); para criar outros, edite `CUPONS` em `backend/src/constants.js`.

**Acessibilidade (para todos):**
- **Modo claro e escuro:** botão de acessibilidade no topo, com as opções Automático (segue o celular/computador), Claro e Escuro. A escolha fica salva no navegador. As cores são variáveis CSS (`css/style.css`), e o Tailwind usa essas variáveis (`js/tw-config.js`): o mesmo HTML funciona nos dois temas.
- **Contraste reforçado:** textos secundários com a cor cheia, bordas mais visíveis e links sublinhados, para quem tem baixa visão.
- **Ouvir esta página:** o navegador lê o conteúdo em voz alta, em português (Web Speech API, sem custo).
- **Libras:** o widget gratuito do VLibras (Governo Federal) aparece na lateral de todas as páginas.
- **Leitores de tela e teclado:** link "Pular para o conteúdo" (primeiro Tab), regiões `header`/`main`/`nav`, rótulos em todos os campos e botões de ícone, avisos falados (`aria-live`), janelas nativas (`<dialog>`) que o Esc fecha, foco visível e respeito a "reduzir movimento".
- **Auditoria:** todas as páginas e estados (janelas, carrinho, abas, formulários), nos dois temas, passam sem erros na verificação automática **axe-core** (regras WCAG 2.1 nível AA, incluindo contraste mínimo de 4,5:1).

O **carrinho** (ícone no topo) guarda os itens no navegador. Para pagar é preciso estar logado: se não estiver, o login devolve você ao checkout. O botão **Sair** aparece no topo quando há sessão.

## 5. Pagamento (simulado, mas com o fluxo de um real)

| Forma | O que acontece |
|---|---|
| **Cartão** | O navegador valida número (algoritmo de Luhn), validade, CVV e nome, e deixa escolher as parcelas (sem juros, mínimo R$ 20 por parcela). Aprovação imediata. |
| **Pix** | Pedido fica **PENDENTE** por 15 min, com QR Code, código "copia e cola" e contagem regressiva. |
| **Boleto** | Pedido fica **PENDENTE** por 3 dias, com código de barras, linha digitável e botão de imprimir. |

Cartões de teste (link "preencher cartão de teste aprovado" na tela): `4242 4242 4242 4242` aprova; `4000 0000 0000 0002` mostra "Pagamento recusado".

Como não há banco de verdade, o botão **Simular pagamento** faz o papel do aviso do banco (rota `POST /api/pedidos/:id/pagar`). Em produção essa confirmação viria de um *webhook* do gateway, nunca de um botão do aluno: por isso a rota só existe com `PAGAMENTO_SIMULADO=true` no `.env`.

Garantias do servidor:
- Preços e totais são **sempre recalculados a partir do banco**; o navegador só diz *o que* comprar.
- O **número do cartão e o CVV nunca saem do navegador**. O servidor recebe só bandeira, 4 últimos dígitos e parcelas.
- Os códigos de Pix e boleto são de demonstração e **não são válidos em nenhum banco** (de propósito).
- Pedido, itens e matrícula são gravados numa transação (tudo ou nada). Pagar um plano ativa a matrícula; se o aluno já tem plano, o novo período soma ao vencimento atual.

## 6. Login com Google (opcional)

Sem configurar nada o site funciona e o botão do Google simplesmente não aparece. Para ligar:

1. Acesse https://console.cloud.google.com e crie um projeto (ex.: "Pulso Academia").
2. Em **APIs e serviços → Tela de permissão OAuth**, escolha o tipo **Externo**, preencha nome do app e e-mail de suporte. Enquanto o app estiver em modo "Teste", adicione seu e-mail em **Usuários de teste**.
3. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**, escolha **Aplicativo da Web** e em **Origens JavaScript autorizadas** coloque `http://localhost:3333`. (Não precisa de URI de redirecionamento nem de "segredo do cliente".)
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) para o `.env`:
   ```
   GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
   ```
5. Reinicie o servidor. O botão "Continuar com o Google" aparece em `login.html`.

Como funciona e por que é seguro: o botão devolve um *ID token* assinado pelo Google; o **servidor** confere assinatura, público (seu Client ID), emissor e validade com a biblioteca oficial `google-auth-library`. Só então o e-mail é aceito, e apenas se estiver verificado.
- Primeiro acesso cria um **ALUNO**; se já existe um aluno com esse e-mail, a conta é vinculada.
- **Recepção e professores nunca entram por Google**, só com e-mail e senha. Assim ninguém assume `admin@pulso.com` por controlar esse e-mail em outro domínio Google.

> A janela de login do Google só funciona de uma origem cadastrada no passo 3. Se publicar o site, adicione também o endereço real.

## 7. Mapa do Google (opcional)

O endereço, o telefone, os horários e a localização no mapa ficam no banco (tabela `academia`) e são editados no painel da recepção, em **Informações da academia**. O site inteiro (rodapé, "Onde estamos" e "Retire na academia") acompanha o que for salvo ali.

- **Sem chave:** o site usa o mapa incorporado simples do Google, que já funciona.
- **Com chave (API oficial):**
  1. No mesmo projeto do Google Cloud, em **APIs e serviços → Biblioteca**, ative a **Maps Embed API**.
  2. Em **Credenciais → Criar credenciais → Chave de API**, restrinja a chave: *Restrições de aplicativo* = **Sites (referenciadores HTTP)** com `http://localhost:3333/*`, e *Restrição de API* = **Maps Embed API**.
  3. Cole no `.env`: `GOOGLE_MAPS_API_KEY=sua-chave` e reinicie.

  A Maps Embed API é [gratuita e sem limite de uso](https://developers.google.com/maps/documentation/embed/usage-and-billing). Se o Google pedir para ativar o faturamento do projeto e você não quiser, deixe a variável vazia: o mapa continua funcionando sem chave.

A chave da Embed API é pública por natureza (vai para o navegador); a proteção é a restrição por site. **Nunca** coloque aqui chaves de outras APIs do Google.

> O endereço de exemplo ("Rua das Palmeiras, 245") é fictício. Em **Informações da academia**, troque o campo **Localização no mapa** por um endereço real (ou coordenadas, ex.: `-23.5958,-46.6061`) para o pino cair no lugar certo.

## 8. Estrutura de pastas

```
pulso-fullstack/
├── backend/
│   ├── server.js                # Express: segurança, estáticos, rotas, erros
│   ├── .env.example             # modelo de configuração
│   ├── scripts/reset-db.js      # apaga o banco local
│   └── src/
│       ├── constants.js         # listas e regras de negócio num só lugar
│       ├── db/index.js          # schema, migrações e seed (idempotentes)
│       ├── middleware/          # auth.js (JWT, role) · rateLimit.js
│       ├── routes/              # auth · loja · pedidos · aluno · professor · admin
│       ├── controllers/         # regra de cada endpoint
│       ├── services/            # google.js · matriculas.js · agenda.js (horários livres)
│       └── utils.js             # datas locais, validações
└── frontend/
    ├── *.html                   # 7 páginas (+ offline.html)
    ├── manifest.json · sw.js · favicon.ico   # PWA
    ├── fonts/                   # Inter (fonte local, licença OFL)
    ├── css/style.css
    ├── img/                     # logos, icons/ (PWA e favicon), produtos/ (fotos)
    └── js/                      # api.js (Auth + Api) · ui.js · cart.js · loja.js · checkout.js
                                 # tw-config.js (tema) · login.js · admin.js · admin-cadastros.js · aluno.js · professor.js · pwa.js · academia.js (dados da academia + mapa)
```

Fluxo de uma requisição: `rota → middleware (JWT/role) → controller → SQLite → JSON`.

## 9. Banco de dados

| Tabela | Para quê |
|---|---|
| `usuarios` | nome, e-mail único, senha (bcrypt), `role` (ALUNO, PROFESSOR, ADMIN), `google_sub` |
| `planos`, `produtos` | catálogo (produtos com descrição e imagem) |
| `pedidos`, `pedido_itens` | compras: método, status (PENDENTE/PAGO/EXPIRADO), nome e preço no momento da compra |
| `matriculas` | plano do aluno e vencimento |
| `agendamentos` | aula marcada (aluno, professor, tipo de treino, nível, data, hora) |
| `professores`, `disponibilidades` | professor ligado a um usuário e seus horários livres por dia da semana |
| `solicitacoes_cancelamento` | pedidos de cancelamento de plano (a recepção aprova ou recusa) |
| `avisos` | comunicados da recepção |
| `academia` | endereço, contato, horários, descrição e localização no mapa (linha única) |

O catálogo de produtos fica em `backend/src/db/index.js` (`CATALOGO`) e é sincronizado a cada `npm start`: para adicionar um produto, inclua uma linha ali e uma imagem em `frontend/img/produtos/`.

Senhas são guardadas com **bcrypt**. Todas as consultas usam parâmetros (`?`), o que evita SQL Injection.

## 10. API (contrato para as outras equipes)

Base: `http://localhost:3333/api`. Rotas protegidas pedem `Authorization: Bearer <token>` (o token vem do login). Erros sempre no formato `{ "erro": "mensagem" }`.

| Método | Rota | Acesso | Corpo / observações |
|---|---|---|---|
| GET | `/health` | público | |
| GET | `/auth/config` | público | `{ googleClientId }` (nulo se o Google estiver desligado) |
| POST | `/auth/login` | público, limitada | `{ email, senha }` → `{ token, usuario }` |
| POST | `/auth/register` | público, limitada | `{ nome, email, senha }` → cria ALUNO |
| POST | `/auth/google` | público, limitada | `{ credential }` (ID token do Google) |
| GET | `/auth/me` | logado | dados do usuário |
| GET | `/planos` · `/produtos` · `/avisos` | público | |
| GET | `/academia` | público | `{ academia, mapa: { consulta, chave } }` |
| GET | `/cupons/:codigo?subtotal=` | público | prévia do desconto (o servidor recalcula ao criar o pedido) |
| POST | `/pedidos` | logado | `{ itens:[{tipo,id,quantidade}], metodo, parcelas?, bandeira?, cartaoFinal?, cupom? }` |
| GET | `/pedidos/meus` | logado | histórico do usuário |
| GET | `/pedidos/:id` | dono ou ADMIN | acompanha Pix/boleto |
| POST | `/pedidos/:id/pagar` | dono | só com `PAGAMENTO_SIMULADO=true` |
| GET | `/admin/dashboard/kpis` | ADMIN | |
| GET | `/aluno/opcoes` | ALUNO | tipos, níveis, professores e plano ativo |
| GET | `/aluno/horarios?professorId=&data=` | ALUNO | horários livres (disponibilidade do professor menos aulas já marcadas) |
| GET / POST | `/aluno/agendamentos` | ALUNO | minhas aulas / agendar `{ professorId, tipoTreino, nivel, data, hora }` (exige plano ativo na data, máx. 30 dias à frente) |
| DELETE | `/aluno/agendamentos/:id` | ALUNO | cancela (mínimo 2 h antes; só aula própria) |
| GET | `/aluno/plano` | ALUNO | plano ativo e pedido de cancelamento |
| POST | `/aluno/plano/cancelamento` | ALUNO | `{ motivo }` → fica PENDENTE para a recepção |
| GET | `/professor/agenda?de=&ate=` | PROFESSOR | só as aulas do próprio professor |
| PATCH | `/professor/agendamentos/:id` | PROFESSOR | `{ status: "Em andamento" \| "Confirmado" }`: iniciar (ou desfazer) uma aula de hoje, só da própria agenda |
| GET / PUT | `/professor/disponibilidade` | PROFESSOR | lê / grava `{ dias: { "1": ["08:00", …], … } }`; recusa (409) remover horário com aula marcada |
| GET | `/admin/opcoes` | ADMIN | listas para os formulários |
| GET / POST | `/admin/agendamentos` | ADMIN | consulta geral (filtros) / marcar aula no balcão |
| PATCH | `/admin/agendamentos/:id` | ADMIN | `{ status }` |
| GET / POST / PUT | `/admin/planos` · `/admin/alunos` · `/admin/professores` (`PUT /:id`) | ADMIN | cadastros; plano e conta não são apagados, só desativados |
| GET | `/admin/solicitacoes` | ADMIN | pedidos de cancelamento de plano |
| POST | `/admin/solicitacoes/:id/resolver` | ADMIN | `{ decisao: "APROVADA"\|"RECUSADA", resposta? }` (aprovar encerra o plano e cancela aulas futuras) |
| POST | `/admin/avisos` | ADMIN | `{ texto }` |
| GET | `/admin/pedidos` | ADMIN | pedidos recentes |
| PUT | `/admin/academia` | ADMIN | edita endereço, contato, horários e mapa |

Códigos: `400` dado inválido · `401` sem token / inválido / expirado · `403` sem permissão · `404` não encontrado · `409` conflito (ex.: pedido já pago) · `429` muitas tentativas · `500` erro interno genérico (o detalhe fica só no log do servidor).

```bash
TOKEN=$(curl -s -X POST localhost:3333/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@pulso.com","senha":"admin123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl localhost:3333/api/admin/dashboard/kpis -H "Authorization: Bearer $TOKEN"
```

## 11. Casos de uso: o que já existe

| Caso de uso | Situação |
|---|---|
| UC01 Manter Acesso | Feito: login, cadastro, Google, perfis ALUNO/PROFESSOR/ADMIN, bloqueio por perfil e páginas por perfil |
| UC02 Informações da Academia | Feito (início, loja, mapa) |
| UC03 Carrinho de Compras | Feito |
| UC04 Realizar Pagamento | Feito (cartão, Pix, boleto; recusado e dados inválidos) |
| UC05 Manter Agendamento | Feito: agendar, consultar e cancelar (aluno); verifica plano ativo, horário livre e antecedência |
| UC06 Manter Plano do Aluno | Feito: consultar plano e solicitar cancelamento; a recepção aprova ou recusa |
| UC07 Manter Academia | Feito: academia, planos, alunos, professores, agendamentos, pagamentos e solicitações |
| UC08 Agenda do Professor | Feito: ver a própria agenda e configurar disponibilidade (com checagem de conflito) |

## 12. Decisões de segurança (e seus limites)

- **JWT em localStorage**: simples e didático, mas exposto a roubo se houver XSS. Por isso todo texto vindo do banco é escapado (`escapeHtml`) antes de ir para o HTML. Melhoria de produção: cookie `httpOnly` + `SameSite`.
- **O guard do front é só UX.** Quem protege os dados é a API (`authenticateToken` + `requireAdmin`).
- **Rate limit em memória**: zera ao reiniciar e não funciona com várias instâncias. Em produção, `express-rate-limit` com Redis.
- **Sem CSP**, porque o projeto usa Tailwind e fontes via CDN. Em produção, compilar o Tailwind e adicionar `helmet`.
- **CORS**: front e API ficam na mesma origem, então não é necessário. `CORS_ORIGIN` só serve se você abrir o front por outro servidor (ex.: Live Server na porta 5500).
- Datas "de hoje" usam o fuso local, não UTC.

## 13. Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| `JWT_SECRET ausente ou inseguro` | Faça o passo 4 da instalação |
| `Cannot find package 'google-auth-library'` (ou `qrcode`) | Rode `npm install` na pasta `backend` |
| `node:sqlite` não encontrado | Atualize o Node para ≥ 22.13 |
| `EADDRINUSE` | Porta 3333 ocupada: mude `PORT` no `.env` |
| Login cai sempre em "sessão expirada" | Token expirou (8h) ou `JWT_SECRET` mudou: entre de novo |
| 429 no login | Limite de 10 tentativas/15 min por IP; reinicie o servidor em desenvolvimento |
| Botão do Google não aparece | `GOOGLE_CLIENT_ID` vazio, ou servidor não reiniciado depois de editar o `.env` |
| Google: "origin_mismatch" | `http://localhost:3333` não está em *Origens JavaScript autorizadas* |
| Mapa em branco com chave | Chave restrita ao site errado, ou Maps Embed API não ativada. Apague a chave do `.env` para usar o mapa simples |
| Pino do mapa no lugar errado | Troque *Localização no mapa* no painel por um endereço real ou coordenadas |

## 14. Ideias de evolução

Notificações (push) de aula · gateway de pagamento real · testes automatizados (`node:test`) · migrar para Prisma/PostgreSQL.
