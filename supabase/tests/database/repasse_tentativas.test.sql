begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c3a1', 'tent-musico@example.com'),
  ('00000000-0000-0000-0000-00000000c3c1', 'tent-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000c3a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c3c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c3a1', 'Musico Tentativa', '72222222222', '45999990031', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c3c1', 'Bar Tentativa', '72222222000172', '4532220031', 'https://x/c.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000c3e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c3c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from generate_series(1, 12) n;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000c3d' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c3e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c3a1'
from generate_series(1, 12) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000c3f' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c3e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000c3d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c3c1', 'pay_tent_' || n, 550, 50, now() + interval '15 minutes'
from generate_series(1, 12) n;
select public.confirm_asaas_payment('pay_tent_' || n) from generate_series(1, 12) n;

insert into public.penalties (id, musician_id, tipo, multa) values
  ('00000000-0000-0000-0000-0000000c3a01', '00000000-0000-0000-0000-00000000c3a1', 'AUSENCIA', 100);

create temp table fixo (nome text primary key, valor text);
insert into fixo values ('declaracao', public.declaracao_ausencia_repasse());

select has_table('public', 'repasse_tentativas', 'tabela de tentativas existe');
select has_table('public', 'repasse_decisoes', 'tabela de decisoes existe');
select has_table('public', 'repasse_alertas', 'tabela de alertas existe');
select results_eq(
  $$ select bool_and(relrowsecurity) from pg_class where oid in ('public.repasse_tentativas'::regclass, 'public.repasse_decisoes'::regclass, 'public.repasse_alertas'::regclass) $$,
  $$ values (true) $$,
  'RLS ligada nas tres tabelas');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('repasse_tentativas', 'repasse_decisoes', 'repasse_alertas')), 0, 'nenhuma policy: o app nao le nem escreve');
select ok(not has_table_privilege('authenticated', 'public.repasse_tentativas', 'select'), 'usuario autenticado nao le tentativas');
select ok(not has_table_privilege('anon', 'public.repasse_decisoes', 'select'), 'anonimo nao le decisoes');
select ok(has_table_privilege('service_role', 'public.repasse_tentativas', 'select'), 'a API le as tentativas');
select ok(
  not has_table_privilege('service_role', 'public.repasse_tentativas', 'insert')
  and not has_table_privilege('service_role', 'public.repasse_tentativas', 'update')
  and not has_table_privilege('service_role', 'public.repasse_tentativas', 'delete'),
  'a API nao altera tentativas diretamente, so pelas funcoes');
select ok(
  not has_table_privilege('service_role', 'public.repasse_decisoes', 'insert')
  and not has_table_privilege('service_role', 'public.repasse_decisoes', 'update')
  and not has_table_privilege('service_role', 'public.repasse_alertas', 'delete'),
  'a API nao grava decisoes nem apaga alertas diretamente');
select ok(
  has_function_privilege('service_role', 'public.iniciar_verificacao_ausencia(uuid, text, text, date, timestamptz, boolean, integer, integer, integer)', 'execute')
  and has_function_privilege('service_role', 'public.confirmar_ausencia(uuid, text, text, text, date, timestamptz, boolean, integer, integer, integer)', 'execute')
  and has_function_privilege('service_role', 'public.claim_payout(uuid)', 'execute'),
  'a API executa as funcoes de repasse');
select ok(
  not has_function_privilege('service_role', 'public.importar_repasses_legados()', 'execute')
  and not has_function_privilege('service_role', 'public.encerrar_tentativa_sem_repasse(uuid, uuid, text)', 'execute'),
  'importacao e encerramento interno nao sao chamados pela API');
select ok(
  not has_function_privilege('authenticated', 'public.confirmar_ausencia(uuid, text, text, text, date, timestamptz, boolean, integer, integer, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_transferencia(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.claim_payout(uuid)', 'execute'),
  'o app nao executa as funcoes de repasse');

