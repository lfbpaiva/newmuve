begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a05c1', 'ausencia-contratante@example.com'),
  ('00000000-0000-0000-0000-0000000a05a1', 'ausencia-musico@example.com');
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-0000000a05c1', 'CONTRACTOR'),
  ('00000000-0000-0000-0000-0000000a05a1', 'MUSICIAN');
insert into public.contractor_profiles (user_id, nome_fantasia, documento, telefone, foto_perfil_url, uf, cidade) values
  ('00000000-0000-0000-0000-0000000a05c1', 'Bar Ausencia', '50550550000155', '4532225055', 'https://x/c.png', 'PR', 'Cascavel');
insert into public.events (id, contractor_id, titulo, tipo_evento, inicio, duracao_minutos, uf, cidade, estilos_musicais, cache, imagem_url) values
  ('00000000-0000-0000-0000-0000000a05e1', '00000000-0000-0000-0000-0000000a05c1', 'Show Ausencia', 'Bar e restaurante', now() - interval '2 hours', 60, 'PR', 'Cascavel', '{Rock}', 500, 'https://x/e.png');

select throws_ok(
  $$ update public.events set ausencia_informada_em = inicio - interval '1 minute' where id = '00000000-0000-0000-0000-0000000a05e1' $$,
  '23514', null, 'ausencia nao pode ser informada antes do inicio do show');
select lives_ok(
  $$ update public.events set ausencia_informada_em = now() where id = '00000000-0000-0000-0000-0000000a05e1' $$,
  'ausencia informada depois do inicio e aceita');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a05c1","role":"authenticated"}';
select throws_ok(
  $$ update public.events set ausencia_informada_em = null where id = '00000000-0000-0000-0000-0000000a05e1' $$,
  '42501', null, 'o contratante nao retira a ausencia direto no banco, so pela API');
reset role;
select isnt((select ausencia_informada_em from public.events where id = '00000000-0000-0000-0000-0000000a05e1'), null, 'a ausencia continua registrada');

select * from finish();
rollback;
