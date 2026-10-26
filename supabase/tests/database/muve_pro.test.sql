begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000003a1', 'pro-gratis@example.com'),
  ('00000000-0000-0000-0000-0000000003a2', 'pro-assinante@example.com'),
  ('00000000-0000-0000-0000-0000000003c1', 'pro-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000003a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000003a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000003c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000003a1', 'Musico Gratis', '45645645645', '45999990012', 'https://x/g.png', '{Jazz}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000003a2', 'Musico Pro', '65465465465', '45999990013', 'https://x/p.png', '{Jazz}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000003c1', 'Bar Pro', '88888888000188', '4532220008', 'https://x/b.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url, created_at) values
  ('00000000-0000-0000-0000-0000000003e1', '00000000-0000-0000-0000-0000000003c1', 'Jazz daqui a um mes', 'Bar e restaurante', now() + interval '30 days', 120, 'PR', 'Cascavel', '{Jazz}', 500, 'https://x/1.png', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000003e2', '00000000-0000-0000-0000-0000000003c1', 'Jazz amanha', 'Bar e restaurante', now() + interval '1 day', 120, 'PR', 'Cascavel', '{Jazz}', 500, 'https://x/2.png', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000003e3', '00000000-0000-0000-0000-0000000003c1', 'Jazz em Londrina', 'Bar e restaurante', now() + interval '3 days', 120, 'PR', 'Londrina', '{Jazz}', 500, 'https://x/3.png', now() - interval '3 days');
insert into public.pro_subscriptions (musician_id, asaas_subscription_id, status, valor) values
  ('00000000-0000-0000-0000-0000000003a2', 'sub_teste', 'AGUARDANDO_PAGAMENTO', 19.90);

select isnt(public.activate_pro('00000000-0000-0000-0000-0000000003a2', 'pay_pro_1', 31), null, 'pagamento ativa o Pro');
select is(
  (select public.activate_pro('00000000-0000-0000-0000-0000000003a2', 'pay_pro_1', 31)),
  (select pro_ate from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000003a2'),
  'o mesmo pagamento nao estende o Pro duas vezes');
select is((select status from public.pro_subscriptions where musician_id = '00000000-0000-0000-0000-0000000003a2'), 'ATIVA', 'assinatura passa a ativa');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}';
select results_eq(
  $$ select event_id from public.musician_feed(400) where event_id::text like '00000000-0000-0000-0000-0000000003%' order by event_id $$,
  $$ values ('00000000-0000-0000-0000-0000000003e2'::uuid) $$,
  'musico gratuito nao ve o evento em acesso antecipado nem passa de 200 km');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000003a2","role":"authenticated"}';
select results_eq(
  $$ select event_id from public.musician_feed(400) where event_id::text like '00000000-0000-0000-0000-0000000003%' order by event_id $$,
  $$ values ('00000000-0000-0000-0000-0000000003e1'::uuid), ('00000000-0000-0000-0000-0000000003e2'::uuid), ('00000000-0000-0000-0000-0000000003e3'::uuid) $$,
  'musico Pro ve o evento antes e ate 400 km');
select throws_ok($$ select public.activate_pro('00000000-0000-0000-0000-0000000003a2', 'pay_x', 31) $$, '42501', null, 'cliente nao ativa o Pro sozinho');
select throws_ok($$ select 1 from public.pro_subscriptions $$, '42501', null, 'cliente nao le assinaturas');
reset role;

select * from finish();
rollback;
