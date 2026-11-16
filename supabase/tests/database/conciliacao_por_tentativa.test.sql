begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c8a1', 'conc3-musico-a@example.com'),
  ('00000000-0000-0000-0000-00000000c8a2', 'conc3-musico-b@example.com'),
  ('00000000-0000-0000-0000-00000000c8a3', 'conc3-musico-c@example.com'),
  ('00000000-0000-0000-0000-00000000c8c1', 'conc3-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000c8a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c8a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c8a3', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c8c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade)
select ('00000000-0000-0000-0000-00000000c8a' || n)::uuid, 'Musico Conciliacao ' || n, '8888888888' || n, '4599999008' || n, 'https://x/a.png', '{Rock}', 'PR', 'Cascavel'
from generate_series(1, 3) n;
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c8c1', 'Bar Conciliacao', '88888888000188', '4532220088', 'https://x/c.png', 'PR', 'Cascavel');

create temp table cenario (n int, musico uuid);
insert into cenario values
  (1, '00000000-0000-0000-0000-00000000c8a1'),
  (2, '00000000-0000-0000-0000-00000000c8a2'),
  (3, '00000000-0000-0000-0000-00000000c8a1'),
  (4, '00000000-0000-0000-0000-00000000c8a3');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000c8e0' || n)::uuid, '00000000-0000-0000-0000-00000000c8c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from cenario;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000c8d0' || n)::uuid, ('00000000-0000-0000-0000-0000000c8e0' || n)::uuid, musico
from cenario;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000c8f0' || n)::uuid, ('00000000-0000-0000-0000-0000000c8e0' || n)::uuid,
  ('00000000-0000-0000-0000-0000000c8d0' || n)::uuid, '00000000-0000-0000-0000-00000000c8c1', 'pay_c3_' || n, 550, 50, now() + interval '15 minutes'
from cenario;
select public.confirm_asaas_payment('pay_c3_' || n) from cenario;

insert into public.penalties (id, musician_id, tipo, multa, created_at) values
  ('00000000-0000-0000-0000-0000000c8b11', '00000000-0000-0000-0000-00000000c8a1', 'AUSENCIA', 40, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000c8b12', '00000000-0000-0000-0000-00000000c8a1', 'AUSENCIA', 10, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000c8b21', '00000000-0000-0000-0000-00000000c8a2', 'AUSENCIA', 40, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000c8b22', '00000000-0000-0000-0000-00000000c8a2', 'AUSENCIA', 10, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000c8b31', '00000000-0000-0000-0000-00000000c8a3', 'AUSENCIA', 40, now() - interval '2 days');

