-- Execuções e itens de conciliação; nenhum segredo ou chave Pix é persistido aqui.
create index payments_finance_expiration_idx on public.payments (expira_em)
  where status = 'PENDENTE';
create index payments_finance_expired_idx on public.payments (id)
  where status in ('EXPIRADO', 'CANCELADO') and late_payment_detected_at is null;
create index payments_finance_late_idx on public.payments (late_payment_detected_at)
  where late_payment_detected_at is not null;
create index payments_finance_refund_idx on public.payments (refund_requested_at)
  where status = 'PAGO' and refund_status in ('PROCESSANDO', 'NEGADO');
create index payout_intents_finance_state_idx on public.payout_intents (state)
  where state in ('RESERVADO', 'ENVIADO', 'PENDENTE', 'CONCILIACAO') or reconciliation_required;
create index events_finance_completion_idx on public.events (inicio)
  where status = 'CONTRATADO' and (confirmacao_musico or confirmacao_contratante);
create table public.finance_job_control (
  kind text primary key check (kind in ('EXPIRACAO', 'TARDIO', 'REPASSE', 'ESTORNO', 'EVENTO')),
  active_run_id uuid,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_success_at timestamptz
);
insert into public.finance_job_control (kind) values
  ('EXPIRACAO'), ('TARDIO'), ('REPASSE'), ('ESTORNO'), ('EVENTO');

create table public.finance_job_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null references public.finance_job_control(kind),
  status text not null check (status in ('EXECUTANDO', 'CONCLUIDO', 'FALHOU')),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  found_count integer not null default 0,
  processed_count integer not null default 0,
  completed_count integer not null default 0,
  pending_count integer not null default 0,
  manual_count integer not null default 0,
  failed_count integer not null default 0
);
create index finance_job_runs_kind_started_idx on public.finance_job_runs (kind, started_at desc);

create table public.finance_work_items (
  kind text not null references public.finance_job_control(kind),
  entity_id uuid not null,
  state text not null default 'PENDENTE' check (state in ('PENDENTE', 'CONCLUIDO', 'MANUAL')),
  attempts integer not null default 0 check (attempts >= 0),
  next_check_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz,
  lease_run_id uuid references public.finance_job_runs(id),
  last_external_status text,
  last_external_value numeric(10, 2),
  external_payment_date date,
  last_error_code text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (kind, entity_id)
);
create index finance_work_items_due_idx on public.finance_work_items (kind, next_check_at)
  where state = 'PENDENTE';

alter table public.finance_job_control enable row level security;
alter table public.finance_job_runs enable row level security;
alter table public.finance_work_items enable row level security;
revoke all on public.finance_job_control, public.finance_job_runs, public.finance_work_items from anon, authenticated;
grant all on public.finance_job_control, public.finance_job_runs, public.finance_work_items to service_role;

create function public.begin_finance_run(p_kind text, p_interval_minutes integer, p_lease_minutes integer)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_control public.finance_job_control; v_run_id uuid;
begin
  if p_kind not in ('EXPIRACAO', 'TARDIO', 'REPASSE', 'ESTORNO', 'EVENTO')
     or p_interval_minutes < 1 or p_interval_minutes > 1440
     or p_lease_minutes < 1 or p_lease_minutes > 60 then
    raise exception 'parametros de agendamento invalidos';
  end if;
  select * into v_control from public.finance_job_control where kind = p_kind for update;
  if v_control.lease_until > clock_timestamp() then return null; end if;
  if v_control.last_started_at > clock_timestamp() - make_interval(mins => p_interval_minutes) then return null; end if;
  if v_control.active_run_id is not null then
    update public.finance_job_runs set status = 'FALHOU', finished_at = clock_timestamp()
    where id = v_control.active_run_id and status = 'EXECUTANDO';
  end if;
  insert into public.finance_job_runs (kind, status) values (p_kind, 'EXECUTANDO')
  returning id into v_run_id;
  update public.finance_job_control
  set active_run_id = v_run_id, lease_until = clock_timestamp() + make_interval(mins => p_lease_minutes),
      last_started_at = clock_timestamp()
  where kind = p_kind;
  return v_run_id;
end;
$$;

