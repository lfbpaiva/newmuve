# Auditoria para o teste no Expo Go (16/11/2026)

Referência: "NEWMUVE — Documento mestre de continuidade, auditoria e execução" (51 seções). Branch `integracao/redesign-lote1`, PR #6 aberto e sem merge. Banco hospedado `lylxorfrwuioednhukhz` com **21 migrations**; as 12 novas (`20261113120000` a `20261116150000`) **não** foram aplicadas. Nada foi publicado nem implantado.

Estados: **CONCLUÍDO COM EVIDÊNCIA**, **IMPLEMENTADO, MAS NÃO TESTADO**, **PARCIAL**, **PENDENTE**, **BLOQUEADO POR MIGRATION**. "Não testado" quer dizer sem validação no aparelho; testes automatizados não contam como validação de fluxo.

## 1. Estado do Git e do PR

- HEAD `1050af2` antes desta etapa, igual ao `origin`; PR #6 com 17 commits, `mergeable`, CI `verificar` aprovado.
- Fora do Git de propósito: exclusão local de `backend/.env.example` e `mobile/.env.example`; `mobile/pnpm-lock.yaml` e `mobile/pnpm-workspace.yaml` não rastreados.
- O documento mestre descreve um estado anterior (95 arquivos no stage, último commit `0ba3389`). Esse conjunto virou o commit `6abbf31`; as correções seguintes estão em `9ae3256`, `b3ccd5d` e nos commits de documentação. Não há trabalho fora de commits além das exceções acima.

## 2. Mocks, dados artificiais e autenticação simulada

**Resultado: nenhum mecanismo artificial no código que roda no aplicativo ou na API.**

| Verificação | Evidência |
|---|---|
| mock, fixture, fake, stub, seed, `placeholderData`, `initialData`, lorem | só em arquivos `*.test.ts` (`api.test.ts`, `abertura.test.ts`, `notificacaoLink.test.ts`) e em `backend/src/services/testing.ts`, usado só pelos testes |
| Bundles exportados | web: nenhuma ocorrência; Android: a única ocorrência de "vitest" é a junção de nomes de ícones Lucide ("…convi" + "test-tube…") |
| Login | um único `signInWithPassword` (`shared/client/account.ts`, chamado pelo formulário); nenhum `signInAnonymously`, OTP ou `signInWithIdToken` |
| `setSession` | só em `mobile/lib/authLinks.ts`, com `access_token` e `refresh_token` vindos do link de retorno do Supabase (OAuth e recuperação de senha) |
| Credenciais embutidas | nenhuma; nenhum e-mail ou senha de conta de demonstração no código do app |
| Condições de desenvolvimento | nenhum `__DEV__` ou `NODE_ENV` no app; só as 5 variáveis `EXPO_PUBLIC_*` |
| Fallbacks silenciosos | um encontrado e corrigido (seção 6, item 1); os demais `catch` vazios são de tarefas acessórias (preferência de raio, splash, registro de push, e-mail lembrado, marcar notificações como lidas) e não substituem dados |
| Leituras do Supabase | `unwrap` propaga o erro; `useAsync` mostra `ErrorState` com "Tentar novamente" |

**Abrir já autenticado pelo QR Code é legítimo.** O Supabase guarda a sessão no AsyncStorage (`persistSession: true`). Ao abrir, o `AuthProvider` recebe a sessão salva e **sempre** consulta `GET /api/me` no backend, que valida o token no Supabase: 401 ou 404 encerram a sessão; outros erros mostram a tela de erro. Fora a sessão, o app guarda só o **e-mail** usado no último login, para preencher o campo; nunca a senha.

## 3. Integrações reais configuradas

