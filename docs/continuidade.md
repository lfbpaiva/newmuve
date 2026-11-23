# Continuidade do projeto

Guia para quem pegar o Muve a partir daqui. Regras do produto em [produto.md](produto.md), decisões técnicas em [arquitetura.md](arquitetura.md), instalação no [README](../README.md) e roteiro em [apresentacao.md](apresentacao.md).

## Estado atual (21/11/2026)

- **Código:** tudo está no `main` de `lfbpaiva/newmuve` (PRs #7 a #23). O repositório `Cleiton-Martins/MUVE` é antigo; não use. Os PRs 1 e 2 partiam de uma versão antiga e foram fechados.
- **Banco:** 40 migrations, todas aplicadas no Supabase hospedado (a última é `20261122120000_redes_sociais_do_musico`). A suíte pgTAP passa no hospedado (22/11).
- **Fluxo:** testado de ponta a ponta no sandbox da Asaas em 20/11 (ver "Fluxos de ponta a ponta"). Falta o teste no celular pelo Expo Go.
- **Pix no sandbox (20/11, à noite; ainda igual em 22/11 à noite, agora com a mensagem "Chave Pix não encontrada"):** desde cerca de 20h40, a Asaas responde `invalid_action` ("Um erro desconhecido") ao gerar o QR Code, e o app mostra que a Asaas não conseguiu gerar o QR. A chave Pix nova da conta ficou em "Aguardando ativação" e a antiga, em "Aguardando exclusão". É um problema da conta no sandbox, não do app nem do Expo Go. Se continuar, falar com o suporte da Asaas e usar o plano B do roteiro (vídeo ou prints do pagamento).
- **Verificação:** o GitHub Actions roda `pnpm typecheck`, `pnpm lint` e `pnpm test` a cada push e pull request. O `pnpm lint` ignora a pasta `mobile/`.
- **Histórico:** a auditoria do Expo Go, o registro de execução do PR #6 e o plano de migrations ficaram em [historico/](historico/). Servem de consulta; o estado atual é o deste documento. As capturas do redesign estão em `docs/imagens/redesign/`.

## Transferência para continuidade (20/11/2026)

Entrega na branch `handoff/luiz-newmuve-2026-11-20`, criada a partir de `continuidade/estado-atual-2026-11-18` (que contém o PR #6 e as Etapas 1 e 2 do roteiro). Este bloco resume o que foi recebido e onde retomar; o detalhe está nos documentos citados.

**Estado e arquitetura**

- O backend de `backend/` é a referência arquitetural. A cópia antiga em `newmuve/newmuve-main/` (fora do Git, pasta local excluída pelo `.git/info/exclude`) foi comparada estrutural e funcionalmente com o backend atual: nada dela precisa ser incorporado. Não fundir as duas árvores nem substituir implementações mais recentes pelas antigas.
- A diferença operacional entre os dois backends está em [arquitetura.md](arquitetura.md), "Rotina financeira": o atual só liga o timer local com `ENABLE_FINANCIAL_ROUTINE=true` e ambiente permitido; o antigo iniciava a rotina junto com a API, a cada 5 minutos, sem esse controle.
- A lógica financeira atual (repasse centralizado na rotina, trava no banco, tentativas persistidas, conciliação e contestação vinculada ao pagamento) deve ser preservada. As regras estão em [produto.md](produto.md), linhas "Rotina financeira", "Quem pede o repasse", "Estorno com repasse em andamento" e "Estorno confirmado com contestação aberta".

**O que esta entrega publica**

- Remoção do `render.yaml` da raiz (o da cópia antiga já não existe em disco). O README deixa de citar a Render como hospedagem; a API pode ir para qualquer serviço Node.
- Atualização textual do workflow `.github/workflows/rotina-financeira.yml` (mensagem de erro 401/403), sem mudança de lógica.
- Atualização deste documento, do README e de `docs/arquitetura.md`. Nenhum arquivo de `backend/`, `shared/`, `mobile/` ou `supabase/` foi alterado nesta entrega.
- Ficaram fora, de propósito: `mobile/pnpm-lock.yaml` e `mobile/pnpm-workspace.yaml` (não rastreados; o mobile usa npm), `.env` e a cópia antiga.

**Pendências para quem continua**

- A remoção local do `render.yaml` não desliga nada: o serviço `muve-api` pode continuar existindo na conta da Render. Quem tem acesso à Render precisa conferir e decidir se suspende ou apaga.
- Antes de qualquer execução contra o Supabase hospedado, revalidar quais migrations estão aplicadas ([historico/PLANO_MIGRATIONS_HOSPEDADO.md](historico/PLANO_MIGRATIONS_HOSPEDADO.md)); os testes automatizados cobrem só o banco local.
- Os testes manuais no Expo Go continuam pendentes, nos itens listados em "O que falta"; teste automatizado não os substitui.
- Recuperar repasses `FALHOU`: resolvido em 20/11 (PR #13); trocar a chave Pix devolve o repasse para a fila.

**Regras a manter ao mexer no financeiro**

- Só a rotina financeira pede repasses. Não reintroduzir chamadas diretas de `payout` em `getHiring`, confirmação, cancelamento ou decisão de contestação, nem novas tentativas automáticas para repasse `FALHOU`.
- Contestação e pagamento ficam associados por `disputes.payment_id`, preenchido só quando há um pagamento inequívoco. Com ambiguidade ou sem correspondência, a contestação fica sem vínculo e só o suporte a encerra; nunca escolher um pagamento arbitrariamente.
- Só o estorno confirmado do pagamento vinculado à contratação encerra a contestação. O estorno de outro pagamento do mesmo evento (por exemplo, um Pix pago fora de hora) não encerra contestação nem libera repasse.

## Visual

- **Tema** em `mobile/lib/theme.ts`: fundo escuro em camadas, roxo da logo (`#7C4DE1`, `#8B6BFF` nos destaques), bordas discretas, cantos de 6 a 20px e números com largura fixa.
- **Fonte Geist** (`@expo-google-fonts/geist`), carregada em `mobile/app/_layout.tsx`. Archivo e Manrope foram removidas.
- **Ícones Lucide** (`lucide-react-native`, com `react-native-svg`) pelo componente `Icon` de `mobile/components/ui.tsx`. Os nomes seguem os antigos do Ionicons, mapeados para os desenhos do Lucide; as logos do Google e do WhatsApp continuam no Ionicons.
- **Componentes base** em `ui.tsx`: `Button` com resposta ao toque, `Pill` com ponto de status, `Surface` (cartão com brilho), `Grupo` (cartão de formulário com ícone), `NumeroAnimado`, `PontoAoVivo`, `Skeleton` com brilho, `EmptyState` e `ErrorState` centralizados, `Reveal` (entrada ao rolar) e `Parallax`.
- **Navegação:** `BarraDeAbas.tsx` (abas com pílula animada) e `TopBar.tsx` (logo, sino e foto) em todas as abas.
- **Abertura:** `Abertura.tsx` escreve a logo ao abrir o app. O splash nativo usa uma imagem transparente (`splash-vazio.png`) para a animação começar do zero no app instalado; no Expo Go o carregamento é o do próprio Expo.
- **Animações** usam o `Animated` do React Native e respeitam "reduzir movimento". Framer Motion não se aplica, porque é para web.

## Logo

As imagens de `mobile/assets` ficam no **Git LFS**. A branch do redesign do grupo tinha trocado as cinco por quadrados brancos de 104×104; as originais foram recuperadas do histórico (`git show 34ca762:mobile/assets/logo.png | git lfs smudge`). Antes de trocar uma imagem, abra-a sobre fundo escuro para conferir: as logos são brancas ou roxas com fundo transparente.

## Como começar

1. Siga "Como rodar" no README.
2. Peça ao grupo os valores de `backend/.env` e `mobile/.env`, por canal privado. Eles nunca vão para o Git.
3. Entre com as contas de demonstração citadas no README, uma em `http://localhost:8081` e outra em `http://127.0.0.1:8081`.

## Serviços externos

| Serviço | Situação | Onde configurar |
|---|---|---|
| Supabase (banco, login, arquivos) | Ativo | Projeto "My Project" do grupo |
| Asaas sandbox | Ativo, conta `muveapp.contato@gmail.com` | Chave em `backend/.env` |
| Login com Google | Ativo no Supabase; o botão aparece sozinho | README, "Entrar com Google" |
| Cloudflare Turnstile (anti-robô) | Opcional; só aparece com `EXPO_PUBLIC_TURNSTILE_SITE_KEY`. Ligar junto com o captcha do Supabase, e incluir `localhost` e o domínio de `EXPO_PUBLIC_TURNSTILE_BASE_URL` no widget | `mobile/.env.example` |
| SMTP | Não configurado; sem ele os e-mails só aparecem no log da API | README, "E-mail" |
| Hospedagem da API | Não publicada; a apresentação usa o backend local | README, "Publicação da API" |
| Build pelo EAS (push com o app fechado) | Não gerado | README, "Notificações" |

## Asaas: o que costuma travar

- A chave de API precisa da opção **"Permitir que esta chave execute operações de saque via API"**. Sem ela, o repasse falha com `insufficient_permission`.
- Cada repasse fica pendente até a autorização por SMS: **Meu Dinheiro → Transferências → Enviar código**, na faixa do topo. O código vai para o telefone cadastrado na conta. Depois de autorizada, a transferência conclui sozinha.
- **Estornos também esperam a autorização por SMS:** ficam como `AWAITING_CRITICAL_ACTION_AUTHORIZATION`, e no app o estorno aparece como "em processamento" até alguém autorizar no painel da Asaas. Conferido em 20/11. Testar o cancelamento com estorno ao vivo só com o telefone da conta em mãos.
- **Pix validado em 20/11, pelos serviços da API no sandbox:**
  - Com `contratante2@teste.com` e `musico2@teste.com`: evento, inscrição e cobrança de R$ 165 gerada em 4,9 s com QR Code (cliente 0,9 s, cobrança 0,7 s, QR 0,5 s).
  - Pagamento simulado no sandbox; a consulta do app confirmou em 1,7 s, e o evento passou a contratado.
  - Depois, cancelamento com estorno integral, autorizado por SMS e concluído.
  - Se o app mostrar "O servidor demorou para responder", o atraso está entre o celular e a API (endereço em `EXPO_PUBLIC_API_URL`, mesma rede Wi-Fi, firewall do Windows na porta 3333), não na Asaas.
- Para confirmar um Pix de teste, abra a cobrança no painel e use **Confirmar pagamento**. Por script, use `POST /sandbox/payment/{id}/confirm`, que só existe no sandbox.
- **No sandbox, o código das autorizações pode ser `000000`:** o próprio painel informa isso. Várias pendências (estornos e transferências) são autorizadas de uma vez.
- **A Asaas confere se a chave Pix existe, mesmo no sandbox.** Chave fictícia faz o repasse falhar com `PAGAMENTO_DADOS_INVALIDOS`. Nas contas de teste, use `cliente-a00001@pix.bcb.gov.br`, a chave de teste do Banco Central.
- A conta é de pessoa física, então não permite subcontas (Conta Escrow).
- Ao trocar de conta, os clientes da conta antiga são recriados automaticamente na próxima cobrança ou assinatura.

## Planos para teste

- **Pelo app:** assine em Ajustes → Muve Pro ou Muve Casa, confirme o pagamento da cobrança no painel da Asaas e abra de novo a tela do plano; ela consulta a Asaas e ativa por 30 dias, sem depender de webhook.
- **Pelo banco (atalho, só em contas de teste):** no SQL Editor do Supabase, `update public.contractor_profiles set casa_ate = now() + interval '30 days' where user_id = (select id from auth.users where email = 'contratante@teste.com');`. Para o Pro, use `musician_profiles` e `pro_ate`. Esse caminho não cria assinatura nem cobrança.

## Suporte

Não há conta de administrador no app. Contestações são decididas por `scripts/resolver-contestacao.mjs` e repasses travados são liberados por `scripts/resolver-repasse.mjs`, os dois com o `ADMIN_TOKEN` de `backend/.env`. Um painel de suporte dentro do app (contestações, repasses e planos) fica como trabalho futuro e depende de decisão do grupo em `produto.md`.

### Repasses travados

A liberação tem duas etapas (`verificar`, depois de 24 horas do pedido, e `confirmar`, pelo menos 1 hora depois), cada uma com busca completa e vazia na Asaas. Desde o Lote 2, Etapa 1, liberar não paga o músico: a tentativa é encerrada e o repasse fica `FALHOU`. Desde 20/11, ele volta para a fila quando o músico troca a chave Pix (`reabrir_repasses_falhos`); fora isso, nenhuma nova tentativa é feita, e o script lista esses repasses como pendentes. O banco recusa qualquer etapa fora do prazo, fora de ordem ou com busca incompleta. Essas proteções reduzem o risco de Pix duplicado, mas não comprovam a ausência da transferência: confira o painel da Asaas antes de confirmar. O nome passado em `--operador` é registrado como informado; não há autenticação individual do suporte.

Casos que só o suporte resolve, pela conferência no painel da Asaas:

- tentativa `LEGADO` `INCONCLUSIVA` sem transferência (repasse `PROCESSANDO` do código antigo): `verificar` e `confirmar` buscam pela referência antiga, o id do pagamento; transferências antigas sem referência não aparecem na busca;
- tentativa `LEGADO` `INCONCLUSIVA` com transferência registrada (repasse `FALHOU` antigo com id): `conferir` consulta a transferência pelo id e conclui ou encerra a tentativa;
- alertas `POSSIVEL_DUPLICIDADE` e `RESPOSTA_TARDIA`: a transferência citada não é adotada; resolva no painel da Asaas;
- multas quitadas em repasse que não terminou e ids que só estão em `repasse_asaas_id_anterior` (importados como tentativas `FALHOU`).

Consulta de diagnóstico, só de leitura, para rodar antes e depois de aplicar a migration no banco compartilhado:

```sql
select 'falho com transferencia registrada' as caso, id, repasse_asaas_id from public.payments where repasse_status = 'FALHOU' and repasse_asaas_id is not null
union all
select 'processando sem transferencia', id, null from public.payments where repasse_status = 'PROCESSANDO' and repasse_asaas_id is null
union all
select 'transferencia anterior registrada', id, repasse_asaas_id_anterior from public.payments where repasse_asaas_id_anterior is not null
union all
select 'multa quitada sem repasse concluido', p.id, null from public.penalties pe join public.payments p on p.id = pe.payment_id where pe.quitada_em is not null and p.repasse_status is distinct from 'REPASSADO'
union all
select 'mesma transferencia em pagamentos diferentes', null, t.transferencia from (
  select repasse_asaas_id as transferencia, id from public.payments where repasse_asaas_id is not null
  union select repasse_asaas_id_anterior, id from public.payments where repasse_asaas_id_anterior is not null
) t group by t.transferencia having count(distinct t.id) > 1;
```

O último caso interrompe a migration de propósito; resolva antes de aplicá-la.

## Cuidados

- **Rotina financeira:** ainda não ativada em produção. Quando ativada, o GitHub Actions dispara `POST /api/admin/rotina-financeira` a cada 5 minutos e a trava no banco (`rotina_financeira_execucao`) garante uma execução por vez, em qualquer número de instâncias. Ela age sobre o banco compartilhado: conclui shows com mais de 7 dias, pede repasses, acompanha estornos e concilia tentativas. `ENABLE_FINANCIAL_ROUTINE` habilita o timer local opcional da API. Mantenha `false` quando o disparo for realizado exclusivamente pelo GitHub Actions. Se definido como `true`, o timer local poderá ser iniciado somente quando o ambiente permitir sua execução (em produção ou com Supabase local), utilizando a mesma trava no banco. Só uma transferência é criada por pagamento.
- **Ativar a rotina em produção:** (1) conferir que as migrations estão aplicadas no Supabase (desde 20/11, todas estão); (2) gerar um token aleatório de pelo menos 32 caracteres (por exemplo `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) e definir `FINANCIAL_ROUTINE_TOKEN` no ambiente da API; (3) publicar a API e conferir que `POST /api/admin/rotina-financeira` sem token responde `401`; (4) no GitHub, criar os secrets `MUVE_API_URL` (URL da API terminando em `/api`) e `FINANCIAL_ROUTINE_TOKEN`; (5) criar a variável de repositório `ROTINA_FINANCEIRA_ATIVA=true`, que libera o agendamento e o disparo manual (sem ela, nenhum dos dois chama a API); (6) rodar o workflow "Rotina financeira" à mão uma vez e conferir `select * from public.rotina_financeira_execucao;` (`ultimo_resultado = SUCESSO`). Para pausar, apague a variável ou mude para `false`.
- **Limite de requisições:** pagamento, assinatura, estorno, mensagens, propostas, convites, inscrições, eventos, perfil, contestação, consulta da contratação e exclusão de conta têm limite por usuário (lista em `backend/src/http/app.ts`). Os contadores ficam na memória de cada API e zeram ao reiniciá-la; não valem entre notebooks diferentes. Se a demonstração esbarrar num limite, reinicie a API.
- **Tela de pagamento:** abrir a tela de Pix de um candidato gera uma cobrança real no sandbox. Para só olhar o visual, use um evento de teste.
- **Repositório público:** nunca coloque chaves em arquivos versionados. As contas de demonstração têm a senha no README, então não guarde nada real nelas.
- **`pnpm test:db`:** as versões novas do Supabase CLI pedem confirmação para rodar SQL em projeto de produção e podem recusar a execução sem terminal interativo. Os testes foram feitos para não deixar dados, mas confira antes de autorizar.
- **Eventos de outros integrantes:** o banco é compartilhado. Confira o dono antes de apagar qualquer coisa.
- **Migrations novas:** toda mudança de banco é uma migration nova, testada antes no banco local (`npx supabase db reset --local`, `pnpm test:db` e, para as travas do financeiro, `node scripts/test-db-concorrencia.mjs`). Aplicar no banco compartilhado só com decisão do grupo, com `npx supabase db push`.
- **Teste E2E:** `pnpm test:e2e` roda só no Supabase local. O orquestrador (`scripts/e2e-local.mjs`) confere que a URL, o banco e as chaves são da instância local deste projeto (host da própria máquina, portas dos contêineres `supabase_*_muve`, chaves de demonstração assinadas pelo segredo local) antes de qualquer reset ou requisição; reseta o banco local antes e depois; sobe a API com `MUVE_IGNORAR_ARQUIVO_ENV=true`, sem Asaas, sem SMTP e sem rotina financeira, e nunca lê `backend/.env`. Se o Supabase local já estiver rodando, ele recusa, porque o reset apagaria os dados locais; para autorizar, use `pnpm test:e2e -- --reutilizar-instancia`. Os caminhos reais da Asaas (cobrança Pix, estorno e repasse no sandbox) não são cobertos pelo E2E e continuam sendo testados à mão.
- **Dados de demonstração:** o evento "Noite acústica no terraço" foi marcado como repassado manualmente, porque a transferência original ficou na conta antiga da Asaas. O evento "Noite de MPB no Bar Teste" teve o repasse real concluído. "Sexta de MPB no Bar Teste" é em 14/11/2026; depois disso, crie outro evento para a demonstração.

## Situação em 20/11/2026

- **Main:** o PR #7 levou ao `main` a branch de entrega e o PR #6; os PRs #1, #2, #3 e #5 foram fechados.
- **Banco hospedado:** as 12 migrations de 13 a 16/11 foram aplicadas, com cópia de segurança feita antes (fora do repositório). Agora são 33.
- **Render:** a API hospedada não é necessária. O app usa a API local, a rotina do GitHub Actions está desligada (sem `ROTINA_FINANCEIRA_ATIVA` e sem secrets) e nada aponta para a Render. O `muve-api` existe, não responde e ninguém do grupo tem acesso à conta. Para deixá-lo inofensivo: trocar a chave `service_role` do backend por uma chave secreta nova (`sb_secret_`), desativar as chaves legadas do Supabase e desativar as chaves antigas da Asaas.
- **Webhook da Asaas:** aponta para uma Edge Function da versão antiga, que não existe mais, e está desativado. Não é necessário: pagamentos, planos e estornos são confirmados por consulta direta à Asaas.
- **Repasse na apresentação:** com a API no notebook e o banco hospedado, a rotina financeira fica bloqueada, então o repasse não acontece ao vivo. O roteiro mostra o repasse real já concluído em "Noite de MPB no Bar Teste".

## Revisão da banca (20/11/2026)

Quatro revisões independentes (segurança, uso errado, manutenção e testes) reprovaram a versão anterior. Corrigido no PR da branch `correcoes/banca`:

- Valor "150.50" virava R$ 15.050,00; a proposta no chat agora mostra a prévia do valor.
- A tela de pagamento mostrava o cachê do evento, e o servidor cobrava o valor proposto; agora mostra o valor da inscrição, e a API recusa cobrar se ele mudou (`VALOR_ALTERADO`).
- Datas impossíveis (31/02) eram aceitas e viravam outra data.
- Excluir a conta com Pix pendente deixava a cobrança sem evento, fora da rotina.
- A chave Pix mudava sem senha e sem aviso.
- `ADMIN_TOKEN` aceitava qualquer tamanho, e as rotas do suporte não tinham limite de tentativas.
- Senha mínima de 8 caracteres; imagem conferida pelo conteúdo; sessão expirada volta ao login; mensagem amigável com o servidor fora do ar.
- Aviso da penalidade na desistência com menos de 24h; aviso quando a recorrência do Muve Casa é criada pela metade; explicação do tamanho mínimo da contestação.
- Uma definição de cobrança quitada para pagamentos e planos; o nome `refreshRefund` deixou de ser usado para duas funções diferentes.
- Teste que compara as regras do banco com as do TypeScript (multa, penalidade, prazos, raio e acesso antecipado do Pro, prazos da liberação de repasse).
- Testes novos: exclusão com Pix pendente, terceiros na negociação e na contestação, contestação depois do repasse, contestação inexistente, assinatura repetida e desconhecida.
- `pnpm test` no Windows usa o Git Bash; sem um bash compatível, os dois casos do workflow são pulados.
- `claim_payout` passa a recusar repasse `FALHOU` também no banco (migration `20261120120000_repasse_falhou_no_banco`, com teste pgTAP).
- Os `catch` que engoliam erros de estorno, repasse, imagens e avisos passam a registrar o motivo (`backend/src/services/falhas.ts`).

Ficou para decisão do grupo, com a proposta registrada:

- **Não comparecimento unilateral:** resolvido em 20/11 (PR #17, ver "Não comparecimento com prazo de resposta").
- **Leitura direta da tabela de eventos:** a policy permite ler todo evento aberto, contornando o acesso antecipado do Pro e a visibilidade reduzida (é o ponto D3 da auditoria). Proposta: limitar a leitura de evento aberto ao que o feed mostraria, a quem já se inscreveu e a quem foi convidado. Exige migration.
- **Publicar evento e enviar mensagem não são idempotentes:** um tempo esgotado pode levar a duplicar. Proposta: chave de idempotência enviada pelo app e restrição única. Exige migration.
- **Redirecionamento `exp://**` no Supabase:** necessário para o Expo Go, mas permite levar o link de redefinição de senha a um app do atacante. Em produção, deixar só `muve://auth`.
- **Manutenção:** dividir `paymentService.ts` (733 linhas) e `ui.tsx`, centralizar em `dominio.ts` as permissões da contratação e a situação da conversa e unificar português e inglês nos nomes. São refatorações grandes demais para fazer perto da entrega.

## QA de ponta a ponta (20/11/2026)

O relatório está em [qa-2026-11-20.md](qa-2026-11-20.md). Parecer: reprovada para produção e apta com ressalvas para a apresentação. Corrigido na branch `qualidade/qa-20-11`:

- QA-01: o limite das rotas de suporte passou a valer para todas elas juntas, e não para cada ID.
- QA-02: o erro do captcha não some ao digitar e ganhou o botão "Tentar de novo" (`VerificacaoDeSeguranca`).
- QA-03: o grupo escolheu a opção A. Um Pix pago depois dos 15 minutos contrata enquanto a cobrança não foi removida, o evento está aberto e o músico está livre; regra registrada em `produto.md`.
- QA-05: o aviso de vencimento consulta a Asaas, remove a cobrança e, se ela já foi paga, contrata.
- QA-06: /reset e /completar sem sessão voltam para o login.
- QA-07: os Termos abertos pela URL ganharam o botão "Início".
- QA-08: caixas de seleção e opções de escolha informam `aria-checked`, e o Espaço alterna.
- QA-09: página 404 em português.
- QA-10 e QA-11: o botão voltar da web se chama "Voltar" e tem 44px; links do login com área de toque de 44px.
- QA-12 e QA-13: corpo inválido responde "Dados inválidos."; corpo grande demais responde 413 com mensagem genérica.
- QA-14: webhook com limite de tentativas.
- QA-15: o Enter envia a recuperação de senha, e o e-mail inválido é explicado.

Continuam pendentes:

- **QA-04 e QA-16:** decidido manter os dados. O Muve Casa sem pagamento do Bar Teste está explicado no roteiro. O horário recuado de "Noite de MPB no Bar Teste" fica como está, porque o evento já foi concluído e repassado.
- **Setas no grupo de opções:** feito no PR #14. As setas trocam a opção e o foco, e só a opção marcada entra na ordem do Tab.
- **Isolamento entre usuários:** coberto no banco por `supabase/tests/database/isolamento_entre_usuarios.test.sql` (27 casos, com a sessão de cada usuário simulada no RLS). O login pela tela continua só no teste manual, porque o captcha não deve ser contornado.

### Fluxos de ponta a ponta (20/11/2026, à noite)

Executados pelos serviços da API, com os adaptadores reais (Supabase hospedado e Asaas sandbox) e as contas de teste. Ficam de fora a tela e o login, por causa do captcha. Resultado: 44 fluxos, e só um falhou, por erro da preparação (chave Pix fictícia).

- **Evento:** criar com foto, editar, recusar data no passado e recusar edição por quem não é o dono.
- **Inscrição:** inscrever, recusar inscrição duplicada, recusar inscrição do contratante, propor valor, cancelar a inscrição e o contratante recusar um candidato.
- **Conversa e proposta:** mensagens nos dois sentidos, terceiro recusado, proposta de R$ 220 aceita.
- **Pagamento:**
  - valor desatualizado recusado com `VALOR_ALTERADO`;
  - Pix de R$ 242 gerado em 3,6 s;
  - gerar de novo reaproveita a cobrança;
  - desistir remove a cobrança da Asaas;
  - Pix pago contrata e retém o cachê.
- **Contratação:** só o músico contratado vê o endereço; avisos na caixa de entrada.
- **Estornos:** desistência com mais de 24h (R$ 242, integral, evento volta a ficar aberto) e não comparecimento (R$ 110, evento cancelado, multa de R$ 20 e visibilidade reduzida até 05/12), os dois concluídos depois da autorização por SMS.
- **Depois do show:**
  - confirmação e não comparecimento recusados antes do horário;
  - os dois confirmam e o evento conclui;
  - avaliações nos dois sentidos, sem repetir;
  - contestação suspende a confirmação, e o suporte decide pagar o músico;
  - repasses de R$ 150 e R$ 120 concluídos.
- **Muve Pro:** assinar, pagar, ativar até 21/12 e cancelar mantendo até o fim do período; contratante sem Casa não favorita.
- **Repasse que falhou:** a chave fictícia fez o repasse falhar. Isso levou ao PR #13, que recupera esses repasses: depois da troca da chave, o repasse de R$ 150 foi concluído na segunda tentativa.

Observações da rodada:

- **A chave Pix não é conferida no cadastro:** o app só confere o formato, e o músico descobre uma chave inexistente depois do show, quando o repasse falha. Com o PR #13, ele é avisado e recebe ao trocar a chave. Conferir a chave antes, pela Asaas, fica para produção.
- **Não comparecimento unilateral confirmado na prática:** registrado 15 segundos depois do horário do show, com estorno e multa imediatos e sem chance de o músico responder. Levou ao PR #17.
- **Evento com pagamento não é apagado:** a exclusão vira cancelamento, para manter o histórico financeiro. O evento de teste "Teste E2E: noite de rock e MPB (editado)" foi cancelado assim.

## Não comparecimento com prazo de resposta (PR #17, 20/11/2026)

- O contratante informa que o músico não compareceu, depois do horário do show. Nada é estornado na hora: o evento guarda `ausencia_informada_em`, e o músico é avisado.
- O músico tem 24 horas (`AUSENCIA_PRAZO_RESPOSTA_MS` em `shared/dominio.ts`) para responder. Se ele confirmar que tocou, abre-se uma contestação automática, decidida pelo suporte.
- O contratante pode retirar o aviso nesse prazo, confirmando o show.
- Sem resposta em 24 horas, valem o estorno integral, a multa e a visibilidade reduzida, aplicados pela rotina financeira ou quando alguém abre a contratação. Depois do prazo, o músico não confirma nem contesta (`PRAZO_DE_RESPOSTA_ENCERRADO`).
- A regra está em [produto.md](produto.md) e nos Termos (versão `2026-11-20`); teste pgTAP em `ausencia_com_prazo.test.sql`. Falta alinhar a mudança com o grupo e testar a tela no Expo Go.

## Mudanças e testes de 21/11/2026

- **PR #21:** todos os músicos compatíveis veem o evento assim que ele é publicado; nas primeiras 24h, só o Pro se inscreve quando faltam 7 dias ou mais (regra em [produto.md](produto.md)). As avaliações recebidas pelo contratante aparecem na tela do evento. Ajustes perdeu "Estilos e recebimento", que repetia "Editar perfil". Início e duração do evento são completados ao sair do campo.
- **Testes pela API** (serviços do backend com o Supabase hospedado e as contas de teste; não substituem a tela):
  - **Conversa encerrada (3A), 8/8:** a conversa aceita mensagens antes do show; depois do início sem contratação e depois da recusa, a API responde "Esta conversa está encerrada" e recusa propostas; as mensagens continuam gravadas.
  - **Favoritos sem internet (3E), 6/6:** o coração muda na hora; sem internet aparece o erro com "Tentar de novo" e nada é gravado; com a internet de volta, "Tentar de novo" grava e o erro some.
  - **Repasse com falha:** considerado validado pelos fluxos de 20/11 (chave fictícia, falha, troca da chave e repasse concluído). Repetir criaria registros permanentes no banco da apresentação, porque as tentativas de repasse não podem ser apagadas.
- **Já validados no Expo Go, sem repetir:** sem internet (D14), efeito ao rolar (D20), notificações lidas (D9: o destaque sumir depois de abrir é o comportamento correto) e o logout básico (16/11).
- **D5 adiado:** cancelar a inscrição ainda apaga a conversa. Preservar exige um estado novo e decidir se o músico pode se inscrever de novo no mesmo evento.

### Roteiro curto para o Expo Go

Antes: `git pull` e `npm install` na pasta `mobile`.

1. Evento novo marcado para daqui a 8 dias ou mais: `musico2@teste.com` (sem Pro) não vê o evento no feed nas primeiras 24 horas; `musico3@teste.com` (Pro) vê e se inscreve na hora. Um evento para daqui a menos de 7 dias aparece para os dois.
2. Tela do evento, como músico: aparece "Avaliações do contratante".
3. Ajustes, como músico: não aparece mais "Estilos e recebimento".
4. Conversa com proposta, como contratante: o cartão mostra o total que o contratante paga, e o topo mostra "Para aprovar a inscrição de R$ Y, você paga R$ X" (D12).
5. Favoritar uma vez no detalhe e uma no perfil: o coração muda na hora.
6. Sair da conta: vai direto para o login, sem tela preta.
7. Inscrição recusada: aparece "Esta conversa está encerrada", e as mensagens continuam.
8. Com o Wi-Fi desligado, favoritar e depois tocar em "Tentar de novo" com o Wi-Fi ligado.
9. Se der tempo: o aviso de 24 horas do não comparecimento (precisa de um evento contratado que já começou).
10. Pix: uma tentativa só, quando a chave da Asaas sair de "Aguardando ativação".

## Mudanças de 22/11/2026 (PR #23)

- **Histórico de eventos:** "Meus eventos" e "Minhas inscrições" separam o que está em andamento do histórico, que mostra 5 e "Ver todos". Antes, o contratante via os shows antigos primeiro. O perfil do contratante mostra 3 eventos.
- **Redes sociais do músico:** Instagram, YouTube, Spotify e TikTok, além de "Site ou outro link" (o campo antigo). Instagram e TikTok aceitam o @; a API confere que o link é da própria rede. Migration `20261122120000_redes_sociais_do_musico`, com teste pgTAP.
- **Para o roteiro do Expo Go:** como músico, preencher as redes em Editar perfil e conferir os botões no Perfil; como contratante, conferir as duas seções da aba Eventos e os botões das redes na tela do candidato.

## Mudança de 23/11/2026

- **Pro volta a ver os eventos antes:** por decisão do grupo, nas primeiras 24 horas os eventos com 7 dias ou mais de antecedência voltam a aparecer só para o Pro (migration `20261123120000_pro_ve_eventos_antes`). Fica a melhoria de 21/11 no cálculo: a antecedência é conferida no momento, e 7 dias exatos ainda esperam.

## O que falta

### Para a entrega do TCC
- [ ] Testar no celular pelo Expo Go, pelo "Roteiro curto para o Expo Go" acima.
- [ ] Gerar o QR Code do Pix de novo quando o sandbox da Asaas voltar (ver "Estado atual"). Se não voltar, falar com o suporte da Asaas.
- [ ] Gravar um vídeo ou tirar prints do pagamento funcionando, como plano B para a apresentação.
- [ ] Alinhar com o grupo a regra do não comparecimento com prazo de 24 horas (PR #17).
- [ ] Ensaiar a apresentação no computador e no celular reais, com o fluxo completo.
- [ ] Combinar quem estará com o telefone da conta Asaas na apresentação (no sandbox, o código `000000` costuma bastar).
- [ ] Passar [monografia.md](monografia.md) para o texto oficial, incluindo o redesign.
- [x] Turnstile: `localhost` e `127.0.0.1` liberados no widget da Cloudflare em 20/11. O `mobile/.env` de quem apresenta precisa de `EXPO_PUBLIC_TURNSTILE_SITE_KEY` e `EXPO_PUBLIC_TURNSTILE_BASE_URL`.
- [x] Contas de teste completas (lista no README).
- [x] Repasse que falhou volta para a fila com a chave Pix nova (PRs #13 e #16).
- [x] Setas nos grupos de opções e versões do Expo alinhadas (PR #14).
- [x] Nova regra do Pro, avaliações do contratante e ajustes (PR #21, migrations aplicadas em 21/11).
- [ ] D5: preservar a conversa quando o músico cancela a inscrição (adiado para depois da entrega).
- [x] Defeitos da auditoria do Expo Go e da QA de 20/11 corrigidos (PRs #6 a #11); o registro está em [historico/](historico/).
- [ ] Depois da entrega: trocar as chaves do Supabase e da Asaas que circularam durante o desenvolvimento e desativar as chaves legadas.

### Para produção
- [ ] Conferir a chave Pix na Asaas quando o músico a cadastra, para ele não descobrir só depois do show que ela não existe.
- [ ] Ligar a rotina financeira agendada (variável `ROTINA_FINANCEIRA_ATIVA` do GitHub Actions); sem ela, expiração, estorno tardio e repasse dependem de alguém abrir o app.
- [ ] Painel de suporte no app (contestações, repasses e planos), com decisão do grupo.
- [ ] Conta Escrow com subcontas ([conta-escrow.md](conta-escrow.md)), que exige conta Asaas com CNPJ.
- [ ] Bloquear usuário. Hoje só existe denúncia, por e-mail ao suporte.
- [ ] Política de privacidade com link próprio, separada dos Termos.
- [ ] Conferir se Pro e Casa precisam usar o pagamento da Apple e do Google.
- [ ] Contador regressivo e aviso quando a inscrição do Pro abrir para todos (ideia registrada em [produto.md](produto.md)).
- [ ] Login com Apple, exigido quando o app oferece login com Google.
- [ ] SMTP, hospedagem da API e build pelo EAS.
- [ ] Nova tentativa automática de estorno negado. Hoje isso acontece quando alguém abre a tela.
- [ ] Buscar cobrança existente antes de criar outra, para não sobrar cobrança sem uso se a API cair no meio.
