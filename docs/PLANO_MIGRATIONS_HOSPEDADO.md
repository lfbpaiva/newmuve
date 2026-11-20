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

Projeto confirmado pela CLI em 16/11/2026: "My Project", `us-east-2` (Ohio), `ACTIVE_HEALTHY`, organização `vlbdouewndfitdumeapm` ("Muve"). A CLI precisa estar logada na **conta do Muve**; a conta institucional enxerga só o projeto antigo `xxagvofwqkjpudtalduj`, que não deve ser usado. Para não pegar a sessão errada do navegador, usar `npx supabase login --no-browser` e abrir o link numa janela anônima com a conta do Muve. A sessão da CLI expira: no fim do dia 16/11 ela já respondia "Invalid access token".

## 2. Exportação verificável (preparada e testada)

Os scripts ficam **fora do repositório**, em `C:\Users\Administrador\Downloads\Claude\newmuve-backups\scripts`, porque a exportação contém dados pessoais (CPF, telefone, e-mail, hash de senha). Nunca versionar nem enviar a exportação.

| Script | O que faz | Escreve no hospedado? |
|---|---|---|
| `1-exportar.sh <ref> <pasta>` | `db dump --role-only`, `db dump` (estrutura), `db dump --data-only --use-copy`, histórico de migrations, contagem de linhas de cada tabela, inventário de objetos, `SHA256SUMS` | não: dumps e consultas `--read-only` |
| `0-verificar-desvio.sh <pasta>` | compara o inventário do hospedado com o estado esperado após as 21 migrations (`referencia/inventario_esperado_v21.csv`) | não |
| `2-restaurar-e-verificar.sh <pasta>` | confere os hashes, restaura num **segundo Supabase local isolado** (`muve_restauro`, portas 544xx) e compara contagem e inventário com a origem | não |
| `3-ensaiar-migrations.sh <pasta>` | roda a pré-verificação, aplica as 12 migrations na cópia restaurada, uma por transação, e roda os 25 arquivos pgTAP | não |
| `preverificacao.sql` | consultas que antecipam falhas e mudanças de dados (seção 5) | só leitura |
| `checagens_extras.sql`, `checagens_complementares.sql` | repasses da migration 3, contestações da migration 11, duplicidades, inconsistências, órfãos, Storage | só leitura |
| `papeis_temporarios.sql` | papéis fora do padrão e objetos deles | só leitura |
| `permissoes_clientes.sql`, `pos_ensaio.mjs` | acesso de `anon` e `authenticated` antes e depois do ensaio | não (rodam na cópia) |
| `4-baixar-storage.mjs <ref> <pasta>` | baixa os arquivos dos buckets pelas URLs públicas e confere tamanho, MD5 (`eTag`) e SHA-256 | não: só `GET` |

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

- **Arquivos dos buckets** (fotos de perfil, capas) não entram no dump, só os metadados em `storage.objects`. Eles são baixados à parte (seção 11). As migrations não mexem no storage.
- A estrutura dos esquemas `auth` e `storage` pertence à plataforma e não é exportada; os **dados** de `auth` (usuários, identidades) entram.
- Configurações do projeto (Auth, URLs de redirecionamento, captcha, chaves de API, SMTP) não fazem parte do banco.
- Sessões, tokens de atualização e logs de auditoria são exportados, mas não entram na comparação, porque mudam a cada login.
- Diferenças em triggers ou policies de `auth`/`storage` podem vir da versão da plataforma, e não de desvio do projeto.
- A exportação é um retrato do momento: o que for gravado depois dela não está nela.
- **Event triggers não entram no dump.** O hospedado tem `ensure_rls` (recurso do Supabase que liga RLS em tabelas novas do `public`); numa restauração ele é recriado com `create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable();`.
- A CLI exporta usando o papel `cli_login_postgres`, que ela mantém no projeto com senha de validade curta; consultas `--read-only` rodam como `supabase_read_only_user`, que não enxerga todos os grants em `information_schema` (por isso a comparação usa a ACL do catálogo).

