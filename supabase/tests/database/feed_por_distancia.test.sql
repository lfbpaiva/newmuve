-- Testes de banco (pgTAP): feed do músico por raio de distância.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'm1@exemplo.com'),
  ('00000000-0000-0000-0000-0000000000a9', 'novo@exemplo.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@exemplo.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000a9', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000a1', 'Músico Um', '11111111111', '45999990001', 'https://x/a1.png', '{Rock}', 'PR', 'cascavel');
-- Músico recém-cadastrado: só o nome.
insert into public.musician_profiles (user_id, nome_completo) values ('00000000-0000-0000-0000-0000000000a9', 'Recém-chegado');

insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000c1', 'Bar Um', '11111111000111', '4532220001', 'https://x/c1.png', 'PR', 'Cascavel');

-- Cascavel (mesma cidade), Toledo (~45 km), Foz do Iguaçu (~140 km), Curitiba (~430 km) e Cascavel no Ceará (homônima, outro estado).
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Cascavel', 'Corporativo', now() + interval '7 days', 60, 'PR', 'CASCAVEL', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'Toledo', 'Corporativo', now() + interval '7 days', 60, 'PR', 'Toledo', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1', 'Foz', 'Corporativo', now() + interval '7 days', 60, 'PR', 'Foz do Iguaçu', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c1', 'Curitiba', 'Corporativo', now() + interval '7 days', 60, 'PR', 'Curitiba', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c1', 'Cascavel CE', 'Corporativo', now() + interval '7 days', 60, 'CE', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000c1', 'Toledo pagode', 'Corporativo', now() + interval '7 days', 60, 'PR', 'Toledo', '{Pagode}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000c1', 'Qualquer estilo', 'Festa particular', now() + interval '7 days', 60, 'PR', 'Cascavel', '{"Qualquer estilo"}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000c1', 'Pagode ou rock', 'Corporativo', now() + interval '7 days', 60, 'PR', 'Cascavel', '{Pagode,Rock}', 500, 'https://x/e.png');

select is(private.distance_km(-24.9573, -53.459, -24.7246, -53.7412), 38.5::numeric, 'haversine Cascavel–Toledo (sedes)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select results_eq(
  $$ select event_id, distancia_km from public.musician_feed(0) $$,
  $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid, 0::numeric), ('00000000-0000-0000-0000-0000000000e7'::uuid, 0::numeric), ('00000000-0000-0000-0000-0000000000e8'::uuid, 0::numeric) $$,
  'raio 0: só a mesma cidade; entra evento com estilo em comum ou aberto a qualquer estilo');

select results_eq(
  $$ select event_id from public.musician_feed(50) where event_id not in ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e8') $$,
  $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid), ('00000000-0000-0000-0000-0000000000e2'::uuid) $$,
  'raio 50 km: inclui Toledo, ordenado pela distância');

select results_eq(
  $$ select event_id from public.musician_feed(200) where event_id not in ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e8') $$,
  $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid), ('00000000-0000-0000-0000-0000000000e2'::uuid), ('00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'raio 200 km: inclui Foz do Iguaçu, não Curitiba');

select is((select count(*) from public.musician_feed(200) where event_id = '00000000-0000-0000-0000-0000000000e5'), 0::bigint, 'cidade homônima em outro estado é medida pela distância real, não pelo nome');
select is((select count(*) from public.musician_feed(5000) where event_id = '00000000-0000-0000-0000-0000000000e6'), 0::bigint, 'estilo fora do perfil nunca entra, em nenhum raio');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
select is((select count(*) from public.musician_feed(200)), 0::bigint, 'músico sem cidade e estilos ainda não vê eventos');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select count(*) from public.musician_feed(0) where event_id = '00000000-0000-0000-0000-0000000000e6'), 0::bigint, 'evento só de Pagode não aparece para músico de Rock');
select throws_ok($$ select public.event_distance_km('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1') $$, '42501', null, 'cálculo de distância por ID é exclusivo da API');

select * from finish();
rollback;
