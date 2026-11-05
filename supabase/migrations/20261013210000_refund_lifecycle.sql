-- O pedido de estorno é distinto de sua conclusão. Mantém a contratação ativa
-- enquanto a Asaas processa ou recusa a devolução.
alter table public.payments
  add column refund_status text check (refund_status in ('PROCESSANDO', 'NEGADO', 'CONFIRMADO')),
  add column refund_action text check (refund_action in ('REABRIR', 'CANCELAR', 'NAO_COMPARECIMENTO', 'NENHUMA')),
  add column refund_requested_at timestamptz;

create function public.claim_asaas_refund(p_payment_id uuid, p_refund_action text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_refund_action not in ('REABRIR', 'CANCELAR', 'NAO_COMPARECIMENTO', 'NENHUMA') then
    raise exception 'acao de estorno invalida';
  end if;

  update public.payments
  set refund_status = 'PROCESSANDO',
      refund_action = p_refund_action,
      refund_requested_at = now()
  where id = p_payment_id
    and (
      (status = 'PAGO' and repasse_status in ('RETIDO', 'FALHOU'))
      or (p_refund_action = 'NENHUMA' and status in ('PENDENTE', 'EXPIRADO', 'CANCELADO'))
    )
    and (refund_status is null or refund_status = 'NEGADO')
  returning id into v_id;
  return v_id is not null;
end;
$$;

create function public.finalize_asaas_refund(p_payment_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_event public.events;
  v_payout_conflict boolean;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'pagamento nao encontrado'; end if;
  if v_payment.status = 'ESTORNADO' then return 'JA_PROCESSADO'; end if;
  if v_payment.status <> 'PAGO' and not (v_payment.refund_action = 'NENHUMA' and v_payment.status in ('PENDENTE', 'EXPIRADO', 'CANCELADO')) then
    raise exception 'pagamento nao esta elegivel para estorno';
  end if;

  v_payout_conflict := v_payment.repasse_status in ('PROCESSANDO', 'REPASSADO');
  select * into v_event from public.events where id = v_payment.event_id for update;
  if v_event.id is not null and v_event.status = 'CONTRATADO' and coalesce(v_payment.refund_action, 'CANCELAR') <> 'NENHUMA' then
    if v_payment.refund_action = 'REABRIR' and not v_payout_conflict then
      perform public.reopen_event(v_event.id);
    else
      update public.events set status = 'CANCELADO' where id = v_event.id;
    end if;
  end if;

  update public.payments
  set status = 'ESTORNADO',
      refund_status = 'CONFIRMADO',
      repasse_status = case when v_payout_conflict then repasse_status else null end
  where id = p_payment_id;
  return case when v_payout_conflict then 'REPASSE_CONFLITANTE' else 'CONFIRMADO' end;
end;
$$;

revoke execute on function public.claim_asaas_refund(uuid, text) from public, anon, authenticated;
revoke execute on function public.finalize_asaas_refund(uuid) from public, anon, authenticated;
grant execute on function public.claim_asaas_refund(uuid, text) to service_role;
grant execute on function public.finalize_asaas_refund(uuid) to service_role;

-- Uma cobrança cancelada/expirada que seja paga tardiamente não pode contratar.
-- O serviço solicita estorno separado para esses casos.
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
  if v_payment.status <> 'PENDENTE' then return 'EVENTO_INDISPONIVEL'; end if;

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
