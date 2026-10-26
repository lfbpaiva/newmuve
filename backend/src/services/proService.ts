import { assertProfileComplete, type AccountStore, type AuthUser } from "./accountService.ts";
import { AppError } from "../domain/errors.ts";
import { PRO_DIAS_POR_PAGAMENTO, PRO_PRECO } from "../../../shared/dominio.ts";
import type { Notifier } from "./notifications.ts";
import type { AsaasGateway } from "./ports.ts";

export type ProSubscriptionStatus = "AGUARDANDO_PAGAMENTO" | "ATIVA" | "CANCELADA";

export interface ProSubscription {
  musicianId: string;
  asaasSubscriptionId: string;
  status: ProSubscriptionStatus;
  valor: number;
}

export interface ProStore {
  findSubscription(musicianId: string): Promise<ProSubscription | null>;
  findSubscriptionByAsaasId(asaasSubscriptionId: string): Promise<ProSubscription | null>;
  saveSubscription(subscription: ProSubscription): Promise<void>;
  setSubscriptionStatus(musicianId: string, status: ProSubscriptionStatus): Promise<void>;
  getCustomerId(musicianId: string): Promise<string | null>;
  setCustomerId(musicianId: string, customerId: string): Promise<void>;
  activate(musicianId: string, asaasPaymentId: string, dias: number): Promise<Date | null>;
}

export interface ProStatus {
  ativoAte: string | null;
  assinatura: {
    status: ProSubscriptionStatus;
    valor: number;
    cobranca: { pixCopiaCola: string; pixQrCode: string; vencimento: string } | null;
  } | null;
}

const PAGO = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];
const EM_ABERTO = ["PENDING", "OVERDUE"];

const hojeEmSaoPaulo = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);

export function createProService(deps: { accounts: AccountStore; store: ProStore; asaas: AsaasGateway; notifier: Pick<Notifier, "proActivated"> }) {
  const { accounts, store, asaas, notifier } = deps;

  async function requireMusician(user: AuthUser) {
    const account = await accounts.findAccount(user.id);
    if (account?.role !== "MUSICIAN") throw new AppError(403, "APENAS_MUSICOS", "O Muve Pro é um plano para músicos.");
    return account;
  }

  async function sync(musicianId: string): Promise<ProStatus> {
    const subscription = await store.findSubscription(musicianId);
    let ativoAte = (await accounts.findAccount(musicianId))?.proAte ?? null;
    if (!subscription) return { ativoAte: ativoAte?.toISOString() ?? null, assinatura: null };

    const cobrancas = await asaas.listSubscriptionPayments(subscription.asaasSubscriptionId);
    for (const pago of cobrancas.filter((c) => PAGO.includes(c.status))) {
      const antes = ativoAte?.getTime() ?? 0;
      ativoAte = (await store.activate(musicianId, pago.id, PRO_DIAS_POR_PAGAMENTO)) ?? ativoAte;
      if (ativoAte && ativoAte.getTime() > antes) void notifier.proActivated(musicianId, ativoAte);
    }
    const status = subscription.status === "AGUARDANDO_PAGAMENTO" && cobrancas.some((c) => PAGO.includes(c.status)) ? "ATIVA" : subscription.status;

    const emAberto = status === "CANCELADA" ? null : cobrancas.filter((c) => EM_ABERTO.includes(c.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const qr = emAberto ? await asaas.getPixQrCode(emAberto.id).catch(() => null) : null;
    return {
      ativoAte: ativoAte?.toISOString() ?? null,
      assinatura: {
        status,
        valor: subscription.valor,
        cobranca: emAberto && qr ? { pixCopiaCola: qr.payload, pixQrCode: qr.encodedImage, vencimento: emAberto.dueDate } : null,
      },
    };
  }

  return {
    async status(user: AuthUser): Promise<ProStatus> {
      await requireMusician(user);
      return sync(user.id);
    },

    async subscribe(user: AuthUser, now = new Date()): Promise<ProStatus> {
      const account = await requireMusician(user);
      assertProfileComplete(account, "pagar");
      const existing = await store.findSubscription(user.id);
      if (existing && existing.status !== "CANCELADA") return sync(user.id);

      let customer = await store.getCustomerId(user.id);
      if (!customer) {
        customer = await asaas.createCustomer({ name: account.nome, cpfCnpj: account.documento!, email: user.email, externalReference: user.id });
        await store.setCustomerId(user.id, customer);
      }
      const asaasSubscriptionId = await asaas.createSubscription({
        customer,
        value: PRO_PRECO,
        nextDueDate: hojeEmSaoPaulo(now),
        description: "Muve Pro — assinatura mensal",
        externalReference: user.id,
      });
      await store.saveSubscription({ musicianId: user.id, asaasSubscriptionId, status: "AGUARDANDO_PAGAMENTO", valor: PRO_PRECO });
      return sync(user.id);
    },

    async cancel(user: AuthUser): Promise<ProStatus> {
      await requireMusician(user);
      const subscription = await store.findSubscription(user.id);
      if (!subscription || subscription.status === "CANCELADA") throw new AppError(409, "SEM_ASSINATURA", "Você não tem uma assinatura ativa.");
      await asaas.cancelSubscription(subscription.asaasSubscriptionId);
      await store.setSubscriptionStatus(user.id, "CANCELADA");
      return sync(user.id);
    },

    async handleWebhook(asaasSubscriptionId: string): Promise<void> {
      const subscription = await store.findSubscriptionByAsaasId(asaasSubscriptionId);
      if (subscription) await sync(subscription.musicianId);
    },
  };
}

export type ProService = ReturnType<typeof createProService>;
