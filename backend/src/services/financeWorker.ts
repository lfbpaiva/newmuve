import type { AsaasGateway, EventStore, PaymentStore } from "./ports.ts";
import type { PaymentService } from "./paymentService.ts";
import { AppError } from "../domain/errors.ts";

export type FinanceKind = "EXPIRACAO" | "TARDIO" | "REPASSE" | "ESTORNO" | "EVENTO";
export type FinanceItemState = "PENDENTE" | "CONCLUIDO" | "MANUAL";

export interface FinanceItemResult {
  state: FinanceItemState;
  delayMinutes?: number;
  externalStatus?: string | null;
  externalValue?: number | null;
  paymentDate?: string | null;
  errorCode?: string | null;
}
export interface FinanceCounts {
  found: number;
  processed: number;
  completed: number;
  pending: number;
  manual: number;
  failed: number;
}
export interface FinanceStore {
  beginRun(kind: FinanceKind, intervalMinutes: number, leaseMinutes: number): Promise<string | null>;
  claimItems(kind: FinanceKind, runId: string, limit: number, leaseMinutes: number): Promise<Array<{ entityId: string; attempts: number }>>;
  finishItem(kind: FinanceKind, entityId: string, runId: string, result: FinanceItemResult): Promise<boolean>;
  finishRun(kind: FinanceKind, runId: string, counts: FinanceCounts): Promise<boolean>;
  concludeEventIfDue(eventId: string): Promise<boolean>;
}

const paid = (status: string) => status === "RECEIVED" || status === "CONFIRMED";
const done = (data: Partial<FinanceItemResult> = {}): FinanceItemResult => ({ ...data, state: "CONCLUIDO" });
const pending = (delayMinutes: number, data: Partial<FinanceItemResult> = {}): FinanceItemResult =>
  ({ ...data, state: "PENDENTE", delayMinutes });
const manual = (errorCode: string, data: Partial<FinanceItemResult> = {}): FinanceItemResult =>
  ({ ...data, state: "MANUAL", errorCode });
const backoff = (attempts: number) => Math.min(5 * 2 ** Math.min(attempts - 1, 8), 1440);

