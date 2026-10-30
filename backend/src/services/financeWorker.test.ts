import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFinanceWorker, type FinanceKind, type FinanceStore, type FinanceItemResult } from "./financeWorker.ts";
import { createPaymentService } from "./paymentService.ts";
import { createNotifier } from "./notifications.ts";
import { memoryWorld, NOW, contratante, payAtAsaas } from "./testing.ts";

function setup() {
  const world = memoryWorld();
  const service = createPaymentService({
    ...world.stores,
    notifier: createNotifier({ ...world.stores, appUrl: "http://localhost:8443" }),
  });
  const queue = new Map<FinanceKind, Array<{ entityId: string; attempts: number }>>();
  const results = new Map<string, FinanceItemResult>();
  const active = new Set<FinanceKind>();
  const finance: FinanceStore = {
    beginRun: async (kind) => {
      if (active.has(kind)) return null;
      active.add(kind);
      return "run-" + kind;
    },
    claimItems: async (kind, _runId, limit) => (queue.get(kind) ?? []).splice(0, limit),
    finishItem: async (_kind, entityId, _runId, result) => {
      results.set(entityId, result);
      return true;
    },
    finishRun: async (kind) => {
      active.delete(kind);
      return true;
    },
    concludeEventIfDue: async (id) => {
      const event = world.events.get(id);
      const payment = [...world.payments.values()].find((item) => item.eventId === id && item.status === "PAGO");
      if (!event || event.status !== "CONTRATADO" || !payment || payment.refundStatus ||
          payment.repasseStatus !== "RETIDO" ||
          !event.musicoContratadoId ||
          !(event.confirmacaoMusico || event.confirmacaoContratante) ||
          event.inicio.getTime() + 7 * 24 * 60 * 60 * 1000 > NOW.getTime()) return false;
      event.confirmacaoMusico = event.confirmacaoContratante = true;
      event.status = "CONCLUIDO";
      return true;
    },
  };
  const worker = createFinanceWorker({
    finance,
    payments: world.stores.payments,
    events: world.stores.events,
    asaas: world.stores.asaas,
    paymentService: service,
  });
  async function checkout() {
    const event = world.seedEvent();
    const candidate = world.seedCandidate(event.id, "m1");
    const payment = await service.startCheckout(contratante, event.id, candidate.id, NOW);
    return { event, payment };
  }
  async function contratado() {
    const pair = await checkout();
    payAtAsaas(world, pair.payment.asaasPaymentId);
    await service.syncCheckout(contratante, pair.event.id, NOW);
    return pair;
  }
  function enqueue(kind: FinanceKind, id: string, attempts = 1) {
    queue.set(kind, [...queue.get(kind) ?? [], { entityId: id, attempts }]);
  }
  return { world, service, finance, worker, queue, results, checkout, contratado, enqueue };
}

