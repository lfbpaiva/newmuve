begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c4a1', 'cont-musico@example.com'),
  ('00000000-0000-0000-0000-00000000c4c1', 'cont-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000c4a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c4c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c4a1', 'Musico Contestacao', '73333333333', '45999990041', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c4c1', 'Bar Contestacao', '73333333000173', '4532220041', 'https://x/c.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000c4e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c4c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from generate_series(1, 4) n;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000c4d' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c4e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c4a1'
from generate_series(1, 4) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000c4f' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c4e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000c4d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c4c1', 'pay_cont_' || n, 550, 50, now() + interval '15 minutes'
from generate_series(1, 3) n;
select public.confirm_asaas_payment('pay_cont_' || n) from generate_series(1, 3) n;
insert into public.penalties (id, musician_id, tipo, multa) values
  ('00000000-0000-0000-0000-0000000c4a01', '00000000-0000-0000-0000-00000000c4a1', 'AUSENCIA', 100);

create function pg_temp.contestar(p_evento uuid) returns text language sql as $$
  select resultado from public.abrir_contestacao(p_evento, '00000000-0000-0000-0000-00000000c4c1', 'O show não aconteceu como combinado.');
$$;

select has_function('public', 'abrir_contestacao', array['uuid', 'uuid', 'text'], 'funcao de abertura de contestacao existe');
select ok(has_function_privilege('service_role', 'public.abrir_contestacao(uuid, uuid, text)', 'execute'), 'a API abre contestacoes pela funcao');
select ok(
  not has_function_privilege('authenticated', 'public.abrir_contestacao(uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.abrir_contestacao(uuid, uuid, text)', 'execute'),
  'o app nao abre contestacoes direto no banco');
select ok(
  (select prosecdef and proconfig::text = '{"search_path=\"\""}' from pg_proc where oid = 'public.abrir_contestacao(uuid, uuid, text)'::regprocedure),
  'funcao com security definer e search_path vazio');

select results_eq(
  $$ select resultado, contestacao_id is not null from public.abrir_contestacao('00000000-0000-0000-0000-0000000c4e01', '00000000-0000-0000-0000-00000000c4c1', 'O show não aconteceu como combinado.') $$,
  $$ values ('ABERTA', true) $$,
  'contestacao aberta enquanto o repasse esta retido');
select results_eq(
  $$ select aberta_por, status, decisao from public.disputes where event_id = '00000000-0000-0000-0000-0000000c4e01' $$,
  $$ values ('00000000-0000-0000-0000-00000000c4c1'::uuid, 'ABERTA', null::text) $$,
  'contestacao gravada com quem abriu');
select is(pg_temp.contestar('00000000-0000-0000-0000-0000000c4e01'), 'CONTESTACAO_EXISTENTE', 'segunda contestacao aberta do mesmo evento e recusada');
select is((select count(*)::int from public.disputes where event_id = '00000000-0000-0000-0000-0000000c4e01'), 1, 'continua existindo uma contestacao so');
select throws_ok(
  $$ select * from public.abrir_contestacao('00000000-0000-0000-0000-0000000c4e02', '00000000-0000-0000-0000-00000000c4c1', 'curto') $$,
  '23514', null, 'motivo fora das regras da tabela continua sendo recusado');

select results_eq(
  $$ select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c4f01') $$,
  $$ values (null::uuid) $$,
  'repasse nao e reivindicado com contestacao aberta');
select results_eq(
  $$ select repasse_status::text, multa_descontada from public.payments where id = '00000000-0000-0000-0000-0000000c4f01' $$,
  $$ values ('RETIDO', 0.00::numeric(10, 2)) $$,
  'o pagamento continua retido e sem desconto');
select is((select count(*)::int from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c4f01'), 0, 'nenhuma tentativa de repasse e criada');
select is((select reserva_payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000c4a01'), null, 'nenhuma multa e reservada pela reivindicacao recusada');

update public.disputes set status = 'RESOLVIDA', decisao = 'PAGAR_MUSICO', resolvida_em = now() where event_id = '00000000-0000-0000-0000-0000000c4e01';
select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c4f01')), null, 'depois da decisao da contestacao o repasse pode ser reivindicado');
select is(pg_temp.contestar('00000000-0000-0000-0000-0000000c4e01'), 'REPASSE_INICIADO', 'contestacao recusada com o repasse em processamento');
select is((select count(*)::int from public.disputes where event_id = '00000000-0000-0000-0000-0000000c4e01' and status = 'ABERTA'), 0, 'nenhuma contestacao nova com o repasse em processamento');

select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c4f02')), null, 'repasse do segundo evento reivindicado');
select is(public.registrar_transferencia((select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c4f02'), 'tra_cont_2'), 'REGISTRADA', 'transferencia registrada');
select is(public.concluir_tentativa((select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c4f02'), 'tra_cont_2'), 'CONCLUIDA', 'repasse concluido');
select is(pg_temp.contestar('00000000-0000-0000-0000-0000000c4e02'), 'REPASSE_INICIADO', 'contestacao recusada depois do repasse concluido');

select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c4f03')), null, 'repasse do terceiro evento reivindicado');
select is(public.falhar_tentativa((select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c4f03'), null), true, 'repasse recusado pela Asaas volta a falho');
select is(pg_temp.contestar('00000000-0000-0000-0000-0000000c4e03'), 'ABERTA', 'repasse falho ainda pode ser contestado');
select results_eq(
  $$ select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c4f03') $$,
  $$ values (null::uuid) $$,
  'nova tentativa de repasse falho e bloqueada pela contestacao');

select is(pg_temp.contestar('00000000-0000-0000-0000-0000000c4e04'), 'ABERTA', 'evento sem pagamento confirmado apenas grava a contestacao');

select is(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'payments_uma_paga_por_evento'),
  'CREATE UNIQUE INDEX payments_uma_paga_por_evento ON public.payments USING btree (event_id) WHERE (status = ''PAGO''::payment_status)',
  'indice garante no maximo um pagamento confirmado por evento');
select throws_ok(
  $$ insert into public.payments (event_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em, status)
     values ('00000000-0000-0000-0000-0000000c4e01', '00000000-0000-0000-0000-00000000c4c1', 'pay_cont_duplicado', 550, 50, now(), 'PAGO') $$,
  '23505', null, 'um segundo pagamento confirmado no mesmo evento e recusado');
select results_eq(
  $$ select tentativa_id from public.claim_payout(gen_random_uuid()) $$,
  $$ values (null::uuid) $$,
  'pagamento inexistente continua sendo recusado na reivindicacao');
select ok(
  (select bool_and(has_function_privilege('service_role', oid, 'execute') and not has_function_privilege('anon', oid, 'execute') and not has_function_privilege('authenticated', oid, 'execute'))
   from pg_proc where oid in ('public.abrir_contestacao(uuid, uuid, text)'::regprocedure, 'public.claim_payout(uuid)'::regprocedure)),
  'funcoes recriadas mantem as permissoes: so a API executa');

select * from finish();
rollback;
