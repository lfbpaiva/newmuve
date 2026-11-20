begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000150c1', 'iso-contratante@example.com'),
  ('00000000-0000-0000-0000-0000000150a1', 'iso-musico@example.com'),
  ('00000000-0000-0000-0000-0000000150a2', 'iso-intruso@example.com'),
  ('00000000-0000-0000-0000-0000000150c2', 'iso-outro-bar@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000150c1', 'CONTRACTOR'),
  ('00000000-0000-0000-0000-0000000150a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000150a2', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000150c2', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade, chave_pix_tipo, chave_pix) values
  ('00000000-0000-0000-0000-0000000150a1', 'Musico Contratado', '15015015015', '45999991501', 'https://x/a.png', '{Rock}', 'PR', 'Cascavel', 'EMAIL', 'contratado@example.com'),
  ('00000000-0000-0000-0000-0000000150a2', 'Musico Intruso', '25025025025', '45999991502', 'https://x/b.png', '{Rock}', 'PR', 'Cascavel', 'EMAIL', 'intruso@example.com');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000150c1', 'Bar Isolado', '15015015000115', '4532221501', 'https://x/c.png', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000150c2', 'Outro Bar', '25025025000125', '4532221502', 'https://x/d.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000150e1', '00000000-0000-0000-0000-0000000150c1', 'Show Isolado', 'Bar e restaurante', now() + interval '3 days', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');
insert into public.event_locations (event_id, endereco) values ('00000000-0000-0000-0000-0000000150e1', 'Rua Secreta, 150 - Centro')
  on conflict (event_id) do update set endereco = excluded.endereco;
insert into public.event_candidates (id, event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000150d1', '00000000-0000-0000-0000-0000000150e1', '00000000-0000-0000-0000-0000000150a1');
insert into public.payments (id, event_id, candidate_id, contractor_id, asaas_payment_id, valor, valor_comissao, expira_em) values
  ('00000000-0000-0000-0000-0000000150f1', '00000000-0000-0000-0000-0000000150e1', '00000000-0000-0000-0000-0000000150d1', '00000000-0000-0000-0000-0000000150c1', 'pay_isolamento', 550, 50, now() + interval '15 minutes');
select public.confirm_asaas_payment('pay_isolamento');
insert into public.candidate_messages (candidate_id, author_id, texto) values
  ('00000000-0000-0000-0000-0000000150d1', '00000000-0000-0000-0000-0000000150c1', 'Mensagem privada da contratacao');
insert into public.notifications (user_id, titulo, texto) values
  ('00000000-0000-0000-0000-0000000150a1', 'Aviso privado', 'So o musico contratado le este aviso');
insert into public.penalties (musician_id, tipo, multa) values ('00000000-0000-0000-0000-0000000150a1', 'AUSENCIA', 100);
insert into public.disputes (event_id, aberta_por, motivo) values
  ('00000000-0000-0000-0000-0000000150e1', '00000000-0000-0000-0000-0000000150c1', 'Contestacao privada entre as partes');
insert into public.contractor_favorites (contractor_id, musician_id) values ('00000000-0000-0000-0000-0000000150c1', '00000000-0000-0000-0000-0000000150a1');
insert into public.subscriptions (user_id, plano, asaas_subscription_id, status, valor) values
  ('00000000-0000-0000-0000-0000000150a1', 'PRO', 'sub_isolamento', 'ATIVA', 19.90);
insert into public.push_tokens (token, user_id) values ('ExponentPushToken[isolamento]', '00000000-0000-0000-0000-0000000150a1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000150a2","role":"authenticated"}';
select is((select count(*) from public.events where id = '00000000-0000-0000-0000-0000000150e1'), 0::bigint, 'musico de fora nao ve evento ja contratado de outro');
select is((select count(*) from public.event_locations where event_id = '00000000-0000-0000-0000-0000000150e1'), 0::bigint, 'musico de fora nao ve o endereco');
select is((select count(*) from public.event_candidates where event_id = '00000000-0000-0000-0000-0000000150e1'), 0::bigint, 'musico de fora nao ve as inscricoes');
select is((select count(*) from public.candidate_messages where candidate_id = '00000000-0000-0000-0000-0000000150d1'), 0::bigint, 'musico de fora nao le a conversa');
select is((select count(*) from public.payments where event_id = '00000000-0000-0000-0000-0000000150e1'), 0::bigint, 'musico de fora nao ve o pagamento');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000150a1'), 0::bigint, 'musico de fora nao le avisos de outro');
select is((select count(*) from public.penalties where musician_id = '00000000-0000-0000-0000-0000000150a1'), 0::bigint, 'musico de fora nao ve multas de outro');
select is((select count(*) from public.disputes where event_id = '00000000-0000-0000-0000-0000000150e1'), 0::bigint, 'musico de fora nao ve a contestacao');
select is((select count(*) from public.contractor_favorites where contractor_id = '00000000-0000-0000-0000-0000000150c1'), 0::bigint, 'musico de fora nao ve favoritos do contratante');
select throws_ok($$ select user_id from public.subscriptions where user_id = '00000000-0000-0000-0000-0000000150a1' $$, '42501', null, 'assinaturas nao sao legiveis pelo app');
select throws_ok($$ select user_id from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000150a1' $$, '42501', null, 'dispositivos nao sao legiveis pelo app');
select is((select count(user_id) from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000150a1'), 0::bigint, 'musico de fora nao ve CPF e chave Pix de outro musico');
select throws_ok($$ insert into public.notifications (user_id, titulo, texto) values ('00000000-0000-0000-0000-0000000150a1', 'Falso', 'Aviso forjado') $$, '42501', null, 'usuario logado nao grava avisos direto no banco');
select throws_ok($$ update public.musician_profiles set chave_pix = 'desvio@example.com' where user_id = '00000000-0000-0000-0000-0000000150a2' $$, '42501', null, 'usuario logado nao altera o perfil direto no banco');
reset role;
select is((select chave_pix from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000150a2'), 'intruso@example.com', 'a chave Pix continua a mesma');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000150c2","role":"authenticated"}';
select is((select count(user_id) from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000150a1'), 0::bigint, 'outro contratante nao ve perfil de quem nao se inscreveu com ele');
select is((select count(*) from public.payments where event_id = '00000000-0000-0000-0000-0000000150e1'), 0::bigint, 'outro contratante nao ve o pagamento');
select is((select count(*) from public.event_locations where event_id = '00000000-0000-0000-0000-0000000150e1'), 0::bigint, 'outro contratante nao ve o endereco');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000150a1","role":"authenticated"}';
select is((select count(*) from public.event_locations where event_id = '00000000-0000-0000-0000-0000000150e1'), 0::bigint, 'nem o musico contratado le o endereco direto do banco: ele chega pela API');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000150a1'), 1::bigint, 'musico le os proprios avisos');
select is((select count(*) from public.candidate_messages where candidate_id = '00000000-0000-0000-0000-0000000150d1'), 1::bigint, 'musico contratado le a propria conversa');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000150c1","role":"authenticated"}';
select is((select count(*) from public.payments where event_id = '00000000-0000-0000-0000-0000000150e1'), 1::bigint, 'contratante ve o proprio pagamento');
select is((select count(user_id) from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000150a1'), 1::bigint, 'contratante ve o perfil do proprio candidato');
select throws_ok($$ select user_id from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000150a1' $$, '42501', null, 'contratante nao ve dispositivos do musico');
select throws_ok($$ select documento from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000150a1' $$, '42501', null, 'contratante nao le o CPF do candidato');
select throws_ok($$ select chave_pix from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000150a1' $$, '42501', null, 'contratante nao le a chave Pix do candidato');
select throws_ok($$ select user_id from public.subscriptions where user_id = '00000000-0000-0000-0000-0000000150a1' $$, '42501', null, 'contratante nao ve a assinatura do musico');
reset role;

select * from finish();
rollback;
