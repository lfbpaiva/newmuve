begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c5a1', 'est-musico@example.com'),
  ('00000000-0000-0000-0000-00000000c5c1', 'est-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000c5a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c5c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c5a1', 'Musico Estorno', '75555555555', '45999990061', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c5c1', 'Bar Estorno', '75555555000175', '4532220061', 'https://x/c.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000c5e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c5c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from generate_series(1, 10) n;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000c5d' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c5e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c5a1'
from generate_series(1, 10) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000c5f' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c5e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000c5d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c5c1', 'pay_est_' || n, 550, 50, now() + interval '15 minutes'
from generate_series(1, 10) n;
select public.confirm_asaas_payment('pay_est_' || n) from generate_series(1, 10) n;

update public.payments set repasse_status = 'FALHOU' where id::text like '00000000-0000-0000-0000-0000000c5f%';

insert into public.repasse_tentativas (payment_id, origem, estado, referencia_externa, asaas_transfer_id, solicitada_em, verificacao_iniciada_em, encerrada_em) values
  ('00000000-0000-0000-0000-0000000c5f01', 'LEGADO', 'SOLICITANDO', '00000000-0000-0000-0000-0000000c5f01', null, now(), null, null),
  ('00000000-0000-0000-0000-0000000c5f02', 'LEGADO', 'PENDENTE', '00000000-0000-0000-0000-0000000c5f02', 'tra_est_2', now(), null, null),
  ('00000000-0000-0000-0000-0000000c5f03', 'LEGADO', 'INCONCLUSIVA', '00000000-0000-0000-0000-0000000c5f03', null, now(), null, null),
  ('00000000-0000-0000-0000-0000000c5f04', 'LEGADO', 'EM_VERIFICACAO', '00000000-0000-0000-0000-0000000c5f04', null, now() - interval '2 days', now(), null),
  ('00000000-0000-0000-0000-0000000c5f05', 'LEGADO', 'FALHOU', '00000000-0000-0000-0000-0000000c5f05', 'tra_est_5', now(), null, now()),
  ('00000000-0000-0000-0000-0000000c5f06', 'LEGADO', 'AUSENCIA_CONFIRMADA', '00000000-0000-0000-0000-0000000c5f06', null, now() - interval '2 days', now() - interval '2 hours', now());

select ok(not has_function_privilege('authenticated', 'public.claim_asaas_refund(uuid, text, uuid)', 'execute') and not has_function_privilege('anon', 'public.finalize_asaas_refund(uuid)', 'execute'), 'o app continua sem executar as funcoes de estorno');
select ok(has_function_privilege('service_role', 'public.claim_asaas_refund(uuid, text, uuid)', 'execute') and has_function_privilege('service_role', 'public.finalize_asaas_refund(uuid)', 'execute'), 'a API continua executando as funcoes de estorno');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c5f01', 'CANCELAR'), false, 'estorno recusado com tentativa SOLICITANDO');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c5f02', 'CANCELAR'), false, 'estorno recusado com tentativa PENDENTE');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c5f03', 'REABRIR'), false, 'estorno recusado com tentativa INCONCLUSIVA');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c5f04', 'NAO_COMPARECIMENTO'), false, 'estorno recusado com tentativa EM_VERIFICACAO');
select is((select count(*)::int from public.payments where id::text like '00000000-0000-0000-0000-0000000c5f0%' and id::text < '00000000-0000-0000-0000-0000000c5f05' and refund_status is not null), 0, 'nenhum pagamento com tentativa aberta ficou com estorno em andamento');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c5f05', 'CANCELAR'), true, 'tentativa encerrada como FALHOU nao impede o estorno');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c5f06', 'CANCELAR'), true, 'tentativa com ausencia confirmada nao impede o estorno');

update public.payments set repasse_status = 'FALHOU', repasse_asaas_id = 'tra_est_legado_7' where id = '00000000-0000-0000-0000-0000000c5f07';
update public.payments set repasse_status = 'RETIDO', repasse_asaas_id = 'tra_est_legado_8' where id = '00000000-0000-0000-0000-0000000c5f08';
select is(public.importar_repasses_legados() >= 2, true, 'legados com transferencia registrada sao importados');
select results_eq(
  $$ select estado, origem from public.repasse_tentativas where payment_id in ('00000000-0000-0000-0000-0000000c5f07', '00000000-0000-0000-0000-0000000c5f08') order by payment_id $$,
  $$ values ('INCONCLUSIVA', 'LEGADO'), ('INCONCLUSIVA', 'LEGADO') $$,
  'falho com id e retido com id viram tentativas legadas inconclusivas');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c5f07', 'CANCELAR'), false, 'legado falho com transferencia registrada nao pode ser estornado pelo app');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c5f08', 'REABRIR'), false, 'legado retido com transferencia registrada nao pode ser estornado pelo app');

update public.payments set refund_status = 'PROCESSANDO', refund_action = 'REABRIR', refund_requested_at = now() where id = '00000000-0000-0000-0000-0000000c5f03';
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000c5f03'), 'REPASSE_CONFLITANTE', 'estorno confirmado com tentativa aberta e tratado como conflito');
select results_eq(
  $$ select status::text, refund_status, repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000c5f03' $$,
  $$ values ('ESTORNADO', 'CONFIRMADO', 'FALHOU') $$,
  'o pagamento fica estornado e confirmado, preservando o estado do repasse');
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000c5e03'), 'CANCELADO', 'desistencia com tentativa aberta nao reabre o evento');
select is((select estado from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c5f03'), 'INCONCLUSIVA', 'a tentativa continua aberta para conciliacao');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000c5f03'), 'JA_PROCESSADO', 'confirmar de novo nao muda nada');

update public.events set inicio = now() - interval '1 hour' where id = '00000000-0000-0000-0000-0000000c5e07';
update public.payments set refund_status = 'PROCESSANDO', refund_action = 'NAO_COMPARECIMENTO', refund_requested_at = now() where id = '00000000-0000-0000-0000-0000000c5f07';
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000c5f07'), 'REPASSE_CONFLITANTE', 'nao comparecimento com tentativa legada aberta e conflito');
select is((select count(*)::int from public.penalties where estorno_payment_id in ('00000000-0000-0000-0000-0000000c5f03', '00000000-0000-0000-0000-0000000c5f07')), 0, 'conflito nao aplica penalidade');
select is((select visibilidade_reduzida_ate from public.musician_profiles where user_id = '00000000-0000-0000-0000-00000000c5a1'), null, 'conflito nao reduz a visibilidade do musico');
select results_eq(
  $$ select status::text, refund_status, repasse_status::text, repasse_asaas_id from public.payments where id = '00000000-0000-0000-0000-0000000c5f07' $$,
  $$ values ('ESTORNADO', 'CONFIRMADO', 'FALHOU', 'tra_est_legado_7') $$,
  'legado estornado externamente preserva repasse e transferencia registrada');

update public.payments set refund_status = 'PROCESSANDO', refund_action = 'REABRIR', refund_requested_at = now() - interval '10 days' where id = '00000000-0000-0000-0000-0000000c5f09';
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000c5f09'), 'CONFIRMADO', 'sem tentativa aberta o estorno segue o fluxo normal');
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000c5e09'), 'ABERTO', 'desistencia sem tentativa aberta reabre o evento como antes');
select is((select repasse_status from public.payments where id = '00000000-0000-0000-0000-0000000c5f09'), null, 'sem conflito o repasse deixa de existir como antes');

select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000c5f05'), 'CONFIRMADO', 'tentativa encerrada nao e conflito na confirmacao');

select * from finish();
rollback;