| Ligação | Configuração efetiva (sem segredos) |
|---|---|
| App → Supabase Auth, Database e Storage | `EXPO_PUBLIC_SUPABASE_URL` = projeto `lylxorfrwuioednhukhz`; chave pública no formato `sb_publishable` |
| App → API | `EXPO_PUBLIC_API_URL` = `http://192.168.0.5:3333/api`; é o IPv4 atual do computador (Wi-Fi) |
| API → Supabase | mesmo projeto; chave de servidor no formato `sb_secret` (a nova) |
| API → Asaas | `https://api-sandbox.asaas.com` (Sandbox) |
| Captcha | `EXPO_PUBLIC_TURNSTILE_SITE_KEY` definida |
| Rotina financeira | `ENABLE_FINANCIAL_ROUTINE` e `FINANCIAL_ROUTINE_TOKEN` ausentes; o log da API confirma "Rotina financeira desabilitada nesta instância" |
| Rede | Wi-Fi com perfil Público; regra de entrada do Node permitida no perfil Público |
| Conferências feitas | `GET /api/health` = 200 em `localhost` e em `192.168.0.5`; `GET /api/me` sem token = 401 |
| `ALLOWED_REDIRECTS` (API) | `muve://auth`. O link do e-mail de **cadastro** feito pelo Expo Go (`exp://…`) não é aceito e cai na Site URL do Supabase. Para testar a confirmação de cadastro no Expo Go: remover a variável (o padrão de desenvolvimento já inclui `exp://*`) ou acrescentar `exp://*` |
| Recuperação de senha e Google | dependem das **Redirect URLs** do Supabase Auth (painel) aceitarem `exp://192.168.0.5:8081/--/auth`; não foi possível conferir (CLI sem sessão) |

## 4. O que depende das 12 migrations

| Estrutura (migration) | Usada por | Efeito no hospedado atual |
|---|---|---|
| `disputes.payment_id` (11) | `findLatestResolvedDispute` em `GET /events/:id/contratacao` | **500** ao abrir "Ver contratação"; o formulário de avaliação fica dentro dessa tela |
| `abrir_contestacao` (4, 5, 11, 12) | abrir contestação | erro |
| `claim_asaas_refund(…, p_contestacao_id)` (12) | todo estorno (cancelar contratação paga, reabrir, não comparecimento) | erro antes de chamar a Asaas |
| `repasse_tentativas`, `claim_payout` (3) | repasse disparado ao concluir um evento ou ao abrir a contratação de evento concluído com repasse retido; checagens de estorno | erro antes de chamar a Asaas |
| `penalties.estorno_payment_id` (1) | multa após estorno | erro |
| `decidir_contestacao`, `negar_estorno`, `liberar_estorno` (7) | rotas de suporte | erro |

Esses fluxos falham **sem movimentar dinheiro**: a falha acontece no banco, antes de qualquer chamada à Asaas.

## 5. Os 51 tópicos

Colunas: **Testes** registra só o que foi executado de fato (automatizados ou consultas); nenhum tópico tem teste manual no aparelho ainda. **Migration** indica a dependência das 12 pendentes. Resultados de referência: `pnpm test` 48 arquivos / 897 testes aprovados (16/11/2026, depois de `c0c0fec`); pgTAP 25 arquivos sem falha no ensaio sobre a cópia do hospedado; exports Android e web sem erro; CI `verificar` aprovado em `50397d2`.