export function createFinanceWorker(deps: {
  finance: FinanceStore;
  payments: PaymentStore;
  events: EventStore;
  asaas: AsaasGateway;
  paymentService: Pick<PaymentService, "payout" | "reconcilePayoutIntent" | "reconcileRefundById">;
}) {
  const { finance, payments, events, asaas, paymentService } = deps;

  async function process(kind: FinanceKind, id: string): Promise<FinanceItemResult> {
    if (kind === "EXPIRACAO") {
      const payment = await payments.findPaymentById(id);
      if (!payment || (payment.status !== "PENDENTE" && payment.status !== "EXPIRADO" && payment.status !== "CANCELADO")) return done();
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (remote && paid(remote.status)) {
        if (remote.value < payment.valor) {
          await payments.expirePayment(payment.id);
          return manual("VALOR_DIVERGENTE", { externalStatus: remote.status, externalValue: remote.value });
        }
        const confirmation = await payments.confirmPayment(payment.asaasPaymentId);
        if (confirmation === "EVENTO_INDISPONIVEL") await payments.markLatePaymentDetected(payment.id);
        // A RPC da etapa 03A impede contratação após o prazo pelo relógio do banco.
        return done({ externalStatus: remote.status, externalValue: remote.value });
      }
      if (payment.status === "PENDENTE") await payments.expirePayment(payment.id);
      const current = await payments.findPaymentById(id);
      if (current?.status === "PAGO") return done();
      if (current?.status === "PENDENTE") return pending(5);
      if (current?.status !== "EXPIRADO" && current?.status !== "CANCELADO") return done();
      if (!remote || remote.status === "DELETED" || remote.status === "CANCELLED") {
        return done({ externalStatus: remote?.status ?? "NAO_ENCONTRADA" });
      }
      await asaas.cancelCharge(payment.asaasPaymentId);
      // Uma consulta posterior detecta aceite tardio mesmo se o webhook se perder.
      return pending(30, { externalStatus: "CANCELAMENTO_SOLICITADO" });
    }

    if (kind === "TARDIO") {
      const payment = await payments.findPaymentById(id);
      if (!payment || !payment.latePaymentDetectedAt || payment.status === "ESTORNADO") return done();
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote) return manual("COBRANCA_NAO_LOCALIZADA");
      const snapshot = {
        externalStatus: remote.status,
        externalValue: remote.value,
        paymentDate: remote.clientPaymentDate ?? remote.paymentDate ?? remote.confirmedDate ?? null,
      };
      if (remote.value !== payment.valor) return manual("VALOR_DIVERGENTE", snapshot);
      if (paid(remote.status)) {
        // Datas da cobrança são apenas datas, sem hora confiável para decidir 15 minutos.
        const deadlineDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(payment.expiraEm);
        if (snapshot.paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.paymentDate) &&
            snapshot.paymentDate <= deadlineDay) {
          return manual("POSSIVEL_PAGAMENTO_NO_PRAZO", snapshot);
        }
        return manual("HORARIO_EFETIVO_INDETERMINADO", snapshot);
      }
      if (remote.status === "REFUNDED") return manual("ESTORNO_EXTERNO_A_CONFERIR", snapshot);
      return pending(30, snapshot);
    }

    if (kind === "REPASSE") {
      const before = await payments.findPayoutIntentById(id);
      if (!before) return done();
      if (before.state === "CONCLUIDO" && !before.reconciliationRequired) return done();
      const state = await paymentService.reconcilePayoutIntent(id);
      const after = await payments.findPayoutIntentById(id);
      if (after?.reconciliationRequired && after.state === "CONCLUIDO") return manual("DIVERGENCIA_REPASSE");
      if (state === "CONCLUIDO") return done();
      if (state === "FALHOU" || after?.state === "FALHOU") return manual("REPASSE_FALHOU");
      if (state === "CONCILIACAO" || state === "DESCONHECIDO") return manual("REPASSE_INCONCLUSIVO");
      return pending(30, { externalStatus: state });
    }

    if (kind === "ESTORNO") {
      const before = await payments.findPaymentById(id);
      if (!before || before.status === "ESTORNADO" || !before.refundStatus) return done();
      const after = await paymentService.reconcileRefundById(id);
      if (!after || after.status === "ESTORNADO" || after.refundStatus === "CONFIRMADO") return done();
      if (after.refundStatus === "NEGADO") return manual("ESTORNO_NEGADO");
      return pending(30, { externalStatus: after.refundStatus });
    }

    const event = await events.findEvent(id);
    if (!event || event.status !== "CONTRATADO") return done();
    const concluded = await finance.concludeEventIfDue(id);
    if (!concluded) return pending(30);
    // Reusa o fluxo existente. A reserva atômica da etapa 03B impede segundo POST.
    await paymentService.payout(id);
    const payment = await payments.findLatestPayment(id);
    if (payment?.repasseStatus === "FALHOU" && !await payments.findPayoutIntentByPaymentId(payment.id)) {
      return manual("REPASSE_SEM_DESTINATARIO");
    }
    return done();
  }

  async function runKind(kind: FinanceKind): Promise<FinanceCounts | null> {
    const interval = kind === "EXPIRACAO" ? 4 : 29;
    const runLeaseMinutes = kind === "EXPIRACAO" ? 10 : 30;
    const runId = await finance.beginRun(kind, interval, runLeaseMinutes);
    if (!runId) return null;
    const counts: FinanceCounts = { found: 0, processed: 0, completed: 0, pending: 0, manual: 0, failed: 0 };
    try {
      const items = await finance.claimItems(kind, runId, kind === "EXPIRACAO" ? 10 : 20, runLeaseMinutes);
      counts.found = items.length;
      for (const item of items) {
        let result: FinanceItemResult;
        try {
          result = await process(kind, item.entityId);
          if (result.state === "PENDENTE" && item.attempts >= 8) result = manual("LIMITE_CONSULTAS", result);
        } catch (error) {
          counts.failed++;
          const code = error instanceof AppError ? error.code : "FALHA_PROCESSAMENTO";
          result = item.attempts >= 8 ? manual(code) : pending(backoff(item.attempts), { errorCode: code });
        }
        try {
          if (!await finance.finishItem(kind, item.entityId, runId, result)) {
            counts.failed++;
            continue;
          }
          counts.processed++;
          if (result.state === "CONCLUIDO") counts.completed++;
          if (result.state === "PENDENTE") counts.pending++;
          if (result.state === "MANUAL") counts.manual++;
        } catch {
          counts.failed++;
          // O lease expirará e o item poderá ser retomado na próxima execução.
        }
      }
    } catch {
      counts.failed++;
    }
    if (!await finance.finishRun(kind, runId, counts)) {
      throw new Error("Não foi possível finalizar a execução financeira " + kind);
    }
    return counts;
  }

  async function runAll(): Promise<Record<FinanceKind, FinanceCounts | null>> {
    const result = {} as Record<FinanceKind, FinanceCounts | null>;
    for (const kind of ["EXPIRACAO", "TARDIO", "REPASSE", "ESTORNO", "EVENTO"] as const) {
      result[kind] = await runKind(kind);
    }
    return result;
  }

  return { process, runKind, runAll };
}