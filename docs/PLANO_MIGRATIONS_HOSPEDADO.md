# Plano de aplicação das 12 migrations no Supabase hospedado

Situação em 16/11/2026: **nenhuma migration foi aplicada no hospedado.** Este documento é o plano para a avaliação do grupo. Sem segredos e sem dados pessoais.

## 1. Ambiente

| Item | Valor |
|---|---|
| Projeto | `lylxorfrwuioednhukhz` (o mesmo de `SUPABASE_URL` do backend) |
| Plano | gratuito, sem backup automático nem PITR |
| Migrations aplicadas | 21, até `20261029180000_muve_casa` (conferido antes no painel) |
| Pendentes | 12, de `20261113120000` a `20261116150000` |
| CLI | Supabase CLI 3.1.0; Docker Desktop com as imagens locais |

O CLI desta máquina não está autenticado ("Invalid access token") e o navegador interno não tem sessão no painel. A exportação do hospedado depende de alguém da equipe rodar `npx supabase login` (a pessoa digita a própria credencial; nenhum agente digita senha ou token).

## 2. Exportação verificável (preparada e testada)

Os scripts ficam **fora do repositório**, em `C:\Users\Administrador\Downloads\Claude\newmuve-backups\scripts`, porque a exportação contém dados pessoais (CPF, telefone, e-mail, hash de senha). Nunca versionar nem enviar a exportação.

| Script | O que faz | Escreve no hospedado? |
|---|---|---|
| `1-exportar.sh <ref> <pasta>` | `db dump --role-only`, `db dump` (estrutura), `db dump --data-only --use-copy`, histórico de migrations, contagem de linhas de cada tabela, inventário de objetos, `SHA256SUMS` | não: dumps e consultas `--read-only` |
| `0-verificar-desvio.sh <pasta>` | compara o inventário do hospedado com o estado esperado após as 21 migrations (`referencia/inventario_esperado_v21.csv`) | não |
| `2-restaurar-e-verificar.sh <pasta>` | confere os hashes, restaura num **segundo Supabase local isolado** (`muve_restauro`, portas 544xx) e compara contagem e inventário com a origem | não |
| `3-ensaiar-migrations.sh <pasta>` | roda a pré-verificação, aplica as 12 migrations na cópia restaurada, uma por transação, e roda os 25 arquivos pgTAP | não |
| `preverificacao.sql` | consultas que antecipam falhas e mudanças de dados (seção 5) | só leitura |

O inventário cobre funções (hash da definição), policies, triggers, constraints, índices, colunas, grants de tabela, **ACL de tabelas e funções**, RLS ligado, buckets e histórico de migrations.

### Teste do procedimento (com o Supabase local como origem, no estado das 21 migrations)

- Restauração: 51/51 tabelas com a mesma contagem (5.594 registros) e 607/607 objetos idênticos, incluindo ACL e RLS.
- Ensaio: as 12 migrations aplicadas sem erro (cerca de 0,5 s cada); pgTAP com 25 arquivos e 0 falhas.
- A cópia após o ensaio ficou idêntica ao banco criado do zero com as 33 migrations: 781/781 objetos.

### Problemas encontrados no teste e já corrigidos no procedimento

1. **O `db dump` não inclui o histórico de migrations** (`supabase_migrations`). Agora ele é exportado à parte (`historico_migrations.csv`) e recriado na cópia.
2. **Uma restauração ingênua abriria o banco para `anon` e `authenticated`.** O dump supõe que objetos nascem sem permissões, mas os privilégios padrão do Supabase concedem tudo a esses papéis. Sem correção, a cópia deu leitura de CPF e execução de funções financeiras ao cliente; 7 arquivos pgTAP de segurança falharam. Correção: a estrutura é carregada como `postgres`, depois de revogar os privilégios padrão (a mesma coisa que a migration `20261005120100_seguranca_rls` faz). Isso vale também para uma restauração real num projeto novo.
3. Tabelas do `storage` exigem `supabase_admin` para receber dados: os dados são carregados com esse papel e `session_replication_role = replica`.

### Limitações da exportação

- **Arquivos dos buckets** (fotos de perfil, capas) não entram: só os metadados em `storage.objects`. As migrations não mexem no storage.
- A estrutura dos esquemas `auth` e `storage` pertence à plataforma e não é exportada; os **dados** de `auth` (usuários, identidades) entram.
- Configurações do projeto (Auth, URLs de redirecionamento, captcha, chaves de API, SMTP) não fazem parte do banco.
- Sessões, tokens de atualização e logs de auditoria são exportados, mas não entram na comparação, porque mudam a cada login.
- Diferenças em triggers ou policies de `auth`/`storage` podem vir da versão da plataforma, e não de desvio do projeto.
- A exportação é um retrato do momento: o que for gravado depois dela não está nela.

