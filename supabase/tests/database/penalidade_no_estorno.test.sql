begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b0a1', 'pen-musico-1@example.com'),
  ('00000000-0000-0000-0000-00000000b0a2', 'pen-musico-2@example.com'),
  ('00000000-0000-0000-0000-00000000b0a3', 'pen-musico-3@example.com'),
  ('00000000-0000-0000-0000-00000000b0a4', 'pen-musico-4@example.com'),
  ('00000000-0000-0000-0000-00000000b0a5', 'pen-musico-5@example.com'),
  ('00000000-0000-0000-0000-00000000b0a6', 'pen-musico-6@example.com'),
  ('00000000-0000-0000-0000-00000000b0c1', 'pen-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000b0a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000b0a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000b0a3', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000b0a4', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000b0a5', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000b0a6', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000b0c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000b0a1', 'Musico Um', '81111111111', '45999990011', 'https://x/a1.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-00000000b0a2', 'Musico Dois', '82222222222', '45999990012', 'https://x/a2.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-00000000b0a3', 'Musico Tres', '83333333333', '45999990013', 'https://x/a3.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-00000000b0a4', 'Musico Quatro', '84444444444', '45999990014', 'https://x/a4.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-00000000b0a5', 'Musico Cinco', '85555555555', '45999990015', 'https://x/a5.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-00000000b0a6', 'Musico Seis', '86666666666', '45999990016', 'https://x/a6.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000b0c1', 'Bar Penalidade', '81111111000181', '4532220011', 'https://x/c1.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-00000000b0e1', '00000000-0000-0000-0000-00000000b0c1', 'Ausencia', 'Bar e restaurante', now() + interval '2 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-00000000b0e2', '00000000-0000-0000-0000-00000000b0c1', 'Duas desistencias', 'Bar e restaurante', now() + interval '12 hours', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-00000000b0e3', '00000000-0000-0000-0000-00000000b0c1', 'Desistencia com antecedencia', 'Bar e restaurante', now() + interval '24 hours 1 minute', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-00000000b0e4', '00000000-0000-0000-0000-00000000b0c1', 'Cancelamento do contratante', 'Bar e restaurante', now() + interval '3 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-00000000b0e5', '00000000-0000-0000-0000-00000000b0c1', 'Falha no meio', 'Bar e restaurante', now() + interval '2 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-00000000b0e6', '00000000-0000-0000-0000-00000000b0c1', 'Exatamente 24h', 'Bar e restaurante', now() + interval '24 hours', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'),
  ('00000000-0000-0000-0000-00000000b0e7', '00000000-0000-0000-0000-00000000b0c1', 'Repasse conflitante', 'Bar e restaurante', now() + interval '2 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');

insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-00000000b0d1', '00000000-0000-0000-0000-00000000b0e1', '00000000-0000-0000-0000-00000000b0a1'),
  ('00000000-0000-0000-0000-00000000b0d2', '00000000-0000-0000-0000-00000000b0e2', '00000000-0000-0000-0000-00000000b0a2'),
  ('00000000-0000-0000-0000-00000000b0d3', '00000000-0000-0000-0000-00000000b0e2', '00000000-0000-0000-0000-00000000b0a3'),
  ('00000000-0000-0000-0000-00000000b0d4', '00000000-0000-0000-0000-00000000b0e3', '00000000-0000-0000-0000-00000000b0a4'),
  ('00000000-0000-0000-0000-00000000b0d5', '00000000-0000-0000-0000-00000000b0e4', '00000000-0000-0000-0000-00000000b0a4'),
  ('00000000-0000-0000-0000-00000000b0d6', '00000000-0000-0000-0000-00000000b0e5', '00000000-0000-0000-0000-00000000b0a5'),
  ('00000000-0000-0000-0000-00000000b0d7', '00000000-0000-0000-0000-00000000b0e6', '00000000-0000-0000-0000-00000000b0a6'),
  ('00000000-0000-0000-0000-00000000b0d8', '00000000-0000-0000-0000-00000000b0e7', '00000000-0000-0000-0000-00000000b0a4');

insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em) values
  ('00000000-0000-0000-0000-00000000b0f1', '00000000-0000-0000-0000-00000000b0e1', '00000000-0000-0000-0000-00000000b0d1', '00000000-0000-0000-0000-00000000b0c1', 'pay_pen_1', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b0f2', '00000000-0000-0000-0000-00000000b0e2', '00000000-0000-0000-0000-00000000b0d2', '00000000-0000-0000-0000-00000000b0c1', 'pay_pen_2', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b0f4', '00000000-0000-0000-0000-00000000b0e3', '00000000-0000-0000-0000-00000000b0d4', '00000000-0000-0000-0000-00000000b0c1', 'pay_pen_4', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b0f5', '00000000-0000-0000-0000-00000000b0e4', '00000000-0000-0000-0000-00000000b0d5', '00000000-0000-0000-0000-00000000b0c1', 'pay_pen_5', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b0f6', '00000000-0000-0000-0000-00000000b0e5', '00000000-0000-0000-0000-00000000b0d6', '00000000-0000-0000-0000-00000000b0c1', 'pay_pen_6', 550, 50, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b0f7', '00000000-0000-0000-0000-00000000b0e6', '00000000-0000-0000-0000-00000000b0d7', '00000000-0000-0000-0000-00000000b0c1', 'pay_pen_7', 550, 50, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_pen_1');
