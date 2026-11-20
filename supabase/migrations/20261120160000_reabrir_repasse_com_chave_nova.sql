create function public.reabrir_repasses_falhos(p_musician_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reabertos integer;
begin
  perform 1 from public.musician_profiles where user_id = p_musician_id for update;

  with candidatos as (
    select p.id
    from public.payments p
    join public.events e on e.id = p.event_id
    where e.musico_contratado_id = p_musician_id
      and p.status = 'PAGO'
      and p.repasse_status = 'FALHOU'
      and p.repasse_asaas_id is null
      and coalesce(p.refund_status, '') not in ('PROCESSANDO', 'CONFIRMADO')
      and not exists (
        select 1 from public.repasse_tentativas t
        where t.payment_id = p.id and t.estado not in ('FALHOU', 'AUSENCIA_CONFIRMADA')
      )
    for update of p
  )
  update public.payments p
  set repasse_status = 'RETIDO'
  from candidatos
  where p.id = candidatos.id;

  get diagnostics v_reabertos = row_count;
  return v_reabertos;
end;
$$;

revoke execute on function public.reabrir_repasses_falhos(uuid) from public, anon, authenticated;
grant execute on function public.reabrir_repasses_falhos(uuid) to service_role;
