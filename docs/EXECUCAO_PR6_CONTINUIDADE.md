# Execução do PR #6 — arquivo de continuidade

Registro vivo da execução que finaliza o PR #6 (`integracao/redesign-lote1` → `main`, repositório `lfbpaiva/newmuve`). Sem segredos: nenhuma chave, token ou valor de `.env` aparece aqui.

## Como retomar

1. Ler este arquivo inteiro.
2. Conferir o Git: `git status --porcelain`, `git log --oneline -5`, `git rev-list --left-right --count HEAD...origin/integracao/redesign-lote1`.
3. Conferir o PR #6 em https://github.com/lfbpaiva/newmuve/pull/6 (o `gh` não está instalado nesta máquina).
4. Rodar `pnpm typecheck`, `pnpm lint` e `pnpm test` na raiz.
5. Continuar pela seção "Próxima tarefa".

## Roteiro oficial de continuidade

Registrado em 17/11/2026, conforme definido pelo usuário. Texto integral abaixo. Este roteiro prevalece sobre qualquer reorganização feita no chat. Novas descobertas entram como complemento, sem alterar os itens originais.

### ROTEIRO OFICIAL DE CONTINUIDADE — NEWMUVE

#### ETAPA 1 — Correções independentes de migrations

Itens originais:

* D1 — Resposta HTTP 201 sem corpo nas rotas de convite/contestação.
* D9 — Atualização de notificações lidas na tela.
* D12 — Atualização de contrapropostas e apresentação dos valores no chat.
* D13 — Desempenho dos favoritos.
* D14 — Aviso de falta de conexão.
* D20 — Medição e funcionamento do Reveal.

Investigações e correções adicionais vinculadas à etapa:

* D3 — Regra de visibilidade dos eventos para músicos sem Muve Pro.
* Logout — Travamento da animação e exposição de detalhes técnicos.
* D12 — Exibição ao Contratante do valor efetivamente pago, incluindo taxas aplicáveis.

#### ETAPA 2 — Operações sensíveis e correções que exigem análise arquitetural

* D4 — Preservar histórico ao excluir eventos.
* D5 — Cancelamento de inscrição e preservação das conversas.
* D6 — Evitar geração acidental de Pix/checkout.
* D7 — Cancelamento após aceite.
* D11 — Eventos recusados no feed.
* D15 — Desempenho de imagens e recorrências.

#### ETAPA 3 — Pendências e bloqueios

* D8 — “Ver contratação” e dependência de migrations.
* Avaliações — Investigar origem dos registros e fluxo.
* D16 — Recorte de fotos.
* D17 — Aparência do botão de chat.
* D18 — Lentidão na abertura e captcha.
* D19 — Máscaras de datas, horários e valores.
* D21 — Histórico do letreiro de estilos. Foi investigado e removido no commit `6a8eea1`; não restaurar sem autorização específica.

#### REGRAS DE ACOMPANHAMENTO

* Não remover itens do roteiro original.
* Não substituir itens por novas classificações ou numerações.
* Novas descobertas devem ser registradas como complementos, sem apagar os itens originais.
* Cada item deve ter status baseado em evidências: pendente, em investigação, implementado, validado automaticamente ou validado manualmente no Expo Go.
* Implementação não significa validação.
* Testes automatizados não substituem testes manuais no Expo Go.
* D1 continua validado localmente e pendente no Supabase hospedado. Não realizar a gravação de convite sem autorização explícita.
* A próxima atividade continua sendo aguardar e analisar os resultados dos testes manuais no Expo Go.

### Situação de cada item (complemento, 17/11/2026)

Status com evidência, usando só os termos das regras acima. Os detalhes estão em `docs/AUDITORIA_EXPO_GO.md`. Esta tabela será atualizada a cada rodada, sem mexer no roteiro.

