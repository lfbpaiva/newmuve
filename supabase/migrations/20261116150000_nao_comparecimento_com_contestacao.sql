drop function public.claim_asaas_refund(uuid, text);

create function public.claim_asaas_refund(p_payment_id uuid, p_refund_action text, p_contestacao_id uuid default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_payment public.payments;
  v_pendente public.disputes;
begin
  if p_refund_action not in ('REABRIR', 'CANCELAR', 'NAO_COMPARECIMENTO', 'NENHUMA') then
    raise exception 'acao de estorno invalida';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then return false; end if;

  if v_payment.status = 'PAGO' then
    perform 1 from public.events where id = v_payment.event_id for update;
    select * into v_pendente
    from public.disputes
    where event_id = v_payment.event_id and status in ('ABERTA', 'AGUARDANDO_ESTORNO');
    if found and not (
      v_pendente.status = 'AGUARDANDO_ESTORNO'
      and v_pendente.id is not distinct from p_contestacao_id
      and p_refund_action = 'NAO_COMPARECIMENTO'
    ) then
      return false;
    end if;
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
    and not exists (
      select 1 from public.repasse_tentativas t
      where t.payment_id = p_payment_id and t.estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO')
    )
  returning id into v_id;
  return v_id is not null;
end;
$$;

revoke execute on function public.claim_asaas_refund(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_asaas_refund(uuid, text, uuid) to service_role;

create or replace function public.abrir_contestacao(p_event_id uuid, p_aberta_por uuid, p_motivo text)
returns table (resultado text, contestacao_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagamento uuid;
  v_repasse text;
  v_contestacao uuid;
begin
  select p.id into v_pagamento
  from public.payments p
  where p.event_id = p_event_id and p.status = 'PAGO'
  for update;

  perform 1 from public.events where id = p_event_id for update;

  select p.id, p.repasse_status::text into v_pagamento, v_repasse
  from public.payments p
  where p.event_id = p_event_id and p.status = 'PAGO';

  if v_repasse in ('PROCESSANDO', 'REPASSADO') then
    return query select 'REPASSE_INICIADO'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.payments p
    where p.event_id = p_event_id and p.refund_status = 'PROCESSANDO' and p.refund_action is distinct from 'NENHUMA'
  ) then
    return query select 'ESTORNO_EM_ANDAMENTO'::text, null::uuid;
    return;
  end if;

  begin
    insert into public.disputes (event_id, payment_id, aberta_por, motivo)
    values (p_event_id, v_pagamento, p_aberta_por, p_motivo)
    returning id into v_contestacao;
  exception when unique_violation then
    return query select 'CONTESTACAO_EXISTENTE'::text, null::uuid;
    return;
  end;

  return query select 'ABERTA'::text, v_contestacao;
end;
$$;
