begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b2a1', 'res-musico@example.com'),
  ('00000000-0000-0000-0000-00000000b2c1', 'res-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000b2a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000b2c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000b2a1', 'Musico Reserva', '71111111111', '45999990021', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000b2c1', 'Bar Reserva', '71111111000171', '4532220021', 'https://x/c.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-00000000b2e1', '00000000-0000-0000-0000-00000000b2c1', 'Show 1', 'Bar e restaurante', now() + interval '2 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-00000000b2e2', '00000000-0000-0000-0000-00000000b2c1', 'Show 2', 'Bar e restaurante', now() + interval '4 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-00000000b2e3', '00000000-0000-0000-0000-00000000b2c1', 'Show 3', 'Bar e restaurante', now() + interval '6 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-00000000b2e4', '00000000-0000-0000-0000-00000000b2c1', 'Show legado', 'Bar e restaurante', now() + interval '8 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-00000000b2d1', '00000000-0000-0000-0000-00000000b2e1', '00000000-0000-0000-0000-00000000b2a1'),
  ('00000000-0000-0000-0000-00000000b2d2', '00000000-0000-0000-0000-00000000b2e2', '00000000-0000-0000-0000-00000000b2a1'),
  ('00000000-0000-0000-0000-00000000b2d3', '00000000-0000-0000-0000-00000000b2e3', '00000000-0000-0000-0000-00000000b2a1'),
  ('00000000-0000-0000-0000-00000000b2d4', '00000000-0000-0000-0000-00000000b2e4', '00000000-0000-0000-0000-00000000b2a1');
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em) values
  ('00000000-0000-0000-0000-00000000b2f1', '00000000-0000-0000-0000-00000000b2e1', '00000000-0000-0000-0000-00000000b2d1', '00000000-0000-0000-0000-00000000b2c1', 'pay_res_1', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b2f2', '00000000-0000-0000-0000-00000000b2e2', '00000000-0000-0000-0000-00000000b2d2', '00000000-0000-0000-0000-00000000b2c1', 'pay_res_2', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b2f3', '00000000-0000-0000-0000-00000000b2e3', '00000000-0000-0000-0000-00000000b2d3', '00000000-0000-0000-0000-00000000b2c1', 'pay_res_3', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b2f4', '00000000-0000-0000-0000-00000000b2e4', '00000000-0000-0000-0000-00000000b2d4', '00000000-0000-0000-0000-00000000b2c1', 'pay_res_4', 550, 50, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_res_1');
select public.confirm_asaas_payment('pay_res_2');
select public.confirm_asaas_payment('pay_res_3');
select public.confirm_asaas_payment('pay_res_4');

