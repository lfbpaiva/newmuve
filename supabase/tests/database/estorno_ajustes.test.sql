begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'ajuste-musico@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'ajuste-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000b2', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000b1', 'Musico Ajuste', '33333333333', '45999990003', 'https://x/b1.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000b2', 'Bar Ajuste', '22222222000122', '4532220002', 'https://x/b2.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2', 'Show com estorno negado', 'Bar e restaurante', now() + interval '7 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e2.png'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b2', 'Show com estorno reservado', 'Bar e restaurante', now() + interval '7 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e3.png');
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b1');
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b2', 'pay_negado', 550, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_negado');

update public.payments set refund_status = 'NEGADO', refund_action = 'CANCELAR' where id = '00000000-0000-0000-0000-0000000000f2';
update public.events set confirmacao_musico = true, confirmacao_contratante = true where id = '00000000-0000-0000-0000-0000000000e2';
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000000e2'), 'CONCLUIDO', 'estorno negado nao impede a conclusao do show');

update public.payments set repasse_status = 'PROCESSANDO'
where id = '00000000-0000-0000-0000-0000000000f2'
  and status = 'PAGO'
  and (refund_status is null or refund_status <> 'PROCESSANDO')
  and repasse_status in ('RETIDO', 'FALHOU');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000000f2'), 'PROCESSANDO', 'estorno negado nao bloqueia a reserva do repasse');

update public.payments set repasse_status = 'RETIDO', refund_status = 'PROCESSANDO' where id = '00000000-0000-0000-0000-0000000000f2';
update public.payments set repasse_status = 'PROCESSANDO'
where id = '00000000-0000-0000-0000-0000000000f2'
  and status = 'PAGO'
  and (refund_status is null or refund_status <> 'PROCESSANDO')
  and repasse_status in ('RETIDO', 'FALHOU');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000000f2'), 'RETIDO', 'estorno em processamento bloqueia a reserva do repasse');

insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em, refund_status, refund_action) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000b2', 'pay_reservado', 550, now() + interval '15 minutes', 'PROCESSANDO', 'NENHUMA');
select is(public.confirm_asaas_payment('pay_reservado'), 'EVENTO_INDISPONIVEL', 'pagamento com estorno reservado nao contrata');
select results_eq(
  $$ select p.status::text, e.status::text from public.payments p join public.events e on e.id = p.event_id where p.id = '00000000-0000-0000-0000-0000000000f3' $$,
  $$ values ('PENDENTE', 'ABERTO') $$,
  'pagamento e evento ficam como estavam');

update public.payments set refund_status = 'NEGADO' where id = '00000000-0000-0000-0000-0000000000f3';
select is(public.confirm_asaas_payment('pay_reservado'), 'EVENTO_INDISPONIVEL', 'pagamento com estorno negado tambem nao contrata');

update public.payments set refund_status = 'PROCESSANDO' where id = '00000000-0000-0000-0000-0000000000f3';
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000000f3'), 'CONFIRMADO', 'estorno de pagamento tardio e finalizado');
select results_eq(
  $$ select p.status::text, p.refund_status, e.status::text from public.payments p join public.events e on e.id = p.event_id where p.id = '00000000-0000-0000-0000-0000000000f3' $$,
  $$ values ('ESTORNADO', 'CONFIRMADO', 'ABERTO') $$,
  'pagamento tardio fica estornado sem alterar o evento');

insert into public.payments (event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000b2', 'pay_sem_reserva', 550, now() + interval '15 minutes');
select is(public.confirm_asaas_payment('pay_sem_reserva'), 'CONTRATADO', 'pagamento sem estorno reservado continua contratando');

select * from finish();
rollback;
