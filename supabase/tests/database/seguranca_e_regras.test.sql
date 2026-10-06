-- Testes de banco (pgTAP): isolamento entre perfis, permissões, match do feed
-- e restrições de integridade. Executar com: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Personagens:
--   m1: músico de Cascavel/PR (Rock, MPB)    m2: músico de Curitiba/PR (Jazz)
--   c1: contratante dono dos eventos         c2: outro contratante
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'm1@gmail.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'm2@gmail.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@gmail.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@gmail.com');

insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000c1', 'CONTRACTOR'),
  ('00000000-0000-0000-0000-0000000000c2', 'CONTRACTOR');

insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000a1', 'Músico Um', '11111111111', '45999990001', 'https://x/a1.png', '{Rock,MPB}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000000a2', 'Músico Dois', '22222222222', '41999990002', 'https://x/a2.png', '{Jazz}', 'PR', 'Curitiba');

insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000c1', 'Bar Um', '11111111000111', '4532220001', 'https://x/c1.png', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000000c2', 'Bar Dois', '22222222000122', '4532220002', 'https://x/c2.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url, status) values
  -- e1: compatível com m1 (cidade com caixa diferente)
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Rock em Cascavel', 'Bar e restaurante', now() + interval '7 days', 180, 'PR', 'CASCAVEL', '{Rock}', 500, 'https://x/e1.png', 'ABERTO'),
  -- e2: estilo fora do perfil de m1
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'Pagode em Cascavel', 'Festa particular', now() + interval '7 days', 120, 'PR', 'Cascavel', '{Pagode}', 300, 'https://x/e2.png', 'ABERTO'),
  -- e3: outra cidade
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1', 'Rock em Curitiba', 'Corporativo', now() + interval '7 days', 120, 'PR', 'Curitiba', '{Rock}', 300, 'https://x/e3.png', 'ABERTO'),
  -- e4: compatível, mas já contratado
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c1', 'MPB contratado', 'Corporativo', now() + interval '7 days', 120, 'PR', 'Cascavel', '{MPB}', 300, 'https://x/e4.png', 'CONTRATADO'),
  -- e5: compatível, mas já começou
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c1', 'Rock de ontem', 'Corporativo', now() - interval '1 day', 120, 'PR', 'Cascavel', '{Rock}', 300, 'https://x/e5.png', 'ABERTO');

-- m1 se candidata ao evento e1 (de c1).
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.payments (event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'pay_1', 500, now() + interval '15 minutes');

-- ---------------------------------------------------------------------------
-- Integridade (como service_role/postgres)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.events (contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
     values ('00000000-0000-0000-0000-0000000000c1', 'Barato', 'Corporativo', now() + interval '1 day', 60, 'PR', 'Cascavel', '{Rock}', 99.99, 'https://x/e.png') $$,
  '23514', null, 'cachê abaixo de R$ 100,00 é rejeitado');

select throws_ok(
  $$ insert into public.event_candidates (event_id, musician_id)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1') $$,
  '23505', null, 'músico não se candidata duas vezes ao mesmo evento');

select throws_ok(
  $$ insert into public.payments (event_id, contractor_id, asaas_payment_id, valor, expira_em)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'pay_2', 500, now()) $$,
  '23505', null, 'evento não pode ter duas cobranças pendentes');

select throws_ok(
  $$ insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade)
     values ('00000000-0000-0000-0000-0000000000c2', 'Sem estilo', '33333333333', '45999990003', 'https://x/a.png', '{}', 'PR', 'Cascavel') $$,
  '23514', null, 'músico precisa de ao menos um estilo');

select throws_ok(
  $$ insert into public.reviews (event_id, author_id, reviewed_id, rating)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 6) $$,
  '23514', null, 'nota fora de 1 a 5 é rejeitada');

insert into public.reviews (event_id, author_id, reviewed_id, rating) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 5),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 4);

select results_eq(
  $$ select total_avaliacoes, avaliacao_media from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values (2, 4.50::numeric(3,2)) $$,
  'média e total de avaliações do músico são recalculados');

-- ---------------------------------------------------------------------------
-- Visitante não autenticado
-- ---------------------------------------------------------------------------

set local role anon;
select throws_ok($$ select 1 from public.events $$, '42501', null, 'anônimo não lê eventos');
select throws_ok($$ select * from public.musician_feed() $$, '42501', null, 'anônimo não executa o feed');
reset role;

-- ---------------------------------------------------------------------------
-- Músico m1
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select results_eq(
  $$ select event_id from public.musician_feed() $$,
  $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'feed só traz evento aberto, futuro, da mesma cidade e de estilo compatível');

select is((select count(*) from public.musician_profiles), 1::bigint, 'músico não enxerga outros músicos');
select throws_ok($$ select documento from public.musician_profiles $$, '42501', null, 'CPF não é legível pelo cliente');
select throws_ok($$ select telefone from public.contractor_profiles $$, '42501', null, 'telefone do contratante não é legível pelo cliente');
select is((select count(*) from public.events where id = '00000000-0000-0000-0000-0000000000e4'), 0::bigint, 'músico não vê evento contratado de terceiros');
select is((select count(*) from public.payments), 0::bigint, 'músico não lê pagamentos');
select is((select count(*) from public.profiles), 1::bigint, 'usuário só lê o próprio registro em profiles');

select throws_ok(
  $$ insert into public.event_candidates (event_id, musician_id)
     values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'cliente não escreve direto no banco (candidatura)');
select throws_ok(
  $$ update public.musician_profiles set avaliacao_media = 5 $$,
  '42501', null, 'cliente não altera a própria avaliação');

-- ---------------------------------------------------------------------------
-- Músico m2 (não se candidatou a nada)
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is((select count(*) from public.event_candidates), 0::bigint, 'músico não vê candidaturas de outro músico');
select is((select count(*) from public.reviews), 0::bigint, 'músico não lê avaliações de outro músico');

-- ---------------------------------------------------------------------------
-- Contratantes
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select results_eq(
  $$ select user_id from public.musician_profiles $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'contratante só enxerga músicos candidatos aos próprios eventos');
select is((select count(*) from public.payments), 1::bigint, 'contratante lê os próprios pagamentos');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select is((select count(*) from public.musician_profiles), 0::bigint, 'contratante sem candidatos não enxerga músicos');
select is((select count(*) from public.payments), 0::bigint, 'contratante não lê pagamentos de outro');

select * from finish();
rollback;
