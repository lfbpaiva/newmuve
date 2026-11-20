# Auditoria para o teste no Expo Go (16/11/2026)

Referência: "NEWMUVE — Documento mestre de continuidade, auditoria e execução" (51 seções). Branch `integracao/redesign-lote1`, PR #6 aberto e sem merge. Banco hospedado `lylxorfrwuioednhukhz` com **21 migrations**; as 12 novas (`20261113120000` a `20261116150000`) **não** foram aplicadas. Nada foi publicado nem implantado.

Estados: **CONCLUÍDO COM EVIDÊNCIA**, **IMPLEMENTADO, MAS NÃO TESTADO**, **PARCIAL**, **PENDENTE**, **BLOQUEADO POR MIGRATION**. "Não testado" quer dizer sem validação no aparelho; testes automatizados não contam como validação de fluxo.

## 1. Estado do Git e do PR

- HEAD `1050af2` antes desta etapa, igual ao `origin`; PR #6 com 17 commits, `mergeable`, CI `verificar` aprovado.
- Fora do Git de propósito: exclusão local de `backend/.env.example` e `mobile/.env.example`; `mobile/pnpm-lock.yaml` e `mobile/pnpm-workspace.yaml` não rastreados.
- O documento mestre descreve um estado anterior (95 arquivos no stage, último commit `0ba3389`). Esse conjunto virou o commit `6abbf31`; as correções seguintes estão em `9ae3256`, `b3ccd5d` e nos commits de documentação. Não há trabalho fora de commits além das exceções acima.
- Atualização (17/11/2026): a frase acima descreve o estado de 16/11. As correções das seções 18 a 30 ficaram fora de commits até o Lote 1 de 17/11, quando foram registradas no Git (ver `docs/EXECUCAO_PR6_CONTINUIDADE.md`, seção "Lote 1"). Na mesma ocasião, `backend/.env.example` e `mobile/.env.example` foram restaurados do HEAD; os arquivos do pnpm no `mobile/` continuam fora do Git.

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

## 12. Rodada de testes manuais no Expo Go (16/11/2026)

Testes feitos pelo usuário no celular, com as contas de demonstração e dados reais do hospedado. Nada desta seção foi executado pelo assistente; a investigação seguinte foi feita só por leitura do código, do Git e do backup de 16/11.

| Nº | Teste | Resultado informado |
|---|---|---|
| 1–5 | Abertura, logout, login, senha errada, painel | aprovado |
| 6 | Indicadores sem internet | falhou parcialmente: os números somem, mas o app não diz que está sem internet |
| 7 | Edição de perfil | aprovado (persistiu nos dois perfis) |
| 8 | Foto de perfil | aprovado, com problemas no recorte |
| 9–10 | Publicar e editar evento | aprovado, com demora |
| 11–20 | Suporte, login do músico, feed, filtros, inscrição, proposta, candidatos, chat, recusa, evento iniciado | aprovado |
| 21 | Avaliações recebidas | parcial (2 eventos finalizados, 1 avaliação) |
| 22 | Favoritos, agenda, notificações | parcial: favoritos e agenda funcionam; atraso de ~5 s no botão de favorito; notificações com defeitos (seção 13) |
| 23 | Muve Pro e Muve Casa | parcial: só visualização |
| 24 | Checkout Pix | não executado |
| 25 | Reveal | em teste: sem animação perceptível ao rolar Inscrições; sem bloqueio de toque após a rolagem |
| 26 | Erros e estados vazios | pendente |

## 13. Investigação dos defeitos relatados

Classificação: **Confirmado** (comprovado no código), **Hipótese**, **Não reproduzido**, **Dependente de migration**, **Dependente de validação manual**, **Melhoria futura**.

| # | Problema | Classificação | Prioridade | Evidência e causa | Correção possível |
|---|---|---|---|---|---|
| D1 | "O servidor respondeu em um formato inesperado" ao convidar, mas o convite chega | **Corrigido em 16/11, sem commit, falta validar no Expo Go (seções 18 e 19)** (antes: Confirmado) | Alta | `POST /events/:id/convites` responde `c.body(null, 201)` (`backend/src/http/app.ts:315-319`); o cliente só aceita corpo vazio com 204 e lança `RESPOSTA_INVALIDA` (`shared/client/api.ts:109-115` e `134-136`). Acontece em **todo** convite, não só nos dois casos testados. O convite e a notificação já foram gravados. O mesmo vale para `POST /events/:id/contestacao` (`app.ts:321-325`) | Responder 204 nas duas rotas (ou o cliente aceitar corpo vazio em 2xx). Sem migration |
| D2 | Convite repetido | **Mitigado pela correção de D1** (o falso erro que levava a repetir o convite acabou; repetir ainda gera outra notificação) (antes: Confirmado) | Média | `insertInvite` usa `upsert` (`backend/src/adapters/supabaseMarket.ts:378-381`): não duplica o convite, mas cada repetição gera outra notificação e outro push (`eventService.ts:244-254`) | Resolvido junto com D1 (o usuário deixa de repetir); opcional: não notificar se o convite já existia |
| D3 | Evento de 31/12 e ocorrência futura da recorrência não aparecem ao músico | Confirmado (causa provável) e dependente de validação manual | Alta | `musician_feed` esconde de quem não é Pro, por 24 h após a criação, eventos criados com mais de 7 dias de antecedência (acesso antecipado do Muve Pro, `supabase/migrations/20261029150000_muve_pro.sql:93-97`; `shared/dominio.ts:150-156`). O músico de teste não é Pro. Os dois eventos tinham mais de 7 dias de antecedência. A recorrência cria eventos independentes, sem vínculo de série (`eventService.ts:130-141`): excluir uma ocorrência não afeta as outras | Regra de produto, não defeito. Validar: abrir o feed 24 h depois da criação. Melhorar a explicação ao contratante depende de decisão |
| D4 | Exclusão de evento apaga conversas e histórico | Confirmado | Crítica | `DELETE /events/:id` faz exclusão física (`eventService.ts:168-174`, `supabaseMarket.ts:234-237`). Em cascata somem `event_candidates` e, por eles, `candidate_messages`, além de `event_invites`, `event_locations` e `disputes`. `payments` e `penalties` ficam com `event_id` nulo. As notificações ficam, sem link. Só é permitida em evento ABERTO, sem contratado e sem Pix em andamento | Exclusão lógica (status ou `excluido_em`) preservando inscrições e mensagens: exige migration nova e mudança no feed, RLS e telas. Depende de decisão do grupo |
| D5 | Cancelar inscrição também apaga a conversa | Confirmado | Alta | `cancelApplication` apaga a candidatura (`eventService.ts:335-347`, `supabaseMarket.ts:439-442`); as mensagens caem em cascata. O botão age sem confirmação | Confirmar antes de cancelar (sem migration); preservar o histórico exige status de "desistiu" e migration |
| D6 | "Aceitar e pagar" acidental sem forma de voltar | Confirmado (parcial) | Alta | "Aprovar e pagar" abre `checkout` (`event/[id]/index.tsx:191`), que cria a cobrança Pix **ao abrir a tela**, sem confirmação (`checkout.tsx:47-48`, `shared/client/events.ts:423-433`). Existe "Cancelar cobrança pendente" (`checkout.tsx:202`), em estilo de texto no fim da tela; cancelar não mexe na candidatura, que continua PENDENTE (`paymentService.ts:290-298, 600-606`). Voltar sem cancelar deixa o evento em "Continuar pagamento" até expirar | Passo de confirmação antes de gerar a cobrança e botão de cancelar mais visível. Sem migration; mexe no fluxo de pagamento, precisa de autorização |
| D7 | Músico não consegue cancelar depois do "aceite" | Confirmado em dois cenários | Alta | (a) Com Pix pendente do contratante, toda alteração do músico cai em `PAGAMENTO_EM_ANDAMENTO` (`paymentService.ts:398-403`). (b) Depois de contratado (APROVADO), `cancelApplication` recusa (`JA_CONTRATADO`) e o caminho é "Ver contratação", que hoje dá 500. Aceitar uma contraproposta no chat **não** muda a inscrição (continua PENDENTE e cancelável) | (a) Resolvido junto com D6. (b) Dependente de migration |
| D8 | Ver contratação com erro | Dependente de migration | Alta | `disputes.payment_id` ausente no hospedado (seção 10) | Aplicar as 12 migrations (autorização pendente) |
| D9 | Notificação continua "nova" depois de aberta | **Corrigido em 16/11, sem commit, falta validar no Expo Go (seções 18 e 19)** (antes: Confirmado) | Média | `notificacoes.tsx:16-18` marca como lidas no servidor, mas não atualiza a lista local nem recarrega | Atualizar o estado local após `markNotificationsRead`. Sem migration |
| D10 | Notificação de evento excluído não abre nada | Confirmado (comportamento atual) | Baixa | `eventDeleted` grava a notificação com `link` nulo (`notifications.ts:170-178`), porque o evento deixou de existir | Depende de D4 (com exclusão lógica, o link poderia abrir o histórico) |
| D11 | Evento volta ao feed do músico recusado depois que o contratante reabre as inscrições | Confirmado (parcial) e dependente de validação manual | Média | `musician_feed` não exclui eventos em que o músico já se inscreveu ou foi recusado; só exclui `inscricoes_encerradas`. O feed recarrega só ao voltar à tela ou ao puxar (`useRefreshOnFocus.ts:4`), sem tempo real. O desaparecimento depois de abrir a notificação não tem explicação no código | Excluir do feed os eventos com candidatura do músico exige migration (função nova). Reproduzir antes |
| D12 | Contraproposta mostra o estado anterior por ~2 s | **Corrigido em 16/11, sem commit, falta validar no Expo Go (seções 18 e 19)** (antes: Confirmado) | Média | Em "Alterar valor" o formulário fecha e mostra o valor antigo até `details.reload` terminar (`event/[id]/index.tsx:110`, `useAction`). No chat, a proposta nova entra na hora, mas a anterior continua "aberta" até chegar o evento de tempo real ou a próxima busca (`conversa/[candidateId].tsx:116`; servidor fecha em `eventService.ts:301`) | Atualização local imediata com o valor confirmado pela API. Sem migration, sem mudar regra |
| D13 | Favorito demora ~5 s para atualizar | **Corrigido em 16/11, sem commit, falta validar no Expo Go (seções 18 e 19)**; causa comprovada no código, tempo não medido (antes: Hipótese) | Baixa | O botão só muda depois de `POST /me/favoritos` (3 consultas no servidor) e da releitura dos favoritos; em seguida a tela inteira recarrega, incluindo `GET /events/:id/checkout`, que consulta pagamentos e pode chamar a Asaas (`event/[id]/index.tsx:134, 191`) | Medir no terminal da API; estado otimista no botão. Sem migration |
| D14 | Indicadores sem internet não avisam | **Corrigido em 16/11, sem commit, falta validar no Expo Go (seções 18 e 19)** só no painel (antes: Confirmado (parcial)) | Média | Os números viram "—" (`(app)/index.tsx`), e a mensagem "Verifique sua conexão" fica na seção "Em andamento", abaixo. Não existe detecção de conectividade no app. As leituras pelo Supabase não têm tempo-limite próprio | Aviso junto aos indicadores; aviso global de conexão é decisão de produto |
| D15 | Publicar evento e salvar perfil demoram | Confirmado (estrutura), tempo não medido | Média | A foto vai inteira (qualidade 0,85, sem redimensionar, `fields.tsx:52`) do celular para a API e da API para o Storage. Na recorrência, a mesma imagem é enviada uma vez por semana, em sequência (`eventService.ts:131-141`). O botão mostra carregamento | Reduzir a imagem no aparelho e reaproveitar o arquivo na recorrência. Precisa de medição e de aprovação, porque altera a imagem enviada |
| D16 | Recorte da foto de perfil | Hipótese e dependente de validação manual | Média | O app não tem recorte próprio: usa o editor nativo do `expo-image-picker` com `allowsEditing` e proporção 1:1 (perfil) ou 16:9 (evento) (`fields.tsx:52`). Um campo horizontal indica a proporção 16:9 da foto do **evento**, ou o editor do Android | Precisa de print do recorte e da tela de origem. Trocar o editor é mudança visual: decisão do usuário |
| D17 | Botão de enviar do chat parece inativo | Não reproduzido | Baixa | O botão fica com opacidade 0,5 sem texto e 1 com texto, fundo roxo e ícone branco (`conversa/[candidateId].tsx`, botão "Enviar mensagem"). Pode ser o botão "Propor" ou o tema do aparelho | Print do estado |
| D18 | Abertura lenta e captcha demorado | Hipótese | Média | A abertura animada leva 1,73 s, com limite de 2,93 s (`mobile/lib/abertura.ts`); a sessão é validada em paralelo. O captcha é um WebView que baixa o script da Cloudflare só quando a tela de login abre (`mobile/components/Turnstile.tsx`) | Medir; pré-carregar o WebView do captcha sem desativar a proteção |
| D19 | Datas, horários e valor sem formatação | Confirmado (parcial) | Baixa | Data e horários já têm máscara (`maskDate`, `maskTime` em `EventForm.tsx:120-122`), mas não completam "2" para "02:00". O valor oferecido só filtra caracteres (`EventForm.tsx:140`) | Melhoria futura (lista abaixo) |
| D20 | Reveal sem animação ao rolar nas Inscrições | **Corrigido em 16/11, sem commit, falta validar no Expo Go (seções 18 e 19)** (antes: Confirmado pela leitura e pelo relato) | Baixa | O `Reveal` mede a posição em relação ao contêiner pai (`onLayout`), não ao conteúdo rolado. Nas listas dentro de uma `View` (Inscrições, Meus eventos, Notificações, Em andamento, Candidatos), a entrada ao rolar não é calculada no ponto certo, e só a entrada inicial acontece. O feed do músico (empilhamento) mede certo. Bloqueio de toque não reproduzido pelo usuário | Medir a posição em relação à rolagem, preservando o efeito. Sem migration |
| D21 | Letreiro de estilos ausente | Confirmado | Decisão do usuário | Criado em `ffa63cd` (11/11) e removido um dia depois em `6a8eea1` ("redesign premium com Geist, Lucide e logo restaurada", 12/11, mesmo autor). Não existe no HEAD. Parallax e barra fixa estão no detalhe do evento (`components/events.tsx:100-111`); o empilhamento, no feed | Restaurar só com autorização |

