begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e3a1', 'reab-musico@example.com'),
  ('00000000-0000-0000-0000-00000000e3c1', 'reab-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000e3a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000e3c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000e3a1', 'Musico Reabertura', '73333333333', '45999990031', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000e3c1', 'Bar Reabertura', '73333333000131', '4532220031', 'https://x/c.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000e3e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e3c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from generate_series(1, 7) n;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000e3d' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e3e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e3a1'
from generate_series(1, 7) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000e3f' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e3e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000e3d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e3c1', 'pay_reab_' || n, 550, 50, now() + interval '15 minutes'
from generate_series(1, 7) n;
select public.confirm_asaas_payment('pay_reab_' || n) from generate_series(1, 7) n;
select public.abrir_contestacao(('00000000-0000-0000-0000-0000000e3e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e3c1', 'O show não aconteceu como combinado.')
from generate_series(1, 7) n;
select public.decidir_contestacao(d.id, 'DEVOLVER_CONTRATANTE', 'Decisao do suporte')
from public.disputes d where d.event_id::text like '00000000-0000-0000-0000-0000000e3e%' and d.event_id <> '00000000-0000-0000-0000-0000000e3e07';
select public.claim_asaas_refund(('00000000-0000-0000-0000-0000000e3f' || lpad(n::text, 2, '0'))::uuid, 'NAO_COMPARECIMENTO', (select d.id from public.disputes d where d.event_id = ('00000000-0000-0000-0000-0000000e3e' || lpad(n::text, 2, '0'))::uuid)) from generate_series(1, 7) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000e39' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e3e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000e3d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e3c1', 'pay_reab_sec_' || n, 550, 50, now() - interval '1 minute'
from generate_series(1, 7) n;
update public.payments set status = 'EXPIRADO' where asaas_payment_id like 'pay_reab_sec_%';
select public.claim_asaas_refund(('00000000-0000-0000-0000-0000000e39' || lpad(n::text, 2, '0'))::uuid, 'NENHUMA') from generate_series(1, 7) n;
update public.disputes set payment_id = null where event_id = '00000000-0000-0000-0000-0000000e3e05';

create temp view contestacao_do_evento as
select right(d.event_id::text, 2) as ev, d.status, coalesce(d.decisao, '-') as decisao, coalesce(d.observacao, '-') as observacao
from public.disputes d where d.event_id::text like '00000000-0000-0000-0000-0000000e3e%';

select ok(
  not has_function_privilege('service_role', 'private.reabrir_contestacao_do_pagamento(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.reabrir_contestacao_do_pagamento(uuid)', 'execute'),
  'a reabertura pelo pagamento e interna');

select is(public.negar_estorno('00000000-0000-0000-0000-0000000e3901'), null::uuid, 'negar o estorno de outro pagamento do evento nao reabre contestacao');
select results_eq(
  $$ select status, decisao, observacao from contestacao_do_evento where ev = '01' $$,
  $$ values ('AGUARDANDO_ESTORNO', 'DEVOLVER_CONTRATANTE', 'Decisao do suporte') $$,
  'a contestacao do pagamento contratado continua aguardando o estorno, com a decisao do suporte');
select is((select refund_status from public.payments where id = '00000000-0000-0000-0000-0000000e3901'), 'NEGADO', 'o estorno secundario fica negado');
select is(public.decidir_contestacao((select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e3e01'), 'PAGAR_MUSICO', null), 'JA_DECIDIDA', 'a decisao do suporte nao pode ser trocada depois da negativa secundaria');
select results_eq(
  $$ select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000e3f01') $$,
  $$ values (null::uuid) $$,
  'o repasse continua bloqueado');

select is(public.liberar_estorno('00000000-0000-0000-0000-0000000e3902', null, null), null::uuid, 'liberar o estorno de outro pagamento do evento nao reabre contestacao');
select results_eq(
  $$ select status, decisao from contestacao_do_evento where ev = '02' $$,
  $$ values ('AGUARDANDO_ESTORNO', 'DEVOLVER_CONTRATANTE') $$,
  'a contestacao do pagamento contratado continua aguardando o estorno depois da liberacao secundaria');

select is(public.negar_estorno('00000000-0000-0000-0000-0000000e3f03'), (select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e3e03'), 'negar o estorno do pagamento contratado reabre a contestacao dele');
select results_eq(
  $$ select status, decisao, observacao from contestacao_do_evento where ev = '03' $$,
  $$ values ('ABERTA', '-', 'Decisao do suporte') $$,
  'a contestacao volta para analise sem decisao, com a observacao do suporte');

select is(public.liberar_estorno('00000000-0000-0000-0000-0000000e3f04', null, null), (select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e3e04'), 'liberar o estorno do pagamento contratado reabre a contestacao dele');
select is((select status from contestacao_do_evento where ev = '04'), 'ABERTA', 'a contestacao volta para analise depois da liberacao do contratado');

select is(public.negar_estorno('00000000-0000-0000-0000-0000000e3901'), null::uuid, 'repetir a negativa secundaria nao muda nada');
select is(public.negar_estorno('00000000-0000-0000-0000-0000000e3f01'), (select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e3e01'), 'a negativa verdadeira do contratado, depois da secundaria, ainda reabre a contestacao');
select is(public.negar_estorno('00000000-0000-0000-0000-0000000e3f01'), null::uuid, 'repetir a negativa do contratado nao reabre de novo');
select is(public.liberar_estorno('00000000-0000-0000-0000-0000000e3f04', null, null), null::uuid, 'repetir a liberacao do contratado nao reabre de novo');

select is(public.negar_estorno('00000000-0000-0000-0000-0000000e3f05'), null::uuid, 'negativa do estorno nao reabre contestacao sem vinculo');
select results_eq(
  $$ select status, decisao from contestacao_do_evento where ev = '05' $$,
  $$ values ('AGUARDANDO_ESTORNO', 'DEVOLVER_CONTRATANTE') $$,
  'a contestacao sem vinculo continua aguardando o estorno');
select is(public.decidir_contestacao((select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e3e05'), 'DEVOLVER_CONTRATANTE', null), 'RETOMADA', 'o suporte ainda pode retomar a contestacao sem vinculo');

select is(public.negar_estorno('00000000-0000-0000-0000-0000000e3906'), null::uuid, 'negativa secundaria antes da confirmacao do contratado');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e3f06'), 'CONFIRMADO', 'o estorno do contratado confirma');
select results_eq(
  $$ select status, decisao, observacao from contestacao_do_evento where ev = '06' $$,
  $$ values ('RESOLVIDA', 'DEVOLVER_CONTRATANTE', 'Decisao do suporte') $$,
  'a contestacao e encerrada pela decisao do suporte, sem a observacao de estorno fora da decisao');

select is(public.negar_estorno('00000000-0000-0000-0000-0000000e3f07'), null::uuid, 'negativa do contratado nao mexe em contestacao aberta');
select is(public.liberar_estorno('00000000-0000-0000-0000-0000000e3907', null, null), null::uuid, 'liberacao secundaria nao mexe em contestacao aberta');
select results_eq(
  $$ select status, decisao from contestacao_do_evento where ev = '07' $$,
  $$ values ('ABERTA', '-') $$,
  'a contestacao aberta continua aberta');

select * from finish();
rollback;
