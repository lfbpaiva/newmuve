# Muve

Aplicativo que conecta **músicos** a **contratantes** de eventos. O contratante publica um evento, músicos da região e do estilo se inscrevem (aceitando o cachê ou propondo outro valor) e as partes conversam pelo app. O contratante aprova um deles pagando via Pix o cachê mais a taxa de serviço de 10%. O valor fica retido até o show acontecer; então o cachê é repassado ao músico e os dois se avaliam.

Projeto de TCC. O produto, as regras completas e o que mudou em relação à monografia estão em [docs/produto.md](docs/produto.md); as decisões técnicas, em [docs/arquitetura.md](docs/arquitetura.md); as especificações de origem, em [docs/especificacao/](docs/especificacao/). Para a apresentação, veja [docs/apresentacao.md](docs/apresentacao.md); para atualizar a monografia, [docs/monografia.md](docs/monografia.md). **Para dar continuidade ao projeto, comece por [docs/continuidade.md](docs/continuidade.md).**

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
2. Copie `mobile/.env.example` para `mobile/.env` e preencha a URL e a chave pública do Supabase. Em desenvolvimento, o app descobre sozinho o endereço da API, com celular e computador na mesma rede Wi-Fi; `EXPO_PUBLIC_API_URL` só é necessária para apontar para outro endereço.
3. Suba a API e o app, cada um em um terminal:

```bash
pnpm dev:api
```

```bash
pnpm dev:app
```

Leia o QR Code com o Expo Go. No terminal do Expo, a tecla `w` abre o app no navegador em `http://localhost:8081`. A API fica em `http://localhost:3333/api`.

Os Termos de Uso ficam em `mobile/app/terms.tsx`; ao mudar as regras, atualize o texto e `TERMOS_VERSAO` em `shared/dominio.ts`.

Contas de demonstração (senha `teste123`): `teste@teste.com` (músico) e `contratante@teste.com` (contratante). Para usar as duas no mesmo navegador, abra uma em `http://localhost:8081` e outra em `http://127.0.0.1:8081`. O script `node scripts/contas-demo.mjs` recria as duas do zero, com fotos do Unsplash (uso livre).

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

O GitHub Actions roda `typecheck`, `lint` e `test` a cada pull request e a cada push no `main`.

## Configuração externa

**Supabase:** veja abaixo os redirecionamentos e o SMTP.

**Asaas (sandbox):** a conta precisa de uma chave Pix cadastrada para gerar QR Code. Preencha `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` em `backend/.env`. O webhook (`/api/webhooks/asaas`) só funciona com a API publicada na internet, mas não é obrigatório: a tela de pagamento consulta a Asaas a cada poucos segundos. Para confirmar um pagamento de teste, abra a cobrança no painel do sandbox e use *Confirmar pagamento*.

No repasse ao músico, o sandbox só aceita as [chaves Pix fictícias do Banco Central](https://docs.asaas.com/docs/testando-transferências), como `cliente-a00001@pix.bcb.gov.br`, que a conta de demonstração já usa. A chave de API precisa da opção *Permitir que esta chave execute operações de saque via API*. Transferências feitas pela API ficam aguardando autorização por SMS no painel da Asaas (*Meu Dinheiro → Transferências → Enviar código*). Sem webhook, o app consulta a situação da transferência sempre que o comprovante é aberto.

**Publicação da API (opcional, mas libera o webhook da Asaas e o uso fora do Wi-Fi de casa):**

1. No [Render](https://render.com), crie um *Blueprint* ligado a este repositório: o arquivo `render.yaml` já define o serviço, o build e as variáveis.
2. Preencha no painel as variáveis marcadas como secretas, com os valores de `backend/.env`, e defina `ALLOWED_ORIGINS` com o endereço onde o app web vai rodar. Em produção a API não inicia se faltar a Asaas ou se a URL dela não corresponder a `ASAAS_ENV`.
3. No app, aponte `EXPO_PUBLIC_API_URL` para `https://SEU-SERVICO.onrender.com/api`.
4. Na Asaas, em *Integrações → Webhooks*, cadastre `https://SEU-SERVICO.onrender.com/api/webhooks/asaas` com o mesmo `ASAAS_WEBHOOK_TOKEN`.

Atrás de proxy, preencha `TRUSTED_PROXY_IPS`. Railway ou qualquer serviço Node funciona do mesmo jeito.

**E-mail:** o envio padrão do Supabase serve só para testes (poucos e-mails por hora). Para a confirmação de cadastro e a recuperação de senha chegarem a qualquer pessoa, configure um SMTP (por exemplo, Resend ou Brevo) em *Authentication → Emails*, e use os mesmos dados em `SMTP_*` no `backend/.env` para os avisos da API.

**Links de confirmação e senha:** em *Authentication → URL Configuration*, inclua `http://localhost:8081/**`, `exp://**` e `muve://**` (e o endereço do app publicado, se houver).

**Entrar com Google:**

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um *ID do cliente OAuth* do tipo *Aplicativo da Web*. Em *URIs de redirecionamento autorizados*, coloque `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
2. No Supabase, em *Authentication → Sign In / Providers → Google*, ative e cole o *Client ID* e o *Client Secret*.
3. Confira os redirecionamentos (`http://localhost:8081/**`, `exp://**`, `muve://**`) em *Authentication → URL Configuration*.

Sem isso, o botão "Continuar com Google" avisa que o login ainda não foi ativado.

**Notificações com o app fechado (push):** o Expo Go no Android não recebe push. Para testar:

1. `npm i -g eas-cli`, `eas login` e, na pasta `mobile`, `eas init` (grava o `projectId` no `app.json`).
2. `eas build --profile development --platform android` e instale o app gerado.
3. A API envia pelo serviço gratuito da Expo; não precisa de chave.

Dentro do app, as notificações já funcionam em tempo real sem nada disso.

**Rotina financeira:** a cada 5 minutos, enquanto a API está no ar, ela expira cobranças vencidas, confirma Pix cuja notificação se perdeu, acompanha estornos e repasses e conclui os shows com 7 dias passados, sem depender de alguém abrir o app. Não precisa de configuração nem de serviço de agendamento. Contestação aberta ou estorno em andamento seguram o repasse.

**Repasse sem resposta da Asaas:** se a Asaas não responder ao pedido de transferência, o repasse nunca é repetido às cegas. A rotina procura a transferência pela referência do pagamento. Se não encontrar, o repasse fica aguardando conferência:

```bash
node scripts/resolver-repasse.mjs
```

lista os casos. Depois de conferir o painel da Asaas, `node scripts/resolver-repasse.mjs <id>` vincula a transferência encontrada ou, se não houver nenhuma, envia de novo.

**Contestações:** defina `ADMIN_TOKEN` em `backend/.env` (um texto longo e aleatório). Com a API rodando:

```bash
node scripts/resolver-contestacao.mjs
```

lista as contestações abertas, e `node scripts/resolver-contestacao.mjs <id> pagar|devolver "observação"` decide. O aviso de cada contestação nova também vai por e-mail para o suporte, se houver SMTP.

**Conta Escrow (próximo passo do pagamento):** veja [docs/conta-escrow.md](docs/conta-escrow.md). Exige uma conta sandbox da Asaas como pessoa jurídica.

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
