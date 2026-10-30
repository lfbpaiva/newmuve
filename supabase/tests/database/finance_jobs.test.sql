-- Leases, lotes e conclusão por prazo. Execute somente após aplicar as migrations 03A-03C.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'finance-musician@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'finance-contractor@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade)
values ('00000000-0000-0000-0000-0000000000a1', 'Músico', '11111111111', '45999990001', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade)
values ('00000000-0000-0000-0000-0000000000c1', 'Bar', '11111111000111', '4532220001', 'https://x/c.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Evento pago', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e1.png'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'Evento vencido', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e2.png'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1', 'Evento com estorno', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e3.png');
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a1');
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'pay_finance_paid', 500, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'pay_finance_expired', 500, now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c1', 'pay_finance_refund', 500, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_finance_paid');
select public.confirm_asaas_payment('pay_finance_refund');

create temp table _run as select public.begin_finance_run('EXPIRACAO', 5, 30) as id;
select ok((select id is not null from _run), 'execução recebe lease persistente');
select ok(public.begin_finance_run('EXPIRACAO', 5, 30) is null, 'segunda execução simultânea é recusada');
create temp table _claimed as select * from public.claim_finance_items('EXPIRACAO', (select id from _run), 20, 20);
select is((select count(*)::integer from _claimed), 1, 'banco encontra cobrança vencida pelo seu relógio');
select is((select count(*)::integer from public.claim_finance_items('EXPIRACAO', (select id from _run), 20, 20)), 0, 'item com lease não é entregue duas vezes');
select is(public.finish_finance_item('EXPIRACAO', (select entity_id from _claimed), (select id from _run),
  'CONCLUIDO', 0, 'DELETED', null, null, null), true, 'resultado do item é persistido');
select is(public.finish_finance_run('EXPIRACAO', (select id from _run), 1, 1, 1, 0, 0, 0), true, 'execução registra contagens');
select ok((select last_success_at is not null from public.finance_job_control where kind = 'EXPIRACAO'), 'última execução bem-sucedida é persistida');
select ok(public.begin_finance_run('EXPIRACAO', 5, 30) is null, 'intervalo mínimo é respeitado');
update public.finance_job_control set last_started_at = clock_timestamp() - interval '10 minutes' where kind = 'EXPIRACAO';
create temp table _run_two as select public.begin_finance_run('EXPIRACAO', 5, 30) as id;
select is((select count(*)::integer from public.claim_finance_items('EXPIRACAO', (select id from _run_two), 20, 20)), 0, 'item concluído não volta ao lote');

update public.events set inicio = clock_timestamp() - interval '8 days', confirmacao_musico = true
where id = '00000000-0000-0000-0000-0000000000e1';
update public.payments set refund_status = 'PROCESSANDO' where id = '00000000-0000-0000-0000-0000000000f1';
select is(public.conclude_event_if_due('00000000-0000-0000-0000-0000000000e1'), false, 'estorno impede conclusão');
update public.payments set refund_status = null where id = '00000000-0000-0000-0000-0000000000f1';
select is(public.conclude_event_if_due('00000000-0000-0000-0000-0000000000e1'), true, 'uma confirmação após sete dias conclui');
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000000e1'), 'CONCLUIDO', 'evento foi concluído uma única vez');
select is(public.conclude_event_if_due('00000000-0000-0000-0000-0000000000e1'), false, 'repetição não conclui novamente');

select public.mark_late_payment_detected('00000000-0000-0000-0000-0000000000f2');
select ok((select late_payment_detected_at is not null from public.payments where id = '00000000-0000-0000-0000-0000000000f2'), 'valor recebido fora da contratação fica rastreado');