select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c3f01')), null, 'reivindicacao cria a tentativa');
create temp table g1 as select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c3f01';
select throws_ok(
  $$ insert into public.repasse_tentativas (payment_id, origem, estado, referencia_externa) values ('00000000-0000-0000-0000-0000000c3f01', 'LEGADO', 'INCONCLUSIVA', 'x') $$,
  '23505', null, 'no maximo uma tentativa aberta por pagamento');
select throws_ok(
  $$ insert into public.repasse_tentativas (payment_id, origem, estado, referencia_externa) values ('00000000-0000-0000-0000-0000000c3f12', 'LEGADO', 'PENDENTE', 'x') $$,
  '23514', null, 'tentativa pendente exige transferencia');
select throws_ok(
  $$ insert into public.repasse_tentativas (payment_id, origem, estado, referencia_externa) values ('00000000-0000-0000-0000-0000000c3f12', 'ATUAL', 'INCONCLUSIVA', 'outra') $$,
  '23514', null, 'tentativa atual usa a propria identificacao como referencia');

select is(public.marcar_tentativa_inconclusiva((select id from g1)), true, 'solicitacao sem resposta vira inconclusiva');
select is(public.marcar_tentativa_inconclusiva((select id from g1)), false, 'marcar de novo nao muda nada');
select is(public.falhar_tentativa((select id from g1), null), false, 'tentativa inconclusiva nunca e liberada como falha sem prova');

