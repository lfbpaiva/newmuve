begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'fluxo-musico-a@example.com'),
  ('00000000-0000-0000-0000-0000000001a2', 'fluxo-musico-b@example.com'),
  ('00000000-0000-0000-0000-0000000001a3', 'fluxo-musico-c@example.com'),
  ('00000000-0000-0000-0000-0000000001c1', 'fluxo-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000001a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000001a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000001a3', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000001c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000001a1', 'Musico A', '77777777777', '45999990007', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000001a2', 'Musico B', '88888888888', '45999990008', 'https://x/b.png', '{Rock}', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000001a3', 'Musico C', '99999999999', '45999990009', 'https://x/c.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000001c1', 'Bar Fluxo', '66666666000166', '4532220006', 'https://x/c.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001c1', 'Show 1', 'Bar e restaurante', now() + interval '3 days', 180, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/1.png'),
  ('00000000-0000-0000-0000-0000000001e2', '00000000-0000-0000-0000-0000000001c1', 'Show 2 no mesmo horario', 'Bar e restaurante', now() + interval '3 days 1 hour', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/2.png'),
  ('00000000-0000-0000-0000-0000000001e3', '00000000-0000-0000-0000-0000000001c1', 'Show ja comecou', 'Bar e restaurante', now() - interval '10 minutes', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/3.png');
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001a1'),
  ('00000000-0000-0000-0000-0000000001d2', '00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001a2'),
  ('00000000-0000-0000-0000-0000000001d3', '00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001a3'),
  ('00000000-0000-0000-0000-0000000001d4', '00000000-0000-0000-0000-0000000001e2', '00000000-0000-0000-0000-0000000001a1'),
  ('00000000-0000-0000-0000-0000000001d5', '00000000-0000-0000-0000-0000000001e3', '00000000-0000-0000-0000-0000000001a2');
update public.event_candidates set status = 'RECUSADO', motivo_recusa = 'CONTRATANTE' where id = '00000000-0000-0000-0000-0000000001d3';
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000001f1', '00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000001c1', 'pay_fluxo_1', 550, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-0000000001f2', '00000000-0000-0000-0000-0000000001e2', '00000000-0000-0000-0000-0000000001d4', '00000000-0000-0000-0000-0000000001c1', 'pay_fluxo_2', 550, now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-0000000001f3', '00000000-0000-0000-0000-0000000001e3', '00000000-0000-0000-0000-0000000001d5', '00000000-0000-0000-0000-0000000001c1', 'pay_fluxo_3', 550, now() + interval '15 minutes');

select is(public.confirm_asaas_payment('pay_fluxo_1'), 'CONTRATADO', 'primeira contratacao do musico A');
select results_eq(
  $$ select id::text, status::text, motivo_recusa from public.event_candidates where event_id = '00000000-0000-0000-0000-0000000001e1' order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000001d1', 'APROVADO', null), ('00000000-0000-0000-0000-0000000001d2', 'RECUSADO', 'OUTRO_CONTRATADO'), ('00000000-0000-0000-0000-0000000001d3', 'RECUSADO', 'CONTRATANTE') $$,
  'quem perdeu para o contratado e quem foi recusado ficam com motivos diferentes');
select is(public.confirm_asaas_payment('pay_fluxo_2'), 'EVENTO_INDISPONIVEL', 'musico ja contratado no horario nao e contratado de novo');
select is(public.confirm_asaas_payment('pay_fluxo_3'), 'EVENTO_INDISPONIVEL', 'pix pago depois do inicio do show nao contrata');

select public.reopen_event('00000000-0000-0000-0000-0000000001e1');
select results_eq(
  $$ select id::text, status::text from public.event_candidates where event_id = '00000000-0000-0000-0000-0000000001e1' order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000001d2', 'PENDENTE'), ('00000000-0000-0000-0000-0000000001d3', 'RECUSADO') $$,
  'na desistencia so volta quem perdeu para o contratado');

update public.events set status = 'CONCLUIDO' where id = '00000000-0000-0000-0000-0000000001e3';
delete from public.contractor_profiles where user_id = '00000000-0000-0000-0000-0000000001c1';
select is((select count(*)::int from public.events where id = '00000000-0000-0000-0000-0000000001e3'), 1, 'show passado continua quando o contratante sai');
select is((select contractor_id from public.events where id = '00000000-0000-0000-0000-0000000001e3'), null::uuid, 'show passado fica sem contratante');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';
select throws_ok($$ select public.musician_has_conflict('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-0000000001e2') $$, '42501', null, 'cliente nao consulta a agenda de outros musicos');
reset role;

select * from finish();
rollback;
