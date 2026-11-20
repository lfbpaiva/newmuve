begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c4a1', 'chave-musico@example.com'),
  ('00000000-0000-0000-0000-00000000c4a2', 'chave-outro@example.com'),
  ('00000000-0000-0000-0000-00000000c4c1', 'chave-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000c4a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c4a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c4c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c4a1', 'Musico Chave', '77777777777', '45999990071', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-00000000c4a2', 'Outro Musico', '66666666666', '45999990072', 'https://x/b.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c4c1', 'Bar Chave', '77777777000177', '4532220071', 'https://x/c.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000c4e01', '00000000-0000-0000-0000-00000000c4c1', 'Falhou sem transferencia', 'Bar e restaurante', now() + interval '2 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000c4e02', '00000000-0000-0000-0000-00000000c4c1', 'Falhou com estorno', 'Bar e restaurante', now() + interval '3 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000c4e03', '00000000-0000-0000-0000-00000000c4c1', 'Falhou de outro musico', 'Bar e restaurante', now() + interval '4 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-0000000c4e04', '00000000-0000-0000-0000-00000000c4c1', 'Falhou com tentativa concluida', 'Bar e restaurante', now() + interval '5 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000c4d01', '00000000-0000-0000-0000-0000000c4e01', '00000000-0000-0000-0000-00000000c4a1'),
  ('00000000-0000-0000-0000-0000000c4d02', '00000000-0000-0000-0000-0000000c4e02', '00000000-0000-0000-0000-00000000c4a1'),
  ('00000000-0000-0000-0000-0000000c4d03', '00000000-0000-0000-0000-0000000c4e03', '00000000-0000-0000-0000-00000000c4a2'),
  ('00000000-0000-0000-0000-0000000c4d04', '00000000-0000-0000-0000-0000000c4e04', '00000000-0000-0000-0000-00000000c4a1');
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em) values
  ('00000000-0000-0000-0000-0000000c4f01', '00000000-0000-0000-0000-0000000c4e01', '00000000-0000-0000-0000-0000000c4d01', '00000000-0000-0000-0000-00000000c4c1', 'pay_chave_1', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-0000000c4f02', '00000000-0000-0000-0000-0000000c4e02', '00000000-0000-0000-0000-0000000c4d02', '00000000-0000-0000-0000-00000000c4c1', 'pay_chave_2', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-0000000c4f03', '00000000-0000-0000-0000-0000000c4e03', '00000000-0000-0000-0000-0000000c4d03', '00000000-0000-0000-0000-00000000c4c1', 'pay_chave_3', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-0000000c4f04', '00000000-0000-0000-0000-0000000c4e04', '00000000-0000-0000-0000-0000000c4d04', '00000000-0000-0000-0000-00000000c4c1', 'pay_chave_4', 550, 50, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_chave_1');
select public.confirm_asaas_payment('pay_chave_2');
select public.confirm_asaas_payment('pay_chave_3');
select public.confirm_asaas_payment('pay_chave_4');

select public.falhar_tentativa((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c4f01')), null);
select public.falhar_tentativa((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c4f02')), null);
select public.falhar_tentativa((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c4f03')), null);
update public.payments set repasse_status = 'FALHOU' where id = '00000000-0000-0000-0000-0000000c4f04';
insert into public.repasse_tentativas (id, payment_id, estado, referencia_externa, asaas_transfer_id, valor, encerrada_em) values
  ('00000000-0000-0000-0000-0000000c4b04', '00000000-0000-0000-0000-0000000c4f04', 'CONCLUIDA', '00000000-0000-0000-0000-0000000c4b04', 'tra_concluida', 500, now());
update public.payments set refund_status = 'PROCESSANDO' where id = '00000000-0000-0000-0000-0000000c4f02';

select is(public.reabrir_repasses_falhos('00000000-0000-0000-0000-00000000c4a1'), 1, 'reabre so o repasse que falhou sem transferencia');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000c4f01'), 'RETIDO', 'repasse que falhou volta para a fila');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000c4f02'), 'FALHOU', 'repasse com estorno em andamento nao volta');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000c4f04'), 'FALHOU', 'repasse com transferencia concluida nao volta');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000c4f03'), 'FALHOU', 'repasse de outro musico nao muda');
select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c4f01')), null, 'repasse reaberto e reivindicado de novo');
select is(public.reabrir_repasses_falhos('00000000-0000-0000-0000-00000000c4a1'), 0, 'repasse em andamento nao e reaberto');
select ok(
  has_function_privilege('service_role', 'public.reabrir_repasses_falhos(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.reabrir_repasses_falhos(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.reabrir_repasses_falhos(uuid)', 'execute'),
  'so a API reabre repasses');

select * from finish();
rollback;