select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c3f02')), null, 'segunda tentativa criada');
select isnt((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c3f03')), null, 'terceira tentativa criada');
select public.registrar_pedido_enviado(id) from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c3f02';
update public.repasse_tentativas set solicitada_em = now() - interval '11 minutes' where payment_id = '00000000-0000-0000-0000-0000000c3f02';
select is(public.marcar_solicitacoes_paradas(), 1, 'a rotina marca como inconclusivas apenas as solicitacoes com mais de 10 minutos');
select results_eq(
  $$ select estado from public.repasse_tentativas where payment_id in ('00000000-0000-0000-0000-0000000c3f02', '00000000-0000-0000-0000-0000000c3f03') order by payment_id $$,
  $$ values ('INCONCLUSIVA'), ('SOLICITANDO') $$,
  'solicitacao recente continua em andamento');

create function pg_temp.verificar(p_tentativa uuid, p_operador text default 'Ana Suporte', p_referencia text default null, p_desde date default current_date - 30,
  p_busca timestamptz default now(), p_completa boolean default true, p_encontradas integer default 0)
returns text language sql as $$
  select public.iniciar_verificacao_ausencia(p_tentativa, p_operador, coalesce(p_referencia, p_tentativa::text), p_desde, p_busca, p_completa, 2, 150, p_encontradas);
$$;
create function pg_temp.confirmar(p_tentativa uuid, p_declaracao text default null, p_busca timestamptz default now(), p_completa boolean default true, p_encontradas integer default 0)
returns text language sql as $$
  select public.confirmar_ausencia(p_tentativa, 'Ana Suporte', coalesce(p_declaracao, (select valor from fixo where nome = 'declaracao')),
    p_tentativa::text, current_date - 30, p_busca, p_completa, 3, 151, p_encontradas);
$$;

select is(pg_temp.verificar((select id from g1)), 'PRAZO_NAO_ATINGIDO', 'verificacao recusada antes de 24 horas da solicitacao');
update public.repasse_tentativas set solicitada_em = now() - interval '25 hours' where id = (select id from g1);
select is(pg_temp.verificar((select id from g1), p_busca => now() - interval '2 hours'), 'BUSCA_ANTES_DO_PRAZO', 'busca feita antes do prazo nao vale');
select is(pg_temp.verificar((select id from g1), p_busca => now() - interval '20 minutes'), 'BUSCA_DESATUALIZADA', 'busca antiga nao vale');
select is(pg_temp.verificar((select id from g1), p_busca => now() + interval '5 minutes'), 'BUSCA_DESATUALIZADA', 'busca com data futura nao vale');
select is(pg_temp.verificar((select id from g1), p_completa => false), 'BUSCA_INCOMPLETA', 'busca incompleta nunca conta como ausencia');
select is(pg_temp.verificar((select id from g1), p_encontradas => 1), 'TRANSFERENCIA_ENCONTRADA', 'busca com transferencia encontrada nao libera');
select is(pg_temp.verificar((select id from g1), p_referencia => '00000000-0000-0000-0000-0000000c3f01'), 'REFERENCIA_DIVERGENTE', 'busca por outra referencia nao vale');
select is(pg_temp.verificar((select id from g1), p_desde => current_date), 'JANELA_INSUFICIENTE', 'busca precisa cobrir desde um dia antes da solicitacao');
select is(pg_temp.verificar((select id from g1), p_operador => '  '), 'OPERADOR_INVALIDO', 'verificacao exige o nome informado do operador');
select is((select estado from public.repasse_tentativas where id = (select id from g1)), 'INCONCLUSIVA', 'recusas nao mudam a tentativa');
select is(pg_temp.verificar((select id from g1)), 'VERIFICACAO_INICIADA', 'verificacao comeca com a busca completa e vazia depois do prazo');
select results_eq(
  $$ select t.estado, d.etapa, d.operador_nome_informado, d.identidade_autenticada, d.declaracao is null
     from public.repasse_tentativas t join public.repasse_decisoes d on d.tentativa_id = t.id where t.id = (select id from g1) $$,
  $$ values ('EM_VERIFICACAO', 'VERIFICACAO', 'Ana Suporte', false, true) $$,
  'a decisao registra o nome informado, sem tratar como identidade autenticada');
select is(pg_temp.verificar((select id from g1)), 'ESTADO_INVALIDO', 'verificacao nao pode ser iniciada duas vezes');
select throws_ok(
  $$ update public.repasse_decisoes set identidade_autenticada = true where tentativa_id = (select id from g1) $$,
  '23514', null, 'nenhuma decisao pode se declarar autenticada');

select is(pg_temp.confirmar((select id from g1)), 'PRAZO_NAO_ATINGIDO', 'confirmacao recusada antes de 1 hora da verificacao');
update public.repasse_tentativas set verificacao_iniciada_em = now() - interval '61 minutes' where id = (select id from g1);
select is(pg_temp.confirmar((select id from g1), p_declaracao => 'confirmo'), 'DECLARACAO_INVALIDA', 'confirmacao exige a declaracao padrao');
select is(pg_temp.confirmar((select id from g1), p_busca => now() - interval '2 minutes'), 'BUSCA_ANTES_DO_PRAZO', 'a segunda busca precisa ser feita depois de 1 hora da primeira');
select is(pg_temp.confirmar((select id from g1), p_completa => false), 'BUSCA_INCOMPLETA', 'segunda busca incompleta nao confirma');
select is(pg_temp.confirmar((select id from g1), p_encontradas => 1), 'TRANSFERENCIA_ENCONTRADA', 'segunda busca com transferencia nao confirma');
select is(pg_temp.confirmar(gen_random_uuid()), 'TENTATIVA_NAO_ENCONTRADA', 'tentativa inexistente nao e confirmada');
select is((select reserva_payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000c3a01'), '00000000-0000-0000-0000-0000000c3f01'::uuid, 'a multa continua reservada enquanto a ausencia nao e confirmada');
select is(pg_temp.confirmar((select id from g1)), 'AUSENCIA_CONFIRMADA', 'ausencia confirmada com a segunda busca vazia depois de 1 hora');
select results_eq(
  $$ select t.estado, t.encerrada_em is not null, p.repasse_status::text, p.multa_descontada, p.repasse_asaas_id
     from public.repasse_tentativas t join public.payments p on p.id = t.payment_id where t.id = (select id from g1) $$,
  $$ values ('AUSENCIA_CONFIRMADA', true, 'FALHOU', 0.00::numeric(10, 2), null::text) $$,
  'ausencia confirmada encerra a tentativa e libera o pagamento para nova tentativa');
select is((select reserva_payment_id from public.penalties where id = '00000000-0000-0000-0000-0000000c3a01'), null, 'a multa reservada volta a ficar livre');
select results_eq(
  $$ select etapa, coalesce(declaracao = (select valor from fixo where nome = 'declaracao'), false), paginas_consultadas, transferencias_listadas from public.repasse_decisoes where tentativa_id = (select id from g1) order by registrada_em, etapa $$,
  $$ values ('CONFIRMACAO', true, 3, 151), ('VERIFICACAO', false, 2, 150) $$,
  'as duas decisoes ficam registradas com o resultado de cada busca');
select is(pg_temp.confirmar((select id from g1)), 'ESTADO_INVALIDO', 'confirmacao nao se repete');

select is(public.registrar_transferencia((select id from g1), 'tra_tent_tardia'), 'TARDIA', 'resposta tardia depois da ausencia confirmada vira alerta');
select is(public.concluir_tentativa((select id from g1), 'tra_tent_tardia'), 'ALERTA', 'transferencia concluida de tentativa encerrada nunca e adotada');
select results_eq(
  $$ select tipo from public.repasse_alertas where tentativa_id = (select id from g1) order by tipo $$,
  $$ values ('POSSIVEL_DUPLICIDADE'), ('RESPOSTA_TARDIA') $$,
  'alertas de resposta tardia e possivel duplicidade registrados');
select is((select repasse_status::text from public.payments where id = '00000000-0000-0000-0000-0000000c3f01'), 'FALHOU', 'o alerta nao conclui o repasse');
select public.reabrir_repasses_falhos((select e.musico_contratado_id from public.events e join public.payments p on p.event_id = e.id where p.id = '00000000-0000-0000-0000-0000000c3f01'));
select is((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c3f01')), null, 'repasse com alerta de transferencia tardia nao volta para a fila, nem com chave nova');

update public.repasse_tentativas set solicitada_em = now() - interval '25 hours' where payment_id = '00000000-0000-0000-0000-0000000c3f02';
select is(pg_temp.verificar((select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c3f02')), 'VERIFICACAO_INICIADA', 'segunda tentativa entra em verificacao');
select is(public.registrar_transferencia((select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c3f02'), 'tra_tent_achada'), 'REGISTRADA', 'transferencia encontrada durante a verificacao e registrada');
update public.repasse_tentativas set verificacao_iniciada_em = now() - interval '2 hours' where payment_id = '00000000-0000-0000-0000-0000000c3f02';
select is(pg_temp.confirmar((select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c3f02')), 'ESTADO_INVALIDO', 'tentativa com transferencia registrada nunca tem ausencia confirmada');
select is(public.registrar_transferencia((select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c3f03'), 'tra_tent_achada'), 'RECUSADA', 'a mesma transferencia nao pode pertencer a duas tentativas');
select is(pg_temp.confirmar((select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c3f03')), 'ESTADO_INVALIDO', 'confirmacao sem verificacao e recusada');

update public.payments set repasse_status = 'REPASSADO', repasse_asaas_id = 'tra_imp_1', repassado_em = now() - interval '3 days' where id = '00000000-0000-0000-0000-0000000c3f04';
update public.payments set repasse_status = 'PROCESSANDO', repasse_asaas_id = 'tra_imp_2' where id = '00000000-0000-0000-0000-0000000c3f05';
update public.payments set repasse_status = 'PROCESSANDO' where id = '00000000-0000-0000-0000-0000000c3f06';
update public.payments set repasse_status = 'FALHOU', repasse_asaas_id = 'tra_imp_4' where id = '00000000-0000-0000-0000-0000000c3f07';
update public.payments set repasse_status = 'FALHOU', repasse_asaas_id_anterior = 'tra_imp_5a' where id = '00000000-0000-0000-0000-0000000c3f08';
update public.payments set repasse_status = 'PROCESSANDO', repasse_asaas_id = 'tra_imp_6', repasse_asaas_id_anterior = 'tra_imp_6' where id = '00000000-0000-0000-0000-0000000c3f09';
update public.payments set repasse_status = 'REPASSADO', repasse_asaas_id = 'tra_imp_7', repasse_asaas_id_anterior = 'tra_imp_7a' where id = '00000000-0000-0000-0000-0000000c3f10';
create temp table pagamentos_antes as
  select id, status, repasse_status, repasse_asaas_id, repasse_asaas_id_anterior, multa_descontada, repassado_em from public.payments
  where id::text like '00000000-0000-0000-0000-0000000c3f%';

select is(public.importar_repasses_legados(), 8, 'importacao cria uma tentativa por identificador historico, sem duplicar');
select results_eq(
  $$ select p.asaas_payment_id, t.origem, t.estado, t.asaas_transfer_id, t.referencia_externa = p.id::text
     from public.repasse_tentativas t join public.payments p on p.id = t.payment_id
     where p.id::text like '00000000-0000-0000-0000-0000000c3f%' and t.origem = 'LEGADO'
     order by p.asaas_payment_id, t.estado $$,
  $$ values
     ('pay_tent_10', 'LEGADO', 'CONCLUIDA', 'tra_imp_7', true),
     ('pay_tent_10', 'LEGADO', 'FALHOU', 'tra_imp_7a', true),
     ('pay_tent_4', 'LEGADO', 'CONCLUIDA', 'tra_imp_1', true),
     ('pay_tent_5', 'LEGADO', 'PENDENTE', 'tra_imp_2', true),
     ('pay_tent_6', 'LEGADO', 'INCONCLUSIVA', null, true),
     ('pay_tent_7', 'LEGADO', 'INCONCLUSIVA', 'tra_imp_4', true),
     ('pay_tent_8', 'LEGADO', 'FALHOU', 'tra_imp_5a', true),
     ('pay_tent_9', 'LEGADO', 'PENDENTE', 'tra_imp_6', true) $$,
  'cada situacao antiga vira a tentativa legada correspondente, usando o pagamento como referencia antiga');
select results_eq(
  $$ select id, status, repasse_status, repasse_asaas_id, repasse_asaas_id_anterior, multa_descontada, repassado_em from public.payments where id::text like '00000000-0000-0000-0000-0000000c3f%' order by id $$,
  $$ select id, status, repasse_status, repasse_asaas_id, repasse_asaas_id_anterior, multa_descontada, repassado_em from pagamentos_antes order by id $$,
  'a importacao nao altera nenhum identificador nem estado dos pagamentos');
select is(public.importar_repasses_legados(), 0, 'importar de novo nao cria nada');
select is(pg_temp.verificar((select id from public.repasse_tentativas where payment_id = '00000000-0000-0000-0000-0000000c3f07')), 'TRANSFERENCIA_CONHECIDA', 'tentativa legada com transferencia registrada nao tem ausencia verificada');
select is((select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c3f06')), null, 'repasse legado inconclusivo nao recebe nova tentativa');
update public.payments set repasse_asaas_id_anterior = 'tra_imp_1' where id = '00000000-0000-0000-0000-0000000c3f11';
select throws_ok(
  $$ select public.importar_repasses_legados() $$,
  'P0001', 'Transferências registradas em mais de um pagamento: tra_imp_1. Concilie manualmente antes de importar.',
  'o mesmo identificador em pagamentos diferentes interrompe a importacao');

select * from finish();
rollback;
