alter table public.musician_profiles
  add column pro_ate timestamptz,
  add column asaas_customer_id text unique;

grant select (pro_ate) on public.musician_profiles to authenticated;

create table public.pro_subscriptions (
  musician_id uuid primary key references public.musician_profiles (user_id) on delete cascade,
  asaas_subscription_id text not null unique,
  status text not null check (status in ('AGUARDANDO_PAGAMENTO', 'ATIVA', 'CANCELADA')),
  valor numeric(10, 2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pro_payments (
  asaas_payment_id text primary key,
  musician_id uuid not null references public.musician_profiles (user_id) on delete cascade,
  pago_em timestamptz not null default now()
);

alter table public.pro_subscriptions enable row level security;
alter table public.pro_payments enable row level security;

create function public.activate_pro(p_musician_id uuid, p_asaas_payment_id text, p_dias integer)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ate timestamptz;
begin
  insert into public.pro_payments (asaas_payment_id, musician_id) values (p_asaas_payment_id, p_musician_id)
  on conflict (asaas_payment_id) do nothing;
  if not found then
    select pro_ate into v_ate from public.musician_profiles where user_id = p_musician_id;
    return v_ate;
  end if;

  update public.musician_profiles
  set pro_ate = greatest(coalesce(pro_ate, now()), now()) + make_interval(days => p_dias)
  where user_id = p_musician_id
  returning pro_ate into v_ate;
  update public.pro_subscriptions set status = 'ATIVA', updated_at = now()
  where musician_id = p_musician_id and status = 'AGUARDANDO_PAGAMENTO';
  return v_ate;
end;
$$;

revoke execute on function public.activate_pro(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.activate_pro(uuid, text, integer) to service_role;

create function private.is_pro(p_musician_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.pro_ate > now() from public.musician_profiles m where m.user_id = p_musician_id), false);
$$;

revoke execute on function private.is_pro(uuid) from public;
grant execute on function private.is_pro(uuid) to authenticated;

create or replace function public.musician_feed(p_raio_km integer default 0)
returns table (event_id uuid, distancia_km numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with musician as (
    select m.uf, m.cidade, m.estilos_musicais, c.latitude, c.longitude, private.is_pro(m.user_id) as pro
    from public.musician_profiles m
    left join lateral private.municipio_coords(m.uf, m.cidade) c on true
    where m.user_id = (select auth.uid())
      and m.uf is not null and m.cidade is not null and m.estilos_musicais is not null
      and not private.visibility_reduced(m.user_id)
  )
  select e.id,
         case
           when e.uf = mu.uf and extensions.unaccent(lower(e.cidade)) = extensions.unaccent(lower(mu.cidade)) then 0
           else private.distance_km(mu.latitude, mu.longitude, c.latitude, c.longitude)
         end as distancia_km
  from public.events e
  cross join musician mu
  left join lateral private.municipio_coords(e.uf, e.cidade) c on true
  where e.status = 'ABERTO'
    and not e.inscricoes_encerradas
    and e.inicio > now()
    and (
      mu.pro
      or e.created_at <= now() - interval '24 hours'
      or e.inicio - e.created_at <= interval '7 days'
    )
    and (e.estilos_musicais && mu.estilos_musicais or 'Qualquer estilo' = any (e.estilos_musicais))
    and (
      (e.uf = mu.uf and extensions.unaccent(lower(e.cidade)) = extensions.unaccent(lower(mu.cidade)))
      or (
        p_raio_km > 0
        and private.distance_km(mu.latitude, mu.longitude, c.latitude, c.longitude) <= least(p_raio_km, case when mu.pro then 400 else 200 end)
      )
    )
  order by distancia_km, e.inicio;
$$;