| Etapa | Item | Status | Evidência |
|---|---|---|---|
| 1 | D1 | implementado; validado automaticamente (unitários e E2E local); **pendente no Supabase hospedado** | auditoria, seções 18 e 22; a gravação real de convite não foi autorizada (17/11) |
| 1 | D9 | implementado; validado automaticamente; validado manualmente no Expo Go | seção 18; validação informada pelo usuário |
| 1 | D12 (atualização de contrapropostas) | implementado; validado automaticamente; testado manualmente pelo usuário (documento mestre de 17/11: "Concluído e testado"); a lentidão da nova proposta (complemento J) segue como observação | seções 18, 24 e documento mestre |
| 1 | D13 | implementado; validado automaticamente; **validado manualmente no Expo Go** (documento mestre de 17/11: "Concluído e aprovado"; favoritos muito responsivos) | seções 18, 19, 22, 24, 25, 26 e documento mestre |
| 1 | D14 | implementado; validado automaticamente; validado manualmente no Expo Go | seções 18 e 19; validação informada pelo usuário |
| 1 | D20 | implementado; validado automaticamente; **validado manualmente no Expo Go**, inclusive o ajuste de toque H (documento mestre de 17/11) | seções 18, 24, 25 e documento mestre |
| 1 | D3 | investigação concluída por consulta só de leitura; regra mantida sem alteração; convite × feed é decisão de produto futura | seções 20 e 21 |
| 1 | Logout | avisos técnicos do Expo Go Android corrigidos; tela "index" preta (F) **validada manualmente no Expo Go** (documento mestre de 17/11) | seções 20, 22, 24, 25 e documento mestre |
| 1 | D12 (valor pago pelo Contratante, com taxas) | implementado; validado automaticamente; testado manualmente pelo usuário (documento mestre de 17/11); B (texto do topo) adiado | seções 22, 24, 25 e documento mestre |
| 2 | D4 | implementado (exclusão com inscritos vira `CANCELADO`, histórico preservado); validado automaticamente; **validado manualmente no Expo Go** (documento mestre de 17/11) | seção 30 e documento mestre |
| 2 | D5 | implementado em parte; o cancelamento atual foi **validado manualmente no Expo Go**; preservar a conversa no cancelamento voluntário **depende de migration** (não concluído) | seção 30 e documento mestre |
| 2 | D6 | implementado (o Pix só é gerado depois da confirmação); validado automaticamente; **validado manualmente no Expo Go**, sem pagamento real (documento mestre de 17/11) | seção 30 e documento mestre |
| 2 | D7 | pendente: sem alteração de código; depende de D8 e das migrations; reavaliar junto com D8 | seção 30 e documento mestre |
| 2 | D11 | implementado; validado automaticamente; **validado manualmente no Expo Go** (documento mestre de 17/11); demora de login após uma recusa observada, sem causa comprovada (melhoria futura, não reabrir sem investigação) | seção 30 e documento mestre |
| 2 | D15 | implementado (envio das imagens da recorrência em paralelo); validado automaticamente; testado pelo usuário (documento mestre de 17/11); melhorias de produto adiadas | seção 30 e documento mestre |
| 3 | D8 | pendente (bloqueado pelas 12 migrations) | seção 10 |
| 3 | Avaliações | investigação concluída (origem dos registros e fluxo); envio bloqueado pelas migrations | seção 14 |
| 3 | D16 | ignorado por decisão do usuário (recorte de fotos não prejudica o app) | documento mestre |
| 3 | D17 | validado manualmente no Expo Go em 17/11: o botão de envio fica mais claro com texto; aprovado pelo usuário, preservar | seções 13 e 24 |
| 3 | D18 | ignorado por decisão do usuário (lentidão sem interação) | documento mestre |
| 3 | D19 | pendente (melhoria futura nº 14) | seção 13 |
| 3 | D21 | ignorado: letreiro removido em `6a8eea1`; não restaurar | documento mestre |

### Complementos da rodada de testes de 17/11/2026

Novas descobertas, registradas sem alterar os itens originais. Detalhes, evidências e correções propostas na seção 24 de `docs/AUDITORIA_EXPO_GO.md`. Todas aguardam autorização.

| Complemento | Ligado a | Status |
|---|---|---|
| A. Estimativa em conversa de evento encerrado (o chat não busca o início do evento) | Etapa 1, D12 | implementado em 17/11; validado automaticamente; validação manual pendente |
| B. Linha "Você paga" no topo depois de proposta recusada (é o valor da inscrição atual) | Etapa 1, D12 | **decisão do usuário (17/11):** usar "Para aprovar a inscrição de R$ Y, você paga R$ X"; implementar em rodada posterior |
| C. Coração com dois tons (opacidade de "salvando") | Etapa 1, D13 | implementado em 17/11; anel removido a pedido do usuário (seção 26); validado com D13 no Expo Go (documento mestre) |
| D. Perfil do músico ainda lento | Etapa 1, D13 | em investigação (falta medir no celular; propõe registro de tempo na API) |
| E. Erro de favorito sem "Tentar novamente"; texto "puxe a tela" sem efeito | Etapa 1, D13 | implementado em 17/11; validado automaticamente; validação manual pendente |
| F. Tela "index" preta no logout (rota `(auth)/index` com redirecionamento) | Etapa 1, Logout | implementado em 17/11; **validado manualmente no Expo Go** (documento mestre) |
| G. Três componentes de erro com papéis diferentes (painel, `ErrorState`, `Alert`) | Etapa 1, D14 | em investigação concluída; faixa vermelha no evento preservada por preferência do usuário |
| H. Toque durante a rolagem rápida nas listas (regra de toque do Reveal nas listas, efeito do D20) | Etapa 1, D20 | implementado em 17/11; **validado manualmente no Expo Go** (documento mestre) |
| I. Ordem diferente entre Inscrições e Meus eventos | novo | em investigação concluída; decisão de produto |
| J. Nova proposta lenta e recarga da tela no detalhe | Etapa 1, D12 | em investigação; tela exata a confirmar |
| K. Nome do contratante sem link (não existe perfil do contratante) | novo | funcionalidade nova; decisão do grupo |
| L. Busca do feed (só filtra o que já está no feed; não busca contratante) | novo | em investigação (confirmar o que foi buscado) |

