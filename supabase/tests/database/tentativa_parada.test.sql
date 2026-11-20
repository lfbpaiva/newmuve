begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c7a1', 'par-musico@example.com'),
  ('00000000-0000-0000-0000-00000000c7c1', 'par-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000c7a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c7c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c7a1', 'Musico Parada', '77777777777', '45999990081', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c7c1', 'Bar Parada', '77777777000177', '4532220081', 'https://x/c.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000c7e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c7c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from generate_series(1, 4) n;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000c7d' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c7e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c7a1'
from generate_series(1, 4) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000c7f' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c7e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000c7d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c7c1', 'pay_par_' || n, 550, 50, now() + interval '15 minutes'
from generate_series(1, 4) n;
select public.confirm_asaas_payment('pay_par_' || n) from generate_series(1, 4) n;
insert into public.penalties (id, musician_id, tipo, multa) values
  ('00000000-0000-0000-0000-0000000c7a01', '00000000-0000-0000-0000-00000000c7a1', 'AUSENCIA', 100);

create function pg_temp.tentativa(p_pagamento uuid) returns uuid language sql as $$
  select id from public.repasse_tentativas where payment_id = p_pagamento and encerrada_em is null;
$$;

select has_column('public', 'repasse_tentativas', 'pedido_enviado_em', 'tentativa guarda quando o pedido foi enviado');
select ok(
  has_function_privilege('service_role', 'public.registrar_pedido_enviado(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.marcar_tentativa_parada(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_pedido_enviado(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.marcar_tentativa_parada(uuid)', 'execute'),
  'so a API executa o registro de envio e a marcacao de parada');

select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c7f01')), null, 'tentativa criada');
select is((select pedido_enviado_em from public.repasse_tentativas where id = pg_temp.tentativa('00000000-0000-0000-0000-0000000c7f01')), null, 'tentativa nova nasce sem envio registrado');
select is(public.marcar_tentativa_parada(pg_temp.tentativa('00000000-0000-0000-0000-0000000c7f01')), 'SEM_MUDANCA', 'solicitacao recente nao e tratada como parada');
update public.repasse_tentativas set solicitada_em = now() - interval '11 minutes' where payment_id = '00000000-0000-0000-0000-0000000c7f01';
create temp table parada_sem_envio as select pg_temp.tentativa('00000000-0000-0000-0000-0000000c7f01') as id;
select is(public.marcar_tentativa_parada((select id from parada_sem_envio)), 'FALHOU', 'solicitacao parada sem envio registrado e encerrada como falha');
select results_eq(
  $$ select t.estado, t.encerrada_em is not null, p.repasse_status::text, p.multa_descontada from public.repasse_tentativas t join public.payments p on p.id = t.payment_id where t.id = (select id from parada_sem_envio) $$,
  $$ values ('FALHOU', true, 'FALHOU', 0.00::numeric(10, 2)) $$,
  'pagamento liberado para nova tentativa, sem desconto pendente');
select is((select reserva_payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000c7a01'), null, 'a multa reservada volta a ficar livre');
select is(public.registrar_pedido_enviado((select id from parada_sem_envio)), false, 'tentativa encerrada nao aceita registro de envio');
select is(public.marcar_tentativa_parada((select id from parada_sem_envio)), 'SEM_MUDANCA', 'marcar de novo nao muda nada');
select public.reabrir_repasses_falhos((select e.musico_contratado_id from public.events e join public.payments p on p.event_id = e.id where p.id = '00000000-0000-0000-0000-0000000c7f01'));
select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c7f01')), null, 'depois da troca da chave, uma nova tentativa pode ser criada');

select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c7f02')), null, 'tentativa do segundo pagamento criada');
select is(public.registrar_pedido_enviado(pg_temp.tentativa('00000000-0000-0000-0000-0000000c7f02')), true, 'envio registrado antes de chamar a Asaas');
select isnt((select pedido_enviado_em from public.repasse_tentativas where id = pg_temp.tentativa('00000000-0000-0000-0000-0000000c7f02')), null, 'o horario do envio fica gravado');
select is(public.registrar_pedido_enviado(pg_temp.tentativa('00000000-0000-0000-0000-0000000c7f02')), true, 'registrar de novo e idempotente');
update public.repasse_tentativas set solicitada_em = now() - interval '11 minutes' where payment_id = '00000000-0000-0000-0000-0000000c7f02';
create temp table parada_com_envio as select pg_temp.tentativa('00000000-0000-0000-0000-0000000c7f02') as id;
select is(public.marcar_tentativa_parada((select id from parada_com_envio)), 'INCONCLUSIVA', 'solicitacao parada com envio registrado fica inconclusiva');
select results_eq(
  $$ select t.estado, t.encerrada_em is null, p.repasse_status::text from public.repasse_tentativas t join public.payments p on p.id = t.payment_id where t.id = (select id from parada_com_envio) $$,
  $$ values ('INCONCLUSIVA', true, 'PROCESSANDO') $$,
  'a tentativa continua aberta e o repasse em processamento');
select results_eq(
  $$ select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c7f02') $$,
  $$ values (null::uuid) $$,
  'tentativa inconclusiva impede uma nova transferencia');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c7f02', 'CANCELAR'), false, 'tentativa inconclusiva impede o estorno');
update public.payments set repasse_status = 'FALHOU' where id = '00000000-0000-0000-0000-0000000c7f02';
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c7f02', 'CANCELAR'), false, 'mesmo com o repasse marcado como falho, a tentativa aberta impede o estorno');
update public.payments set repasse_status = 'PROCESSANDO' where id = '00000000-0000-0000-0000-0000000c7f02';
select is(public.falhar_tentativa((select id from parada_com_envio), null), false, 'inconclusiva nao pode ser encerrada como falha sem a transferencia');
select is(public.registrar_pedido_enviado((select id from parada_com_envio)), false, 'tentativa inconclusiva nao aceita novo registro de envio');

select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c7f03')), null, 'tentativa do terceiro pagamento criada');
select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c7f04')), null, 'tentativa do quarto pagamento criada');
select public.registrar_pedido_enviado(pg_temp.tentativa('00000000-0000-0000-0000-0000000c7f04'));
update public.repasse_tentativas set solicitada_em = now() - interval '11 minutes' where payment_id in ('00000000-0000-0000-0000-0000000c7f03', '00000000-0000-0000-0000-0000000c7f04');
select is(public.marcar_solicitacoes_paradas() >= 2, true, 'a rotina trata todas as solicitacoes paradas');
select results_eq(
  $$ select p.asaas_payment_id, t.estado from public.repasse_tentativas t join public.payments p on p.id = t.payment_id
     where p.id in ('00000000-0000-0000-0000-0000000c7f03', '00000000-0000-0000-0000-0000000c7f04') order by p.asaas_payment_id $$,
  $$ values ('pay_par_3', 'FALHOU'), ('pay_par_4', 'INCONCLUSIVA') $$,
  'sem envio vira falha e com envio vira inconclusiva');
select is(public.marcar_tentativa_parada(gen_random_uuid()), 'SEM_MUDANCA', 'tentativa inexistente');

select * from finish();
rollback;
