-- Uma intenção durável por obrigação financeira. externalReference = id desta linha.
create table public.payout_intents (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments (id) on delete restrict,
  event_id uuid not null,
  musician_id uuid not null,
  amount numeric(10, 2) not null check (amount > 0),
  pix_key text,
  pix_key_type text,
  state text not null check (state in ('RESERVADO', 'ENVIADO', 'PENDENTE', 'CONCLUIDO', 'FALHOU', 'CONCILIACAO')),
  asaas_transfer_id text unique,
  reconciliation_required boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check (state in ('CONCILIACAO', 'CONCLUIDO') or (nullif(pix_key, '') is not null and nullif(pix_key_type, '') is not null))
);
create index payout_intents_event_id_idx on public.payout_intents (event_id);
create index payout_intents_musician_id_idx on public.payout_intents (musician_id);
alter table public.payout_intents enable row level security;
revoke all on public.payout_intents from anon, authenticated;
grant all on public.payout_intents to service_role;
create trigger payout_intents_set_updated_at before update on public.payout_intents
for each row execute function private.set_updated_at();

alter table public.asaas_webhook_events add column asaas_transfer_id text;

-- Repasses anteriores sem intenção não podem ser reenviados automaticamente.
insert into public.payout_intents (payment_id, event_id, musician_id, amount, state, asaas_transfer_id)
select p.id, p.event_id, e.musico_contratado_id, p.valor_cache,
  case when p.repasse_status = 'REPASSADO' and p.repasse_asaas_id is not null
    then 'CONCLUIDO' else 'CONCILIACAO' end,
  p.repasse_asaas_id
from public.payments p
join public.events e on e.id = p.event_id
where p.repasse_status in ('PROCESSANDO', 'REPASSADO', 'FALHOU')
  and e.musico_contratado_id is not null;

