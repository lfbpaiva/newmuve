# Muve

Aplicativo que conecta músicos a contratantes de eventos (projeto de TCC). Leia [README.md](README.md) para rodar e [docs/arquitetura.md](docs/arquitetura.md) para as decisões técnicas. As regras de negócio de origem estão em `docs/especificacao/`: não adicione funcionalidades fora delas.

## Estrutura

- `mobile/`: app React Native com Expo (expo-router). É a única interface: roda no celular pelo Expo Go e no navegador.
- `backend/src/`: API REST em Node.js (Hono + Zod), em camadas `http/` → `services/` → `adapters/`.
- `shared/`: `dominio.ts` com as regras usadas pelo app e pela API, e `client/` com acesso à API e ao banco, sessão e formatação. Não duplique regras: acrescente aqui.
- `supabase/migrations/`: schema, RLS, funções e buckets. Toda mudança de banco é uma nova migration; nunca edite uma já aplicada.
- `supabase/tests/database/`: testes pgTAP.

## Regras do projeto

- O app só lê o banco (RLS). Toda escrita passa pela API; não crie policies de insert, update ou delete.
- Segurança, permissões, valores e regras de negócio são validados na API, mesmo que o app também valide.
- Chaves privadas (service_role, Asaas) existem apenas em `backend/.env`; nunca no app nem em variáveis `EXPO_PUBLIC_*`.
- Sem dados simulados no app. Mocks ficam apenas nos testes.
- A API roda direto no Node com remoção de tipos: use só sintaxe apagável (sem `enum`, sem propriedades no construtor) e importe arquivos locais com a extensão `.ts`.
- Textos da interface em português. Strings com aspas duplas.
- Código sem comentários: nomes claros no lugar de explicação.

## Verificação

Antes de concluir uma mudança: `pnpm typecheck`, `pnpm lint` e `pnpm test`. Mudanças de banco: `pnpm test:db`.

## App

- Tema em `mobile/lib/theme.ts`: preto, branco e roxo como destaque, títulos em Archivo caixa alta.
- Confirmações usam o helper do app, porque `Alert.alert` com botões não funciona no navegador.
