alter table public.event_candidates
  add column valor_proposto numeric(10, 2) check (valor_proposto is null or valor_proposto >= 100);

create table public.candidate_messages (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.event_candidates (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index candidate_messages_candidate_created_idx on public.candidate_messages (candidate_id, created_at);
create index candidate_messages_author_idx on public.candidate_messages (author_id);

alter table public.candidate_messages enable row level security;

create function private.is_candidate_party(p_candidate_id uuid)
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
    where c.id = p_candidate_id
      and (c.musician_id = (select auth.uid()) or e.contractor_id = (select auth.uid()))
  );
$$;

revoke execute on function private.is_candidate_party(uuid) from public;
grant execute on function private.is_candidate_party(uuid) to authenticated;

grant select on public.candidate_messages to authenticated;
create policy "conversa visivel ao musico e ao dono do evento" on public.candidate_messages
for select to authenticated
using (private.is_candidate_party(candidate_id));

alter publication supabase_realtime add table public.candidate_messages;
