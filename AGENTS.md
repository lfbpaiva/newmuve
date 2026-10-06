# Muve

Plataforma que conecta músicos a contratantes de eventos (projeto de TCC). Leia [README.md](README.md) para rodar e [docs/arquitetura.md](docs/arquitetura.md) para as decisões técnicas. As regras de negócio de origem estão em `docs/especificacao/`: não adicione funcionalidades fora delas.

## Estrutura

- `src/` — frontend React 19 + Vite + TypeScript. Telas em `src/screens/`, acesso a dados em `src/services/`.
- `backend/src/` — API REST em Node.js (Hono + Zod): `http/` (rotas) → `services/` (regras) → `adapters/` (Supabase, Asaas).
- `shared/dominio.ts` — regras e listas usadas pelo frontend e pelo backend. Não duplique regras: acrescente aqui.
- `supabase/migrations/` — schema, RLS, funções e buckets. Toda mudança de banco é uma nova migration.
- `supabase/tests/database/` — testes pgTAP.

## Regras do projeto

- O navegador só lê o banco (RLS). Toda escrita passa pelo backend; não crie policies de insert/update/delete.
- Segurança, permissões, valores e regras de negócio são validados no backend, mesmo que o frontend também valide.
- Chaves privadas (service_role, Asaas) existem apenas em `backend/.env`; nunca em `src/` nem em variáveis `VITE_*`.
- Sem dados simulados na aplicação. Mocks ficam apenas nos testes.
- O backend roda direto no Node (remoção de tipos nativa): use apenas sintaxe apagável (sem `enum`, sem propriedades declaradas nos parâmetros do construtor) e importe arquivos locais com a extensão `.ts`.
- Textos e mensagens da interface em português.

## Verificação

Antes de concluir uma mudança: `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build`. Mudanças de banco: `pnpm test:db`.

## Frontend

- Estilos em `src/index.css` (CSS próprio; Tailwind v4 está disponível via `@tailwindcss/vite`).
- Componentes exportados como default; strings com aspas duplas.
- `vite.config.ts` veio do scaffold do Figma Make, que não é mais usado; `.figma/` fica fora do versionamento.
