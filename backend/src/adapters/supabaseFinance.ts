import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceCounts, FinanceItemResult, FinanceKind, FinanceStore } from "../services/financeWorker.ts";

export function createSupabaseFinanceStore(admin: SupabaseClient): FinanceStore {
  return {
    async beginRun(kind, intervalMinutes, leaseMinutes) {
      const { data, error } = await admin.rpc("begin_finance_run", {
        p_kind: kind, p_interval_minutes: intervalMinutes, p_lease_minutes: leaseMinutes,
      });
      if (error) throw error;
      return data ? String(data) : null;
    },
    async claimItems(kind, runId, limit, leaseMinutes) {
      const { data, error } = await admin.rpc("claim_finance_items", {
        p_kind: kind, p_run_id: runId, p_limit: limit, p_lease_minutes: leaseMinutes,
      });
      if (error) throw error;
      return (data ?? []).map((item: { entity_id: string; attempts: number }) =>
        ({ entityId: item.entity_id, attempts: item.attempts }));
    },
    async finishItem(kind: FinanceKind, entityId: string, runId: string, result: FinanceItemResult) {
      const { data, error } = await admin.rpc("finish_finance_item", {
        p_kind: kind,
        p_entity_id: entityId,
        p_run_id: runId,
        p_state: result.state,
        p_delay_minutes: result.delayMinutes ?? 0,
        p_external_status: result.externalStatus ?? null,
        p_external_value: result.externalValue ?? null,
        p_payment_date: result.paymentDate ?? null,
        p_error_code: result.errorCode ?? null,
      });
      if (error) throw error;
      return data === true;
    },
    async finishRun(kind: FinanceKind, runId: string, counts: FinanceCounts) {
      const { data, error } = await admin.rpc("finish_finance_run", {
        p_kind: kind, p_run_id: runId,
        p_found: counts.found, p_processed: counts.processed,
        p_completed: counts.completed, p_pending: counts.pending,
        p_manual: counts.manual, p_failed: counts.failed,
      });
      if (error) throw error;
      return data === true;
    },
    async concludeEventIfDue(eventId) {
      const { data, error } = await admin.rpc("conclude_event_if_due", { p_event_id: eventId });
      if (error) throw error;
      return data === true;
    },
  };
}