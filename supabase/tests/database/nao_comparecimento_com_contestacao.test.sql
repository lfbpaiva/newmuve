begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e4a1', 'ncomp-musico@example.com'),
  ('00000000-0000-0000-0000-00000000e4c1', 'ncomp-contratante@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000e4a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-00000000e4c1', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-00000000e4a1', 'Musico Ausencia', '74444444444', '45999990041', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-00000000e4c1', 'Bar Ausencia', '74444444000141', '4532220041', 'https://x/c.png', 'PR', 'Cascavel');

insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url)
select ('00000000-0000-0000-0000-0000000e4e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e4c1', 'Show ' || n, 'Bar e restaurante',
  now() + (n * 2 || ' days')::interval, 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png'
from generate_series(1, 8) n;
insert into public.event_candidates (id, event_id, musician_id)
select ('00000000-0000-0000-0000-0000000e4d' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e4e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e4a1'
from generate_series(1, 8) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000e4f' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e4e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000e4d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e4c1', 'pay_ncomp_' || n, 550, 50, now() + interval '15 minutes'
from generate_series(1, 8) n;
select public.confirm_asaas_payment('pay_ncomp_' || n) from generate_series(1, 8) n;
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em)
select ('00000000-0000-0000-0000-0000000e49' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000e4e' || lpad(n::text, 2, '0'))::uuid,
  ('00000000-0000-0000-0000-0000000e4d' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e4c1', 'pay_ncomp_sec_' || n, 550, 50, now() - interval '1 minute'
from unnest(array[3, 5, 8]) n;
update public.payments set status = 'EXPIRADO' where asaas_payment_id like 'pay_ncomp_sec_%';

select public.abrir_contestacao(('00000000-0000-0000-0000-0000000e4e' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000e4c1', 'O show não aconteceu como combinado.')
from unnest(array[1, 4, 5]) n;
insert into public.disputes (event_id, payment_id, aberta_por, motivo) values
  ('00000000-0000-0000-0000-0000000e4e02', null, '00000000-0000-0000-0000-00000000e4c1', 'Contestacao sem vinculo.'),
  ('00000000-0000-0000-0000-0000000e4e03', '00000000-0000-0000-0000-0000000e4903', '00000000-0000-0000-0000-00000000e4c1', 'Contestacao vinculada ao pagamento secundario.');
select public.decidir_contestacao((select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e4e04'), 'DEVOLVER_CONTRATANTE', 'Decisao do suporte');

create temp view situacao as
select right(e.id::text, 2) as ev, e.status::text as evento, p.status::text as pagamento, coalesce(p.refund_status, '-') as estorno, coalesce(p.refund_action, '-') as acao,
  coalesce((select d.status from public.disputes d where d.event_id = e.id), '-') as contestacao,
  (select count(*) from public.penalties x where x.event_id = e.id) as penalidades
from public.events e
join public.payments p on p.id = ('00000000-0000-0000-0000-0000000e4f' || right(e.id::text, 2))::uuid
where e.id::text like '00000000-0000-0000-0000-0000000e4e%';

select ok(
  has_function_privilege('service_role', 'public.claim_asaas_refund(uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_asaas_refund(uuid, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.claim_asaas_refund(uuid, text, uuid)', 'execute'),
  'so a API pede estorno');
select is(to_regprocedure('public.claim_asaas_refund(uuid, text)'), null, 'a versao antiga de dois parametros foi removida');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f01', 'NAO_COMPARECIMENTO'), false, 'nao comparecimento com contestacao aberta vinculada e recusado');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f01', 'CANCELAR'), false, 'cancelamento com contestacao aberta e recusado');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f02', 'NAO_COMPARECIMENTO'), false, 'contestacao aberta sem vinculo tambem bloqueia');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f03', 'NAO_COMPARECIMENTO'), false, 'contestacao aberta vinculada a outro pagamento do evento tambem bloqueia');
select results_eq(
  $$ select ev, evento, pagamento, estorno, acao, contestacao, penalidades from situacao where ev in ('01', '02', '03') order by ev $$,
  $$ values ('01', 'CONTRATADO', 'PAGO', '-', '-', 'ABERTA', 0::bigint), ('02', 'CONTRATADO', 'PAGO', '-', '-', 'ABERTA', 0::bigint), ('03', 'CONTRATADO', 'PAGO', '-', '-', 'ABERTA', 0::bigint) $$,
  'as recusas nao mudam pagamento, evento, contestacao nem multas');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f04', 'NAO_COMPARECIMENTO'), false, 'aguardando estorno sem o id da contestacao e recusado');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f04', 'NAO_COMPARECIMENTO', '00000000-0000-0000-0000-0000000e4b99'), false, 'aguardando estorno com id de outra contestacao e recusado');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f04', 'CANCELAR', (select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e4e04')), false, 'aguardando estorno com o id certo e outra acao e recusado');
