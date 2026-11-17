# Arquitetura do Muve

## Visão geral

```text
┌────────────────────────────────────────────┐
│ APP (React Native + Expo): celular e web   │
│ telas → shared/client → supabase-js/fetch  │
└──────┬───────────────────────────┬─────────┘
       │ login e leituras          │ toda escrita
       │ (chave pública + RLS)     │ (token do usuário)
       ▼                           ▼
┌──────────────────┐      ┌──────────────────────────┐
│ SUPABASE         │◄─────│ BACKEND (Node.js + Hono) │─────► ASAAS
│ Auth             │      │ http → services →        │◄───── webhook
│ Postgres + RLS   │      │ adapters                 │
│ Storage          │      └──────────────────────────┘
└──────────────────┘        (chave service_role e chave da Asaas)
```

- **Leituras** (feed, eventos, candidatos, avaliações) vão direto do app ao banco, com a chave pública. O que cada usuário enxerga é decidido pelas policies de RLS.
- **Escritas** (cadastro, perfil, eventos, candidaturas, checkout, cancelamentos, confirmações, avaliações, exclusão de conta) passam sempre pelo backend, que valida as regras e grava com a chave `service_role`. O app não tem nenhuma permissão de escrita no banco.
- **Pagamentos:** só o backend fala com a Asaas. O dinheiro entra na conta Asaas da plataforma, fica retido e é repassado ao músico por Pix após a conclusão do show.

## Decisões

**Backend Node.js dedicado, em vez de Edge Functions do Supabase.** A especificação do projeto prevê uma API REST em Node.js. A API chegou a ser publicada como Edge Function e foi movida para Node sem reescrever regras, porque os serviços dependem de interfaces e não do ambiente de execução.

**Supabase Auth, em vez de autenticação própria (hash de senha + JWT).** Cadastro, sessão, renovação de token, confirmação de e-mail, recuperação de senha e limite de tentativas de login são as partes em que implementações próprias mais falham. O backend valida o token do usuário em cada rota protegida.

**Hono, em vez de Express.** Usa a API padrão de `Request`/`Response`, o que permite testar as rotas sem subir servidor (`app.request(...)`) e trocar de ambiente de execução sem alterar o código.

**Acesso a dados com supabase-js e migrations SQL, em vez de Prisma.** O Supabase já expõe o Postgres; as policies de RLS, funções e triggers precisam ser SQL de qualquer forma. O schema é versionado em `supabase/migrations/`.

**Leituras direto no banco com RLS, em vez de um endpoint para cada consulta.** Evita dezenas de rotas de leitura e mantém a regra de visibilidade em um único lugar, testado por pgTAP. Colunas sensíveis (CPF/CNPJ, telefone, chave Pix) não são legíveis pelo cliente; o próprio dono as obtém por `GET /api/me`, e a outra parte de uma contratação recebe o telefone pelo comprovante.

**Regras de negócio em TypeScript no backend, e não em policies ou triggers.** São mais fáceis de ler, testar e explicar. Ficaram no banco apenas as invariantes que precisam valer sob concorrência: restrições (cachê mínimo, nota de 1 a 5, candidatura única, uma cobrança pendente por evento), a contratação atômica após o pagamento, a reabertura do evento quando o músico desiste e a conclusão após a dupla confirmação.

**Portas e adaptadores nos serviços.** `services/` depende das interfaces em `services/ports.ts` e `accountService.ts`; `adapters/` as implementa com Supabase e Asaas. O ganho concreto é a testabilidade: os testes usam implementações em memória, sem rede.

**`shared/dominio.ts`.** Validações (CPF, CNPJ, chave Pix, imagem), listas (estilos, tipos de evento, UFs), a comissão e as regras de match, de cancelamento e de prazo existem em um único arquivo, usado pelo app para dar retorno imediato e pelo backend para decidir.

**Plataforma recebe e repassa, em vez de split com subcontas.** O split da Asaas exige que cada músico tenha uma subconta (cadastro completo, documentos, mensalidade da Conta Escrow) e que a conta principal seja pessoa jurídica. Para o MVP, o músico cadastra apenas uma chave Pix e a plataforma transfere o cachê após o show. O split com subcontas é o caminho para produção.