create function public.reserve_payout_intent(
  p_payment_id uuid, p_event_id uuid, p_musician_id uuid,
  p_amount numeric, p_pix_key text, p_pix_key_type text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_musician uuid;
  v_intent_id uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'PAGO'
     or v_payment.repasse_status is null
     or v_payment.repasse_status not in ('RETIDO', 'FALHOU')
     or v_payment.refund_status is not null
     or v_payment.event_id is distinct from p_event_id
     or v_payment.valor_cache is distinct from p_amount
     or p_musician_id is null
     or nullif(p_pix_key, '') is null
     or p_pix_key_type is null
     or p_pix_key_type not in ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP') then
    return null;
  end if;
  select musico_contratado_id into v_musician from public.events where id = p_event_id;
  if v_musician is distinct from p_musician_id then return null; end if;
  if exists (select 1 from public.payout_intents where payment_id = p_payment_id) then return null; end if;

  insert into public.payout_intents
    (payment_id, event_id, musician_id, amount, pix_key, pix_key_type, state)
  values
    (p_payment_id, p_event_id, p_musician_id, p_amount, p_pix_key, p_pix_key_type, 'RESERVADO')
  returning id into v_intent_id;
  update public.payments set repasse_status = 'PROCESSANDO' where id = p_payment_id;
  return v_intent_id;
end;
$$;

create function public.mark_payout_sent(p_intent_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.payout_intents
  set state = 'ENVIADO', sent_at = clock_timestamp()
  where id = p_intent_id and state = 'RESERVADO'
  returning id into v_id;
  return v_id is not null;
end;
$$;

create function public.mark_payout_unknown(p_intent_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.payout_intents set state = case when state in ('CONCLUIDO', 'FALHOU') then state else 'CONCILIACAO' end, reconciliation_required = true
  where id = p_intent_id and state in ('RESERVADO', 'ENVIADO', 'PENDENTE');
end;
$$;

create function public.link_payout_transfer(p_intent_id uuid, p_transfer_id text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intent public.payout_intents;
begin
  select * into v_intent from public.payout_intents where id = p_intent_id for update;
  if not found or nullif(p_transfer_id, '') is null then return false; end if;
  if v_intent.asaas_transfer_id = p_transfer_id then return true; end if;
  if v_intent.asaas_transfer_id is not null
     or exists (select 1 from public.payout_intents where asaas_transfer_id = p_transfer_id and id <> p_intent_id) then
    update public.payout_intents set state = case when state in ('CONCLUIDO', 'FALHOU') then state else 'CONCILIACAO' end, reconciliation_required = true where id = p_intent_id;
    return false;
  end if;
  update public.payout_intents set asaas_transfer_id = p_transfer_id where id = p_intent_id;
  update public.payments set repasse_asaas_id = p_transfer_id where id = v_intent.payment_id;
  return true;
end;
$$;

create function public.apply_payout_transfer(
  p_intent_id uuid, p_transfer_id text, p_external_reference text,
  p_status text, p_value numeric, p_operation_type text, p_pix_key text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intent public.payout_intents;
  v_payment public.payments;
begin
  select * into v_intent from public.payout_intents where id = p_intent_id for update;
  if not found then return 'DESCONHECIDO'; end if;
  select * into v_payment from public.payments where id = v_intent.payment_id for update;

  if v_intent.asaas_transfer_id is distinct from p_transfer_id then
    if v_intent.asaas_transfer_id is not null or nullif(p_transfer_id, '') is null
       or exists (select 1 from public.payout_intents where asaas_transfer_id = p_transfer_id and id <> p_intent_id) then
      update public.payout_intents set state = case when state in ('CONCLUIDO', 'FALHOU') then state else 'CONCILIACAO' end, reconciliation_required = true where id = p_intent_id;
      return 'CONCILIACAO';
    end if;
    update public.payout_intents set asaas_transfer_id = p_transfer_id where id = p_intent_id;
    update public.payments set repasse_asaas_id = p_transfer_id where id = v_intent.payment_id;
  end if;

  if p_external_reference is distinct from v_intent.id::text
     or p_value is distinct from v_intent.amount
     or p_operation_type is distinct from 'PIX'
     or p_pix_key is distinct from v_intent.pix_key
     or v_intent.pix_key is null
     or v_payment.status <> 'PAGO'
     or v_payment.refund_status is not null
     or p_status is null
     or p_status not in ('PENDING', 'IN_BANK_PROCESSING', 'BLOCKED', 'DONE', 'FAILED', 'CANCELLED') then
    update public.payout_intents set state = case when state in ('CONCLUIDO', 'FALHOU') then state else 'CONCILIACAO' end, reconciliation_required = true where id = p_intent_id;
    if v_payment.status = 'PAGO' and v_payment.repasse_status = 'FALHOU' then
      update public.payments set repasse_status = 'PROCESSANDO' where id = v_payment.id;
    end if;
    return 'CONCILIACAO';
  end if;

  if v_intent.state = 'CONCLUIDO' then
    if p_status = 'DONE' then return 'CONCLUIDO'; end if;
    update public.payout_intents set state = case when state in ('CONCLUIDO', 'FALHOU') then state else 'CONCILIACAO' end, reconciliation_required = true where id = p_intent_id;
    return 'CONCILIACAO';
  end if;
  if v_intent.state = 'FALHOU' then
    if p_status in ('FAILED', 'CANCELLED') then return 'FALHOU'; end if;
    update public.payout_intents set state = case when state in ('CONCLUIDO', 'FALHOU') then state else 'CONCILIACAO' end, reconciliation_required = true where id = p_intent_id;
    update public.payments set repasse_status = 'PROCESSANDO' where id = v_payment.id;
    return 'CONCILIACAO';
  end if;

  if p_status = 'DONE' then
    update public.payout_intents set state = 'CONCLUIDO' where id = p_intent_id;
    update public.payments
    set repasse_status = 'REPASSADO', repassado_em = clock_timestamp()
    where id = v_payment.id;
    return 'CONCLUIDO';
  end if;
  if p_status in ('FAILED', 'CANCELLED') then
    update public.payout_intents set state = 'FALHOU' where id = p_intent_id;
    update public.payments set repasse_status = 'FALHOU' where id = v_payment.id;
    return 'FALHOU';
  end if;
  update public.payout_intents set state = 'PENDENTE' where id = p_intent_id;
  update public.payments set repasse_status = 'PROCESSANDO' where id = v_payment.id;
  return 'PENDENTE';
end;
$$;

revoke execute on function public.reserve_payout_intent(uuid, uuid, uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.mark_payout_sent(uuid) from public, anon, authenticated;
revoke execute on function public.mark_payout_unknown(uuid) from public, anon, authenticated;
revoke execute on function public.link_payout_transfer(uuid, text) from public, anon, authenticated;
revoke execute on function public.apply_payout_transfer(uuid, text, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.reserve_payout_intent(uuid, uuid, uuid, numeric, text, text) to service_role;
grant execute on function public.mark_payout_sent(uuid) to service_role;
grant execute on function public.mark_payout_unknown(uuid) to service_role;
grant execute on function public.link_payout_transfer(uuid, text) to service_role;
grant execute on function public.apply_payout_transfer(uuid, text, text, text, numeric, text, text) to service_role;