create temp table _finance_payout as
select public.reserve_payout_intent(
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000a1',
  500, 'm@example.com', 'EMAIL'
) as id;
select ok((select id is not null from _finance_payout), 'intenção de repasse reservada para conciliação');
select is(public.mark_payout_sent((select id from _finance_payout)), true, 'repasse tem um único envio autorizado');
select is(public.apply_payout_transfer(
  (select id from _finance_payout), 'tra_finance_one', (select id::text from _finance_payout),
  'DONE', 500, 'PIX', 'm@example.com'
), 'CONCLUIDO', 'repasse concluído e validado');
insert into public.finance_work_items(kind, entity_id, state)
values ('REPASSE', (select id from _finance_payout), 'CONCLUIDO');
select is(public.apply_payout_transfer(
  (select id from _finance_payout), 'tra_finance_one', (select id::text from _finance_payout),
  'FAILED', 500, 'PIX', 'm@example.com'
), 'CONCILIACAO', 'divergência posterior preserva repasse efetivo');
select is((select state from public.finance_work_items
  where kind = 'REPASSE' and entity_id = (select id from _finance_payout)),
  'PENDENTE', 'divergência reabre item antes encerrado para conciliação');
select is((select state from public.payout_intents where id = (select id from _finance_payout)),
  'CONCLUIDO', 'reabertura do job não sobrescreve estado definitivo do repasse');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000000f3', 'CANCELAR'),
  true, 'primeiro pedido de estorno é reservado');
update public.payments set refund_status = 'NEGADO'
where id = '00000000-0000-0000-0000-0000000000f3';
insert into public.finance_work_items(kind, entity_id, state)
values ('ESTORNO', '00000000-0000-0000-0000-0000000000f3', 'MANUAL');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000000f3', 'CANCELAR'),
  true, 'novo pedido após falha definitiva é reservado');
select is((select state from public.finance_work_items
  where kind = 'ESTORNO' and entity_id = '00000000-0000-0000-0000-0000000000f3'),
  'PENDENTE', 'novo pedido reabre apenas a consulta de conciliação');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000000f3', 'CANCELAR'),
  false, 'pedido em processamento não é duplicado');

insert into public.finance_work_items(kind, entity_id, next_check_at)
values ('TARDIO', '00000000-0000-0000-0000-0000000000f9', clock_timestamp() - interval '1 minute');
create temp table _stale_run as select public.begin_finance_run('TARDIO', 1, 1) as id;
select ok((select id is not null from _stale_run), 'execução inicial obtém lease');
create temp table _stale_item as
select * from public.claim_finance_items('TARDIO', (select id from _stale_run), 1, 1);
select is((select entity_id from _stale_item),
  '00000000-0000-0000-0000-0000000000f9'::uuid, 'item fica reservado na primeira execução');
update public.finance_job_control
set lease_until = clock_timestamp() - interval '1 minute',
    last_started_at = clock_timestamp() - interval '2 minutes'
where kind = 'TARDIO';
update public.finance_work_items
set lease_until = clock_timestamp() - interval '1 minute'
where kind = 'TARDIO' and entity_id = '00000000-0000-0000-0000-0000000000f9';
create temp table _recovered_run as select public.begin_finance_run('TARDIO', 1, 1) as id;
select ok((select id is not null and id <> (select id from _stale_run) from _recovered_run),
  'novo processo recupera o lease vencido');
select is(public.finish_finance_item(
  'TARDIO', '00000000-0000-0000-0000-0000000000f9', (select id from _stale_run),
  'CONCLUIDO', 0, null, null, null, null),
  false, 'processo interrompido não finaliza o item recuperado');
select is((select entity_id from public.claim_finance_items(
  'TARDIO', (select id from _recovered_run), 1, 1)),
  '00000000-0000-0000-0000-0000000000f9'::uuid,
  'item retorna ao lote após interrupção');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok($$ select public.begin_finance_run('EXPIRACAO', 5, 30) $$, '42501', null, 'cliente não inicia job financeiro');
select throws_ok($$ select public.mark_late_payment_detected('00000000-0000-0000-0000-0000000000f2') $$,
  '42501', null, 'cliente não marca recebimento financeiro');
reset role;
select * from finish();
rollback;
