begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000002a1', 'pena-musico@example.com'),
  ('00000000-0000-0000-0000-0000000002a2', 'pena-outro@example.com'),
  ('00000000-0000-0000-0000-0000000002c1', 'pena-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000002a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000002a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000002c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade, visibilidade_reduzida_ate) values
  ('00000000-0000-0000-0000-0000000002a1', 'Musico Penalizado', '12312312312', '45999990010', 'https://x/p.png', '{Rock}', 'PR', 'Cascavel', now() + interval '15 days'),
  ('00000000-0000-0000-0000-0000000002a2', 'Musico Outro', '32132132132', '45999990011', 'https://x/o.png', '{Rock}', 'PR', 'Cascavel', null);
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000002c1', 'Bar Pena', '77777777000177', '4532220007', 'https://x/b.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url, musico_contratado_id, status) values
  ('00000000-0000-0000-0000-0000000002e1', '00000000-0000-0000-0000-0000000002c1', 'Show aberto', 'Bar e restaurante', now() + interval '5 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/1.png', null, 'ABERTO'),
  ('00000000-0000-0000-0000-0000000002e2', '00000000-0000-0000-0000-0000000002c1', 'Show contestado', 'Bar e restaurante', now() - interval '1 day', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/2.png', '00000000-0000-0000-0000-0000000002a1', 'CONTRATADO');
insert into public.penalties (musician_id, event_id, tipo, multa) values
  ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-0000000002e2', 'AUSENCIA', 100);
insert into public.disputes (event_id, aberta_por, motivo) values
  ('00000000-0000-0000-0000-0000000002e2', '00000000-0000-0000-0000-0000000002c1', 'O musico nao apareceu no show.');

select throws_ok(
  $$ insert into public.disputes (event_id, aberta_por, motivo) values ('00000000-0000-0000-0000-0000000002e2', '00000000-0000-0000-0000-0000000002a1', 'Outra contestacao aberta.') $$,
  '23505', null, 'so uma contestacao aberta por evento');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}';
select is((select count(*)::int from public.musician_feed(0) where event_id::text like '00000000-%'), 0, 'musico com visibilidade reduzida nao ve novos eventos');
select is((select count(*)::int from public.penalties), 1, 'musico le a propria penalidade');
select is((select count(*)::int from public.disputes), 1, 'musico contratado le a contestacao do show');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000002a2","role":"authenticated"}';
select is((select count(*)::int from public.musician_feed(0) where event_id = '00000000-0000-0000-0000-0000000002e1'), 1, 'outro musico continua vendo o evento');
select is((select count(*)::int from public.penalties) + (select count(*)::int from public.disputes), 0, 'outro musico nao ve penalidades nem contestacoes alheias');
reset role;

select * from finish();
rollback;
