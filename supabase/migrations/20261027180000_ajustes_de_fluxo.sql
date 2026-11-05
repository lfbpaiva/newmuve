alter table public.event_candidates
  add column motivo_recusa text check (motivo_recusa in ('CONTRATANTE', 'OUTRO_CONTRATADO', 'EVENTO_ALTERADO'));

update public.event_candidates set motivo_recusa = 'OUTRO_CONTRATADO' where status = 'RECUSADO';

create function private.musician_busy(p_musician_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events alvo
    join public.events outro
      on outro.musico_contratado_id = p_musician_id
     and outro.status = 'CONTRATADO'
     and outro.id <> alvo.id
     and outro.inicio < alvo.inicio + make_interval(mins => alvo.duracao_minutos)
     and alvo.inicio < outro.inicio + make_interval(mins => outro.duracao_minutos)
    where alvo.id = p_event_id
  );
$$;

revoke execute on function private.musician_busy(uuid, uuid) from public;
grant execute on function private.musician_busy(uuid, uuid) to service_role;

create function public.musician_has_conflict(p_musician_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.musician_busy(p_musician_id, p_event_id);
$$;

revoke execute on function public.musician_has_conflict(uuid, uuid) from public, anon, authenticated;
grant execute on function public.musician_has_conflict(uuid, uuid) to service_role;

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
  if v_event.id is null or v_event.status <> 'ABERTO' or v_musician_id is null or v_event.inicio <= now() then
    return 'EVENTO_INDISPONIVEL';
  end if;
  if private.musician_busy(v_musician_id, v_event.id) then
    return 'EVENTO_INDISPONIVEL';
  end if;

  update public.payments set status = 'PAGO', pago_em = now(), repasse_status = 'RETIDO' where id = v_payment.id;
  update public.events set status = 'CONTRATADO', musico_contratado_id = v_musician_id where id = v_event.id;
  update public.event_candidates set status = 'APROVADO', motivo_recusa = null where id = v_payment.candidate_id;
  update public.event_candidates
  set status = 'RECUSADO', motivo_recusa = 'OUTRO_CONTRATADO'
  where event_id = v_event.id and id <> v_payment.candidate_id and status = 'PENDENTE';
  return 'CONTRATADO';
end;
$$;

revoke execute on function public.confirm_asaas_payment(text) from public, anon, authenticated;
grant execute on function public.confirm_asaas_payment(text) to service_role;

create or replace function public.reopen_event(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_musician_id uuid;
begin
  select musico_contratado_id into v_musician_id
  from public.events
  where id = p_event_id and status = 'CONTRATADO'
  for update;
  if not found then
    raise exception 'evento % nao esta contratado', p_event_id;
  end if;

  delete from public.event_candidates where event_id = p_event_id and musician_id = v_musician_id;
  update public.event_candidates
  set status = 'PENDENTE', motivo_recusa = null
  where event_id = p_event_id and status = 'RECUSADO' and motivo_recusa = 'OUTRO_CONTRATADO';
  update public.events
  set status = 'ABERTO', musico_contratado_id = null, confirmacao_musico = false, confirmacao_contratante = false
  where id = p_event_id;
end;
$$;

revoke execute on function public.reopen_event(uuid) from public, anon, authenticated;
grant execute on function public.reopen_event(uuid) to service_role;

alter table public.events
  alter column contractor_id drop not null,
  drop constraint events_contractor_id_fkey,
  add constraint events_contractor_id_fkey foreign key (contractor_id) references public.contractor_profiles (user_id) on delete set null;