### Resultado com os dados reais (16/11/2026)

- Exportação do hospedado com hashes conferidos; restauração com 49/49 tabelas e 463/463 objetos iguais.
- Desvio em relação à referência: só a função do Supabase `rls_auto_enable()` e o corpo de `claim_asaas_refund` e `finalize_asaas_refund` gravado com CRLF (texto igual sem `\r`, metadados iguais).
- Ensaio na cópia: 12 migrations aplicadas, pgTAP sem falhas, estado final igual ao das 33 migrations; os 33 objetos novos não dão acesso a `anon` nem `authenticated`.
- Efeito nos dados: 2 tentativas de repasse `LEGADO` (`CONCLUIDA`) na migration 3; nenhuma contestação vinculada ou encerrada na migration 11 (o hospedado tem 0).
- Achados de qualidade, que não bloqueiam: 3 URLs de imagem sem arquivo e 8 arquivos sem referência no Storage; um pagamento cancelado sem evento.

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
- **Backend antigo (`main`, commit `34ca762`) com o banco novo: incompatível.** O `server.ts` do `main` executa a rotina financeira **sempre**, ao iniciar e a cada 5 minutos, sem `ENABLE_FINANCIAL_ROUTINE`. Ela grava `repasse_status` e `repasse_asaas_id` direto em `payments`, quita multas direto em `penalties` e pede transferências à Asaas, sem passar por `repasse_tentativas`. Depois das migrations isso cria repasses sem tentativa, que a conciliação nova não reconhece. As rotas de leitura e o estorno (`claim_asaas_refund` com parâmetros nomeados) continuariam funcionando, mas a rotina é suficiente para tornar qualquer instância do `main` proibida a partir da migração.
- **Backend novo com o banco antigo: quebra sem corromper dados.** Chama funções que ainda não existem (`claim_payout`, `abrir_contestacao`, `claim_asaas_refund` com 3 parâmetros…) e lê `disputes.payment_id`; as chamadas falham com erro (a tela de contratação dá 500). Não deve ficar no ar antes das migrations.
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

## 6. Sequência da janela (só depois da aprovação)

**Arquitetura da apresentação (decisão de 18/11/2026):** o app roda no Expo Go, com o Expo/Metro e o backend do PR rodando no notebook (`pnpm dev:api` com o `backend/.env` do hospedado) e o Supabase hospedado como banco. A Asaas continua no Sandbox. Render, merge do PR no `main` e implantação em produção **não fazem parte** da preparação nem da janela.

O backend do `main` é incompatível com o banco migrado (seção 4) e o backend do PR não funciona no banco antigo. Por isso, entre o início da janela e a liberação, nenhum backend do `main` pode estar ligado ao hospedado, e o backend do PR só é iniciado depois das migrations.

**Serviços que podem acessar o hospedado (verificado em 18/11/2026):**
- **Render, serviço `muve-api`:** roda o código do `main`, que executa a rotina financeira ao iniciar e a cada 5 minutos, gravando direto em `payments` e criando a multa em dobro. Ele só age se estiver acordado; no plano gratuito ele dorme e uma requisição à URL o acorda. A situação atual (ativo, dormindo ou suspenso) não pode ser conferida pelo repositório: é preciso olhar o painel da Render. Nada o acorda automaticamente hoje, porque o webhook da Asaas está desativado e não aponta para ele, e não há workflow agendado (conferido na API pública do GitHub: só o `CI`, 0 execuções agendadas; o `rotina-financeira.yml` existe só na branch do PR).
- **Cópias locais do `main` com o `.env` do hospedado:** não detectáveis daqui; cada pessoa do grupo confirma que não tem uma rodando.
- **Supabase hospedado:** nenhuma Edge Function publicada (conferido em 17/11) e sem `pg_cron`/`pg_net` (seção 9).
- **Medida temporária, só com autorização expressa:** se o painel mostrar o `muve-api` ativo, suspendê-lo durante a janela (Dashboard → Suspend). A suspensão preserva toda a configuração; para restaurar, Dashboard → Resume. É só uma medida de segurança, não uma etapa de implantação; depois das migrations, retomá-lo com o código do `main` volta a criar o risco da seção 4, então ele deve continuar suspenso ou dormindo enquanto o banco estiver migrado.

