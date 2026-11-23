begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000be0a1', 'redes-musico@example.com'),
  ('00000000-0000-0000-0000-0000000be0c1', 'redes-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000be0a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000be0c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000be0a1', 'Musico Redes', '71771771771', '45999997171', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000be0c1', 'Bar Redes', '71771771000171', '4532227171', 'https://x/c.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000be0e1', '00000000-0000-0000-0000-0000000be0c1', 'Show Redes', 'Bar e restaurante', now() + interval '5 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
insert into public.event_candidates (event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000be0e1', '00000000-0000-0000-0000-0000000be0a1');

select lives_ok(
  $$ update public.musician_profiles set redes_sociais = '{"instagram": "https://www.instagram.com/banda", "spotify": "https://open.spotify.com/artist/1"}' where user_id = '00000000-0000-0000-0000-0000000be0a1' $$,
  'aceita as redes conhecidas');
select throws_ok(
  $$ update public.musician_profiles set redes_sociais = '{"facebook": "https://facebook.com/banda"}' where user_id = '00000000-0000-0000-0000-0000000be0a1' $$,
  '23514', null, 'recusa rede desconhecida');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000be0c1","role":"authenticated"}';
select is(
  (select redes_sociais ->> 'instagram' from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000be0a1'),
  'https://www.instagram.com/banda', 'contratante le as redes do musico inscrito no seu evento');
select throws_ok(
  $$ update public.musician_profiles set redes_sociais = '{}' where user_id = '00000000-0000-0000-0000-0000000be0a1' $$,
  '42501', null, 'ninguem altera as redes direto no banco, so pela API');
reset role;

select * from finish();
rollback;
