-- Testes de banco (pgTAP): endereço do evento, reputação do contratante,
-- retenção do valor e reabertura do evento.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'm1@exemplo.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'm2@exemplo.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@exemplo.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@exemplo.com');

insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c1', 'CONTRACTOR'),
  ('00000000-0000-0000-0000-0000000000c2', 'CONTRACTOR');

-- Músico com CNPJ e contratante com CPF: os dois documentos valem para os dois perfis.
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade, chave_pix_tipo, chave_pix) values
  ('00000000-0000-0000-0000-0000000000a1', 'Banda Um', '11222333000181', '45999990001', 'https://x/a1.png', '{Rock}', 'PR', 'Cascavel', 'EMAIL', 'm1@exemplo.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'Músico Dois', '22222222222', '45999990002', 'https://x/a2.png', '{Rock}', 'PR', 'Cascavel', null, null);

insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000c1', 'Maria Silva', '52998224725', '4532220001', 'https://x/c1.png', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000000c2', 'Bar Dois', '22222222000122', '4532220002', 'https://x/c2.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Rock em Cascavel', 'Festa particular', now() + interval '7 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e1.png');

insert into public.event_locations (event_id, endereco) values
  ('00000000-0000-0000-0000-0000000000e1', 'Rua das Flores, 123 - Centro');

insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2');

-- Cobrança de R$ 550,00: R$ 500,00 de cachê + R$ 50,00 de comissão.
insert into public.payments (event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'pay_ok', 550, 50, now() + interval '15 minutes');

select is((select valor_cache from public.payments where asaas_payment_id = 'pay_ok'), 500.00::numeric, 'cachê a repassar = total - comissão');

select throws_ok(
  $$ update public.musician_profiles set chave_pix = 'x' where user_id = '00000000-0000-0000-0000-0000000000a2' $$,
  '23514', null, 'chave Pix exige o tipo da chave');

-- ---------------------------------------------------------------------------
-- Endereço do evento
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select count(*) from public.event_locations), 0::bigint, 'músico não lê o endereço direto no banco');
select throws_ok($$ select chave_pix from public.musician_profiles $$, '42501', null, 'chave Pix não é legível pelo cliente');
select results_eq(
  $$ select total_avaliacoes from public.contractor_profiles where user_id = '00000000-0000-0000-0000-0000000000c1' $$,
  $$ values (0) $$,
  'músico enxerga a reputação do contratante');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select is((select count(*) from public.event_locations), 0::bigint, 'outro contratante não lê o endereço');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select is((select endereco from public.event_locations), 'Rua das Flores, 123 - Centro', 'dono do evento lê o endereço');
reset role;

-- ---------------------------------------------------------------------------
-- Retenção, reputação e reabertura
-- ---------------------------------------------------------------------------

select public.confirm_asaas_payment('pay_ok');
select is((select repasse_status::text from public.payments where asaas_payment_id = 'pay_ok'), 'RETIDO', 'pagamento confirmado fica retido até a conclusão');

insert into public.reviews (event_id, author_id, reviewed_id, rating) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 4);
select results_eq(
  $$ select total_avaliacoes, avaliacao_media from public.contractor_profiles where user_id = '00000000-0000-0000-0000-0000000000c1' $$,
  $$ values (1, 4.00::numeric(3,2)) $$,
  'média do contratante é recalculada');

select public.reopen_event('00000000-0000-0000-0000-0000000000e1');
select results_eq(
  $$ select status::text, musico_contratado_id from public.events where id = '00000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('ABERTO', null::uuid) $$,
  'evento reaberto volta a ABERTO sem músico');
select results_eq(
  $$ select musician_id, status::text from public.event_candidates where event_id = '00000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a2'::uuid, 'PENDENTE') $$,
  'quem desistiu sai da lista e os demais voltam a concorrer');

select throws_ok(
  $$ select public.reopen_event('00000000-0000-0000-0000-0000000000e1') $$,
  'P0001', null, 'só evento contratado pode ser reaberto');

select * from finish();
rollback;