| # | Tópico | Estado | Evidências e arquivos | Commits | Testes e resultados | Pendências | Expo Go agora | Migration |
|---|---|---|---|---|---|---|---|---|
| 1 | Papel no projeto | CONCLUÍDO COM EVIDÊNCIA | trabalho conduzido pelas regras do documento; registros em `docs/EXECUCAO_PR6_CONTINUIDADE.md` | — | não se aplica | — | não se aplica | não |
| 2 | Regras inegociáveis | CONCLUÍDO COM EVIDÊNCIA | seção 2 desta auditoria (sem mocks, sem login automático, sem sucesso falso) | `c0c0fec` (remoção de fallback silencioso) | busca em código e nos bundles exportados | repetir a busca antes de cada entrega | não se aplica | não |
| 3 | Estado do Git | CONCLUÍDO COM EVIDÊNCIA | seção 1; local igual ao `origin`; exceções fora do Git listadas | `6abbf31`…`50397d2` | `git status`, `git rev-list` | — | não se aplica | não |
| 4 | Estrutura do projeto | CONCLUÍDO COM EVIDÊNCIA | `mobile/`, `backend/src/` (http, services, adapters), `shared/`, `supabase/`, `scripts/`, `docs/` conferidos | — | não se aplica | — | não se aplica | não |
| 5 | Regras arquiteturais | CONCLUÍDO COM EVIDÊNCIA | 15 policies ativas, todas `for select`; nenhuma nova nas 12 pendentes; escrita só pela API; chaves privadas só no `backend/.env` | — | contagem nas migrations; inventário de permissões no ensaio (0 acesso de cliente nos objetos novos) | — | não se aplica | não |
| 6 | Tecnologias e versões | CONCLUÍDO COM EVIDÊNCIA | Expo SDK 58, RN 0.88.1, Supabase JS 2.117.2, Node 26.13.0 local (`engines` ≥ 22.18). pnpm efetivo **12.18.0**: `packageManager`, CI (`pnpm/action-setup@v6` sem versão fixa) e Render (`corepack`). O `.mise.toml` fixa 10.34.3 e só afeta quem usa `mise` | `0ba3389` | `npm ls`, `pnpm --version` | opcional: alinhar o `.mise.toml` (não feito, sem efeito no CI) | não se aplica | não |
| 7 | Instalação de dependências | CONCLUÍDO COM EVIDÊNCIA | `npm ls`: `supabase-js` e `postgrest-js` em 2.117.2; leituras do app com 200 depois do `npm ci` (logs anteriores) | — | typecheck do app sem erros | não rodar `pnpm install` em `mobile/` | sim | não |
| 8 | Inicialização no PowerShell | CONCLUÍDO COM EVIDÊNCIA | API em 3333 e Expo em 8081 em terminais visíveis; `health` 200 em `localhost` e `192.168.0.5` | — | `curl /api/health` 200; `/api/me` sem token 401 | — | sim | não |
| 9 | Supabase | BLOQUEADO POR MIGRATION | hospedado com 21 migrations; backup completo, restauração e ensaio das 12 aprovados (`docs/PLANO_MIGRATIONS_HOSPEDADO.md`) | `b437c86`, `1050af2` | ensaio: 12 aplicadas, pgTAP 25 sem falha, estado igual ao das 33 | autorização da janela de aplicação | parcial | as 12 |
| 10 | Chaves Supabase | PARCIAL | API local com `sb_secret`; app com `sb_publishable`; chaves legadas ativas; chave da Render não verificada | — | leitura do formato das variáveis (sem valores) | confirmar a chave da Render; decidir desativar as legadas | não se aplica | não |
| 11 | Asaas | IMPLEMENTADO, MAS NÃO TESTADO | `ASAAS_API_URL` do Sandbox; `config.ts` recusa URL que não combina com o ambiente; webhook `muve-webhook` não conferido nesta etapa | `6abbf31` | testes do adaptador (`asaas.test.ts`) e de pagamento (`paymentService.test.ts`) aprovados | gerar e cancelar Pix no aparelho; apontar o webhook para a API | parcial (gerar e cancelar Pix) | estorno e repasse dependem |
| 12 | Rotina financeira | CONCLUÍDO COM EVIDÊNCIA | log da API: "Rotina financeira desabilitada nesta instância"; sem `ENABLE_FINANCIAL_ROUTINE` e `FINANCIAL_ROUTINE_TOKEN`; trava ensaiada (livre, geração 0) | `6abbf31` | 17 testes de rotina (`rotinaFinanceira.test.ts`, `config.test.ts`, `workflow-rotina.test.mjs`) e `trava_da_rotina_financeira.test.sql` aprovados | manter desligada | não se aplica | trava na 10 |
| 13 | Autenticação | IMPLEMENTADO, MAS NÃO TESTADO | `AuthContext.tsx`, `mobile/lib/client.ts`, `authLinks.ts`; sessão salva sempre validada por `GET /api/me` | `c0c0fec` (sessão em paralelo com as fontes) | `/api/me` sem token 401; testes da API aprovados | login, logout e reabertura no aparelho | sim | não |
| 14 | Contas de demonstração | IMPLEMENTADO, MAS NÃO TESTADO | 5 usuários no hospedado (exportação de 16/11); `scripts/contas-demo.mjs` não executado | — | contagem na exportação | entrar com as duas contas | sim | não |
| 15 | Ausência de mocks | CONCLUÍDO COM EVIDÊNCIA | seção 2 | `c0c0fec` | busca no código e nos bundles | — | não se aplica | não |
| 16 | P0 Ver contratação (500) | BLOQUEADO POR MIGRATION | `findLatestResolvedDispute` lê `disputes.payment_id` (`supabaseMarket.ts`, `eventService.ts`) | `6abbf31` | logs anteriores: consulta 400 → API 500 | aplicar as migrations e testar nos dois perfis | não | 11 |
| 17 | P0 Publicação e imagens | IMPLEMENTADO, MAS NÃO TESTADO | `FormData` com arquivo por `XMLHttpRequest` em `shared/client/api.ts`; serve para criar e editar evento e para foto de perfil | `9ae3256` | 4 testes em `api.test.ts` (XHR, 422, falha de rede, JSON por `fetch`) aprovados | publicar, editar e trocar foto no aparelho | sim | não |
| 18 | P0 Migrations pendentes | BLOQUEADO POR MIGRATION | backup do banco e dos 12 arquivos do Storage; ensaio aprovado; sequência de implantação (seção 6 do plano) | `1050af2` | ensaio e pgTAP na cópia | autorização da janela | não se aplica | as 12 |
| 19 | P0 Avaliações | PARCIAL | exibição com autor e evento (`fetchReviewsOf`, `ReviewsSection`) funciona no banco atual; o envio fica na tela de contratação | `b3ccd5d` | 1 teste de avaliação na API aprovado | aplicar migrations; avaliar nos dois sentidos | só ver avaliações recebidas | 11 (envio) |
| 20 | P1 Proposta em evento encerrado | IMPLEMENTADO, MAS NÃO TESTADO | `mobile/app/event/[id]/index.tsx`: "Alterar valor" e cancelamento só com evento aberto e não iniciado | `b3ccd5d` | 5 testes de proposta na API aprovados; tela sem teste automatizado | conferir aberto, iniciado e encerrado | sim (depende de haver evento encerrado com inscrição) | não |
| 21 | P1 Teclado no chat e na proposta | IMPLEMENTADO, MAS NÃO TESTADO | `EvitaTeclado` em `conversa/[candidateId].tsx` e na tela do evento | `b3ccd5d` | só typecheck | digitar e enviar com o teclado aberto | sim | não |
| 22 | P1 Salvamento de filtros | PARCIAL | a tela usa o perfil devolvido pelo `PATCH /api/me` (sem o `GET` extra); o backend ainda lê o perfil 3 vezes no `PATCH` | `c0c0fec` | só typecheck; sem medição | medir no aparelho; reduzir leituras no backend se necessário | sim | não |
| 23 | P1 Indicadores do painel | IMPLEMENTADO, MAS NÃO TESTADO | `mobile/app/(app)/index.tsx`: "—" no erro; puxar para atualizar refaz a leitura | `6abbf31` | só typecheck | testar sem rede | sim | não |
| 24 | P1 Erros genéricos | PARCIAL | `ApiError` com `SEM_CONEXAO`, `TEMPO_ESGOTADO`, 401, 403, 429 (com espera) e 5xx; motivo da falha de rede no log | `9ae3256` | testes de `api.test.ts` aprovados | conferir mensagens no aparelho | sim | não |
| 25 | P1 OAuth e recuperação | PENDENTE | redirect `Linking.createURL("auth")`; Redirect URLs do Supabase não conferidas; `ALLOWED_REDIRECTS` só `muve://auth` | — | 1 teste de redirect na API aprovado | incluir `exp://192.168.0.5:8081/--/auth` nas Redirect URLs (decisão de configuração) | não, até a configuração | não |
| 26 | Leituras diretas | IMPLEMENTADO, MAS NÃO TESTADO | consultas reais em `shared/client/*.ts`; `unwrap` propaga erros; 200 em `/rest/v1/events` e `/notifications` em teste anterior | — | testes de `events.test.ts` e `feed.test.ts` aprovados | conferir feed, favoritos, avaliações e notificações no aparelho | sim | não |
| 27 | P2 Muve Pro lento | PENDENTE | `GET /api/me/plano` sincroniza e busca o QR Code em sequência | — | 55 testes de plano aprovados | separar o QR Code da consulta (mexe em regra financeira) | sim, só abrir a tela | não |
| 28 | P2 Editar perfil e logout | PARCIAL | formulário sem mudança; logout não medido | `c0c0fec` (salvar) | só typecheck | medir | sim | não |
| 29 | P2 Ajuda e suporte | IMPLEMENTADO, MAS NÃO TESTADO | `settings.tsx`: aviso acima do grupo Conta; `mobile/lib/suporte.ts` | `b3ccd5d` | só typecheck | testar nos dois perfis | sim | não |
| 30 | P2/P3 Reveal | IMPLEMENTADO, MAS NÃO TESTADO | `ui.tsx`, `reveal.ts` | `6abbf31` | `reveal.test.ts` aprovado | rolagens no aparelho | sim | não |
| 31 | P2 Cursor do e-mail | PENDENTE | `sanitizeEmail` a cada tecla; não reproduzido | — | `validators.test.ts` aprovado (só a função) | reproduzir no Android antes de mudar | sim | não |
| 32 | Funcionalidades financeiras | BLOQUEADO POR MIGRATION | repasse por tentativas, contestação, estorno, conciliação | `6abbf31` | 25 arquivos pgTAP; 73 testes de estorno, 47 de contestação, 32 de repasse na API | janela + Sandbox | não | 1 a 12 |
| 33 | Inicialização | IMPLEMENTADO, MAS NÃO TESTADO | `mobile/app/_layout.tsx`: `AuthProvider` monta junto com o carregamento das fontes | `c0c0fec` | typecheck; exports | medir no aparelho | sim | não |
| 34 | Medições | PENDENTE | nenhuma medição no aparelho | — | — | medir com `npx expo start --no-dev --minify` | sim | não |
| 35 | Fase 0 | CONCLUÍDO COM EVIDÊNCIA | seções 1 a 4 | — | consultas e leituras | — | não se aplica | não |
| 36 | Fase 1 | PARCIAL | itens 1 a 8 com código; item 9 depende do painel do Supabase | `9ae3256`, `b3ccd5d`, `c0c0fec` | automatizados aprovados | roteiro manual | sim | não |
| 37 | Fase 2 | BLOQUEADO POR MIGRATION | ensaio aprovado | `1050af2` | ensaio | janela | não se aplica | as 12 |
| 38 | Fase 3 | PENDENTE | depende do teste no aparelho | — | — | roteiro manual | sim, exceto contratação | parcial |
| 39 | Fase 4 | BLOQUEADO POR MIGRATION | estorno, contestação e repasse | — | — | janela | só gerar e cancelar Pix | 1, 3, 4, 7, 11, 12 |
| 40 | Fase 5 | PENDENTE | sem medições | — | — | medir | sim | não |
| 41 | Fase 6 | PARCIAL | segredos, mocks, diff e permissões revisados; aparelho pendente | — | `git diff --check`; busca de segredos nos documentos | Android e Web no aparelho | sim | não |
| 42 | Testes automatizados | CONCLUÍDO COM EVIDÊNCIA | seção 8 | `c0c0fec` | 897 testes; typecheck; lint; exports; pgTAP no ensaio | — | não se aplica | não |
| 43 | Critérios de aceitação | PENDENTE | P0 de contratação bloqueado; fluxos manuais não feitos | — | — | migrations e roteiro | parcial | 11 |
| 44 | Git e PR | CONCLUÍDO COM EVIDÊNCIA | arquivos adicionados um a um; sem `git add -A`; PR aberto e sem merge | todos | CI aprovado | — | não se aplica | não |
| 45 | Decisões autônomas | CONCLUÍDO COM EVIDÊNCIA | correções da seção 6 | `c0c0fec` | — | — | não se aplica | não |
| 46 | Decisões que exigem aprovação | CONCLUÍDO COM EVIDÊNCIA | migrations, Render, chaves e redirects deixados para decisão do grupo | — | — | — | não se aplica | não |
| 47 | Escolha entre alternativas | CONCLUÍDO COM EVIDÊNCIA | `XMLHttpRequest` só para `FormData`, sem trocar o `fetch` das leituras | `9ae3256` | `api.test.ts` | — | não se aplica | não |
| 48 | Registro de etapas | CONCLUÍDO COM EVIDÊNCIA | `docs/EXECUCAO_PR6_CONTINUIDADE.md` | todos os `docs:` | — | — | não se aplica | não |
| 49 | Documento de continuidade | PARCIAL | continuidade, plano e esta auditoria atualizados; `docs/continuidade.md` (guia geral) não revisto | `50397d2` | — | revisar depois do teste no aparelho | não se aplica | não |
| 50 | Relatório final | CONCLUÍDO COM EVIDÊNCIA | esta auditoria (seções A a J do documento mestre distribuídas nas seções 1 a 9) | `50397d2` | — | — | não se aplica | não |
| 51 | Começar | CONCLUÍDO COM EVIDÊNCIA | reconhecimento feito antes de qualquer alteração | — | — | — | não se aplica | não |