## 3. O que as 12 migrations mudam (diferença real entre o estado de 21 e o de 33)

Medido nos inventários `inventario_esperado_v21.csv` e `inventario_esperado_v33.csv`:

- **Novos:** 3 tabelas de repasse (`repasse_tentativas`, `repasse_decisoes`, `repasse_alertas`) e `rotina_financeira_execucao`, 46 colunas, 32 constraints, 15 índices, 29 funções, 2 triggers e 4 grants (`select` para `service_role`).
- **Policies novas: nenhuma.** As tabelas novas têm RLS ligado e nenhuma policy (só a API, com `service_role`, lê).
- **Alterados:** constraints `disputes_status_check` e `disputes_check` (passam a aceitar `AGUARDANDO_ESTORNO`) e a função `finalize_asaas_refund`.
- **Removidos:** a função `claim_asaas_refund(uuid, text)`, recriada com um terceiro parâmetro opcional, e o índice `disputes_uma_aberta_por_evento`, trocado por `disputes_uma_pendente_por_evento`.
- **Não há** `drop table`, `drop column`, `delete` nem `truncate`.

## 4. Análise de cada migration

A ordem é obrigatória: cada uma depende das anteriores e todas precisam entrar juntas (o backend do PR usa o estado final).

| # | Migration | Mudanças | Dados alterados | Risco | Depende de |
|---|---|---|---|---|---|
| 1 | `20261113120000_penalidade_no_estorno` | coluna `penalties.estorno_payment_id` (nula, FK), índice único nela, nova `finalize_asaas_refund` (multa ao confirmar estorno) | nenhum | baixo | — |
| 2 | `20261113130000_reserva_de_multas` | colunas `penalties.reserva_payment_id` e `payments.repasse_asaas_id_anterior`, 4 funções de repasse provisórias | nenhum | baixo | 1 |
| 3 | `20261114120000_tentativas_de_repasse` | 3 tabelas de repasse com RLS e sem policies; importação dos repasses antigos; remove as 4 funções da migration 2; cria `claim_payout`, `registrar_transferencia`, `concluir_tentativa` e outras | **insere** uma tentativa `LEGADO` para cada pagamento com transferência ou repasse `PROCESSANDO` | **médio-alto**: aborta se a mesma transferência estiver em mais de um pagamento | 2 |
| 4 | `20261115120000_contestacao_serializada` | `abrir_contestacao` com trava; nova `claim_payout` | nenhum | baixo | 3 |
| 5 | `20261115130000_contestacao_por_evento` | refina `abrir_contestacao` e `claim_payout` | nenhum | baixo | 4 |
| 6 | `20261115140000_estorno_com_tentativa_aberta` | `claim_asaas_refund` e `finalize_asaas_refund` respeitam tentativa de repasse aberta | nenhum | baixo-médio | 3 |
| 7 | `20261115150000_decisao_de_contestacao` | constraints de `disputes` ampliadas (aceitam tudo o que já existe), troca do índice único, funções `decidir_contestacao`, `negar_estorno`, `liberar_estorno` e outras | nenhum | médio: bloqueio curto em `disputes` | 5, 6 |
| 8 | `20261115160000_tentativa_parada` | coluna `repasse_tentativas.pedido_enviado_em`, funções de tentativa parada | preenche a coluna nova nas tentativas importadas na migration 3 | baixo | 3 |
| 9 | `20261116120000_conciliacao_por_tentativa` | alerta `REPASSE_E_ESTORNO`, alertas imutáveis (2 triggers), `registrar_repasse_e_estorno`, novas `concluir_tentativa` e `finalize_asaas_refund` | nenhum | baixo-médio | 3, 7 |
| 10 | `20261116130000_trava_da_rotina_financeira` | tabela de uma linha e funções de trava da rotina | insere a linha única (`id = 1`) | baixo; **não liga a rotina** | — |
| 11 | `20261116140000_contestacao_com_estorno_externo` | coluna `disputes.payment_id` (corrige o erro 500 da tela de contratação) e funções de estorno | **vincula** contestações antigas ao último pagamento anterior a elas; **resolve** como `DEVOLVER_CONTRATANTE` contestações abertas cujo pagamento já foi estornado | **médio-alto**: muda dados de negócio | 7, 9 |
| 12 | `20261116150000_nao_comparecimento_com_contestacao` | `claim_asaas_refund` ganha `p_contestacao_id` opcional (remove e recria); nova `abrir_contestacao` | nenhum | médio: troca de assinatura | 6, 11 |

### Operações destrutivas e incompatibilidades