### Reveal e efeitos: desempenho

- **Comprovado no código:** cada `Reveal` cria uma animação, mede o próprio layout uma vez e, quando precisa acompanhar a rolagem, assina o aviso de fim da rolagem. No Android e no iOS as animações rodam no driver nativo; na web, a regra de toque escuta cada quadro.
- **Risco potencial:**
  - cada instância consulta "reduzir movimento" e registra um ouvinte próprio;
  - as listas usam `ScrollView` sem virtualização, e o custo cresce com o número de itens;
  - `posicaoAtual` usa a API interna `__getValue`, só na web.
- **Exige medição no aparelho:** quedas de quadros em Android mais simples. Nenhuma métrica foi coletada.
- **Abertura (splash):** `mobile/components/Abertura.tsx`, independente do Reveal, preservada.

## 14. Avaliações: correspondência com os eventos finalizados

Fonte: o backup do hospedado de 16/11/2026 (fora do Git). O estado posterior não foi consultado, porque esta etapa proíbe operações no hospedado. Identificadores encurtados.

| Evento | Situação | Criação → início | Pagamento | Avaliações | Origem provável |
|---|---|---|---|---|---|
| `ea731437` "Noite acústica no terraço" | CONCLUIDO, as duas partes confirmaram | criado em 06/10, início em 18/10 | cobrança criada em 07/10, paga em 26/10, repassada | 1: contratante avalia o músico, nota 5, criada em 26/10 | dado de demonstração com intervenção administrativa: `docs/continuidade.md` (commit `34ca762`, lfbpaiva, 04/11) registra que este evento "foi marcado como repassado manualmente". A avaliação em si tem forma de envio normal pelo app; a origem exata não é comprovável |
| `cfcf026b` "Noite de MPB no Bar Teste" | CONCLUIDO, as duas partes confirmaram | criado às 23:17:46 de 04/11 com início **2 h antes** da criação | cobrança criada 9 s depois do evento e paga 2 s depois, repassada | 0 | **dado de demonstração criado fora do app**: a API recusa início no passado (`assertFuture`), e pagar em 2 s não é possível pelo app. O mesmo commit `34ca762` (04/11) o registra como evento de demonstração com "repasse real concluído". O script que o criou não está no repositório. Versões antigas de `scripts/e2e-api.mjs` (antes de `6abbf31`) usavam o `backend/.env` e mudavam o início para o passado pelo service_role |

**Resultados:**
- Não há avaliação sem evento, nem avaliação escondida pela interface.
- A avaliação só nasce quando uma das partes envia o formulário na tela de contratação. Ela não é obrigatória e não há pedido automático.
- Hoje ninguém consegue avaliar, porque a tela de contratação depende das migrations (seção 10).
- A divergência "2 finalizados × 1 avaliação" é coerente: o segundo evento nunca foi avaliado. Os dois eventos são dados de demonstração documentados pela equipe, não inserções ocultas; o segundo foi criado fora do fluxo do app.
- Nenhum registro foi alterado, excluído ou inserido.

## 15. Planos e assinaturas (só leitura)

- **Direito de uso:** vem de `pro_ate` e `casa_ate` (`isPro`). Cancelar só cancela a assinatura na Asaas e marca CANCELADA. O acesso continua até a data paga, como mostra o "ativo até 12/12" (`planService.ts:114-121`, `PlanScreen.tsx:96`).
- **"Voltar a renovar":** cria uma **assinatura nova** com vencimento **hoje** (`planService.ts:92-112`). A ativação soma 31 dias a partir da maior data entre `casa_ate` e agora, então não se perdem dias, mas a cobrança acontece já, não no fim do período. Isso precisa ficar claro na tela: é decisão do usuário.
- **Muve Pro (músico):** sem assinatura, a tela mostra o plano e o botão de assinar, coerente.
- **Lentidão:** cada `GET /me/plano` consulta a Asaas e o QR Code (tópico 27).

## 16. Plano de correções proposto

Situação em 16/11: os itens 1, 2, 3, 6 e 7 e a parte de favoritos do item 8 foram implementados (seções 18 e 19), sem commit e sem validação no Expo Go. Os demais continuam aguardando autorização.

**Sem migration:**
1. ✅ D1/D2: convite e contestação respondem 204, com teste da rota. Remove o falso erro. *(implementado)*
2. ✅ D9: notificações marcadas como lidas também na tela. *(implementado)*
3. ✅ D12: contraproposta e proposta refletidas na hora. *(implementado)*
4. D6: confirmação antes de gerar o Pix e cancelamento mais visível.
5. D5: confirmação antes de cancelar a inscrição.
6. ✅ D14: aviso de falha de conexão junto aos indicadores. *(implementado só no painel)*
7. ✅ D20: medida do Reveal relativa à rolagem, sem mudar o visual. *(implementado)*
8. D13 e D15: medir primeiro; depois, estado otimista no favorito e imagem reduzida. *(D13 implementado com a causa comprovada no código; D15 pendente)*

**Com migration, depende de decisão do grupo:**
- D4/D5/D10: exclusão lógica de evento e de inscrição, preservando o histórico.
- D11: feed sem os eventos em que o músico já se inscreveu.

**Bloqueados pelas 12 migrations:** D7b, D8, avaliações.

**Decisão do usuário:** D16 (editor de recorte), D21 (letreiro) e a mensagem de "Voltar a renovar".

**Riscos de regressão:**
- D1 muda o contrato da rota; os testes de `app.test.ts` precisam acompanhar.
- D6 toca o fluxo de pagamento: só no Sandbox e sem simular pagamento.
- D20 mexe no componente usado em mais de dez telas.

## 17. Roteiro de validação manual depois das correções

| # | Perfil | Ação | Esperado | Tipo |
|---|---|---|---|---|
| V1 | Contratante (Muve Casa ativo) | convidar um favorito para um evento aberto | "Convite enviado", sem erro; uma só notificação no músico | [grava] |
| V2 | Músico | abrir uma notificação e voltar | ela deixa de aparecer como nova sem atualizar | [grava] |
| V3 | Músico | alterar o valor da inscrição | o valor novo aparece ao fechar o formulário | [grava] |
| V4 | Contratante | tocar em "Aprovar e pagar" | pede confirmação antes de gerar o Pix; "Voltar" não cria cobrança | [leitura] até confirmar |
| V5 | Contratante | modo avião no painel | aviso de conexão perto dos números | [leitura] |
| V6 | Músico | rolar Inscrições com mais itens que a tela | os itens de baixo entram ao aparecer; o toque funciona | [leitura] |
| V7 | Músico | abrir o feed 24 h depois de um evento criado com mais de 7 dias de antecedência | o evento aparece | [leitura] |

Não executar: pagamento, simulação de pagamento, contratação, cancelamento ou renovação de plano, exclusão de eventos.

## 18. Primeira etapa de correções (16/11/2026, sem commit)

Base: HEAD `9127a6f`, igual ao remoto. PR #6 aberto, sem merge: 20 commits, 147 arquivos, sem conflito (`mergeable_state: clean`). Nenhuma migration, nenhuma mudança no hospedado, nenhum deploy. Regras de contratação, pagamento e checkout não mudaram. O letreiro não foi restaurado. **Não houve validação no Expo Go**: os testes manuais ficam com o usuário.

| # | Causa corrigida | Correção | Arquivos | Testes novos |
|---|---|---|---|---|
| D1 | `POST /events/:id/convites` e `POST /events/:id/contestacao` respondiam 201 sem corpo, e o cliente tratava isso como resposta inválida | As duas rotas respondem 204 (padrão das demais rotas sem conteúdo). O cliente passa a ler o corpo como texto: 2xx sem corpo é sucesso sem dados; corpo que não é JSON continua sendo `RESPOSTA_INVALIDA`; erro sem corpo continua sendo erro | `backend/src/http/app.ts`, `shared/client/api.ts` | `app.test.ts`: convite 204 sem corpo, erro 409 com JSON, musicianId inválido 400, contestação 204. `api.test.ts`: 200/201/202 sem corpo, corpo só com espaços, 409 sem corpo, 2xx com texto, envio por XHR com 201 sem corpo |
| D9 | A tela marcava as notificações como lidas no servidor, mas mantinha a lista antiga | Depois da confirmação do servidor, as notificações exibidas passam a lidas na própria tela (`aplicarLeitura`); falha no servidor mantém o estado anterior | `shared/client/notifications.ts`, `mobile/app/notificacoes.tsx` | `notifications.test.ts` (3) |
| D12 | "Alterar valor" fechava e mostrava o valor antigo até a tela recarregar; no chat a proposta anterior seguia "aberta" e o valor do topo seguia antigo após aceitar | Depois da resposta da API: o valor salvo aparece na hora (normalizado como no servidor, `valorDaInscricao`); a proposta anterior aparece como "Substituída" (`aplicarNovaProposta`, igual ao `closeOpenProposals` do servidor); o valor aceito aparece no topo. O valor local vale só até chegar a próxima leitura do banco, e uma leitura atrasada não volta a mostrar a proposta substituída como aberta | `shared/dominio.ts`, `shared/client/conversation.ts`, `backend/src/services/eventService.ts` (só troca da expressão repetida pela função compartilhada, mesmo resultado), `mobile/app/event/[id]/index.tsx`, `mobile/app/conversa/[candidateId].tsx` | `conversation.test.ts` (4), `dominio.test.ts` (2) |
| D14 | Falha de rede nas leituras do Supabase virava mensagem genérica, longe dos indicadores | `unwrap` reconhece a falha de rede do supabase-js (status 0) e devolve "Sem conexão com a internet..."; o painel mostra o aviso, com ícone de nuvem desligada, logo abaixo dos indicadores | `shared/client/events.ts`, `mobile/app/(app)/index.tsx`, `mobile/components/ui.tsx` (ícone `CloudOff` da Lucide) | `events.test.ts`: status 0, erro HTTP, sucesso |
| D20 | O `Reveal` media a posição em relação ao contêiner pai, e nas listas a entrada ao rolar era calculada errado | Novo `BlocoMedido` (uma `View` com o mesmo estilo que mede o próprio `onLayout`) repassa o deslocamento acumulado; o `Reveal` soma esse deslocamento à própria medida. Animações, tempos, empilhamento e regra de toque não mudaram; feed e blocos diretos continuam com deslocamento 0 | `mobile/lib/reveal.ts`, `mobile/components/ui.tsx` (`BlocoMedido`, `Section`), `mobile/app/(app)/events.tsx`, `mobile/app/(app)/index.tsx`, `mobile/app/notificacoes.tsx` | `reveal.test.ts` (3) |
| D13 | Causa comprovada no código: o botão só mudava depois do `POST/DELETE /me/favoritos` **e** de uma nova leitura dos favoritos, sem nenhum sinal de que estava salvando. No detalhe do evento, também recarregava a tela inteira, incluindo `GET /events/:id/checkout`. O tempo exato (~5 s) não foi medido | Hook `useFavoritos`: o botão muda assim que o servidor confirma; mostra que está salvando e bloqueia o toque repetido; a lista é relida em seguida; o detalhe do evento não recarrega mais a tela inteira por causa do favorito. Erro do servidor aparece e não altera o estado | `shared/client/events.ts` (`aplicarFavoritosConfirmados`), `mobile/lib/useFavoritos.ts` (novo), `mobile/app/event/[id]/index.tsx`, `mobile/app/event/[id]/candidate/[candidateId].tsx` | `events.test.ts` (3) |

**Verificação:**
- `pnpm typecheck`: limpo.
- `npx eslint . --ignore-pattern "newmuve/**"`: limpo. **Atenção:** o lint da raiz ignora a pasta `mobile/` inteira (`ignores` do `eslint.config.js`), então essa verificação **não cobre o app**. A checagem do app está na seção 19.
- `pnpm test`: 50 arquivos, 925 testes, todos aprovados (antes: 48 e 897).
- `npx expo export` para Android e web: sem erro.
- `git diff --check`: sem problemas.
- A API em execução (`node --watch`) reiniciou com o código novo, com a rotina financeira desabilitada. O Expo segue aberto para o teste no celular.

**Riscos que continuam:**
- D1: um backend antigo (o do `main`) ainda responde 201 sem corpo. O cliente novo aceita os dois formatos.
- D14: a detecção depende do formato de erro do supabase-js 2.117 (status 0). Uma rede que só fica lenta, sem cair, ainda mostra carregamento.
- D20: o deslocamento só é somado nos contêineres trocados por `BlocoMedido` e nas `Section`. Uma lista nova dentro de outra `View` precisa do mesmo cuidado.
- D9: o servidor marca como lidas **todas** as notificações do usuário (regra existente). Uma notificação que chegue entre a leitura e a marcação fica lida sem ter aparecido. Não foi alterado.
- D13: o tempo real só será conhecido no teste no celular.

