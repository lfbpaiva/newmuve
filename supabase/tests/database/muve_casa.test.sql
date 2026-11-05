begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a1', 'casa-musico@example.com'),
  ('00000000-0000-0000-0000-0000000004c1', 'casa-bar@example.com'),
  ('00000000-0000-0000-0000-0000000004c2', 'casa-outro-bar@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000004a1', 'MUSICIAN'),
  ('00000000-0000-0000-0000-0000000004c1', 'CONTRACTOR'),
  ('00000000-0000-0000-0000-0000000004c2', 'CONTRACTOR');
insert into public.musician_profiles (user_id, nome_completo, documento, telefone, foto_perfil_url, estilos_musicais, uf, cidade) values
  ('00000000-0000-0000-0000-0000000004a1', 'Musico Favorito', '78978978978', '45999990014', 'https://x/f.png', '{Samba}', 'PR', 'Cascavel');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000004c1', 'Bar Casa', '99999999000199', '4532220009', 'https://x/c.png', 'PR', 'Cascavel'),
  ('00000000-0000-0000-0000-0000000004c2', 'Outro Bar', '12121212000112', '4532220010', 'https://x/o.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000004e1', '00000000-0000-0000-0000-0000000004c1', 'Samba de sexta', 'Bar e restaurante', now() + interval '5 days', 120, 'PR', 'Cascavel', '{Samba}', 500, 'https://x/1.png');
insert into public.subscriptions (user_id, plano, asaas_subscription_id, status, valor) values
  ('00000000-0000-0000-0000-0000000004c1', 'CASA', 'sub_casa', 'AGUARDANDO_PAGAMENTO', 49.90);
insert into public.contractor_favorites (contractor_id, musician_id) values
  ('00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004a1');
insert into public.event_invites (event_id, musician_id) values
  ('00000000-0000-0000-0000-0000000004e1', '00000000-0000-0000-0000-0000000004a1');

select isnt(public.activate_plan('00000000-0000-0000-0000-0000000004c1', 'pay_casa_1', 31), null, 'pagamento ativa o Casa do contratante');
select isnt((select casa_ate from public.contractor_profiles where user_id = '00000000-0000-0000-0000-0000000004c1'), null, 'casa_ate preenchido');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000004c1","role":"authenticated"}';
select is((select count(*)::int from public.musician_profiles where user_id = '00000000-0000-0000-0000-0000000004a1'), 1, 'contratante ve o perfil do musico favorito');
select is((select count(*)::int from public.event_invites), 1, 'contratante ve os convites dos proprios eventos');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000004c2","role":"authenticated"}';
select is((select count(*)::int from public.contractor_favorites) + (select count(*)::int from public.event_invites), 0, 'outro contratante nao ve favoritos nem convites alheios');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated"}';
select is((select count(*)::int from public.event_invites), 1, 'musico ve o proprio convite');
reset role;

select * from finish();
rollback;
