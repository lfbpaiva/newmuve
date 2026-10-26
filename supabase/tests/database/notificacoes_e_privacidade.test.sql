begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'aviso-musico@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'aviso-contratante@example.com'),
  ('00000000-0000-0000-0000-0000000000f3', 'aviso-oculto@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000000f2', 'CONTRACTOR'),
  ('00000000-0000-0000-0000-0000000000f3', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000f1', 'Musico Aviso', '66666666666', '45999990006', 'https://x/f1.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000000f2', 'Bar Aviso', '44444444000144', '4532220004', 'https://x/f2.png', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000000f3', 'Pessoa Sem Evento', '55555555000155', '4532220005', 'https://x/f3.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url, status) values
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000f2', 'Show concluido', 'Bar e restaurante', now() - interval '2 days', 120, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e9.png', 'ABERTO');
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000f1');
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, expira_em) values
  ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000f2', 'pay_aviso', 550, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_aviso');
update public.events set confirmacao_musico = true, confirmacao_contratante = true where id = '00000000-0000-0000-0000-0000000000e9';
insert into public.notifications (user_id, titulo, texto, link) values
  ('00000000-0000-0000-0000-0000000000f1', 'Voce foi contratado', 'Texto', '/event/x'),
  ('00000000-0000-0000-0000-0000000000f2', 'Pagamento confirmado', 'Texto', '/event/x');

select ok(public.has_open_obligations('00000000-0000-0000-0000-0000000000f1'), 'musico com cache retido nao pode excluir a conta');
select ok(public.has_open_obligations('00000000-0000-0000-0000-0000000000f2'), 'contratante com repasse pendente nao pode excluir a conta');
update public.payments set repasse_status = 'REPASSADO' where id = '00000000-0000-0000-0000-0000000000a9';
select ok(not public.has_open_obligations('00000000-0000-0000-0000-0000000000f1'), 'apos o repasse a exclusao fica liberada');
select throws_ok(
  $$ insert into public.notifications (user_id, titulo, texto, link) values ('00000000-0000-0000-0000-0000000000f1', 'x', 'y', 'https://fora') $$,
  '23514', null, 'link de notificacao so aponta para telas do app');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select results_eq($$ select titulo from public.notifications $$, $$ values ('Voce foi contratado') $$, 'usuario le so as proprias notificacoes');
select throws_ok($$ select public.has_open_obligations('00000000-0000-0000-0000-0000000000f1') $$, '42501', null, 'cliente nao executa a checagem de pendencias');
select is((select count(*)::int from public.contractor_profiles where user_id = '00000000-0000-0000-0000-0000000000f2'), 1, 'musico ve o contratante do evento em que tocou');
select is((select count(*)::int from public.contractor_profiles where user_id = '00000000-0000-0000-0000-0000000000f3'), 0, 'contratante sem evento visivel nao aparece');
select throws_ok(
  $$ update public.notifications set lida = true $$,
  '42501', null, 'cliente nao altera notificacoes direto no banco');
reset role;

insert into public.reviews (event_id, author_id, reviewed_id, rating) values
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 5);
delete from public.events where id = '00000000-0000-0000-0000-0000000000e9';
select is((select count(*)::int from public.reviews where reviewed_id = '00000000-0000-0000-0000-0000000000f1'), 1, 'avaliacao recebida sobrevive a exclusao do evento');
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000f2';
select results_eq(
  $$ select author_id, rating::int from public.reviews where reviewed_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values (null::uuid, 5) $$,
  'avaliacao fica anonima quando o autor exclui a conta');

select * from finish();
rollback;
