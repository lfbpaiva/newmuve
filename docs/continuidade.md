# Continuidade do projeto

Guia para quem pegar o Muve a partir daqui. Regras do produto em [produto.md](produto.md), decisões técnicas em [arquitetura.md](arquitetura.md), instalação no [README](../README.md) e roteiro em [apresentacao.md](apresentacao.md).

## Estado atual

O fluxo completo funciona no sandbox da Asaas e foi testado de ponta a ponta com dinheiro fictício: publicar evento, inscrever músico, pagar por Pix, contratar, confirmar o show e repassar o cachê.

- **Código:** tudo no `main` de `lfbpaiva/newmuve`. O repositório `Cleiton-Martins/MUVE` é antigo; não use.
- **Banco:** 21 migrations aplicadas no projeto Supabase do grupo, iguais às de `supabase/migrations/`.
- **Verificação:** o GitHub Actions roda `pnpm typecheck`, `pnpm lint` e `pnpm test` a cada push e pull request.
- **PRs 1 e 2:** o que valia foi incorporado ao `main`. Eles partem de uma versão antiga e desfazem regras atuais (show duplo, multa, contestação). Não faça merge deles.

## Como começar

1. Siga "Como rodar" no README.
2. Peça ao grupo os valores de `backend/.env` e `mobile/.env`, por canal privado. Eles nunca vão para o Git.
3. Entre com as contas de demonstração citadas no README, uma em `http://localhost:8081` e outra em `http://127.0.0.1:8081`.

## Serviços externos

| Serviço | Situação | Onde configurar |
|---|---|---|
| Supabase (banco, login, arquivos) | Ativo | Projeto "My Project" do grupo |
| Asaas sandbox | Ativo, conta `muveapp.contato@gmail.com` | Chave em `backend/.env` |
| Login com Google | O botão aparece sozinho quando o Google está ativo no Supabase | README, "Entrar com Google" |
| Cloudflare Turnstile (anti-robô) | Opcional; só aparece com `EXPO_PUBLIC_TURNSTILE_SITE_KEY`. Ligar junto com o captcha do Supabase, e incluir `localhost` e o domínio de `EXPO_PUBLIC_TURNSTILE_BASE_URL` no widget | `mobile/.env.example` |
| SMTP | Não configurado; sem ele os e-mails só aparecem no log da API | README, "E-mail" |
| Hospedagem da API | Não publicada; `render.yaml` pronto | README, "Publicação da API" |
| Build pelo EAS (push com o app fechado) | Não gerado | README, "Notificações" |

## Asaas: o que costuma travar

- A chave de API precisa da opção **"Permitir que esta chave execute operações de saque via API"**. Sem ela, o repasse falha com `insufficient_permission`.
- Cada repasse fica pendente até a autorização por SMS: **Meu Dinheiro → Transferências → Enviar código**, na faixa do topo. O código vai para o telefone cadastrado na conta. Depois de autorizada, a transferência conclui sozinha.
- Para confirmar um Pix de teste, abra a cobrança no painel e use **Confirmar pagamento**.
- A conta é de pessoa física, então não permite subcontas (Conta Escrow).
- Ao trocar de conta, os clientes da conta antiga são recriados automaticamente na próxima cobrança ou assinatura.

## Cuidados

- **Rotina financeira:** a API roda a rotina ao subir e a cada 5 minutos, contra o banco compartilhado. Em qualquer computador, ela pode concluir shows com mais de 7 dias e pedir repasses. Só uma transferência é criada por pagamento.
- **Repositório público:** nunca coloque chaves em arquivos versionados. As contas de demonstração têm a senha no README, então não guarde nada real nelas.
- **`pnpm test:db`:** as versões novas do Supabase CLI pedem confirmação para rodar SQL em projeto de produção e podem recusar a execução sem terminal interativo. Os testes foram feitos para não deixar dados, mas confira antes de autorizar.
- **Eventos de outros integrantes:** o banco é compartilhado. Confira o dono antes de apagar qualquer coisa.
- **Dados de demonstração:** o evento "Noite acústica no terraço" foi marcado como repassado manualmente, porque a transferência original ficou na conta antiga da Asaas. O evento "Noite de MPB no Bar Teste" teve o repasse real concluído. "Sexta de MPB no Bar Teste" é em 14/11/2026; depois disso, crie outro evento para a demonstração.

## O que falta

### Para a entrega do TCC
- [ ] Passar [monografia.md](monografia.md) para o texto oficial.
- [ ] Ensaiar a apresentação no computador e no celular reais. O app ainda não foi testado no Expo Go nesta fase, incluindo puxar para atualizar.
- [ ] Combinar quem estará com o telefone da conta Asaas na apresentação.

### Para produção
- [ ] Conta Escrow com subcontas ([conta-escrow.md](conta-escrow.md)), que exige conta Asaas com CNPJ.
- [ ] Bloquear usuário. Hoje só existe denúncia, por e-mail ao suporte.
- [ ] Política de privacidade com link próprio, separada dos Termos.
- [ ] Conferir se Pro e Casa precisam usar o pagamento da Apple e do Google.
- [ ] Login com Apple, exigido quando o app oferece login com Google.
- [ ] SMTP, Google, hospedagem da API e build pelo EAS.
- [ ] Nova tentativa automática de repasse que falhou e de estorno negado. Hoje isso acontece quando alguém abre a tela.
- [ ] Buscar cobrança existente antes de criar outra, para não sobrar cobrança sem uso se a API cair no meio.
- [ ] Atualizar os pacotes do Expo (`npx expo install --check`).
