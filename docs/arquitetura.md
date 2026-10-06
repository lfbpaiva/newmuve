# Arquitetura do Muve

## Visão geral

```text
┌────────────────────────────────────────────┐
│ WEB (React + Vite)   APP (React Native)    │
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

- **Leituras** (feed, eventos, candidatos, avaliações) vão direto do navegador ao banco, com a chave pública. O que cada usuário enxerga é decidido pelas policies de RLS.
- **Escritas** (cadastro, perfil, eventos, candidaturas, checkout, cancelamentos, confirmações, avaliações, exclusão de conta) passam sempre pelo backend, que valida as regras e grava com a chave `service_role`. O navegador não tem nenhuma permissão de escrita no banco.
- **Pagamentos:** só o backend fala com a Asaas. O dinheiro entra na conta Asaas da plataforma, fica retido e é repassado ao músico por Pix após a conclusão do show.

## Decisões

**Backend Node.js dedicado, em vez de Edge Functions do Supabase.** A especificação do projeto prevê uma API REST em Node.js. A API chegou a ser publicada como Edge Function e foi movida para Node sem reescrever regras, porque os serviços dependem de interfaces e não do ambiente de execução.

**Supabase Auth, em vez de autenticação própria (hash de senha + JWT).** Cadastro, sessão, renovação de token, confirmação de e-mail, recuperação de senha e limite de tentativas de login são as partes em que implementações próprias mais falham. O backend valida o token do usuário em cada rota protegida.

**Hono, em vez de Express.** Usa a API padrão de `Request`/`Response`, o que permite testar as rotas sem subir servidor (`app.request(...)`) e trocar de ambiente de execução sem alterar o código.

**Acesso a dados com supabase-js e migrations SQL, em vez de Prisma.** O Supabase já expõe o Postgres; as policies de RLS, funções e triggers precisam ser SQL de qualquer forma. O schema é versionado em `supabase/migrations/`.

**Leituras direto no banco com RLS, em vez de um endpoint para cada consulta.** Evita dezenas de rotas de leitura e mantém a regra de visibilidade em um único lugar, testado por pgTAP. Colunas sensíveis (CPF/CNPJ, telefone, chave Pix) não são legíveis pelo cliente; o próprio dono as obtém por `GET /api/me`, e a outra parte de uma contratação recebe o telefone pelo comprovante.

**Regras de negócio em TypeScript no backend, e não em policies ou triggers.** São mais fáceis de ler, testar e explicar. Ficaram no banco apenas as invariantes que precisam valer sob concorrência: restrições (cachê mínimo, nota de 1 a 5, candidatura única, uma cobrança pendente por evento), a contratação atômica após o pagamento, a reabertura do evento quando o músico desiste e a conclusão após a dupla confirmação.

**Portas e adaptadores nos serviços.** `services/` depende das interfaces em `services/ports.ts` e `accountService.ts`; `adapters/` as implementa com Supabase e Asaas. O ganho concreto é a testabilidade: os testes usam implementações em memória, sem rede.

**`shared/dominio.ts`.** Validações (CPF, CNPJ, chave Pix, imagem), listas (estilos, tipos de evento, UFs), a comissão e as regras de match, de cancelamento e de prazo existem em um único arquivo, usado pelo frontend para dar retorno imediato e pelo backend para decidir.

**Plataforma recebe e repassa, em vez de split com subcontas.** O split da Asaas exige que cada músico tenha uma subconta (cadastro completo, documentos, mensalidade da Conta Escrow) e que a conta principal seja pessoa jurídica. Para o MVP, o músico cadastra apenas uma chave Pix e a plataforma transfere o cachê após o show. O split com subcontas é o caminho para produção.

**CPF ou CNPJ nos dois perfis, qualquer e-mail, sem bloqueio permanente.** Pessoas físicas contratam para festas particulares e bandas têm CNPJ; e-mail corporativo é o comum entre contratantes; excluir a conta não é motivo para impedir um novo cadastro.

**Feed por distância com dados locais, em vez de uma API de geolocalização.** A tabela `municipios` (5.571 municípios com coordenadas, fonte pública sob licença MIT) permite calcular a distância entre as sedes das cidades no próprio banco (haversine). O músico escolhe o raio (mesma cidade, 50, 100 ou 200 km); uma candidatura é aceita até o raio máximo de 200 km.

**Avisos por e-mail apenas nos momentos decisivos:** contratação confirmada (para os dois lados), desistência da outra parte e não comparecimento. Enviados por SMTP via nodemailer; sem SMTP configurado, ficam no log. Nunca bloqueiam a operação que os disparou.

**App mobile em React Native (Expo) reaproveitando o cliente da web.** Serviços de API, leituras do banco, sessão (AuthContext), validações e formatação vivem em `shared/client/` e recebem por injeção (`configureClient`) o que muda entre plataformas: cliente Supabase, URL da API, destino dos links de e-mail e armazenamento local. Web e app só diferem na camada de telas. Links de confirmação e redefinição de senha abrem o app pelo esquema `muve://auth`.

