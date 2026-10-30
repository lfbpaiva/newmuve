create or replace function public.confirm_asaas_payment(p_asaas_payment_id text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_event public.events;
  v_musician_id uuid;
begin
  select * into v_payment from public.payments
  where asaas_payment_id = p_asaas_payment_id for update;
  if not found then return 'PAGAMENTO_NAO_ENCONTRADO'; end if;
  if v_payment.status = 'PAGO' then return 'JA_PROCESSADO'; end if;
  if v_payment.status <> 'PENDENTE' or v_payment.refund_status is not null then return 'EVENTO_INDISPONIVEL'; end if;

  select * into v_event from public.events where id = v_payment.event_id for update;
  select musician_id into v_musician_id from public.event_candidates where id = v_payment.candidate_id;
  if v_event.id is null or v_event.status <> 'ABERTO' or v_musician_id is null then
    return 'EVENTO_INDISPONIVEL';
  end if;

  update public.payments set status = 'PAGO', pago_em = now(), repasse_status = 'RETIDO' where id = v_payment.id;
  update public.events set status = 'CONTRATADO', musico_contratado_id = v_musician_id where id = v_event.id;
  update public.event_candidates
  set status = case when id = v_payment.candidate_id then 'APROVADO' else 'RECUSADO' end::public.candidate_status
  where event_id = v_event.id;
  return 'CONTRATADO';
end;
$$;

revoke execute on function public.confirm_asaas_payment(text) from public, anon, authenticated;
grant execute on function public.confirm_asaas_payment(text) to service_role;
