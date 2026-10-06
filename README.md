# Muve

Plataforma que conecta **músicos** a **contratantes** de eventos: o contratante publica um evento, músicos da mesma cidade e estilo se candidatam, o contratante aprova um candidato pagando via Pix o cachê mais a taxa de serviço de 10%, o valor fica retido e, depois que as duas partes confirmam o show, o cachê é repassado por Pix ao músico e os dois se avaliam.

Projeto de TCC. A arquitetura e as decisões técnicas estão em [docs/arquitetura.md](docs/arquitetura.md); as regras de negócio originais, em [docs/especificacao/](docs/especificacao/).

## Visão geral

| Parte | Tecnologia | Pasta |
|---|---|---|
| Frontend web | React 19, Vite, TypeScript | `src/` |
| App mobile | React Native (Expo) | `mobile/` |
| Backend (API REST) | Node.js, Hono, Zod | `backend/` |
| Código compartilhado (regras, serviços, sessão) | TypeScript puro + React | `shared/` |
| Banco, autenticação e arquivos | Supabase (Postgres + RLS, Auth, Storage) | `supabase/` |
| Pagamentos | Asaas (Pix) | integrado pelo backend |

## Como rodar

Requisitos: Node.js 22.18 ou superior e pnpm (`npm i -g pnpm`).

```bash
pnpm install
```

1. **Frontend:** copie `.env.example` para `.env.local` e preencha a URL e a chave pública do Supabase.
2. **Backend:** copie `backend/.env.example` para `backend/.env` e preencha as chaves do Supabase e da Asaas.
3. **Banco:** aplique as migrations no projeto Supabase (uma vez, e a cada nova migration):

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

4. Suba os dois servidores, cada um em um terminal:

```bash
pnpm dev:api
```

```bash
pnpm dev
```

O frontend abre em `http://localhost:8443` e a API em `http://localhost:3333/api`.

### App mobile (Expo)

O app usa o mesmo backend e o mesmo código de serviços da web. Para rodar no celular:

1. Instale o **Expo Go** no celular (Play Store / App Store).
2. Copie `mobile/.env.example` para `mobile/.env`. Em `EXPO_PUBLIC_API_URL`, use o IP da máquina que roda a API (no celular, `localhost` é o próprio celular), com o celular na mesma rede Wi-Fi.
3. Instale e inicie:

```bash
cd mobile && npm install && npx expo start
```

4. Leia o QR Code com o Expo Go. Para testar no navegador, `npx expo start --web` abre o app em `http://localhost:8081` (origem já autorizada no CORS da API).

Os links de confirmação de e-mail e de redefinição de senha abrem o app pelo esquema `muve://auth`, que precisa constar na lista de redirecionamento do Supabase e em `ALLOWED_REDIRECTS` do backend.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Frontend em modo desenvolvimento |
| `pnpm dev:api` | API com recarga automática |
| `pnpm start:api` | API em modo produção |
| `pnpm build` | Build do frontend em `dist/` |
| `pnpm typecheck` | Verificação de tipos (frontend, backend e shared) |
| `pnpm lint` | ESLint |
| `pnpm test` | Testes unitários e de API (Vitest) |
| `pnpm test:db` | Testes de banco (pgTAP) no projeto Supabase vinculado; não deixam dados |
| `pnpm test:e2e` | Fluxo completo contra a API local e o Supabase real, com contas temporárias |

Os avisos por e-mail (contratação confirmada, desistência, não comparecimento) usam as variáveis `SMTP_*` de `backend/.env.example`; sem elas, aparecem apenas no log do servidor.

## Configuração externa

Estes itens não ficam no repositório e precisam ser feitos uma vez por ambiente.

**Supabase**

- *Authentication → URL Configuration:* URL do site e URLs de redirecionamento do frontend (em desenvolvimento, `http://localhost:8443`).
- *Authentication → Emails → SMTP Settings:* um provedor de e-mail próprio. O envio padrão do Supabase só entrega para membros da organização e tem limite de poucas mensagens por hora; como o cadastro exige confirmação de e-mail, sem SMTP os usuários não conseguem ativar a conta.

**Asaas**

- Crie uma conta sandbox, gere a chave de API e cadastre uma chave Pix na conta (sem ela o QR Code gerado só vale até o fim do dia).
- Em *Integrações → Webhooks*, aponte para `https://SEU-BACKEND/api/webhooks/asaas`, defina um token de autenticação e habilite os eventos de cobrança (recebida, confirmada, vencida, removida e estornada) e de transferência (concluída, falha e cancelada).
- Preencha `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` (o mesmo token do webhook) em `backend/.env`.
- **Repasses e estornos saem do saldo da conta.** Em *Configurações → Segurança*, desative a validação por token (SMS/app) para transferências feitas pela API, ou elas ficarão pendentes de aprovação manual. Mantenha saldo além do valor recebido: a Asaas não devolve as tarifas no estorno.
- Sem a chave configurada, o app funciona normalmente até o checkout, que responde com um erro controlado ("pagamentos não configurados"). A confirmação do pagamento também é conferida pela API a cada consulta da tela de checkout, então funciona mesmo sem o webhook alcançar o servidor.

**Hospedagem do backend**

- O webhook da Asaas precisa alcançar a API pela internet; em produção, hospede `backend/` em um serviço Node (Render, Railway etc.) com o comando `pnpm start:api` e as variáveis de `backend/.env.example`.
- Inclua a URL do frontend publicado em `ALLOWED_ORIGINS` e aponte `VITE_API_URL` para a URL da API.

## Estrutura

```text
src/                 frontend web
  auth/              sessão (Supabase Auth) e perfil autenticado
  screens/           telas, por área: auth, account, musician, contractor, shared
  services/          acesso à API (escritas) e ao banco (leituras via RLS)
  components/ hooks/ utils/
backend/src/         API Node.js
  http/              rotas, autenticação, CORS, limite de tentativas
  services/          regras de negócio (dependem apenas de interfaces)
  adapters/          Supabase e Asaas
  domain/            esquemas de validação e tipos
shared/              código usado por mais de um lado
  dominio.ts         regras (frontend, mobile e backend)
  client/            serviços de API, leituras do banco, sessão e utilidades (web e mobile)
mobile/              app React Native (Expo Router)
  app/               telas, por rota: (auth), (app) com abas, event/, account/
  components/        blocos de interface e campos compostos
  lib/               cliente Supabase, tema
supabase/
  migrations/        schema, RLS, funções e buckets
  tests/database/    testes pgTAP
docs/                arquitetura e especificações
```