## 6. Correções desta etapa

| # | Problema | Causa | Correção | Arquivos | Validação |
|---|---|---|---|---|---|
| 1 | Na tela do evento do contratante, uma falha ao consultar o pagamento era tratada como "nenhum pagamento em andamento" e liberava Editar, Excluir e aprovar outro candidato | `fetchCheckoutStatus(eventId).catch(() => null)` | o erro chega à tela, que mostra `ErrorState` com "Tentar novamente"; a rota usa só colunas que já existem no hospedado | `mobile/app/event/[id]/index.tsx` | typecheck; teste no aparelho pendente |
| 2 | Salvar perfil e filtros fazia uma requisição a mais | a tela descartava o perfil devolvido pelo `PATCH /api/me` e chamava `GET /api/me` | `refreshMe` aceita o perfil já atualizado; a tela passa a resposta do `PATCH` | `shared/client/AuthContext.tsx`, `mobile/app/account/edit.tsx` | typecheck; sem medição |
| 3 | Abertura esperava as fontes para começar a restaurar a sessão | `AuthProvider` só montava depois do `useFonts` | `AuthProvider` monta logo; a interface (e o `AuthGate`) continua esperando as fontes e a validação da sessão | `mobile/app/_layout.tsx` | typecheck; export Android e web |

