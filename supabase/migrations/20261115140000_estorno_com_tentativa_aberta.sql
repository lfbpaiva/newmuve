create or replace function public.claim_asaas_refund(p_payment_id uuid, p_refund_action text)
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
    and not exists (
      select 1 from public.repasse_tentativas t
      where t.payment_id = p_payment_id and t.estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO')
    )
  returning id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.finalize_asaas_refund(p_payment_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_event public.events;
  v_payout_conflict boolean;
  v_musician_id uuid;
  v_tipo text;
  v_multa numeric(10, 2) := 0;
  v_penalty_id uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'pagamento nao encontrado'; end if;
  if v_payment.status = 'ESTORNADO' then return 'JA_PROCESSADO'; end if;
  if v_payment.status <> 'PAGO' and not (v_payment.refund_action = 'NENHUMA' and v_payment.status in ('PENDENTE', 'EXPIRADO', 'CANCELADO')) then
    raise exception 'pagamento nao esta elegivel para estorno';
  end if;

  v_payout_conflict := v_payment.repasse_status in ('PROCESSANDO', 'REPASSADO')
    or exists (
      select 1 from public.repasse_tentativas t
      where t.payment_id = p_payment_id and t.estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO')
    );
  select * into v_event from public.events where id = v_payment.event_id for update;
  v_musician_id := v_event.musico_contratado_id;

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

  if v_payout_conflict then return 'REPASSE_CONFLITANTE'; end if;

  if v_event.id is not null and v_musician_id is not null then
    if v_payment.refund_action = 'NAO_COMPARECIMENTO' then
      v_tipo := 'AUSENCIA';
      v_multa := round(v_payment.valor_cache * 20) / 100;
    elsif v_payment.refund_action = 'REABRIR'
      and v_payment.refund_requested_at is not null
      and v_event.inicio - v_payment.refund_requested_at <= interval '24 hours' then
      v_tipo := 'DESISTENCIA_TARDIA';
    end if;
  end if;

  if v_tipo is not null then
    insert into public.penalties (musician_id, event_id, tipo, multa, estorno_payment_id)
    values (v_musician_id, v_event.id, v_tipo, v_multa, p_payment_id)
    on conflict (estorno_payment_id) do nothing
    returning id into v_penalty_id;

    if v_penalty_id is not null then
      update public.musician_profiles
      set visibilidade_reduzida_ate = greatest(coalesce(visibilidade_reduzida_ate, now()), now() + interval '15 days')
      where user_id = v_musician_id;
      if not found then raise exception 'perfil do musico % nao encontrado', v_musician_id; end if;
    end if;
  end if;

  return 'CONFIRMADO';
end;
$$;