- **`drop function`:** as 4 funções provisórias da migration 2 (removidas na 3, nunca existiram no hospedado) e `claim_asaas_refund(uuid, text)` na 12. O backend do `main` chama `claim_asaas_refund` com parâmetros nomeados (`p_payment_id`, `p_refund_action`), e a função nova tem o terceiro parâmetro com valor padrão: **continua compatível**.
- **`drop constraint` e `drop index` em `disputes`:** recriados na mesma migration, com regras que aceitam os dados atuais.
- **Backend antigo com o banco novo:** as rotas de leitura e pagamento continuam funcionando. O repasse antigo grava direto em `payments`, sem tentativas. Hoje ele não roda sozinho (rotina desligada), mas não deve ser usado entre a migração e a publicação do backend novo.
- **Backend novo com o banco antigo:** é o que acontece hoje no ambiente local, e a tela de contratação dá erro 500 (`disputes.payment_id` não existe). Por isso migrations e backend novo precisam entrar juntos.
- **Chaves legadas ainda ativas:** permitem que backends antigos falem com o banco. Desativá-las depois da migração depende de autorização própria.

## 5. Pré-verificação no hospedado (somente leitura)

Rodar `preverificacao.sql` com `npx supabase db query --remote=lylxorfrwuioednhukhz --read-only -f ...`. Para seguir, o esperado é:

| Verificação | Para seguir |
|---|---|
| `ultima_migration` / `total_migrations` | `20261029180000` / 21 |
| objetos, colunas e funções novas já existentes | nenhum |
| `transferencias_repetidas_entre_pagamentos` | nenhuma (senão a migration 3 aborta: conciliar antes) |
| `operacoes_financeiras_em_andamento` | 0, ou conferir cada uma antes |
| `contestacoes_abertas_em_evento_com_pagamento_estornado` | o grupo confirma que essas contestações podem ser resolvidas automaticamente |
| `tentativas_legadas_que_seriam_importadas` | número conferido com os repasses reais na Asaas Sandbox |

E também: `0-verificar-desvio.sh` sem diferenças fora de `auth`/`storage`.

## 6. Plano de execução (só depois da aprovação)

1. Janela combinada com o grupo; ninguém usa o app; backend local e da Render parados ou sem tráfego.
2. Exportar (`1-exportar.sh lylxorfrwuioednhukhz <pasta>`), verificar a restauração (`2-...`), conferir o desvio (`0-...`) e ensaiar na cópia com os dados reais (`3-...`). Qualquer falha interrompe o plano.
3. Pré-verificação no hospedado (seção 5), revisada pelo grupo.
4. `npx supabase db push --remote=lylxorfrwuioednhukhz --dry-run`: precisa listar exatamente as 12 migrations, em ordem.
5. Aplicar: `npx supabase db push --remote=lylxorfrwuioednhukhz`.
6. Publicar o backend desta branch (só depois do merge, decisão do grupo), com `ENABLE_FINANCIAL_ROUTINE` ausente.

## 7. Validação posterior

1. `npx supabase migration list --remote=...`: 33 migrations, local e remoto iguais.
2. Inventário do hospedado igual a `referencia/inventario_esperado_v33.csv`: mesmas funções, ACL, RLS e **nenhuma policy nova**.
3. Contagem: tabelas antigas com o mesmo número de linhas (exceto `disputes`, que só tem colunas atualizadas); `repasse_tentativas` com o número previsto; `rotina_financeira_execucao` com 1 linha, sem dono.
4. `select dono from public.rotina_financeira_execucao` vazio, e nenhuma variável da rotina criada.
5. Testes de fumaça pela API local: tela de contratação (`GET /events/:id/contratacao`) responde 200; avaliações aparecem; contestação abre; nenhum 500 nos logs.
6. Testes pgTAP no hospedado (`pnpm test:db` usa transações com rollback, mas grava temporariamente): **só com autorização própria**.

## 8. Recuperação

1. **Correção para a frente (preferida):** se algo sair diferente do esperado, uma migration corretiva nova, testada antes na cópia restaurada.
2. **Reversão pontual:** as definições anteriores de `finalize_asaas_refund`, `claim_asaas_refund(uuid, text)`, das constraints de `disputes` e do índice antigo estão no `schema.sql` da exportação. Um script de reversão pode ser montado e ensaiado na cópia antes da janela, se o grupo quiser.
3. **Restauração completa (último recurso, destrutiva):** recriar os esquemas `public` e `private` a partir da exportação, com o mesmo procedimento do script 2 (privilégios padrão revogados antes da estrutura, estrutura como `postgres`, dados com `session_replication_role = replica`) e o histórico de migrations reposto. Perde tudo o que foi gravado depois da exportação. Exige autorização específica.

## 9. Rotina financeira

Continua desligada. O workflow `.github/workflows/rotina-financeira.yml` só dispara com a variável de repositório `ROTINA_FINANCEIRA_ATIVA = true` **e** os secrets `MUVE_API_URL` e `FINANCIAL_ROUTINE_TOKEN`; a API ainda exige `ENABLE_FINANCIAL_ROUTINE`. Nenhum deles existe, e este plano não cria nenhum.
