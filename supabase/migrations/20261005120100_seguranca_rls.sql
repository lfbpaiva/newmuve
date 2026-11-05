-- Muve — segurança de acesso aos dados
--
-- Modelo: o cliente (navegador) só LÊ o banco, e apenas as linhas e colunas
-- liberadas abaixo. Toda escrita passa pela API (Edge Functions), que valida as
-- regras de negócio e grava com a service_role. Por isso não existem policies
-- de insert/update/delete.

-- Nada é exposto por padrão: cada permissão é concedida explicitamente.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;

alter table public.profiles enable row level security;
alter table public.musician_profiles enable row level security;
alter table public.contractor_profiles enable row level security;
alter table public.blocked_documents enable row level security;
alter table public.events enable row level security;
alter table public.event_candidates enable row level security;
alter table public.payments enable row level security;
alter table public.asaas_webhook_events enable row level security;
alter table public.reviews enable row level security;

-- ---------------------------------------------------------------------------
-- Funções auxiliares das policies
-- security definer evita recursão entre policies (events <-> event_candidates).
-- ---------------------------------------------------------------------------

create function private.is_event_owner(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events
    where id = p_event_id and contractor_id = (select auth.uid())
  );
$$;

create function private.is_event_candidate(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_candidates
    where event_id = p_event_id and musician_id = (select auth.uid())
  );
$$;

-- O músico informado é candidato em algum evento do contratante autenticado?
create function private.is_candidate_of_my_events(p_musician_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_candidates c
    join public.events e on e.id = c.event_id
    where c.musician_id = p_musician_id and e.contractor_id = (select auth.uid())
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
revoke execute on all functions in schema private from public;
grant execute on function private.is_event_owner(uuid) to authenticated;
grant execute on function private.is_event_candidate(uuid) to authenticated;
grant execute on function private.is_candidate_of_my_events(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------------

grant select on public.profiles to authenticated;
create policy "usuario le o proprio registro" on public.profiles
for select to authenticated
using (id = (select auth.uid()));

-- CPF, CNPJ, telefone e ID da Asaas não são legíveis pelo cliente: o próprio
-- dono os obtém pela API. As demais colunas compõem o perfil exibido a terceiros.
grant select (user_id, nome_completo, foto_perfil_url, bio, estilos_musicais, uf, cidade,
              avaliacao_media, total_avaliacoes, created_at)
on public.musician_profiles to authenticated;

-- Músicos não enxergam outros músicos; contratantes só enxergam candidatos dos próprios eventos.
create policy "musico le o proprio perfil; contratante le seus candidatos" on public.musician_profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_candidate_of_my_events(user_id)
);

grant select (user_id, nome_fantasia, foto_perfil_url, uf, cidade, created_at)
on public.contractor_profiles to authenticated;

create policy "perfil publico do contratante" on public.contractor_profiles
for select to authenticated
using (true);

grant select on public.events to authenticated;
create policy "eventos abertos, proprios ou com participacao" on public.events
for select to authenticated
using (
  status = 'ABERTO'
  or contractor_id = (select auth.uid())
  or musico_contratado_id = (select auth.uid())
  or private.is_event_candidate(id)
);

grant select on public.event_candidates to authenticated;
create policy "candidatura visivel ao musico e ao dono do evento" on public.event_candidates
for select to authenticated
using (
  musician_id = (select auth.uid())
  or private.is_event_owner(event_id)
);

grant select on public.payments to authenticated;
create policy "contratante le os proprios pagamentos" on public.payments
for select to authenticated
using (contractor_id = (select auth.uid()));

grant select on public.reviews to authenticated;
create policy "avaliacoes proprias ou de candidatos dos meus eventos" on public.reviews
for select to authenticated
using (
  author_id = (select auth.uid())
  or reviewed_id = (select auth.uid())
  or private.is_candidate_of_my_events(reviewed_id)
);

-- blocked_documents e asaas_webhook_events: RLS ativo e nenhuma policy,
-- portanto acessíveis apenas pela service_role.

-- ---------------------------------------------------------------------------
-- Feed do músico (algoritmo de match)
-- ---------------------------------------------------------------------------

-- Um evento aparece no feed se, simultaneamente: está ABERTO, ainda não começou,
-- é da mesma UF e cidade do músico (ignorando caixa e acentuação) e o estilo
-- procurado está entre os estilos do músico. Roda com as permissões de quem chama.
create function public.musician_feed()
returns setof public.events
language sql
stable
security invoker
set search_path = ''
as $$
  select e.*
  from public.events e
  join public.musician_profiles m on m.user_id = (select auth.uid())
  where e.status = 'ABERTO'
    and e.inicio > now()
    and e.uf = m.uf
    and extensions.unaccent(lower(e.cidade)) = extensions.unaccent(lower(m.cidade))
    and e.estilo_musical = any (m.estilos_musicais)
  order by e.inicio;
$$;

revoke execute on function public.musician_feed() from public, anon;
grant execute on function public.musician_feed() to authenticated;

-- O checkout acompanha a confirmação do pagamento em tempo real.
alter publication supabase_realtime add table public.payments;
