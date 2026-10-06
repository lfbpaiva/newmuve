-- Testes de banco (pgTAP): confirmação de pagamento e conclusão do evento.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'm1@gmail.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'm2@gmail.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@gmail.com');

insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c1', 'CONTRACTOR');

insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000a1', 'Músico Um', '11111111111', '45999990001', 'https://x/a1.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000000a2', 'Músico Dois', '22222222222', '45999990002', 'https://x/a2.png', '{Rock}', 'PR', 'Cascavel');

insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000c1', 'Bar Um', '11111111000111', '4532220001', 'https://x/c1.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Rock em Cascavel', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e1.png');

insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2');

insert into public.payments (event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'pay_ok', 500, now() + interval '15 minutes');

-- ---------------------------------------------------------------------------
-- Confirmação de pagamento
-- ---------------------------------------------------------------------------

select is(public.confirm_asaas_payment('pay_inexistente'), 'PAGAMENTO_NAO_ENCONTRADO', 'cobrança desconhecida não altera nada');
select is(public.confirm_asaas_payment('pay_ok'), 'CONTRATADO', 'pagamento recebido efetiva a contratação');

select results_eq(
  $$ select status::text, musico_contratado_id from public.events where id = '00000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('CONTRATADO', '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'evento fica CONTRATADO com o músico escolhido');

select results_eq(
  $$ select status::text from public.event_candidates where event_id = '00000000-0000-0000-0000-0000000000e1' order by id $$,
  $$ values ('APROVADO'), ('RECUSADO') $$,
  'candidato escolhido é aprovado e os demais recusados');

select is((select status::text from public.payments where asaas_payment_id = 'pay_ok'), 'PAGO', 'pagamento fica PAGO');
select is(public.confirm_asaas_payment('pay_ok'), 'JA_PROCESSADO', 'notificação repetida é idempotente');

-- Uma segunda cobrança paga para um evento já contratado não troca o músico.
insert into public.payments (event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'pay_tardio', 500, now(), 'EXPIRADO');
select is(public.confirm_asaas_payment('pay_tardio'), 'EVENTO_INDISPONIVEL', 'pagamento tardio não substitui a contratação existente');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok($$ select public.confirm_asaas_payment('pay_ok') $$, '42501', null, 'cliente não pode confirmar pagamentos');
reset role;

-- ---------------------------------------------------------------------------
-- Dupla confirmação
-- ---------------------------------------------------------------------------

update public.events set confirmacao_contratante = true where id = '00000000-0000-0000-0000-0000000000e1';
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000000e1'), 'CONTRATADO', 'uma confirmação só não conclui o evento');

update public.events set confirmacao_musico = true where id = '00000000-0000-0000-0000-0000000000e1';
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000000e1'), 'CONCLUIDO', 'as duas confirmações concluem o evento');

-- Evento aberto não é concluído mesmo com as duas marcações.
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url, confirmacao_musico) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'Aberto', 'Corporativo', now() + interval '7 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e2.png', true);
update public.events set confirmacao_contratante = true where id = '00000000-0000-0000-0000-0000000000e2';
select is((select status::text from public.events where id = '00000000-0000-0000-0000-0000000000e2'), 'ABERTO', 'evento sem contratação nunca é concluído');

select * from finish();
rollback;
