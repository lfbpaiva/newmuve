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

  it("substitui a cobrança expirada, cancelando a antiga na Asaas", async () => {
    const first = await checkout();
    const second = await checkout(minutesLater(16));

    expect(second.id).not.toBe(first.id);
    expect(t.world.payments.get(first.id)?.status).toBe("EXPIRADO");
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

    await expect(checkout(minutesLater(16))).rejects.toMatchObject({ code: "PAGAMENTO_JA_RECEBIDO" });
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
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

    const synced = await t.service.syncCheckout(contratante, t.event.id, minutesLater(16));

    expect(synced?.status).toBe("EXPIRADO");
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

  it("pagamento tardio, com o evento já contratado por outra cobrança, é estornado automaticamente", async () => {
    const antiga = await checkout();
    const nova = await t.service.startCheckout(contratante, t.event.id, t.outro.id, minutesLater(2));
    payAtAsaas(t.world, nova.asaasPaymentId);
    await t.service.handleWebhook(received(nova.asaasPaymentId, "evt_1"));
    // O contratante paga também o código antigo, que tinha guardado.
    t.world.asaasCharges.set(antiga.asaasPaymentId, { status: "RECEIVED", value: 825 });

    await t.service.handleWebhook(received(antiga.asaasPaymentId, "evt_2"));

    expect(t.world.asaasCalls.refundPayment).toEqual([antiga.asaasPaymentId]);
    expect(t.world.payments.get(antiga.id)?.status).toBe("ESTORNADO");
    expect(t.world.events.get(t.event.id)?.musicoContratadoId).toBe("m2");
  });

  it("estorno feito fora do app cancela a contratação", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.handleWebhook(received(payment.asaasPaymentId));

    await t.service.handleWebhook({ id: "evt_2", event: "PAYMENT_REFUNDED", payment: { id: payment.asaasPaymentId } });

    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", repasseStatus: null });
    expect(t.world.events.get(t.event.id)?.status).toBe("CANCELADO");
  });

  it("cobrança vencida deixa de estar pendente; cobranças de outros sistemas são ignoradas", async () => {
    const payment = await checkout();

    await t.service.handleWebhook({ id: "evt_1", event: "PAYMENT_OVERDUE", payment: { id: payment.asaasPaymentId } });
    await t.service.handleWebhook(received("pay_de_outro_sistema", "evt_2"));
    await t.service.handleWebhook({ id: "evt_3", event: "ACCOUNT_STATUS_UPDATED" });

    expect(t.world.payments.get(payment.id)?.status).toBe("EXPIRADO");
    expect(t.world.events.get(t.event.id)?.status).toBe("ABERTO");
  });
});

describe("repasse ao músico", () => {
  async function contratado() {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    return payment;
  }

  it("transfere o cachê (sem a comissão) para a chave Pix do músico", async () => {
    const payment = await contratado();

    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toEqual([{ value: 750, pixAddressKey: "m1@exemplo.com", pixAddressKeyType: "EMAIL" }]);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
  });

  it("nunca repassa duas vezes, mesmo com chamadas simultâneas", async () => {
    await contratado();

    await Promise.all([t.service.payout(t.event.id), t.service.payout(t.event.id), t.service.payout(t.event.id)]);
    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("a notificação da transferência conclui (ou marca a falha d)o repasse", async () => {
    const payment = await contratado();
    await t.service.payout(t.event.id);
    const transferId = t.world.payments.get(payment.id)!.asaasTransferId!;

    await t.service.handleWebhook({ id: "evt_t1", event: "TRANSFER_DONE", transfer: { id: transferId } });

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
  });

  it("falha na transferência fica registrada e pode ser tentada de novo", async () => {
    const payment = await contratado();
    t.world.failures.transfer = true;

    await expect(t.service.payout(t.event.id)).resolves.toBeUndefined();
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");

    t.world.failures.transfer = false;
    await t.service.payout(t.event.id);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
  });

  it("não repassa sem pagamento confirmado nem para músico sem chave Pix", async () => {
    await checkout();
    await t.service.payout(t.event.id);
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);

    const payment = [...t.world.payments.values()][0];
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    t.world.accounts.get("m1")!.chavePix = null;
    await t.service.payout(t.event.id);

    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("FALHOU");
  });
});

describe("estorno da contratação", () => {
  it("devolve o valor integral e libera a retenção", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));

    await t.service.refundHiring(t.event.id);

    expect(t.world.asaasCalls.refundPayment).toEqual([payment.asaasPaymentId]);
    expect(t.world.payments.get(payment.id)).toMatchObject({ status: "ESTORNADO", repasseStatus: null });
  });

  it("não estorna o que já foi repassado ao músico", async () => {
    const payment = await checkout();
    payAtAsaas(t.world, payment.asaasPaymentId);
    await t.service.syncCheckout(contratante, t.event.id, minutesLater(1));
    await t.service.payout(t.event.id);

    await expect(t.service.refundHiring(t.event.id)).rejects.toMatchObject({ code: "REPASSE_JA_REALIZADO" });
    expect(t.world.asaasCalls.refundPayment).toHaveLength(0);
  });
});
