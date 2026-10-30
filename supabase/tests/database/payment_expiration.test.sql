-- O relógio do banco define o prazo e decide as transições financeiras.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'expiry-musician@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'expiry-contractor@example.com');

insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c1', 'CONTRACTOR');

insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000a1', 'Músico Prazo', '11111111111', '45999990001', 'https://x/a1.png', '{Rock}', 'PR', 'Cascavel');

insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000c1', 'Contratante Prazo', '11111111000111', '4532220001', 'https://x/c1.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Prazo válido', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e1.png'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'Prazo vencido', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e2.png'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1', 'Limite exato', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e3.png');

insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a1');

insert into public.payments (event_id, candidate_id, contractor_id, asaas_payment_id, valor) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'pay_before_expiry', 500);
insert into public.payments (event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'pay_after_expiry', 500, clock_timestamp() - interval '1 second'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c1', 'pay_exact_expiry', 500, clock_timestamp());

select ok((select expira_em between clock_timestamp() + interval '14 minutes 50 seconds' and clock_timestamp() + interval '15 minutes 1 second' from public.payments where asaas_payment_id = 'pay_before_expiry'), 'inserção define 15 minutos pelo banco');
select is(public.expire_asaas_payment((select id from public.payments where asaas_payment_id = 'pay_before_expiry')), false, 'não expira antes do prazo');
select is(public.confirm_asaas_payment('pay_before_expiry'), 'CONTRATADO', 'confirma antes do vencimento');
select is(public.confirm_asaas_payment('pay_before_expiry'), 'JA_PROCESSADO', 'webhook repetido é idempotente');
select is(public.expire_asaas_payment((select id from public.payments where asaas_payment_id = 'pay_before_expiry')), false, 'expiração não sobrescreve pagamento confirmado');

select is(public.confirm_asaas_payment('pay_after_expiry'), 'PAGAMENTO_EXPIRADO', 'pagamento após vencimento não contrata');
select ok((select late_payment_detected_at is not null from public.payments where asaas_payment_id = 'pay_after_expiry'), 'pagamento tardio fica marcado para conciliação');
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000000e2'), 'ABERTO', 'evento continua aberto');
select is(public.expire_asaas_payment((select id from public.payments where asaas_payment_id = 'pay_after_expiry')), false, 'confirmação tardia já reservou expiração');
select is((select status::text from public.payments where asaas_payment_id = 'pay_after_expiry'), 'EXPIRADO', 'cobrança vencida fica expirada');
select is(public.confirm_asaas_payment('pay_after_expiry'), 'PAGAMENTO_EXPIRADO', 'cobrança já expirada não contrata');
-- Ordem inversa: a expiração obtém o bloqueio de linha antes da confirmação.
insert into public.payments (event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'pay_expire_first', 500, clock_timestamp() - interval '1 second');
select is(public.expire_asaas_payment((select id from public.payments where asaas_payment_id = 'pay_expire_first')), true, 'expiração reserva a cobrança antes da confirmação');
select is(public.confirm_asaas_payment('pay_expire_first'), 'PAGAMENTO_EXPIRADO', 'confirmação posterior não contrata');
select ok((select late_payment_detected_at is not null from public.payments where asaas_payment_id = 'pay_expire_first'), 'recebimento posterior fica marcado para conciliação');
select is(public.confirm_asaas_payment('pay_exact_expiry'), 'PAGAMENTO_EXPIRADO', 'instante exato do limite não contrata');
select ok((select late_payment_detected_at is not null from public.payments where asaas_payment_id = 'pay_exact_expiry'), 'pagamento no limite fica marcado para conciliação');
select is(public.expire_asaas_payment((select id from public.payments where asaas_payment_id = 'pay_exact_expiry')), false, 'limite exato já expirou na confirmação');
select is(public.expire_asaas_payment((select id from public.payments where asaas_payment_id = 'pay_exact_expiry')), false, 'expiração repetida é idempotente');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok($$ select public.expire_asaas_payment('00000000-0000-0000-0000-0000000000e3'::uuid) $$, '42501', null, 'cliente não pode expirar pagamento');
reset role;

select * from finish();
rollback;
