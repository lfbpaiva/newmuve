import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNotifier } from "./notifications.ts";
import { createPaymentService } from "./paymentService.ts";
import { contratante, hoursFromNow, memoryWorld, NOW, outroContratante, payAtAsaas } from "./testing.ts";

function setup() {
  const world = memoryWorld();
  const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8443" });
  const service = createPaymentService({ ...world.stores, notifier });
  const event = world.seedEvent({ cache: 750 });
  const candidate = world.seedCandidate(event.id, "m1");
  const outro = world.seedCandidate(event.id, "m2");
  return { world, service, event, candidate, outro };
}

const minutesLater = (minutes: number) => new Date(NOW.getTime() + minutes * 60 * 1000);

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const checkout = (now = NOW) => t.service.startCheckout(contratante, t.event.id, t.candidate.id, now);

describe("checkout (aprovar candidato)", () => {
  it("cancela cobrança pendente sem estorno e mantém evento e candidatura abertos", async () => {
    const payment = await checkout();

    await t.service.cancelPendingCheckout(contratante, t.event.id, NOW);

    expect(t.world.asaasCalls.cancelCharge).toEqual([payment.asaasPaymentId]);
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.status).toBe("CANCELADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.candidates.get(t.candidate.id)?.status).toBe("PENDENTE");
    await expect(t.service.cancelPendingCheckout(outroContratante, t.event.id, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("não cancela cobrança que o Asaas já recebeu", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await expect(t.service.cancelPendingCheckout(contratante, t.event.id, NOW)).rejects.toMatchObject({ code: "PAGAMENTO_JA_RECEBIDO" });
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(0);
  });

  it("pagamento tardio de cobrança já cancelada não contrata o músico", async () => {
    const payment = await checkout();
    await t.service.cancelPendingCheckout(contratante, t.event.id, NOW);
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: payment.valor });

    await t.service.handleWebhook({ id: "evt_late", event: "PAYMENT_RECEIVED", payment: { id: payment.asaasPaymentId } });

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.status).toBe("CANCELADO");
    expect(t.world.payments.get(payment.id)?.latePaymentDetectedAt).not.toBeNull();
  });

  it("cobra cachê + 10% de comissão, com validade de 15 minutos", async () => {
    const payment = await checkout();

    expect(payment).toMatchObject({ valor: 825, valorComissao: 75, valorCache: 750, status: "PENDENTE", candidateId: t.candidate.id });
    expect(payment.pixCopiaCola).toBe(`pix-${payment.asaasPaymentId}`);
    expect(payment.expiraEm).toEqual(minutesLater(15));
    expect(t.world.asaasCalls.createPixCharge).toEqual([{ value: 825, customer: expect.stringMatching(/^cus_/) }]);
    // Só o pagamento contrata: o evento continua aberto até lá.
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("é idempotente enquanto a cobrança está válida", async () => {
    const first = await checkout();
    const second = await checkout(minutesLater(5));

    expect(second.id).toBe(first.id);
    expect(t.world.asaasCalls.createPixCharge).toHaveLength(1);
    expect(t.world.asaasCalls.createCustomer).toBe(1);
  });

  it("não envia telefone opcional que a Asaas pode recusar", async () => {
    t.world.accounts.get(contratante.id)!.telefone = "45322210001";
    const createCustomer = vi.spyOn(t.world.stores.asaas, "createCustomer");

    const payment = await checkout();

    expect(payment.status).toBe("PENDENTE");
    expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ name: "c1", externalReference: "c1" }));
    expect(Object.prototype.hasOwnProperty.call(createCustomer.mock.calls[0]![0], "mobilePhone")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(createCustomer.mock.calls[0]![0], "phone")).toBe(false);
  });

  it("substitui a cobrança expirada, cancelando a antiga na Asaas", async () => {
    const first = await checkout();
    t.world.setDatabaseTime(minutesLater(16));
    const second = await checkout(minutesLater(16));

    expect(second.id).not.toBe(first.id);
    expect(t.world.payments.get(first.id)?.status).toBe("EXPIRADO");
    expect(t.world.asaasCalls.cancelCharge).toEqual([first.asaasPaymentId]);
  });

  it("não reutiliza QR Code vencido quando o relógio da aplicação está atrasado", async () => {
    const first = await checkout();
    t.world.setDatabaseTime(minutesLater(16));

    const second = await checkout(NOW);

    expect(first.status).toBe("EXPIRADO");
    expect(second.id).not.toBe(first.id);
    expect(second.expiraEm).toEqual(minutesLater(31));
    expect(t.world.asaasCalls.cancelCharge).toEqual([first.asaasPaymentId]);
  });
  it("ao trocar de candidato, cancela a cobrança anterior", async () => {
    const first = await checkout();
    const second = await t.service.startCheckout(contratante, t.event.id, t.outro.id, minutesLater(2));

    expect(t.world.payments.get(first.id)?.status).toBe("CANCELADO");
    expect(second.candidateId).toBe(t.outro.id);
  });

  it("não gera nova cobrança se a anterior já foi paga na Asaas", async () => {
    const first = await checkout();
    payAtAsaas(t.world, first.asaasPaymentId);

    t.world.setDatabaseTime(minutesLater(16));
    await expect(checkout(minutesLater(16))).rejects.toMatchObject({ code: "PAGAMENTO_JA_RECEBIDO" });
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.payments.get(first.id)).toMatchObject({ status: "EXPIRADO", latePaymentDetectedAt: minutesLater(16) });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.asaasCalls.createPixCharge).toHaveLength(1);
  });

  it("só o dono do evento aprova candidatos", async () => {
    await expect(t.service.startCheckout(outroContratante, t.event.id, t.candidate.id, NOW)).rejects.toMatchObject({ status: 404 });
    expect(t.world.asaasCalls.createPixCharge).toHaveLength(0);
  });

  it("recusa evento não aberto, já iniciado ou candidatura de outro evento", async () => {
    const contratado = t.world.seedEvent({ status: "CONTRATADO", musicoContratadoId: "m2" });
    const iniciado = t.world.seedEvent({ inicio: hoursFromNow(-1) });
    const iniciadoCandidate = t.world.seedCandidate(iniciado.id, "m1");

    await expect(t.service.startCheckout(contratante, contratado.id, t.candidate.id, NOW)).rejects.toMatchObject({ code: "EVENTO_INDISPONIVEL" });
    await expect(t.service.startCheckout(contratante, iniciado.id, iniciadoCandidate.id, NOW)).rejects.toMatchObject({ code: "EVENTO_JA_INICIADO" });
    await expect(t.service.startCheckout(contratante, t.event.id, iniciadoCandidate.id, NOW)).rejects.toMatchObject({ code: "CANDIDATURA_NAO_ENCONTRADA" });
  });

  it("cancela a cobrança na Asaas se não conseguir registrá-la", async () => {
    t.world.stores.payments.insertPayment = async () => {
      throw new Error("falha simulada no banco");
    };

    await expect(checkout()).rejects.toThrow("falha simulada");
    expect(t.world.asaasCharges.size).toBe(0);
  });
});

