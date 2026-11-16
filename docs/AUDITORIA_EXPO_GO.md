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

| # | Tópico | Estado | Evidência e arquivos | Commits | Expo Go agora? | Para concluir |
|---|---|---|---|---|---|---|
| 1 | Papel no projeto | CONCLUÍDO COM EVIDÊNCIA | trabalho seguido conforme o documento | — | — | — |
| 2 | Regras inegociáveis | CONCLUÍDO COM EVIDÊNCIA | seção 2 desta auditoria | — | — | repetir a busca antes de cada entrega |
| 3 | Estado do Git | CONCLUÍDO COM EVIDÊNCIA | seção 1; diferenças em relação ao documento explicadas | `6abbf31` | — | — |
| 4 | Estrutura do projeto | CONCLUÍDO COM EVIDÊNCIA | `mobile/`, `backend/src/`, `shared/`, `supabase/`, `scripts/` conferidos | — | — | — |
| 5 | Regras arquiteturais | CONCLUÍDO COM EVIDÊNCIA | app só lê (15 policies ativas nas migrations, todas `for select`; nenhuma nova nas 12 pendentes); escrita pela API; chaves privadas só no `backend/.env` | — | — | — |
| 6 | Tecnologias e versões | PARCIAL | Expo SDK 58, RN 0.88.1, Supabase JS 2.117.2 (`npm ls`), Node 26.13.0; `packageManager` pnpm 12.18.0; `.mise.toml` não foi revisto nesta etapa | `0ba3389` | — | conferir `.mise.toml` × CI e registrar |
| 7 | Instalação de dependências | CONCLUÍDO COM EVIDÊNCIA | `npm ls`: `supabase-js` e `postgrest-js` em 2.117.2; leituras do app com 200 depois do `npm ci` | — | sim | não rodar `pnpm install` em `mobile/` |
| 8 | Inicialização no PowerShell | CONCLUÍDO COM EVIDÊNCIA | API em 3333 (`health` 200 na rede) e Expo em 8081 abertos em terminais visíveis | — | sim | — |
| 9 | Supabase | BLOQUEADO POR MIGRATION | 21 migrations; exportação, restauração e ensaio das 12 aprovados (`docs/PLANO_MIGRATIONS_HOSPEDADO.md`) | `1050af2` | parcial | janela de aplicação autorizada |
| 10 | Chaves Supabase | PARCIAL | API local usa `sb_secret`; app usa `sb_publishable`; chaves legadas ativas; consumidores fora do repositório (Render) não verificados | — | não se aplica | confirmar a chave da Render; decidir desativar as legadas |
| 11 | Asaas | IMPLEMENTADO, MAS NÃO TESTADO | URL Sandbox no `backend/.env`; validações anteriores não repetidas nesta etapa; webhook `muve-webhook` não conferido | `6abbf31` | parcial (Pix sim; estorno e repasse bloqueados) | testar Pix no Sandbox; apontar o webhook para a API |
| 12 | Rotina financeira | CONCLUÍDO COM EVIDÊNCIA | log da API: desabilitada; sem variáveis; trava ensaiada na cópia | `6abbf31` | — | manter desligada |
| 13 | Autenticação | CONCLUÍDO COM EVIDÊNCIA (código) | `AuthContext.tsx`, `client.ts`, `authLinks.ts`; `GET /api/me` sem token = 401 | — | sim | login e logout no aparelho |
| 14 | Contas de demonstração | IMPLEMENTADO, MAS NÃO TESTADO | 5 usuários no hospedado; `scripts/contas-demo.mjs` não executado | — | sim | entrar com as duas contas |
| 15 | Ausência de mocks | CONCLUÍDO COM EVIDÊNCIA | seção 2 | — | — | — |
| 16 | P0 Ver contratação (500) | BLOQUEADO POR MIGRATION | causa: `disputes.payment_id` (migration 11) | `6abbf31` | não | aplicar as 12 migrations |
| 17 | P0 Publicação e imagens | IMPLEMENTADO, MAS NÃO TESTADO | `FormData` com arquivo vai por `XMLHttpRequest` (`shared/client/api.ts`); 4 testes; vale para evento, edição e foto de perfil | `9ae3256` | sim | publicar e editar evento com imagem, trocar foto de perfil |
| 18 | P0 Migrations pendentes | BLOQUEADO POR MIGRATION | backup completo, ensaio aprovado, sequência de implantação pronta | `1050af2` | — | autorização da janela |
| 19 | P0 Avaliações | PARCIAL / BLOQUEADO POR MIGRATION | exibição com autor e evento (`fetchReviewsOf`, `ReviewsSection`), funciona no banco atual; envio fica na tela de contratação (500) | `b3ccd5d` | só a exibição | aplicar migrations; avaliar nos dois sentidos |
| 20 | P1 Proposta em evento encerrado | IMPLEMENTADO, MAS NÃO TESTADO | "Alterar valor" e cancelamento só com evento aberto e não iniciado; aviso informativo nos demais casos | `b3ccd5d` | sim | conferir aberto, iniciado e encerrado |
| 21 | P1 Teclado no chat e na proposta | IMPLEMENTADO, MAS NÃO TESTADO | `EvitaTeclado` na conversa e na tela do evento | `b3ccd5d` | sim | digitar e enviar com o teclado aberto |
| 22 | P1 Salvamento de filtros | PARCIAL | nesta etapa: a tela usa o perfil devolvido pelo `PATCH /api/me` e não faz mais o `GET /api/me` extra; o backend ainda lê o perfil 3 vezes no `PATCH`; sem medição | este commit | sim | medir antes e depois no aparelho |
| 23 | P1 Indicadores do painel | IMPLEMENTADO, MAS NÃO TESTADO | erro mostra "—" no lugar do número; puxar para atualizar tenta de novo | `6abbf31` | sim | testar sem rede |
| 24 | P1 Erros genéricos | PARCIAL | códigos `SEM_CONEXAO`, `TEMPO_ESGOTADO`, HTTP 401/403/429/5xx e mensagem do servidor; falha de rede registra o motivo no log; o upload não cai mais em "sem conexão" por formato | `9ae3256` | sim | — |
| 25 | P1 OAuth e recuperação | PENDENTE (configuração externa) | código usa `Linking.createURL("auth")`; Redirect URLs do painel não conferidas; `ALLOWED_REDIRECTS` só com `muve://auth` | — | depende do painel | incluir `exp://192.168.0.5:8081/--/auth` nas Redirect URLs (decisão de configuração) |
| 26 | Leituras diretas | IMPLEMENTADO, MAS NÃO TESTADO | 200 em `/rest/v1/events` e `/notifications` em teste anterior | — | sim | conferir telas do músico, favoritos e avaliações |
| 27 | P2 Muve Pro lento | PENDENTE | `GET /api/me/plano` ainda sincroniza e busca o QR Code em sequência; alteração mexe em regra financeira, não feita | — | sim (assinatura aguardando pagamento existente) | separar o QR Code da consulta do plano, com testes |
| 28 | P2 Editar perfil e logout | PARCIAL | sem mudança no formulário; logout não medido | — | sim | medir |
| 29 | P2 Ajuda e suporte | IMPLEMENTADO, MAS NÃO TESTADO | erro de "sem app de e-mail" aparece logo acima do grupo Conta | `b3ccd5d` | sim | testar nos dois perfis |
| 30 | P2/P3 Reveal | IMPLEMENTADO, MAS NÃO TESTADO | `ui.tsx`, `reveal.ts`, testes em `reveal.test.ts` | `6abbf31` | sim | rolagens do roteiro |
| 31 | P2 Cursor do e-mail | PENDENTE | `sanitizeEmail` a cada tecla; não reproduzido, não alterado | — | sim | reproduzir no Android antes de mudar |
| 32 | Funcionalidades financeiras | BLOQUEADO POR MIGRATION | pgTAP e ensaio aprovados; integração real só depois das migrations | `6abbf31` | não | janela + Sandbox |
| 33 | Inicialização | IMPLEMENTADO, MAS NÃO TESTADO | nesta etapa: a sessão começa a ser restaurada junto com as fontes; a tela continua bloqueada até a validação | este commit | sim | medir no aparelho |
| 34 | Medições | PENDENTE | nenhuma medição no aparelho | — | sim | medir com `npx expo start --no-dev --minify` |
| 35 | Fase 0 | CONCLUÍDO COM EVIDÊNCIA | seções 1 a 4 | — | — | — |
| 36 | Fase 1 | PARCIAL | itens 1–8 com código; teste no aparelho pendente; item 9 depende do painel | `9ae3256`, `b3ccd5d` | sim | roteiro da seção 7 |
| 37 | Fase 2 | BLOQUEADO POR MIGRATION | ensaio aprovado | `1050af2` | — | janela |
| 38 | Fase 3 | PENDENTE | depende do teste no aparelho | — | sim, exceto contratação | roteiro da seção 7 |
| 39 | Fase 4 | BLOQUEADO POR MIGRATION | estorno, contestação e repasse dependem das migrations | — | só Pix | janela |
| 40 | Fase 5 | PENDENTE | sem medições | — | sim | medir |
| 41 | Fase 6 | PARCIAL | revisão de segredos, mocks e diff feita; Android e Web no aparelho pendentes | — | — | — |
| 42 | Testes automatizados | CONCLUÍDO COM EVIDÊNCIA | seção 8 | — | — | — |
| 43 | Critérios de aceitação | PENDENTE | P0 de contratação bloqueado; fluxos manuais não feitos | — | — | migrations + roteiro |
| 44 | Git e PR | CONCLUÍDO COM EVIDÊNCIA | arquivos adicionados um a um; sem `git add -A`; PR sem merge | — | — | — |
| 45 | Decisões autônomas | CONCLUÍDO COM EVIDÊNCIA | correções da seção 6 | — | — | — |
| 46 | Decisões que exigem aprovação | CONCLUÍDO COM EVIDÊNCIA | migrations, Render, chaves e redirects deixados para decisão | — | — | — |
| 47 | Escolha entre alternativas | CONCLUÍDO COM EVIDÊNCIA | `XMLHttpRequest` só para `FormData` (sem mudar as leituras) | `9ae3256` | — | — |
| 48 | Registro de etapas | CONCLUÍDO COM EVIDÊNCIA | `docs/EXECUCAO_PR6_CONTINUIDADE.md` | — | — | — |
| 49 | Documento de continuidade | PARCIAL | continuidade, plano e esta auditoria atualizados; `docs/continuidade.md` geral não revisto | — | — | revisar depois do teste no aparelho |
| 50 | Relatório final | CONCLUÍDO COM EVIDÊNCIA | este documento e o relatório da etapa | — | — | — |
| 51 | Começar | CONCLUÍDO COM EVIDÊNCIA | reconhecimento feito antes de qualquer alteração | — | — | — |