create function public.claim_finance_items(p_kind text, p_run_id uuid, p_limit integer, p_lease_minutes integer)
returns table(entity_id uuid, attempts integer)
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 50 or p_lease_minutes < 1 or p_lease_minutes > 60
     or not exists (
       select 1 from public.finance_job_control
       where kind = p_kind and active_run_id = p_run_id and lease_until > clock_timestamp()
     ) then
    raise exception 'execucao financeira sem lease valido';
  end if;
  if p_kind = 'EXPIRACAO' then
    insert into public.finance_work_items(kind, entity_id)
    select p_kind, p.id from public.payments p
    where (p.status = 'PENDENTE' and p.expira_em <= clock_timestamp())
       or (p.status in ('EXPIRADO', 'CANCELADO') and p.late_payment_detected_at is null)
    on conflict do nothing;
  elsif p_kind = 'TARDIO' then
    insert into public.finance_work_items(kind, entity_id)
    select p_kind, p.id from public.payments p
    where p.late_payment_detected_at is not null and p.status <> 'ESTORNADO'
    on conflict do nothing;
  elsif p_kind = 'REPASSE' then
    insert into public.finance_work_items(kind, entity_id)
    select p_kind, i.id from public.payout_intents i
    where i.state in ('RESERVADO', 'ENVIADO', 'PENDENTE', 'CONCILIACAO')
       or i.reconciliation_required
    on conflict do nothing;
  elsif p_kind = 'ESTORNO' then
    insert into public.finance_work_items(kind, entity_id)
    select p_kind, p.id from public.payments p
    where p.status = 'PAGO' and p.refund_requested_at is not null
      and p.refund_status in ('PROCESSANDO', 'NEGADO')
    on conflict do nothing;
  elsif p_kind = 'EVENTO' then
    insert into public.finance_work_items(kind, entity_id)
    select p_kind, e.id from public.events e
    where e.status = 'CONTRATADO'
      and (e.confirmacao_musico or e.confirmacao_contratante)
      and e.inicio + interval '7 days' <= clock_timestamp()
    on conflict do nothing;
  else
    raise exception 'tipo de processamento invalido';
  end if;

  return query
  with picked as (
    select w.kind, w.entity_id from public.finance_work_items w
    where w.kind = p_kind and w.state = 'PENDENTE'
      and w.next_check_at <= clock_timestamp()
      and (w.lease_until is null or w.lease_until <= clock_timestamp())
    order by w.next_check_at, w.entity_id
    limit p_limit for update skip locked
  )
  update public.finance_work_items w
  set lease_run_id = p_run_id,
      lease_until = clock_timestamp() + make_interval(mins => p_lease_minutes),
      attempts = w.attempts + 1,
      updated_at = clock_timestamp()
  from picked
  where w.kind = picked.kind and w.entity_id = picked.entity_id
  returning w.entity_id, w.attempts;
end;
$$;

create function public.finish_finance_item(
  p_kind text, p_entity_id uuid, p_run_id uuid, p_state text,
  p_delay_minutes integer, p_external_status text, p_external_value numeric,
  p_payment_date date, p_error_code text
)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid;
begin
  if p_state not in ('PENDENTE', 'CONCLUIDO', 'MANUAL')
     or p_delay_minutes < 0 or p_delay_minutes > 10080 then
    raise exception 'resultado de conciliacao invalido';
  end if;
  update public.finance_work_items
  set state = p_state,
      next_check_at = clock_timestamp() + make_interval(mins => p_delay_minutes),
      lease_until = null, lease_run_id = null,
      last_external_status = coalesce(p_external_status, last_external_status),
      last_external_value = coalesce(p_external_value, last_external_value),
      external_payment_date = coalesce(p_payment_date, external_payment_date),
      last_error_code = p_error_code,
      updated_at = clock_timestamp()
  where kind = p_kind and entity_id = p_entity_id
    and lease_run_id = p_run_id and lease_until > clock_timestamp()
  returning entity_id into v_id;
  return v_id is not null;
end;
$$;

create function public.finish_finance_run(
  p_kind text, p_run_id uuid, p_found integer, p_processed integer,
  p_completed integer, p_pending integer, p_manual integer, p_failed integer
)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_kind text;
begin
  select kind into v_kind from public.finance_job_control
  where kind = p_kind and active_run_id = p_run_id for update;
  if not found then return false; end if;
  update public.finance_job_runs
  set status = case when p_failed > 0 then 'FALHOU' else 'CONCLUIDO' end,
      finished_at = clock_timestamp(), found_count = p_found,
      processed_count = p_processed, completed_count = p_completed,
      pending_count = p_pending, manual_count = p_manual, failed_count = p_failed
  where id = p_run_id and status = 'EXECUTANDO';
  update public.finance_job_control
  set active_run_id = null, lease_until = null,
      last_success_at = case when p_failed = 0 then clock_timestamp() else last_success_at end
  where kind = p_kind and active_run_id = p_run_id;
  return true;
end;
$$;

-- A mesma condição de prazo e confirmação do fluxo de consulta, avaliada no banco.
create function public.conclude_event_if_due(p_event_id uuid)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_payment public.payments; v_event public.events;
begin
  select * into v_payment from public.payments
  where event_id = p_event_id and status = 'PAGO' for update;
  if not found or v_payment.refund_status is not null or v_payment.repasse_status is distinct from 'RETIDO' then return false; end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.status <> 'CONTRATADO' or v_event.musico_contratado_id is null
     or not (v_event.confirmacao_musico or v_event.confirmacao_contratante)
     or v_event.inicio + interval '7 days' > clock_timestamp() then return false; end if;
  update public.events
  set confirmacao_musico = true, confirmacao_contratante = true
  where id = p_event_id and status = 'CONTRATADO';
  return true;
end;
$$;

revoke execute on function public.begin_finance_run(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.claim_finance_items(text, uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.finish_finance_item(text, uuid, uuid, text, integer, text, numeric, date, text) from public, anon, authenticated;
revoke execute on function public.finish_finance_run(text, uuid, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.conclude_event_if_due(uuid) from public, anon, authenticated;
grant execute on function public.begin_finance_run(text, integer, integer) to service_role;
grant execute on function public.claim_finance_items(text, uuid, integer, integer) to service_role;
grant execute on function public.finish_finance_item(text, uuid, uuid, text, integer, text, numeric, date, text) to service_role;
grant execute on function public.finish_finance_run(text, uuid, integer, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.conclude_event_if_due(uuid) to service_role;
-- Marca cobranças recebidas sem contratação válida para análise humana.
create function public.mark_late_payment_detected(p_payment_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  update public.payments
  set late_payment_detected_at = coalesce(late_payment_detected_at, clock_timestamp())
  where id = p_payment_id and status <> 'PAGO';
end;
$$;
revoke execute on function public.mark_late_payment_detected(uuid) from public, anon, authenticated;
grant execute on function public.mark_late_payment_detected(uuid) to service_role;