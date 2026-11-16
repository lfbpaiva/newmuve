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

## Pendências que dependem de pessoas

1. **Aplicar as 12 migrations novas no Supabase hospedado** — pendente de autorização específica. Riscos: plano sem backup automático; chaves legadas ainda ativas permitem que backends antigos rodem a rotina. Exige exportação verificável antes. Enquanto não aplicar, `GET /events/:id/contratacao` responde 500 (coluna `disputes.payment_id` ausente) e as avaliações ficam bloqueadas.
2. **Validação no Android (Expo Go)**: envio de foto de perfil e capa de evento (caminho XHR), teclado na conversa e na proposta, aviso de proposta em evento encerrado, autor e evento nas avaliações.
3. Muve Pro e pagamento dependem do Asaas Sandbox configurado no backend.
4. Rotina financeira continua desligada; nenhuma variável foi criada.
5. Mesclar o PR é decisão do grupo.