**CPF ou CNPJ nos dois perfis, qualquer e-mail, sem bloqueio permanente.** Pessoas físicas contratam para festas particulares e bandas têm CNPJ; e-mail corporativo é o comum entre contratantes; excluir a conta não é motivo para impedir um novo cadastro.

**Feed por distância com dados locais, em vez de uma API de geolocalização.** A tabela `municipios` (5.571 municípios com coordenadas, fonte pública sob licença MIT) permite calcular a distância entre as sedes das cidades no próprio banco (haversine). O músico escolhe o raio (mesma cidade, 50, 100 ou 200 km); uma candidatura é aceita até o raio máximo de 200 km.

**Avisos por e-mail apenas nos momentos decisivos:** contratação confirmada (para os dois lados), desistência da outra parte e não comparecimento. Enviados por SMTP via nodemailer; sem SMTP configurado, ficam no log. Nunca bloqueiam a operação que os disparou.

**Uma interface só: o app em React Native (Expo), que também roda no navegador.** O projeto chegou a ter um site React separado; manter as duas interfaces significava fazer cada tela duas vezes. O Expo gera o app de celular e a versão web a partir do mesmo código, e no computador o app aparece numa coluna com largura de celular. Serviços de API, leituras do banco, sessão, validações e formatação ficam em `shared/client/`, separados das telas. Links de confirmação e redefinição de senha abrem o app pelo esquema `muve://auth`.

**Cadastro progressivo.** O cadastro pede só tipo de conta, nome, e-mail, senha e o aceite dos Termos de Uso. Cada dado do perfil é exigido no momento em que faz falta: cidade e estilos para montar o feed; foto, CPF/CNPJ, telefone e chave Pix para se candidatar; foto, documento, telefone e cidade para publicar um evento. A regra (`camposFaltantes` em `shared/dominio.ts`) é a mesma no app, que abre a tela "Complete seu perfil" só com o que falta, e na API, que recusa a ação com `PERFIL_INCOMPLETO` listando os campos.

**Lista de estilos no código, com vários estilos por evento.** Os 25 gêneros vivem em `shared/dominio.ts` (sem restrição no banco), um evento pode pedir vários ou "Qualquer estilo", e o match é a interseção com os estilos do músico. "Outros" cobre quem não se encaixa e casa com eventos abertos a qualquer estilo.

**Valores monetários como `numeric(10,2)`**, não ponto flutuante.

## Fluxos principais

### Cadastro

1. O app envia tipo de conta, nome, e-mail, senha e o aceite dos Termos de Uso para `POST /api/auth/signup`. Sem o aceite, a API recusa o cadastro.
2. O backend cria o usuário no Supabase Auth, com a versão dos termos e a data do aceite nos metadados do usuário, e grava o perfil só com o nome. O Supabase envia o e-mail de confirmação. Se a gravação falhar, desfaz o usuário.
3. Foto, CPF/CNPJ, telefone, cidade, estilos e chave Pix são preenchidos por `PATCH /api/me`, quando a ação do usuário passar a exigi-los. O documento é checado contra duplicidade nesse momento.

### Proposta de cachê e conversa

1. Ao se inscrever, o músico aceita o cachê oferecido ou propõe outro valor (`POST /api/events/:id/candidatura` com `valorProposto`). A proposta fica em `event_candidates.valor_proposto`, com o mesmo mínimo do cachê; um valor igual ao oferecido é gravado como "sem proposta".
2. Enquanto a inscrição aguarda resposta e não há cobrança em andamento, o músico pode rever o valor (`PATCH /api/events/:id/candidatura`).
3. Cada inscrição tem uma conversa entre o músico e o dono do evento (`candidate_messages`). O envio passa pela API (`POST /api/candidaturas/:id/mensagens`), que confere se quem escreve é uma das partes e se a conversa está aberta: inscrição não recusada e evento aberto ou contratado. A leitura é direta do banco, com RLS restrita às duas partes, e as mensagens novas chegam pelo Supabase Realtime.
4. Na aprovação, a cobrança usa o valor proposto pelo músico, se houver, ou o cachê do evento, sempre lidos do banco.

### Contratação e pagamento

