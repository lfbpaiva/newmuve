alter table public.disputes drop constraint disputes_status_check;
alter table public.disputes drop constraint disputes_check;
alter table public.disputes add constraint disputes_status_check check (status in ('ABERTA', 'AGUARDANDO_ESTORNO', 'RESOLVIDA'));
alter table public.disputes add constraint disputes_check check (
  (status = 'ABERTA' and decisao is null)
  or (status = 'AGUARDANDO_ESTORNO' and decisao = 'DEVOLVER_CONTRATANTE')
  or (status = 'RESOLVIDA' and decisao is not null)
);

drop index public.disputes_uma_aberta_por_evento;
create unique index disputes_uma_pendente_por_evento on public.disputes (event_id) where status in ('ABERTA', 'AGUARDANDO_ESTORNO');

create function private.reabrir_contestacao_do_evento(p_event_id uuid)
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
  where event_id = p_event_id and status = 'AGUARDANDO_ESTORNO'
  returning id into v_contestacao;
  return v_contestacao;
end;
$$;

create function public.decidir_contestacao(p_dispute_id uuid, p_decisao text, p_observacao text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_estorno text;
  v_contestacao public.disputes;
begin
  if p_decisao is null or p_decisao not in ('PAGAR_MUSICO', 'DEVOLVER_CONTRATANTE') then
    raise exception 'decisao de contestacao invalida';
  end if;
  select event_id into v_event_id from public.disputes where id = p_dispute_id;
  if not found then return 'NAO_ENCONTRADA'; end if;

  select p.refund_status into v_estorno
  from public.payments p
  where p.event_id = v_event_id and p.status = 'PAGO'
  for update;
  perform 1 from public.events where id = v_event_id for update;
  select * into v_contestacao from public.disputes where id = p_dispute_id for update;

  if v_contestacao.status = 'ABERTA' then
    update public.disputes
    set status = case when p_decisao = 'PAGAR_MUSICO' then 'RESOLVIDA' else 'AGUARDANDO_ESTORNO' end,
        decisao = p_decisao,
        observacao = p_observacao,
        resolvida_em = case when p_decisao = 'PAGAR_MUSICO' then now() end
    where id = p_dispute_id;
    return 'DECIDIDA';
  end if;

  if v_contestacao.status = 'AGUARDANDO_ESTORNO'
    and p_decisao = 'DEVOLVER_CONTRATANTE'
    and coalesce(v_estorno, '') not in ('PROCESSANDO', 'CONFIRMADO') then
    return 'RETOMADA';
  end if;

  return 'JA_DECIDIDA';
end;
$$;

create function public.reabrir_contestacao_sem_estorno(p_dispute_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_estorno text;
begin
  select event_id into v_event_id from public.disputes where id = p_dispute_id;
  if not found then return false; end if;

  select p.refund_status into v_estorno
  from public.payments p
  where p.event_id = v_event_id and p.status = 'PAGO'
  for update;
  if not found or v_estorno in ('PROCESSANDO', 'CONFIRMADO') then return false; end if;
  perform 1 from public.events where id = v_event_id for update;

  return private.reabrir_contestacao_do_evento(v_event_id) is not null;
end;
$$;

create function public.negar_estorno(p_payment_id uuid)
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
  return private.reabrir_contestacao_do_evento(v_payment.event_id);
end;
$$;

create function public.liberar_estorno(p_payment_id uuid, p_refund_status text, p_refund_action text)
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
  return private.reabrir_contestacao_do_evento(v_payment.event_id);
end;
$$;

revoke execute on function private.reabrir_contestacao_do_evento(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.decidir_contestacao(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.reabrir_contestacao_sem_estorno(uuid) from public, anon, authenticated;
revoke execute on function public.negar_estorno(uuid) from public, anon, authenticated;
revoke execute on function public.liberar_estorno(uuid, text, text) from public, anon, authenticated;
grant execute on function public.decidir_contestacao(uuid, text, text) to service_role;
grant execute on function public.reabrir_contestacao_sem_estorno(uuid) to service_role;
grant execute on function public.negar_estorno(uuid) to service_role;
grant execute on function public.liberar_estorno(uuid, text, text) to service_role;

create or replace function public.claim_payout(p_payment_id uuid)
returns table (tentativa_id uuid, desconto numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_musician_id uuid;
  v_restante numeric(10, 2);
  v_total numeric(10, 2) := 0;
  v_fine record;
  v_tentativa uuid := gen_random_uuid();
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  perform 1 from public.events where id = v_payment.event_id for update;
  if v_payment.id is null
    or v_payment.status <> 'PAGO'
    or coalesce(v_payment.refund_status, '') = 'PROCESSANDO'
    or coalesce(v_payment.repasse_status::text, '') not in ('RETIDO', 'FALHOU')
    or v_payment.repasse_asaas_id is not null
    or exists (
      select 1 from public.repasse_tentativas t
      where t.payment_id = p_payment_id and t.estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO')
    )
    or exists (
      select 1 from public.disputes d
      where d.event_id = v_payment.event_id and d.status in ('ABERTA', 'AGUARDANDO_ESTORNO')
    ) then
    return query select null::uuid, coalesce(v_payment.multa_descontada, 0::numeric);
    return;
  end if;

  select e.musico_contratado_id into v_musician_id from public.events e where e.id = v_payment.event_id;

  if v_musician_id is not null then
    perform 1 from public.musician_profiles where user_id = v_musician_id for update;

    select coalesce(sum(p.multa), 0) into v_total
    from public.penalties p
    where p.reserva_payment_id = p_payment_id and p.quitada_em is null;

    if v_total = 0 then
      v_restante := v_payment.valor_cache;
      for v_fine in
        select p.id, p.multa
        from public.penalties p
        where p.musician_id = v_musician_id
          and p.quitada_em is null
          and p.reserva_payment_id is null
          and p.multa > 0
        order by p.created_at, p.id
        for update
      loop
        if v_fine.multa < v_restante then
          update public.penalties set reserva_payment_id = p_payment_id where id = v_fine.id;
          v_restante := v_restante - v_fine.multa;
          v_total := v_total + v_fine.multa;
        end if;
      end loop;
    end if;
  end if;

  insert into public.repasse_tentativas (id, payment_id, origem, estado, referencia_externa, valor)
  values (v_tentativa, p_payment_id, 'ATUAL', 'SOLICITANDO', v_tentativa::text, v_payment.valor_cache - v_total);

  update public.payments set repasse_status = 'PROCESSANDO', multa_descontada = v_total where id = p_payment_id;
  return query select v_tentativa, v_total;
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
  set status = 'RESOLVIDA', resolvida_em = now()
  where event_id = v_payment.event_id and status = 'AGUARDANDO_ESTORNO';

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