**Webhook da Asaas:** continua desativado e com a fila pausada; não é reativado, redirecionado nem alterado na janela. A reavaliação fica para depois da apresentação.

**Janela:**
1. Avisar o grupo da indisponibilidade temporária; ninguém usa o app.
2. Garantir que nenhum serviço incompatível acessa o hospedado: conferir o `muve-api` no painel da Render (e suspendê-lo só com autorização) e confirmar com cada pessoa que não há API local do `main` ligada ao hospedado.
3. Exportação nova e verificação (`1-exportar.sh`, `2-restaurar-e-verificar.sh`, `0-verificar-desvio.sh`, `4-baixar-storage.mjs`).
4. Pré-verificação (seção 5) e ensaio (`3-ensaiar-migrations.sh`, com o `ensure_rls` recriado na cópia) com os dados atuais. Qualquer diferença nova interrompe a janela.
5. `npx supabase db push --remote=lylxorfrwuioednhukhz --dry-run`: exatamente as 12 migrations, em ordem.
6. Apresentar o resultado e aguardar autorização expressa.
7. `npx supabase db push --remote=lylxorfrwuioednhukhz`: as 12 migrations em um único lote.
8. Verificações em lote (seção 7, itens 1 a 4), com resultado consolidado ao final.
9. Iniciar o backend do PR no notebook (`pnpm dev:api`), sem `ENABLE_FINANCIAL_ROUTINE` e sem `FINANCIAL_ROUTINE_TOKEN`, conferir no log "Rotina financeira desabilitada nesta instância" e fazer os testes de fumaça (seção 7, item 5).
10. Liberar o ambiente para a apresentação pelo Expo Go.

**Se o passo 7 falhar no meio:** cada migration roda numa transação, então o banco fica numa das migrations intermediárias. Nenhum backend é iniciado; corrigir com migration nova ensaiada na cópia ou restaurar (seção 8). O backend do `main` **não** volta a ser ligado ao hospedado.

**Mitigação adicional (decisão própria):** desativar as chaves legadas do Supabase impede que qualquer cópia esquecida do `main` acesse o banco. Antes disso, confirmar qual chave cada `.env` e a Render usam, porque o backend local da apresentação também precisa da sua.

## 7. Validação posterior

1. `npx supabase migration list --remote=...`: 33 migrations, local e remoto iguais.
2. Inventário do hospedado igual a `referencia/inventario_esperado_v33.csv`: mesmas funções, ACL, RLS e **nenhuma policy nova**.
3. Contagem: tabelas antigas com o mesmo número de linhas (exceto `disputes`, que só tem colunas atualizadas); `repasse_tentativas` com o número previsto; `rotina_financeira_execucao` com 1 linha, sem dono.
4. `select dono from public.rotina_financeira_execucao` vazio, e nenhuma variável da rotina criada.
5. Testes de fumaça pelo backend local da apresentação (o mesmo do passo 9 da janela): tela de contratação (`GET /events/:id/contratacao`) responde 200; avaliações aparecem; contestação abre; nenhum 500 nos logs.
6. Testes pgTAP no hospedado (`pnpm test:db` usa transações com rollback, mas grava temporariamente): **só com autorização própria**.

## 8. Recuperação

