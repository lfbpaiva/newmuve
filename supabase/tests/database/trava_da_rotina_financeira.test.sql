begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

create temp table donos (nome text primary key, id uuid);
insert into donos values
  ('a', '00000000-0000-4000-8000-0000000000a1'),
  ('b', '00000000-0000-4000-8000-0000000000b1'),
  ('c', '00000000-0000-4000-8000-0000000000c1');
create function pg_temp.dono(p_nome text) returns uuid language sql as $$ select id from donos where nome = p_nome; $$;
create function pg_temp.execucao() returns public.rotina_financeira_execucao language sql as $$ select * from public.rotina_financeira_execucao where id = 1; $$;

select ok((select relrowsecurity from pg_class where oid = 'public.rotina_financeira_execucao'::regclass), 'trava da rotina com RLS ligado');
select ok(
  has_function_privilege('service_role', 'public.adquirir_rotina_financeira(uuid, integer)', 'execute')
  and has_function_privilege('service_role', 'public.renovar_rotina_financeira(uuid, bigint, integer)', 'execute')
  and has_function_privilege('service_role', 'public.encerrar_rotina_financeira(uuid, bigint, text, text)', 'execute'),
  'a API executa as funcoes da trava');
select ok(
  not has_function_privilege('anon', 'public.adquirir_rotina_financeira(uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.adquirir_rotina_financeira(uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.renovar_rotina_financeira(uuid, bigint, integer)', 'execute')
  and not has_function_privilege('anon', 'public.encerrar_rotina_financeira(uuid, bigint, text, text)', 'execute'),
  'usuarios do app nao executam as funcoes da trava');
select ok(
  not has_table_privilege('anon', 'public.rotina_financeira_execucao', 'select')
  and not has_table_privilege('authenticated', 'public.rotina_financeira_execucao', 'select')
  and has_table_privilege('service_role', 'public.rotina_financeira_execucao', 'select')
  and not has_table_privilege('service_role', 'public.rotina_financeira_execucao', 'update'),
  'so a API le a trava, e nem ela altera a tabela diretamente');

select is((select count(*) from public.rotina_financeira_execucao), 1::bigint, 'existe uma unica linha de controle');
select is((pg_temp.execucao()).dono, null, 'a trava comeca livre');

select is(public.adquirir_rotina_financeira(pg_temp.dono('a'), 600), 1::bigint, 'a primeira execucao adquire a trava com a geracao 1');
select is(public.adquirir_rotina_financeira(pg_temp.dono('b'), 600), null, 'uma segunda execucao e recusada enquanto a primeira vale');
select is(public.adquirir_rotina_financeira(pg_temp.dono('a'), 600), null, 'o mesmo dono nao adquire de novo sem encerrar');

select is(public.renovar_rotina_financeira(pg_temp.dono('a'), 1, 600), true, 'o dono renova a validade');
select is(public.renovar_rotina_financeira(pg_temp.dono('b'), 1, 600), false, 'outro dono nao renova');
select is(public.renovar_rotina_financeira(pg_temp.dono('a'), 7, 600), false, 'renovacao com geracao errada e recusada');
select is(public.encerrar_rotina_financeira(pg_temp.dono('b'), 1, 'SUCESSO', null), false, 'outro dono nao encerra');
select is((pg_temp.execucao()).dono, pg_temp.dono('a'), 'a execucao continua com o dono original');

update public.rotina_financeira_execucao set valida_ate = now() - interval '1 second' where id = 1;
select is(public.renovar_rotina_financeira(pg_temp.dono('a'), 1, 600), false, 'trava vencida nao e renovada, nem pelo dono');
select is(public.adquirir_rotina_financeira(pg_temp.dono('b'), 600), 2::bigint, 'trava vencida e retomada por outra execucao com nova geracao');
select results_eq(
  $$ select ultimo_dono, ultimo_resultado, dono from public.rotina_financeira_execucao where id = 1 $$,
  $$ values (pg_temp.dono('a'), 'EXPIRADA', pg_temp.dono('b')) $$,
  'a execucao vencida fica registrada como EXPIRADA');
select is(public.encerrar_rotina_financeira(pg_temp.dono('a'), 1, 'SUCESSO', null), false, 'o dono antigo nao encerra a execucao nova');
select is(public.renovar_rotina_financeira(pg_temp.dono('a'), 2, 600), false, 'o dono antigo nao renova nem com a geracao nova');

select is(public.encerrar_rotina_financeira(pg_temp.dono('b'), 2, 'SUCESSO', null), true, 'o dono atual encerra');
select results_eq(
  $$ select dono, valida_ate, ultimo_dono, ultimo_resultado, ultimo_sucesso_em is not null, ultimo_erro from public.rotina_financeira_execucao where id = 1 $$,
  $$ values (null::uuid, null::timestamptz, pg_temp.dono('b'), 'SUCESSO', true, null::text) $$,
  'encerramento com sucesso libera a trava e registra o horario');
select is(public.encerrar_rotina_financeira(pg_temp.dono('b'), 2, 'SUCESSO', null), false, 'encerrar de novo nao faz nada');

create temp table sucesso_anterior as select ultimo_sucesso_em from public.rotina_financeira_execucao where id = 1;
select is(public.adquirir_rotina_financeira(pg_temp.dono('c'), 600), 3::bigint, 'nova execucao depois do encerramento');
select is(public.encerrar_rotina_financeira(pg_temp.dono('c'), 3, 'FALHA', repeat('x', 900)), true, 'encerramento com falha');
select results_eq(
  $$ select ultimo_resultado, char_length(ultimo_erro), ultimo_sucesso_em from public.rotina_financeira_execucao where id = 1 $$,
  $$ select 'FALHA', 500, ultimo_sucesso_em from sucesso_anterior $$,
  'a falha guarda o erro truncado e preserva o ultimo sucesso');

select throws_ok($$ select public.adquirir_rotina_financeira(gen_random_uuid(), 5) $$, 'P0001', 'parametros invalidos para a trava da rotina financeira', 'validade fora do limite e recusada');
select throws_ok($$ select public.encerrar_rotina_financeira(gen_random_uuid(), 1, 'OK', null) $$, 'P0001', 'resultado invalido para a rotina financeira', 'resultado desconhecido e recusado');
select throws_ok($$ insert into public.rotina_financeira_execucao (id) values (2) $$, '23514', null, 'nao ha segunda linha de controle');

select * from finish();
rollback;