select is((select estorno from situacao where ev = '04'), '-', 'nenhuma das recusas pediu estorno');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f04', 'NAO_COMPARECIMENTO', (select id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e4e04')), true, 'a decisao do suporte, com o id certo e nao comparecimento, pede o estorno');
select results_eq(
  $$ select estorno, acao, contestacao from situacao where ev = '04' $$,
  $$ values ('PROCESSANDO', 'NAO_COMPARECIMENTO', 'AGUARDANDO_ESTORNO') $$,
  'o estorno da decisao fica em andamento e a contestacao aguardando');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4905', 'NENHUMA'), true, 'a devolucao do Pix fora de hora continua com contestacao aberta');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4903', 'NENHUMA'), true, 'a devolucao do Pix fora de hora continua mesmo com a contestacao vinculada a ele');
select results_eq(
  $$ select estorno, contestacao from situacao where ev in ('03', '05') order by ev $$,
  $$ values ('-', 'ABERTA'), ('-', 'ABERTA') $$,
  'a devolucao secundaria nao mexe no pagamento contratado nem na contestacao');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f06', 'NAO_COMPARECIMENTO'), true, 'sem contestacao, o nao comparecimento continua pedindo estorno');
select is((select resultado from public.abrir_contestacao('00000000-0000-0000-0000-0000000e4e06', '00000000-0000-0000-0000-00000000e4c1', 'O show não aconteceu como combinado.')), 'ESTORNO_EM_ANDAMENTO', 'contestacao nao abre com estorno de nao comparecimento em andamento');
select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4f07', 'REABRIR'), true, 'estorno de desistencia pedido');
select is((select resultado from public.abrir_contestacao('00000000-0000-0000-0000-0000000e4e07', '00000000-0000-0000-0000-00000000e4c1', 'O show não aconteceu como combinado.')), 'ESTORNO_EM_ANDAMENTO', 'contestacao nao abre com estorno de desistencia em andamento');
select is((select count(*) from public.disputes where event_id in ('00000000-0000-0000-0000-0000000e4e06', '00000000-0000-0000-0000-0000000e4e07')), 0::bigint, 'nenhuma contestacao foi criada nas recusas');

select is(public.claim_asaas_refund('00000000-0000-0000-0000-0000000e4908', 'NENHUMA'), true, 'devolucao do Pix fora de hora em andamento');
select is((select resultado from public.abrir_contestacao('00000000-0000-0000-0000-0000000e4e08', '00000000-0000-0000-0000-00000000e4c1', 'O show não aconteceu como combinado.')), 'ABERTA', 'contestacao abre com so a devolucao do Pix fora de hora em andamento');
select is((select payment_id from public.disputes where event_id = '00000000-0000-0000-0000-0000000e4e08'), '00000000-0000-0000-0000-0000000e4f08'::uuid, 'e fica vinculada ao pagamento contratado');

select * from finish();
rollback;
