begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000ae0c1', 'avaliado-contratante@example.com'),
  ('00000000-0000-0000-0000-0000000ae0c2', 'outro-contratante@example.com'),
  ('00000000-0000-0000-0000-0000000ae0a1', 'musico-contratado@example.com'),
  ('00000000-0000-0000-0000-0000000ae0a2', 'musico-de-fora@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000ae0c1', 'CONTRACTOR'),
  ('00000000-0000-0000-0000-0000000ae0c2', 'CONTRACTOR'),
  ('00000000-0000-0000-0000-0000000ae0a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000ae0a2', 'MUSICIAN');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000ae0c1', 'Bar Avaliado', '61661661000161', '4532226161', 'https://x/c.png', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000ae0c2', 'Bar Vizinho', '62662662000162', '4532226262', 'https://x/d.png', 'PR', 'Cascavel');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000ae0a1', 'Musico Contratado', '61661661661', '45999996161', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000ae0a2', 'Musico de Fora', '62662662662', '45999996262', 'https://x/b.png', '{Rock}', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000ae0e1', '00000000-0000-0000-0000-0000000ae0c1', 'Show avaliado', 'Bar e restaurante', now() - interval '3 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
insert into public.reviews (event_id, author_id, reviewed_id, rating, comment) values
  ('00000000-0000-0000-0000-0000000ae0e1', '00000000-0000-0000-0000-0000000ae0a1', '00000000-0000-0000-0000-0000000ae0c1', 5, 'Pagou certo e tratou bem'),
  ('00000000-0000-0000-0000-0000000ae0e1', '00000000-0000-0000-0000-0000000ae0c1', '00000000-0000-0000-0000-0000000ae0a1', 4, 'Chegou no horario');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000ae0a2","role":"authenticated"}';
select is(
  (select count(id)::int from public.reviews where reviewed_id = '00000000-0000-0000-0000-0000000ae0c1'),
  1, 'musico sem relacao com o evento le as avaliacoes recebidas pelo contratante');
select is(
  (select count(id)::int from public.reviews where reviewed_id = '00000000-0000-0000-0000-0000000ae0a1'),
  0, 'as avaliacoes recebidas por outro musico continuam fechadas');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000ae0c2","role":"authenticated"}';
select is(
  (select count(id)::int from public.reviews where reviewed_id = '00000000-0000-0000-0000-0000000ae0c1'),
  1, 'outro contratante tambem le as avaliacoes do contratante');
reset role;

set local role anon;
select throws_ok($$ select 1 from public.reviews $$, '42501', null, 'visitante sem login nao le avaliacoes');
reset role;

select ok(
  has_function_privilege('authenticated', 'private.is_contractor(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.is_contractor(uuid)', 'execute'),
  'so usuarios logados usam a checagem de contratante');

select * from finish();
rollback;