## Documento mestre de continuidade (17/11/2026)

Registrado conforme entregue pelo usuário. Só os níveis de título foram rebaixados para caber neste arquivo; o conteúdo é o original. Ele complementa o roteiro oficial acima e não o substitui.

### NEWMUVE — DOCUMENTO MESTRE DE CONTINUIDADE

**Data:** 17/11/2026
**PR:** #6
**Branch:** `integracao/redesign-lote1`
**HEAD informado:** `9127a6f`

#### 1. OBJETIVO ATUAL

Concluir a revisão técnica do PR #6, resolver as pendências realmente necessárias, organizar as migrations e preparar o aplicativo para uma versão funcional e segura.

Prioridades:
- Evitar retrabalho.
- Preservar as funcionalidades aprovadas.
- Não reabrir correções concluídas sem evidência de regressão.
- Economizar o limite de utilização do Claude.
- Agrupar tarefas e testes em lotes.
- Não ampliar desnecessariamente o escopo.

#### 2. ETAPA 1 — CORREÇÕES INDEPENDENTES

##### Implementações concluídas

| Item | Descrição | Situação |
|---|---|---|
| D9 | Atualização de notificações lidas | Concluído |
| D12 | Contrapropostas e total do contratante | Concluído e testado |
| D13 | Desempenho e robustez dos favoritos | Concluído e aprovado |
| D14 | Aviso de falta de conexão | Concluído |
| D20 | Medição e funcionamento do Reveal | Concluído e testado |

Correções complementares:
- H — Toques durante a rolagem.
- A — Conversa de evento encerrado.
- E — Recuperação de favoritos.
- C — Animação do coração, posteriormente simplificada com remoção do círculo.
- F — Tela preta/index no logout.

Todas foram implementadas e submetidas aos testes correspondentes. H e F receberam aprovação manual.

##### Pendência

**D1 — Respostas HTTP 201 sem corpo**

- Correção implementada.
- Testada localmente.
- Validação hospedada ainda não realizada.
- Depende de autorização para gravar um convite real no Supabase hospedado.

Não repetir a implementação.

#### 3. ETAPA 2 — OPERAÇÕES SENSÍVEIS

A execução do lote foi realizada pelo Claude.

| Item | Resultado |
|---|---|
| D4 | Implementado e aprovado no Expo Go |
| D5 | Cancelamento testado e aprovado; preservação da conversa depende de migration |
| D6 | Implementado e aprovado no Expo Go |
| D7 | Sem alteração de código; dependência de D8 |
| D11 | Implementado e aprovado no Expo Go |
| D15 | Otimização implementada e testada; melhorias funcionais futuras identificadas |

##### Detalhes importantes

**D4 — Exclusão de eventos**
- Eventos com inscritos passam a CANCELADO.
- Histórico, inscrições e conversas são preservados.
- Eventos sem inscritos continuam sendo excluídos normalmente.
- Teste manual aprovado.

**D5 — Cancelamento de inscrição**
- Confirmação antes do cancelamento implementada.
- Comportamento atual aprovado no Expo Go.
- Preservar a conversa após desistência ainda exige migration.
- Não considerar essa parte concluída.

**D6 — Pix**
- Abrir checkout não cria cobrança.
- Consultar cobrança não cria cobrança.
- Geração exige confirmação explícita.
- Cobrança pendente pode ser reaproveitada.
- Testado sem pagamento real.

**D7 — Cancelamento após aceite**
- Não recebeu alteração de código.
- Parte do fluxo depende de D8 e das migrations.
- Continua pendente.

**D11 — Eventos recusados**
- Eventos recusados pelo músico são filtrados do feed.
- Testado e aprovado no Expo Go.
- Foi percebida uma demora no login após uma recusa, mas não há causa comprovada.
- Não reabrir sem investigação específica.

**D15 — Recorrências**
- Upload das imagens das ocorrências passou a ocorrer em paralelo.
- Testes automatizados aprovados.
- Melhorias de produto identificadas e adiadas.

##### Resultados automatizados informados pelo Claude

- Suíte completa: 1007/1007.
- E2E local: 67/67.
- Typecheck: limpo.
- Lint da raiz: limpo.
- Lint mobile: mesmos 57 erros preexistentes.
- Exports Android e web: aprovados.
- Diff-check: limpo.

