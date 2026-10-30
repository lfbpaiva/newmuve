-- Intenção única e transições atômicas de repasses Pix (pgTAP).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'payout-musician@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'payout-contractor@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000a1', 'Músico Repasse', '11111111111', '45999990001', 'https://x/a1.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000c1', 'Contratante Repasse', '11111111000111', '4532220001', 'https://x/c1.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Repasse um', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e1.png'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'Repasse dois', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e2.png');
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'pay_payout_one', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'pay_payout_two', 550, 50, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_payout_one');
select public.confirm_asaas_payment('pay_payout_two');

create temp table _payout_one as
select public.reserve_payout_intent(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000a1', 500, 'm1@example.com', 'EMAIL'
) as id;
select ok((select id is not null from _payout_one), 'identificador interno existe antes do POST');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000000f1'), 'PROCESSANDO', 'reserva marca pagamento em processamento');
select ok(public.reserve_payout_intent(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000a1', 500, 'm1@example.com', 'EMAIL'
) is null, 'chamada concorrente não reserva outra intenção');
select throws_ok($$
  insert into public.payout_intents
    (payment_id, event_id, musician_id, amount, pix_key, pix_key_type, state)
  values
    ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
     '00000000-0000-0000-0000-0000000000a1', 500, 'm1@example.com', 'EMAIL', 'RESERVADO')
$$, '23505', null, 'restrição única impede segunda intenção para o mesmo pagamento');
select is(public.mark_payout_sent((select id from _payout_one)), true, 'primeiro envio é autorizado');
select is(public.mark_payout_sent((select id from _payout_one)), false, 'segundo envio é bloqueado');
select is(public.link_payout_transfer((select id from _payout_one), 'tra_payout_one'), true, 'ID da Asaas fica ligado à intenção');
select is(public.apply_payout_transfer(
  (select id from _payout_one), 'tra_payout_one', (select id::text from _payout_one),
  'PENDING', 500, 'PIX', 'm1@example.com'
), 'PENDENTE', 'transferência pendente não é concluída');
select is(public.apply_payout_transfer(
  (select id from _payout_one), 'tra_payout_one', (select id::text from _payout_one),
  'DONE', 500, 'PIX', 'm1@example.com'
), 'CONCLUIDO', 'transferência validada como DONE conclui');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000000f1'), 'REPASSADO', 'pagamento acompanha conclusão');
select is(public.apply_payout_transfer(
  (select id from _payout_one), 'tra_payout_one', (select id::text from _payout_one),
  'FAILED', 500, 'PIX', 'm1@example.com'
), 'CONCILIACAO', 'evento incompatível posterior exige conciliação');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000000f1'), 'REPASSADO', 'falha tardia não sobrescreve repasse concluído');
select is((select state from public.payout_intents where id = (select id from _payout_one)), 'CONCLUIDO', 'divergência preserva estado definitivo');
select is((select reconciliation_required from public.payout_intents where id = (select id from _payout_one)), true, 'divergência sinaliza conciliação');
select ok(public.reserve_payout_intent(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000a1', 500, 'm1@example.com', 'EMAIL'
) is null, 'obrigação concluída nunca cria segunda intenção');

create temp table _payout_two as
select public.reserve_payout_intent(
  '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2',
  '00000000-0000-0000-0000-0000000000a1', 500, 'm1@example.com', 'EMAIL'
) as id;
select is(public.mark_payout_sent((select id from _payout_two)), true, 'segunda obrigação tem seu próprio envio');
select public.mark_payout_unknown((select id from _payout_two));
select is((select state from public.payout_intents where id = (select id from _payout_two)), 'CONCILIACAO', 'timeout mantém operação inconclusiva');
select is(public.link_payout_transfer((select id from _payout_two), 'tra_payout_one'), false, 'ID de transferência não pode servir duas obrigações');
select ok(public.reserve_payout_intent(
  '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2',
  '00000000-0000-0000-0000-0000000000a1', 500, 'm1@example.com', 'EMAIL'
) is null, 'timeout não libera novo POST');
select is(public.apply_payout_transfer(
  (select id from _payout_two), 'tra_payout_two', (select id::text from _payout_two),
  'DONE', 1, 'PIX', 'm1@example.com'
), 'CONCILIACAO', 'valor divergente não marca repasse concluído');
select is(public.apply_payout_transfer(
  '00000000-0000-0000-0000-000000000099', 'tra_unknown', 'unknown',
  'DONE', 500, 'PIX', 'm1@example.com'
), 'DESCONHECIDO', 'transferência desconhecida não altera pagamentos');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok($$ select public.mark_payout_sent('00000000-0000-0000-0000-000000000099'::uuid) $$, '42501', null, 'cliente não pode autorizar repasse');
reset role;
select * from finish();
rollback;