**Pendências desta etapa:**
- Validar no Expo Go com o roteiro da seção 17: V1, V2, V3, V5, V6, mais o favorito no detalhe do evento e no perfil do candidato.
- Commit, quando autorizado.
- Continuam fora: D4/D5/D10/D11 (precisam de migration e de decisão), D6 (checkout), D7b/D8 e as avaliações (bloqueadas pelas 12 migrations), D15–D19 e D21.

## 19. Segunda rodada: ajustes da revisão independente (16/11/2026, sem commit)

Escopo autorizado: só os problemas da revisão independente. D1, D9, D12 e D20 não foram alterados. Nenhuma migration, nenhuma operação no hospedado, nenhum convite, inscrição ou pagamento, nenhum commit. **Não houve validação no Expo Go.**

| Ajuste | O que mudou | Arquivos |
|---|---|---|
| Imports sem uso | Removidos `View` e `errorMessage`, que tinham sobrado da primeira rodada | `mobile/app/(app)/events.tsx`, `mobile/app/event/[id]/candidate/[candidateId].tsx` |
| D13: toques praticamente simultâneos | O controle de favoritos guarda, de forma síncrona, quais músicos têm gravação em andamento. Novos toques no mesmo músico não disparam outra requisição | `mobile/lib/favoritos.ts` (novo), `mobile/lib/useFavoritos.ts` |
| D13: alternância rápida | Cada toque registra o último estado pedido. Ao terminar a gravação em andamento, se o pedido mudou, grava de novo só o estado final. Se voltou ao estado já confirmado, não grava | `mobile/lib/favoritos.ts` |
| D13: outro músico durante uma gravação | Cada músico tem gravação e indicador de pendência próprios. Os outros botões continuam funcionando, sem bloqueio silencioso | `mobile/lib/favoritos.ts`, `mobile/app/event/[id]/index.tsx` |
| D13: falha de releitura | Mantém a última lista conhecida e as gravações confirmadas e mostra "Não foi possível atualizar a lista de favoritos…". Os botões não somem. Uma releitura antiga não desfaz uma gravação confirmada depois dela | `mobile/lib/favoritos.ts` |
| D13: falha de gravação | Volta ao último estado confirmado pelo servidor e mostra a mensagem dele. O próximo toque limpa o erro | `mobile/lib/favoritos.ts` |
| D13: indicação visual | O botão mostra na hora o estado pedido, com o indicador de pendência: opacidade e `busy` no coração do detalhe do evento, carregamento no botão do perfil. O coração do detalhe deixou de ficar desabilitado durante a gravação, para permitir a alternância | `mobile/app/event/[id]/index.tsx`, `mobile/app/event/[id]/candidate/[candidateId].tsx` |
| D13: limpeza | `aplicarFavoritosConfirmados` (da primeira rodada) foi substituída pelo controle e removida, com seus testes | `shared/client/events.ts`, `shared/client/events.test.ts` |
| D14: mensagem duplicada | O painel mostra o erro uma vez só, junto aos indicadores, com o botão "Tentar novamente". A seção "Em andamento" não repete mais a mensagem. Outras telas não mudaram | `mobile/app/(app)/index.tsx` |

**Correção (16/11, seção 22):** na rodada da seção 22, o botão do perfil passou a usar o estado `pendente` e o coração do detalhe já não ficava desabilitado. Os dois continuam tocáveis durante a gravação; quem impede requisições repetidas é o controle de favoritos, não o botão.

**Testes novos:** `mobile/lib/favoritos.test.ts`, com 12 casos:
- pendência e confirmação;
- toques simultâneos geram uma só gravação;
- alternância rápida preserva o último pedido;
- voltar ao estado original;
- dois músicos ao mesmo tempo;
- falha de gravação;
- erro limpo no novo toque;
- falha de releitura mantém os dados;
- releitura bem-sucedida;
- releitura antiga não desfaz uma gravação posterior;
- falha na primeira carga;
- inscrição e cancelamento de ouvintes.

**Verificação:**
- `pnpm typecheck`: limpo.
- `tsc --noEmit --noUnusedLocals --noUnusedParameters -p mobile/tsconfig.json`: nenhum import ou variável sem uso em todo o `mobile/`.
- Lint do app com uma configuração temporária fora do repositório (as mesmas regras da raiz aplicadas a `mobile/`; a configuração do projeto não mudou): **57 erros, todos anteriores**. São 55 de `react-hooks/refs` (padrão de `Animated.Value` em `useRef`, em `Abertura.tsx`, `BarraDeAbas.tsx`, `TopBar.tsx` e `ui.tsx`) e 2 de `react-hooks/set-state-in-effect` em `ui.tsx`. O resultado é idêntico rodando a mesma configuração sobre o `mobile/` do HEAD `9127a6f`. Nenhum erro de variável sem uso ou de regra de hooks foi introduzido.
- Lint da raiz: limpo (sem cobrir `mobile/`).
- `pnpm test`: 51 arquivos, 934 testes, todos aprovados.
- Exports Android e web: sem erro.
- `git diff --check`: sem problemas.

**Riscos que continuam:**
- No detalhe do evento, o coração mostra o estado pedido antes da confirmação. Se o servidor recusar, ele volta e o erro aparece acima da lista de candidatos.
- A primeira carga com falha continua sem mostrar botões, porque não há lista conhecida, mas agora mostra o aviso.
- Os 57 erros anteriores do lint do app não foram tratados (fora do escopo). Rodar o lint no `mobile/` pela configuração do projeto exigiria decidir antes o que fazer com eles.

## 20. Investigação da terceira rodada de testes no Expo Go (16/11/2026, sem alteração de código)

Só leitura: código, Git, o backup de 16/11 e uma medição do tempo de resposta do endpoint de saúde do Supabase, que não lê nem grava dados. Nada foi alterado no hospedado, no PR nem no Render.

### Correção no roteiro da seção 7

A seção 7 diz que "cada ação aparece no terminal da API com o método, o caminho e o código HTTP". **Isso não é verdade:** a API não tem registro de requisições (`backend/src/server.ts` e `backend/src/http/app.ts` só registram a inicialização e os erros 500). Para conferir que a ação foi real, valem os outros dois sinais da seção 7: o dado persiste ao reabrir e aparece para a outra parte.

### D13: tempo dos favoritos

| Etapa | O que acontece | Evidência |
|---|---|---|
| Rede da API | Cada chamada da API ao Supabase leva cerca de 0,1 s a partir desta máquina (6 medições de 0,09 a 0,38 s no endpoint de saúde, com conexão nova) | medição com `curl` |
| Adicionar (`POST /me/favoritos/:id`) | 5 idas e voltas em sequência: validação do token (`auth.getUser`, `adapters/supabase.ts:202-207`), `profiles`, `contractor_profiles`, `hasAppliedToContractor` (`supabaseMarket.ts:359-363`) e `upsert` | `eventService.ts`, função `setFavorite` |
| Remover (`DELETE`) | 4 idas e voltas: a verificação "já se inscreveu nos seus eventos" só existe ao adicionar | mesma função (`if (favorite && ...)`) |
| Estado local | O botão muda na hora (estado pedido); a pendência dura o tempo da gravação; a releitura dos favoritos vem depois, sem bloquear | `mobile/lib/favoritos.ts` |
| Detalhe do evento: "duas tonalidades de roxo" | Confirmado no código. Ao tocar, o fundo fica `accentSoft` (estado `pressed`). Ao soltar, o coração já mostra "favorito" com **opacidade 0,6** (pendente). Ao confirmar, volta a opacidade 1. São dois tons do mesmo roxo: pendente e confirmado. Ao remover, a troca é entre tons de cinza (`surface2`), menos perceptível | `mobile/app/event/[id]/index.tsx`, `CandidateCard` |
| Perfil do candidato: pouco mais de 1 s | O `Button` troca o texto por um indicador de carregamento e fica desabilitado enquanto `loading` (`components/ui.tsx`, `Button`). Por isso a espera fica visível pelo tempo inteiro da gravação, e não dá para alternar rápido ali. No detalhe do evento o coração continua tocável | `mobile/app/event/[id]/candidate/[candidateId].tsx` |

**Conclusões:**
- A diferença entre adicionar e remover vem do servidor: uma consulta a mais ao adicionar.
- A maior parte do tempo é rede: 4 a 5 consultas em sequência mais a validação do token, que vai ao Supabase em toda requisição.
- O tempo exato de cada requisição não foi medido, porque a API não registra requisições e medir exigiria gravar favoritos reais.

**Possíveis melhorias, que dependem de autorização:**
- validar o JWT localmente em vez de chamar `auth.getUser` (afeta a segurança de todas as rotas);
- juntar as consultas de conta;
- uniformizar a indicação de pendência entre as duas telas.

Nenhuma delas exige antecipar confirmações.

### D3: visibilidade dos eventos para músicos sem Muve Pro

**Regra confirmada no código** (`musician_feed`, `supabase/migrations/20261029150000_muve_pro.sql:67-108`). Um evento aparece no feed quando tudo isto vale:

- **Situação do evento:** `ABERTO`, sem inscrições encerradas, com início no futuro.
- **Músico não está com visibilidade reduzida** por penalidade.
- **Acesso antecipado:** o músico é Pro (`pro_ate > now()`, em `private.is_pro`); **ou** o evento foi **criado** há mais de 24 h; **ou** o evento acontece até 7 dias depois da **criação**. O limite combina a data de criação com a distância entre a criação e a realização. **Não há limite de data máxima.**
- **Estilos:** pelo menos um estilo em comum, ou o evento aceita "Qualquer estilo".
- **Localização:** mesma cidade (sem acento e sem diferença de maiúsculas); **ou** raio escolhido maior que 0 e distância até `min(raio escolhido, 200 km)`, ou `min(raio, 400 km)` para Pro.
  - A distância usa as coordenadas da tabela `municipios`.
  - Cidade sem coordenada só casa por nome.

**Consistência entre feed, API e banco:**
- **API:** `apply` (`eventService.ts:176-201`) aplica o mesmo acesso antecipado (`emAcessoAntecipado` em `shared/dominio.ts:150-154`, com os mesmos limites de 24 h e 7 dias) e a mesma compatibilidade de estilos e região, com o raio máximo do plano (200 ou 400 km). **Diferença:** a API não usa o raio escolhido no app, só o máximo do plano. O convite libera a inscrição mesmo fora da região e do acesso antecipado.
- **Banco (RLS):** qualquer usuário autenticado consegue **ver** qualquer evento `ABERTO` (`20261005120100_seguranca_rls.sql:113-120`). O feed filtra, mas a tela do evento, aberta por notificação, convite, link ou lista de inscrições, mostra eventos fora do alcance. A inscrição é que é barrada pela API ("acesso antecipado" ou "evento incompatível").
- **App:**
  - O raio escolhido fica salvo **no aparelho**, não na conta (`AsyncStorage`, chave `muve.feedRadiusKm`, `(app)/index.tsx`). Duas contas no mesmo celular dividem o raio.
  - O padrão é 50 km. "Minha cidade" é 0.
  - O filtro de período ("Esta semana" = 7 dias, "Este mês" = 30 dias) fica só na memória da tela (`filterFeed`, `shared/client/events.ts:451-462`) e pode esconder eventos mais distantes no tempo.

**O caso relatado: evento do dia 16 visível, do dia 23 não.** Para um músico sem Pro, um evento criado hoje (16/11) para 23/11 está a mais de 7 dias da criação. Por isso fica fora do feed por 24 h. O do dia 16 aparece. O mesmo resultado viria do filtro "Esta semana". As duas explicações são compatíveis com o código; qual delas valeu depende do dado.

**O outro perfil "vendo eventos fora do alcance".** Causas possíveis, a confirmar:
1. `pro_ate` no futuro. No backup de 16/11, os três músicos estavam com `pro_ate` nulo, e a assinatura Pro do músico de demonstração estava `AGUARDANDO_PAGAMENTO`; pode ter mudado depois.
2. Evento criado há mais de 24 h, ou a menos de 7 dias.
3. Raio maior salvo no aparelho por outra conta.
4. Evento aberto pela tela do evento (notificação, convite, link), que a RLS permite.
5. Convite.

**Dados não sensíveis necessários para fechar o diagnóstico** (consulta só de leitura, que depende de autorização):
- por conta de músico: Pro ativo (sim/não), visibilidade reduzida (sim/não), estilos;
- por evento: data de criação, data de início, estilos, situação, inscrições encerradas;
- para cada par músico × evento: mesma cidade (sim/não), distância em km, acesso antecipado ativo (sim/não), convite (sim/não);
- e o raio e o período escolhidos em cada aparelho no momento do teste.

Nomes, documentos, contatos e cidades não precisam aparecer.

### D12: valores no chat

| Tela | O que mostra | Valor |
|---|---|---|
| Detalhe do evento (contratante) | Barra fixa e cartaz: "Total com a taxa de N%" | `calcularCobranca(event.cache, comissaoPercentual(casaAte))`: total com taxa **do cachê oferecido** |
| Cartão do candidato | "Proposta do músico" | só o cachê pedido, **sem taxa** |
| Chat: balão de proposta | `formatCurrency(message.valor)` | só o cachê |
| Chat: topo ("Inscrição R$ X") | `valorProposto ?? event.cache` | só o cachê |
| Checkout (servidor) | cobrança | `calcularCobranca(candidate.valorProposto ?? event.cache, comissaoPercentual(contratante.casaAte, now))` (`paymentService.ts:359`) |

