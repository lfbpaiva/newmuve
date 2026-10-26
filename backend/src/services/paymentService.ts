import { calcularCobranca, COBRANCA_VALIDADE_MS, EMAIL_SUPORTE } from "../../../shared/dominio.ts";
import type { AsaasWebhook, PaymentRecord, RefundAction } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import type { AsaasGateway, AsaasPayment, EventStore, PaymentStore } from "./ports.ts";

const ASAAS_PAID = ["RECEIVED", "CONFIRMED"];
const REFUND_REQUEST_GRACE_MS = 60_000;

type RefundState = Pick<PaymentRecord, "refundStatus" | "refundAction">;

const dueDateInSaoPaulo = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);

export function createPaymentService(deps: {
  events: EventStore;
  payments: PaymentStore;
  accounts: AccountStore;
  asaas: AsaasGateway;
  notifier: Pick<Notifier, "hiringConfirmed" | "hiringCancelled" | "noShowReported" | "payoutDone">;
}) {
  const { events, payments, accounts, asaas, notifier } = deps;

  async function settlePayout(payment: PaymentRecord, transferStatus: string): Promise<void> {
    if (transferStatus === "DONE") {
      await payments.setPayout(payment.id, { status: "REPASSADO" });
      const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
      if (event) void notifier.payoutDone(event);
    }
    if (transferStatus === "FAILED" || transferStatus === "CANCELLED") await payments.setPayout(payment.id, { status: "FALHOU" });
  }

  async function completeRefund(payment: PaymentRecord): Promise<void> {
    const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
    const result = await payments.finalizeRefund(payment.id);
    if (result === "REPASSE_CONFLITANTE") {
      console.error("Estorno confirmado depois do início do repasse; requer conciliação manual", payment.id);
    }
    if (result !== "CONFIRMADO" || !event) return;
    if (payment.refundAction === "REABRIR") void notifier.hiringCancelled(event, "musico", true);
    if (payment.refundAction === "CANCELAR") void notifier.hiringCancelled(event, "contratante", true);
    if (payment.refundAction === "NAO_COMPARECIMENTO") void notifier.noShowReported(event);
  }

  const reload = async (payment: PaymentRecord) => (await payments.findPaymentByAsaasId(payment.asaasPaymentId)) ?? payment;

  const isIdleAtAsaas = (remote: AsaasPayment | null) =>
    remote !== null && ASAAS_PAID.includes(remote.status) && !remote.refunds?.some((refund) => refund.status !== "CANCELLED");

  async function refreshRefund(payment: PaymentRecord): Promise<PaymentRecord> {
    if (payment.refundStatus !== "PROCESSANDO") return payment;
    const remote = await asaas.getPayment(payment.asaasPaymentId);
    const requestSettled = !payment.refundRequestedAt || Date.now() - payment.refundRequestedAt.getTime() >= REFUND_REQUEST_GRACE_MS;
    if (remote?.status === "REFUNDED" && remote.value >= payment.valor) {
      await completeRefund(payment);
    } else if (remote?.refunds?.length && remote.refunds.every((refund) => refund.status === "CANCELLED")) {
      await payments.setRefundStatus(payment.id, "NEGADO");
    } else if (requestSettled && isIdleAtAsaas(remote)) {
      await payments.releaseRefund(payment.id, { refundStatus: null, refundAction: null });
    }
    return reload(payment);
  }

  async function undoFailedRefund(claimed: PaymentRecord, previous: RefundState, error: unknown): Promise<PaymentRecord> {
    if (error instanceof AppError && error.code.startsWith("ESTORNO_")) {
      await payments.setRefundStatus(claimed.id, "NEGADO");
      return reload(claimed);
    }
    const remote = await asaas.getPayment(claimed.asaasPaymentId).catch(() => null);
    if (remote && !isIdleAtAsaas(remote)) return refreshRefund(claimed);
    await payments.releaseRefund(claimed.id, previous);
    return reload(claimed);
  }

  async function refundLatePayment(payment: PaymentRecord): Promise<void> {
    const current = await refreshRefund(payment);
    if (current.refundStatus !== null) return;
    const previous: RefundState = { refundStatus: null, refundAction: current.refundAction };
    if (!(await payments.claimRefund(current.id, "NENHUMA"))) return;
    const claimed: PaymentRecord = { ...current, refundStatus: "PROCESSANDO", refundAction: "NENHUMA", refundRequestedAt: new Date() };
    try {
      await asaas.refundPayment(current.asaasPaymentId);
    } catch (error) {
      console.error("Falha ao solicitar o estorno de um pagamento sem evento disponível:", current.id, error instanceof AppError ? error.code : "falha inesperada");
      await undoFailedRefund(claimed, previous, error);
      return;
    }
    await refreshRefund(claimed).catch(() => {});
  }

  async function confirm(asaasPaymentId: string): Promise<void> {
    const result = await payments.confirmPayment(asaasPaymentId);
    const payment = await payments.findPaymentByAsaasId(asaasPaymentId);
    if (!payment) return;

    if (result === "EVENTO_INDISPONIVEL") {
      await refundLatePayment(payment);
      return;
    }
    if (result !== "CONTRATADO" || !payment.eventId) return;
    void notifier.hiringConfirmed(payment.eventId, payment.valorCache);

    const leftover = await payments.findPendingPayment(payment.eventId);
    if (leftover) {
      await asaas.cancelCharge(leftover.asaasPaymentId).catch((error) => console.error("Falha ao cancelar cobrança", error));
      await payments.setPaymentStatus(leftover.id, "CANCELADO");
    }
  }

  async function release(pending: PaymentRecord, now: Date): Promise<void> {
    const remote = await asaas.getPayment(pending.asaasPaymentId);
    if (remote && ASAAS_PAID.includes(remote.status)) {
      await confirm(pending.asaasPaymentId);
      throw new AppError(409, "PAGAMENTO_JA_RECEBIDO", "O pagamento deste evento já foi recebido.");
    }
    await asaas.cancelCharge(pending.asaasPaymentId);
    await payments.setPaymentStatus(pending.id, pending.expiraEm <= now ? "EXPIRADO" : "CANCELADO");
  }

  async function ensureCustomer(user: AuthUser): Promise<string> {
    const existing = await payments.getAsaasCustomerId(user.id);
    if (existing) return existing;

    const account = await accounts.findAccount(user.id);
    if (!account) throw new AppError(404, "CONTA_NAO_ENCONTRADA", "Conta não encontrada.");
    assertProfileComplete(account, "pagar");
    const customerId = await asaas.createCustomer({
      name: account.nome,
      cpfCnpj: account.documento!,
      email: user.email,
      externalReference: user.id,
    });
    await payments.setAsaasCustomerId(user.id, customerId);
    return customerId;
  }

  async function findOwnedEvent(user: AuthUser, eventId: string) {
    const event = await events.findEvent(eventId);
    if (!event || event.contractorId !== user.id) throw new AppError(404, "EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
    return event;
  }

  return {
    async startCheckout(user: AuthUser, eventId: string, candidateId: string, now = new Date()): Promise<PaymentRecord> {
      const event = await findOwnedEvent(user, eventId);
      if (event.status !== "ABERTO") throw new AppError(409, "EVENTO_INDISPONIVEL", "Este evento não está mais aberto para contratação.");
      if (event.inicio <= now) throw new AppError(409, "EVENTO_JA_INICIADO", "Este evento já começou e não pode mais receber contratações.");

      const candidate = await events.findCandidateById(candidateId);
      if (!candidate || candidate.eventId !== eventId) throw new AppError(404, "CANDIDATURA_NAO_ENCONTRADA", "Candidatura não encontrada.");
      if (candidate.status !== "PENDENTE") throw new AppError(409, "CANDIDATURA_INDISPONIVEL", "Esta candidatura não está mais disponível.");

      const pending = await payments.findPendingPayment(eventId);
      if (pending) {
        if (pending.candidateId === candidateId && pending.expiraEm > now) return pending;
        await release(pending, now);
      }

      const cobranca = calcularCobranca(candidate.valorProposto ?? event.cache);
      const customer = await ensureCustomer(user);
      const asaasPaymentId = await asaas.createPixCharge({
        customer,
        value: cobranca.total,
        dueDate: dueDateInSaoPaulo(now),
        description: `Muve — contratação de músico para "${event.titulo}"`,
        externalReference: event.id,
      });
      try {
        const qrCode = await asaas.getPixQrCode(asaasPaymentId);
        return await payments.insertPayment({
          eventId,
          candidateId,
          contractorId: user.id,
          asaasPaymentId,
          valor: cobranca.total,
          valorComissao: cobranca.comissao,
          pixCopiaCola: qrCode.payload,
          pixQrCode: qrCode.encodedImage,
          expiraEm: new Date(now.getTime() + COBRANCA_VALIDADE_MS),
        });
      } catch (error) {
        await asaas.cancelCharge(asaasPaymentId).catch((cleanupError) => console.error("Falha ao cancelar cobrança órfã", cleanupError));
        throw error;
      }
    },

    async syncCheckout(user: AuthUser, eventId: string, now = new Date()): Promise<PaymentRecord | null> {
      await findOwnedEvent(user, eventId);
      const latest = await payments.findLatestPayment(eventId);
      if (latest?.status !== "PENDENTE") return latest;

      const remote = await asaas.getPayment(latest.asaasPaymentId);
      if (remote && ASAAS_PAID.includes(remote.status) && remote.value >= latest.valor) {
        await confirm(latest.asaasPaymentId);
      } else if (latest.expiraEm <= now) {
        await asaas.cancelCharge(latest.asaasPaymentId);
        await payments.setPaymentStatus(latest.id, "EXPIRADO");
      }
      return payments.findLatestPayment(eventId);
    },

    async ensureNoActiveCheckout(eventId: string, now = new Date()): Promise<void> {
      const pending = await payments.findPendingPayment(eventId);
      if (!pending) return;
      if (pending.expiraEm > now) throw new AppError(409, "PAGAMENTO_EM_ANDAMENTO", "Há um pagamento em andamento para este evento.");
      await release(pending, now);
    },

    async payout(eventId: string): Promise<void> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status === "PAGO" && payment.repasseStatus === "PROCESSANDO" && payment.asaasTransferId) {
        const transferStatus = await asaas.getTransferStatus(payment.asaasTransferId).catch(() => null);
        if (transferStatus) await settlePayout(payment, transferStatus);
        return;
      }
      if (payment?.status !== "PAGO" || (payment.repasseStatus !== "RETIDO" && payment.repasseStatus !== "FALHOU")) return;
      if (!(await payments.claimPayout(payment.id))) return;

      try {
        const event = await events.findEvent(eventId);
        const musician = event?.musicoContratadoId ? await accounts.findAccount(event.musicoContratadoId) : null;
        if (!musician?.chavePix || !musician.chavePixTipo) throw new Error("músico sem chave Pix cadastrada");

        const transfer = await asaas.transferPix({
          value: payment.valorCache,
          pixAddressKey: musician.chavePix,
          pixAddressKeyType: musician.chavePixTipo,
          description: `Muve — cachê de "${event!.titulo}"`,
          externalReference: payment.id,
        });
        await payments.setPayout(payment.id, { status: transfer.status === "DONE" ? "REPASSADO" : "PROCESSANDO", asaasTransferId: transfer.id });
      } catch (error) {
        console.error("Falha no repasse do pagamento", payment.id, error);
        await payments.setPayout(payment.id, { status: "FALHOU" }).catch(() => {});
      }
    },

    async refundHiring(eventId: string, action: RefundAction): Promise<"PROCESSANDO" | "ESTORNADO"> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status !== "PAGO") throw new AppError(409, "PAGAMENTO_NAO_CONFIRMADO", "Não há pagamento confirmado para estornar nesta contratação.");
      if (payment.repasseStatus === "PROCESSANDO" || payment.repasseStatus === "REPASSADO") {
        throw new AppError(409, "REPASSE_JA_REALIZADO", "O cachê deste evento já foi repassado ao músico.");
      }
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote || remote.value < payment.valor) throw new AppError(409, "ESTORNO_COBRANCA_DIVERGENTE", `A cobrança no Asaas não corresponde ao pagamento registrado. Escreva para ${EMAIL_SUPORTE}.`);
      let current = payment;
      if (current.refundStatus === "PROCESSANDO") {
        current = await refreshRefund(current);
        if (current.status === "ESTORNADO") return "ESTORNADO";
        if (current.refundStatus === "PROCESSANDO") return "PROCESSANDO";
      }
      if (remote.status !== "RECEIVED" && remote.status !== "CONFIRMED" && remote.status !== "REFUNDED") {
        throw new AppError(409, "ESTORNO_COBRANCA_DIVERGENTE", "A cobrança não está confirmada no Asaas. Atualize a contratação e tente novamente.");
      }
      const previous: RefundState = { refundStatus: current.refundStatus, refundAction: current.refundAction };
      if (!(await payments.claimRefund(current.id, action))) return "PROCESSANDO";
      const claimed: PaymentRecord = { ...current, refundStatus: "PROCESSANDO", refundAction: action, refundRequestedAt: new Date() };
      if (remote.status === "REFUNDED") {
        await completeRefund(claimed);
        return "ESTORNADO";
      }
      if (remote.refunds?.some((refund) => refund.status === "PENDING")) return "PROCESSANDO";
      try {
        await asaas.refundPayment(current.asaasPaymentId);
      } catch (error) {
        const latest = await undoFailedRefund(claimed, previous, error);
        if (latest.status === "ESTORNADO") return "ESTORNADO";
        if (latest.refundStatus === "PROCESSANDO") return "PROCESSANDO";
        throw error instanceof AppError
          ? error
          : new AppError(503, "ESTORNO_INDISPONIVEL", "Não foi possível solicitar o estorno agora. A contratação continua ativa; tente novamente em instantes.");
      }
      const latest = await refreshRefund(claimed).catch(() => claimed);
      return latest.status === "ESTORNADO" ? "ESTORNADO" : "PROCESSANDO";
    },

    async refreshRefund(eventId: string): Promise<PaymentRecord | null> {
      const payment = await payments.findLatestPayment(eventId);
      if (!payment) return null;
      return refreshRefund(payment);
    },

    async ensurePaidForNoRefund(eventId: string): Promise<void> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status !== "PAGO" || payment.refundStatus === "PROCESSANDO") throw new AppError(409, "PAGAMENTO_INDISPONIVEL", "O pagamento deste evento não está disponível para cancelamento sem estorno.");
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote || !ASAAS_PAID.includes(remote.status) || remote.value < payment.valor) {
        throw new AppError(409, "PAGAMENTO_DIVERGENTE", `O pagamento no Asaas não corresponde ao registro do evento. Escreva para ${EMAIL_SUPORTE}.`);
      }
    },

    async cancelPendingCheckout(user: AuthUser, eventId: string, now = new Date()): Promise<void> {
      const event = await findOwnedEvent(user, eventId);
      if (event.status !== "ABERTO") throw new AppError(409, "EVENTO_INDISPONIVEL", "Este evento já não está aberto para cancelar a cobrança.");
      const pending = await payments.findPendingPayment(eventId);
      if (!pending) throw new AppError(409, "COBRANCA_NAO_PENDENTE", "Não existe cobrança pendente para cancelar.");
      await release(pending, now);
    },

    findPayment: (eventId: string) => payments.findLatestPayment(eventId),

    async handleWebhook(notification: AsaasWebhook): Promise<void> {
      if (await payments.webhookEventExists(notification.id)) return;

      if (notification.transfer) {
        const payment = await payments.findPaymentByTransferId(notification.transfer.id);
        if (payment?.repasseStatus === "PROCESSANDO") await settlePayout(payment, notification.event.replace("TRANSFER_", ""));
      }

      const asaasPaymentId = notification.payment?.id;
      const local = asaasPaymentId ? await payments.findPaymentByAsaasId(asaasPaymentId) : null;
      if (asaasPaymentId && local) {
        switch (notification.event) {
          case "PAYMENT_RECEIVED":
          case "PAYMENT_CONFIRMED": {
            const remote = await asaas.getPayment(asaasPaymentId);
            if (!remote || !ASAAS_PAID.includes(remote.status) || remote.value < local.valor) {
              console.warn("Notificação de pagamento não confirmada na Asaas:", asaasPaymentId);
              return;
            }
            await confirm(asaasPaymentId);
            break;
          }
          case "PAYMENT_OVERDUE":
            if (local.status === "PENDENTE") await payments.setPaymentStatus(local.id, "EXPIRADO");
            break;
          case "PAYMENT_DELETED":
            if (local.status === "PENDENTE") await payments.setPaymentStatus(local.id, "CANCELADO");
            break;
          case "PAYMENT_REFUNDED": {
            const remote = await asaas.getPayment(asaasPaymentId);
            if (!remote || remote.status !== "REFUNDED" || remote.value < local.valor) return;
            if (local.status === "PAGO" || local.refundStatus !== null) await completeRefund(local);
            else if (local.status === "PENDENTE") await payments.setPaymentStatus(local.id, "CANCELADO");
            break;
          }
          case "PAYMENT_REFUND_DENIED":
            if (local.refundStatus === "PROCESSANDO") {
              const remote = await asaas.getPayment(asaasPaymentId);
              if (remote?.status === "REFUNDED" && remote.value >= local.valor) await completeRefund(local);
              else if (!remote?.refunds?.some((refund) => refund.status === "PENDING")) await payments.setRefundStatus(local.id, "NEGADO");
            }
            break;
        }
      }

      await payments.recordWebhookEvent({ id: notification.id, tipo: notification.event, asaasPaymentId, payload: notification });
    },
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
