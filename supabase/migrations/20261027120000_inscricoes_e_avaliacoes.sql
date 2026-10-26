alter table public.events add column inscricoes_encerradas boolean not null default false;

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
    and not e.inscricoes_encerradas
    and e.inicio > now()
    and (e.estilos_musicais && mu.estilos_musicais or 'Qualquer estilo' = any (e.estilos_musicais))
    and (
      (e.uf = mu.uf and extensions.unaccent(lower(e.cidade)) = extensions.unaccent(lower(mu.cidade)))
      or (p_raio_km > 0 and private.distance_km(mu.latitude, mu.longitude, c.latitude, c.longitude) <= p_raio_km)
    )
  order by distancia_km, e.inicio;
$$;

alter table public.reviews
  alter column event_id drop not null,
  alter column author_id drop not null,
  drop constraint reviews_event_id_fkey,
  drop constraint reviews_author_id_fkey,
  add constraint reviews_event_id_fkey foreign key (event_id) references public.events (id) on delete set null,
  add constraint reviews_author_id_fkey foreign key (author_id) references public.profiles (id) on delete set null;