- Taxa: 10%, ou 6% com Muve Casa ativo (`shared/dominio.ts:29, 49, 178-185`).
- **Conclusão:** não é inconsistência de dados. A mesma fórmula, de `shared/dominio.ts`, serve ao app e à API, e o servidor cobra o cachê aceito mais a taxa.
- É **defeito de apresentação**: o detalhe do evento mostra o total com taxa só para o cachê oferecido, e as propostas aparecem sem taxa. Isso coincide com a melhoria futura nº 8.
- O app já tem os dados para mostrar o total (`event.cache`, valor da proposta e `casaAte` do contratante); nada novo da API seria necessário.
- **Ponto de produto:** a taxa usada é a do momento do pagamento. Com o Muve Casa cancelado e ativo até 12/12, uma contratação paga depois disso usa 10%, não 6%.

### Saída da conta

**Sequência confirmada no código:**
1. "Sair da conta" abre a confirmação nativa (`confirmAction` → `Alert.alert`, `(app)/settings.tsx:21`).
2. Ao confirmar: `forgetPushToken()`. No Expo Go Android não há token de push, então retorna logo (`mobile/lib/push.ts:42-46`).
3. Em seguida, `signOut()` → `supabase.auth.signOut({ scope: "local" })` (`shared/client/account.ts:90-92`), que apaga a sessão do armazenamento local.
4. O evento `SIGNED_OUT` muda o estado para `signedOut` (`AuthContext.tsx:36-39`).
5. O `Stack.Protected` de `app/_layout.tsx` troca as telas logadas pelas de entrada, com a animação `slide_from_right` da pilha.
6. A tela de login monta o `AuthHeader` (logo com `Reveal`) e o captcha, um WebView que baixa o script da Cloudflare.

- **Não há chamada à API no logout** nem mensagem de erro própria: o estado `signedOut` vem sem aviso.
- **Diferença entre encerrar a sessão e navegar:** a sessão termina antes. A navegação é consequência da troca de estado, sem `router.replace`.

**Hipóteses para a travada, a medir:**
- Desmontar todas as telas logadas e montar o login com o WebView do captcha acontece no mesmo momento da animação de troca e do fechamento do `Alert`. O WebView é a peça mais pesada.
- As telas logadas desmontam enquanto suas leituras ou assinaturas em tempo real ainda estão ativas: a contagem de notificações (`useUnreadNotifications`), a conversa, o feed.

**Detalhes técnicos na tela: a mensagem exata não foi informada.** Nenhum erro de autenticação do logout é mostrado pelo app. Candidatos, todos do modo de desenvolvimento do Expo Go, onde avisos de `console.warn` e promessas rejeitadas aparecem como faixas amarelas ou vermelhas:
1. O aviso do `expo-notifications` ("Push notifications … unavailable in Expo Go"), que aparece no terminal do Expo a cada carga.
2. O `console.warn("Falha de rede ao chamar a API", …)` de `shared/client/api.ts:125`, se alguma chamada falhar por rede durante a troca.
3. Avisos do `auth-js` do Supabase sobre trava da sessão, quando há leituras de sessão concorrentes com o `signOut`.

Na versão de produção essas faixas não aparecem. Para confirmar, é preciso o texto ou um print da mensagem.

### Prioridades sugeridas (aguardando autorização)

1. **Alta:** corrigir o roteiro (a API não registra requisições); se desejado, um registro mínimo de método, rota, código e tempo, sem dados pessoais.
2. **Alta (produto):** decidir como apresentar o total com taxa nas propostas, no chat e no cartão do candidato (melhoria nº 8), sem mudar a fórmula.
3. **Média:** fechar o D3 com a consulta só de leitura dos campos acima, se autorizada; avaliar avisar o músico sem Pro que o evento "abre para todos em …" quando ele chega pela tela do evento.
4. **Média:** medir o logout e o login no aparelho, e identificar a mensagem técnica pelo print.
5. **Baixa:** uniformizar a indicação de pendência do favorito entre as duas telas; avaliar a validação local do token (decisão de segurança).

### Depende de decisão do produto

- Mostrar o total com taxa nas propostas, e qual taxa mostrar quando o Muve Casa vai vencer.
- Se o raio do feed deve ser da conta e não do aparelho.
- Se eventos fora do feed devem continuar visíveis pela tela do evento (RLS atual).
- Se o acesso antecipado deve ser explicado ao contratante ao publicar.

## 21. D3: consulta só de leitura dos dois perfis (16/11/2026, 20:34)

Autorizada pelo usuário. Feita com `supabase db query --remote=lylxorfrwuioednhukhz --read-only`, em transação só de leitura, sem INSERT, UPDATE, DELETE nem RPC com efeito colateral; só funções de cálculo do próprio feed. O escopo foi limitado a:
- **Músico B:** a conta de demonstração do README;
- **Músico A:** o único outro músico ligado (inscrição ou convite) aos eventos dos dias 16 e 23. **Identificado por inferência**, porque o e-mail da segunda conta não foi informado;
- os eventos com início em 16/11 (dois) e 23/11 (um), no horário de Brasília. Os três são do mesmo contratante.

Resultado só com campos derivados. Nenhum nome, contato, documento ou cidade aparece.

**Rótulos corrigidos pelo usuário (16/11):** a conta de demonstração é o **Músico B**, o perfil que via o evento do dia 23 sem Pro. O **Músico A** é o outro perfil, que via o dia 16 mas não o 23. Ele foi identificado por inferência; o e-mail ainda não foi informado para confirmar. Os resultados da consulta não mudaram, só os rótulos.

**Identificação confirmada (16/11, 20:44).** O usuário informou a conta do Músico A. A consulta foi repetida só de leitura, usando os dois e-mails apenas como filtro, sem exibi-los e sem login nas contas.
- A conta informada existe e tem perfil de músico.
- **É o mesmo perfil inferido antes:** a comparação dos identificadores dentro da consulta deu verdadeiro, e só existia um candidato.
- Todos os campos derivados se repetiram: Pro, visibilidade reduzida, estilos, distância, acesso antecipado, convite e inscrições.

A matriz desta seção está **confirmada**, sem correção de conteúdo. O único item inconclusivo que resta é o que cada aparelho mostrava no exato momento do teste.

**Perfis:**

| | Músico B | Músico A |
|---|---|---|
| Muve Pro ativo | não (`pro_ate` vazio; assinatura Pro cancelada) | não (`pro_ate` vazio; sem assinatura) |
| Visibilidade reduzida | não | não |
| Cidade com coordenadas | sim | sim |

**Eventos:**

| | Evento 16-1 | Evento 16-2 | Evento 23-1 |
|---|---|---|---|
| Criado | 16/11 16:57 | 16/11 15:07 | 16/11 16:03 |
| Início | 16/11 17:00 | 16/11 23:59 | 23/11 22:00 |
| Antecedência | 0 dia (3 min) | 0,4 dia | **7,2 dias** |
| Liberado para quem não é Pro | desde a criação | desde a criação | **17/11 16:03** |
| Situação na consulta | ABERTO, **já começou** | ABERTO, aceita inscrição | ABERTO, aceita inscrição |

**Matriz (no momento da consulta):**

| | Evento 16-1 | Evento 16-2 | Evento 23-1 |
|---|---|---|---|
| **Músico B** | Fora do feed: o evento já começou. Inscrição **RECUSADA**. Mesma cidade, estilos compatíveis | **No feed.** Mesma cidade (0 km), estilos compatíveis, sem acesso antecipado. Inscrição PENDENTE | **Fora do feed** pelo acesso antecipado (7,2 dias de antecedência, criado há menos de 24 h, sem Pro). **Tem convite**, que libera a inscrição na API, e está **inscrito (PENDENTE)**. Vê o evento pelo convite, pela notificação e pelas inscrições |
| **Músico A** | Fora do feed: o evento já começou. Sem inscrição | **No feed.** Mesma cidade (0 km), estilos compatíveis. Inscrição PENDENTE | **Fora do feed** pelo acesso antecipado. Sem convite e sem inscrição. Se abrir a tela do evento por link, a RLS mostra o evento, mas a API recusaria a inscrição ("acesso antecipado") |

**Conclusões:**
1. Para o feed, os dois perfis têm **exatamente as mesmas condições**: sem Pro, sem penalidade, mesma cidade dos três eventos (distância 0, então o raio escolhido não interfere), estilos compatíveis.
2. O Evento 23-1 fica fora do feed dos dois **pela regra do acesso antecipado**, que termina em 17/11 às 16:03. Depois disso, aparece para os dois, inclusive para quem já está inscrito, porque o feed não exclui eventos com inscrição (ver D11).
3. A diferença entre os perfis é o **convite**: o Músico B foi convidado para o Evento 23-1 e se inscreveu. É esse o perfil que "vê um evento que deveria estar fora do alcance". **Não é falha da regra:** o convite libera a inscrição de propósito (`eventService.ts`, `apply`: `convidado` ignora o acesso antecipado e a região). O evento não aparece no feed dele; aparece pelo convite.
4. O Evento 16-1 começou às 17:00, três minutos depois de criado. Durante o teste, antes desse horário, ele podia aparecer no feed dos dois; depois, não.

**Banco × API × app:**
- **Feed (banco):** aplica o acesso antecipado e **não** considera convites. O evento convidado só aparece por notificação, link ou inscrições.
- **API:** o convite libera a inscrição apesar do acesso antecipado e da região. Sem convite, aplica as mesmas regras do feed, com o raio máximo do plano (200 km), não o raio escolhido no app.
- **RLS:** qualquer conta vê qualquer evento ABERTO pela tela do evento.
- **App:** o raio e o período escolhidos não influenciaram este caso. A distância é 0, e o filtro "Esta semana" só esconderia o Evento 23-1, que o acesso antecipado já escondia.
- **Divergência relevante para o produto:** convite × feed. O convidado pode se inscrever, mas não vê o evento no feed durante o acesso antecipado.

**Inconclusivo:**
- quais eventos cada aparelho mostrava no exato momento do teste: depende do horário, do raio e do período escolhidos, que não ficam no banco;
- ~~a identificação do Músico A por inferência~~: confirmada pelo usuário em 16/11, 20:44 (ver acima).

Nenhum dado foi alterado. Nenhuma correção foi feita.

## 22. Etapa 1: execução controlada de D12, D13, saída da conta e D1 (16/11/2026, sem commit)

Base: branch `integracao/redesign-lote1`, HEAD `9127a6f`, igual ao remoto. PR #6 aberto e sem merge. O trabalho das rodadas anteriores (sem commit) foi preservado, com cópia de segurança na pasta temporária da sessão. Nenhuma migration, nenhuma operação de escrita no hospedado, nenhum deploy, Render intocado, rotina financeira desligada, nenhum pagamento. **Nada desta seção foi validado no Expo Go.**

### D12: total para o contratante

- **Diagnóstico original (seção 20):** a fórmula é a mesma no app e no servidor; o cartão do candidato, o balão de proposta e o topo do chat mostravam só o cachê.
- **Decisão sobre a taxa:** a cobrança acontece no "Aprovar e pagar", e o servidor calcula com a taxa vigente nesse momento (`paymentService.ts:359`). Por isso o app mostra o valor **"se aprovar agora"**, com a taxa vigente hoje. Com Muve Casa ativo, o texto informa a validade da taxa de 6%. O texto também diz que "o valor final é calculado no pagamento". Não foi criada nenhuma regra de congelamento de taxa.
- **Alterações:**
  - `shared/dominio.ts`: `estimarCobrancaDoContratante`. Reutiliza `calcularCobranca` e `comissaoPercentual`, o mesmo cálculo do servidor. Devolve nulo para valor ausente, zero, negativo ou não finito.
  - `shared/client/conversation.ts`: `mostraEstimativaParaContratante`. Só o contratante vê, só com inscrição pendente e evento aberto; nos balões, só em propostas abertas. Some depois da contratação.
  - `shared/client/format.ts`: `formatTotalDoContratante`, `formatTotalSeAceita` e `detalharTotalDoContratante`.
  - `mobile/app/event/[id]/index.tsx`: linha "Você paga R$ X se aprovar agora" no cartão do candidato, só com o evento aberto, a inscrição pendente e nenhum Pix em andamento.
  - `mobile/app/conversa/[candidateId].tsx`: o topo mostra "Você paga R$ X se aprovar agora" (valor atual da inscrição). O balão de proposta **aberta** mostra "Se esta proposta for aceita, você pagará R$ X ao aprovar". Propostas aceitas, substituídas e recusadas não mostram total. Tudo só para o contratante.
- O músico continua vendo só o cachê. A fórmula financeira não mudou. A barra fixa e o cartaz do detalhe já mostravam o total do cachê oferecido e continuam iguais.
- **Pendente de produto:** se, perto do vencimento do Muve Casa, o app deve avisar que a taxa vai subir.

### D13: favoritos

- **Medição só de leitura no hospedado,** com consultas que não devolvem dados (identificador inexistente), mediana de 7 execuções a partir desta máquina:

| Consulta | Antes | Agora |
|---|---|---|
| Conta (`profiles` + tabela do perfil) | 2 consultas, cerca de 370–400 ms | 1 consulta, cerca de 200 ms |
| Conta + verificação de inscrição (adicionar) | em sequência, cerca de 554 ms | em paralelo, cerca de 196 ms |

- **Estimativa total:**
  - adicionar passa de cerca de 0,95 s para cerca de 0,6 s (validação do token + leituras + gravação);
  - remover passa de cerca de 0,77 s para cerca de 0,6 s.

  A validação do token (`auth.getUser`) e a gravação não foram medidas isoladamente, porque exigiriam token real ou gravação.
