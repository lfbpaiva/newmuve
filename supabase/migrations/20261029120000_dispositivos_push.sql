create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
