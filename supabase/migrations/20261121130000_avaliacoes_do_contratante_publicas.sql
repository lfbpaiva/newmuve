create function private.is_contractor(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.contractor_profiles where user_id = p_user_id);
$$;

revoke execute on function private.is_contractor(uuid) from public, anon;
grant execute on function private.is_contractor(uuid) to authenticated;

create policy "avaliacoes recebidas por contratantes" on public.reviews
for select to authenticated
using (private.is_contractor(reviewed_id));