create function pg_temp.pagamento(p_n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000c8f0' || p_n)::uuid;
$$;
create function pg_temp.tentativa(p_n int) returns uuid language sql as $$
  select id from public.repasse_tentativas where payment_id = pg_temp.pagamento(p_n) order by created_at desc, id limit 1;
$$;
create function pg_temp.estado_final(p_n int) returns table (
  tentativa text, pagamento text, estorno text, repasse text, retido numeric, evento text, reservadas bigint, quitadas bigint, alertas bigint, multas_novas bigint
) language sql as $$
  select t.estado, p.status::text, p.refund_status::text, p.repasse_status::text, p.multa_descontada, e.status::text,
    (select count(*) from public.penalties x where x.reserva_payment_id = p.id and x.quitada_em is null and x.payment_id is null),
    (select count(*) from public.penalties x where x.reserva_payment_id = p.id and x.quitada_em is not null),
    (select count(*) from public.repasse_alertas a where a.tentativa_id = t.id and a.tipo = 'REPASSE_E_ESTORNO'),
    (select count(*) from public.penalties x where x.estorno_payment_id = p.id)
  from public.payments p
  join public.repasse_tentativas t on t.id = pg_temp.tentativa(p_n)
  join public.events e on e.id = p.event_id
  where p.id = pg_temp.pagamento(p_n);
$$;
create function pg_temp.foto(p_n int) returns jsonb language sql as $$
  select a.detalhes from public.repasse_alertas a where a.tentativa_id = pg_temp.tentativa(p_n) and a.tipo = 'REPASSE_E_ESTORNO';
$$;

select ok(
  has_function_privilege('service_role', 'public.registrar_repasse_e_estorno(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_repasse_e_estorno(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.registrar_repasse_e_estorno(uuid, text)', 'execute'),
  'so a API registra o alerta de repasse com estorno');

select is((select desconto from public.claim_payout(pg_temp.pagamento(1))), 50.00::numeric, 'as duas multas do musico A ficam reservadas no primeiro pagamento');
select public.registrar_pedido_enviado(pg_temp.tentativa(1));
select is(public.registrar_transferencia(pg_temp.tentativa(1), 'tra_c3_1'), 'REGISTRADA', 'transferencia registrada antes do estorno');
select is(public.finalize_asaas_refund(pg_temp.pagamento(1)), 'REPASSE_CONFLITANTE', 'estorno com tentativa aberta continua conflitante');
select is((select count(*) from public.repasse_alertas where tentativa_id = pg_temp.tentativa(1)), 0::bigint, 'sem transferencia concluida ainda nao ha alerta');
select is(public.concluir_tentativa(pg_temp.tentativa(1), 'tra_c3_1'), 'REPASSE_E_ESTORNO', 'transferencia concluida depois do estorno vira alerta');
select is((select count(*) from public.penalties where reserva_payment_id = pg_temp.pagamento(1) and quitada_em is null and payment_id is null), 2::bigint,
  'com o estorno anterior, as multas continuam reservadas e sem quitacao');
select results_eq(
  $$ select foto ->> 'ordem', (foto ->> 'valor_retido')::numeric, (foto ->> 'valor_transferido')::numeric, (foto ->> 'valor_pendente')::numeric,
       (foto ->> 'valor_cache')::numeric, foto ->> 'asaas_transfer_id', foto ->> 'payment_id'
     from (select pg_temp.foto(1) as foto) f $$,
  $$ values ('ESTORNO_ANTES_DA_CONCLUSAO', 50.00::numeric, 450.00::numeric, 50.00::numeric, 500.00::numeric, 'tra_c3_1', pg_temp.pagamento(1)::text) $$,
  'a foto guarda retido, transferido e pendente');
select results_eq(
  $$ select m ->> 'id', (m ->> 'multa')::numeric, m ->> 'reserva_payment_id', m ->> 'quitada_em', m ->> 'payment_id'
     from jsonb_array_elements(pg_temp.foto(1) -> 'multas') m $$,
  $$ values
       ('00000000-0000-0000-0000-0000000c8b11', 40.00::numeric, pg_temp.pagamento(1)::text, null::text, null::text),
       ('00000000-0000-0000-0000-0000000c8b12', 10.00::numeric, pg_temp.pagamento(1)::text, null::text, null::text) $$,
  'a foto identifica cada multa com valor, reserva e quitacao anterior');
select is(public.concluir_tentativa(pg_temp.tentativa(1), 'tra_c3_1'), 'REPASSE_E_ESTORNO', 'webhook repetido devolve o mesmo resultado');
select results_eq(
  $$ select alertas, quitadas from pg_temp.estado_final(1) $$,
  $$ values (1::bigint, 0::bigint) $$,
  'webhook repetido nao duplica o alerta nem quita as multas');
select is(public.registrar_repasse_e_estorno(pg_temp.tentativa(1), 'ANTERIOR_A_CONCILIACAO'), false, 'registrar de novo nao cria outro alerta');

select is((select desconto from public.claim_payout(pg_temp.pagamento(3))), 0.00::numeric, 'multas presas ao pagamento estornado nao sao reservadas de novo');
select is((select count(*) from public.penalties where reserva_payment_id = pg_temp.pagamento(3)), 0::bigint, 'nenhuma multa do musico A vai para o outro pagamento');
select public.registrar_pedido_enviado(pg_temp.tentativa(3));
select public.registrar_transferencia(pg_temp.tentativa(3), 'tra_c3_3');
select is(public.concluir_tentativa(pg_temp.tentativa(3), 'tra_c3_3'), 'CONCLUIDA', 'conclusao de pagamento pago continua normal');
select results_eq(
  $$ select status::text, repasse_status::text from public.payments where id = pg_temp.pagamento(3) $$,
  $$ values ('PAGO', 'REPASSADO') $$,
  'pagamento pago fica repassado, sem alerta');
select is((select count(*) from public.repasse_alertas where tentativa_id = pg_temp.tentativa(3)), 0::bigint, 'conclusao normal nao gera alerta');

select is((select desconto from public.claim_payout(pg_temp.pagamento(2))), 50.00::numeric, 'as duas multas do musico B ficam reservadas');
select public.registrar_pedido_enviado(pg_temp.tentativa(2));
select public.registrar_transferencia(pg_temp.tentativa(2), 'tra_c3_2');
select is(public.concluir_tentativa(pg_temp.tentativa(2), 'tra_c3_2'), 'CONCLUIDA', 'repasse concluido antes do estorno');
select is((select count(*) from public.penalties where payment_id = pg_temp.pagamento(2) and quitada_em is not null), 2::bigint, 'as multas sao quitadas na conclusao');
create temp table quitacao_anterior as
  select id, quitada_em from public.penalties where payment_id = pg_temp.pagamento(2);
select is(public.finalize_asaas_refund(pg_temp.pagamento(2)), 'REPASSE_CONFLITANTE', 'estorno depois da conclusao continua conflitante');
select is((select count(*) from public.penalties where reserva_payment_id = pg_temp.pagamento(2) and quitada_em is null and payment_id is null), 2::bigint,
  'a quitacao e desfeita e a reserva continua');
select is(pg_temp.foto(2) ->> 'ordem', 'ESTORNO_DEPOIS_DA_CONCLUSAO', 'a foto registra a ordem dos acontecimentos');
select results_eq(
  $$ select m ->> 'id', (m ->> 'quitada_em')::timestamptz, m ->> 'payment_id', m ->> 'reserva_payment_id'
     from jsonb_array_elements(pg_temp.foto(2) -> 'multas') m order by 1 $$,
  $$ select q.id::text, q.quitada_em, pg_temp.pagamento(2)::text, pg_temp.pagamento(2)::text from quitacao_anterior q order by 1 $$,
  'a foto preserva a quitacao anterior de cada multa');
select results_eq(
  $$ select (foto ->> 'valor_retido')::numeric, (foto ->> 'valor_transferido')::numeric, (foto ->> 'valor_pendente')::numeric from (select pg_temp.foto(2) as foto) f $$,
  $$ values (50.00::numeric, 450.00::numeric, 50.00::numeric) $$,
  'retido, transferido e pendente iguais aos da outra ordem');
select is(public.finalize_asaas_refund(pg_temp.pagamento(2)), 'JA_PROCESSADO', 'estorno repetido nao refaz nada');
select is(public.concluir_tentativa(pg_temp.tentativa(2), 'tra_c3_2'), 'REPASSE_E_ESTORNO', 'webhook de conclusao repetido depois do estorno');
select results_eq(
  $$ select alertas, quitadas from pg_temp.estado_final(2) $$,
  $$ values (1::bigint, 0::bigint) $$,
  'repeticoes nao quitam de novo nem duplicam o alerta');

select results_eq(
  $$ select tentativa, pagamento, estorno, repasse, retido, evento, reservadas, quitadas, alertas, multas_novas from pg_temp.estado_final(1) $$,
  $$ select tentativa, pagamento, estorno, repasse, retido, evento, reservadas, quitadas, alertas, multas_novas from pg_temp.estado_final(2) $$,
  'as duas ordens terminam no mesmo estado financeiro');
select results_eq(
  $$ select tentativa, pagamento, estorno, repasse, retido, evento, reservadas, quitadas, alertas, multas_novas from pg_temp.estado_final(1) $$,
  $$ values ('CONCLUIDA', 'ESTORNADO', 'CONFIRMADO', 'REPASSADO', 50.00::numeric, 'CANCELADO', 2::bigint, 0::bigint, 1::bigint, 0::bigint) $$,
  'concluida, estornada, repassada, multas reservadas, evento nao reaberto e sem multa nova');

select throws_ok(
  $$ update public.repasse_alertas set status_transferencia = 'x' where tentativa_id = pg_temp.tentativa(1) $$,
  'P0001', 'alertas de repasse nao podem ser alterados nem apagados', 'alerta nao pode ser alterado');
select throws_ok(
  $$ delete from public.repasse_alertas where tentativa_id = pg_temp.tentativa(1) $$,
  'P0001', 'alertas de repasse nao podem ser alterados nem apagados', 'alerta nao pode ser apagado');
select throws_ok(
  $$ truncate public.repasse_alertas cascade $$,
  'P0001', 'alertas de repasse nao podem ser alterados nem apagados', 'alertas nao podem ser esvaziados');
select throws_ok(
  $$ insert into public.repasse_alertas (tentativa_id, tipo, asaas_transfer_id, status_transferencia, detalhes)
     values (pg_temp.tentativa(1), 'REPASSE_E_ESTORNO', 'tra_c3_outra', 'DONE', '{}'::jsonb) $$,
  '23505', null, 'um unico alerta de repasse com estorno por tentativa');
select throws_ok(
  $$ insert into public.repasse_alertas (tentativa_id, tipo, asaas_transfer_id) values (pg_temp.tentativa(3), 'REPASSE_E_ESTORNO', 'tra_c3_3') $$,
  '23514', null, 'alerta de repasse com estorno exige a foto');
select lives_ok(
  $$ select public.registrar_alerta_repasse(pg_temp.tentativa(1), 'POSSIVEL_DUPLICIDADE', 'tra_c3_x', 'DONE');
     select public.registrar_alerta_repasse(pg_temp.tentativa(1), 'POSSIVEL_DUPLICIDADE', 'tra_c3_x', 'DONE') $$,
  'a gravacao idempotente continua funcionando com a tabela imutavel');
select throws_ok(
  $$ select public.registrar_repasse_e_estorno(pg_temp.tentativa(1), 'QUALQUER') $$,
  'P0001', 'ordem de acontecimentos invalida', 'ordem desconhecida e recusada');

select is((select desconto from public.claim_payout(pg_temp.pagamento(4))), 40.00::numeric, 'multa do musico C reservada');
select public.registrar_pedido_enviado(pg_temp.tentativa(4));
select public.registrar_transferencia(pg_temp.tentativa(4), 'tra_c3_4');
select public.finalize_asaas_refund(pg_temp.pagamento(4));
select is(public.falhar_tentativa(pg_temp.tentativa(4), 'tra_c3_4'), true, 'transferencia que falha depois do estorno encerra a tentativa');
select results_eq(
  $$ select p.repasse_status::text, (select count(*) from public.penalties x where x.reserva_payment_id = p.id),
       (select count(*) from public.repasse_alertas a where a.tentativa_id = pg_temp.tentativa(4)),
       (select tentativa_id from public.claim_payout(p.id))
     from public.payments p where p.id = pg_temp.pagamento(4) $$,
  $$ values ('FALHOU', 0::bigint, 0::bigint, null::uuid) $$,
  'multas liberadas, sem alerta e sem novo repasse para o pagamento estornado');

select * from finish();
rollback;