## 7. PRÓXIMA ETAPA — TESTES MANUAIS NO EXPO GO

**Antes de começar:** API aberta (`pnpm dev:api`, porta 3333) e Expo aberto (`npx expo start --clear` em `mobile/`, QR Code `exp://192.168.0.5:8081`), celular na mesma rede Wi-Fi. Use as contas de demonstração já existentes (documento mestre, seção 14). **Não rode `scripts/contas-demo.mjs`.**

**Como saber que é real, em qualquer teste:**
- cada ação aparece no terminal da API com o método, o caminho e o código HTTP;
- o dado continua lá depois de fechar o Expo Go e abrir de novo;
- num segundo aparelho, ou no navegador em `http://localhost:8081` com a outra conta, a mudança aparece para a outra parte.

**Falha, em qualquer teste:** mensagem de sucesso sem requisição no terminal da API; dado que some depois de reabrir; carregamento infinito; "Algo deu errado" fora dos casos bloqueados; erro 500 no terminal da API.

**Tipos de teste:**
- **[leitura]** só consulta, não cria nada.
- **[grava]** cria ou altera registros reais no Supabase hospedado.
- **[externo]** chama outro serviço (Storage, Asaas Sandbox, e-mail).

Nenhum teste deste roteiro movimenta dinheiro.