select public.confirm_asaas_payment('pay_pen_2');
select public.confirm_asaas_payment('pay_pen_4');
select public.confirm_asaas_payment('pay_pen_5');
select public.confirm_asaas_payment('pay_pen_6');
select public.confirm_asaas_payment('pay_pen_7');

insert into public.penalties (musician_id, event_id, tipo, multa) values
  ('00000000-0000-0000-0000-00000000b0a3', '00000000-0000-0000-0000-00000000b0e4', 'AUSENCIA', 30),
  ('00000000-0000-0000-0000-00000000b0a3', '00000000-0000-0000-0000-00000000b0e4', 'AUSENCIA', 20);

select is(public.claim_asaas_refund('00000000-0000-0000-0000-00000000b0f1', 'NAO_COMPARECIMENTO'), true, 'ausencia reserva o estorno');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f1'), 'CONFIRMADO', 'ausencia confirma o estorno');
select results_eq(
  $$ select musician_id, event_id, tipo, multa from public.penalties where estorno_payment_id = '00000000-0000-0000-0000-00000000b0f1' $$,
  $$ values ('00000000-0000-0000-0000-00000000b0a1'::uuid, '00000000-0000-0000-0000-00000000b0e1'::uuid, 'AUSENCIA', 100.00::numeric(10, 2)) $$,
  'ausencia grava multa de 20% do cache para o musico contratado');
select is((select visibilidade_reduzida_ate from public.musician_profiles where user_id = '00000000-0000-0000-0000-00000000b0a1'), now() + interval '15 days', 'ausencia reduz a visibilidade por 15 dias');
select is((select status::text from public.events where id = '00000000-0000-0000-0000-00000000b0e1'), 'CANCELADO', 'ausencia mantem o cancelamento do evento');

update public.musician_profiles set visibilidade_reduzida_ate = now() + interval '3 days' where user_id = '00000000-0000-0000-0000-00000000b0a1';
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f1'), 'JA_PROCESSADO', 'confirmacao repetida devolve JA_PROCESSADO');
select is((select count(*)::int from public.penalties where estorno_payment_id = '00000000-0000-0000-0000-00000000b0f1'), 1, 'confirmacao repetida nao duplica a multa');
select is((select visibilidade_reduzida_ate from public.musician_profiles where user_id = '00000000-0000-0000-0000-00000000b0a1'), now() + interval '3 days', 'confirmacao repetida nao mexe no prazo de visibilidade');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-00000000b0f2', 'REABRIR'), true, 'primeira desistencia reserva o estorno');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f2'), 'CONFIRMADO', 'primeira desistencia tardia confirma o estorno');
select is((select count(*)::int from public.event_candidates where id = '00000000-0000-0000-0000-00000000b0d2'), 0, 'reopen_event apagou a inscricao do desistente');
select results_eq(
  $$ select musician_id, tipo, multa from public.penalties where estorno_payment_id = '00000000-0000-0000-0000-00000000b0f2' $$,
  $$ values ('00000000-0000-0000-0000-00000000b0a2'::uuid, 'DESISTENCIA_TARDIA', 0.00::numeric(10, 2)) $$,
  'desistencia tardia penaliza o musico identificado antes de reabrir o evento');

insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em) values
  ('00000000-0000-0000-0000-00000000b0f3', '00000000-0000-0000-0000-00000000b0e2', '00000000-0000-0000-0000-00000000b0d3', '00000000-0000-0000-0000-00000000b0c1', 'pay_pen_3', 550, 50, now() + interval '15 minutes');
select is(public.confirm_asaas_payment('pay_pen_3'), 'CONTRATADO', 'evento reaberto contrata outro musico');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-00000000b0f3', 'REABRIR'), true, 'segunda desistencia reserva o estorno');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f3'), 'CONFIRMADO', 'segunda desistencia tardia confirma o estorno');
select results_eq(
  $$ select musician_id, tipo from public.penalties where event_id = '00000000-0000-0000-0000-00000000b0e2' order by estorno_payment_id $$,
  $$ values ('00000000-0000-0000-0000-00000000b0a2'::uuid, 'DESISTENCIA_TARDIA'), ('00000000-0000-0000-0000-00000000b0a3'::uuid, 'DESISTENCIA_TARDIA') $$,
  'duas desistencias tardias legitimas no mesmo evento geram duas penalidades');

