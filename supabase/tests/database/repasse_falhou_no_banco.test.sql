begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f1a1', 'falhou-musico@example.com'),
  ('00000000-0000-0000-0000-00000000f1c1', 'falhou-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000f1a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000f1c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000f1a1', 'Musico Falhou', '88888888888', '45999990091', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000f1c1', 'Bar Falhou', '88888888000188', '4532220091', 'https://x/c.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000f1e01', '00000000-0000-0000-0000-00000000f1c1', 'Show Falhou', 'Bar e restaurante', now() + interval '2 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000f1e02', '00000000-0000-0000-0000-00000000f1c1', 'Show Retido', 'Bar e restaurante', now() + interval '4 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000f1d01', '00000000-0000-0000-0000-0000000f1e01', '00000000-0000-0000-0000-00000000f1a1'),
  ('00000000-0000-0000-0000-0000000f1d02', '00000000-0000-0000-0000-0000000f1e02', '00000000-0000-0000-0000-00000000f1a1');
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em) values
  ('00000000-0000-0000-0000-0000000f1f01', '00000000-0000-0000-0000-0000000f1e01', '00000000-0000-0000-0000-0000000f1d01', '00000000-0000-0000-0000-00000000f1c1', 'pay_falhou_1', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-0000000f1f02', '00000000-0000-0000-0000-0000000f1e02', '00000000-0000-0000-0000-0000000f1d02', '00000000-0000-0000-0000-00000000f1c1', 'pay_falhou_2', 550, 50, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_falhou_1');
select public.confirm_asaas_payment('pay_falhou_2');
update public.payments set repasse_status = 'FALHOU' where id = '00000000-0000-0000-0000-0000000f1f01';

select is((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000f1f01')), null, 'repasse que falhou nao e reivindicado de novo pelo banco');
select is((select count(*) from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000f1f01'), 0::bigint, 'nenhuma tentativa nova para o repasse que falhou');
select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000f1f02')), null, 'repasse retido continua sendo reivindicado');
select ok(
  has_function_privilege('service_role', 'public.claim_payout(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_payout(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.claim_payout(uuid)', 'execute'),
  'so a API reivindica repasses');

select * from finish();
rollback;
