# Conta Escrow com subcontas (próximo passo do pagamento)

## Por que mudar

Hoje o Pix do contratante cai na conta Asaas da plataforma, fica parado lá até o show e depois a API transfere o cachê por Pix ao músico. Funciona, mas:

- o dinheiro de terceiros passa pela conta da plataforma, o ponto regulado pelo Banco Central;
- cada transferência precisa de autorização no painel da Asaas (no sandbox, manual);
- devoluções dependem de saldo na conta da plataforma;
- a plataforma responde por qualquer problema no meio do caminho.

Com subcontas e Conta Escrow, **o dinheiro nunca passa pela conta da plataforma**: a Asaas divide a cobrança na hora do pagamento e segura a parte do músico em garantia, na conta dele.

## Pré-requisito (depende do grupo)

A Asaas só permite subcontas em contas de **pessoa jurídica (CNPJ)**. A conta sandbox usada hoje (do Cleiton) é de pessoa física, então é preciso criar uma conta sandbox como empresa em <https://sandbox.asaas.com> e gerar uma chave de API com permissão de saque.

## Fluxo proposto

| Etapa | Hoje (custódia) | Com Conta Escrow |
|---|---|---|
| Músico se inscreve pela 1ª vez | Pede chave Pix | Pede os **dados de recebimento** (abaixo) e a API cria a subconta do músico na Asaas, com a Conta Escrow ligada |
| Contratante paga | Pix de cachê + 10% para a conta da plataforma | Pix com **split**: o cachê vai para a subconta do músico (`walletId`) e os 10% ficam com a plataforma |
| Até o show | Valor parado na conta da plataforma | Valor do músico **bloqueado pela Asaas** na subconta dele |
| Show confirmado (ou 7 dias) | API transfere o cachê por Pix | API **libera a garantia** (`POST /v3/escrow/{id}/finish`) |
| Cancelamento ou ausência | Estorno da conta da plataforma | Estorno da cobrança, que desfaz o split (validar no sandbox) |
| Multa por ausência | Descontada do próximo repasse | Descontada no split da próxima cobrança (o músico recebe cachê − multa) |
| Saque do músico | Automático para a chave Pix | O músico saca da própria conta Asaas |

### Dados de recebimento (pedidos só quando o músico vai se inscrever, não no cadastro)

Exigidos pela Asaas para abrir a subconta (`POST /v3/accounts`):

- já temos: nome, e-mail, CPF/CNPJ, celular;
- novos: data de nascimento (CPF) ou tipo de empresa (CNPJ: MEI, LIMITED, INDIVIDUAL, ASSOCIATION), renda mensal aproximada, CEP, endereço, número e bairro.

Esses dados ficam só na API (sem leitura pelo app), como CPF e telefone hoje.

## Chamadas da Asaas

| Ação | Chamada |
|---|---|
| Criar subconta do músico | `POST /v3/accounts` → guardar `id` e `walletId` (a `apiKey` da subconta só aparece nessa resposta; não é necessária para este fluxo) |
| Ligar a Conta Escrow na subconta | `POST /v3/accounts/{id}/escrow` com `enabled: true`, `isFeePayer: false`, `daysToExpire` |
| Cobrança com split | `POST /v3/payments` com `split: [{ walletId, fixedValue: cachê }]` |
| Descobrir a garantia da cobrança | `GET /v3/payments/{id}/escrow` → `id` da garantia |
| Liberar o cachê | `POST /v3/escrow/{id}/finish` |

## O que precisa ser validado no sandbox antes de ligar

1. **Estorno de cobrança em garantia:** a documentação não diz se o estorno desfaz o split bloqueado. É o caso da ausência e do cancelamento com mais de 24h.
2. **Limite de `daysToExpire`:** a garantia expira por conta própria nesse prazo, contado do pagamento. Eventos marcados com mais antecedência que esse limite seriam liberados antes do show; o blog da Asaas cita 45 dias, a documentação técnica não confirma.
3. **Qual chave libera a garantia:** a da plataforma ou a da subconta.
4. **Taxa recorrente da Conta Escrow** por subconta e quem paga (`isFeePayer`).

## Como implementar quando a conta de empresa existir

O código foi organizado para essa troca: todas as chamadas à Asaas estão em `backend/src/adapters/asaas.ts`, e o repasse e o estorno estão concentrados em `paymentService.ts` (`payout`, `refundHiring`). A troca consiste em:

1. Migration com os dados de recebimento e os campos `asaas_account_id` e `asaas_wallet_id` no perfil do músico, e `asaas_escrow_id` no pagamento.
2. Tela "Dados de recebimento" no lugar da chave Pix em "Completar perfil" (a regra `camposFaltantes` passa a exigir esses dados para se inscrever).
3. Criação da subconta e da Conta Escrow ao salvar esses dados.
4. `startCheckout` com `split`; `payout` libera a garantia em vez de transferir.
5. Uma variável `ASAAS_MODO=custodia|escrow` para alternar sem perder o modelo atual.