- **Alterações:**
  - `backend/src/adapters/supabase.ts` (`findAccount`): uma única requisição com `contractor_profiles(*)` e `musician_profiles(*)` embutidos. O resultado e os campos são os mesmos. Vale para todas as rotas que leem a conta.
  - `backend/src/services/eventService.ts` (`setFavorite`): a conta e a verificação de inscrição rodam em paralelo (`Promise.allSettled`). A precedência dos erros foi mantida: perfil não autorizado, depois Muve Casa, depois falha da verificação, depois músico que não se inscreveu. Nada é gravado em caso de falha. Remover não consulta inscrição.
  - `mobile/lib/favoritos.ts`: `estadoDoBotaoDeFavorito`, a mesma regra para as duas telas.
  - `mobile/lib/useFavoritos.ts`: devolve `botao(musicianId)`.
  - `mobile/components/ui.tsx`: o `Button` ganhou `pendente`. Fica com opacidade 0,6, mostra um indicador pequeno ao lado do texto, tem estado `busy` e continua tocável.
  - `mobile/app/event/[id]/candidate/[candidateId].tsx`: o perfil usa `pendente` em vez de trocar o texto pelo indicador e bloquear o botão. O detalhe do evento já mudava na hora, com opacidade 0,6.
- O indicador de salvamento foi mantido, e a confirmação continua vindo do servidor. A validação local do token **não** foi implementada, como pedido.

### Saída da conta

- **Evidência:** o histórico completo do Metro desta sessão (terminal do Expo) não tem erro do app, aviso de rede nem aviso de sessão do Supabase. As **únicas mensagens técnicas** são dois avisos do `expo-notifications` ("Push notifications … unavailable in Expo Go on Android since SDK 53" e "`expo-notifications` functionality is not fully supported in Expo Go"), emitidos quando o módulo é carregado, a cada carga do app. No modo de desenvolvimento, eles aparecem como faixas amarelas no aparelho.
- **Correção:** `mobile/lib/push.ts` não carrega mais o `expo-notifications` quando o app roda **no Expo Go no Android** (`isRunningInExpoGo()` do pacote `expo`, regra em `mobile/lib/pushRemoto.ts`). Lá o push remoto não existe. Em build de desenvolvimento ou de produção e no iPhone, nada muda.
- **Revisão do ciclo de vida:**
  - o logout não chama a API;
  - remove o token de push antes de encerrar a sessão;
  - as telas logadas desmontam com as assinaturas canceladas (`useUnreadNotifications`, conversa, `AppState`, foco);
  - respostas atrasadas são descartadas pelos `useAsync` e efeitos com `active`;
  - nenhum estado sensível fica em memória: a sessão sai do armazenamento, o `registeredToken` é limpo e o `AuthContext` volta a `signedOut`;
  - o raio do feed continua salvo no aparelho (não é sensível; ver a seção 20).
- **Travada da animação: não confirmada.** A hipótese continua sendo a montagem da tela de login (com o WebView do captcha) junto com a troca de telas. Adiar o captcha atrasaria a abertura dele também na inicialização, porque as animações da abertura contam como interação. Por isso **não** foi alterado sem medição no aparelho.

### D1: validação

- **Contrato e cliente:** cobertos por testes unitários (seção 18).
- **Validação com a API e o banco reais do projeto, sem tocar o hospedado:** o E2E local (`pnpm test:e2e -- --reutilizar-instancia`, só Supabase local em Docker, que é resetado antes e depois) ganhou 8 verificações:
  - favorito sem Muve Casa recusado;
  - favorito de músico inscrito aceito;
  - músico que não se inscreveu recusado;
  - músico não favorita;
  - **convite responde 204 sem corpo e grava uma linha**;
  - remover favorito e conferir no banco.

  Resultado: **66 de 66** verificações, resíduo zero. Depois da revisão, com a verificação da gravação do favorito: **67 de 67**.
- **Validação no hospedado: bloqueada de propósito.** Exige gravar um convite real. Autorização necessária: "convidar um músico favorito para um evento aberto da conta contratante de demonstração". Grava 1 linha em `event_invites` e 1 notificação para o músico, como no item V1 da seção 17.

### Testes desta rodada

- `pnpm test`: **53 arquivos, 965 testes, 965 aprovados, 0 reprovados, 0 ignorados** (antes: 51 e 934).
- **Novos testes:**
  - D12: estimativa com e sem Muve Casa, Muve Casa vencido, igualdade com o cálculo da cobrança, valores nulos ou inválidos, regra de exibição para proposta inicial, contraproposta aberta, aceita, substituída, recusada, músico e mudança de status, e os textos "se aprovar agora" e "se esta proposta for aceita";
  - D13: favoritar com consultas em paralelo antes de gravar, músico recusado mesmo com a verificação falhando, plano antes de falha de verificação, falha de verificação sem gravação, remover sem consultar inscrição, músico não remove, e o estado do botão em carregamento, adicionar, remover, falha de gravação e falha de releitura;
  - saída da conta: decisão do push remoto (Expo Go Android, build, iPhone, navegador e emulador).
- `pnpm typecheck`: limpo. Lint da raiz: limpo (não cobre `mobile/`).
- **Lint do `mobile/`** com configuração temporária fora do repositório: os mesmos 57 erros anteriores, idênticos ao HEAD. Nenhum novo.
- `tsc --noUnusedLocals --noUnusedParameters` no `mobile/`: nada sem uso.
- E2E local: 67 de 67. Exports Android e web: sem erro.
- `git diff --check`: limpo, depois de corrigir uma linha em branco sobrando no fim de `shared/dominio.test.ts`.

### Revisão independente

Revisão só de leitura, feita por uma análise separada sobre as mudanças desta rodada (comparadas com a cópia de segurança do início). O revisor não alterou o repositório.

**Achados e o que foi feito:**

1. **Média, corrigido.** O balão de proposta aberta dizia "Você paga R$ X se aprovar agora". Só que aprovar agora cobra o valor atual da inscrição, não o da proposta aberta. Além disso, propostas aceitas antigas repetiam totais diferentes.
   - Agora o balão aberto diz "Se esta proposta for aceita, você pagará R$ X ao aprovar" (`formatTotalSeAceita`).
   - Propostas aceitas, substituídas ou recusadas não mostram total.
   - O total "se aprovar agora" fica só no topo do chat e no cartão do candidato.
2. **Baixa, corrigido.** O cartão do candidato mostrava a estimativa mesmo com um Pix em andamento.
   - Agora só aparece com o evento aberto, sem nenhum Pix em andamento e com a inscrição pendente.
   - Usa a mesma regra do chat (`mostraEstimativaParaContratante`).
3. **Baixa, corrigido junto com o 2.** Com um Pix pendente do mesmo candidato, "Continuar pagamento" reaproveita a cobrança já criada. Como a estimativa não aparece mais nesse caso, ela não pode divergir do Pix.
4. **Baixa, corrigido.** O E2E não conferia no banco a gravação do favorito. Ganhou a verificação "favorito gravado no banco local".
5. **Baixa, não corrigido.** Não há teste unitário do `findAccount` do adaptador. Ele é coberto pelo E2E local, que roda contra o esquema real: 67 de 67. O revisor confirmou pela leitura que o formato da resposta embutida está certo (relação 1:1 pela chave primária).
6. **Baixa, corrigido.** A seção 19 dizia que o botão de favorito "bloqueia o toque repetido". Hoje o botão continua tocável, e quem junta os toques é o controle de favoritos. A nota de correção está logo abaixo da tabela da seção 19, sem apagar o texto original. A apresentação do total também foi registrada em `docs/produto.md`.

**Sem problema encontrado:**
- precedência de erros e ausência de gravação em `setFavorite`;
- o cálculo do D12 é idêntico ao do checkout;
- o músico nunca vê a estimativa;
- o `Button` com `pendente` desligado por padrão não muda os outros usos;
- o push continua em builds reais e no iPhone;
- nenhum elemento visual removido;
- nenhum comentário, mock, aspas simples ou mudança de regra financeira.

**Limitação registrada:** o teste "é o mesmo cálculo usado na cobrança" compara a fórmula, mas a escolha do valor (`valorProposto ?? cache`) fica no servidor (`paymentService.ts`), que não foi alterado nesta rodada, por ser regra de pagamento. No app, a mesma expressão foi usada no cartão e no topo do chat.

**Depois das correções:**
- `pnpm test`: 965 de 965;
- E2E local: 67 de 67;
- typecheck: limpo;
- lint da raiz: limpo;
- lint do `mobile/`: igual à base (57);
- nada sem uso;
- exports: sem erro;
- `git diff --check`: limpo.

### Checklist para o Expo Go (usuário)

1. **D12, contratante:** abrir um evento aberto com candidatos. Cada cartão mostra "Você paga R$ X se aprovar agora" com cachê + taxa, e a validade da taxa do Muve Casa. Abrir o chat: o topo mostra o total atual; uma contraproposta aberta mostra "Se esta proposta for aceita, você pagará…"; propostas aceitas, substituídas ou recusadas não mostram total. Com um Pix em andamento, o cartão não mostra a estimativa.
2. **D12, músico:** abrir o mesmo chat. Só o cachê aparece; nenhuma menção a "Você paga".
3. **D13:** favoritar e desfavoritar no detalhe do evento e no perfil do candidato. Nas duas telas, muda na hora, fica esmaecido enquanto salva e volta ao normal ao confirmar. Comparar o tempo com a rodada anterior. Testar toques rápidos e o modo avião.
4. **Saída da conta:** sair, entrar de novo e sair outra vez, observando se aparece alguma faixa amarela ou vermelha. Se aparecer, mandar um print. Observar se a travada continua.
5. **D1 (só com autorização, grava dados reais):** convidar um favorito. Deve aparecer "Convite enviado", sem erro.
6. **Regressão rápida:** notificações, painel sem internet e listas com Reveal (já validados) continuam iguais.

### Estado da Etapa 1

| Item | Estado |
|---|---|
| D1 | Implementado; validado com a API e o banco local (E2E). Validação no hospedado depende de autorização para gravar um convite |
| D3 | Investigação concluída e confirmada (seção 21); divergência convite × feed é decisão de produto |
| D9 | Validado no Expo Go pelo usuário |
| D12 | Implementado nesta rodada; falta validar no Expo Go |
| D13 | Otimizado nesta rodada; falta validar no Expo Go |
| D14 | Validado no Expo Go pelo usuário |
| D20 | Validado no Expo Go pelo usuário |
| Saída da conta | Avisos do Expo Go Android corrigidos; travada não confirmada, depende de medição no aparelho |

## 23. Roteiro oficial de continuidade (17/11/2026)

O roteiro oficial das três etapas, com as regras de acompanhamento e a situação de cada item, está registrado integralmente em `docs/EXECUCAO_PR6_CONTINUIDADE.md`, seção "Roteiro oficial de continuidade". As seções desta auditoria são a evidência de cada item. Os números D1 a D21 seguem os originais. A próxima atividade é analisar os resultados dos testes manuais no Expo Go (checklist da seção 22).

## 24. Testes manuais do usuário (17/11/2026) e investigação dos novos achados

Complemento ao roteiro oficial (`docs/EXECUCAO_PR6_CONTINUIDADE.md`). Investigação só de leitura: nenhuma linha de código mudou, nada no hospedado.

**Resultado informado pelo usuário:**
- boa parte das correções funciona;
- a alternância rápida de favoritos funciona;
- o botão de envio do chat foi **aprovado** (fica mais claro com texto digitado; preservar);
- os problemas abaixo foram encontrados.