Os resultados automatizados não substituem os testes manuais no Expo Go.

#### 4. ETAPA 3 — PENDÊNCIAS

Não iniciada.

| Item | Descrição | Dependência |
|---|---|---|
| D8 | Ver contratação | Migrations e análise do fluxo |
| Avaliações | Origem dos registros e funcionamento | Investigação |
| D19 | Máscaras de datas, horários e valores | Análise e implementação |

D5 também precisa ser incorporado ao planejamento de migrations.

D7 deve ser reavaliado quando D8 for tratado.

#### 5. ITENS IGNORADOS OU ENCERRADOS

| Item | Situação |
|---|---|
| D16 | Ignorado — recorte de fotos não prejudica o aplicativo |
| D17 | Corrigido — botão de chat |
| D18 | Ignorado — lentidão sem interação |
| D21 | Ignorado — letreiro de estilos removido anteriormente; não restaurar |

#### 6. MELHORIAS FUTURAS

Não implementar durante a conclusão das correções atuais, salvo autorização expressa.

##### Interface e usabilidade
1. Corrigir campos que ficam sobrepostos pelo teclado.
2. Avaliar a remoção dos botões Estilos e Recebimento do perfil do músico, pois ambos direcionam para Editar Perfil.

##### Eventos recorrentes
1. Disponibilizar o local do evento para o músico avaliar a participação.
2. Criar uma agenda que permita visualizar as datas das recorrências.
3. Permitir inscrição em datas específicas, em vez de tratar a recorrência sem essa flexibilidade.

##### Desempenho
1. Investigar a demora de login percebida após a recusa de um músico.
2. Não presumir que a recusa seja a causa sem evidências.

#### 7. FUNCIONALIDADES APROVADAS QUE DEVEM SER PRESERVADAS

O usuário relatou que, após as últimas correções:

- A navegação entre telas está extremamente ágil.
- Os flashes brancos desapareceram.
- O botão de favoritos está muito responsivo.
- O Reveal e os efeitos visuais estão funcionando corretamente.
- O logout não apresenta mais a tela preta/index intermediária.
- A abertura MUVE e a animação da logo melhoraram.

Não reabrir essas correções sem evidência concreta de regressão.

Preservar:
- Redesign MUVE.
- Reveal e parallax.
- Barra fixa de título e cachê.
- Cartões empilhados.
- Animações de entrada.
- Splash Screen.
- Favoritos.
- Autenticação e navegação.
- Conversas, propostas e contrapropostas.
- Regras financeiras existentes.

#### 8. MIGRATIONS — PLANEJAMENTO

Pendências conhecidas:
- D1: validação hospedada.
- D5: preservar conversa após desistência.
- D8: fluxo de contratação.
- Avaliações: investigar dependências.

É necessário:
1. Identificar migrations já existentes.
2. Conferir dependências e ordem de execução.
3. Identificar alterações de schema necessárias.
4. Avaliar impacto sobre dados existentes.
5. Preparar um plano consolidado.

Não aplicar migrations no Supabase hospedado sem autorização expressa.

#### 9. RESTRIÇÕES INEGOCIÁVEIS

- Não aplicar migrations hospedadas.
- Não fazer deploy.
- Não alterar Render.
- Não realizar operações financeiras reais.
- Asaas exclusivamente Sandbox.
- Não fazer merge do PR #6.
- Não fazer commit ou push sem autorização.
- Não executar comandos Git destrutivos.
- Não descartar alterações existentes.
- Não parar ou remover `muve_restauro`.
- Não introduzir mocks no runtime.
- Não declarar testes manuais que não foram realizados.

#### 10. PROCEDIMENTO OBRIGATÓRIO PARA FUTUROS SNIPPETS

Antes de preparar qualquer snippet ou comando de implementação para Claude:

1. Consultar este documento e o histórico das conversas.
2. Conferir o planejamento e a documentação do repositório.
3. Verificar o que já foi implementado.
4. Distinguir implementação, validação automatizada e aprovação manual.
5. Excluir tarefas concluídas e aprovadas.
6. Identificar dependências e bloqueios.
7. Preparar somente o escopo realmente pendente.

##### Execução dos testes

Sempre orientar Claude a:
- Organizar os testes pertinentes em lote.
- Evitar executar repetidamente a mesma suíte durante pequenas alterações.
- Agrupar as correções compatíveis.
- Executar os testes direcionados necessários.
- Fazer uma validação completa consolidada ao final.
- Apresentar resultados, falhas, limitações e comparação com o baseline.

Esse procedimento é obrigatório porque o usuário observou que o Claude trabalha melhor dessa forma.

#### 11. PRÓXIMOS MARCOS

