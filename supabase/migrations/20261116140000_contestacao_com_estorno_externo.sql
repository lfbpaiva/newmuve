alter table public.disputes add column payment_id uuid references public.payments (id) on delete set null;
create index disputes_payment_id on public.disputes (payment_id);

create function private.vincular_contestacoes_ao_pagamento()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculadas integer;
begin
  with ultimo_pagamento as (
    select d.id as dispute_id, max(p.pago_em) as pago_em
    from public.disputes d
    join public.payments p on p.event_id = d.event_id and p.pago_em <= d.created_at
    where d.payment_id is null
    group by d.id
  ),
  pagamento_unico as (
    select u.dispute_id, (array_agg(p.id))[1] as payment_id
    from ultimo_pagamento u
    join public.disputes d on d.id = u.dispute_id
    join public.payments p on p.event_id = d.event_id and p.pago_em = u.pago_em
    group by u.dispute_id
    having count(*) = 1
  )
  update public.disputes d
  set payment_id = pagamento_unico.payment_id
  from pagamento_unico
  where d.id = pagamento_unico.dispute_id and d.payment_id is null;
  get diagnostics v_vinculadas = row_count;
  return v_vinculadas;
end;
$$;

revoke execute on function private.vincular_contestacoes_ao_pagamento() from public, anon, authenticated, service_role;

select private.vincular_contestacoes_ao_pagamento();

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

  update public.disputes
  set status = 'RESOLVIDA',
      resolvida_em = now(),
      decisao = 'DEVOLVER_CONTRATANTE',
      observacao = case
        when status = 'ABERTA' then left(coalesce(observacao || E'\n', '') || 'Valor devolvido ao contratante por estorno confirmado fora da decisão do suporte.', 1000)
        else observacao
      end
  where payment_id = p_payment_id and status in ('ABERTA', 'AGUARDANDO_ESTORNO');

  if v_payout_conflict then
    perform public.registrar_repasse_e_estorno(t.id, 'ESTORNO_DEPOIS_DA_CONCLUSAO')
    from public.repasse_tentativas t
    where t.payment_id = p_payment_id and t.estado = 'CONCLUIDA'
    order by t.encerrada_em, t.id;
    return 'REPASSE_CONFLITANTE';
  end if;

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

create function private.reabrir_contestacao_do_pagamento(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contestacao uuid;
begin
  update public.disputes
  set status = 'ABERTA', decisao = null, resolvida_em = null
  where payment_id = p_payment_id and status = 'AGUARDANDO_ESTORNO'
  returning id into v_contestacao;
  return v_contestacao;
end;
$$;

revoke execute on function private.reabrir_contestacao_do_pagamento(uuid) from public, anon, authenticated, service_role;

create or replace function public.negar_estorno(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.refund_status is distinct from 'PROCESSANDO' then return null; end if;
  perform 1 from public.events where id = v_payment.event_id for update;

  update public.payments set refund_status = 'NEGADO' where id = p_payment_id;
  return private.reabrir_contestacao_do_pagamento(p_payment_id);
end;
$$;

create or replace function public.liberar_estorno(p_payment_id uuid, p_refund_status text, p_refund_action text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  if p_refund_status = 'PROCESSANDO' then raise exception 'estorno liberado nao pode continuar em processamento'; end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.refund_status is distinct from 'PROCESSANDO' then return null; end if;
  perform 1 from public.events where id = v_payment.event_id for update;

  update public.payments set refund_status = p_refund_status, refund_action = p_refund_action where id = p_payment_id;
  return private.reabrir_contestacao_do_pagamento(p_payment_id);
end;
$$;

update public.disputes d
set status = 'RESOLVIDA',
    resolvida_em = now(),
    decisao = 'DEVOLVER_CONTRATANTE',
    observacao = left(coalesce(d.observacao || E'\n', '') || 'Valor devolvido ao contratante por estorno confirmado fora da decisão do suporte, antes desta correção.', 1000)
from public.payments p
where p.id = d.payment_id
  and p.status = 'ESTORNADO'
  and d.status in ('ABERTA', 'AGUARDANDO_ESTORNO');
