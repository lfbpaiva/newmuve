import { beforeEach, describe, expect, it } from "vitest";
import { CASA_PRECO, PRO_PRECO } from "../../../shared/dominio.ts";
import { createNotifier } from "./notifications.ts";
import { createPlanService, type PlanStore, type PlanSubscription } from "./planService.ts";
import { contratante, memoryWorld, musico, NOW } from "./testing.ts";

function setup() {
  const world = memoryWorld();
  const subscriptions = new Map<string, PlanSubscription>();
  const customers = new Map<string, string>();
  const paid = new Set<string>();
  const store: PlanStore = {
    findSubscription: async (userId) => subscriptions.get(userId) ?? null,
    findSubscriptionByAsaasId: async (id) => [...subscriptions.values()].find((s) => s.asaasSubscriptionId === id) ?? null,
    saveSubscription: async (subscription) => void subscriptions.set(subscription.userId, subscription),
    setSubscriptionStatus: async (userId, status) => void (subscriptions.get(userId)!.status = status),
    getCustomerId: async (userId) => customers.get(userId) ?? null,
    setCustomerId: async (userId, _role, customerId) => void customers.set(userId, customerId),
    activate: async (userId, paymentId, dias) => {
      const account = world.accounts.get(userId)!;
      const campo = account.role === "MUSICIAN" ? "proAte" : "casaAte";
      if (paid.has(paymentId)) return account[campo] ?? null;
      paid.add(paymentId);
      const base = Math.max(account[campo]?.getTime() ?? 0, Date.now());
      account[campo] = new Date(base + dias * 24 * 60 * 60 * 1000);
      const subscription = subscriptions.get(userId);
      if (subscription?.status === "AGUARDANDO_PAGAMENTO") subscription.status = "ATIVA";
      return account[campo];
    },
  };
  const notifier = createNotifier({ ...world.stores, appUrl: "http://localhost:8081" });
  const service = createPlanService({ accounts: world.stores.accounts, store, asaas: world.stores.asaas, notifier });
  const pagarPrimeira = async () => {
    const [asaasId, subscription] = [...world.asaasSubscriptions.entries()].at(-1)!;
    subscription.payments[0].status = "RECEIVED";
    await service.handleWebhook(asaasId);
    return subscription;
  };
  return { world, service, pagarPrimeira };
}

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

describe("assinaturas Muve Pro e Muve Casa", () => {
  it("o músico assina o Pro e o contratante assina o Casa, cada um pelo seu preço", async () => {
    const pro = await t.service.subscribe(musico, NOW);
    const casa = await t.service.subscribe(contratante, NOW);

    expect(pro).toMatchObject({ plano: "PRO", ativoAte: null, assinatura: { status: "AGUARDANDO_PAGAMENTO", valor: PRO_PRECO, cobranca: { pixCopiaCola: expect.any(String) } } });
    expect(casa).toMatchObject({ plano: "CASA", assinatura: { valor: CASA_PRECO } });
  });

  it("o pagamento ativa o plano por um mês, uma única vez por cobrança, e avisa o assinante", async () => {
    await t.service.subscribe(contratante, NOW);
    await t.pagarPrimeira();
    const primeiro = t.world.accounts.get("c1")!.casaAte!.getTime();

    const status = await t.service.status(contratante);

    expect(status.assinatura?.status).toBe("ATIVA");
    expect(t.world.accounts.get("c1")!.casaAte!.getTime()).toBe(primeiro);
    expect(t.world.notifications.filter((n) => n.userId === "c1").map((n) => n.titulo)).toEqual(["Muve Casa ativo"]);
  });

  it("cancelar encerra a renovação, mas mantém o plano até o fim do período pago", async () => {
    await t.service.subscribe(musico, NOW);
    const subscription = await t.pagarPrimeira();

    const status = await t.service.cancel(musico);

    expect(subscription.cancelled).toBe(true);
    expect(status).toMatchObject({ assinatura: { status: "CANCELADA" }, ativoAte: expect.any(String) });
  });
});
