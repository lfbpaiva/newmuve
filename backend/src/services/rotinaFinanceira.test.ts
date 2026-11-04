import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEventService } from "./eventService.ts";
import { createNotifier } from "./notifications.ts";
import { createPaymentService } from "./paymentService.ts";
import { createRotinaFinanceira } from "./rotinaFinanceira.ts";
import { contratante, hoursFromNow, memoryWorld, NOW, payAtAsaas } from "./testing.ts";

function setup() {
  const world = memoryWorld();
  const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8443" });
  const payments = createPaymentService({ ...world.stores, notifier });
  const events = createEventService({ ...world.stores, payments, notifier });
  const rotina = createRotinaFinanceira({ paymentStore: world.stores.payments, eventStore: world.stores.events, payments, events });
  const event = world.seedEvent();
  const candidate = world.seedCandidate(event.id, "m1");
  return { world, payments, rotina, event, candidate };
}

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const umaSemanaDepois = () => new Date(t.event.inicio.getTime() + 8 * 24 * 60 * 60 * 1000);

async function contratado() {
  const payment = await t.payments.startCheckout(contratante, t.event.id, t.candidate.id, NOW);
  payAtAsaas(t.world, payment.asaasPaymentId);
  await t.payments.syncCheckout(contratante, t.event.id, NOW);
  return payment;
}

describe("rotina financeira", () => {
  it("expira a cobrança vencida sem ninguém abrir o app", async () => {
    const payment = await t.payments.startCheckout(contratante, t.event.id, t.candidate.id, NOW);

    await t.rotina.run(hoursFromNow(1));

    expect(t.world.payments.get(payment.id)?.status).toBe("EXPIRADO");
    expect(t.world.asaasCalls.cancelCharge).toContain(payment.asaasPaymentId);
  });

  it("contrata quando o Pix foi pago e a notificação se perdeu", async () => {
    const payment = await t.payments.startCheckout(contratante, t.event.id, t.candidate.id, NOW);
    payAtAsaas(t.world, payment.asaasPaymentId);

    await t.rotina.run(hoursFromNow(1));

    expect(t.world.payments.get(payment.id)?.status).toBe("PAGO");
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
  });

  it("conclui o show depois de 7 dias, mesmo sem confirmação, e repassa o cachê", async () => {
    const payment = await contratado();

    await t.rotina.run(umaSemanaDepois());

    expect(t.world.events.get(t.event.id)?.status).toBe("CONCLUIDO");
    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("PROCESSANDO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("não conclui nem repassa com contestação aberta ou antes do prazo", async () => {
    await contratado();

    await t.rotina.run(hoursFromNow(80));
    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");

    t.world.disputes.push({ id: "d1", eventId: t.event.id, abertaPor: "c1", motivo: "Show não aconteceu", status: "ABERTA", decisao: null, observacao: null, createdAt: NOW });
    await t.rotina.run(umaSemanaDepois());

    expect(t.world.events.get(t.event.id)?.status).toBe("CONTRATADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(0);
  });

  it("acompanha o repasse até a conclusão e nunca transfere de novo", async () => {
    const payment = await contratado();
    await t.rotina.run(umaSemanaDepois());
    t.world.asaasTransfers.set(t.world.payments.get(payment.id)!.asaasTransferId!, "DONE");

    await t.rotina.run(umaSemanaDepois());

    expect(t.world.payments.get(payment.id)?.repasseStatus).toBe("REPASSADO");
    expect(t.world.asaasCalls.transferPix).toHaveLength(1);
  });

  it("falha em um item não impede os demais", async () => {
    const outroEvento = t.world.seedEvent();
    const outroCandidato = t.world.seedCandidate(outroEvento.id, "m2");
    const primeiro = await t.payments.startCheckout(contratante, t.event.id, t.candidate.id, NOW);
    const segundo = await t.payments.startCheckout(contratante, outroEvento.id, outroCandidato.id, NOW);
    vi.spyOn(t.world.stores.asaas, "getPayment").mockRejectedValueOnce(new Error("Asaas fora do ar"));

    await t.rotina.run(hoursFromNow(1));

    expect(t.world.payments.get(primeiro.id)?.status).toBe("PENDENTE");
    expect(t.world.payments.get(segundo.id)?.status).toBe("EXPIRADO");
  });
});
