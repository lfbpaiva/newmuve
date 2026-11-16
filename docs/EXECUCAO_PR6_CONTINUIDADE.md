# Execução do PR #6 — arquivo de continuidade

Registro vivo da execução que finaliza o PR #6 (`integracao/redesign-lote1` → `main`, repositório `lfbpaiva/newmuve`). Sem segredos: nenhuma chave, token ou valor de `.env` aparece aqui.

## Como retomar

1. Ler este arquivo inteiro.
2. Conferir o Git: `git status --porcelain`, `git log --oneline -5`, `git rev-list --left-right --count HEAD...origin/integracao/redesign-lote1`.
3. Conferir o PR #6 em https://github.com/lfbpaiva/newmuve/pull/6 (o `gh` não está instalado nesta máquina).
4. Rodar `pnpm typecheck`, `pnpm lint` e `pnpm test` na raiz.
5. Continuar pela seção "Próxima tarefa".

## Estado inicial (16/11/2026)

- Branch `integracao/redesign-lote1`, igual a `origin` no commit `0ba3389`.
- 95 arquivos no stage (árvore do índice `b373c50a…`), aprovados nas revisões anteriores: migrations e testes pgTAP de integridade financeira, backend (P1–P3, C6, limite de requisições, rotina com trava), mobile (rodadas de interface, R2/R4, Reveal, teclado e senha), scripts de E2E e suporte, documentação.
- Fora do stage de propósito: exclusão local de `backend/.env.example` e `mobile/.env.example`; `mobile/pnpm-lock.yaml` e `mobile/pnpm-workspace.yaml` (vestígios de uma instalação com pnpm no mobile, não entram no PR).
- PR #6 aberto, 10 commits, não mesclado.
- `mobile/node_modules` reinstalado com `npm ci` (bibliotecas do Supabase alinhadas em 2.117.2).

## Decisões

- O conjunto aprovado de 95 arquivos vira um commit próprio, sem mudança; as correções novas vêm em commits separados.
- As exclusões dos `.env.example` e os arquivos do pnpm continuam fora do PR.
- Migrations: validadas primeiro no Supabase local (Docker). Aplicação no hospedado só com exportação verificável dos dados e registrada aqui.
- Rotina financeira: continua desligada. Nenhuma variável `ENABLE_FINANCIAL_ROUTINE` ou `FINANCIAL_ROUTINE_TOKEN` é criada.

## Checkpoints

| # | Etapa | Situação |
|---|---|---|
| 1 | Auditoria do Git e do PR | concluída |
| 2 | Correções de código | concluída (falta validar no aparelho) |
| 3 | Validação das migrations no Supabase local | concluída: 33 migrations do zero, pgTAP 25 arquivos, 554 testes |
| 4 | Testes, typecheck, lint, builds | concluída: 48 arquivos, 897 testes; typecheck e lint limpos; export Android e web sem erro |
| 5 | Commits | concluída |
| 6 | Push e conferência do PR | ver seção "Push" |

## Commits criados nesta execução

- `6abbf31` feat: integridade financeira, contestação vinculada ao pagamento e ajustes do app — exatamente os 95 arquivos aprovados (árvore `b373c50a…`).
- `9ae3256` fix(api): envio de arquivos por XMLHttpRequest.
- `b3ccd5d` fix(mobile): proposta, teclado, avaliações, painel e suporte.
- Commit deste arquivo de continuidade.

## Push

- `git push origin integracao/redesign-lote1` sem force: `0ba3389..2d52582`. Local e remoto iguais.
- PR #6 aberto, não mesclado, 14 commits, sem conflitos com o `main`; CI `verificar` aprovado no `2d52582`.
- A descrição do PR ainda diz "Nenhuma migration nova" e cita 281 testes: precisa ser atualizada por alguém com acesso ao GitHub (o navegador desta máquina não está conectado).

## Observações de verificação