describe("processamento financeiro periódico", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it("expira cobrança sem consulta do usuário e cancela na Asaas", async () => {
    const { payment } = await t.checkout();
    t.world.setDatabaseTime(new Date(NOW.getTime() + 16 * 60_000));
    t.enqueue("EXPIRACAO", payment.id);
    await t.worker.runKind("EXPIRACAO");
    expect(t.world.payments.get(payment.id)?.status).toBe("EXPIRADO");
    expect(t.world.asaasCalls.cancelCharge).toEqual([payment.asaasPaymentId]);
    expect(t.results.get(payment.id)?.state).toBe("PENDENTE");
    t.enqueue("EXPIRACAO", payment.id, 2);
    await t.worker.runKind("EXPIRACAO");
    expect(t.results.get(payment.id)?.state).toBe("CONCLUIDO");
  });

  it("não expira pagamento confirmado antes do vencimento", async () => {
    const { event, payment } = await t.contratado();
    t.world.setDatabaseTime(new Date(NOW.getTime() + 16 * 60_000));
    t.enqueue("EXPIRACAO", payment.id);
    await t.worker.runKind("EXPIRACAO");
    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.events.get(event.id)?.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(0);
  });

  it("webhook após vencimento registra caso tardio sem contratação", async () => {
    const { event, payment } = await t.checkout();
    t.world.setDatabaseTime(new Date(NOW.getTime() + 16 * 60_000));
    t.enqueue("EXPIRACAO", payment.id);
    await t.worker.runKind("EXPIRACAO");
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: payment.valor });
    await t.service.handleWebhook({ id: "late-webhook", event: "PAYMENT_RECEIVED", payment: { id: payment.asaasPaymentId } });
    t.enqueue("TARDIO", payment.id);
    await t.worker.runKind("TARDIO");
    expect(t.world.events.get(event.id)?.status).toBe("ABERTO");
    expect(t.world.payments.get(payment.id)?.latePaymentDetectedAt).not.toBeNull();
    expect(t.results.get(payment.id)).toMatchObject({ state: "MANUAL", errorCode: "HORARIO_EFETIVO_INDETERMINADO" });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });

  it("detecta pagamento tardio na reconsulta mesmo sem webhook", async () => {
    const { event, payment } = await t.checkout();
    t.world.setDatabaseTime(new Date(NOW.getTime() + 16 * 60_000));
    t.enqueue("EXPIRACAO", payment.id);
    await t.worker.runKind("EXPIRACAO");
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: payment.valor });
    t.enqueue("EXPIRACAO", payment.id, 2);
    await t.worker.runKind("EXPIRACAO");
    expect(t.world.payments.get(payment.id)?.latePaymentDetectedAt).not.toBeNull();
    expect(t.world.events.get(event.id)?.status).toBe("ABERTO");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });
  it("detecta cobrança cancelada recebida sem webhook e mantém o valor para análise", async () => {
    const { event, payment } = await t.checkout();
    await t.service.cancelPendingCheckout(contratante, event.id, NOW);
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: payment.valor });
    t.enqueue("EXPIRACAO", payment.id);
    await t.worker.runKind("EXPIRACAO");
    expect(t.world.payments.get(payment.id)?.status).toBe("CANCELADO");
    expect(t.world.payments.get(payment.id)?.latePaymentDetectedAt).not.toBeNull();
    expect(t.world.events.get(event.id)?.status).toBe("ABERTO");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });
  it("sinaliza possibilidade de Pix dentro do prazo sem inferir a hora de uma data", async () => {
    const { event, payment } = await t.checkout();
    await t.service.cancelPendingCheckout(contratante, event.id, NOW);
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: payment.valor });
    await t.service.handleWebhook({ id: "evt_data", event: "PAYMENT_RECEIVED", payment: { id: payment.asaasPaymentId } });
    vi.spyOn(t.world.stores.asaas, "getPayment").mockResolvedValueOnce({
      status: "RECEIVED", value: payment.valor, paymentDate: "2030-06-10",
    });
    t.enqueue("TARDIO", payment.id);
    await t.worker.runKind("TARDIO");
    expect(t.results.get(payment.id)).toMatchObject({
      state: "MANUAL", errorCode: "POSSIVEL_PAGAMENTO_NO_PRAZO", paymentDate: "2030-06-10",
    });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });
  it("falha ao cancelar mantém cobrança expirada para nova tentativa segura", async () => {
    const { payment } = await t.checkout();
    t.world.setDatabaseTime(new Date(NOW.getTime() + 16 * 60_000));
    t.world.failures.cancel = true;
    t.enqueue("EXPIRACAO", payment.id);
    await t.worker.runKind("EXPIRACAO");
    expect(t.world.payments.get(payment.id)?.status).toBe("EXPIRADO");
    expect(t.results.get(payment.id)?.state).toBe("PENDENTE");
    t.world.failures.cancel = false;
    t.enqueue("EXPIRACAO", payment.id, 2);
    await t.worker.runKind("EXPIRACAO");
    expect(t.world.asaasCalls.cancelCharge).toEqual([payment.asaasPaymentId]);
  });

  it("repasse pendente e resposta inconclusiva são consultados sem segundo POST", async () => {
    const { event, payment } = await t.contratado();
    t.world.failures.transferAfterCreate = true;
    await t.service.payout(event.id);
    const intent = [...t.world.payoutIntents.values()][0]!;
    t.world.failures.transferAfterCreate = false;
    t.enqueue("REPASSE", intent.id);
    await t.worker.runKind("REPASSE");
    expect(t.results.get(intent.id)?.state).toBe("PENDENTE");
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("conclusão externa de transferência é refletida no banco sem reenvio", async () => {
    const { event, payment } = await t.contratado();
    await t.service.payout(event.id);
    const intent = [...t.world.payoutIntents.values()][0]!;
    t.world.asaasTransfers.get(intent.asaasTransferId!)!.status = "DONE";
    t.enqueue("REPASSE", intent.id);
    await t.worker.runKind("REPASSE");
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(t.results.get(intent.id)?.state).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("estorno já solicitado é consultado, sem novo pedido de estorno", async () => {
    const { payment } = await t.contratado();
    await t.world.stores.payments.claimRefund(payment.id, "CANCELAR");
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    t.enqueue("ESTORNO", payment.id);
    await t.worker.runKind("ESTORNO");
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });

  it("duas execuções simultâneas não processam o mesmo lote", async () => {
    const { payment } = await t.checkout();
    t.world.setDatabaseTime(new Date(NOW.getTime() + 16 * 60_000));
    t.enqueue("EXPIRACAO", payment.id);
    await Promise.all([t.worker.runKind("EXPIRACAO"), t.worker.runKind("EXPIRACAO")]);
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(1);
  });

  it("falha no meio do lote não impede o item seguinte", async () => {
    const first = await t.checkout();
    const second = await t.checkout();
    t.world.setDatabaseTime(new Date(NOW.getTime() + 16 * 60_000));
    t.enqueue("EXPIRACAO", first.payment.id);
    t.enqueue("EXPIRACAO", second.payment.id);
    const original = t.world.stores.asaas.getPayment;
    vi.spyOn(t.world.stores.asaas, "getPayment")
      .mockRejectedValueOnce(new Error("Asaas indisponível"))
      .mockImplementation(original);
    const counts = await t.worker.runKind("EXPIRACAO");
    expect(counts?.failed).toBe(1);
    expect(t.results.get(first.payment.id)?.state).toBe("PENDENTE");
    expect(t.results.get(second.payment.id)?.state).toBe("PENDENTE");
    expect(t.world.asaasCalls.cancelCharge).toContain(second.payment.asaasPaymentId);
  });

  it("reinício recupera repasse em conciliação sem novo POST", async () => {
    const { event } = await t.contratado();
    t.world.failures.transferAfterCreate = true;
    await t.service.payout(event.id);
    const intent = [...t.world.payoutIntents.values()][0]!;
    t.world.failures.transferAfterCreate = false;
    const restarted = createFinanceWorker({
      finance: t.finance, payments: t.world.stores.payments, events: t.world.stores.events,
      asaas: t.world.stores.asaas, paymentService: t.service,
    });
    t.enqueue("REPASSE", intent.id);
    await restarted.runKind("REPASSE");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.payoutIntents.get(intent.id)?.asaasTransferId).toBeTruthy();
  });

  it("conclui evento elegível após sete dias e preserva impedimento por estorno", async () => {
    const one = await t.contratado();
    one.event.inicio = new Date(NOW.getTime() - 8 * 24 * 60 * 60_000);
    one.event.confirmacaoMusico = true;
    t.enqueue("EVENTO", one.event.id);
    await t.worker.runKind("EVENTO");
    expect(t.world.events.get(one.event.id)?.status).toBe("CONCLUIDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);

    const two = await t.contratado();
    two.event.inicio = new Date(NOW.getTime() - 8 * 24 * 60 * 60_000);
    two.event.confirmacaoMusico = true;
    await t.world.stores.payments.claimRefund(two.payment.id, "CANCELAR");
    t.enqueue("EVENTO", two.event.id);
    await t.worker.runKind("EVENTO");
    expect(t.world.events.get(two.event.id)?.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("cobrança sem pendência não provoca nova operação e falha externa é limitada", async () => {
    const { payment } = await t.contratado();
    t.enqueue("EXPIRACAO", payment.id);
    await t.worker.runKind("EXPIRACAO");
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(0);
    expect(t.results.get(payment.id)?.state).toBe("CONCLUIDO");

    const other = await t.checkout();
    t.world.setDatabaseTime(new Date(NOW.getTime() + 16 * 60_000));
    t.enqueue("EXPIRACAO", other.payment.id, 8);
    vi.spyOn(t.world.stores.asaas, "getPayment").mockRejectedValueOnce(new Error("Asaas indisponível"));
    await t.worker.runKind("EXPIRACAO");
    expect(t.results.get(other.payment.id)?.state).toBe("MANUAL");
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(0);
  });
});