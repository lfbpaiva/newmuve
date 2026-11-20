begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c6a1', 'dec-musico@example.com'),
  ('00000000-0000-0000-0000-00000000c6c1', 'dec-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000c6a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000c6c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c6a1', 'Musico Decisao', '76666666666', '45999990071', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000c6c1', 'Bar Decisao', '76666666000176', '4532220071', 'https://x/c.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000c6e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c6c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from generate_series(1, 5) n;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000c6d' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c6e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c6a1'
from generate_series(1, 5) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000c6f' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c6e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000c6d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c6c1', 'pay_dec_' || n, 550, 50, now() + interval '15 minutes'
from generate_series(1, 5) n;
select public.confirm_asaas_payment('pay_dec_' || n) from generate_series(1, 5) n;
insert into public.disputes (id, event_id, payment_id, aberta_por, motivo)
select ('00000000-0000-0000-0000-0000000c6b' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000c6e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000c6f' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c6c1', 'O show não aconteceu como combinado.'
from generate_series(1, 5) n;

select ok(
  has_function_privilege('service_role', 'public.decidir_contestacao(uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.negar_estorno(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.liberar_estorno(uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.reabrir_contestacao_sem_estorno(uuid)', 'execute'),
  'a API executa as funcoes de decisao e de estorno');
select ok(
  not has_function_privilege('authenticated', 'public.decidir_contestacao(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.negar_estorno(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.liberar_estorno(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.reabrir_contestacao_sem_estorno(uuid)', 'execute'),
  'o app nao decide contestacoes nem mexe em estornos');
select ok(not has_function_privilege('service_role', 'private.reabrir_contestacao_do_evento(uuid)', 'execute'), 'a reabertura interna nao e chamada direto pela API');

select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b01', 'PAGAR_MUSICO', null), 'DECIDIDA', 'decisao de pagar o musico vence');
select results_eq(
  $$ select status, decisao, resolvida_em is not null from public.disputes where id = '00000000-0000-0000-0000-0000000c6b01' $$,
  $$ values ('RESOLVIDA', 'PAGAR_MUSICO', true) $$,
  'pagar o musico encerra a contestacao na hora');
select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b01', 'DEVOLVER_CONTRATANTE', null), 'JA_DECIDIDA', 'decisao oposta depois e recusada');
select is((select decisao from public.disputes where id = '00000000-0000-0000-0000-0000000c6b01'), 'PAGAR_MUSICO', 'a decisao vencedora nao muda');

select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b02', 'DEVOLVER_CONTRATANTE', 'Ausencia comprovada'), 'DECIDIDA', 'decisao de devolver vence');
select results_eq(
  $$ select status, decisao, resolvida_em is null, observacao from public.disputes where id = '00000000-0000-0000-0000-0000000c6b02' $$,
  $$ values ('AGUARDANDO_ESTORNO', 'DEVOLVER_CONTRATANTE', true, 'Ausencia comprovada') $$,
  'devolver deixa a contestacao aguardando o estorno, ainda nao encerrada');
select results_eq(
  $$ select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c6f02') $$,
  $$ values (null::uuid) $$,
  'repasse continua bloqueado enquanto o estorno nao e confirmado');
select is((select resultado from public.abrir_contestacao('00000000-0000-0000-0000-0000000c6e02', '00000000-0000-0000-0000-00000000c6a1', 'Quero contestar de novo.')), 'CONTESTACAO_EXISTENTE', 'nao abre outra contestacao enquanto o estorno esta pendente');
select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b02', 'PAGAR_MUSICO', null), 'JA_DECIDIDA', 'pagar o musico depois de decidir devolver e recusado');
select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b02', 'DEVOLVER_CONTRATANTE', null), 'RETOMADA', 'devolver de novo sem pedido de estorno retoma a decisao');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c6f02', 'NAO_COMPARECIMENTO', '00000000-0000-0000-0000-0000000c6b02'), true, 'o estorno e pedido');
select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b02', 'DEVOLVER_CONTRATANTE', null), 'JA_DECIDIDA', 'com o estorno em andamento, repetir a decisao e recusado');
select is(public.reabrir_contestacao_sem_estorno('00000000-0000-0000-0000-0000000c6b02'), false, 'contestacao com estorno em andamento nao volta para analise');

select is(public.negar_estorno('00000000-0000-0000-0000-0000000c6f02'), '00000000-0000-0000-0000-0000000c6b02'::uuid, 'estorno negado devolve a contestacao para analise');
select results_eq(
  $$ select p.refund_status, d.status, d.decisao, d.resolvida_em is null
     from public.payments p join public.disputes d on d.event_id = p.event_id where p.id = '00000000-0000-0000-0000-0000000c6f02' $$,
  $$ values ('NEGADO', 'ABERTA', null::text, true) $$,
  'estorno negado e contestacao aberta sem decisao, na mesma transacao');