describe("consulta ativa da cobrança (sem depender do webhook)", () => {
  it("descobre o pagamento na Asaas e efetiva a contratação", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);

    const synced = await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));

    expect(synced).toMatchObject({ status: "PAGO", repasseStatus: "RETIDO" });
    expect(t.world.events.get(t.event.id)).toMatchObject({ status: "CONTRATADO", musicoContratadoId: "m1" });
  });

  it("mantém pendente enquanto não há pagamento", async () => {
    await checkout();

    expect((await t.service.syncCheckout(contratante, t.event.id, minutesLater(1)))?.status).toBe("PENDENTE");
  });

  it("cancela na Asaas a cobrança que passou dos 15 minutos", async () => {
    const payment = await checkout();

    t.world.setDatabaseTime(minutesLater(16));
    const synced = await t.service.syncCheckout(contratante, t.event.id, minutesLater(16));

    expect(synced?.status).toBe("EXPIRADO");
    expect(t.world.asaasCalls.cancelCharge).toEqual([payment.asaasPaymentId]);
  });

  it("repete o cancelamento na Asaas após falha de comunicação", async () => {
    const payment = await checkout();
    t.world.setDatabaseTime(minutesLater(16));
    t.world.failures.cancel = true;

    await expect(t.service.syncCheckout(contratante, t.event.id, minutesLater(16))).rejects.toMatchObject({ code: "ASAAS_INDISPONIVEL" });
    expect(t.world.payments.get(payment.id)?.status).toBe("EXPIRADO");

    t.world.failures.cancel = false;
    const result = await t.service.syncCheckout(contratante, t.event.id, minutesLater(17));
    expect(result?.status).toBe("EXPIRADO");
    expect(t.world.asaasCalls.cancelCharge).toEqual([payment.asaasPaymentId]);
  });
  it("é restrita ao dono do evento", async () => {
    await checkout();

    await expect(t.service.syncCheckout(outroContratante, t.event.id, NOW)).rejects.toMatchObject({ status: 404 });
  });
});

