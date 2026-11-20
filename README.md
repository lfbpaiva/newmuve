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
2. Copie `mobile/.env.example` para `mobile/.env` e preencha a URL e a chave pública do Supabase. Para testar no celular, defina também `EXPO_PUBLIC_API_URL=http://<IPv4 do notebook>:3333/api`, com o IPv4 obtido pelo `ipconfig` (veja "Testar no celular (Expo Go)").
3. Suba a API e o app, cada um em um terminal:

```bash
pnpm dev:api
```

```bash
pnpm dev:app
```

Leia o QR Code com o Expo Go. No terminal do Expo, a tecla `w` abre o app no navegador em `http://localhost:8081`. A API fica em `http://localhost:3333/api`.

### Testar no celular (Expo Go)

O app usa o Expo SDK 58: atualize o Expo Go pela loja antes de começar.

1. No notebook, rode `ipconfig` e anote o "Endereço IPv4" do adaptador de rede em uso (Wi-Fi ou cabo).
2. Em `mobile/.env`, defina `EXPO_PUBLIC_API_URL=http://<IPv4 do notebook>:3333/api`. Não use `localhost`: no celular, ele aponta para o próprio celular e os dados não carregam.
3. Suba a API e o app (`pnpm dev:api` e `pnpm dev:app`) e leia o QR Code. No Android, leia pelo próprio Expo Go; no iPhone, pela câmera.
4. Celular e notebook precisam estar **na mesma rede**. Para conferir, abra no navegador do celular `http://<IPv4 do notebook>:3333/api/health`: deve aparecer `{"status":"ok"}`.

Ao mudar de rede, o IPv4 do notebook muda: rode `ipconfig` de novo e troque só o IP em `EXPO_PUBLIC_API_URL`, mantendo a porta e o caminho (`:3333/api`). Reinicie o Expo depois de alterar o `.env`.

**"Failed to download remote update" ou "Something went wrong":** o celular não alcança o computador. Causas comuns: Wi-Fi de convidados, repetidor, roteador que isola o Wi-Fi dos aparelhos no cabo, ou o Windows bloqueando o Node (na primeira vez, permita o acesso em redes privadas e públicas). Se a rede não puder ser mudada, use o **cabo USB** no Android:

1. No celular, ative o modo desenvolvedor (toque 7 vezes em "Número da versão") e a **Depuração USB**; ligue o cabo e permita a depuração.
2. No computador, ligue as portas do celular às do computador (o `adb` vem com o Android Studio, em `%LOCALAPPDATA%\Android\Sdk\platform-tools`):

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
adb reverse tcp:3333 tcp:3333
```

3. Em `mobile/.env`, defina `EXPO_PUBLIC_API_URL=http://localhost:3333/api` e suba o app com `npx expo start --localhost` (dentro de `mobile/`).
4. No Expo Go, toque em "Enter URL manually" e digite `exp://localhost:8081`.

Ao voltar ao teste pela rede, defina de novo `EXPO_PUBLIC_API_URL=http://<IPv4 do notebook>:3333/api`.

Os Termos de Uso ficam em `mobile/app/terms.tsx`; ao mudar as regras, atualize o texto e `TERMOS_VERSAO` em `shared/dominio.ts`.

Contas de demonstração (senha `teste123`): `teste@teste.com` (músico) e `contratante@teste.com` (contratante). Para usar as duas no mesmo navegador, abra uma em `http://localhost:8081` e outra em `http://127.0.0.1:8081`. O script `node scripts/contas-demo.mjs` recria as duas do zero, com fotos do Unsplash (uso livre).

Contas de teste extras, criadas em 20/11/2026 com perfis completos, em Cascavel/PR e com a mesma senha:

- `musico2@teste.com`: Banda Teste Rock (Rock, Metal e Outros). Serve como segundo candidato nos eventos de rock.
- `musico3@teste.com`: Dupla Teste MPB (MPB, Samba, Pop e Pagode).
- `contratante2@teste.com`: Casa de Shows Teste, com CPF e sem Muve Casa.
- `musico4@teste.com`: Solo Teste Pop (Pop e Indie). Testou o não comparecimento: tem multa pendente e não se inscreve até 05/12/2026.

A Dupla Teste MPB tem o Muve Pro até 21/12/2026, sem renovação. Todos os músicos de teste usam a chave Pix de teste do Banco Central (`cliente-a00001@pix.bcb.gov.br`), porque a Asaas recusa repasse para chave que não existe, mesmo no sandbox.

Os CPFs e telefones dessas contas são fictícios.

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
| `pnpm test:e2e` | Fluxo completo contra a API e o Supabase locais, descartáveis (precisa do Docker Desktop; o banco é resetado antes e depois) |

O GitHub Actions roda `typecheck`, `lint` e `test` a cada pull request e a cada push no `main`.

## Configuração externa

**Supabase:** veja abaixo os redirecionamentos e o SMTP.

**Asaas (sandbox):** a conta precisa de uma chave Pix cadastrada para gerar QR Code. Preencha `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` em `backend/.env`. O webhook (`/api/webhooks/asaas`) só funciona com a API publicada na internet, mas não é obrigatório: a tela de pagamento consulta a Asaas a cada poucos segundos. Para confirmar um pagamento de teste, abra a cobrança no painel do sandbox e use *Confirmar pagamento*.