**Cadastro progressivo.** O cadastro pede só tipo de conta, nome, e-mail e senha. Cada dado do perfil é exigido no momento em que faz falta: cidade e estilos para montar o feed; foto, CPF/CNPJ, telefone e chave Pix para se candidatar; foto, documento, telefone e cidade para publicar um evento. A regra (`camposFaltantes` em `shared/dominio.ts`) é a mesma no frontend, que abre a tela "Complete seu perfil" só com o que falta, e na API, que recusa a ação com `PERFIL_INCOMPLETO` listando os campos.

**Lista de estilos no código, com vários estilos por evento.** Os 25 gêneros vivem em `shared/dominio.ts` (sem restrição no banco), um evento pode pedir vários ou "Qualquer estilo", e o match é a interseção com os estilos do músico. "Outros" cobre quem não se encaixa e casa com eventos abertos a qualquer estilo.

**Valores monetários como `numeric(10,2)`**, não ponto flutuante.

## Fluxos principais

### Cadastro

1. O frontend envia tipo de conta, nome, e-mail e senha para `POST /api/auth/signup`.
2. O backend cria o usuário no Supabase Auth, que envia o e-mail de confirmação, e grava o perfil só com o nome. Se a gravação falhar, desfaz o usuário.
3. Foto, CPF/CNPJ, telefone, cidade, estilos e chave Pix são preenchidos por `PATCH /api/me`, quando a ação do usuário passar a exigi-los. O documento é checado contra duplicidade nesse momento.

### Contratação e pagamento

1. O contratante escolhe um candidato; o frontend chama `POST /api/events/:id/checkout` enviando apenas o ID da candidatura.
2. O backend confere que o evento é dele e está aberto, lê o cachê **do banco**, soma a taxa de serviço de 10%, cria o cliente e a cobrança Pix na Asaas e grava o pagamento como `PENDENTE`, com validade de 15 minutos.
3. O frontend mostra o QR Code e consulta `GET /api/events/:id/checkout` a cada 5 segundos. A cada consulta, o backend confere o status na Asaas: se pago, efetiva a contratação; se expirado, cancela a cobrança na Asaas (o QR Code da Asaas valeria por meses).
4. A Asaas também notifica `POST /api/webhooks/asaas`. O backend confere o token, reconsulta o status e o valor na Asaas e chama a função `confirm_asaas_payment`, que em uma única transação marca o pagamento como `PAGO` e `RETIDO`, o evento como `CONTRATADO`, aprova o candidato e recusa os demais.
5. A partir daí, as duas partes acessam o **comprovante** (`GET /api/events/:id/contratacao`): endereço do evento, telefone da outra parte, valores e situação do pagamento e do repasse.

Garantias: repetir o checkout devolve a mesma cobrança; uma cobrança expirada ou substituída é cancelada também na Asaas; um pagamento tardio, cujo evento já foi contratado por outra cobrança, é estornado automaticamente; notificações repetidas não têm efeito; o webhook responde 200 mesmo a notificações que ignora, porque a Asaas pausa a fila após 15 respostas de erro seguidas; o navegador nunca informa valor nem declara que pagou.