1. O contratante escolhe um candidato; o app chama `POST /api/events/:id/checkout` enviando apenas o ID da candidatura.
2. O backend confere que o evento é dele e está aberto, lê o cachê **do banco** (a proposta do músico ou o valor do evento), soma a taxa de serviço de 10%, cria o cliente e a cobrança Pix na Asaas e grava o pagamento como `PENDENTE`, com validade de 15 minutos.
3. O app mostra o QR Code e consulta `GET /api/events/:id/checkout` a cada 5 segundos. A cada consulta, o backend confere o status na Asaas: se pago, efetiva a contratação; se expirado, cancela a cobrança na Asaas (o QR Code da Asaas valeria por meses).
4. A Asaas também notifica `POST /api/webhooks/asaas`. O backend confere o token, reconsulta o status e o valor na Asaas e chama a função `confirm_asaas_payment`, que em uma única transação marca o pagamento como `PAGO` e `RETIDO`, o evento como `CONTRATADO`, aprova o candidato e recusa os demais.
5. A partir daí, as duas partes acessam o **comprovante** (`GET /api/events/:id/contratacao`): endereço do evento, telefone da outra parte, valores e situação do pagamento e do repasse.

Garantias: repetir o checkout devolve a mesma cobrança; uma cobrança expirada ou substituída é cancelada também na Asaas; um pagamento tardio, cujo evento já foi contratado por outra cobrança, é estornado automaticamente; notificações repetidas não têm efeito; o webhook responde 200 mesmo a notificações que ignora, porque a Asaas pausa a fila após 15 respostas de erro seguidas; o app nunca informa valor nem declara que pagou.

### Notificações

A API grava avisos na tabela `notifications` sempre que algo muda para alguém: nova inscrição, mensagem, inscrição recusada, contratação, outro músico escolhido, evento alterado, confirmação do show pela outra parte, cancelamento, não comparecimento e repasse concluído. O app lê os avisos do próprio usuário (RLS) e recebe os novos pelo Supabase Realtime; o sino da tela inicial mostra quantos não foram lidos, e abrir a lista os marca como lidos (`POST /api/me/notificacoes/lidas`). Os avisos mais importantes também vão por e-mail quando há SMTP configurado.

### Pós-evento e repasse

Após o início do evento, contratante e músico confirmam cada um pelo próprio acesso. Com as duas confirmações, uma trigger conclui o evento; o cachê (sem a comissão) é transferido para a chave Pix do músico pela rotina financeira. Sem as duas confirmações e sem registro de não comparecimento, o show é dado como concluído 7 dias após a data, na próxima consulta ao comprovante ou pela rotina financeira. Nenhuma dessas conclusões transfere dinheiro: o repasse só é pedido pela rotina financeira autorizada (`paymentService.payout`), para pagamento `RETIDO` de show concluído ou cancelado. A reserva do repasse é um `UPDATE` condicional (`claimPayout`), o que impede transferência em dobro mesmo com chamadas simultâneas; uma falha fica registrada como `FALHOU` e não é tentada de novo. A avaliação mútua é liberada após a conclusão, e as médias de músico e contratante são recalculadas por trigger.

### Cancelamento

| Quem cancela | Quando | Efeito |
|---|---|---|
| Músico (antes de ser escolhido) | mais de 24h antes do evento | inscrição removida |
| Músico contratado | antes do início | estorno integral ao contratante; evento volta a ABERTO, demais candidatos voltam a concorrer |
| Contratante | mais de 24h antes | estorno integral; evento CANCELADO |
| Contratante | menos de 24h antes | sem estorno; cachê repassado ao músico; evento CANCELADO |
| Contratante (não comparecimento) | após o horário e até 7 dias depois, se ninguém confirmou o show | estorno integral; evento CANCELADO |

Depois do início do evento ninguém cancela: o encerramento é pela confirmação do show. Um estorno feito no painel da Asaas também cancela a contratação (webhook `PAYMENT_REFUNDED`). O estorno só conta como feito quando a Asaas confirma a devolução: enquanto está em processamento, a confirmação do show e o repasse ficam suspensos; se a Asaas recusa, a contratação volta a funcionar normalmente e o estorno pode ser pedido de novo; se o pedido nem chega à Asaas, a reserva é desfeita. Contas com show contratado, cachê ainda não repassado ou estorno em processamento não podem ser excluídas (`has_open_obligations`).

