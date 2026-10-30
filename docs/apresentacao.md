# Roteiro de apresentação

Demonstração de 10 a 12 minutos, com dois aparelhos (ou duas abas do navegador): um logado como contratante e outro como músico.

## Antes de começar (no dia)

- [ ] `backend/.env` e `mobile/.env` preenchidos (veja o README).
- [ ] API rodando: `pnpm dev:api`. App rodando: `pnpm dev:app`. Celular e computador no mesmo Wi-Fi.
- [ ] Entrar com as duas contas de demonstração (senha `teste123`):
  - **Contratante:** `contratante@teste.com` (Bar Teste)
  - **Músico:** `teste@teste.com` (Músico Teste)
- [ ] Painel do sandbox da Asaas aberto em outra aba, na conta sandbox da Muve (a mesma da chave no `backend/.env`), para confirmar o Pix de teste.
- [ ] Ter uma foto de evento no aparelho do contratante.
- [ ] Não criar conta nova ao vivo se o SMTP não estiver configurado: o e-mail de confirmação pode não chegar.

## Roteiro

### 1. O problema (1 min)
Contratar músico independente é informal: o músico arrisca calote, o contratante arrisca falta ou cancelamento em cima da hora. A Muve segura o dinheiro até o show acontecer e registra a reputação dos dois lados.

### 2. Contratante publica um evento (2 min)
1. Início → **Novo evento**: foto, título, data e hora, cidade, endereço, estilos, cachê.
2. Mostrar o aviso do valor: "com a taxa de 10%, você pagará R$ X; o músico recebe R$ Y".
3. Destacar: o endereço só aparece para o músico contratado.

### 3. Músico encontra e se inscreve (2 min)
1. No aparelho do músico, o evento aparece no feed (mesmo estilo, mesma cidade ou até 200 km).
2. Abrir o evento → marcar **Quero propor outro cachê** e digitar um valor.
3. Contratante recebe a notificação no sino, em tempo real.

### 4. Negociação pelo chat (1 min)
1. Músico → **Conversar com o contratante**.
2. Trocar duas mensagens; elas chegam na hora no outro aparelho.
3. Destacar: telefone e WhatsApp só são liberados depois da contratação, para o pagamento não sair da plataforma.

### 5. Contratação e pagamento (2 min)
1. Contratante vê o candidato com o valor pedido, abre o perfil e as avaliações.
2. **Aprovar e pagar** → QR Code Pix com o cachê proposto + 10%.
3. No painel do sandbox da Asaas, abrir a cobrança e usar **Confirmar pagamento**.
4. Em poucos segundos o app avança sozinho: "Pagamento confirmado". O músico recebe "Você foi contratado".
5. Abrir o **comprovante**: endereço, telefone, valores e a frase "Pago · Retido na plataforma até a conclusão do show".

### 6. Depois do show (1 min)
Usar o evento já concluído "Noite acústica no terraço" para mostrar:
1. A confirmação das duas partes e o repasse do cachê por Pix.
2. A avaliação mútua.
3. Explicar a regra: sem confirmação e sem reclamação, o show é dado como realizado em 7 dias.

### 7. Regras e segurança (1 min)
- Cancelamento: mais de 24h → devolução integral; menos de 24h → cachê vai ao músico; músico desiste → devolução integral e o evento reabre.
- O app só lê o banco; toda escrita passa pela API, que valida regras e valores. O valor cobrado vem sempre do banco, nunca do aparelho.
- Termos de Uso com aceite obrigatório e LGPD (Ajustes → Termos e Conta e privacidade).

## Perguntas prováveis da banca

| Pergunta | Resposta curta |
|---|---|
| Por que 10% e não 15% como na monografia? | A taxa somada ao cachê é mais clara para o músico, que recebe o valor combinado inteiro. A comparação completa está em `docs/produto.md`, seção 9. |
| A plataforma pode reter dinheiro? | No protótipo, sim (sandbox, sem dinheiro real). Em produção, o caminho regulado é o split com Conta Escrow da Asaas, e os Termos de Uso explicam a retenção. |
| E se o músico faltar? | O contratante registra a ausência em até 7 dias e recebe tudo de volta. |
| E se alguém tentar mudar o valor pelo aplicativo? | O app só manda IDs; a API lê o valor do banco e a RLS impede escrita direta. |
| Como a plataforma ganha dinheiro além da taxa? | Dois planos por Pix recorrente na Asaas: Muve Pro para o músico (R$ 19,90) e Muve Casa para o contratante (R$ 49,90, taxa cai para 6%). Nenhum plano muda garantia, cancelamento ou multa. |
| Por que não tem notificação com o app fechado? | Exige gerar o app pelo EAS; as notificações dentro do app funcionam em tempo real. |
| Como testaram? | 232 testes de regras e da API (Vitest) e 124 testes do banco (pgTAP), além de testes de ponta a ponta no navegador. |