| # | Problema | Causa | Evidência | Correção recomendada (aguardando autorização) |
|---|---|---|---|---|
| A | D12: estimativa em conversa de evento encerrado | **Confirmada.** O chat não sabe se o evento já começou: `fetchConversation` não busca `inicio` (`shared/client/conversation.ts:61`). Por isso `mostraEstimativaParaContratante` só olha `status === "ABERTO"`. O mesmo vale para `negotiable` e `open` (`conversa/[candidateId].tsx:158-159`): o botão "Propor valor" e o envio aparecem em evento já começado, e o servidor recusa (`NEGOCIACAO_ENCERRADA`). No detalhe do evento isso não acontece, porque `locked` inclui `encerrado` (`withEncerrado`, `components/events.tsx:18`) | leitura do código | buscar `inicio` na conversa; tratar "encerrado" igual ao detalhe na estimativa, em "Propor valor" e no envio, conforme a regra do servidor (`sendMessage` bloqueia `ABERTO` com início no passado) |
| B | D12: "valor que pagaria" abaixo da inscrição depois de proposta recusada | **Confirmada.** O texto não fica no balão recusado (esse já não mostra total). É a linha do **topo**, logo abaixo da etiqueta "Inscrição R$ X": ela mostra o total da inscrição atual enquanto a inscrição está pendente. Recusar uma proposta não muda a inscrição, então a linha continua, e fica parecendo ligada à proposta recusada | `conversa/[candidateId].tsx`, `estimativaDaInscricao`; `eventService.answerProposal` só muda o valor quando aceita | decisão de produto: (1) deixar claro que é o valor da inscrição atual ("Para aprovar a inscrição de R$ Y, você paga R$ X"); ou (2) não mostrar total no topo e deixar só no cartão do candidato |
| C | D13: coração roxo e, cerca de 1 s depois, outro tom | **Confirmada.** São três estados visuais: tocando (fundo `accentSoft` do `pressed`), salvando (já marcado, com opacidade 0,6) e confirmado (opacidade 1). A troca de tom acontece quando o servidor confirma, cerca de 0,6–1 s. A cor já é a final desde o toque; o que muda é a opacidade | `event/[id]/index.tsx`, `CandidateCard` | indicar "salvando" sem mudar a cor, com um anel ou pulso discreto em volta do coração e a cor final cheia desde o toque. A confirmação continua vindo do servidor e não há animação removida |
| D | D13: perfil do músico demora | **Hipótese forte.** O botão do perfil (`Button` com `pendente`) mostra o indicador durante toda a gravação: cerca de 0,6 s no servidor (validação do token + conta e inscrição em paralelo + gravação), mais a ida e volta do celular até a API. Depois de algum tempo parado, a primeira chamada da API ao Supabase reabre a conexão (a primeira medição foi de 0,38 s contra 0,1 s). Além disso, o botão só aparece depois que a lista de favoritos carrega | seções 20 e 22; o tempo no celular não foi medido, porque a API não registra requisições | primeiro, registrar método, rota, código e tempo na API, sem dados pessoais, para medir no celular. Depois, avaliar a validação local do token (decisão de segurança, ainda não autorizada) e mostrar o botão com o estado salvo enquanto relê |
| E | D13: sem internet, erro sem "Tentar novamente" | **Confirmada.** A falha de gravação vira `Alert` (faixa vermelha, sem ação). A falha de releitura diz "puxe a tela para tentar de novo", mas o perfil do candidato não tem "puxar para atualizar", e no detalhe do evento puxar recarrega o evento, não os favoritos | `mobile/lib/favoritos.ts` (`FALHA_AO_ATUALIZAR_FAVORITOS`), `event/[id]/candidate/[candidateId].tsx`, `event/[id]/index.tsx` | erro do favorito com ação "Tentar novamente": relê a lista ou repete o último pedido. Corrigir o texto "puxe a tela". O desfazer em caso de falha já funciona (testes da seção 22) |
| F | Logout: tela `index` preta antes do login | **Confirmada pelo código.** Ao sair, o `Stack.Protected` leva ao grupo `(auth)`, que abre pela rota `index` (`app/(auth)/index.tsx`, só um `<Redirect href="/(auth)/login"/>`). Essa rota não está declarada no `Stack` de `(auth)/_layout.tsx`, então ganha cabeçalho padrão com o título "index" e corpo vazio até o redirecionamento, seguido de uma segunda animação até o login. O layout logado também devolve `null` no instante em que a sessão some (`(app)/_layout.tsx`) | leitura das rotas | definir `login` como rota inicial do grupo `(auth)` (`unstable_settings.initialRouteName`) e declarar `index` sem cabeçalho e sem animação. A sessão continua sendo limpa antes da navegação; captcha e segurança não mudam. Verificar no celular |
| G | Mensagens diferentes de conexão | **Confirmada; são três componentes com papéis diferentes.** (1) Painel: aviso próprio junto aos indicadores, com "Tentar novamente" (D14, `(app)/index.tsx`). (2) `ErrorState`: bloco "Algo deu errado" com "Tentar novamente", usado quando **a tela não carrega** (detalhe do evento, lista de favoritos, feed). (3) `Alert` em tom de erro: **faixa vermelha sem ação**, usada quando **uma ação falha** (recusar, favoritar, convidar, alterar valor). Os textos também variam: a API usa "Não foi possível conectar ao servidor…" (`api.ts`), as leituras do Supabase usam "Sem conexão com a internet…" (`unwrap`) ou a mensagem genérica (`unwrap` sem status) | `components/ui.tsx` (`ErrorState`, `Alert`), `shared/client/api.ts`, `shared/client/events.ts` | manter a faixa vermelha no evento, como o usuário prefere. Opcional: o mesmo texto de falta de conexão nos dois clientes e "Tentar novamente" nas ações que podem ser repetidas com segurança (favorito). Nada de padronização visual automática |
| H | Listas: tocar durante a rolagem rápida não funciona | **Confirmada (regressão da correção D20) + comportamento nativo.** (1) No Android e no iOS, o primeiro toque durante o embalo só para a rolagem; isso é do sistema. (2) Com o D20, os itens das listas passaram a acompanhar a rolagem. No celular, a regra de toque do `Reveal` só é reavaliada no fim do arrasto e no fim do embalo (`fimDaRolagem`, `components/ui.tsx`). Itens que entram na tela durante o embalo ficam com `pointerEvents="none"` até a rolagem parar. Antes do D20, a posição errada fazia quase todos ficarem sempre tocáveis | `Reveal` em `ui.tsx` (regra `revealRecebeToques`, entrada < 50%) + `BlocoMedido` | manter a animação de entrada ao rolar, mas não bloquear o toque pela entrada nos itens de lista. O bloqueio continua só no empilhamento do feed, onde evita toques em cartões quase invisíveis. Não há virtualização (`ScrollView`), o que não é a causa |
| I | Ordem: Inscrições com a mais recente em cima; Eventos com a mais recente embaixo | **Confirmada; são critérios diferentes.** Inscrições: ordem de **criação da inscrição**, da mais nova para a mais antiga (`fetchMyApplications`, `order("created_at", { ascending: false })`). Meus eventos: ordem de **data do evento**, do mais próximo para o mais distante (`fetchMyEvents`, `order("inicio")`) | `shared/client/events.ts` | decisão de produto: qual critério usar em cada lista. Nada alterado |
| J | Nova proposta demora e "atualiza a tela inteira" | **Parcialmente confirmada.** No servidor, `proposeValue` faz cerca de 6 consultas em sequência: token, candidatura, evento, cobrança pendente, fechar propostas, gravar (cerca de 1,2 s). **No chat**, a tela já aplica só a mensagem nova e a substituída, sem recarregar a conversa. Ao mudar o conteúdo, a rolagem pula para o fim (`onContentSizeChange` → `scrollToEnd`). **No detalhe do evento ("Alterar valor")**, depois do `PATCH` a tela inteira recarrega (`useAction(details.reload)`: evento, inscrição, contratante e convite), e o estado `busy` é compartilhado, então "Cancelar inscrição" também gira. A tela exata do relato precisa ser confirmada | `conversa/[candidateId].tsx`, `event/[id]/index.tsx` (`Opportunity`), `eventService.proposeValue` | detalhe: atualizar só a inscrição (o valor já é mostrado na hora, seção 18) e separar o estado de carregamento por botão. Chat: rolar até o fim só se a pessoa já estava no fim. Servidor: rodar em paralelo as leituras independentes, mantendo a ordem das verificações |
| K | "Quem está contratando": o nome não é link | **Confirmada: funcionalidade inexistente.** Não existe tela de perfil do contratante (só `event/[id]/candidate/[candidateId]`, do músico). A seção é uma `View` sem toque (`event/[id]/index.tsx`, `Opportunity`). A RLS já deixa ler o perfil público do contratante (`perfil publico do contratante`) e as avaliações | lista de rotas em `mobile/app` | funcionalidade nova: precisa de decisão do grupo e registro em `docs/produto.md` |
| L | Barra de pesquisa não encontra ou não leva a lugar algum | **Hipótese.** A busca existe só no feed do músico e filtra na hora, enquanto se digita. Ela filtra **apenas os eventos que já estão no feed** (raio, estilos, acesso antecipado), procurando em título, cidade, tipo, descrição e estilos. **O nome do contratante não entra na busca**. Não há busca no servidor, e "Enviar" no teclado não faz nada, porque o filtro já foi aplicado | `filterFeed` (`shared/client/events.ts`), `FeedFiltersPanel` (`(app)/index.tsx`) | confirmar com o usuário o que foi buscado. Se for o contratante, incluir o nome na busca é funcionalidade nova (os dados do feed não trazem o nome) |
| M | Botão de envio do chat | **Aprovado pelo usuário** | teste manual | preservar |

**Testes necessários depois das correções:**
- **A/B:** unitários da regra de exibição com evento começado; no celular, chat de evento encerrado sem estimativa e sem "Propor valor".
- **C/D/E:** unitários do controle (repetir após falha); no celular, tempo com o registro da API ligado e "Tentar novamente" sem internet.
- **F:** no celular, sair três vezes e confirmar que vai direto ao login, sem tela "index"; reabrir e continuar deslogado.
- **H:** unitário de `revealRecebeToques` para itens de lista; no celular, rolar rápido e tocar.
- **J:** no celular, a posição do chat mantida e só o valor muda no detalhe.

**Riscos de regressão:**
- **F:** mexe na navegação de entrada; testar cadastro, recuperação e o link de redefinição de senha.
- **H:** só os itens de lista; o empilhamento do feed continua igual.
- **J:** paralelizar no servidor exige manter a ordem dos erros, com testes como os do favorito.

## 25. Primeira rodada de correções dos complementos (17/11/2026, sem commit)

Escopo autorizado pelo usuário, na ordem: H, A, E, C, F. Fora do escopo, e não implementados: B (texto decidido, rodada posterior), D, I, J, K e L. Nenhuma migration, nenhuma operação no hospedado, nenhum deploy, Render intocado, rotina financeira desligada, Asaas no Sandbox. **Nada validado no Expo Go.**

| Item | Causa | Correção | Arquivos | Testes novos ou ajustados |
|---|---|---|---|---|
| H | No celular, a regra de toque do `Reveal` só era reavaliada no fim da rolagem, e os itens de lista (com o D20) ficavam sem toque durante o embalo | `revealRecebeToques` não bloqueia mais itens sem empilhamento. `precisaAcompanharRolagem` só acompanha a rolagem no empilhamento. A animação de entrada ao rolar é a mesma (interpolação em `ui.tsx` intocada). O feed (empilhamento) mantém as duas regras de antes | `mobile/lib/reveal.ts`, `mobile/lib/reveal.test.ts` | item de lista tocável em qualquer posição, inclusive no embalo; feed abaixo da dobra sem toque até metade revelado; feed empilhado sem toque; o teste do D20 passou a conferir a entrada ao rolar (`revelaAoRolar`) em vez do bloqueio |
| A | O chat não buscava o início do evento | `fetchConversation` busca `inicio`. Novo `situacaoDaConversa` aplica a mesma regra de encerramento do detalhe e do servidor: conversa aberta só com evento aberto ainda não começado, ou contratado; negociação só com inscrição pendente, evento aberto e não começado. `mostraEstimativaParaContratante` passou a exigir `eventoEncerrado`. Em evento encerrado: sem estimativa, sem "Propor valor", sem envio, e aparece o aviso "Esta conversa está encerrada" (que já existia) | `shared/client/conversation.ts`, `mobile/app/conversa/[candidateId].tsx`, `mobile/app/event/[id]/index.tsx` | 5 testes: aberto e futuro, aberto e começado (inclusive no exato início), contratado depois do início, recusado/cancelado/concluído, estimativa oculta em evento encerrado |
| E | Falha de favorito sem ação; texto "puxe a tela" sem efeito | O controle guarda a última intenção de cada músico que falhou. `tentarDeNovo()` repete só essas intenções, uma vez (toques repetidos não duplicam); se não houver gravação a repetir, relê a lista. Um novo toque no mesmo músico descarta a repetição pendente. A falha continua voltando ao último estado confirmado. Texto novo: "…podem estar desatualizados." Botão "Tentar novamente" junto ao erro, no detalhe do evento e no perfil do candidato | `mobile/lib/favoritos.ts`, `mobile/lib/useFavoritos.ts`, `mobile/app/event/[id]/index.tsx`, `mobile/app/event/[id]/candidate/[candidateId].tsx` | 6 testes: repetir uma vez só, alternância rápida + falha repete o último pedido, novo toque não é sobrescrito, falha de releitura relê, texto sem "puxe", nova falha volta ao confirmado |
| C | Opacidade 0,6 durante o salvamento parecia uma segunda confirmação | O coração mantém cor e opacidade finais desde o toque (`aparenciaDoCoracao`). Durante a gravação aparece um anel pulsante discreto (`AnelDeSalvamento`, driver nativo; anel fixo com "reduzir movimento"), que some quando o servidor confirma ou quando a gravação falha e o coração volta | `mobile/components/ui.tsx`, `mobile/lib/favoritos.ts`, `mobile/app/event/[id]/index.tsx` | 3 testes: salvando com cor e opacidade finais e anel; confirmado sem segunda troca de tom; falha volta ao estado confirmado sem anel |
| F | Ao sair, o grupo `(auth)` abria pela rota `index` (só redirecionamento), com cabeçalho padrão "index" | `app/(auth)/_layout.tsx`: `unstable_settings = { anchor: "login" }` (a chave que o expo-router desta versão lê; `initialRouteName` está obsoleta) e `index` declarada sem cabeçalho e sem animação. A sessão continua sendo encerrada antes, e a troca de telas segue a mudança de estado (`Stack.Protected`). Captcha, cadastro, recuperação e redefinição não foram tocados | `mobile/app/(auth)/_layout.tsx`, `scripts/rotas-do-app.test.mjs` | 2 testes estáticos: grupo com âncora no login e `index` sem cabeçalho/animação; logout encerra a sessão sem navegar por conta própria |

**Validação automatizada:**
- `pnpm test`: **53 arquivos, 982 testes, todos aprovados**, 0 ignorados (antes: 965).
- `pnpm typecheck`: limpo. Lint da raiz: limpo (não cobre `mobile/`).
- **Lint do `mobile/`** com a configuração temporária: igual à base (57). A primeira versão do `AnelDeSalvamento` repetia o padrão `useRef(new Animated.Value)` e somava 6 avisos `react-hooks/refs`; foi reescrita com `useState` e voltou à base.
- Código sem uso: nada.
- Exports Android e web: sem erro.
- `git diff --check`: limpo.
- O backend não mudou nesta rodada, então o E2E local não foi repetido (último resultado: 67 de 67).