| Ordem | Funcionalidade | Conta | Pré-requisitos | Ações | Resultado esperado | Sinal de serviço real | Falha | Tipo | Agora? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Abertura e sessão salva | a que estiver salva | app aberto antes neste aparelho | abrir pelo QR Code | logo animada; entra direto se havia sessão, senão mostra o login | `GET /api/me 200` no terminal da API | entrar sem `GET /api/me`; tela branca | [leitura] | sim |
| 2 | Logout | qualquer | estar logado | Ajustes → Sair da conta | volta ao login; ao reabrir o app, continua no login | sem `GET /api/me` ao reabrir | reabrir já logado | [leitura] | sim |
| 3 | Login | Contratante | conta de demonstração | e-mail, senha, captcha → Entrar | painel do contratante | `GET /api/me 200` | entrar com senha errada; erro genérico com senha certa | [leitura] | sim |
| 4 | Login com senha errada | Contratante | — | senha incorreta | mensagem de credenciais inválidas; continua no login | nenhum `GET /api/me` | entrar | [leitura] | sim |
| 5 | Painel e indicadores | Contratante | — | abrir o painel; puxar para atualizar | números iguais aos eventos da lista | leituras `/rest/v1/events` (não aparecem no terminal da API; conferir pela lista) | números que não batem com a lista; carregamento infinito | [leitura] | sim |
| 6 | Indicadores sem rede | Contratante | — | ativar modo avião; puxar para atualizar; desativar; puxar de novo | "—" no lugar dos números; volta ao normal com a rede | — | zero no lugar de "—"; carregamento infinito | [leitura] | sim |
| 7 | Perfil e edição | Contratante | — | Ajustes → Editar perfil → mudar o telefone → Salvar | volta à tela anterior com o dado novo | `PATCH /api/me 200` e **nenhum** `GET /api/me` logo depois | dado antigo depois de reabrir | [grava] | sim |
| 8 | Foto de perfil | Contratante | foto na galeria | Editar perfil → escolher foto → Salvar | foto nova no perfil, também depois de reabrir | `PATCH /api/me 200` (multipart) | "Não foi possível conectar ao servidor" | [grava] [externo: Storage] | sim |
| 9 | Publicar evento com imagem | Contratante | perfil completo; imagem na galeria | Novo evento → preencher → imagem → Publicar | evento na lista com a imagem | `POST /api/events 201` | erro de conexão; evento sem imagem | [grava] [externo: Storage] | sim |
| 10 | Editar evento e trocar imagem | Contratante | evento do item 9 sem inscritos | abrir → Editar → nova imagem → Salvar | imagem nova | `PATCH /api/events/… 200` | imagem antiga | [grava] [externo: Storage] | sim |
| 11 | Ajuda e suporte | Contratante | — | Ajustes → Ajuda e suporte | abre o app de e-mail; sem app, aviso logo acima do grupo Conta | — | nada acontece e nenhum aviso | [externo: e-mail] | sim |
| 12 | Login | Músico | conta de demonstração | sair do contratante; entrar como músico | feed de oportunidades | `GET /api/me 200` | — | [leitura] | sim |
| 13 | Feed e raio | Músico | — | abrir o feed; mudar o raio | lista muda conforme o raio; lista vazia explica o motivo | `rpc/musician_feed` (no app) | lista fixa que não muda | [leitura] | sim |
| 14 | Filtros do músico (estilos) | Músico | — | Ajustes → Estilos e recebimento → mudar estilos → Salvar | feed reflete os estilos; persiste após reabrir | `PATCH /api/me 200` sem `GET /api/me` logo depois | estilos antigos depois de reabrir | [grava] | sim |
| 15 | Detalhe do evento e inscrição | Músico | evento aberto do item 9, compatível com os estilos e o raio do músico | abrir o evento → Inscrever-se (aceitar o cachê ou propor valor) | "Inscrição enviada"; botões Alterar valor e Cancelar | `POST /api/events/…/candidatura` 2xx | sucesso sem requisição | [grava] | sim |
| 16 | Alterar proposta com teclado | Músico | inscrição do item 15 | Alterar valor → digitar | o campo e o botão continuam visíveis com o teclado aberto; valor salvo | `PATCH /api/events/…/candidatura 200` | teclado cobre o campo | [grava] | sim |
| 17 | Candidatos | Contratante | inscrição do item 15 | abrir o evento | o músico aparece com o valor proposto | — | lista vazia | [leitura] | sim |
| 18 | Chat com teclado | os dois | inscrição do item 15 | abrir a conversa; enviar mensagem; propor valor | mensagem aparece para a outra parte sem recarregar; teclado não cobre o campo | `POST /api/candidaturas/…/mensagens` e `…/propostas` 2xx | mensagem só local | [grava] | sim |
| 19 | Recusar inscrição | Contratante | outra inscrição pendente, se houver | Recusar | o músico vê "Sua inscrição não foi selecionada" e não vê Alterar valor | `POST /api/events/…/candidatos/…/recusa` 2xx | — | [grava] | sim, se houver |
| 20 | Proposta em evento encerrado | Músico | inscrição pendente num evento que já começou | abrir esse evento | aviso informativo; sem Alterar valor e sem Cancelar | — | aviso verde de "Inscrição enviada" | [leitura] | sim, se houver o dado |
| 21 | Avaliações recebidas | Músico ou Contratante | a avaliação existente no hospedado (1) | Perfil → Avaliações recebidas | nota, comentário, autor e evento | — | avaliação sem autor | [leitura] | sim |
| 22 | Favoritos, agenda, notificações | Contratante (favoritos exigem Muve Casa ativo) | — | abrir cada tela | listas reais ou estado vazio explicado | — | listas fixas | [leitura] | sim |
| 23 | Muve Pro / Muve Casa | Músico / Contratante | — | abrir a tela do plano | situação real da assinatura; pode demorar (pendência 27) | `GET /api/me/plano 200` | erro sem mensagem | [leitura] [externo: Asaas Sandbox] | sim, só abrir |
| 24 | Gerar e cancelar o Pix | Contratante | candidato do item 17; perfil com CPF/CNPJ | Contratar → ver o QR Code → **não pagar** → cancelar a cobrança | QR Code do Sandbox; após cancelar, o evento volta a aceitar edição | `POST /api/events/…/checkout 201`, depois `DELETE /api/events/…/checkout 200` | QR Code fixo; evento preso em "pagamento em andamento" | [grava] [externo: Asaas Sandbox] | sim, **sem simular pagamento** |
| 25 | Reveal | qualquer | lista com vários itens | rolar devagar, rápido, com embalo; tocar logo depois | blocos aparecem ao rolar; o toque funciona | — | toque ignorado; item invisível | [leitura] | sim |
| 26 | Erros e estados vazios | qualquer | — | modo avião em telas de lista; "Tentar novamente" | mensagem de erro com nova tentativa; recupera com a rede | — | carregamento infinito; lista vazia como se não houvesse dados | [leitura] | sim |
| 27 | Excluir o evento de teste | Contratante | evento do item 9, sem pagamento | abrir → Excluir → confirmar | evento some e continua fora depois de reabrir | `DELETE /api/events/… 2xx` | — | [grava] | sim |