select is(public.negar_estorno('00000000-0000-0000-0000-0000000c6f02'), null, 'negar de novo nao muda nada');
select results_eq(
  $$ select tentativa_id from public.claim_payout('00000000-0000-0000-0000-0000000c6f02') $$,
  $$ values (null::uuid) $$,
  'com a contestacao de volta, o repasse segue bloqueado');

select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b02', 'DEVOLVER_CONTRATANTE', null), 'DECIDIDA', 'o suporte decide de novo');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c6f02', 'NAO_COMPARECIMENTO', '00000000-0000-0000-0000-0000000c6b02'), true, 'um novo estorno pode ser pedido depois da negativa');
select is(public.liberar_estorno('00000000-0000-0000-0000-0000000c6f02', null, null), '00000000-0000-0000-0000-0000000c6b02'::uuid, 'estorno desfeito tambem devolve a contestacao para analise');
select results_eq(
  $$ select p.refund_status, d.status from public.payments p join public.disputes d on d.event_id = p.event_id where p.id = '00000000-0000-0000-0000-0000000c6f02' $$,
  $$ values (null::text, 'ABERTA') $$,
  'pedido desfeito e contestacao aberta');
select throws_ok(
  $$ select public.liberar_estorno('00000000-0000-0000-0000-0000000c6f02', 'PROCESSANDO', 'NAO_COMPARECIMENTO') $$,
  'P0001', null, 'liberar nao pode deixar o estorno em processamento');

select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b03', 'DEVOLVER_CONTRATANTE', null), 'DECIDIDA', 'devolucao decidida no terceiro evento');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000c6f03', 'NAO_COMPARECIMENTO', '00000000-0000-0000-0000-0000000c6b03'), true, 'estorno pedido');
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000c6f03'), 'CONFIRMADO', 'estorno confirmado');
select results_eq(
  $$ select status, decisao, resolvida_em is not null from public.disputes where id = '00000000-0000-0000-0000-0000000c6b03' $$,
  $$ values ('RESOLVIDA', 'DEVOLVER_CONTRATANTE', true) $$,
  'a confirmacao do estorno encerra a contestacao na mesma transacao');
select is(public.negar_estorno('00000000-0000-0000-0000-0000000c6f03'), null, 'estorno ja confirmado nao pode ser negado');

select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b04', 'DEVOLVER_CONTRATANTE', null), 'DECIDIDA', 'devolucao decidida no quarto evento');
select throws_ok(
  $$ insert into public.disputes (event_id, aberta_por, motivo) values ('00000000-0000-0000-0000-0000000c6e04', '00000000-0000-0000-0000-00000000c6c1', 'Outra contestacao no mesmo evento.') $$,
  '23505', null, 'o indice impede outra contestacao com uma aguardando estorno');
select is(public.reabrir_contestacao_sem_estorno('00000000-0000-0000-0000-0000000c6b04'), true, 'sem pedido de estorno, a contestacao volta para analise');
select is((select status from public.disputes where id = '00000000-0000-0000-0000-0000000c6b04'), 'ABERTA', 'contestacao aberta de novo');
select is(public.reabrir_contestacao_sem_estorno('00000000-0000-0000-0000-0000000c6b04'), false, 'reabrir de novo nao muda nada');

select is(public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b05', 'DEVOLVER_CONTRATANTE', null), 'DECIDIDA', 'devolucao decidida no quinto evento');
update public.payments set refund_status = 'PROCESSANDO', refund_action = 'NAO_COMPARECIMENTO', refund_requested_at = now(), repasse_status = 'PROCESSANDO' where id = '00000000-0000-0000-0000-0000000c6f05';
select is(public.finalize_asaas_refund('00000000-0000-0000-0000-0000000c6f05'), 'REPASSE_CONFLITANTE', 'estorno externo com repasse em andamento continua sendo conflito');
select is((select status from public.disputes where id = '00000000-0000-0000-0000-0000000c6b05'), 'RESOLVIDA', 'o estorno aconteceu, entao a contestacao e encerrada mesmo no conflito');

select throws_ok(
  $$ update public.disputes set status = 'AGUARDANDO_ESTORNO', decisao = 'PAGAR_MUSICO' where id = '00000000-0000-0000-0000-0000000c6b01' $$,
  '23514', null, 'aguardando estorno so existe para a decisao de devolver');
select throws_ok(
  $$ select public.decidir_contestacao('00000000-0000-0000-0000-0000000c6b01', 'OUTRA', null) $$,
  'P0001', null, 'decisao desconhecida e recusada');
select is(public.decidir_contestacao(gen_random_uuid(), 'PAGAR_MUSICO', null), 'NAO_ENCONTRADA', 'contestacao inexistente');
select is((select count(*)::int from public.disputes where event_id = '00000000-0000-0000-0000-0000000c6e04'), 1, 'continua existindo uma contestacao por evento');

select * from finish();
rollback;