- `pnpm lint` na raiz encontra a pasta local `newmuve/` (cópias antigas e zips, excluída do Git por `.git/info/exclude`) e falha por dois `tsconfig`. Rodado com `npx eslint . --ignore-pattern "newmuve/**"`: sem erros. A pasta não foi tocada.
- `pnpm test:db` roda contra o projeto **vinculado (hospedado)**; não foi usado. A validação foi com `npx supabase db reset --local` e `npx supabase test db` no Docker.
- O Supabase local continua em execução no Docker; pode ser parado com `npx supabase stop`.

## Ferramentas desta máquina

- `gh` não instalado: conferir o PR pelo navegador; o push usa o `git`.
- Docker Desktop precisa ser aberto antes (`%LOCALAPPDATA%\Programs\DockerDesktop`).

## Preparação das migrations no hospedado (16/11/2026)

- Plano completo em `docs/PLANO_MIGRATIONS_HOSPEDADO.md`. Nada foi aplicado no hospedado.
- Scripts de exportação, restauração, ensaio e pré-verificação em `C:\Users\Administrador\Downloads\Claude\newmuve-backups\scripts` (fora do repositório, porque a exportação tem dados pessoais).
- Procedimento testado com o Supabase local como origem: restauração 607/607 objetos e 51/51 tabelas; 12 migrations aplicadas na cópia; pgTAP sem falhas; resultado idêntico ao banco das 33 migrations (781/781).
- **Bloqueio:** o CLI não está autenticado e o navegador não tem sessão no painel. Alguém da equipe precisa rodar `npx supabase login`; depois, `1-exportar.sh lylxorfrwuioednhukhz <pasta>`, `0-verificar-desvio.sh`, `2-restaurar-e-verificar.sh` e `3-ensaiar-migrations.sh`.
- Texto novo da descrição do PR #6 em `C:\Users\Administrador\Downloads\Claude\newmuve-backups\PR6_DESCRICAO.md` (o navegador não está conectado ao GitHub).

## Exportação real do hospedado (16/11/2026)

- CLI autenticada na conta do Muve: organização `vlbdouewndfitdumeapm`, projeto `lylxorfrwuioednhukhz` ("My Project", `us-east-2`, `ACTIVE_HEALTHY`). O projeto antigo `xxagvofwqkjpudtalduj` pertence a outra conta e não foi usado.
- Exportação em `newmuve-backups\2026-11-16-hospedado` (fora do Git, acesso só do usuário, Administradores e SISTEMA); `SHA256SUMS` conferido.
- Hospedado: 21 migrations; 5 usuários, 6 eventos, 4 pagamentos, 0 contestações, 0 multas, 12 arquivos no Storage.
- Desvio em relação à referência de 21: ACL de tabelas igual; função extra `public.rls_auto_enable()` com o event trigger `ensure_rls` (recurso do Supabase, não entra no dump); hash diferente em `claim_asaas_refund` e `finalize_asaas_refund`, com texto do dump idêntico (em investigação).
- Pré-verificação concluída: nada das 12 migrations existe ainda; nenhuma transferência repetida; 2 pagamentos `REPASSADO` com transferência viram tentativas `LEGADO` na migration 3; nenhuma operação financeira em andamento; nenhuma contestação para a migration 11.
- Hash das duas funções explicado: corpo com CRLF no hospedado; sem `\r` é idêntico; metadados iguais.
- Conexão da CLI: papel `cli_login_postgres` (membro de `postgres`, senha com validade curta); consultas `--read-only` rodam como `supabase_read_only_user`.
- Restauração na cópia isolada: 49/49 tabelas, 463/463 objetos; `ensure_rls` recriado só na cópia.
- Ensaio: 12 migrations OK, pgTAP 25 arquivos sem falha, estado final igual à referência v33; 33 objetos novos sem acesso de `anon`/`authenticated`; migration 3 cria 2 tentativas `LEGADO`; migration 11 não encerra nenhuma contestação.
- Relatório completo (com UUIDs, fora do Git): `newmuve-backups\RELATORIO_ENSAIO_2026-11-16.md`.
- Rehearsal aprovado pelo usuário em 16/11/2026; aplicação no hospedado **ainda não autorizada**.