1. Consolidar este documento na documentação do repositório.
2. Revisar o estado atual do PR #6.
3. Organizar o inventário e o plano de migrations.
4. Resolver D5 e D8 conforme as dependências identificadas.
5. Tratar Avaliações e D19.
6. Fazer uma revisão abrangente de todas as alterações desde que o projeto foi assumido após Luiz.
7. Verificar telas, componentes, funcionalidades visuais, crashes e integridade dos fluxos.
8. Preparar a versão final para revisão e autorização das migrations.

**O objetivo é finalizar uma versão segura e funcional, sem retrabalho e sem comprometer as funcionalidades já aprovadas.**

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

## Rodada de testes no Expo Go e investigação (16/11/2026)

- Git conferido antes do registro: HEAD `9127a6f`, igual a `origin/integracao/redesign-lote1`; 20 commits sobre o `main`; 147 arquivos, +15.950/−3.193.
- O usuário testou no celular (resultados na seção 12 de `docs/AUDITORIA_EXPO_GO.md`). A investigação foi só de leitura: código, Git e o backup de 16/11. Nada foi executado no hospedado e nenhum código foi alterado.
- Defeitos confirmados no código:
  - convite com falso erro (a API responde 201 sem corpo);
  - exclusão física de evento e de inscrição, que apaga as conversas;
  - "Aprovar e pagar" gera o Pix ao abrir a tela;
  - notificação que continua "nova";
  - valor antigo exibido após a contraproposta;
  - Reveal medido em relação ao contêiner.
- Eventos de 31/12 e da recorrência: escondidos por 24 h dos músicos sem Pro (acesso antecipado), por regra de produto.
- Avaliações: os dois eventos concluídos são dados de demonstração documentados em `34ca762`; um deles foi criado fora do app. Nenhuma avaliação oculta.
- O letreiro de estilos foi removido em `6a8eea1` (12/11) e não existe no HEAD.
- Plano de correções na seção 16 da auditoria; **aguardando autorização**. Melhorias futuras registradas no fim da auditoria, fora da entrega.

## Primeira etapa de correções (16/11/2026, sem commit)

- Corrigidos:
  - D1: convite e contestação respondem 204, e o cliente aceita 2xx sem corpo;
  - D9: notificações marcadas como lidas também na tela;
  - D12: valor da proposta, proposta substituída e valor aceito aparecem na hora;
  - D14: aviso de sem conexão junto aos indicadores;
  - D20: posição do Reveal dentro de listas;
  - D13: favorito atualizado assim que o servidor confirma, com indicação de salvamento.
- Detalhes, arquivos, testes e riscos: seção 18 de `docs/AUDITORIA_EXPO_GO.md`.
- Verificação: typecheck e lint da raiz limpos (o lint da raiz ignora `mobile/` e não cobre o app); `pnpm test` com 50 arquivos e 925 testes aprovados; exports Android e web sem erro; `git diff --check` limpo.
- Sem migration, sem mudança no hospedado, sem deploy, sem commit. Regras de contratação, pagamento e checkout não mudaram. Letreiro não restaurado.
- API (3333, rotina desabilitada) e Expo (8081) seguem abertos para o teste no celular. **Nenhuma correção foi validada no Expo Go ainda.**

## Segunda rodada: ajustes da revisão independente (16/11/2026, sem commit)

- Removidos os dois imports sem uso da primeira rodada.
- Favoritos (D13) com controle próprio (`mobile/lib/favoritos.ts`):
  - uma requisição por vez para cada músico;
  - alternância rápida grava só o último estado pedido;
  - outros músicos seguem livres;
  - falha de releitura mantém a lista e avisa;
  - falha de gravação volta ao estado confirmado.
- Painel (D14): mensagem de conexão uma vez só, junto aos indicadores, com "Tentar novamente".
- Tabelas das seções 13 e 16 da auditoria marcadas com o que foi corrigido; o texto original foi mantido.
- Verificação:
  - typecheck limpo;
  - nenhum import ou variável sem uso em `mobile/`;
  - lint do app por configuração temporária: só os 57 erros anteriores, idênticos ao HEAD;
  - lint da raiz limpo;
  - `pnpm test` com 51 arquivos e 934 testes aprovados;
  - exports sem erro;
  - `git diff --check` limpo.
- Detalhes na seção 19 de `docs/AUDITORIA_EXPO_GO.md`. **Nenhuma correção validada no Expo Go ainda.**

## Investigação da terceira rodada (16/11/2026, sem alteração de código)

- **Favoritos (D13):**
  - adicionar faz 5 consultas em sequência no servidor e remover faz 4; cada uma leva cerca de 0,1 s;
  - os "dois roxos" do coração são a opacidade 0,6 (pendente) e 1 (confirmado);
  - no perfil, o botão fica com carregamento durante toda a gravação.
