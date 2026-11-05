create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 160),
  texto text not null check (char_length(texto) between 1 and 600),
  link text check (link is null or link ~ '^/'),
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where not lida;

alter table public.notifications enable row level security;

grant select on public.notifications to authenticated;
create policy "usuario le as proprias notificacoes" on public.notifications
for select to authenticated
using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.notifications;

create function private.is_visible_contractor(p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_contractor_id = (select auth.uid())
    or exists (
      select 1
      from public.events e
      where e.contractor_id = p_contractor_id
        and (
          e.status = 'ABERTO'
          or e.musico_contratado_id = (select auth.uid())
          or exists (select 1 from public.event_candidates c where c.event_id = e.id and c.musician_id = (select auth.uid()))
        )
    );
$$;

revoke execute on function private.is_visible_contractor(uuid) from public;
grant execute on function private.is_visible_contractor(uuid) to authenticated;

drop policy "perfil publico do contratante" on public.contractor_profiles;
create policy "contratante visivel por evento aberto ou participacao" on public.contractor_profiles
for select to authenticated
using (private.is_visible_contractor(user_id));

create function public.has_open_obligations(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.status = 'CONTRATADO' and p_user_id in (e.contractor_id, e.musico_contratado_id)
  )
  or exists (
    select 1
    from public.payments p
    join public.events e on e.id = p.event_id
    where p_user_id in (e.contractor_id, e.musico_contratado_id)
      and (
        (p.status = 'PAGO' and p.repasse_status in ('RETIDO', 'PROCESSANDO', 'FALHOU'))
        or p.refund_status = 'PROCESSANDO'
      )
  );
$$;

revoke execute on function public.has_open_obligations(uuid) from public, anon, authenticated;
grant execute on function public.has_open_obligations(uuid) to service_role;