## Segurança

| Risco | Tratamento |
|---|---|
| Chaves privadas no app | Só a chave pública do Supabase vai ao app; `service_role` e Asaas ficam em variáveis de ambiente do backend |
| Acesso indevido a dados | RLS em todas as tabelas, sem permissão de escrita para o cliente; isolamento músico–músico; colunas sensíveis sem `grant`; endereço em tabela à parte, legível só pelo dono |
| Manipulação de valores | O valor da cobrança vem do evento no banco; o corpo da requisição só carrega IDs; o repasse usa o valor gravado no pagamento |
| Webhook forjado | Token comparado em tempo constante, reconfirmação do status e do valor na Asaas, deduplicação por ID do evento |
| Validação só no app | Todas as entradas são validadas no backend com Zod; o banco repete as restrições críticas |
| Força bruta e abuso | Limite de tentativas por IP em cadastro e exclusão de conta; o login usa os limites do Supabase Auth. Nas rotas autenticadas que acionam a Asaas, gravam arquivos ou geram notificações, limite por usuário e por grupo de rotas, contado pelo ID do token validado (nunca por dado enviado pelo cliente) e aplicado antes de qualquer operação. Rotas do mesmo grupo somam no mesmo contador, independentemente do ID na URL. A exclusão de conta tem os dois limites, por IP e por usuário. O bloqueio responde 429 com `Retry-After` |
| Vazamento em mensagens de erro | Erros inesperados viram uma mensagem genérica; o detalhe fica no log do servidor |
| CORS | Apenas as origens listadas em `ALLOWED_ORIGINS` |
| Upload malicioso | Tipo e tamanho validados na API e novamente no bucket (5 MB; PNG, JPEG, WebP) |

## Testes

| Camada | Ferramenta | O que cobre |
|---|---|---|
| Regras compartilhadas | Vitest | CPF, CNPJ, chave Pix, telefone, imagem, máscaras, comissão, prazo de cancelamento |
| Serviços do backend | Vitest, com portas em memória | cadastro e compensações, eventos, candidatura por raio e regra de 24h, checkout idempotente, consulta ativa, webhook, repasse sem duplicidade, estorno, cancelamentos, não comparecimento, conclusão por prazo, avaliação, avisos por e-mail |
| Rotas HTTP | Vitest + `app.request` | validação de entrada, autenticação, CORS, erros, token do webhook, limite de tentativas |
| Banco | pgTAP (`pnpm test:db`) | RLS por perfil, permissões de coluna, endereço, feed por raio e distâncias, restrições, contratação atômica, reabertura, dupla confirmação, reputação |
| Ponta a ponta | `pnpm test:e2e` | fluxo completo contra a API e o Supabase locais, resetados antes e depois |

Mocks existem apenas nos testes; a aplicação não tem dados simulados.

## Limitações conhecidas

- **Modelo de custódia:** reter valores de terceiros na conta da plataforma é aceitável como protótipo acadêmico; em produção, o split com subcontas e Conta Escrow da Asaas é o caminho regulado.
- **Estorno exige saldo:** a Asaas não devolve as tarifas da cobrança, então a conta precisa de saldo além do valor recebido para estornar integralmente.
- **Conclusão por prazo é avaliada sob demanda,** quando uma das partes consulta o comprovante; não há agendador.
- **Limite de tentativas em memória:** os contadores ficam na memória do processo da API. Cada notebook ou instância tem os seus, reiniciar a API zera todos, e não há proteção compartilhada entre instâncias: quem alternar entre APIs diferentes soma os limites de cada uma. Uma proteção comum exigiria um armazenamento compartilhado, como Redis ou uma tabela no banco. Os limites por grupo estão em `backend/src/http/app.ts`.
- **Notificações só dentro do app:** não há push no celular; o aviso aparece quando o app está aberto. E-mail depende de SMTP configurado.
- **Conversa sem moderação nem aviso de mensagem nova:** as mensagens aparecem em tempo real só com a conversa aberta.
- **Sem mediação de disputas:** se o músico confirmou o show e o contratante diz que ele não compareceu, a plataforma não arbitra.
- **Distância entre sedes de municípios,** não entre endereços; cidades homônimas são distinguidas pela UF.
- **CNPJ alfanumérico** (formato novo da Receita Federal) não é aceito; apenas o numérico.