insert into public.penalties (id, musician_id, tipo, multa, created_at) values
  ('00000000-0000-0000-0000-0000000b2a01', '00000000-0000-0000-0000-00000000b2a1', 'AUSENCIA', 600, now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000b2a02', '00000000-0000-0000-0000-00000000b2a1', 'DESISTENCIA_TARDIA', 0, now() - interval '4 days'),
  ('00000000-0000-0000-0000-0000000b2a03', '00000000-0000-0000-0000-00000000b2a1', 'AUSENCIA', 100, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000b2a04', '00000000-0000-0000-0000-00000000b2a1', 'AUSENCIA', 450, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000b2a05', '00000000-0000-0000-0000-00000000b2a1', 'AUSENCIA', 50, now() - interval '1 day');
insert into public.penalties (id, musician_id, tipo, multa, created_at, quitada_em, payment_id) values
  ('00000000-0000-0000-0000-0000000b2a06', '00000000-0000-0000-0000-00000000b2a1', 'AUSENCIA', 70, now() - interval '30 days', now() - interval '20 days', '00000000-0000-0000-0000-00000000b2f4');
insert into public.penalties (id, musician_id, tipo, multa, created_at, reserva_payment_id) values
  ('00000000-0000-0000-0000-0000000b2a07', '00000000-0000-0000-0000-00000000b2a1', 'AUSENCIA', 30, now() - interval '6 days', '00000000-0000-0000-0000-00000000b2f3');

create temp table reserva_antes as select id, reserva_payment_id, quitada_em, payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000b2a06';
create temp view tentativa_aberta as
  select payment_id, id from public.repasse_tentativas where encerrada_em is null;

select results_eq(
  $$ select tentativa_id is not null, desconto from public.claim_payout('00000000-0000-0000-0000-00000000b2f1') $$,
  $$ values (true, 150.00::numeric) $$,
  'reivindicacao cria a tentativa, reserva as multas que cabem e devolve o desconto');
create temp table t1 as select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-00000000b2f1';
select results_eq(
  $$ select id from public.penalties where reserva_payment_id = '00000000-0000-0000-0000-00000000b2f1' order by created_at $$,
  $$ values ('00000000-0000-0000-0000-0000000b2a03'::uuid), ('00000000-0000-0000-0000-0000000b2a05'::uuid) $$,
  'pula a multa que nao cabe (600) e a seguinte (450 depois de 100), e reserva as menores posteriores');
select is((select reserva_payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000b2a01'), null, 'multa maior que o cache fica integralmente aberta');
select is((select reserva_payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000b2a02'), null, 'multa zero nunca e reservada');
select results_eq(
  $$ select repasse_status::text, multa_descontada from public.payments where id = '00000000-0000-0000-0000-00000000b2f1' $$,
  $$ values ('PROCESSANDO', 150.00::numeric(10, 2)) $$,
  'repasse fica em processamento com o total reservado em multa_descontada');
select results_eq(
  $$ select estado, origem, referencia_externa = id::text, valor from public.repasse_tentativas where id = (select id from t1) $$,
  $$ values ('SOLICITANDO', 'ATUAL', true, 350.00::numeric(10, 2)) $$,
  'a tentativa nasce solicitando, com a propria identificacao como referencia externa e o valor liquido');

select results_eq(
  $$ select tentativa_id, desconto from public.claim_payout('00000000-0000-0000-0000-00000000b2f1') $$,
  $$ values (null::uuid, 150.00::numeric) $$,
  'repasse em processamento nao pode ser reivindicado de novo');

select results_eq(
  $$ select tentativa_id is not null, desconto from public.claim_payout('00000000-0000-0000-0000-00000000b2f3') $$,
  $$ values (true, 30.00::numeric) $$,
  'reivindicacao reaproveita as multas ja reservadas para o pagamento');
select is((select count(*)::int from public.penalties where reserva_payment_id = '00000000-0000-0000-0000-00000000b2f3'), 1, 'reaproveitar a reserva nao reserva multas extras');

select is(public.registrar_transferencia((select id from t1), 'tra_res_1'), 'REGISTRADA', 'registra a transferencia criada na tentativa');
select is(public.registrar_transferencia((select id from t1), 'tra_res_1'), 'JA_REGISTRADA', 'registrar a mesma transferencia de novo e idempotente');
select is(public.registrar_transferencia((select id from t1), 'tra_res_outra'), 'RECUSADA', 'nao troca o identificador de uma transferencia ja registrada');
select is((select count(*)::int from public.repasse_alertas where tentativa_id = (select id from t1) and tipo = 'POSSIVEL_DUPLICIDADE' and asaas_transfer_id = 'tra_res_outra'), 1, 'segunda transferencia para a mesma tentativa vira alerta de possivel duplicidade');
select results_eq(
  $$ select estado, asaas_transfer_id from public.repasse_tentativas where id = (select id from t1) $$,
  $$ values ('PENDENTE', 'tra_res_1') $$,
  'tentativa fica pendente com o identificador registrado');
select is((select repasse_asaas_id from public.payments where id = '00000000-0000-0000-0000-00000000b2f1'), 'tra_res_1', 'o pagamento espelha a transferencia da tentativa ativa');
select is((select count(*)::int from public.penalties where reserva_payment_id = '00000000-0000-0000-0000-00000000b2f1' and quitada_em is null), 2, 'transferencia pendente mantem as multas reservadas, nao quitadas');

select results_eq(
  $$ select tentativa_id is not null, desconto from public.claim_payout('00000000-0000-0000-0000-00000000b2f2') $$,
  $$ values (true, 450.00::numeric) $$,
  'segundo repasse do mesmo musico so reserva multas ainda livres');
create temp table t2 as select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-00000000b2f2';
select results_eq(
  $$ select id from public.penalties where reserva_payment_id = '00000000-0000-0000-0000-00000000b2f2' $$,
  $$ values ('00000000-0000-0000-0000-0000000b2a04'::uuid) $$,
  'nenhuma multa e reservada por dois repasses');

select is(public.concluir_tentativa((select id from t1), 'tra_res_outra'), 'RECUSADA', 'conclusao com outro identificador nao faz nada');
select is(public.concluir_tentativa((select id from t1), null), 'RECUSADA', 'conclusao sem identificador nao faz nada');
select is((select count(*)::int from public.penalties where reserva_payment_id = '00000000-0000-0000-0000-00000000b2f1' and quitada_em is not null), 0, 'conclusao recusada nao quita multas');
select is(public.concluir_tentativa((select id from tentativa_aberta where payment_id = '00000000-0000-0000-0000-00000000b2f3'), 'tra_sem_vinculo'), 'RECUSADA', 'tentativa sem transferencia registrada nao e concluida por um identificador qualquer');
select is(public.concluir_tentativa((select id from t1), 'tra_res_1'), 'CONCLUIDA', 'transferencia concluida conclui a tentativa');
select results_eq(
  $$ select count(*)::int, count(*) filter (where payment_id = '00000000-0000-0000-0000-00000000b2f1')::int from public.penalties where reserva_payment_id = '00000000-0000-0000-0000-00000000b2f1' and quitada_em is not null $$,
  $$ values (2, 2) $$,
  'conclusao quita exatamente as multas reservadas');
select results_eq(
  $$ select p.repasse_status::text, t.estado, t.encerrada_em is not null from public.payments p join public.repasse_tentativas t on t.payment_id = p.id where p.id = '00000000-0000-0000-0000-00000000b2f1' $$,
  $$ values ('REPASSADO', 'CONCLUIDA', true) $$,
  'repasse e tentativa ficam concluidos');
select is(public.concluir_tentativa((select id from t1), 'tra_res_1'), 'JA_CONCLUIDA', 'quitacao idempotente nao conclui de novo');
select is((select count(*)::int from public.penalties where quitada_em is not null and reserva_payment_id = '00000000-0000-0000-0000-00000000b2f1'), 2, 'quitacao repetida nao altera as multas');
select is(public.falhar_tentativa((select id from t1), 'tra_res_1'), false, 'tentativa concluida nao pode ser marcada como falha');
select is((select count(*)::int from public.penalties where reserva_payment_id = '00000000-0000-0000-0000-00000000b2f1' and quitada_em is not null), 2, 'falha recusada nao libera multas quitadas');

select is(public.registrar_transferencia((select id from t2), 'tra_res_2'), 'REGISTRADA', 'segundo repasse registra sua transferencia');
select is(public.falhar_tentativa((select id from t2), 'tra_res_antiga'), false, 'falha de outra transferencia nao afeta a tentativa');
select is(public.falhar_tentativa((select id from t2), null), false, 'falha sem identificador nao afeta tentativa com transferencia registrada');
select is((select reserva_payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000b2a04'), '00000000-0000-0000-0000-00000000b2f2'::uuid, 'reserva continua apos falhas recusadas');
select is(public.falhar_tentativa((select id from t2), 'tra_res_2'), true, 'falha definitiva da transferencia registrada encerra a tentativa');
select results_eq(
  $$ select p.repasse_status::text, p.multa_descontada, p.repasse_asaas_id, p.repasse_asaas_id_anterior, t.estado, t.asaas_transfer_id
     from public.payments p join public.repasse_tentativas t on t.payment_id = p.id where t.id = (select id from t2) $$,
  $$ values ('FALHOU', 0.00::numeric(10, 2), null::text, null::text, 'FALHOU', 'tra_res_2') $$,
  'falha zera o desconto, libera o pagamento e guarda o identificador na tentativa encerrada');
select is((select reserva_payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000b2a04'), null, 'falha definitiva devolve a multa reservada');
select is(public.falhar_tentativa((select id from t2), 'tra_res_2'), false, 'liberacao idempotente');
select public.reabrir_repasses_falhos((select e.musico_contratado_id from public.events e join public.payments p on p.event_id = e.id where p.id = '00000000-0000-0000-0000-00000000b2f2'));
select results_eq(
  $$ select tentativa_id is not null and tentativa_id <> (select id from t2), desconto from public.claim_payout('00000000-0000-0000-0000-00000000b2f2') $$,
  $$ values (true, 450.00::numeric) $$,
  'depois da falha definitiva e da troca da chave, nova tentativa reserva a multa de novo');

select is(public.registrar_transferencia((select id from t2), 'tra_tardia'), 'TARDIA', 'resposta tardia de tentativa encerrada nao e adotada');
select is(public.concluir_tentativa((select id from t2), 'tra_res_2'), 'ALERTA', 'conclusao de tentativa encerrada vira alerta e nao conclui o repasse');
select results_eq(
  $$ select tipo from public.repasse_alertas where tentativa_id = (select id from t2) order by tipo $$,
  $$ values ('POSSIVEL_DUPLICIDADE'), ('RESPOSTA_TARDIA') $$,
  'os dois alertas ficam registrados para o suporte');
select results_eq(
  $$ select p.repasse_status::text, t.estado from public.payments p join public.repasse_tentativas t on t.payment_id = p.id and t.encerrada_em is null where p.id = '00000000-0000-0000-0000-00000000b2f2' $$,
  $$ values ('PROCESSANDO', 'SOLICITANDO') $$,
  'a tentativa nova nao e afetada pela resposta da antiga');

select is(public.falhar_tentativa((select id from tentativa_aberta where payment_id = '00000000-0000-0000-0000-00000000b2f3'), null), true, 'recusa definitiva logo no pedido encerra a tentativa sem transferencia');
select is((select reserva_payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000b2a07'), null, 'recusa definitiva devolve a multa reservada');

update public.payments set repasse_status = 'FALHOU', repasse_asaas_id = 'tra_legado' where id = '00000000-0000-0000-0000-00000000b2f4';
select results_eq(
  $$ select tentativa_id from public.claim_payout('00000000-0000-0000-0000-00000000b2f4') $$,
  $$ values (null::uuid) $$,
  'repasse falho antigo com identificador registrado fica bloqueado para conciliacao manual');
select is((select repasse_asaas_id from public.payments where id = '00000000-0000-0000-0000-00000000b2f4'), 'tra_legado', 'identificador historico nao e apagado');
select results_eq(
  $$ select id, reserva_payment_id, quitada_em, payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000b2a06' $$,
  $$ select id, reserva_payment_id, quitada_em, payment_id from reserva_antes $$,
  'multa antiga ja quitada nao e alterada');

select * from finish();
rollback;