1. **Correção para a frente (preferida):** se algo sair diferente do esperado, uma migration corretiva nova, testada antes na cópia restaurada.
2. **Reversão pontual:** as definições anteriores de `finalize_asaas_refund`, `claim_asaas_refund(uuid, text)`, das constraints de `disputes` e do índice antigo estão no `schema.sql` da exportação. Um script de reversão pode ser montado e ensaiado na cópia antes da janela, se o grupo quiser.
3. **Restauração completa (último recurso, destrutiva):** recriar os esquemas `public` e `private` a partir da exportação, com o mesmo procedimento do script 2 (privilégios padrão revogados antes da estrutura, estrutura como `postgres`, dados com `session_replication_role = replica`) e o histórico de migrations reposto. Perde tudo o que foi gravado depois da exportação. Exige autorização específica.

## 9. Rotina financeira

- **Backend do PR:** só agenda a rotina com `ENABLE_FINANCIAL_ROUTINE=true` **e** em produção ou com Supabase local (`financialRoutineAllowed`); o disparo externo (`POST /admin/rotina-financeira`) ainda exige `FINANCIAL_ROUTINE_TOKEN` válido. Nenhuma das duas variáveis existe no `backend/.env`; o `render.yaml` define `ENABLE_FINANCIAL_ROUTINE: "false"`.
- **Backend do `main`:** roda a rotina sempre (seção 4). É o único caminho de execução automática hoje.
- **Workflow** `.github/workflows/rotina-financeira.yml`: existe só na branch do PR; o GitHub só agenda workflows do branch padrão. API pública do GitHub em 16/11/2026: o repositório tem só o workflow `CI` registrado e **0** execuções agendadas. Depois do merge, ele só faz algo com a variável `ROTINA_FINANCEIRA_ATIVA = true` e os secrets `MUVE_API_URL` e `FINANCIAL_ROUTINE_TOKEN`.
- **Banco:** o dump do hospedado não tem `pg_cron` nem `pg_net` (extensões: `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `unaccent`).
- **Linha de trava (migration 10):** `rotina_financeira_execucao` tem uma única linha (`id = 1`). `dono` nulo significa "nenhuma execução em andamento", o estado normal em repouso. Ela só é ocupada por `adquirir_rotina_financeira`, que o backend chama ao rodar a rotina; não liga nada. Na cópia: livre, geração 0, nunca executada.

## 10. Permissões depois das migrations (medido na cópia)

- **Tabelas novas** (`repasse_tentativas`, `repasse_decisoes`, `repasse_alertas`, `rotina_financeira_execucao`): `service_role` só com `select`; `anon` e `authenticated` sem acesso; RLS ligado e nenhuma policy. O backend do PR só faz `select` nelas; toda escrita passa por funções. `repasse_alertas` tem triggers que impedem `update`, `delete` e `truncate`.
- **Funções:** as 27 que o backend do PR chama existem com uma única assinatura e `execute` para `service_role`, sem `anon` nem `authenticated`. Das 29 novas, 7 não têm `execute` para `service_role` de propósito: são internas ou só da migration (`encerrar_tentativa_sem_repasse`, `importar_repasses_legados`, `validar_busca_de_ausencia`, `private.impedir_alteracao_de_alerta`, `private.reabrir_contestacao_do_evento`, `private.reabrir_contestacao_do_pagamento`, `private.vincular_contestacoes_ao_pagamento`), e nenhuma delas é chamada pelo backend.
- **Permissões anteriores**, iguais à referência: `authenticated` lê 13 tabelas (filtradas por RLS) e executa as funções auxiliares das policies; `anon` tem `execute` em 4 funções do esquema `private`, mas não tem `usage` nesse esquema.

## 11. Backup completo

- Banco: exportação de 16/11/2026, com hashes, restaurada e verificada (seção 2).
- **Storage:** os 12 arquivos (`avatars` 6, `event-banners` 6) baixados pelas URLs públicas dos buckets, com a estrutura `storage/<bucket>/<caminho>`; tamanho e MD5 conferem com o `eTag` de cada objeto; `SHA256SUMS` e `manifesto.json` conferidos. As 3 URLs que apontam para arquivos inexistentes não foram recriadas.
- Continuam fora: configurações do projeto (Auth, URLs, captcha, SMTP, chaves) e o event trigger `ensure_rls` (recriado à mão).
