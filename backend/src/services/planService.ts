import { CASA_PRECO, PLANO_DIAS_POR_PAGAMENTO, PRO_PRECO } from "../../../shared/dominio.ts";
import type { Role } from "../domain/account.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import type { AsaasGateway } from "./ports.ts";

export type Plano = "PRO" | "CASA";
export type PlanSubscriptionStatus = "AGUARDANDO_PAGAMENTO" | "ATIVA" | "CANCELADA";

export interface PlanSubscription {
  userId: string;
  plano: Plano;
  asaasSubscriptionId: string;
  status: PlanSubscriptionStatus;
  valor: number;
}

export interface PlanStore {
  findSubscription(userId: string): Promise<PlanSubscription | null>;
  findSubscriptionByAsaasId(asaasSubscriptionId: string): Promise<PlanSubscription | null>;
  saveSubscription(subscription: PlanSubscription): Promise<void>;
  setSubscriptionStatus(userId: string, status: PlanSubscriptionStatus): Promise<void>;
  getCustomerId(userId: string, role: Role): Promise<string | null>;
  setCustomerId(userId: string, role: Role, customerId: string): Promise<void>;
  activate(userId: string, asaasPaymentId: string, dias: number): Promise<Date | null>;
}

export interface PlanStatus {
  plano: Plano;
  ativoAte: string | null;
  assinatura: {
    status: PlanSubscriptionStatus;
    valor: number;
    cobranca: { pixCopiaCola: string; pixQrCode: string; vencimento: string } | null;
  } | null;
}

const PLANOS: Record<Role, { plano: Plano; preco: number; descricao: string }> = {
  MUSICIAN: { plano: "PRO", preco: PRO_PRECO, descricao: "Muve Pro — assinatura mensal" },
  CONTRACTOR: { plano: "CASA", preco: CASA_PRECO, descricao: "Muve Casa — assinatura mensal" },
};

const PAGO = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];
const EM_ABERTO = ["PENDING", "OVERDUE"];

const hojeEmSaoPaulo = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);

export function createPlanService(deps: { accounts: AccountStore; store: PlanStore; asaas: AsaasGateway; notifier: Pick<Notifier, "planActivated"> }) {
  const { accounts, store, asaas, notifier } = deps;

  async function requireAccount(user: AuthUser) {
    const account = await accounts.findAccount(user.id);
    if (!account) throw new AppError(404, "CONTA_NAO_ENCONTRADA", "Conta não encontrada.");
    return account;
  }

  async function sync(userId: string): Promise<PlanStatus> {
    const account = await accounts.findAccount(userId);
    const { plano } = PLANOS[account?.role ?? "MUSICIAN"];
    let ativoAte = (plano === "PRO" ? account?.proAte : account?.casaAte) ?? null;
    const subscription = await store.findSubscription(userId);
    if (!subscription) return { plano, ativoAte: ativoAte?.toISOString() ?? null, assinatura: null };

    const cobrancas = await asaas.listSubscriptionPayments(subscription.asaasSubscriptionId);
    for (const pago of cobrancas.filter((c) => PAGO.includes(c.status))) {
      const antes = ativoAte?.getTime() ?? 0;
      ativoAte = (await store.activate(userId, pago.id, PLANO_DIAS_POR_PAGAMENTO)) ?? ativoAte;
      if (ativoAte && ativoAte.getTime() > antes) void notifier.planActivated(userId, plano, ativoAte);
    }
    const status = subscription.status === "AGUARDANDO_PAGAMENTO" && cobrancas.some((c) => PAGO.includes(c.status)) ? "ATIVA" : subscription.status;

    const emAberto = status === "CANCELADA" ? null : cobrancas.filter((c) => EM_ABERTO.includes(c.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const qr = emAberto ? await asaas.getPixQrCode(emAberto.id).catch(() => null) : null;
    return {
      plano,
      ativoAte: ativoAte?.toISOString() ?? null,
      assinatura: {
        status,
        valor: subscription.valor,
        cobranca: emAberto && qr ? { pixCopiaCola: qr.payload, pixQrCode: qr.encodedImage, vencimento: emAberto.dueDate } : null,
      },
    };
  }

  return {
    async status(user: AuthUser): Promise<PlanStatus> {
      await requireAccount(user);
      return sync(user.id);
    },

    async subscribe(user: AuthUser, now = new Date()): Promise<PlanStatus> {
      const account = await requireAccount(user);
      assertProfileComplete(account, "pagar");
      const existing = await store.findSubscription(user.id);
      if (existing && existing.status !== "CANCELADA") return sync(user.id);

      const { plano, preco, descricao } = PLANOS[account.role];
      let customer = await store.getCustomerId(user.id, account.role);
      if (!customer) {
        customer = await asaas.createCustomer({ name: account.nome, cpfCnpj: account.documento!, email: user.email, externalReference: user.id });
        await store.setCustomerId(user.id, account.role, customer);
      }
      const asaasSubscriptionId = await asaas.createSubscription({ customer, value: preco, nextDueDate: hojeEmSaoPaulo(now), description: descricao, externalReference: user.id });
      await store.saveSubscription({ userId: user.id, plano, asaasSubscriptionId, status: "AGUARDANDO_PAGAMENTO", valor: preco });
      return sync(user.id);
    },

    async cancel(user: AuthUser): Promise<PlanStatus> {
      await requireAccount(user);
      const subscription = await store.findSubscription(user.id);
      if (!subscription || subscription.status === "CANCELADA") throw new AppError(409, "SEM_ASSINATURA", "Você não tem uma assinatura ativa.");
      await asaas.cancelSubscription(subscription.asaasSubscriptionId);
      await store.setSubscriptionStatus(user.id, "CANCELADA");
      return sync(user.id);
    },

    async handleWebhook(asaasSubscriptionId: string): Promise<void> {
      const subscription = await store.findSubscriptionByAsaasId(asaasSubscriptionId);
      if (subscription) await sync(subscription.userId);
    },
  };
}

export type PlanService = ReturnType<typeof createPlanService>;
