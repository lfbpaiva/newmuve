alter table public.penalties
  add column reserva_payment_id uuid references public.payments (id) on delete restrict;

create index penalties_reserva_payment_idx on public.penalties (reserva_payment_id) where reserva_payment_id is not null;

alter table public.payments add column repasse_asaas_id_anterior text;

create function public.claim_payout(p_payment_id uuid)
returns table (reivindicado boolean, desconto numeric)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_musician_id uuid;
  v_restante numeric(10, 2);
  v_total numeric(10, 2) := 0;
  v_fine record;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found
    or v_payment.status <> 'PAGO'
    or coalesce(v_payment.refund_status, '') = 'PROCESSANDO'
    or coalesce(v_payment.repasse_status::text, '') not in ('RETIDO', 'FALHOU')
    or v_payment.repasse_asaas_id is not null then
    return query select false, coalesce(v_payment.multa_descontada, 0::numeric);
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

  update public.payments set repasse_status = 'PROCESSANDO', multa_descontada = v_total where id = p_payment_id;
  return query select true, v_total;
end;
$$;

create function public.vincular_transferencia(p_payment_id uuid, p_transfer_id text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  if p_transfer_id is null then return false; end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.repasse_status is distinct from 'PROCESSANDO' then return false; end if;
  if v_payment.repasse_asaas_id = p_transfer_id then return true; end if;
  if v_payment.repasse_asaas_id is not null then return false; end if;
  update public.payments set repasse_asaas_id = p_transfer_id where id = p_payment_id;
  return true;
end;
$$;

create function public.concluir_repasse(p_payment_id uuid, p_transfer_id text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  if p_transfer_id is null then return false; end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.repasse_asaas_id is distinct from p_transfer_id then return false; end if;
  if v_payment.repasse_status not in ('PROCESSANDO', 'REPASSADO') then return false; end if;

  update public.penalties
  set quitada_em = now(), payment_id = p_payment_id
  where reserva_payment_id = p_payment_id and quitada_em is null;

  if v_payment.repasse_status = 'REPASSADO' then return false; end if;
  update public.payments set repasse_status = 'REPASSADO', repassado_em = now() where id = p_payment_id;
  return true;
end;
$$;

create function public.falhar_repasse(p_payment_id uuid, p_transfer_id text default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.repasse_status is distinct from 'PROCESSANDO' then return false; end if;
  if v_payment.repasse_asaas_id is distinct from p_transfer_id then return false; end if;

  update public.payments
  set repasse_status = 'FALHOU',
      multa_descontada = 0,
      repasse_asaas_id_anterior = coalesce(repasse_asaas_id, repasse_asaas_id_anterior),
      repasse_asaas_id = null
  where id = p_payment_id;

  update public.penalties
  set reserva_payment_id = null
  where reserva_payment_id = p_payment_id and quitada_em is null;
  return true;
end;
$$;

revoke execute on function public.claim_payout(uuid) from public, anon, authenticated;
revoke execute on function public.vincular_transferencia(uuid, text) from public, anon, authenticated;
revoke execute on function public.concluir_repasse(uuid, text) from public, anon, authenticated;
revoke execute on function public.falhar_repasse(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_payout(uuid) to service_role;
grant execute on function public.vincular_transferencia(uuid, text) to service_role;
grant execute on function public.concluir_repasse(uuid, text) to service_role;
grant execute on function public.falhar_repasse(uuid, text) to service_role;