**Riscos que continuam:**
- **H:** um toque durante o embalo ainda é usado pelo sistema para parar a rolagem (comportamento nativo do Android e do iOS). O item passa a responder ao toque seguinte, sem esperar a rolagem acabar.
- **F:** a âncora só pôde ser verificada por leitura do expo-router e teste estático. Validar no celular a saída da conta, o cadastro, "Esqueci minha senha" e o link de redefinição.
- **C:** o botão do **perfil do candidato** continua com a indicação anterior (opacidade 0,6 + indicador pequeno), porque esta rodada tratou só o coração. Uniformizar depende de autorização.
- **A:** o encerramento usa o relógio do aparelho, como o detalhe do evento já usava; o servidor continua sendo a regra final.

**Checklist para o Expo Go (usuário):**
1. **H:** nas Inscrições (músico) e em Meus eventos (contratante), rolar rápido e tocar num item enquanto ainda rola. Depois do primeiro toque, que para a rolagem, o item abre. Os itens continuam entrando com animação. No feed, o empilhamento continua igual.
2. **A:** abrir a conversa de um evento que já começou (sem contratação). Sem "Você paga", sem "Propor valor", sem campo de mensagem, com o aviso "Esta conversa está encerrada". Num evento futuro, tudo continua como antes.
3. **E:** sem internet, favoritar. Aparece o erro com "Tentar novamente"; o coração volta. Com a internet de volta, tocar em "Tentar novamente" grava a última escolha uma vez. Repetir no perfil do candidato.
4. **C:** no detalhe do evento, favoritar. O coração fica roxo cheio na hora, com um anel pulsando enquanto salva, e não muda de tom ao confirmar.
5. **F:** sair da conta três vezes. Vai direto para o login, sem a tela "index". Testar também "Criar conta", "Esqueci minha senha" e reabrir o app deslogado.

## 26. Ajuste visual: anel do coração removido (17/11/2026, sem commit)

A pedido do usuário, saiu o anel pulsante que aparecia em volta do coração durante o salvamento (introduzido no item C da seção 25).

- **Origem:** o componente `AnelDeSalvamento` (`mobile/components/ui.tsx`), usado só no coração do cartão do candidato, no detalhe do evento (`mobile/app/event/[id]/index.tsx`, `CandidateCard`).
- **Alterado:**
  - o componente foi removido (não tinha outro uso);
  - o coração não o renderiza mais;
  - `aparenciaDoCoracao` (`mobile/lib/favoritos.ts`) deixou de ter o campo `anelDeSalvamento` e o parâmetro `salvando`;
  - os 3 testes da aparência foram ajustados para confirmar que salvando e confirmado têm a mesma aparência.
- **Mantido:**
  - o coração muda de cor no toque, com opacidade cheia;
  - a confirmação vem do servidor;
  - em caso de falha, volta ao último estado confirmado;
  - "Tentar novamente";
  - concorrência, alternância rápida e prevenção de gravações duplicadas: `criarControleDeFavoritos` intocado;
  - o estado de acessibilidade `busy` durante o salvamento;
  - o indicador do botão do perfil do candidato e todos os outros indicadores de carregamento;
  - as demais animações e o suporte a "reduzir movimento".
- **Verificação:**
  - testes dos favoritos: 26 de 26;
  - `pnpm test`: 53 arquivos, 982 de 982;
  - typecheck: limpo;
  - nada sem uso no `mobile/`;
  - lint da raiz: limpo;
  - lint do `mobile/`: igual à base (57);
  - `git diff --check`: limpo.
- **Não validado no Expo Go:** fica com o usuário.

## 27. Abertura da MUVE e diagnóstico de desempenho (17/11/2026, sem commit)

**Diagnóstico (só leitura, antes da correção):**
- **Lentidão geral:** nenhuma causa no código. O anel removido não deixou resíduo: `ui.tsx` voltou a ser idêntico ao estado anterior à rodada do anel. As mudanças posteriores não acrescentam trabalho global: H reduz ouvintes; A, E, C e F são locais. Os suspeitos são do ambiente:
  - modo de desenvolvimento do Expo Go;
  - recarregamentos acumulados;
  - carga do computador da API e do Metro durante as validações;
  - duas pilhas Supabase no Docker, a local e a cópia `muve_restauro` do ensaio, que não foi tocada.
- **Abertura travada quando deslogado:** a verificação da sessão é local. Desde `c0c0fec` ela corre junto com as fontes, então o login, com o WebView do captcha, montava no mesmo instante em que o desenho da logo começava. O desenho usa `useNativeDriver: false` e roda na thread de JavaScript. Com sessão, o `AuthGate` fica vazio enquanto busca o perfil, por isso a animação ficava melhor. Além disso, a animação começava sem esperar a logo (PNG) carregar.

**Correção autorizada:**

| Arquivo | Mudança |
|---|---|
| `mobile/components/Abertura.tsx` | O desenho só começa quando a logo carregou **e** a preferência de "reduzir movimento" foi lida; se a imagem não carregar, uma espera de 600 ms libera mesmo assim. A splash nativa é escondida nesse momento, sem quadros vazios. No fim do desenho chama `onDesenhoConcluido`. A pausa e a saída (driver nativo) seguem iguais. Durações iguais: 950 + 260 + 520 ms |
| `mobile/components/Logo.tsx` | `aoCarregar` opcional (`onLoadEnd`, que dispara também em falha). Os outros usos não mudam |
| `mobile/app/_layout.tsx` | O `AuthGate` (login ou início) só monta quando o desenho termina, ou quando a abertura acaba por qualquer caminho: limite, segundo plano, "reduzir movimento". A splash não é mais escondida pelo carregamento das fontes. Os links de autenticação passaram para `LinksDeAutenticacao`, montado desde o início dentro do `AuthProvider` |
| `mobile/lib/abertura.ts` | Regras puras `criarLargada` e `telasLiberadas` e a constante de espera da logo, para testar. O limite de segurança passou a somar a espera: 600 + 1730 + 1200 ms |
| `mobile/lib/abertura.test.ts` | 6 testes novos e 1 ajustado (o limite inclui a espera) |

**Links profundos e autenticação:**
- **Links de autenticação:** o `getInitialURL` e o ouvinte de `url` passaram a ser registrados na montagem da raiz, mais cedo que antes. Um link de recuperação aplica a sessão e marca a recuperação durante a animação. Quando as telas montam, o `AuthGate` leva a `/(auth)/reset` como antes.
- **Rotas por link:** as rotas abertas por link (`/auth`, notificações) já esperavam o `AuthGate` montar quando a sessão estava carregando. Agora esperam também o fim do desenho, cerca de 1 s.
- **Fluxos de sessão:** a limpeza da sessão, o `Stack.Protected` e os fluxos de cadastro e recuperação não mudaram.
- **Não fica preso:** o limite, a espera da logo, o segundo plano e "reduzir movimento" encerram a abertura e liberam as telas.

**Validação automatizada:**
- `pnpm test`: 53 arquivos, **988 de 988**.
- Typecheck: limpo. Nada sem uso.
- Lint da raiz: limpo. Lint do `mobile/`: igual à base (57).
- Exports Android e web: sem erro.
- `git diff --check`: limpo.

**Medição (feita):** navegador embutido, app web, deslogado, com "reduzir movimento" ligado no navegador (por isso a abertura encerra na hora; não há como desligar a preferência ali).

| Modo | Pacote JS | Login visível (com cache) | Tarefas longas |
|---|---|---|---|
| Desenvolvimento (8081) | 1490 KB | 923 ms | nenhuma |
| `--no-dev --minify` (8082) | 802 KB | 913 ms | nenhuma |

- **Resultado:** no computador não há trabalho pesado do app na abertura, e os dois modos ficam iguais.
- **O que vale:** o que importa é o celular. Um segundo servidor em modo de produção ficou aberto na porta 8082 (aba "Expo sem dev (8082)") para o usuário comparar no Expo Go.
- **Não medido:** o FPS no celular. O monitor de desempenho do React Native pode não estar disponível no modo sem desenvolvimento.

**Não validado no Expo Go:** a abertura logado e deslogado fica com o usuário.

## 28. Flash claro ao trocar de aba e tempo de carregamento (17/11/2026, sem commit)

### Flash ao trocar de aba: causa comprovada e corrigida

- **Causa:** o app não fornecia tema de navegação, então o expo-router usava o tema claro padrão (`DefaultTheme`, fundo `rgb(242, 242, 242)`, em `node_modules/expo-router/build/react-navigation/native/theming/DefaultTheme.js`).
  - Cada tela de aba fica dentro de um `Background` pintado com `colors.background` do tema (`react-navigation/elements/Background.js:82`).
  - As abas usam `animation: "fade"` (`(app)/_layout.tsx`, presente desde `6a8eea1`), que deixa as duas cenas parcialmente transparentes durante a troca (`forFade` em `SceneStyleInterpolators.js`). O fundo claro aparece por trás: é o flash.
  - Não tem relação com a correção da abertura; a combinação existia desde o redesign.
- **Correção** (`mobile/app/_layout.tsx`): `ThemeProvider` (exportado pelo expo-router) com o `DarkTheme` e as cores do app: `background` e `card` = `colors.bg`, `text` = `colors.ink`, `border` = `colors.line`, `primary` = `colors.accent`. É o jeito documentado pelo expo-router.
  - A animação `fade` das abas, os cabeçalhos (cores definidas em `stackOptions`) e a barra de abas própria (`BarraDeAbas`) não mudaram.
- **Teste:** estático em `scripts/rotas-do-app.test.mjs`: a raiz usa `ThemeProvider` com `background: colors.bg`.

### Tempo de carregamento: medido

**Medição só de leitura no hospedado**, a partir desta máquina, com as mesmas consultas das telas, mediana de 5 a 7 execuções. **Cada consulta leva cerca de 180–200 ms, quase todo ele ida e volta;** a execução no banco é desprezível, porque os dados são pequenos. O tempo de cada tela é, então, o número de idas e voltas em sequência. A medição usou a chave de serviço, que ignora a RLS, então o custo das políticas não entra. O tempo no celular inclui a rede dele e não foi medido.

| Tela | Consultas até mostrar os dados | Estimativa | Observação |
|---|---|---|---|
| Feed | `musician_feed` (RPC), depois `events in [...]`: **2 em sequência**; multas em paralelo | ~0,4 s | juntar as duas exige mudar a função no banco (migration): não feito |
| Inscrições | 1 (`event_candidates` + `events(*)`) | ~0,2 s | — |
| Meus eventos | 1 (`events` + contagem + pagamentos) | ~0,2 s | — |
| Detalhe do evento (músico) | **antes:** evento, depois inscrição + contratante + convite em paralelo, 2 em sequência. **Agora:** evento com o contratante embutido + inscrição + convite, **1 rodada** | antes 360–650 ms; agora ~180 ms (medido) | **corrigido** |
| Detalhe do evento (contratante) | evento + candidatos + `GET /events/:id/checkout` em paralelo. A situação do pagamento passa pela API: validação do token, evento, estornos atrasados, último pagamento, **4 em sequência**, e mais uma chamada à Asaas quando há Pix pendente | ~0,8 s ou mais | é o gargalo; ver abaixo |
| Perfil do candidato | candidatura com perfil + favoritos em paralelo | ~0,2 s | o botão de favorito aparece quando a lista chega |
| Voltar a uma tela | **abas:** os dados ficam na tela e são relidos em segundo plano (`useRefreshOnFocus`). **Telas empilhadas** (detalhe, perfil): montam do zero a cada entrada, sem cache | — | sem cache entre visitas |

**Corrigido nesta rodada:**
- `shared/client/events.ts`: nova `fetchEventWithContractor`, que traz o evento e o perfil público do contratante numa consulta só (embutindo `contractor_profiles` pela chave `events.contractor_id`, as mesmas colunas e permissões de antes). A resposta embutida foi conferida no esquema real, só leitura. `fetchContractor` ficou sem uso e foi removida.
- `mobile/app/event/[id]/index.tsx` (`Opportunity`): usa a consulta única, em paralelo com a inscrição e o convite.
- **4 testes:** dados iguais aos da busca separada, só colunas públicas, contratante que excluiu a conta, evento indisponível com a mesma mensagem.

**Gargalos não resolvidos, e por quê:**
- **Detalhe do contratante:** a espera é a situação do pagamento, com 4 consultas em sequência na API, mais a Asaas. Resolver exige mexer no fluxo de pagamento: paralelizar as leituras em `paymentService.syncCheckout`, ou mostrar evento e candidatos antes, com as ações de pagamento travadas até a situação chegar. As duas opções dependem de autorização, porque tocam em pagamentos.
- **Feed:** as 2 etapas só viram 1 mudando a função `musician_feed` (migration).
- **Validação do token em toda chamada à API:** decisão de segurança ainda não autorizada (seção 20).
- **Sem cache nas telas empilhadas:** criar cache é mudança de arquitetura.

**Validação automatizada:**
- `pnpm test`: 53 arquivos, **993 de 993**.
- Typecheck: limpo. Nada sem uso.
- Lint da raiz: limpo. Lint do `mobile/`: igual à base (57).
- Exports Android e web: sem erro.
- `git diff --check`: limpo.

**Desenvolvimento × produção:** a comparação no navegador está na seção 27. No celular, o servidor sem desenvolvimento continua na porta 8082.

**Não validado no Expo Go.**