- **Visibilidade (D3):**
  - sem Pro, um evento criado há menos de 24 h e marcado para mais de 7 dias depois da criação fica fora do feed;
  - o raio é de até 200 km (400 km com Pro) e fica salvo no aparelho;
  - a RLS deixa qualquer conta ver eventos abertos pela tela do evento;
  - para fechar o caso dos dois perfis, falta uma consulta só de leitura, se autorizada.
- **Chat (D12):** a fórmula é a mesma no app e no servidor; propostas e chat mostram só o cachê, sem taxa. É defeito de apresentação, ligado à melhoria futura nº 8.
- **Saída da conta:**
  - não chama a API e não mostra erro próprio;
  - a travada e a mensagem técnica ainda são hipóteses (WebView do captcha; faixas de aviso do modo de desenvolvimento); falta o print da mensagem.
- **Correção do roteiro:** a API **não** registra requisições no terminal, ao contrário do que diz a seção 7 da auditoria.
- Detalhes na seção 20 de `docs/AUDITORIA_EXPO_GO.md`.

## D3: consulta só de leitura (16/11/2026, 20:34)

- Consulta autorizada, só de leitura, limitada à conta de demonstração (Músico B), ao único outro músico ligado aos eventos (Músico A, por inferência) e aos três eventos dos dias 16 e 23. **Identificação do Músico A confirmada em 16/11, 20:44:** a conta informada pelo usuário é o mesmo perfil inferido, e todos os campos se repetiram.
- **Os dois perfis:**
  - estão sem Pro e sem penalidade;
  - ficam na mesma cidade dos eventos;
  - têm estilos compatíveis.
- **Evento do dia 23:** fica fora do feed dos dois até 17/11 às 16:03, pelo acesso antecipado (criado com 7,2 dias de antecedência).
- **A diferença entre os perfis é o convite:** o Músico B foi convidado para o evento do dia 23 e se inscreveu. O convite libera a inscrição de propósito, mas o feed não mostra o evento convidado.
- **Divergência para o produto:** convite × feed.
- Nada foi alterado. Detalhes na seção 21 de `docs/AUDITORIA_EXPO_GO.md`.

## Etapa 1: D12, D13, saída da conta e D1 (16/11/2026, sem commit)

- **D12:** o contratante vê "Você paga R$ X se aprovar agora", com cachê + taxa, no cartão do candidato e no chat. O cálculo é o mesmo da cobrança. O músico não vê.
- **D13:**
  - a conta é lida em 1 consulta em vez de 2 (vale para todas as rotas);
  - favoritar consulta a conta e a inscrição em paralelo;
  - as duas telas usam a mesma indicação de salvamento, sem bloquear o toque.
- **Saída da conta:** o `expo-notifications` não é mais carregado no Expo Go Android. Os seus avisos eram as únicas mensagens técnicas do log. A travada continua não confirmada.
- **D1:** validado no E2E local (convite 204 sem corpo, gravado uma vez). No hospedado depende de autorização para gravar um convite.
- **Verificação:**
  - `pnpm test` 965 de 965;
  - E2E local 67 de 67;
  - typecheck limpo;
  - lint da raiz limpo;
  - lint do `mobile/` igual à base (57);
  - exports sem erro;
  - `git diff --check` limpo.
- Detalhes, revisão independente e checklist na seção 22 de `docs/AUDITORIA_EXPO_GO.md`. **Nada validado no Expo Go ainda.**

## Decisão do usuário e conferência (17/11/2026)

- **D1 no hospedado:** o usuário **não autorizou** a gravação de um convite real. D1 continua **validado localmente (E2E) e pendente no hospedado**.
- **Próximo passo:** testes manuais no Expo Go, pela checklist da seção 22 de `docs/AUDITORIA_EXPO_GO.md`. Depois dos resultados, decidir separadamente a validação real de D1. A Etapa 2 não começou.
- **Conferência feita, sem alterar nada:**
  - HEAD `9127a6f`, igual ao remoto;
  - todo o trabalho segue sem commit;
  - `backend/.env` sem `ENABLE_FINANCIAL_ROUTINE` nem `FINANCIAL_ROUTINE_TOKEN`, e a API em execução informa "Rotina financeira desabilitada";
  - Asaas no Sandbox;
  - nenhuma mudança em `paymentService.ts`, `rotinaFinanceira.ts`, `planService.ts`, `adapters/asaas.ts`, migrations ou workflows;
  - em `shared/dominio.ts`, só acréscimos: taxas, `calcularCobranca` e `comissaoPercentual` intactos.
- **Roteiro das três etapas:** o plano de etapas não está registrado no repositório. Os documentos só registram a Etapa 1 (seção 22) e nenhum item foi removido ou reorganizado. As Etapas 2 e 3 não foram detalhadas nos documentos.

