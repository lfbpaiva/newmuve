-- Reabre apenas a consulta de conciliacao quando um fato financeiro muda.
-- Nenhuma destas transicoes cria cobranca, estorno ou transferencia.
create function private.requeue_finance_payout_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.state is distinct from old.state
     or new.reconciliation_required is distinct from old.reconciliation_required
     or new.asaas_transfer_id is distinct from old.asaas_transfer_id then
    update public.finance_work_items
    set state = 'PENDENTE',
        next_check_at = clock_timestamp(),
        lease_until = null,
        lease_run_id = null,
        updated_at = clock_timestamp()
    where kind = 'REPASSE' and entity_id = new.id
      and (state <> 'PENDENTE' or lease_run_id is not null);
  end if;
  return new;
end;
$$;

create trigger payout_intents_requeue_finance_work
after update of state, reconciliation_required, asaas_transfer_id on public.payout_intents
for each row execute function private.requeue_finance_payout_item();

create function private.requeue_finance_refund_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.refund_status = 'NEGADO' and new.refund_status = 'PROCESSANDO' then
    update public.finance_work_items
    set state = 'PENDENTE',
        next_check_at = clock_timestamp(),
        lease_until = null,
        lease_run_id = null,
        updated_at = clock_timestamp()
    where kind = 'ESTORNO' and entity_id = new.id;
  end if;
  return new;
end;
$$;

create trigger payments_requeue_finance_refund_work
after update of refund_status on public.payments
for each row execute function private.requeue_finance_refund_item();

revoke execute on function private.requeue_finance_payout_item() from public, anon, authenticated;
revoke execute on function private.requeue_finance_refund_item() from public, anon, authenticated;