## 29. Detalhe do evento do contratante: leituras da situação do pagamento em paralelo (17/11/2026, sem commit)

Autorizado pelo usuário, com a condição de não alterar regras, estados, validações ou a integração de pagamento.

- **Gargalo (seção 28):** a tela espera `GET /events/:id/checkout`. Na API, `paymentService.syncCheckout` fazia em sequência:
  1. evento, para conferir o dono;
  2. estornos atrasados a reprocessar;
  3. último pagamento (em `syncPending`), mais a Asaas quando há Pix pendente.
- **Mudança** (`backend/src/services/paymentService.ts`): as três **leituras** rodam juntas (`Promise.allSettled`). A ordem das decisões não mudou:
  - primeiro, falha ao ler o evento, ou quem não é dono: 404, **antes** de qualquer escrita ou chamada à Asaas;
  - depois, falha ao ler os estornos atrasados;
  - **se houver estorno atrasado a processar**, segue exatamente o caminho de antes: estorna e só então relê o último pagamento;
  - **se não houver** (o caso comum), usa o último pagamento lido em paralelo e aplica a mesma sincronização de antes. A lógica de `syncPending` foi extraída para `sincronizarUltimoPagamento`, sem mudar uma linha da regra.
  - **sem mudança em:** cálculos, estados, a Asaas, cobranças, estornos e o que a tela libera. Não há cache.
- **Exibição parcial da tela:** não foi feita. Com o ganho acima não pareceu necessária, e ela mexeria no bloqueio das ações financeiras.
- **Medição só de leitura no hospedado,** com as mesmas três consultas, mediana de 9 execuções: **antes 550 ms** (em sequência) → **agora 185 ms** (em paralelo).
  - Somando a validação do token, que ainda vai ao Supabase, a resposta da API cai de cerca de 0,75 s para cerca de 0,4 s, sem contar a rede do celular nem a Asaas.
  - A tela do contratante espera o mais lento entre evento, candidatos e situação do pagamento, todos em paralelo no app.
- **Outras telas analisadas:** sem consultas independentes em sequência que valha paralelizar com baixo risco.
  - **Feed:** a 2ª consulta depende da 1ª.
  - **Inscrições e Meus eventos:** 1 consulta cada.
  - **Perfil do candidato:** já em paralelo.
  - **Detalhe do músico:** resolvido na seção 28.
- **Testes:**
  - 4 novos em `paymentService.test.ts`: leituras simultâneas antes de qualquer chamada à Asaas; quem não é dono recebe 404 sem Asaas nem estorno, mesmo com as outras leituras falhando; falha na leitura do pagamento continua sendo erro; com estorno atrasado, relê depois de estornar;
  - os 158 testes de pagamento existentes passam sem alteração.
- **Validação:**
  - `pnpm test`: 53 arquivos, **997 de 997**;
  - E2E local (só Supabase local): **67 de 67**, sem resíduo;
  - typecheck: limpo;
  - lint da raiz: limpo;
  - lint do `mobile/`: igual à base (57);
  - exports Android e web: sem erro;
  - `git diff --check`: limpo.
- **Gargalos que permanecem:**
  - a validação do token em toda chamada à API (decisão de segurança);
  - a chamada à Asaas quando há Pix pendente (necessária para confirmar a situação real);
  - as 2 etapas do feed (exigiriam migration);
  - a ausência de cache nas telas empilhadas.
- **Não validado no Expo Go.**

## 30. Etapa 2 do roteiro oficial: D4, D5, D6, D7, D11 e D15 (17/11/2026, sem commit)

Base: branch `integracao/redesign-lote1`, HEAD `9127a6f`, igual ao remoto. PR #6 aberto, sem merge, `mergeable_state: clean`, 20 commits. Nenhuma migration, nada gravado no hospedado (só leituras de medição nas seções anteriores), nenhum deploy, Render intocado, rotina financeira desligada, Asaas no Sandbox, `muve_restauro` intocado. **Nada validado no Expo Go.**

**Fato decisivo, confirmado no banco:** o status de evento `CANCELADO` já existe (`event_status`) e já é tratado em todo o fluxo:
- `confirm_asaas_payment` devolve `EVENTO_INDISPONIVEL` para evento que não está ABERTO, e um Pix pago depois é estornado, como já acontecia com evento apagado;
- a RLS deixa o contratante e os inscritos verem o evento (`is_event_candidate`);
- o feed só lista ABERTO;
- as telas já têm os rótulos "Cancelado" e "Evento cancelado".

Por isso, preservar o histórico de um evento excluído **não exige migration**.

| Item | Problema | Causa | Correção | Arquivos |
|---|---|---|---|---|
| D4 | Excluir evento apagava inscrições, conversas, convites e contestações (exclusão física em cascata) | `deleteEvent` apagava a linha de `events` | **Com inscritos (qualquer situação):** o evento passa a `CANCELADO` (`events.cancelEvent`, que já existia). Inscrições, mensagens, convites e a imagem ficam. Os inscritos pendentes continuam sendo avisados. **Sem inscritos:** continua a exclusão física, com remoção da imagem, porque não há histórico a preservar. As condições para excluir não mudaram (só evento aberto, sem contratado e sem Pix em andamento). Texto da confirmação: "as conversas continuam no histórico" | `backend/src/services/eventService.ts` (`deleteEvent`), `mobile/app/event/[id]/index.tsx` |
| D5 | Cancelar a inscrição apaga a candidatura e, em cascata, a conversa; o botão agia sem confirmação | A candidatura é apagada (`deleteCandidate`) e não há como marcá-la como "desistência do músico": `motivo_recusa` só aceita `CONTRATANTE`, `OUTRO_CONTRATADO` e `EVENTO_ALTERADO`, e `candidate_messages` cai em cascata | **Feito sem migration:** (1) confirmação antes de cancelar, avisando que a conversa é apagada; (2) o servidor só aceita cancelar uma inscrição **pendente de evento aberto**. Inscrição recusada ou de evento cancelado (incluindo os cancelados pelo D4) não pode mais ser apagada pelo músico (`INSCRICAO_ENCERRADA`). **Pendente, depende de migration:** preservar a conversa no cancelamento voluntário (ver "Dependências") | `backend/src/services/eventService.ts` (`cancelApplication`), `mobile/app/event/[id]/index.tsx` |
| D6 | "Aprovar e pagar" gerava o Pix ao abrir a tela de pagamento | `openCheckout` consultava e, sem cobrança aproveitável, fazia o POST sozinho | A tela só **consulta** (`consultarCobrancaAproveitavel`, sem POST, com consultas simultâneas unificadas). Com cobrança pendente do mesmo candidato ou já paga, mostra igual a antes. Sem cobrança aproveitável, mostra "Confirmar a cobrança" com "Gerar cobrança Pix" e "Voltar sem gerar". O POST só acontece no toque e continua unificado contra cliques repetidos (`startCheckout`). O servidor continua reaproveitando a cobrança pendente do mesmo candidato. **Sem mudança:** regras, cálculo, Asaas, expiração e cancelamento da cobrança. `openCheckout` foi substituída | `shared/client/events.ts`, `mobile/app/event/[id]/checkout.tsx`, `shared/client/checkout.test.ts` |
| D7 | O músico não consegue cancelar depois do "aceite" | (a) Com Pix pendente do contratante, o servidor recusa com "pagamento em andamento" (regra de pagamento, mantida). (b) Depois da contratação, o caminho é "Ver contratação", que depende das 12 migrations (D8). Aceitar uma contraproposta **não** muda a inscrição, que continua pendente e cancelável | **Sem alteração de código.** O D6 elimina a principal origem de (a), o Pix gerado sem querer, e a cobrança pode ser cancelada pelo contratante. (b) fica bloqueado pelas migrations (Etapa 3, D8). Conversa e histórico de contratação não são apagados nesse caminho | — |
| D11 | Evento com inscrição recusada voltava ao feed (por exemplo, quando o contratante reabria as inscrições) | `musician_feed` não exclui eventos com candidatura do músico | `fetchFeed` consulta, junto com os eventos, as inscrições **recusadas** do próprio músico entre os eventos do feed (a RLS limita às próprias) e tira esses eventos. Inscrição pendente ou aprovada não esconde o evento. Acesso antecipado, raio e estilos continuam no banco, sem mudança. Se a consulta falhar, o feed mostra erro, em vez de exibir eventos recusados. **Sem migration:** uma consulta a mais, em paralelo, sem rodada extra | `shared/client/events.ts` (`fetchFeed`), `shared/client/feed.test.ts` |
| D15 | Publicar um evento recorrente era lento | `createEvent` enviava a mesma imagem uma vez por semana, **em sequência** (até 8 envios ao Storage) | Os envios das semanas rodam **em paralelo**. Cada evento continua com o próprio arquivo, porque a exclusão física de uma ocorrência remove a imagem dela e compartilhar o arquivo quebraria as outras. As gravações continuam em ordem, com o comportamento de falha de antes: as semanas anteriores ficam, as imagens já enviadas das seguintes são descartadas e, se a primeira falhar, o erro aparece. **Não foi alterado:** a imagem continua enviada sem redimensionar, porque mexer nela é mudança visual não autorizada | `backend/src/services/eventService.ts` (`createEvent`) |

**Testes novos ou ajustados:**
- **D4:** evento com inscritos é cancelado, com inscrições, mensagem e imagem preservadas e aviso só aos pendentes; sem inscritos, continua apagado; evento cancelado não aceita inscrição nem edição.
- **D5:** cancelar inscrição de evento cancelado ou já recusada é recusado e mantém o registro.
- **D6:** a consulta nunca faz POST, nem sem cobrança, nem com cobrança expirada, cancelada, estornada ou de outro candidato; consultas simultâneas fazem uma única consulta; o POST só no botão, com cliques repetidos gerando um só.
- **D11:** tira só os recusados; pendente ou aprovado mantém o evento; falha na consulta das recusas mostra erro.
- **D15:** os envios começam juntos antes de gravar, um arquivo por evento; falha no meio cria as anteriores e descarta as seguintes; falha na primeira não cria nada.

**Validação:**
- `pnpm test`: 53 arquivos, **1007 de 1007** (antes 997).
- Typecheck: limpo. Nada sem uso.
- Lint da raiz: limpo. Lint do `mobile/`: igual à base (57).
- Exports Android e web: sem erro.
- `git diff --check`: limpo.
- E2E local: 67 de 67 sem resíduo (o E2E consulta o feed pela função do banco; o filtro do D11, que roda no app, é coberto pelos testes unitários).

**Dependências e bloqueios:**
- **D5, conversa no cancelamento voluntário:** precisa de migration. Opções:
  - acrescentar um motivo de desistência do músico em `motivo_recusa` e passar a marcar a inscrição em vez de apagá-la, com reinscrição reativando a linha;
  - ou um status próprio.

  Não foi criada nem aplicada. Depende de decisão e da janela das migrations.
- **D7, cancelamento depois de contratado:** depende das 12 migrations (D8, Etapa 3).

**Para testar no Expo Go:**
1. **D4:** como contratante, excluir um evento aberto que tenha inscrito (de teste). O evento aparece como "Cancelado" em Meus eventos e some do feed. O músico continua vendo a inscrição ("Evento cancelado") e a conversa. Excluir um evento sem inscritos continua apagando.
2. **D5:** como músico, em evento aberto, "Cancelar inscrição" pede confirmação.
3. **D6:** "Aprovar e pagar" abre a tela com "Confirmar a cobrança". "Voltar sem gerar" não cria cobrança. Só "Gerar cobrança Pix" cria. Reabrir com uma cobrança pendente mostra a mesma. **Sem pagar.**
4. **D11:** com uma inscrição recusada num evento cujas inscrições foram reabertas, o evento não aparece no feed do músico recusado e continua aparecendo para os demais.
5. **D15:** publicar um evento recorrente (Muve Casa) e comparar o tempo de publicação.

## 31. Documento mestre de continuidade (17/11/2026)

O documento mestre entregue pelo usuário está registrado integralmente em `docs/EXECUCAO_PR6_CONTINUIDADE.md`, logo depois do roteiro oficial. A tabela de situação do roteiro foi atualizada com as aprovações manuais que ele informa: D13, D20, H, F, D4, D5 (cancelamento atual), D6 e D11 validados no Expo Go; D12 e D15 testados; D16, D18 e D21 ignorados; D17 corrigido. A Etapa 3 (D8, Avaliações e D19) segue não iniciada; D5 (migration) e D7 (com D8) entram no plano de migrations.

## Melhorias futuras — não implementar nesta entrega

1. Formação do músico: solo, dupla, trio, banda ou indiferente.
2. Raio de contratação para o Contratante.
3. Candidaturas em qualquer lugar do Brasil para planos pagos, com regras de deslocamento e penalidades estudadas.
4. Localização aproximada do evento antes da candidatura, respeitando a privacidade.
5. Endereço em campos separados (rua, número, bairro, complemento).
6. Preenchimento por CEP no perfil (o formulário de evento já tem).
7. Opção "Sem número".
8. Valor total com taxas para o Contratante nas contrapropostas.
9. Recorrência mensal, além da semanal.
10. Escolha de datas específicas em eventos recorrentes.
11. Músico favoritar Contratantes.
12. Contratante escolher favoritos ao criar o evento.
13. Ordenar o feed pelo valor oferecido.
14. Máscaras com preenchimento automático de data, horário, duração e valor (ex.: "2" → "02:00").
15. Penalidades proporcionais por não comparecimento.
16. Tirar a navegação redundante em Ajustes ("Estilos e recebimento" leva à mesma tela de "Editar perfil").
