begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'refund-musico@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'refund-outro@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'refund-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000a1', 'Musico Um', '11111111111', '45999990001', 'https://x/a1.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000000a2', 'Musico Dois', '22222222222', '45999990002', 'https://x/a2.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000c1', 'Bar Um', '11111111000111', '4532220001', 'https://x/c1.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Show de teste', 'Bar e restaurante', now() + interval '7 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e1.png');
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2');
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'pay_refund_test', 550, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_refund_test');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000000f1', 'REABRIR'), true, 'primeiro pedido reserva o estorno');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000000f1', 'REABRIR'), false, 'pedido duplicado nao reserva outro estorno');
select is((select refund_status from public.payments where asaas_payment_id = 'pay_refund_test'), 'PROCESSANDO', 'estorno fica em processamento');
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000000e1'), 'CONTRATADO', 'evento permanece contratado antes da confirmacao');
update public.payments set refund_status = 'NEGADO' where asaas_payment_id = 'pay_refund_test';
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000000f1', 'REABRIR'), true, 'recusa explicita permite nova tentativa');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000000f1'), 'CONFIRMADO', 'confirmacao finaliza em uma transacao');
select results_eq(
  $$ select status::text, refund_status from public.payments where asaas_payment_id = 'pay_refund_test' $$,
  $$ values ('ESTORNADO', 'CONFIRMADO') $$,
  'pagamento so fica estornado apos confirmacao');
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000000e1'), 'ABERTO', 'evento volta a receber candidatos');
select results_eq(
  $$ select musician_id from public.event_candidates where event_id = '00000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'candidatura do desistente e removida');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000000f1'), 'JA_PROCESSADO', 'confirmacao repetida e idempotente');

insert into public.payments (event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'pay_late_cancelled', 550, now(), 'CANCELADO');
select is(public.confirm_asaas_payment('pay_late_cancelled'), 'EVENTO_INDISPONIVEL', 'cobranca cancelada paga tardiamente nao contrata');

select * from finish();
rollback;