## 6. Correções desta etapa

| # | Problema | Causa | Correção | Arquivos | Validação |
|---|---|---|---|---|---|
| 1 | Na tela do evento do contratante, uma falha ao consultar o pagamento era tratada como "nenhum pagamento em andamento" e liberava Editar, Excluir e aprovar outro candidato | `fetchCheckoutStatus(eventId).catch(() => null)` | o erro chega à tela, que mostra `ErrorState` com "Tentar novamente"; a rota usa só colunas que já existem no hospedado | `mobile/app/event/[id]/index.tsx` | typecheck; teste no aparelho pendente |
| 2 | Salvar perfil e filtros fazia uma requisição a mais | a tela descartava o perfil devolvido pelo `PATCH /api/me` e chamava `GET /api/me` | `refreshMe` aceita o perfil já atualizado; a tela passa a resposta do `PATCH` | `shared/client/AuthContext.tsx`, `mobile/app/account/edit.tsx` | typecheck; sem medição |
| 3 | Abertura esperava as fontes para começar a restaurar a sessão | `AuthProvider` só montava depois do `useFonts` | `AuthProvider` monta logo; a interface (e o `AuthGate`) continua esperando as fontes e a validação da sessão | `mobile/app/_layout.tsx` | typecheck; export Android e web |