## Preparação final (16/11/2026)

- Storage: 12 arquivos baixados para `2026-11-16-hospedado\storage`, com tamanho, MD5 (`eTag`) e SHA-256 conferidos.
- Permissões: tabelas novas com `service_role` só leitura e sem acesso de cliente; as 27 funções chamadas pelo backend do PR com `execute` só para `service_role`; 7 funções internas sem `service_role` de propósito.
- Rotina: trava livre (geração 0); sem `pg_cron`/`pg_net`; workflow só na branch do PR (0 execuções agendadas); backend do PR exige `ENABLE_FINANCIAL_ROUTINE=true`.
- **Achado crítico:** o backend do `main` roda a rotina sempre, ao iniciar e a cada 5 minutos, gravando repasses direto em `payments`. Nenhuma instância do `main` pode ficar ligada ao hospedado depois das migrations, e a URL da Render não deve ser acessada (acordaria o serviço). Sequência de implantação sem intervalo em `docs/PLANO_MIGRATIONS_HOSPEDADO.md`, seção 6.
- A sessão da CLI expirou no fim do dia ("Invalid access token"); para a janela, login de novo com a conta do Muve (`--no-browser`).
- **Checkpoint:** aguardando autorização para a janela de aplicação.

## Auditoria para o Expo Go (16/11/2026)

- Auditoria dos 51 tópicos do documento mestre, de mocks e das integrações em `docs/AUDITORIA_EXPO_GO.md`.
- Nenhum mock, credencial embutida ou login automático no código de execução; abrir já logado vem da sessão persistida e é validado pela API.
- Correções: erro da consulta de pagamento não é mais engolido na tela do contratante; salvar perfil usa a resposta do `PATCH`; sessão restaurada em paralelo com as fontes.
- Testes: typecheck e lint limpos; 897 testes; exports Android e web sem erro.
- API (3333) e Expo (8081, Expo Go) abertos em terminais visíveis para o teste no celular.
- Bloqueado por migration: Ver contratação, avaliar, estorno, contestação e repasse.
- Complemento: matriz dos 51 tópicos com testes, pendências, Expo Go e dependência de migration em cada linha; roteiro ordenado em "PRÓXIMA ETAPA — TESTES MANUAIS NO EXPO GO" (seção 7 da auditoria); bloqueados na seção 10; como continuar na seção 11.
- pnpm: o efetivo é 12.18.0 (`packageManager`, CI e Render); o `.mise.toml` com 10.34.3 só afeta quem usa `mise` e não foi alterado.
- `docs/continuidade.md` (guia geral do projeto) ainda não reflete esta etapa; revisar depois do teste no aparelho.

## Estado em que esta etapa terminou

- Nenhuma migration aplicada no hospedado (21 migrations); nenhum deploy; Render intocado; PR #6 aberto e sem merge; rotina financeira desligada; nenhuma operação financeira executada.
- **Próximo passo:** o usuário executa o roteiro da seção 7 de `docs/AUDITORIA_EXPO_GO.md` no celular.

## Pendências que dependem de pessoas

1. **Aplicar as 12 migrations novas no Supabase hospedado** — pendente de autorização específica. Riscos: plano sem backup automático; chaves legadas ainda ativas permitem que backends antigos rodem a rotina. Exige exportação verificável antes. Enquanto não aplicar, `GET /events/:id/contratacao` responde 500 (coluna `disputes.payment_id` ausente) e as avaliações ficam bloqueadas.
2. **Validação no Android (Expo Go)**: envio de foto de perfil e capa de evento (caminho XHR), teclado na conversa e na proposta, aviso de proposta em evento encerrado, autor e evento nas avaliações.
3. Muve Pro e pagamento dependem do Asaas Sandbox configurado no backend.
4. Rotina financeira continua desligada; nenhuma variável foi criada.
5. Mesclar o PR é decisão do grupo.
