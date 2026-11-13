# Continuidade do projeto

Guia para quem pegar o Muve a partir daqui. Regras do produto em [produto.md](produto.md), decisões técnicas em [arquitetura.md](arquitetura.md), instalação no [README](../README.md) e roteiro em [apresentacao.md](apresentacao.md).

## Estado atual

O fluxo completo funciona no sandbox da Asaas e foi testado de ponta a ponta com dinheiro fictício: publicar evento, inscrever músico, pagar por Pix, contratar, confirmar o show e repassar o cachê.

- **Código:** `main` de `lfbpaiva/newmuve`. O repositório `Cleiton-Martins/MUVE` é antigo; não use.
- **PR #6 (`integracao/redesign-lote1`):** reúne o trabalho das branches `cloudflare`, `feature/redesign-muve` e `fix/lote1-estabilidade-mobile` (PRs #3, #4 e #5) e o redesign visual. Essas branches começavam num histórico próprio, sem ancestral comum com o `main`, por isso os arquivos foram trazidos sobre o `main` em vez de mesclados. Depois do merge do #6, feche o #3 e o #5.
- **PRs 1 e 2:** partem de uma versão antiga e desfazem regras atuais (show duplo, multa, contestação). Não faça merge deles.
- **Banco:** 21 migrations aplicadas no projeto Supabase do grupo, iguais às de `supabase/migrations/`. O redesign não mudou o banco nem a API.
- **Verificação:** o GitHub Actions roda `pnpm typecheck`, `pnpm lint` e `pnpm test` a cada push e pull request.

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
| Hospedagem da API | Não publicada; `render.yaml` pronto | README, "Publicação da API" |
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

Não há conta de administrador no app. Contestações são decididas por `scripts/resolver-contestacao.mjs` e repasses travados são liberados pela rota de suporte da API, as duas com o `ADMIN_TOKEN` de `backend/.env`. Um painel de suporte dentro do app (contestações, repasses e planos) fica como trabalho futuro e depende de decisão do grupo em `produto.md`.

## Cuidados

- **Rotina financeira:** a API roda a rotina ao subir e a cada 5 minutos, contra o banco compartilhado. Em qualquer computador, ela pode concluir shows com mais de 7 dias, pedir repasses e tentar de novo os que falharam. Só uma transferência é criada por pagamento.
- **Tela de pagamento:** abrir a tela de Pix de um candidato gera uma cobrança real no sandbox. Para só olhar o visual, use um evento de teste.
- **Repositório público:** nunca coloque chaves em arquivos versionados. As contas de demonstração têm a senha no README, então não guarde nada real nelas.
- **`pnpm test:db`:** as versões novas do Supabase CLI pedem confirmação para rodar SQL em projeto de produção e podem recusar a execução sem terminal interativo. Os testes foram feitos para não deixar dados, mas confira antes de autorizar.
- **Eventos de outros integrantes:** o banco é compartilhado. Confira o dono antes de apagar qualquer coisa.
- **Dados de demonstração:** o evento "Noite acústica no terraço" foi marcado como repassado manualmente, porque a transferência original ficou na conta antiga da Asaas. O evento "Noite de MPB no Bar Teste" teve o repasse real concluído. "Sexta de MPB no Bar Teste" é em 14/11/2026; depois disso, crie outro evento para a demonstração.

## O que falta

### Para a entrega do TCC
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
