-- Muve — feed por distância, portfólio do músico, estrutura e formação do evento.

-- ---------------------------------------------------------------------------
-- Novos campos
-- ---------------------------------------------------------------------------

-- Link de vídeo/áudio (YouTube, Instagram, Spotify...): a forma de o músico se apresentar.
alter table public.musician_profiles
  add column portfolio_url text check (portfolio_url ~ '^https?://' and length(portfolio_url) <= 300);
grant select (portfolio_url) on public.musician_profiles to authenticated;

alter table public.events
  add column formacao text not null default 'Indiferente'
    check (formacao in ('Solo', 'Dupla', 'Trio', 'Banda', 'Indiferente')),
  add column som_disponivel boolean not null default false;

-- ---------------------------------------------------------------------------
-- Distância entre cidades
-- ---------------------------------------------------------------------------

create function private.municipio_coords(p_uf text, p_cidade text)
returns table (latitude double precision, longitude double precision)
language sql
stable
set search_path = ''
as $$
  select m.latitude, m.longitude
  from public.municipios m
  where m.uf = p_uf
    and private.normalize_nome(m.nome) = private.normalize_nome(p_cidade)
  limit 1;
$$;

-- Distância em linha reta (fórmula de haversine), em km; nulo se alguma cidade não for encontrada.
create function private.distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((
    2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  )::numeric, 1);
$$;

grant execute on function private.municipio_coords(text, text) to authenticated;
grant execute on function private.distance_km(double precision, double precision, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Feed do músico por raio
-- ---------------------------------------------------------------------------

drop function public.musician_feed();

-- Eventos abertos e futuros, de um estilo do músico, na mesma cidade ou dentro do
-- raio informado (em km). Raio 0 = apenas a mesma cidade. Devolve o ID e a
-- distância; os dados do evento são lidos pelo cliente com as policies normais.
create function public.musician_feed(p_raio_km integer default 0)
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
    and e.estilo_musical = any (mu.estilos_musicais)
    and (
      (e.uf = mu.uf and extensions.unaccent(lower(e.cidade)) = extensions.unaccent(lower(mu.cidade)))
      or (p_raio_km > 0 and private.distance_km(mu.latitude, mu.longitude, c.latitude, c.longitude) <= p_raio_km)
    )
  order by distancia_km, e.inicio;
$$;

revoke execute on function public.musician_feed(integer) from public, anon;
grant execute on function public.musician_feed(integer) to authenticated;

-- Usada pela API ao validar uma candidatura: distância entre o músico e o evento.
create function public.event_distance_km(p_event_id uuid, p_musician_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when e.uf = m.uf and extensions.unaccent(lower(e.cidade)) = extensions.unaccent(lower(m.cidade)) then 0
    else private.distance_km(cm.latitude, cm.longitude, ce.latitude, ce.longitude)
  end
  from public.events e
  join public.musician_profiles m on m.user_id = p_musician_id
  left join lateral private.municipio_coords(e.uf, e.cidade) ce on true
  left join lateral private.municipio_coords(m.uf, m.cidade) cm on true
  where e.id = p_event_id;
$$;

revoke execute on function public.event_distance_km(uuid, uuid) from public, anon, authenticated;
grant execute on function public.event_distance_km(uuid, uuid) to service_role;
