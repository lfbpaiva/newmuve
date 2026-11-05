alter table public.contractor_profiles add column casa_ate timestamptz;

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plano text not null check (plano in ('PRO', 'CASA')),
  asaas_subscription_id text not null unique,
  status text not null check (status in ('AGUARDANDO_PAGAMENTO', 'ATIVA', 'CANCELADA')),
  valor numeric(10, 2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_payments (
  asaas_payment_id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pago_em timestamptz not null default now()
);

insert into public.subscriptions (user_id, plano, asaas_subscription_id, status, valor, created_at, updated_at)
select musician_id, 'PRO', asaas_subscription_id, status, valor, created_at, updated_at from public.pro_subscriptions;
insert into public.plan_payments (asaas_payment_id, user_id, pago_em)
select asaas_payment_id, musician_id, pago_em from public.pro_payments;

drop function public.activate_pro(uuid, text, integer);
drop table public.pro_payments;
drop table public.pro_subscriptions;

alter table public.subscriptions enable row level security;
alter table public.plan_payments enable row level security;

create function public.activate_plan(p_user_id uuid, p_asaas_payment_id text, p_dias integer)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ate timestamptz;
begin
  insert into public.plan_payments (asaas_payment_id, user_id) values (p_asaas_payment_id, p_user_id)
  on conflict (asaas_payment_id) do nothing;
  if found then
    update public.musician_profiles
    set pro_ate = greatest(coalesce(pro_ate, now()), now()) + make_interval(days => p_dias)
    where user_id = p_user_id;
    update public.contractor_profiles
    set casa_ate = greatest(coalesce(casa_ate, now()), now()) + make_interval(days => p_dias)
    where user_id = p_user_id;
    update public.subscriptions set status = 'ATIVA', updated_at = now()
    where user_id = p_user_id and status = 'AGUARDANDO_PAGAMENTO';
  end if;

  select coalesce(
    (select pro_ate from public.musician_profiles where user_id = p_user_id),
    (select casa_ate from public.contractor_profiles where user_id = p_user_id)
  ) into v_ate;
  return v_ate;
end;
$$;

revoke execute on function public.activate_plan(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.activate_plan(uuid, text, integer) to service_role;

create table public.contractor_favorites (
  contractor_id uuid not null references public.contractor_profiles (user_id) on delete cascade,
  musician_id uuid not null references public.musician_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contractor_id, musician_id)
);

create table public.event_invites (
  event_id uuid not null references public.events (id) on delete cascade,
  musician_id uuid not null references public.musician_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, musician_id)
);

create index event_invites_musician_idx on public.event_invites (musician_id);

alter table public.contractor_favorites enable row level security;
alter table public.event_invites enable row level security;

grant select on public.contractor_favorites to authenticated;
create policy "contratante le os proprios favoritos" on public.contractor_favorites
for select to authenticated
using (contractor_id = (select auth.uid()));

grant select on public.event_invites to authenticated;
create policy "convite visivel ao musico e ao dono do evento" on public.event_invites
for select to authenticated
using (musician_id = (select auth.uid()) or private.is_event_owner(event_id));

create or replace function private.is_candidate_of_my_events(p_musician_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_candidates c
    join public.events e on e.id = c.event_id
    where c.musician_id = p_musician_id and e.contractor_id = (select auth.uid())
  )
  or exists (
    select 1 from public.contractor_favorites f
    where f.musician_id = p_musician_id and f.contractor_id = (select auth.uid())
  );
$$;
