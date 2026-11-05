-- Muve — estilos musicais ampliados
-- A lista de gêneros passa a viver no código (shared/dominio.ts), para crescer
-- sem migration. Um evento pode pedir vários estilos ou "Qualquer estilo";
-- o match passa a ser a interseção entre os estilos do evento e os do músico.

alter table public.musician_profiles drop constraint musician_profiles_estilos_musicais_check;
alter table public.musician_profiles add constraint musician_profiles_estilos_musicais_check check (
  estilos_musicais is null or cardinality(estilos_musicais) >= 1
);

alter table public.events add column estilos_musicais text[] not null default '{}';
update public.events set estilos_musicais = array[estilo_musical];
alter table public.events alter column estilos_musicais drop default;
alter table public.events add constraint events_estilos_musicais_check check (cardinality(estilos_musicais) >= 1);
drop index public.events_feed_idx;
alter table public.events drop column estilo_musical;
create index events_feed_idx on public.events (uf, inicio) where status = 'ABERTO';

-- Feed: estilos em comum, ou evento aberto a qualquer estilo.
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
    and e.inicio > now()
    and (e.estilos_musicais && mu.estilos_musicais or 'Qualquer estilo' = any (e.estilos_musicais))
    and (
      (e.uf = mu.uf and extensions.unaccent(lower(e.cidade)) = extensions.unaccent(lower(mu.cidade)))
      or (p_raio_km > 0 and private.distance_km(mu.latitude, mu.longitude, c.latitude, c.longitude) <= p_raio_km)
    )
  order by distancia_km, e.inicio;
$$;
