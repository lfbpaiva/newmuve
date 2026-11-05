-- Muve — cadastro progressivo
-- O cadastro passa a pedir só tipo de conta, nome, e-mail e senha. Os demais
-- dados são preenchidos no perfil, e a API exige cada um apenas no momento em
-- que ele faz falta (montar o feed, candidatar-se, criar evento, pagar).

alter table public.musician_profiles
  alter column documento drop not null,
  alter column telefone drop not null,
  alter column foto_perfil_url drop not null,
  alter column uf drop not null,
  alter column cidade drop not null,
  alter column estilos_musicais drop not null;

-- Estilos: ou ausentes, ou ao menos um da lista.
alter table public.musician_profiles drop constraint musician_profiles_estilos_musicais_check;
alter table public.musician_profiles add constraint musician_profiles_estilos_musicais_check check (
  estilos_musicais is null
  or (cardinality(estilos_musicais) >= 1 and estilos_musicais <@ array['MPB', 'Pop', 'Rock', 'Sertanejo', 'Jazz', 'Pagode'])
);

alter table public.contractor_profiles
  alter column documento drop not null,
  alter column telefone drop not null,
  alter column foto_perfil_url drop not null,
  alter column uf drop not null,
  alter column cidade drop not null;

-- Feed: músico sem cidade ou sem estilos ainda não vê eventos.
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
    and e.estilo_musical = any (mu.estilos_musicais)
    and (
      (e.uf = mu.uf and extensions.unaccent(lower(e.cidade)) = extensions.unaccent(lower(mu.cidade)))
      or (p_raio_km > 0 and private.distance_km(mu.latitude, mu.longitude, c.latitude, c.longitude) <= p_raio_km)
    )
  order by distancia_km, e.inicio;
$$;