describe("webhook da Asaas", () => {
  const received = (asaasPaymentId: string, id = "evt_1") => ({ id, event: "PAYMENT_RECEIVED", payment: { id: asaasPaymentId } });

  it("pagamento recebido contrata o músico, recusa os demais e retém o valor", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);

    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "PAGO", repasseStatus: "RETIDO" });
    expect(t.world.events.get(t.event.id)).toMatchObject({ status: "CONTRATADO", musicoContratadoId: "m1" });
    expect(t.world.candidates.get(t.candidate.id)?.status).toBe("APROVADO");
    expect(t.world.candidates.get(t.outro.id)?.status).toBe("RECUSADO");
    // Nenhum repasse antes da conclusão do show.
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("não confia na notificação: reconfirma na Asaas, e não devolve erro para não pausar a fila", async () => {
    const payment = await checkout();
    // Na Asaas a cobrança continua pendente: a notificação é forjada ou prematura.

    await expect(t.service.handleWebhook(received(payment.asaasPaymentId))).resolves.toBeUndefined();

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    // Não registrada: uma notificação legítima com o mesmo ID ainda será processada.
    expect(t.world.webhookEvents.size).toBe(0);
  });

  it("ignora pagamento de valor menor que o cobrado", async () => {
    const payment = await checkout();
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: 1 });

    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("notificação repetida não é processada de novo", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    const confirmPayment = vi.spyOn(t.world.stores.payments, "confirmPayment");

    await t.service.handleWebhook(received(payment.asaasPaymentId));
    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(confirmPayment).toHaveBeenCalledTimes(1);
  });

  it("pagamento antigo recebido após outra contratação fica para conciliação sem estorno automático", async () => {
    const antiga = await checkout();
    const nova = await t.service.startCheckout(contratante, t.event.id, t.outro.id, minutesLater(2));
    payAtAsaas(t.world, nova.asaasPaymentId);
    await t.service.handleWebhook(received(nova.asaasPaymentId, "evt_1"));
    // O contratante paga também o código antigo, que tinha guardado.
    t.world.asaasCharges.set(antiga.asaasPaymentId, { status: "RECEIVED", value: 825 });

    await t.service.handleWebhook(received(antiga.asaasPaymentId, "evt_2"));

    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(antiga.id)?.status).toBe("CANCELADO");
    expect(t.world.payments.get(antiga.id)?.latePaymentDetectedAt).not.toBeNull();
    expect(t.world.events.get(t.event.id)?.musicoContratadoId).toBe("m2");
  });

  it("preserva a contratação e registra cobrança expirada recebida para análise", async () => {
    const antiga = await checkout();
    t.world.setDatabaseTime(minutesLater(16));
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(16));
    const nova = await t.service.startCheckout(contratante, t.event.id, t.outro.id, minutesLater(16));
    payAtAsaas(t.world, nova.asaasPaymentId);
    await t.service.handleWebhook(received(nova.asaasPaymentId, "evt_nova"));
    t.world.asaasCharges.set(antiga.asaasPaymentId, { status: "RECEIVED", value: antiga.valor });

    await t.service.handleWebhook(received(antiga.asaasPaymentId, "evt_antiga"));

    expect(t.world.events.get(t.event.id)?.musicoContratadoId).toBe("m2");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(antiga.id)?.status).toBe("EXPIRADO");
    expect(t.world.payments.get(antiga.id)?.latePaymentDetectedAt).not.toBeNull();
  });
  it("estorno feito fora do app cancela a contratação", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.handleWebhook(received(payment.asaasPaymentId));

    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await t.service.handleWebhook({ id: "evt_2", event: "PAYMENT_REFUNDED", payment: { id: payment.asaasPaymentId } });

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", repasseStatus: null });
    expect(t.world.events.get(t.event.id)?.status).toBe("CANCELADO");
  });

  it("não aceita webhook de estorno antes da confirmação pela Asaas", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.handleWebhook(received(payment.asaasPaymentId));

    const notification = { id: "evt_refund", event: "PAYMENT_REFUNDED", payment: { id: payment.asaasPaymentId } };
    await t.service.handleWebhook(notification);
    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
    expect(t.world.webhookEvents.has(notification.id)).toBe(false);

    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "REFUNDED", value: payment.valor });
    await t.service.handleWebhook(notification);
    expect(t.world.payments.get(payment.id)?.status).toBe("ESTORNADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("CANCELADO");
  });

  it("cobrança vencida deixa de estar pendente; cobranças de outros sistemas são ignoradas", async () => {
    const payment = await checkout();

    t.world.setDatabaseTime(minutesLater(16));
    await t.service.handleWebhook({ id: "evt_1", event: "PAYMENT_OVERDUE", payment: { id: payment.asaasPaymentId } });
    await t.service.handleWebhook(received("pay_de_outro_sistema", "evt_2"));
    await t.service.handleWebhook({ id: "evt_3", event: "ACCOUNT_STATUS_UPDATED" });

    expect(t.world.payments.get(payment.id)?.status).toBe("EXPIRADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("cobrança excluída deixa de estar pendente sem alterar o evento", async () => {
    const payment = await checkout();
    await t.service.handleWebhook({ id: "evt_deleted", event: "PAYMENT_DELETED", payment: { id: payment.asaasPaymentId } });
    expect(t.world.payments.get(payment.id)?.status).toBe("CANCELADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });

  it("vencimento atrasado não sobrescreve pagamento confirmado", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.handleWebhook(received(payment.asaasPaymentId));
    await t.world.stores.payments.setPaymentStatus(payment.id, "EXPIRADO");
    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
  });
});

describe("prazo financeiro da cobrança", () => {
  const received = (id: string, event = "evt_expiration") => ({
    id: event,
    event: "PAYMENT_RECEIVED",
    payment: { id },
  });

  it("contrata quando a confirmação chega antes do vencimento", async () => {
    const payment = await checkout();
    t.world.setDatabaseTime(minutesLater(14));
    payAtAsaas(t.world, payment.asaasPaymentId);

    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
  });

  it("não contrata e concilia o valor recebido depois do vencimento", async () => {
    const payment = await checkout();
    t.world.setDatabaseTime(minutesLater(16));
    payAtAsaas(t.world, payment.asaasPaymentId);

    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "EXPIRADO", latePaymentDetectedAt: minutesLater(16) });
  });

  it("considera expirado o instante exato dos 15 minutos", async () => {
    const payment = await checkout();
    t.world.setDatabaseTime(minutesLater(15));
    payAtAsaas(t.world, payment.asaasPaymentId);

    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });

  it("não ressuscita uma cobrança já expirada, mesmo com webhook duplicado", async () => {
    const payment = await checkout();
    t.world.setDatabaseTime(minutesLater(16));
    await t.world.stores.payments.expirePayment(payment.id);
    payAtAsaas(t.world, payment.asaasPaymentId);

    await Promise.all([
      t.service.handleWebhook(received(payment.asaasPaymentId)),
      t.service.handleWebhook(received(payment.asaasPaymentId)),
    ]);

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "EXPIRADO", latePaymentDetectedAt: minutesLater(16) });
  });

  it("o relógio da aplicação não antecipa a expiração pelo banco", async () => {
    const payment = await checkout();

    const result = await t.service.syncCheckout(contratante, t.event.id, minutesLater(16));

    expect(result?.status).toBe("PENDENTE");
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.status).toBe("PENDENTE");
  });

  it("confirmação concorrente com expiração não cancela cobrança paga", async () => {
    const payment = await checkout();
    let resumeExpiration!: () => void;
    let signalEntered!: () => void;
    const entered = new Promise<void>((resolve) => { signalEntered = resolve; });
    const waiting = new Promise<void>((resolve) => { resumeExpiration = resolve; });
    const original = t.world.stores.payments.expirePayment;
    vi.spyOn(t.world.stores.payments, "expirePayment").mockImplementation(async (id) => {
      signalEntered();
      await waiting;
      return original(id);
    });
    const sync = t.service.syncCheckout(contratante, t.event.id, minutesLater(16));
    await entered;
    t.world.setDatabaseTime(minutesLater(14));
    payAtAsaas(t.world, payment.asaasPaymentId);

    await t.service.handleWebhook(received(payment.asaasPaymentId));
    resumeExpiration();
    await sync;

    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.asaasCalls.cancelCharge).toHaveLength(0);
  });

  it("expiração concorrente vence confirmação tardia sem perder o registro financeiro", async () => {
    const payment = await checkout();
    t.world.setDatabaseTime(minutesLater(16));
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(16));
    t.world.asaasCharges.set(payment.asaasPaymentId, { status: "RECEIVED", value: payment.valor });

    await t.service.handleWebhook(received(payment.asaasPaymentId));

    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "EXPIRADO", latePaymentDetectedAt: minutesLater(16) });
  });

  it("falha de comunicação na confirmação permite repetir o webhook", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    const original = t.world.stores.payments.confirmPayment;
    vi.spyOn(t.world.stores.payments, "confirmPayment")
      .mockRejectedValueOnce(new Error("falha temporária"))
      .mockImplementation(original);

    await expect(t.service.handleWebhook(received(payment.asaasPaymentId))).rejects.toThrow("falha temporária");
    expect(t.world.webhookEvents.size).toBe(0);
    expect(t.world.payments.get(payment.id)?.status).toBe("PENDENTE");

    await t.service.handleWebhook(received(payment.asaasPaymentId));
    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.webhookEvents.size).toBe(1);
  });
});
describe("repasse ao músico", () => {
  async function contratado() {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    return payment;
  }

  function transferId(paymentId: string): string {
    return t.world.payments.get(paymentId)!.asaasTransferId!;
  }

  it("cria intenção antes do envio e só conclui com confirmação atual da Asaas", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const intent = [...t.world.payoutIntents.values()][0]!;

    expect(intent).toMatchObject({
      paymentId: payment.id,
      eventId: t.event.id,
      musicianId: "m1",
      amount: 750,
      state: "PENDENTE",
      asaasTransferId: transferId(payment.id),
    });
    expect(t.world.asaasCalls.transferPix).toEqual([{
      value: 750,
      pixAddressKey: "m1@exemplo.com",
      pixAddressKeyType: "EMAIL",
      externalReference: intent.id,
    }]);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");

    t.world.asaasTransfers.get(transferId(payment.id))!.status = "DONE";
    await t.service.handleWebhook({ id: "evt_done", event: "TRANSFER_DONE", transfer: { id: transferId(payment.id) } });
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(intent.state).toBe("CONCLUIDO");
  });

  it("timeout depois do aceite não gera segundo POST", async () => {
    const payment = await contratado();
    t.world.failures.transferAfterCreate = true;
    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    expect([...t.world.payoutIntents.values()][0]?.state).toBe("CONCILIACAO");

    t.world.failures.transferAfterCreate = false;
    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect([...t.world.payoutIntents.values()][0]?.state).toBe("PENDENTE");
    expect(t.world.payments.get(payment.id)?.asaasTransferId).toBeTruthy();
  });

  it("falha definitiva consultada fica FALHOU sem repetição automática", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    t.world.asaasTransfers.get(transferId(payment.id))!.status = "FAILED";

    await t.service.handleWebhook({ id: "evt_failed", event: "TRANSFER_FAILED", transfer: { id: transferId(payment.id) } });
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
    expect([...t.world.payoutIntents.values()][0]?.state).toBe("FALHOU");

    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("duas solicitações simultâneas reservam apenas uma intenção", async () => {
    await contratado();
    await Promise.all([t.service.payout(t.event.id), t.service.payout(t.event.id), t.service.payout(t.event.id)]);

    expect(t.world.payoutIntents.size).toBe(1);
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("webhook duplicado não aplica de novo a conclusão", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    t.world.asaasTransfers.get(transferId(payment.id))!.status = "DONE";
    const apply = vi.spyOn(t.world.stores.payments, "applyPayoutTransfer");
    const notification = { id: "evt_duplicate", event: "TRANSFER_DONE", transfer: { id: transferId(payment.id) } };

    await t.service.handleWebhook(notification);
    await t.service.handleWebhook(notification);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
  });

  it("evento fora de ordem usa o estado atual da Asaas", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    t.world.asaasTransfers.get(transferId(payment.id))!.status = "DONE";

    await t.service.handleWebhook({ id: "evt_old_failed", event: "TRANSFER_FAILED", transfer: { id: transferId(payment.id) } });
    await t.service.handleWebhook({ id: "evt_old_pending", event: "TRANSFER_PENDING", transfer: { id: transferId(payment.id) } });

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
  });

  it("estados intermediários não concluem repasse", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const id = transferId(payment.id);
    for (const [index, status] of ["PENDING", "IN_BANK_PROCESSING", "BLOCKED"].entries()) {
      t.world.asaasTransfers.get(id)!.status = status;
      await t.service.handleWebhook({ id: "evt_pending_" + index, event: "TRANSFER_" + status, transfer: { id } });
      expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    }
    expect([...t.world.payoutIntents.values()][0]?.state).toBe("PENDENTE");
  });

  it("nova chamada depois de concluído não envia novamente", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    t.world.asaasTransfers.get(transferId(payment.id))!.status = "DONE";
    await t.service.handleWebhook({ id: "evt_final", event: "TRANSFER_DONE", transfer: { id: transferId(payment.id) } });

    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("reinício da API recupera intenção enviada sem criar outra", async () => {
    const payment = await contratado();
    t.world.failures.transferAfterCreate = true;
    t.world.failures.transferQuery = true;
    await t.service.payout(t.event.id);
    expect([...t.world.payoutIntents.values()][0]?.state).toBe("CONCILIACAO");

    t.world.failures.transferAfterCreate = false;
    t.world.failures.transferQuery = false;
    const restarted = createPaymentService({
      ...t.world.stores,
      notifier: createNotifier({ ...t.world.stores, appUrl: "http://localhost:8443" }),
    });
    await restarted.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.payments.get(payment.id)?.asaasTransferId).toBeTruthy();
    expect([...t.world.payoutIntents.values()][0]?.state).toBe("PENDENTE");
  });

  it("falha na consulta de conciliação mantém o envio bloqueado", async () => {
    const payment = await contratado();
    t.world.failures.transferAfterCreate = true;
    t.world.failures.transferQuery = true;
    await t.service.payout(t.event.id);
    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    expect([...t.world.payoutIntents.values()][0]?.state).toBe("CONCILIACAO");
  });

  it("webhook desconhecido ou com dados divergentes não conclui", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    t.world.asaasTransfers.set("tra_unknown", {
      id: "tra_unknown", status: "DONE", externalReference: null,
      value: 750, operationType: "PIX", pixAddressKey: "m1@exemplo.com",
    });
    await t.service.handleWebhook({ id: "evt_unknown", event: "TRANSFER_DONE", transfer: { id: "tra_unknown" } });
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");

    const remote = t.world.asaasTransfers.get(transferId(payment.id))!;
    remote.status = "DONE";
    remote.value = 1;
    await t.service.handleWebhook({ id: "evt_mismatch", event: "TRANSFER_DONE", transfer: { id: remote.id } });
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    expect([...t.world.payoutIntents.values()][0]?.state).toBe("CONCILIACAO");
  });

  it("sem pagamento confirmado ou chave Pix não envia transferência", async () => {
    await checkout();
    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    const payment = [...t.world.payments.values()][0]!;
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    t.world.accounts.get("m1")!.chavePix = null;
    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
    expect(t.world.payoutIntents.size).toBe(0);
  });
});
describe("estorno da contratação", () => {
  it("devolve o valor integral e libera a retenção", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));

    await t.service.refundHiring(t.event.id, "CANCELAR");

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", repasseStatus: null });
  });

  it("não estorna o que já foi repassado ao músico", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    await t.service.payout(t.event.id);

    await expect(t.service.refundHiring(t.event.id, "CANCELAR")).rejects.toMatchObject({ code: "REPASSE_JA_REALIZADO" });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });
});
