# Muve

Aplicativo que conecta **músicos** a **contratantes** de eventos. O contratante publica um evento, músicos da região e do estilo se inscrevem (aceitando o cachê ou propondo outro valor) e as partes conversam pelo app. O contratante aprova um deles pagando via Pix o cachê mais a taxa de serviço de 10%. O valor fica retido até o show acontecer; então o cachê é repassado ao músico e os dois se avaliam.

Projeto de TCC. O produto, as regras completas e o que mudou em relação à monografia estão em [docs/produto.md](docs/produto.md); as decisões técnicas, em [docs/arquitetura.md](docs/arquitetura.md); as especificações de origem, em [docs/especificacao/](docs/especificacao/).

## Visão geral

| Parte | Tecnologia | Pasta |
|---|---|---|
| App (celular e navegador) | React Native com Expo | `mobile/` |
| API REST | Node.js, Hono, Zod | `backend/` |
| Código compartilhado | TypeScript | `shared/` |
| Banco, login e arquivos | Supabase (Postgres com RLS, Auth, Storage) | `supabase/` |
| Pagamentos | Asaas (Pix, ambiente sandbox) | integrado pela API |

## Como rodar

Requisitos: Node.js 22.18 ou superior, pnpm (`npm i -g pnpm`) e, para o celular, o app **Expo Go**.

```bash
pnpm install
cd mobile && npm install
```

1. Copie `backend/.env.example` para `backend/.env` e preencha as chaves do Supabase e da Asaas. A chave `SUPABASE_SERVICE_ROLE_KEY` só existe neste arquivo.
2. Copie `mobile/.env.example` para `mobile/.env` e preencha a URL e a chave pública do Supabase. Para usar no celular, `EXPO_PUBLIC_API_URL` deve apontar para o IP do computador que roda a API, na mesma rede Wi-Fi.
3. Suba a API e o app, cada um em um terminal:

```bash
pnpm dev:api
```

```bash
pnpm dev:app
```

Leia o QR Code com o Expo Go. No terminal do Expo, a tecla `w` abre o app no navegador em `http://localhost:8081`. A API fica em `http://localhost:3333/api`.

Os Termos de Uso ficam em `mobile/app/terms.tsx`; ao mudar as regras, atualize o texto e `TERMOS_VERSAO` em `shared/dominio.ts`.

Contas de demonstração (senha `teste123`): `teste@teste.com` (músico) e `contratante@teste.com` (contratante). O script `node scripts/contas-demo.mjs` recria as duas do zero, com fotos do Unsplash (uso livre).

### Banco

As migrations já estão aplicadas no projeto do grupo. Em um projeto novo, ou quando houver migration nova:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev:api` | API com recarga automática |
| `pnpm dev:app` | App Expo (celular e navegador) |
| `pnpm start:api` | API em modo produção |
| `pnpm typecheck` | Tipos da API, do código compartilhado e do app |
| `pnpm lint` | ESLint |
| `pnpm test` | Testes de regras e da API (Vitest) |
| `pnpm test:db` | Testes do banco (pgTAP) no projeto vinculado, sem deixar dados |
| `pnpm test:e2e` | Fluxo completo contra a API local e o Supabase real |

## Configuração externa

**Supabase:** veja abaixo os redirecionamentos e o SMTP.

**Asaas (sandbox):** a conta precisa de uma chave Pix cadastrada para gerar QR Code. Preencha `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` em `backend/.env`. O webhook (`/api/webhooks/asaas`) só funciona com a API publicada na internet, mas não é obrigatório: a tela de pagamento consulta a Asaas a cada poucos segundos. Para confirmar um pagamento de teste, abra a cobrança no painel do sandbox e use *Confirmar pagamento*.

No repasse ao músico, o sandbox só aceita as [chaves Pix fictícias do Banco Central](https://docs.asaas.com/docs/testando-transferências), como `cliente-a00001@pix.bcb.gov.br`, que a conta de demonstração já usa. Transferências feitas pela API ficam aguardando autorização no painel da Asaas (*Transferências*), a menos que essa exigência seja desativada nas configurações de segurança da conta. Sem webhook, o app consulta a situação da transferência sempre que o comprovante é aberto.

**Publicação da API (opcional, mas libera o webhook da Asaas e o uso fora do Wi-Fi de casa):**

1. No [Render](https://render.com), crie um *Web Service* ligado a este repositório, com build `npm i -g pnpm && pnpm install` e start `pnpm start:api`.
2. Copie as variáveis de `backend/.env` para o painel do serviço e defina `ALLOWED_ORIGINS` com o endereço onde o app web vai rodar.
3. No app, aponte `EXPO_PUBLIC_API_URL` para `https://SEU-SERVICO.onrender.com/api`.
4. Na Asaas, em *Integrações → Webhooks*, cadastre `https://SEU-SERVICO.onrender.com/api/webhooks/asaas` com o mesmo `ASAAS_WEBHOOK_TOKEN`.

Atrás de proxy, preencha `TRUSTED_PROXY_IPS`. Railway ou qualquer serviço Node funciona do mesmo jeito.

**E-mail:** o envio padrão do Supabase serve só para testes (poucos e-mails por hora). Para a confirmação de cadastro e a recuperação de senha chegarem a qualquer pessoa, configure um SMTP (por exemplo, Resend ou Brevo) em *Authentication → Emails*, e use os mesmos dados em `SMTP_*` no `backend/.env` para os avisos da API.

**Links de confirmação e senha:** em *Authentication → URL Configuration*, inclua `http://localhost:8081/**`, `exp://**` e `muve://**` (e o endereço do app publicado, se houver).

## Estrutura

```text
mobile/
  app/           telas por rota: (auth), (app) com abas, event/, account/
  components/    blocos de interface e formulários
  lib/           cliente, tema e sessão
backend/src/
  http/          rotas, autenticação, CORS e limite de tentativas
  services/      regras de negócio
  adapters/      Supabase, Asaas e e-mail
  domain/        validação de entrada e tipos
shared/
  dominio.ts     regras usadas pelo app e pela API
  client/        acesso à API e ao banco, sessão e formatação
supabase/
  migrations/    schema, RLS, funções e buckets
  tests/         testes pgTAP
scripts/         testes de banco, ponta a ponta e contas de demonstração
docs/            arquitetura e especificação
```