## 7. Roteiro do teste no celular

Use as contas de demonstração já existentes (documento mestre, seção 14). Não rode `scripts/contas-demo.mjs`. Como saber que é real: cada ação aparece no terminal da API (requisições com o código HTTP) e os dados continuam depois de fechar e reabrir o app; erros aparecem como mensagem, nunca como sucesso.

| Funcionalidade | Agora? | Conta | Dados prévios | Configuração externa | Migration | Esperado |
|---|---|---|---|---|---|---|
| Login, logout, sessão | sim | qualquer | conta existente | captcha (chave definida) | não | entra; logout volta ao login; reabrir mantém a sessão até o logout |
| Recuperação de senha | depende | qualquer | e-mail com caixa acessível | Redirect URLs do Supabase com `exp://…` | não | link abre o app na tela de nova senha; sem isso abre a Site URL (limitação conhecida) |
| Cadastro com confirmação | depende | nova | — | `ALLOWED_REDIRECTS` com `exp://*` | não | e-mail volta ao app |
| Google | depende | — | — | provedor Google ativo e Redirect URLs | não | sem o provedor, mensagem "ainda não foi ativado" |
| Perfil e edição (com foto) | sim | qualquer | — | Storage (bucket `avatars`) | não | foto nova aparece e continua após reabrir; a URL antiga é apagada |
| Filtros do músico (estilos, raio) | sim | músico | — | — | não | feed muda; persiste após reabrir |
| Feed | sim | músico | eventos abertos (4 no hospedado) | — | não | lista real; vazio com explicação quando nada combina |
| Publicar e editar evento com imagem | sim | contratante | — | Storage (bucket `event-banners`) | não | evento aparece com a imagem; edição troca a imagem |
| Inscrição e proposta | sim | músico | evento aberto | — | não | inscrição criada; "Alterar valor" só com evento aberto e não iniciado |
| Candidatos, aprovar, recusar | sim | contratante | candidatura | — | não | lista real |
| Contratar (Pix) | sim, com cuidado | contratante | candidato | Asaas Sandbox | não para gerar o Pix | QR Code do Sandbox; não há dinheiro real |
| Ver contratação | **não** | ambos | evento contratado ou concluído | — | **11** | hoje dá 500 |
| Avaliar | **não** | ambos | evento concluído | — | **11** (tela de contratação) | — |
| Ver avaliações recebidas | sim | qualquer | 1 avaliação no hospedado | — | não | autor e evento aparecem |
| Chat e proposta de valor | sim | ambos | candidatura | Realtime do Supabase | não | mensagens nos dois aparelhos; teclado não cobre o campo |
| Cancelar contratação paga, estorno, contestação, não comparecimento | **não** | ambos | contratação paga | Asaas Sandbox | **1, 3, 4, 7, 11, 12** | hoje dão erro, sem chamar a Asaas |
| Painel e indicadores | sim | contratante | eventos | — | não | números reais; "—" sem rede |
| Favoritos, agenda, notificações | sim | contratante / ambos | — | — | não | listas reais |
| Muve Pro / Muve Casa | sim | músico / contratante | assinatura existente | Asaas Sandbox | não | pode demorar (tópico 27) |
| Ajuda e suporte | sim | ambos | — | app de e-mail | não | abre o e-mail ou mostra aviso perto do item |
| Reveal | sim | qualquer | listas | — | não | blocos aparecem ao rolar; toques funcionam após o embalo |
| Erros e estados vazios | sim | qualquer | — | desligar a rede | não | mensagens de erro com "Tentar novamente" |

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
