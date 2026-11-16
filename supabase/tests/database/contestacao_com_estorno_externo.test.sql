begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e1a1', 'ext-musico@example.com'),
  ('00000000-0000-0000-0000-00000000e1c1', 'ext-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000e1a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000e1c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000e1a1', 'Musico Estorno Externo', '78888888888', '45999990081', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000e1c1', 'Bar Estorno Externo', '78888888000181', '4532220081', 'https://x/c.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000e1e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e1c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from generate_series(1, 5) n;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000e1d' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e1e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e1a1'
from generate_series(1, 5) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000e1f' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e1e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000e1d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e1c1', 'pay_ext_' || n, 550, 50, now() + interval '15 minutes'
from generate_series(1, 5) n;
select public.confirm_asaas_payment('pay_ext_' || n) from generate_series(1, 5) n;
insert into public.disputes (id, event_id, payment_id, aberta_por, motivo)
select ('00000000-0000-0000-0000-0000000e1b' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e1e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000e1f' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e1c1', 'O show não aconteceu como combinado.'
from generate_series(1, 3) n;
select public.abrir_contestacao(('00000000-0000-0000-0000-0000000e1e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e1c1', 'O show não aconteceu como combinado.')
from generate_series(4, 5) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000e19' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e1e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000e1d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e1c1', 'pay_ext_sec_' || n, 550, 50, now() - interval '1 minute'
from generate_series(4, 5) n;
update public.payments set status = 'EXPIRADO' where asaas_payment_id like 'pay_ext_sec_%';

select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e1f01'), 'CONFIRMADO', 'estorno feito no painel da Asaas e confirmado com contestacao aberta');
select results_eq(
  $$ select status, decisao, resolvida_em is not null, observacao from public.disputes where id = '00000000-0000-0000-0000-0000000e1b01' $$,
  $$ values ('RESOLVIDA', 'DEVOLVER_CONTRATANTE', true, 'Valor devolvido ao contratante por estorno confirmado fora da decisão do suporte.') $$,
  'a contestacao aberta e encerrada como devolvida ao contratante, na mesma transacao');
select results_eq(
  $$ select p.status::text, p.refund_status::text, e.status::text from public.payments p join public.events e on e.id = p.event_id where p.id = '00000000-0000-0000-0000-0000000e1f01' $$,
  $$ values ('ESTORNADO', 'CONFIRMADO', 'CANCELADO') $$,
  'pagamento e evento seguem o estorno externo como antes');
select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000e1b01', 'DEVOLVER_CONTRATANTE', null), 'JA_DECIDIDA', 'o suporte nao deixa mais a contestacao presa aguardando um estorno impossivel');
select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000e1b01', 'PAGAR_MUSICO', null), 'JA_DECIDIDA', 'o suporte nao decide pagar o musico com o valor ja devolvido');
select is((select count(*) from public.disputes where event_id = '00000000-0000-0000-0000-0000000e1e01' and status in ('ABERTA', 'AGUARDANDO_ESTORNO')), 0::bigint, 'nenhuma contestacao pendente sobra no evento');
select is((select count(*) from public.penalties where event_id = '00000000-0000-0000-0000-0000000e1e01'), 0::bigint, 'estorno externo continua sem penalidade');

select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e1f01'), 'JA_PROCESSADO', 'webhook repetido do estorno externo nao reprocessa');
select is((select observacao from public.disputes where id = '00000000-0000-0000-0000-0000000e1b01'), 'Valor devolvido ao contratante por estorno confirmado fora da decisão do suporte.', 'webhook repetido nao duplica a observacao');

select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000e1b02', 'DEVOLVER_CONTRATANTE', 'Ausencia comprovada'), 'DECIDIDA', 'suporte decide devolver');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e1f02', 'NAO_COMPARECIMENTO', '00000000-0000-0000-0000-0000000e1b02'), true, 'o estorno da decisao e pedido');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e1f02'), 'CONFIRMADO', 'estorno da decisao confirmado');
select results_eq(
  $$ select status, decisao, observacao from public.disputes where id = '00000000-0000-0000-0000-0000000e1b02' $$,
  $$ values ('RESOLVIDA', 'DEVOLVER_CONTRATANTE', 'Ausencia comprovada') $$,
  'contestacao aguardando estorno encerra como antes, com a observacao do suporte preservada');

select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000e1b03', 'PAGAR_MUSICO', 'Show realizado'), 'DECIDIDA', 'suporte decide pagar o musico');
select public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e1f03');
select results_eq(
  $$ select status, decisao, observacao from public.disputes where id = '00000000-0000-0000-0000-0000000e1b03' $$,
  $$ values ('RESOLVIDA', 'PAGAR_MUSICO', 'Show realizado') $$,
  'contestacao ja resolvida nao e alterada por um estorno posterior');

select results_eq(
  $$ select d.payment_id from public.disputes d where d.event_id in ('00000000-0000-0000-0000-0000000e1e04', '00000000-0000-0000-0000-0000000e1e05') order by d.event_id $$,
  $$ values ('00000000-0000-0000-0000-0000000e1f04'::uuid), ('00000000-0000-0000-0000-0000000e1f05'::uuid) $$,
  'a contestacao fica vinculada ao pagamento pago que ela travou ao abrir');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e1904', 'NENHUMA'), true, 'devolucao do pagamento secundario, pago fora de hora, e pedida');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e1904'), 'CONFIRMADO', 'estorno do pagamento secundario e confirmado');
select results_eq(
  $$ select d.status, d.decisao, d.observacao, p.status::text from public.disputes d join public.payments p on p.id = d.payment_id where d.event_id = '00000000-0000-0000-0000-0000000e1e04' $$,
  $$ values ('ABERTA', null::text, null::text, 'PAGO') $$,
  'estorno de outro pagamento do mesmo evento nao encerra a contestacao aberta do pagamento contratado');
select results_eq(
  $$ select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000e1f04') $$,
  $$ values (null::uuid) $$,
  'a contestacao aberta continua bloqueando o repasse');

select is(public.decidir_contestacao((select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e1e05'), 'DEVOLVER_CONTRATANTE', 'Ausencia comprovada'), 'DECIDIDA', 'suporte decide devolver o pagamento contratado');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e1f05', 'NAO_COMPARECIMENTO', (select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e1e05')), true, 'o estorno do pagamento contratado e pedido');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e1905', 'NENHUMA'), true, 'devolucao do pagamento secundario e pedida');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e1905'), 'CONFIRMADO', 'estorno do pagamento secundario e confirmado antes do contratado');
select results_eq(
  $$ select d.status, d.decisao, d.observacao from public.disputes d where d.event_id = '00000000-0000-0000-0000-0000000e1e05' $$,
  $$ values ('AGUARDANDO_ESTORNO', 'DEVOLVER_CONTRATANTE', 'Ausencia comprovada') $$,
  'estorno de outro pagamento nao encerra a contestacao aguardando o estorno do contratado');
select results_eq(
  $$ select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000e1f05') $$,
  $$ values (null::uuid) $$,
  'o repasse continua bloqueado aguardando o estorno do contratado');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000e1f05'), 'CONFIRMADO', 'estorno do pagamento contratado e confirmado');
select results_eq(
  $$ select d.status, d.decisao, d.observacao from public.disputes d where d.event_id = '00000000-0000-0000-0000-0000000e1e05' $$,
  $$ values ('RESOLVIDA', 'DEVOLVER_CONTRATANTE', 'Ausencia comprovada') $$,
  'so o estorno do pagamento vinculado encerra a contestacao');

select * from finish();
rollback;