## Abertura da MUVE e diagnóstico de desempenho (17/11/2026, sem commit)

- **Lentidão geral:** sem causa no código. O anel removido não deixou resíduo. A medição no navegador (modo dev × `--no-dev --minify`) não mostra trabalho pesado do app; falta medir no celular. A cópia `muve_restauro` continua ligada (sem autorização para parar).
- **Abertura:** o login montava junto com o desenho da logo quando o app abria deslogado (efeito de `c0c0fec`).
- **Correção:**
  - o desenho começa depois que a logo carrega, com espera máxima de 600 ms;
  - as telas montam só no fim do desenho;
  - a splash é escondida na largada;
  - os links de autenticação são registrados desde o início.
- **Arquivos:** `Abertura.tsx`, `Logo.tsx`, `_layout.tsx`, mais `mobile/lib/abertura.ts` e o teste.
- **Verificação:** 988 de 988; typecheck e lint limpos; lint do `mobile/` igual à base; exports sem erro.
- Detalhes na seção 27 da auditoria. **Não validado no Expo Go.**

## Flash ao trocar de aba e carregamento (17/11/2026, sem commit)

- **Flash:** o tema de navegação padrão do expo-router era claro, e o `fade` das abas deixava o fundo claro aparecer. Corrigido com `ThemeProvider` escuro, com as cores do app, em `_layout.tsx`.
- **Carregamento:** cada consulta leva cerca de 0,18–0,2 s de ida e volta. O detalhe do evento do músico passou de 2 rodadas para 1 (de 360–650 ms para cerca de 180 ms, medido).
- **Gargalo restante:** o detalhe do contratante, porque a situação do pagamento passa pela API (4 consultas em sequência e a Asaas). Depende de autorização, por tocar em pagamentos. O feed fica em 2 rodadas (exigiria migration).
- **Verificação:** 993 de 993; typecheck e lint limpos; lint do `mobile/` igual à base; exports sem erro.
- Detalhes na seção 28 da auditoria. **Não validado no Expo Go.**

## Detalhe do contratante mais rápido (17/11/2026, sem commit)

- `paymentService.syncCheckout`: as leituras do evento, dos estornos atrasados e do último pagamento rodam em paralelo. A ordem das decisões e a regra de pagamento continuam iguais: dono conferido antes de qualquer escrita ou Asaas, e com estorno atrasado o caminho é o de antes.
- **Medição:** 550 ms → 185 ms nas leituras.
- **Verificação:** 997 de 997; E2E local 67 de 67; typecheck e lint limpos; lint do `mobile/` igual à base; exports sem erro.
- Detalhes na seção 29 da auditoria. **Não validado no Expo Go.**

## Etapa 2 executada (17/11/2026, sem commit)

- **D4:** excluir evento com inscritos agora cancela o evento (histórico preservado); sem inscritos, continua apagando.
- **D5:** confirmação antes de cancelar; o servidor só cancela inscrição pendente de evento aberto. Preservar a conversa no cancelamento voluntário depende de migration (não criada).
- **D6:** a tela de pagamento só consulta; o Pix é gerado apenas no botão "Gerar cobrança Pix".
- **D7:** sem código; depende das migrations para depois da contratação.
- **D11:** o feed tira os eventos em que o músico foi recusado.
- **D15:** as imagens da recorrência são enviadas em paralelo.
- **Verificação:**
  - 1007 de 1007;
  - E2E local: 67 de 67 sem resíduo (o E2E consulta o feed pela função do banco; o filtro do D11, que roda no app, é coberto pelos testes unitários);
  - typecheck e lint limpos;
  - lint do `mobile/` igual à base;
  - exports sem erro;
  - `git diff --check` limpo.
- **Etapa 3 (separada, não iniciada):** D8, Avaliações e D19. D16, D18 e D21 seguem ignorados por decisão anterior. D17 segue corrigido.
- Detalhes na seção 30 da auditoria. **Nada validado no Expo Go.**

## Lote 1: auditoria complementar e proteção do trabalho (17/11/2026)