### Pós-evento e repasse

Após o início do evento, contratante e músico confirmam cada um pelo próprio acesso. Com as duas confirmações, uma trigger conclui o evento e o backend transfere o cachê (sem a comissão) para a chave Pix do músico. Com apenas uma confirmação, o show é dado como concluído 7 dias após a data, na próxima consulta ao comprovante (não há agendador de tarefas). A reserva do repasse é um `UPDATE` condicional (`claimPayout`), o que impede transferência em dobro mesmo com chamadas simultâneas; uma falha fica registrada como `FALHOU` e é tentada de novo. A avaliação mútua é liberada após a conclusão, e as médias de músico e contratante são recalculadas por trigger.

### Cancelamento

| Quem cancela | Quando | Efeito |
|---|---|---|
| Músico (antes de ser escolhido) | mais de 24h antes do evento | inscrição removida |
| Músico contratado | antes do início | estorno integral ao contratante; evento volta a ABERTO, demais candidatos voltam a concorrer |
| Contratante | mais de 24h antes | estorno integral; evento CANCELADO |
| Contratante | menos de 24h antes | sem estorno; cachê repassado ao músico; evento CANCELADO |
| Contratante (não comparecimento) | após o horário, enquanto o músico não confirmar o show | estorno integral; evento CANCELADO |

Depois do início do evento ninguém cancela: o encerramento é pela confirmação do show. Um estorno feito no painel da Asaas também cancela a contratação (webhook `PAYMENT_REFUNDED`). Contas com show contratado em andamento não podem ser excluídas.

## Segurança

| Risco | Tratamento |
|---|---|
| Chaves privadas no frontend | Só a chave pública do Supabase vai ao navegador; `service_role` e Asaas ficam em variáveis de ambiente do backend |
| Acesso indevido a dados | RLS em todas as tabelas, sem permissão de escrita para o cliente; isolamento músico–músico; colunas sensíveis sem `grant`; endereço em tabela à parte, legível só pelo dono |
| Manipulação de valores | O valor da cobrança vem do evento no banco; o corpo da requisição só carrega IDs; o repasse usa o valor gravado no pagamento |
| Webhook forjado | Token comparado em tempo constante, reconfirmação do status e do valor na Asaas, deduplicação por ID do evento |
| Validação só no frontend | Todas as entradas são validadas no backend com Zod; o banco repete as restrições críticas |
| Força bruta e abuso | Limite de tentativas por IP em cadastro e exclusão de conta; o login usa os limites do Supabase Auth |
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
| Ponta a ponta | `pnpm test:e2e` | fluxo completo contra a API local e o Supabase real |

Mocks existem apenas nos testes; a aplicação não tem dados simulados.

## Limitações conhecidas

- **Modelo de custódia:** reter valores de terceiros na conta da plataforma é aceitável como protótipo acadêmico; em produção, o split com subcontas e Conta Escrow da Asaas é o caminho regulado.
- **Estorno exige saldo:** a Asaas não devolve as tarifas da cobrança, então a conta precisa de saldo além do valor recebido para estornar integralmente.
- **Conclusão por prazo é avaliada sob demanda,** quando uma das partes consulta o comprovante; não há agendador.
- **Limite de tentativas em memória:** vale para uma única instância do servidor.
- **Avisos só por e-mail e só em três momentos;** não há aviso de nova candidatura nem notificações no app.
- **Sem mediação de disputas:** se o músico confirmou o show e o contratante diz que ele não compareceu, a plataforma não arbitra.
- **Distância entre sedes de municípios,** não entre endereços; cidades homônimas são distinguidas pela UF.
- **CNPJ alfanumérico** (formato novo da Receita Federal) não é aceito; apenas o numérico.
- **Navegação sem URLs:** as telas são trocadas por estado, então o botão "voltar" do navegador não navega entre telas.
