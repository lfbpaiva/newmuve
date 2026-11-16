create or replace function public.abrir_contestacao(p_event_id uuid, p_aberta_por uuid, p_motivo text)
returns table (resultado text, contestacao_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repasse text;
  v_contestacao uuid;
begin
  perform 1
  from public.payments p
  where p.event_id = p_event_id and p.status = 'PAGO'
  for update;

  perform 1 from public.events where id = p_event_id for update;

  select p.repasse_status::text into v_repasse
  from public.payments p
  where p.event_id = p_event_id and p.status = 'PAGO';

  if v_repasse in ('PROCESSANDO', 'REPASSADO') then
    return query select 'REPASSE_INICIADO'::text, null::uuid;
    return;
  end if;

  begin
    insert into public.disputes (event_id, aberta_por, motivo)
    values (p_event_id, p_aberta_por, p_motivo)
    returning id into v_contestacao;
  exception when unique_violation then
    return query select 'CONTESTACAO_EXISTENTE'::text, null::uuid;
    return;
  end;

  return query select 'ABERTA'::text, v_contestacao;
end;
$$;

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
      where d.event_id = v_payment.event_id and d.status = 'ABERTA'
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