- Auditoria complementar só de leitura: inventário dos arquivos fora do Git e revisão das 12 migrations, de D5, D8, avaliações, D19 e dos itens I a L.
- Correção da auditoria anterior: a migration 12 **não** quebra o backend do `main`, que chama `claim_asaas_refund` com parâmetros nomeados; o terceiro parâmetro tem valor padrão.
- Backup antes dos commits em `newmuve-backups\2026-11-17-lote1-antes-dos-commits` (fora do Git): diff das alterações, cópia dos arquivos e `SHA256SUMS`, conferidos.
- Registrados no Git: código, testes e scripts das Etapas 1 e 2 num commit; documentação em outro. `backend/.env.example` e `mobile/.env.example` restaurados do HEAD. Ficam fora: `mobile/pnpm-lock.yaml`, `mobile/pnpm-workspace.yaml` e a pasta `newmuve/`.
- **Bloqueios novos para a janela de migrations** (sem alteração de código nesta rodada):
  1. **Multa em dobro:** a partir da migration 1, `finalize_asaas_refund` cria a multa do estorno, e o backend do `main` cria outra (`penalize` → `addPenalty`, sem `estorno_payment_id`) e reduz a visibilidade de novo. Mais um motivo para nenhuma instância do `main` ficar ligada ao banco migrado.
  2. **Perda de conversa na reabertura:** `reopen_event` (`20261027180000_ajustes_de_fluxo.sql`) apaga a inscrição do músico contratado quando a contratação é desfeita com reabertura, e as mensagens caem em cascata. Afeta D7 e deve ser tratado junto com a migration do D5.
  3. **Repasse ao abrir a contratação:** `getHiring` chama `payments.payout` em evento `CONCLUIDO` ou `CANCELADO`, o que pode pedir um Pix de repasse à Asaas mesmo com a rotina financeira desligada. Antes dos testes de fumaça, conferir que nenhum pagamento `PAGO` com repasse `RETIDO` ou `FALHOU` está nesses eventos, incluindo o 5º pagamento criado depois do backup de 16/11.
     - Atualização: corrigido na Etapa 1 do Lote 2 (commit `d68dfc5`). `getHiring` não pede mais repasses; só a rotina financeira autorizada os pede.
- O hospedado mudou depois do backup de 16/11 (5 pagamentos e 1 evento cancelado): a janela exige exportação e ensaio novos.

## Lote 2, Etapa 1: proteção do fluxo de repasses (17/11/2026, concluída e enviada no commit `d68dfc5`)

- Decisões do usuário: a Opção B da auditoria, sem migration; nenhum caminho recupera repasse `FALHOU` nesta etapa; confirmar o show, cancelar sem estorno e decidir contestação a favor do músico só mudam o estado.
- `payments.payout` passou a ser chamado só pela rotina financeira, que já exige autorização (`ENABLE_FINANCIAL_ROUTINE` ou o disparo com `FINANCIAL_ROUTINE_TOKEN`, mais a trava no banco). A rotina pede o repasse de pagamento `PAGO` com repasse `RETIDO` em evento `CONCLUIDO` ou `CANCELADO` e continua acompanhando os `PROCESSANDO`.
- `payout` só reserva repasse `RETIDO`; `FALHOU` não abre nova tentativa nem novo aviso. A recursão depois de uma tentativa liberada e o repasse depois da confirmação de ausência pelo suporte foram removidos.
- `getHiring`, `confirmCompletion`, `cancelHiring` sem estorno, `resolveDispute` com `PAGAR_MUSICO` e `settleDueHiring` não chamam mais `payout`. A consulta continua acompanhando estornos e concluindo shows vencidos.
- Nenhuma configuração nova. Textos que prometiam nova tentativa automática agora orientam a falar com o suporte.
- Pendência: decidir como recuperar repasses `FALHOU` (rotina com limite ou ação do suporte). Com a rotina desligada no hospedado, nenhum repasse sai.
- O script de suporte avisa que liberar uma tentativa não paga o músico e lista os repasses falhos como pendentes.
- Validação: testes 1015/1015, E2E local 72/72 (com a rotina encontrando pagamentos retidos de evento concluído e cancelado e ignorando os de evento contratado e os estornados), lint do mobile igual à base de 57.
- Limitações da validação:
  - o E2E não faz transferência real: sem Asaas no ambiente local, toda tentativa termina como `FALHOU`; ele comprova a seleção dos pagamentos e a ausência de duplicidade, não o envio;
  - as mensagens do script de suporte (`scripts/resolver-repasse.mjs`) foram conferidas por inspeção e `node --check`, sem teste automatizado;
  - não há teste específico para repasse `PROCESSANDO` sem tentativa aberta, que continua só registrando o pedido de conciliação manual.

## Pendências que dependem de pessoas

1. **Aplicar as 12 migrations novas no Supabase hospedado** — pendente de autorização específica. Riscos: plano sem backup automático; chaves legadas ainda ativas permitem que backends antigos rodem a rotina. Exige exportação verificável antes. Enquanto não aplicar, `GET /events/:id/contratacao` responde 500 (coluna `disputes.payment_id` ausente) e as avaliações ficam bloqueadas.
2. **Validação no Android (Expo Go)**: envio de foto de perfil e capa de evento (caminho XHR), teclado na conversa e na proposta, aviso de proposta em evento encerrado, autor e evento nas avaliações.
3. Muve Pro e pagamento dependem do Asaas Sandbox configurado no backend.
4. Rotina financeira continua desligada; nenhuma variável foi criada.
5. Mesclar o PR é decisão do grupo.
