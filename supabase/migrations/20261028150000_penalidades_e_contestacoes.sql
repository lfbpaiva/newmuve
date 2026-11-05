alter table public.musician_profiles add column visibilidade_reduzida_ate timestamptz;

create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  musician_id uuid not null references public.musician_profiles (user_id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  tipo text not null check (tipo in ('DESISTENCIA_TARDIA', 'AUSENCIA')),
  multa numeric(10, 2) not null default 0 check (multa >= 0),
  quitada_em timestamptz,
  payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now()
);

create index penalties_musician_idx on public.penalties (musician_id) where quitada_em is null;

alter table public.penalties enable row level security;
grant select on public.penalties to authenticated;
create policy "musico le as proprias penalidades" on public.penalties
for select to authenticated
using (musician_id = (select auth.uid()));

alter table public.payments add column multa_descontada numeric(10, 2) not null default 0 check (multa_descontada >= 0);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  aberta_por uuid references public.profiles (id) on delete set null,
  motivo text not null check (char_length(motivo) between 10 and 1000),
  status text not null default 'ABERTA' check (status in ('ABERTA', 'RESOLVIDA')),
  decisao text check (decisao in ('PAGAR_MUSICO', 'DEVOLVER_CONTRATANTE')),
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  created_at timestamptz not null default now(),
  resolvida_em timestamptz,
  check ((status = 'ABERTA' and decisao is null) or (status = 'RESOLVIDA' and decisao is not null))
);

create unique index disputes_uma_aberta_por_evento on public.disputes (event_id) where status = 'ABERTA';

alter table public.disputes enable row level security;
grant select on public.disputes to authenticated;
create policy "contestacao visivel as partes do evento" on public.disputes
for select to authenticated
using (
  private.is_event_owner(event_id)
  or exists (select 1 from public.events e where e.id = event_id and e.musico_contratado_id = (select auth.uid()))
);

create or replace function public.musician_feed(p_raio_km integer default 0)
returns table (event_id uuid, distancia_km numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with musician as (
    select m.uf, m.cidade, m.estilos_musicais, c.latitude, c.longitude
    from public.musician_profiles m
    left join lateral private.municipio_coords(m.uf, m.cidade) c on true
    where m.user_id = (select auth.uid())
      and m.uf is not null and m.cidade is not null and m.estilos_musicais is not null
      and (m.visibilidade_reduzida_ate is null or m.visibilidade_reduzida_ate <= now())
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
    and (e.estilos_musicais && mu.estilos_musicais or 'Qualquer estilo' = any (e.estilos_musicais))
    and (
      (e.uf = mu.uf and extensions.unaccent(lower(e.cidade)) = extensions.unaccent(lower(mu.cidade)))
      or (p_raio_km > 0 and private.distance_km(mu.latitude, mu.longitude, c.latitude, c.longitude) <= p_raio_km)
    )
  order by distancia_km, e.inicio;
$$;