No repasse ao músico, o sandbox só aceita as [chaves Pix fictícias do Banco Central](https://docs.asaas.com/docs/testando-transferências), como `cliente-a00001@pix.bcb.gov.br`, que a conta de demonstração já usa. A chave de API precisa da opção *Permitir que esta chave execute operações de saque via API*. Transferências feitas pela API ficam aguardando autorização por SMS no painel da Asaas (*Meu Dinheiro → Transferências → Enviar código*). Sem webhook, o app consulta a situação da transferência sempre que o comprovante é aberto.

**Publicação da API (opcional, mas libera o webhook da Asaas e o uso fora do Wi-Fi de casa):**

1. Publique a API em um serviço de hospedagem compatível com Node.js.
2. Preencha no painel as variáveis marcadas como secretas, com os valores de `backend/.env`, e defina `ALLOWED_ORIGINS` com o endereço onde o app web vai rodar. Em produção a API não inicia se faltar a Asaas ou se a URL dela não corresponder a `ASAAS_ENV`.
3. No app, aponte `EXPO_PUBLIC_API_URL` para `https://SEU-DOMINIO/api`.
4. Na Asaas, em *Integrações → Webhooks*, cadastre `https://SEU-DOMINIO/api/webhooks/asaas` com o mesmo `ASAAS_WEBHOOK_TOKEN`.

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

**Rotina financeira:** expira cobranças vencidas, confirma Pix cuja notificação se perdeu, acompanha estornos e repasses, concilia tentativas de repasse de pagamentos estornados ou substituídos e conclui os shows com 7 dias passados, sem depender de alguém abrir o app. Contestação aberta ou estorno em andamento seguram o repasse.

- **Em produção**, quem dispara é o workflow `.github/workflows/rotina-financeira.yml` do GitHub Actions, a cada 5 minutos, chamando `POST /api/admin/rotina-financeira` com o cabeçalho `x-rotina-token`. A API responde `202` quando inicia, `409` quando já há uma execução em andamento (resultado esperado) e `401`/`403` quando o token não confere ou não está configurado. A execução continua na API depois da resposta.
- **Uma execução por vez, em qualquer número de instâncias:** cada execução adquire uma trava com validade no banco (`rotina_financeira_execucao`), renova a validade enquanto trabalha e só começa uma etapa nova com a trava válida. Uma execução que perde a trava para de iniciar etapas; uma que cai no meio libera a trava quando a validade (10 minutos) vence.
- **Variáveis da API:** `FINANCIAL_ROUTINE_TOKEN` (texto aleatório de pelo menos 32 caracteres, letras, números, `-` ou `_`, diferente do `ADMIN_TOKEN`; sem ela a rota recusa tudo) e `ENABLE_FINANCIAL_ROUTINE`. `ENABLE_FINANCIAL_ROUTINE` habilita o timer local opcional da API. Mantenha `false` quando o disparo for realizado exclusivamente pelo GitHub Actions. Se definido como `true`, o timer local poderá ser iniciado somente quando o ambiente permitir sua execução (em produção ou com Supabase local), utilizando a mesma trava no banco.
- **Secrets do GitHub** (Settings → Secrets and variables → Actions): `MUVE_API_URL` (a URL pública da API terminando em `/api`, com `https://`) e `FINANCIAL_ROUTINE_TOKEN` (o mesmo valor configurado no ambiente da API). O agendamento e o disparo manual (`workflow_dispatch`) só chamam a API com a variável de repositório `ROTINA_FINANCEIRA_ATIVA=true`; sem ela, o job é ignorado.
- **Última execução:** `select * from public.rotina_financeira_execucao;` no SQL Editor do Supabase mostra a execução atual, a última conclusão, o resultado (`SUCESSO`, `FALHA` ou `EXPIRADA`), o último sucesso e o erro.

**Repasse sem resposta da Asaas:** cada pedido de transferência é uma tentativa registrada no banco, e a referência enviada à Asaas é o id da tentativa. Se a Asaas não responder, a tentativa fica inconclusiva e o repasse nunca é repetido às cegas: a rotina procura a transferência pela referência da tentativa e a registra quando a encontra. Sem encontrar, só o suporte libera, em duas etapas:

```bash
node scripts/resolver-repasse.mjs
```

lista as tentativas aguardando conferência e os alertas. Depois de conferir o painel da Asaas:

```bash
node scripts/resolver-repasse.mjs verificar <tentativa> --operador "Seu nome"
```

só é aceito 24 horas depois do pedido e com uma busca completa e vazia na Asaas. Uma hora depois, no mínimo:

```bash
node scripts/resolver-repasse.mjs confirmar <tentativa> --operador "Seu nome" --declaro
```

refaz a busca, registra a declaração e encerra a tentativa; o repasse fica como falho e não é reenviado. Os prazos e as buscas reduzem o risco de Pix duplicado, mas não comprovam a ausência da transferência; o nome informado não é uma identidade autenticada. Tentativas antigas com transferência registrada usam `node scripts/resolver-repasse.mjs conferir <tentativa>`.

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