**Rotina financeira na API, disparada de fora e com trava no banco.** A rotina (`rotinaFinanceira.ts`) é o único caminho que pede repasses: a consulta da contratação (`getHiring`) acompanha estornos e conclui shows vencidos, mas não chama `payout`. Em produção, o GitHub Actions (`.github/workflows/rotina-financeira.yml`) chama `POST /api/admin/rotina-financeira` a cada 5 minutos; a rota confere `x-rotina-token` contra `FINANCIAL_ROUTINE_TOKEN` com comparação de tempo constante, adquire a trava, responde `202` e segue a execução depois da resposta, ou responde `409` se outra execução já estiver ativa. O disparo externo também acorda o serviço gratuito da Render, que hiberna sem tráfego, e um timer local não sobrevive a isso. O timer de `server.ts` continua existindo só com `ENABLE_FINANCIAL_ROUTINE=true`, desligado na Render.

A exclusão entre instâncias fica no banco, porque a API usa o PostgREST e não mantém uma conexão fixa para uma trava de sessão. A tabela de uma linha `rotina_financeira_execucao` guarda o dono (UUID novo por execução), uma geração que cresce a cada aquisição, a validade e o resultado da última execução. `adquirir_rotina_financeira` só vence com a trava livre ou vencida (uma atualização condicional, serializada pela trava da linha); `renovar_rotina_financeira` e `encerrar_rotina_financeira` exigem o mesmo dono e a mesma geração, e a renovação também exige a trava ainda válida. A execução renova a cada 2 minutos uma validade de 10 minutos e, antes de cada etapa e de cada item, confere que a renovação não falhou e que falta mais de 1 minuto para a validade local vencer; se não, para e registra `FALHA`. A geração funciona como token de cerca para a trava: um dono antigo não renova nem encerra a execução de outro. As funções financeiras não recebem a geração; uma operação que já começou quando a trava se perde termina, protegida pelas próprias funções atômicas (`claim_payout`, `finalize_asaas_refund`, `concluir_tentativa` e as demais), e nenhuma etapa nova começa.

**Repasse: ausência de resposta não é falha.** Só uma recusa clara da Asaas (400, 401, 403, 422 ou 429) encerra a tentativa como `FALHOU`; desde o Lote 2, Etapa 1, nenhuma outra tentativa é aberta depois disso. Timeout, erro 5xx ou resposta inválida deixam a tentativa `INCONCLUSIVA`, porque a transferência pode ter sido criada. As notificações de transferência são conferidas com uma consulta à Asaas, pois podem chegar fora de ordem.

**Tentativas de repasse (`repasse_tentativas`).** Cada pedido de transferência nasce de `claim_payout` como uma tentativa `SOLICITANDO`, e o id da tentativa vai como `externalReference` para a Asaas. Estados: `SOLICITANDO`, `PENDENTE` (transferência registrada), `INCONCLUSIVA`, `EM_VERIFICACAO`, `CONCLUIDA`, `FALHOU` e `AUSENCIA_CONFIRMADA`. Um índice único garante uma tentativa aberta por pagamento e outro, que um id de transferência pertence a uma só tentativa. Antes de chamar a Asaas, a API grava o envio na tentativa (`registrar_pedido_enviado`); se a tentativa já não estiver `SOLICITANDO`, nada é enviado. Uma solicitação sem resposta há mais de 10 minutos é tratada por `marcar_tentativa_parada`, chamada no acompanhamento do repasse e também pela rotina (`marcar_solicitacoes_paradas`): sem envio gravado, o pedido comprovadamente não saiu, então a tentativa vira `FALHOU` e as multas voltam a ficar livres, sem nova tentativa; com envio gravado, a tentativa vira `INCONCLUSIVA`, continua bloqueando novo repasse e estorno e nunca é reenviada sozinha. Uma tentativa `INCONCLUSIVA` é procurada pela referência; encontrando uma transferência, registra; encontrando mais de uma, grava alerta e não adota nenhuma. Tentativas abertas de pagamentos que não são o atual do evento (estornados ou substituídos) são conciliadas pela rotina, uma a uma, pela própria referência (`reconcileOutsidePayout`), sem nunca pedir repasse novo; a confirmação de ausência não pede repasse novo. Transferência concluída em pagamento estornado, em qualquer ordem, gera o alerta `REPASSE_E_ESTORNO` (`registrar_repasse_e_estorno`): um por tentativa (índice único parcial), com uma foto em `detalhes` dos valores retido, transferido e pendente e de cada multa (reserva e quitação anterior), gravada na mesma transação antes de a quitação ser desfeita. As multas desse pagamento terminam reservadas e sem quitação nas duas ordens. `repasse_alertas` só aceita inclusões: um gatilho recusa `update`, `delete` e `truncate`.

