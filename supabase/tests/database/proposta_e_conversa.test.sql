begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'conversa-musico@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'conversa-intruso@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'conversa-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c3', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000c1', 'Musico Conversa', '44444444444', '45999990004', 'https://x/c1.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000000c2', 'Musico Intruso', '55555555555', '45999990005', 'https://x/c2.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000c3', 'Bar Conversa', '33333333000133', '4532220003', 'https://x/c3.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c3', 'Show negociado', 'Bar e restaurante', now() + interval '7 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e5.png');
insert into public.event_candidates (id, event_id, musician_id, valor_proposto) values
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c1', 650);
insert into public.candidate_messages (candidate_id, author_id, texto) values
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c1', 'Consigo por R$ 650?');

select throws_ok(
  $$ update public.event_candidates set valor_proposto = 50 where id = '00000000-0000-0000-0000-0000000000d5' $$,
  '23514', null, 'proposta abaixo do cache minimo e rejeitada');
select throws_ok(
  $$ insert into public.candidate_messages (candidate_id, author_id, texto) values ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c1', '') $$,
  '23514', null, 'mensagem vazia e rejeitada');

set local role anon;
select throws_ok($$ select 1 from public.candidate_messages $$, '42501', null, 'anonimo nao le conversas');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select is((select count(*)::int from public.candidate_messages), 1, 'musico le a propria conversa');
select is((select valor_proposto from public.event_candidates where id = '00000000-0000-0000-0000-0000000000d5'), 650.00::numeric, 'musico le a propria proposta');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select is((select count(*)::int from public.candidate_messages), 1, 'dono do evento le a conversa');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select is((select count(*)::int from public.candidate_messages), 0, 'outro musico nao le a conversa');
select throws_ok(
  $$ insert into public.candidate_messages (candidate_id, author_id, texto) values ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c2', 'oi') $$,
  '42501', null, 'cliente nao escreve mensagens direto no banco');
reset role;

select * from finish();
rollback;