update public.musician_profiles set visibilidade_reduzida_ate = now() + interval '30 days' where user_id = '00000000-0000-0000-0000-00000000b0a6';
select is(public.claim_asaas_refund('00000000-0000-0000-0000-00000000b0f7', 'REABRIR'), true, 'desistencia com exatamente 24h reserva o estorno');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f7'), 'CONFIRMADO', 'desistencia com exatamente 24h confirma o estorno');
select is((select tipo from public.penalties where estorno_payment_id = '00000000-0000-0000-0000-00000000b0f7'), 'DESISTENCIA_TARDIA', 'exatamente 24h antes conta como desistencia tardia');
select is((select visibilidade_reduzida_ate from public.musician_profiles where user_id = '00000000-0000-0000-0000-00000000b0a6'), now() + interval '30 days', 'penalidade nova nao encurta uma visibilidade reduzida mais longa');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-00000000b0f4', 'REABRIR'), true, 'desistencia com antecedencia reserva o estorno');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f4'), 'CONFIRMADO', 'desistencia com antecedencia confirma o estorno');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-00000000b0f5', 'CANCELAR'), true, 'cancelamento do contratante reserva o estorno');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f5'), 'CONFIRMADO', 'cancelamento do contratante confirma o estorno');
select is((select count(*)::int from public.penalties where estorno_payment_id in ('00000000-0000-0000-0000-00000000b0f4', '00000000-0000-0000-0000-00000000b0f5')), 0, 'desistencia com mais de 24h e cancelamento do contratante nao penalizam');

create function pg_temp.falhar_visibilidade() returns trigger language plpgsql as $$
begin
  raise exception 'falha simulada na visibilidade';
end;
$$;
create trigger falha_simulada before update of visibilidade_reduzida_ate on public.musician_profiles
for each row when (new.user_id = '00000000-0000-0000-0000-00000000b0a5') execute function pg_temp.falhar_visibilidade();

select is(public.claim_asaas_refund('00000000-0000-0000-0000-00000000b0f6', 'NAO_COMPARECIMENTO'), true, 'ausencia com falha reserva o estorno');
select throws_ok($$ select public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f6') $$, 'P0001', 'falha simulada na visibilidade', 'falha na visibilidade interrompe a confirmacao');
select results_eq(
  $$ select p.status::text, p.refund_status, e.status::text, e.musico_contratado_id, (select count(*)::int from public.penalties x where x.estorno_payment_id = p.id)
     from public.payments p join public.events e on e.id = p.event_id where p.id = '00000000-0000-0000-0000-00000000b0f6' $$,
  $$ values ('PAGO', 'PROCESSANDO', 'CONTRATADO', '00000000-0000-0000-0000-00000000b0a5'::uuid, 0) $$,
  'falha desfaz tudo: pagamento, evento e multa voltam ao estado anterior e o estorno segue pendente');

drop trigger falha_simulada on public.musician_profiles;
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f6'), 'CONFIRMADO', 'nova tentativa depois da falha confirma o estorno');
select is((select count(*)::int from public.penalties where estorno_payment_id = '00000000-0000-0000-0000-00000000b0f6'), 1, 'nova tentativa aplica a penalidade uma unica vez');

insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em) values
  ('00000000-0000-0000-0000-00000000b0f8', '00000000-0000-0000-0000-00000000b0e7', '00000000-0000-0000-0000-00000000b0d8', '00000000-0000-0000-0000-00000000b0c1', 'pay_pen_8', 550, 50, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_pen_8');
select public.claim_asaas_refund('00000000-0000-0000-0000-00000000b0f8', 'NAO_COMPARECIMENTO');
update public.payments set repasse_status = 'PROCESSANDO' where id = '00000000-0000-0000-0000-00000000b0f8';
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-00000000b0f8'), 'REPASSE_CONFLITANTE', 'repasse em andamento continua devolvendo REPASSE_CONFLITANTE');
select is((select count(*)::int from public.penalties where estorno_payment_id = '00000000-0000-0000-0000-00000000b0f8'), 0, 'estorno com repasse conflitante nao penaliza');

select throws_ok(
  $$ insert into public.penalties (musician_id, event_id, tipo, multa, estorno_payment_id) values ('00000000-0000-0000-0000-00000000b0a1', '00000000-0000-0000-0000-00000000b0e1', 'AUSENCIA', 100, '00000000-0000-0000-0000-00000000b0f1') $$,
  '23505', null, 'o indice unico impede uma segunda penalidade para o mesmo estorno');
select throws_ok($$ delete from public.payments where id = '00000000-0000-0000-0000-00000000b0f1' $$, '23503', null, 'pagamento que originou uma penalidade nao pode ser apagado');
select is(
  (select sum(multa) from public.penalties where musician_id = '00000000-0000-0000-0000-00000000b0a3' and quitada_em is null and multa > 0 and estorno_payment_id is null),
  50.00::numeric, 'penalidades antigas sem estorno de origem continuam abertas para desconto');

select * from finish();
rollback;