Todas as transições ficam em funções SQL `security definer`, cada uma numa transação que trava o pagamento e depois a tentativa, na mesma ordem para todas. A API (`service_role`) só lê as três tabelas; não tem permissão de inserir, alterar ou apagar nelas. A liberação manual tem duas etapas, e o banco impõe prazos, sequência e evidência, não o script:

1. `iniciar_verificacao_ausencia`: só para tentativa `INCONCLUSIVA` sem transferência registrada, 24 horas depois de `solicitada_em`, com uma busca iniciada depois desse prazo, há no máximo 10 minutos, completa, sem nenhuma transferência encontrada, pela referência da tentativa e cobrindo desde um dia antes do pedido.
2. `confirmar_ausencia`: só para tentativa `EM_VERIFICACAO`, 1 hora depois da verificação, com uma segunda busca que cumpre as mesmas condições e com a declaração padrão (`declaracao_ausencia_repasse`). Encerra a tentativa, devolve as multas reservadas e deixa o repasse como `FALHOU`, sem nova tentativa.

Uma resposta que chega para tentativa encerrada nunca é adotada: vira alerta `RESPOSTA_TARDIA`, e uma transferência concluída de tentativa encerrada vira `POSSIVEL_DUPLICIDADE` (`repasse_alertas`). Uma transferência que aparece durante a verificação é registrada e cancela a liberação.

**Busca de transferências na Asaas.** A documentação de `GET /v3/transfers` só lista filtros de data e tipo; `externalReference` vem em cada transferência, mas não é filtro. A API lista a janela `dateCreated[ge]` (um dia antes do pedido) página a página, com `offset` e `limit=100`, e compara a referência localmente. A busca só conta como completa quando cada página confirma o `offset` e o `limit` pedidos, traz `hasMore` e `totalCount` válidos, o total não muda entre páginas, nenhuma transferência se repete, página com `hasMore` vem cheia e, ao terminar, a quantidade lida bate com o `totalCount`. Qualquer desvio, erro da Asaas ou limite de páginas atingido (5 na rotina, 50 no suporte) é `PAGAMENTO_BUSCA_INCOMPLETA`, e busca incompleta nunca conta como ausência.

**Limites das proteções.** A espera de 24 horas, o intervalo de 1 hora e as duas buscas completas reduzem o risco de Pix duplicado, mas não são garantia absoluta: a paginação por `offset` sem ordem documentada ainda pode pular uma transferência criada durante a leitura, e transferências antigas sem `externalReference` não aparecem na busca. Por isso a confirmação exige a declaração de quem conferiu o painel. O nome do operador é gravado em `repasse_decisoes.operador_nome_informado`, com `identidade_autenticada` sempre falso: é o nome informado com o `ADMIN_TOKEN` compartilhado, não uma identidade verificada. Autenticação individual do suporte não foi implementada.

**Repasses legados.** A migration `20261114120000_tentativas_de_repasse` importa, só inserindo, cada id de `repasse_asaas_id` e `repasse_asaas_id_anterior` como tentativa `LEGADO`, sem alterar nenhum pagamento; o mesmo id nas duas colunas vira uma tentativa só, e um id em pagamentos diferentes interrompe a importação. Tentativas legadas usam o id do pagamento como referência antiga e ficam fora da conciliação automática pela referência: só a conferência do suporte as resolve. Tentativas de antes dessas colunas, cujo id foi sobrescrito ou nunca gravado, não podem ser recuperadas automaticamente.
