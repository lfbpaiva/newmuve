-- O prazo de 15 minutos nasce no banco, depois da criação da cobrança na Asaas.
alter table public.payments add column late_payment_detected_at timestamptz;
alter table public.payments
  alter column expira_em set default (clock_timestamp() + interval '15 minutes');

-- A atualização condicional disputa o mesmo bloqueio de linha com a confirmação.
create function public.expire_asaas_payment(p_payment_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'PENDENTE' then return false; end if;
  if v_payment.expira_em > clock_timestamp() then return false; end if;

  update public.payments set status = 'EXPIRADO' where id = p_payment_id;
  return true;
end;
$$;
revoke execute on function public.expire_asaas_payment(uuid) from public, anon, authenticated;
grant execute on function public.expire_asaas_payment(uuid) to service_role;

-- O instante da decisão é capturado após obter os bloqueios, inclusive se houve espera.
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
  v_decided_at timestamptz;
begin
  select * into v_payment from public.payments
  where asaas_payment_id = p_asaas_payment_id for update;
  if not found then return 'PAGAMENTO_NAO_ENCONTRADO'; end if;
  if v_payment.status = 'PAGO' then return 'JA_PROCESSADO'; end if;
  if v_payment.status = 'EXPIRADO' then
    select * into v_event from public.events where id = v_payment.event_id for update;
    update public.payments
    set late_payment_detected_at = coalesce(late_payment_detected_at, clock_timestamp())
    where id = v_payment.id;
    if v_event.id is null or v_event.status <> 'ABERTO' then return 'EVENTO_INDISPONIVEL'; end if;
    return 'PAGAMENTO_EXPIRADO';
  end if;
  if v_payment.status <> 'PENDENTE' then return 'EVENTO_INDISPONIVEL'; end if;

  select * into v_event from public.events where id = v_payment.event_id for update;
  select musician_id into v_musician_id from public.event_candidates where id = v_payment.candidate_id;
  v_decided_at := clock_timestamp();
  if v_payment.expira_em <= v_decided_at then
    update public.payments
    set status = 'EXPIRADO', late_payment_detected_at = v_decided_at
    where id = v_payment.id;
    if v_event.id is null or v_event.status <> 'ABERTO' then return 'EVENTO_INDISPONIVEL'; end if;
    return 'PAGAMENTO_EXPIRADO';
  end if;
  if v_event.id is null or v_event.status <> 'ABERTO' or v_musician_id is null then
    return 'EVENTO_INDISPONIVEL';
  end if;

  update public.payments set status = 'PAGO', pago_em = v_decided_at, repasse_status = 'RETIDO' where id = v_payment.id;
  update public.events set status = 'CONTRATADO', musico_contratado_id = v_musician_id where id = v_event.id;
  update public.event_candidates
  set status = case when id = v_payment.candidate_id then 'APROVADO' else 'RECUSADO' end::public.candidate_status
  where event_id = v_event.id;
  return 'CONTRATADO';
end;
$$;

revoke execute on function public.confirm_asaas_payment(text) from public, anon, authenticated;
grant execute on function public.confirm_asaas_payment(text) to service_role;