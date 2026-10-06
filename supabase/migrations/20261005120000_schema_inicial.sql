-- Muve — schema inicial
-- Modelo derivado de docs/especificacao (User, MusicianProfile, ContractorProfile,
-- BlockedDocument, Event, EventCandidate, Review) + pagamentos via Asaas.
-- A autenticação (e-mail e senha) fica em auth.users, gerenciada pelo Supabase Auth.

create extension if not exists unaccent with schema extensions;

-- Funções auxiliares ficam fora do schema exposto pela API (public).
create schema if not exists private;

create type public.user_role as enum ('MUSICIAN', 'CONTRACTOR');
create type public.event_status as enum ('ABERTO', 'CONTRATADO', 'CANCELADO', 'CONCLUIDO');
create type public.candidate_status as enum ('PENDENTE', 'APROVADO', 'RECUSADO');
create type public.payment_status as enum ('PENDENTE', 'PAGO', 'EXPIRADO', 'CANCELADO', 'ESTORNADO');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usuários e perfis
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now()
);

create table public.musician_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  nome_completo text not null check (length(trim(nome_completo)) between 1 and 120),
  cpf text not null unique check (cpf ~ '^\d{11}$'),
  telefone text not null check (telefone ~ '^\d{10,11}$'),
  foto_perfil_url text not null,
  bio text check (length(bio) <= 1000),
  estilos_musicais text[] not null check (
    cardinality(estilos_musicais) >= 1
    and estilos_musicais <@ array['MPB', 'Pop', 'Rock', 'Sertanejo', 'Jazz', 'Pagode']
  ),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  cidade text not null check (length(trim(cidade)) between 1 and 120),
  avaliacao_media numeric(3, 2) not null default 0 check (avaliacao_media between 0 and 5),
  total_avaliacoes integer not null default 0 check (total_avaliacoes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contractor_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  nome_fantasia text not null check (length(trim(nome_fantasia)) between 1 and 120),
  cnpj text not null unique check (cnpj ~ '^\d{14}$'),
  telefone text not null check (telefone ~ '^\d{10,11}$'),
  foto_perfil_url text not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  cidade text not null check (length(trim(cidade)) between 1 and 120),
  -- Cliente correspondente na Asaas, criado na primeira cobrança.
  asaas_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CPF/CNPJ (somente dígitos) de contas excluídas: impedem novo cadastro.
create table public.blocked_documents (
  documento text primary key check (documento ~ '^(\d{11}|\d{14})$'),
  tipo public.user_role not null,
  blocked_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Eventos e candidaturas
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles (user_id) on delete cascade,
  musico_contratado_id uuid references public.musician_profiles (user_id) on delete set null,
  titulo text not null check (length(trim(titulo)) between 1 and 120),
  tipo_evento text not null check (tipo_evento in ('Bar e restaurante', 'Festa particular', 'Corporativo')),
  -- Data e horário de início em um único instante, sem ambiguidade de fuso.
  inicio timestamptz not null,
  duracao_minutos integer not null check (duracao_minutos between 1 and 1440),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  cidade text not null check (length(trim(cidade)) between 1 and 120),
  estilo_musical text not null check (estilo_musical in ('MPB', 'Pop', 'Rock', 'Sertanejo', 'Jazz', 'Pagode')),
  -- numeric: valores monetários não podem sofrer arredondamento de ponto flutuante.
  cache numeric(10, 2) not null check (cache >= 100),
  imagem_url text not null,
  descricao text check (length(descricao) <= 2000),
  status public.event_status not null default 'ABERTO',
  confirmacao_musico boolean not null default false,
  confirmacao_contratante boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_contractor_id_idx on public.events (contractor_id);
create index events_musico_contratado_id_idx on public.events (musico_contratado_id);
-- Feed do músico: eventos abertos por UF e estilo.
create index events_feed_idx on public.events (uf, estilo_musical, inicio) where status = 'ABERTO';

create table public.event_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  musician_id uuid not null references public.musician_profiles (user_id) on delete cascade,
  status public.candidate_status not null default 'PENDENTE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, musician_id)
);

create index event_candidates_musician_id_idx on public.event_candidates (musician_id);

-- ---------------------------------------------------------------------------
-- Pagamentos (Asaas)
-- ---------------------------------------------------------------------------

-- As FKs usam "set null" para que o registro financeiro sobreviva à exclusão
-- do evento ou da conta.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete set null,
  candidate_id uuid references public.event_candidates (id) on delete set null,
  contractor_id uuid references public.contractor_profiles (user_id) on delete set null,
  asaas_payment_id text not null unique,
  valor numeric(10, 2) not null check (valor >= 100),
  status public.payment_status not null default 'PENDENTE',
  pix_copia_cola text,
  pix_qr_code text,
  expira_em timestamptz not null,
  pago_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_contractor_id_idx on public.payments (contractor_id);
create index payments_candidate_id_idx on public.payments (candidate_id);
-- Idempotência: no máximo uma cobrança em aberto e uma paga por evento.
create unique index payments_uma_pendente_por_evento on public.payments (event_id) where status = 'PENDENTE';
create unique index payments_uma_paga_por_evento on public.payments (event_id) where status = 'PAGO';

-- Notificações recebidas da Asaas; a chave primária impede processar o mesmo evento duas vezes.
create table public.asaas_webhook_events (
  id text primary key,
  tipo text not null,
  asaas_payment_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Avaliações
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  reviewed_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (event_id, author_id),
  check (author_id <> reviewed_id)
);

create index reviews_author_id_idx on public.reviews (author_id);
create index reviews_reviewed_id_idx on public.reviews (reviewed_id);

-- Mantém a média e o total de avaliações do músico sempre coerentes com reviews.
create function private.refresh_musician_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_musician uuid := coalesce(new.reviewed_id, old.reviewed_id);
begin
  update public.musician_profiles m
  set total_avaliacoes = s.total,
      avaliacao_media = s.media
  from (
    select count(*)::integer as total, coalesce(round(avg(rating), 2), 0) as media
    from public.reviews
    where reviewed_id = v_musician
  ) s
  where m.user_id = v_musician;
  return null;
end;
$$;

create trigger reviews_refresh_musician_rating
after insert or update or delete on public.reviews
for each row execute function private.refresh_musician_rating();

create trigger musician_profiles_set_updated_at before update on public.musician_profiles
for each row execute function private.set_updated_at();
create trigger contractor_profiles_set_updated_at before update on public.contractor_profiles
for each row execute function private.set_updated_at();
create trigger events_set_updated_at before update on public.events
for each row execute function private.set_updated_at();
create trigger event_candidates_set_updated_at before update on public.event_candidates
for each row execute function private.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
for each row execute function private.set_updated_at();
