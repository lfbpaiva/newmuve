# Continuidade do projeto

Guia para quem pegar o Muve a partir daqui. Regras do produto em [produto.md](produto.md), decisões técnicas em [arquitetura.md](arquitetura.md), instalação no [README](../README.md) e roteiro em [apresentacao.md](apresentacao.md).

## Estado atual

O fluxo completo (publicar evento, inscrever músico, pagar por Pix, contratar, confirmar o show e repassar o cachê) foi testado de ponta a ponta no sandbox da Asaas com dinheiro fictício em rodadas anteriores. Nas tentativas manuais mais recentes pelo Expo Go, a obtenção do QR Code Pix falhou com `invalid_action` e `TimeoutError` e nenhum pagamento foi concluído; a validação manual desse trecho do checkout continua pendente (ver [EXECUCAO_PR6_CONTINUIDADE.md](EXECUCAO_PR6_CONTINUIDADE.md), "Lote 2: falha do QR Code Pix"). O fluxo não deve ser considerado validado na totalidade até essa tentativa ser concluída.

- **Código:** a referência desta transferência é a branch `handoff/luiz-newmuve-2026-11-20` de `lfbpaiva/newmuve`, no commit `7e785fb980c0c5e4f30f691869165b710c5683ef`, criada a partir de `continuidade/estado-atual-2026-11-18`. Luiz deve partir dessa branch para continuar o trabalho recebido. A `main` não contém necessariamente todas as alterações desta entrega. O repositório `Cleiton-Martins/MUVE` é antigo; não use.
- **PR #6 (`integracao/redesign-lote1`):** reúne o trabalho das branches `cloudflare`, `feature/redesign-muve` e `fix/lote1-estabilidade-mobile` (PRs #3, #4 e #5) e o redesign visual. Essas branches começavam num histórico próprio, sem ancestral comum com o `main`, por isso os arquivos foram trazidos sobre o `main` em vez de mesclados. O PR #6 permanece separado e não foi modificado por esta publicação. Depois do merge do #6, feche o #3 e o #5.
- **PRs 1 e 2:** partem de uma versão antiga e desfazem regras atuais (show duplo, multa, contestação). Não faça merge deles.
- **Banco:** última contagem conhecida: 33 migrations em `supabase/migrations/`, 21 aplicadas no Supabase hospedado do grupo (até `20261029180000_muve_casa`) e 12 pendentes (de `20261113120000` a `20261116150000`), conforme [PLANO_MIGRATIONS_HOSPEDADO.md](PLANO_MIGRATIONS_HOSPEDADO.md). Esses números são referência histórica: o estado real do hospedado precisa ser revalidado antes de qualquer execução. O redesign não mudou o banco nem a API.
- **Verificação:** o GitHub Actions roda `pnpm typecheck`, `pnpm lint` e `pnpm test` a cada push e pull request. O `pnpm lint` ignora a pasta `mobile/` (ver a seção 19 da auditoria).

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
- Antes de qualquer execução contra o Supabase hospedado, revalidar quais migrations estão aplicadas ([PLANO_MIGRATIONS_HOSPEDADO.md](PLANO_MIGRATIONS_HOSPEDADO.md)); os testes automatizados cobrem só o banco local.
- Os testes manuais no Expo Go continuam pendentes, nos itens listados em "O que falta"; teste automatizado não os substitui.
- Decidir como recuperar repasses `FALHOU` continua em aberto (ver "O que falta" e [EXECUCAO_PR6_CONTINUIDADE.md](EXECUCAO_PR6_CONTINUIDADE.md)).

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
- Para confirmar um Pix de teste, abra a cobrança no painel e use **Confirmar pagamento**.
- A conta é de pessoa física, então não permite subcontas (Conta Escrow).
- Ao trocar de conta, os clientes da conta antiga são recriados automaticamente na próxima cobrança ou assinatura.

## Planos para teste

- **Pelo app:** assine em Ajustes → Muve Pro ou Muve Casa, confirme o pagamento da cobrança no painel da Asaas e abra de novo a tela do plano; ela consulta a Asaas e ativa por 30 dias, sem depender de webhook.
- **Pelo banco (atalho, só em contas de teste):** no SQL Editor do Supabase, `update public.contractor_profiles set casa_ate = now() + interval '30 days' where user_id = (select id from auth.users where email = 'contratante@teste.com');`. Para o Pro, use `musician_profiles` e `pro_ate`. Esse caminho não cria assinatura nem cobrança.

## Suporte

Não há conta de administrador no app. Contestações são decididas por `scripts/resolver-contestacao.mjs` e repasses travados são liberados por `scripts/resolver-repasse.mjs`, os dois com o `ADMIN_TOKEN` de `backend/.env`. Um painel de suporte dentro do app (contestações, repasses e planos) fica como trabalho futuro e depende de decisão do grupo em `produto.md`.

