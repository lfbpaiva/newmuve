import { calcularCobranca, COBRANCA_VALIDADE_MS } from "../../../shared/dominio.ts";
import type { AsaasWebhook, PaymentRecord } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import type { AsaasGateway, EventStore, PaymentStore } from "./ports.ts";

const ASAAS_PAID = ["RECEIVED", "CONFIRMED"];

// Vencimento da cobrança na Asaas (data, sem hora). O prazo real de 15 minutos é
// controlado por expira_em: o QR Code da Asaas vale por meses, então toda
// cobrança que deixa de valer é cancelada lá também.
const dueDateInSaoPaulo = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);

export function createPaymentService(deps: {
  events: EventStore;
  payments: PaymentStore;
  accounts: AccountStore;
  asaas: AsaasGateway;
  notifier: Pick<Notifier, "hiringConfirmed">;
}) {
  const { events, payments, accounts, asaas, notifier } = deps;

  /** Efetiva a contratação de uma cobrança que a Asaas confirma como paga. */
  async function confirm(asaasPaymentId: string): Promise<void> {
    const result = await payments.confirmPayment(asaasPaymentId);
    const payment = await payments.findPaymentByAsaasId(asaasPaymentId);
    if (!payment) return;

    if (result === "EVENTO_INDISPONIVEL") {
      // Pagamento tardio (evento já contratado, excluído ou sem o candidato): devolve o dinheiro.
      try {
        await asaas.refundPayment(asaasPaymentId);
        await payments.setPaymentStatus(payment.id, "ESTORNADO");
      } catch (error) {
        console.error("Pagamento sem evento disponível e estorno falhou; requer estorno manual:", asaasPaymentId, error);
      }
      return;
    }
    if (result !== "CONTRATADO" || !payment.eventId) return;
    void notifier.hiringConfirmed(payment.eventId);

    // Contratação efetivada: nenhuma outra cobrança do evento pode continuar pagável.
    const leftover = await payments.findPendingPayment(payment.eventId);
    if (leftover) {
      await asaas.cancelCharge(leftover.asaasPaymentId).catch((error) => console.error("Falha ao cancelar cobrança", error));
      await payments.setPaymentStatus(leftover.id, "CANCELADO");
    }
  }

  /**
   * Libera o evento de uma cobrança que não vale mais (expirada ou substituída),
   * cancelando-a também na Asaas para que não possa ser paga depois.
   */
  async function release(pending: PaymentRecord, now: Date): Promise<void> {
    const remote = await asaas.getPayment(pending.asaasPaymentId);
    if (remote && ASAAS_PAID.includes(remote.status)) {
      // O Pix foi pago e a notificação ainda não chegou: prevalece o pagamento.
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
      mobilePhone: account.telefone!,
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
    /**
     * Aprova um candidato gerando a cobrança Pix (cachê + comissão). Os valores vêm
     * do evento gravado no banco, nunca da requisição. Repetir a chamada enquanto a
     * cobrança estiver válida devolve a mesma cobrança.
     */
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

      const cobranca = calcularCobranca(event.cache);
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
        // Sem registro local, a cobrança não pode ficar aberta na Asaas.
        await asaas.cancelCharge(asaasPaymentId).catch((cleanupError) => console.error("Falha ao cancelar cobrança órfã", cleanupError));
        throw error;
      }
    },

    /**
     * Situação atual da cobrança do evento, conferida na Asaas. Complementa o
     * webhook: mesmo que a notificação atrase ou se perca, a tela de checkout
     * descobre o pagamento, e uma cobrança expirada é cancelada na Asaas.
     */
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

    /**
     * Impede alterações em um evento com cobrança válida em andamento; cobranças
     * já expiradas são encerradas.
     */
    async ensureNoActiveCheckout(eventId: string, now = new Date()): Promise<void> {
      const pending = await payments.findPendingPayment(eventId);
      if (!pending) return;
      if (pending.expiraEm > now) throw new AppError(409, "PAGAMENTO_EM_ANDAMENTO", "Há um pagamento em andamento para este evento.");
      await release(pending, now);
    },

    /**
     * Repassa o cachê retido ao músico, por Pix. Idempotente e seguro sob
     * concorrência (claimPayout). Nunca lança: uma falha fica registrada como
     * FALHOU e é tentada de novo na próxima chamada.
     */
    async payout(eventId: string): Promise<void> {
      const payment = await payments.findLatestPayment(eventId);
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
        // A conclusão da transferência chega pelo webhook (TRANSFER_DONE / TRANSFER_FAILED).
        await payments.setPayout(payment.id, { status: transfer.status === "DONE" ? "REPASSADO" : "PROCESSANDO", asaasTransferId: transfer.id });
      } catch (error) {
        console.error("Falha no repasse do pagamento", payment.id, error);
        await payments.setPayout(payment.id, { status: "FALHOU" }).catch(() => {});
      }
    },

    /** Devolve ao contratante o valor pago por uma contratação ainda não repassada. */
    async refundHiring(eventId: string): Promise<void> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status !== "PAGO") return;
      if (payment.repasseStatus === "PROCESSANDO" || payment.repasseStatus === "REPASSADO") {
        throw new AppError(409, "REPASSE_JA_REALIZADO", "O cachê deste evento já foi repassado ao músico.");
      }
      await asaas.refundPayment(payment.asaasPaymentId);
      await payments.setPaymentStatus(payment.id, "ESTORNADO");
      await payments.setPayout(payment.id, { status: null });
    },

    findPayment: (eventId: string) => payments.findLatestPayment(eventId),

    /**
     * Processa uma notificação da Asaas. A autenticidade do remetente é checada na
     * camada HTTP; aqui o status é reconfirmado na API da Asaas antes de contratar.
     * Só lança em falha inesperada (ex.: banco fora do ar), para a Asaas reenviar:
     * respostas de erro repetidas fazem a Asaas pausar a fila de notificações.
     */
    async handleWebhook(notification: AsaasWebhook): Promise<void> {
      if (await payments.webhookEventExists(notification.id)) return;

      if (notification.transfer) {
        const payment = await payments.findPaymentByTransferId(notification.transfer.id);
        if (payment?.repasseStatus === "PROCESSANDO") {
          if (notification.event === "TRANSFER_DONE") await payments.setPayout(payment.id, { status: "REPASSADO" });
          if (notification.event === "TRANSFER_FAILED" || notification.event === "TRANSFER_CANCELLED") {
            await payments.setPayout(payment.id, { status: "FALHOU" });
          }
        }
      }

      const asaasPaymentId = notification.payment?.id;
      const local = asaasPaymentId ? await payments.findPaymentByAsaasId(asaasPaymentId) : null;
      if (asaasPaymentId && local) {
        switch (notification.event) {
          case "PAYMENT_RECEIVED":
          case "PAYMENT_CONFIRMED": {
            const remote = await asaas.getPayment(asaasPaymentId);
            if (!remote || !ASAAS_PAID.includes(remote.status) || remote.value < local.valor) {
              // Notificação forjada ou prematura: ignorada sem registrar. Se o pagamento
              // for real, a consulta ativa (syncCheckout) ou a próxima notificação o confirma.
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
          case "PAYMENT_REFUNDED":
            // Estorno feito fora do app (painel da Asaas): a contratação deixa de valer.
            if (local.status === "PAGO") {
              await payments.setPaymentStatus(local.id, "ESTORNADO");
              await payments.setPayout(local.id, { status: null });
              const event = local.eventId ? await events.findEvent(local.eventId) : null;
              if (event?.status === "CONTRATADO") await events.cancelEvent(event.id);
            }
            break;
        }
      }

      // Registrado só ao final: se o processamento falhar, o reenvio da Asaas é aceito.
      await payments.recordWebhookEvent({ id: notification.id, tipo: notification.event, asaasPaymentId, payload: notification });
    },
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