**Não testar agora (bloqueado pelo banco atual):** ver a seção 10.

**Depende de configuração externa, fora deste roteiro:** recuperação de senha e login com Google (Redirect URLs do Supabase com `exp://192.168.0.5:8081/--/auth`); confirmação de cadastro pelo Expo Go (`ALLOWED_REDIRECTS` com `exp://*`).

## 8. Testes automatizados desta etapa

- `pnpm typecheck` (raiz e app): sem erros.
- `npx eslint . --ignore-pattern "newmuve/**"`: sem erros. A pasta local `newmuve/` (fora do Git) confunde o ESLint quando ele roda sem esse filtro.
- `pnpm test`: 48 arquivos, 897 testes, todos passando.
- `npx expo export --platform android` e `--platform web`: sem erros.
- `git diff --check`: limpo.
- Banco: pgTAP 25 arquivos sem falhas no ensaio sobre a cópia do hospedado (etapa anterior); não repetido, porque esta etapa não muda o banco.

## 9. Ambiente pronto para o teste

- API: `pnpm dev:api` em terminal visível, porta 3333; log "Rotina financeira desabilitada nesta instância".
- Expo: `npx expo start --clear` em terminal visível, `exp://192.168.0.5:8081`, modo Expo Go; uma única instância.
- Se o computador mudar de rede, o IP em `mobile/.env` precisa mudar.