### Repasses travados

A liberação tem duas etapas (`verificar`, depois de 24 horas do pedido, e `confirmar`, pelo menos 1 hora depois), cada uma com busca completa e vazia na Asaas. Desde o Lote 2, Etapa 1, liberar não paga o músico: a tentativa é encerrada, o repasse fica `FALHOU` e nenhuma nova tentativa é feita; o script lista esses repasses como pendentes. O banco recusa qualquer etapa fora do prazo, fora de ordem ou com busca incompleta. Essas proteções reduzem o risco de Pix duplicado, mas não comprovam a ausência da transferência: confira o painel da Asaas antes de confirmar. O nome passado em `--operador` é registrado como informado; não há autenticação individual do suporte.

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
- **Ativar a rotina em produção:** (1) aplicar as migrations pendentes no Supabase, inclusive `20261116130000_trava_da_rotina_financeira`; (2) gerar um token aleatório de pelo menos 32 caracteres (por exemplo `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) e definir `FINANCIAL_ROUTINE_TOKEN` no ambiente da API; (3) publicar a API e conferir que `POST /api/admin/rotina-financeira` sem token responde `401`; (4) no GitHub, criar os secrets `MUVE_API_URL` (URL da API terminando em `/api`) e `FINANCIAL_ROUTINE_TOKEN`; (5) criar a variável de repositório `ROTINA_FINANCEIRA_ATIVA=true`, que libera o agendamento e o disparo manual (sem ela, nenhum dos dois chama a API); (6) rodar o workflow "Rotina financeira" à mão uma vez e conferir `select * from public.rotina_financeira_execucao;` (`ultimo_resultado = SUCESSO`). Para pausar, apague a variável ou mude para `false`.
- **Limite de requisições:** pagamento, assinatura, estorno, mensagens, propostas, convites, inscrições, eventos, perfil, contestação, consulta da contratação e exclusão de conta têm limite por usuário (lista em `backend/src/http/app.ts`). Os contadores ficam na memória de cada API e zeram ao reiniciá-la; não valem entre notebooks diferentes. Se a demonstração esbarrar num limite, reinicie a API.
- **Tela de pagamento:** abrir a tela de Pix de um candidato gera uma cobrança real no sandbox. Para só olhar o visual, use um evento de teste.
- **Repositório público:** nunca coloque chaves em arquivos versionados. As contas de demonstração têm a senha no README, então não guarde nada real nelas.
- **`pnpm test:db`:** as versões novas do Supabase CLI pedem confirmação para rodar SQL em projeto de produção e podem recusar a execução sem terminal interativo. Os testes foram feitos para não deixar dados, mas confira antes de autorizar.
- **Eventos de outros integrantes:** o banco é compartilhado. Confira o dono antes de apagar qualquer coisa.
- **Migrations novas:** `20261113120000_penalidade_no_estorno`, `20261113130000_reserva_de_multas` e `20261114120000_tentativas_de_repasse` foram testadas só no banco local (`npx supabase db reset --local`, `npx supabase test db` e `node scripts/test-db-concorrencia.mjs`). Aplicar no banco compartilhado depende de decisão do grupo.
- **Teste E2E:** `pnpm test:e2e` roda só no Supabase local. O orquestrador (`scripts/e2e-local.mjs`) confere que a URL, o banco e as chaves são da instância local deste projeto (host da própria máquina, portas dos contêineres `supabase_*_muve`, chaves de demonstração assinadas pelo segredo local) antes de qualquer reset ou requisição; reseta o banco local antes e depois; sobe a API com `MUVE_IGNORAR_ARQUIVO_ENV=true`, sem Asaas, sem SMTP e sem rotina financeira, e nunca lê `backend/.env`. Se o Supabase local já estiver rodando, ele recusa, porque o reset apagaria os dados locais; para autorizar, use `pnpm test:e2e -- --reutilizar-instancia`. Os caminhos reais da Asaas (cobrança Pix, estorno e repasse no sandbox) não são cobertos pelo E2E e continuam sendo testados à mão.
- **Dados de demonstração:** o evento "Noite acústica no terraço" foi marcado como repassado manualmente, porque a transferência original ficou na conta antiga da Asaas. O evento "Noite de MPB no Bar Teste" teve o repasse real concluído. "Sexta de MPB no Bar Teste" é em 14/11/2026; depois disso, crie outro evento para a demonstração.

## O que falta

### Para a entrega do TCC
- [ ] Corrigir os defeitos da rodada de testes no Expo Go de 16/11/2026, conforme o plano em [AUDITORIA_EXPO_GO.md](AUDITORIA_EXPO_GO.md), seções 13 e 16. Os de maior prioridade: o falso erro ao convidar, a exclusão de evento que apaga conversas e o "Aprovar e pagar" sem confirmação.
- [x] Testar no celular a primeira etapa de correções (D9, D12, D13, D14, D20; seções 18 e 19 da auditoria): validada pelo usuário em 17/11. D1 continua pendente no hospedado.
- [ ] Analisar e autorizar as correções dos complementos A a L da rodada de testes de 17/11 (seção 24 da auditoria e tabela de complementos do roteiro oficial).
- [ ] Testar no celular a rodada de 17/11 (checklist na seção 25 da auditoria): H, C e F já validados pelo usuário; faltam A e E. Em seguida: B com o texto decidido ("Para aprovar a inscrição de R$ Y, você paga R$ X"); D, I, J, K e L continuam fora do escopo.
- [x] Testar no celular a Etapa 2 (seção 30 da auditoria): D4, D5 (confirmação), D6 e D11 validados pelo usuário em 17/11; D15 testado. A conversa no cancelamento voluntário (D5) e o cancelamento depois de contratado (D7) dependem de migrations.
- [ ] Consultar o documento mestre de continuidade (17/11/2026) em [EXECUCAO_PR6_CONTINUIDADE.md](EXECUCAO_PR6_CONTINUIDADE.md) antes de qualquer nova rodada. Próximos marcos: revisar o PR #6, montar o inventário e o plano de migrations (incluindo D5 e D8), tratar Avaliações e D19, e fazer a revisão abrangente.
- [ ] Seguir o roteiro oficial das três etapas, registrado em [EXECUCAO_PR6_CONTINUIDADE.md](EXECUCAO_PR6_CONTINUIDADE.md), seção "Roteiro oficial de continuidade". Etapas 1 e 2 executadas e registradas no Git (Lote 1, 17/11); a Etapa 3 não começou.
- [x] Testar no celular a Etapa 1 (seção 22 da auditoria): total para o contratante (D12), favoritos (D13) e saída da conta, validados pelo usuário em 17/11. D1 no hospedado depende de autorização para gravar um convite.
- [ ] Rever as "Melhorias futuras" registradas no fim da auditoria. Não entram na entrega de 24/11.
- [ ] Decidir se o evento com convite deve aparecer no feed do músico convidado durante o acesso antecipado (seção 21 da auditoria: hoje a inscrição é liberada, mas o evento só aparece por notificação ou link).
- [ ] Decidir os pontos de produto da seção 20 da auditoria: total com taxa nas propostas, raio do feed por conta, visibilidade de eventos pela tela do evento e aviso de acesso antecipado. A API não registra requisições; o roteiro de teste foi corrigido nessa seção.
- [ ] Decidir como recuperar repasses que falharam: desde o Lote 2, Etapa 1, só a rotina financeira pede repasses e nenhum caminho tenta de novo um repasse `FALHOU` (ver [EXECUCAO_PR6_CONTINUIDADE.md](EXECUCAO_PR6_CONTINUIDADE.md)).
- [ ] Revisar e fazer o merge do PR #6; depois fechar os PRs #1, #2, #3 e #5.
- [ ] Testar no celular pelo Expo Go (Expo SDK 58): abertura, transições, barra inferior e puxar para atualizar.
- [ ] Ensaiar a apresentação no computador e no celular reais, com o fluxo completo.
- [ ] Completar a conta de músico da demonstração (foto, CPF, telefone e chave Pix fictícia do Banco Central) para ela poder se inscrever.
- [ ] Combinar quem estará com o telefone da conta Asaas na apresentação.
- [ ] Passar [monografia.md](monografia.md) para o texto oficial, incluindo o redesign.

### Para produção
- [ ] Painel de suporte no app (contestações, repasses e planos), com decisão do grupo.
- [ ] Conta Escrow com subcontas ([conta-escrow.md](conta-escrow.md)), que exige conta Asaas com CNPJ.
- [ ] Bloquear usuário. Hoje só existe denúncia, por e-mail ao suporte.
- [ ] Política de privacidade com link próprio, separada dos Termos.
- [ ] Conferir se Pro e Casa precisam usar o pagamento da Apple e do Google.
- [ ] Login com Apple, exigido quando o app oferece login com Google.
- [ ] SMTP, hospedagem da API e build pelo EAS.
- [ ] Nova tentativa automática de estorno negado. Hoje isso acontece quando alguém abre a tela.
- [ ] Buscar cobrança existente antes de criar outra, para não sobrar cobrança sem uso se a API cair no meio.
- [ ] Alinhar as versões de correção dos pacotes do Expo (`npx expo install --fix`).
