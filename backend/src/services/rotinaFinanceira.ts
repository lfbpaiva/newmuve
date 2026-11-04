import { AppError } from "../domain/errors.ts";
import type { EventService } from "./eventService.ts";
import type { PaymentService } from "./paymentService.ts";
import type { EventStore, PaymentStore } from "./ports.ts";
import { CONCLUSAO_AUTOMATICA_MS } from "../../../shared/dominio.ts";

export function createRotinaFinanceira(deps: {
  paymentStore: Pick<PaymentStore, "findFinanceFollowUps">;
  eventStore: Pick<EventStore, "findDueHirings">;
  payments: Pick<PaymentService, "syncPending" | "refreshRefund" | "payout">;
  events: Pick<EventService, "settleDueHiring">;
}) {
  const { paymentStore, eventStore, payments, events } = deps;
  let running = false;

  async function each(eventIds: string[], etapa: string, step: (eventId: string) => Promise<unknown>): Promise<void> {
    for (const eventId of new Set(eventIds)) {
      await step(eventId).catch((error: unknown) => {
        console.error(`Rotina financeira (${etapa})`, eventId, error instanceof AppError ? error.code : "falha inesperada");
      });
    }
  }

  return {
    async run(now = new Date()): Promise<void> {
      if (running) return;
      running = true;
      try {
        const { expiredCharges, refunds, payouts } = await paymentStore.findFinanceFollowUps(now);
        await each(expiredCharges, "cobrança vencida", (eventId) => payments.syncPending(eventId, now));
        await each(refunds, "estorno", (eventId) => payments.refreshRefund(eventId));
        await each(payouts, "repasse", (eventId) => payments.payout(eventId));
        const vencidos = await eventStore.findDueHirings(new Date(now.getTime() - CONCLUSAO_AUTOMATICA_MS));
        await each(vencidos, "conclusão", (eventId) => events.settleDueHiring(eventId, now));
      } finally {
        running = false;
      }
    },
  };
}
