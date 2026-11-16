begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e2a1', 'vinc-musico@example.com'),
  ('00000000-0000-0000-0000-00000000e2c1', 'vinc-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000e2a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000e2c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000e2a1', 'Musico Vinculo', '79999999999', '45999990091', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000e2c1', 'Bar Vinculo', '79999999000191', '4532220091', 'https://x/c.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000e2e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e2c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from generate_series(1, 5) n;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000e2d' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e2e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e2a1'
from generate_series(1, 5) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000e2f' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e2e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000e2d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e2c1', 'pay_vinc_' || n, 550, 50, now() + interval '15 minutes'
from generate_series(1, 5) n;
select public.confirm_asaas_payment('pay_vinc_' || n) from generate_series(1, 5) n;

insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000e29' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e2e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000e2d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e2c1', 'pay_vinc_outro_' || n, 550, 50, now() - interval '1 minute'
from unnest(array[1, 2, 3, 5]) n;
update public.payments
set status = 'ESTORNADO', refund_status = 'CONFIRMADO', refund_action = 'REABRIR',
    pago_em = (select pago_em from public.payments where id = '00000000-0000-0000-0000-0000000e2f01')
where id = '00000000-0000-0000-0000-0000000e2901';
update public.payments
set status = 'ESTORNADO', refund_status = 'CONFIRMADO', refund_action = 'REABRIR', pago_em = now() - interval '3 days'
where id = '00000000-0000-0000-0000-0000000e2902';
update public.payments
set status = 'ESTORNADO', refund_status = 'CONFIRMADO', refund_action = 'REABRIR',
    pago_em = (select pago_em from public.payments where id = '00000000-0000-0000-0000-0000000e2f03')
where id = '00000000-0000-0000-0000-0000000e2903';
update public.payments set status = 'EXPIRADO' where id = '00000000-0000-0000-0000-0000000e2905';

insert into public.disputes (id, event_id, payment_id, aberta_por, motivo, created_at)
select ('00000000-0000-0000-0000-0000000e2b' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e2e' || lpad(n::text, 2, '0'))::uuid,
  case when n = 3 then '00000000-0000-0000-0000-0000000e2f03'::uuid end,
  '00000000-0000-0000-0000-00000000e2c1', 'O show não aconteceu como combinado.',
  case when n = 4 then now() - interval '1 day' else now() end
from generate_series(1, 5) n;

select ok(not has_function_privilege('service_role', 'private.vincular_contestacoes_ao_pagamento()', 'execute'), 'a API nao executa o vinculo das contestacoes antigas');

select is(
  (select count(*) from public.payments where event_id = '00000000-0000-0000-0000-0000000e2e01' and pago_em = (select pago_em from public.payments where id = '00000000-0000-0000-0000-0000000e2f01')),
  2::bigint,
  'o evento 1 tem dois pagamentos empatados no maior pago_em');
select is(private.vincular_contestacoes_ao_pagamento(), 2, 'so as contestacoes com um unico pagamento elegivel recebem vinculo');
select results_eq(
  $$ select coalesce(payment_id::text, '-') from public.disputes where event_id::text like '00000000-0000-0000-0000-0000000e2e%' order by event_id $$,
  $$ values ('-'), ('00000000-0000-0000-0000-0000000e2f02'), ('00000000-0000-0000-0000-0000000e2f03'), ('-'), ('00000000-0000-0000-0000-0000000e2f05') $$,
  'empate fica sem vinculo, a contratacao anterior estornada e ignorada, o vinculo existente e preservado, sem pagamento elegivel fica sem vinculo e o Pix fora de hora nao conta');
select is((select payment_id from public.disputes where id = '00000000-0000-0000-0000-0000000e2b01'), null::uuid, 'com empate no maior pago_em, o vinculo fica nulo');
select is((select payment_id from public.disputes where id = '00000000-0000-0000-0000-0000000e2b03'), '00000000-0000-0000-0000-0000000e2f03'::uuid, 'vinculo ja preenchido nao e trocado, mesmo com empate');

select is(private.vincular_contestacoes_ao_pagamento(), 0, 'rodar o vinculo de novo nao muda nada');
select results_eq(
  $$ select coalesce(payment_id::text, '-') from public.disputes where event_id::text like '00000000-0000-0000-0000-0000000e2e%' order by event_id $$,
  $$ values ('-'), ('00000000-0000-0000-0000-0000000e2f02'), ('00000000-0000-0000-0000-0000000e2f03'), ('-'), ('00000000-0000-0000-0000-0000000e2f05') $$,
  'os vinculos continuam iguais depois da segunda execucao');

select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e2f01'), 'CONFIRMADO', 'estorno de um dos pagamentos empatados e confirmado');
select results_eq(
  $$ select status, coalesce(decisao, '-'), coalesce(observacao, '-') from public.disputes where id = '00000000-0000-0000-0000-0000000e2b01' $$,
  $$ values ('ABERTA', '-', '-') $$,
  'contestacao sem vinculo por empate nao e encerrada pelo estorno');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e2f04'), 'CONFIRMADO', 'estorno do pagamento do evento sem pagamento elegivel e confirmado');
select is((select status from public.disputes where id = '00000000-0000-0000-0000-0000000e2b04'), 'ABERTA', 'contestacao sem vinculo nao e encerrada pelo estorno');

select * from finish();
rollback;