## 10. Funcionalidades bloqueadas pelas migrations (não testar agora)

| Funcionalidade | Por que falha hoje | Migration |
|---|---|---|
| Ver contratação (músico e contratante) | a API lê `disputes.payment_id` e responde 500 | 11 |
| Avaliar a outra parte | o formulário fica na tela de contratação | 11 |
| Simular o pagamento do Pix no Sandbox | o evento vira "contratado"; depois disso a contratação dá 500 e o cancelamento com estorno falha, deixando o evento sem saída até as migrations | 11, 12 |
| Cancelar contratação paga, reabrir o evento, estorno | `claim_asaas_refund` com `p_contestacao_id` não existe | 12 (e 1, 3) |
| Abrir contestação; não comparecimento | `abrir_contestacao` e `claim_asaas_refund` novos | 4, 5, 11, 12 |
| Repasse ao concluir o evento | `claim_payout` e `repasse_tentativas` | 3 |
| Decisões de suporte (contestação, estorno) | `decidir_contestacao`, `negar_estorno`, `liberar_estorno` | 7 |

Todos falham no banco, antes de qualquer chamada à Asaas: não há movimentação de dinheiro.

## 11. Como continuar

1. Fazer o roteiro da seção 7 na ordem e anotar, para cada item, o resultado e o que apareceu no terminal da API.
2. Para cada falha: abrir a tela de novo, conferir o terminal da API e registrar a rota, o código HTTP e a mensagem; corrigir no código só o que não depender das migrations, com typecheck, lint, `pnpm test` e export antes do commit.
3. Para recuperação de senha e Google: decidir as Redirect URLs no painel do Supabase e o `ALLOWED_REDIRECTS` do `backend/.env`; depois testar.
4. Depois da autorização da janela, seguir `docs/PLANO_MIGRATIONS_HOSPEDADO.md`, seção 6, e então testar a seção 10 desta auditoria.
5. Manter: sem migrations no hospedado sem autorização, sem deploy, sem merge do PR #6, rotina financeira desligada, Asaas só no Sandbox.
