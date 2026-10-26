import { beforeEach, describe, expect, it } from "vitest";
import { PRO_PRECO } from "../../../shared/dominio.ts";
import { createNotifier } from "./notifications.ts";
import { createProService, type ProStore, type ProSubscription } from "./proService.ts";
import { contratante, memoryWorld, musico, NOW } from "./testing.ts";

function setup() {
  const world = memoryWorld();
  const subscriptions = new Map<string, ProSubscription>();
  const customers = new Map<string, string>();
  const paid = new Set<string>();
  const store: ProStore = {
    findSubscription: async (musicianId) => subscriptions.get(musicianId) ?? null,
    findSubscriptionByAsaasId: async (id) => [...subscriptions.values()].find((s) => s.asaasSubscriptionId === id) ?? null,
    saveSubscription: async (subscription) => void subscriptions.set(subscription.musicianId, subscription),
    setSubscriptionStatus: async (musicianId, status) => void (subscriptions.get(musicianId)!.status = status),
    getCustomerId: async (musicianId) => customers.get(musicianId) ?? null,
    setCustomerId: async (musicianId, customerId) => void customers.set(musicianId, customerId),
    activate: async (musicianId, paymentId, dias) => {
      const account = world.accounts.get(musicianId)!;
      if (paid.has(paymentId)) return account.proAte ?? null;
      paid.add(paymentId);
      const base = Math.max(account.proAte?.getTime() ?? 0, Date.now());
      account.proAte = new Date(base + dias * 24 * 60 * 60 * 1000);
      const subscription = subscriptions.get(musicianId);
      if (subscription?.status === "AGUARDANDO_PAGAMENTO") subscription.status = "ATIVA";
      return account.proAte;
    },
  };
  const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8081" });
  const service = createProService({ accounts: world.stores.accounts, store, asaas: world.stores.asaas, notifier });
  return { world, service, subscriptions };
}

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

describe("Muve Pro", () => {
  it("assinar gera a cobrança Pix do primeiro mês e ainda não ativa o plano", async () => {
    const status = await t.service.subscribe(musico, NOW);

    expect(status).toMatchObject({ ativoAte: null, assinatura: { status: "AGUARDANDO_PAGAMENTO", valor: PRO_PRECO, cobranca: { pixCopiaCola: expect.any(String) } } });
    expect(t.world.asaasSubscriptions.size).toBe(1);
  });

  it("o pagamento ativa o Pro por um mês, uma única vez por cobrança, e avisa o músico", async () => {
    await t.service.subscribe(musico, NOW);
    const [asaasId, subscription] = [...t.world.asaasSubscriptions.entries()][0];
    subscription.payments[0].status = "RECEIVED";

    await t.service.handleWebhook(asaasId);
    const primeiro = t.world.accounts.get("m1")!.proAte!.getTime();
    const status = await t.service.status(musico);

    expect(status.assinatura?.status).toBe("ATIVA");
    expect(t.world.accounts.get("m1")!.proAte!.getTime()).toBe(primeiro);
    expect(t.world.notifications.filter((n) => n.userId === "m1").map((n) => n.titulo)).toEqual(["Muve Pro ativo"]);
  });

  it("cancelar encerra a renovação, mas mantém o Pro até o fim do período pago", async () => {
    await t.service.subscribe(musico, NOW);
    const [asaasId, subscription] = [...t.world.asaasSubscriptions.entries()][0];
    subscription.payments[0].status = "RECEIVED";
    await t.service.handleWebhook(asaasId);

    const status = await t.service.cancel(musico);

    expect(subscription.cancelled).toBe(true);
    expect(status.assinatura?.status).toBe("CANCELADA");
    expect(status.ativoAte).not.toBeNull();
  });

  it("é um plano só para músicos", async () => {
    await expect(t.service.subscribe(contratante, NOW)).rejects.toMatchObject({ code: "APENAS_MUSICOS" });
  });
});
