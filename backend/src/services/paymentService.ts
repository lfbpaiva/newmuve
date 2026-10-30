import { calcularCobranca } from "../../../shared/dominio.ts";
import type { AsaasWebhook, PaymentRecord, RefundAction } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import type { AsaasGateway, EventStore, PaymentStore, PayoutIntentRecord } from "./ports.ts";

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
  notifier: Pick<Notifier, "hiringConfirmed" | "hiringCancelled" | "noShowReported">;
}) {
  const { events, payments, accounts, asaas, notifier } = deps;

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

  async function refreshRefund(payment: PaymentRecord): Promise<PaymentRecord> {
    if (payment.refundStatus !== "PROCESSANDO") return payment;
    const remote = await asaas.getPayment(payment.asaasPaymentId);
    if (remote?.status === "REFUNDED" && remote.value >= payment.valor) {
      await completeRefund(payment);
    } else if (remote?.refunds?.length && remote.refunds.every((refund) => refund.status === "CANCELLED")) {
      await payments.setRefundStatus(payment.id, "NEGADO");
    }
    return (payment.eventId ? await payments.findLatestPayment(payment.eventId) : null) ?? payment;
  }

  /** Efetiva a contratação de uma cobrança que a Asaas confirma como paga. */
  async function confirm(asaasPaymentId: string): Promise<void> {
    const result = await payments.confirmPayment(asaasPaymentId);
    const payment = await payments.findPaymentByAsaasId(asaasPaymentId);
    if (!payment) return;

    if (result === "PAGAMENTO_EXPIRADO") return;

    if (result === "EVENTO_INDISPONIVEL") {
      // O dinheiro pode ter sido recebido. Registra para conciliação humana,
      // sem presumir o horário efetivo do Pix e sem solicitar novo estorno.
      await payments.markLatePaymentDetected(payment.id);
      if (payment.refundStatus === "PROCESSANDO") await refreshRefund(payment);
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
    if (pending.expiraEm <= now) {
      if (!(await payments.expirePayment(pending.id))) {
        const current = await payments.findPaymentByAsaasId(pending.asaasPaymentId);
        if (current?.status === "PAGO") throw new AppError(409, "PAGAMENTO_JA_RECEBIDO", "O pagamento deste evento já foi recebido.");
        if (current?.status === "PENDENTE") throw new AppError(409, "COBRANCA_EM_ANDAMENTO", "A cobrança ainda está no prazo pelo relógio do banco.");
      }
    } else {
      await payments.setPaymentStatus(pending.id, "CANCELADO");
      const current = await payments.findPaymentByAsaasId(pending.asaasPaymentId);
      if (current?.status === "PAGO") throw new AppError(409, "PAGAMENTO_JA_RECEBIDO", "O pagamento deste evento já foi recebido.");
    }
    await asaas.cancelCharge(pending.asaasPaymentId);
  }

  async function reconcilePayout(intent: PayoutIntentRecord): Promise<"RESERVADO" | "ENVIADO" | "CONCILIACAO" | "PENDENTE" | "CONCLUIDO" | "FALHOU" | "DESCONHECIDO"> {
    let transferId = intent.asaasTransferId;
    if (!transferId) {
      const found = await asaas.findTransfersByReference(intent.id, intent.createdAt);
      if (!found.complete || found.matches.length !== 1) {
        await payments.markPayoutUnknown(intent.id);
        return "CONCILIACAO";
      }
      transferId = found.matches[0]!;
      if (!(await payments.linkPayoutTransfer(intent.id, transferId))) {
        await payments.markPayoutUnknown(intent.id);
        return "CONCILIACAO";
      }
    }
    const remote = await asaas.getTransfer(transferId);
    if (!remote || remote.id !== transferId) {
      await payments.markPayoutUnknown(intent.id);
      return "CONCILIACAO";
    }
    return payments.applyPayoutTransfer(intent.id, remote);
  }
  async function ensureCustomer(user: AuthUser): Promise<string> {
    const account = await accounts.findAccount(user.id);
    if (!account) throw new AppError(404, "CONTA_NAO_ENCONTRADA", "Conta não encontrada.");
    assertProfileComplete(account, "pagar");
    const existing = await payments.getAsaasCustomerId(user.id);
    if (existing) {
      const remote = await asaas.getCustomer(existing);
      if (remote?.externalReference === user.id && remote.cpfCnpj === account.documento) return existing;
    }
    const found = await asaas.findCustomerByReference(user.id, account.documento!);
    if (found) {
      await payments.setAsaasCustomerId(user.id, found.id);
      return found.id;
    }
    // O telefone do perfil é opcional para a Asaas e pode ser recusado pela
    // validação própria do provedor. As notificações do cliente são desativadas.
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
        if (pending.candidateId === candidateId && pending.expiraEm > now) {
          if (!(await payments.expirePayment(pending.id))) {
            const current = await payments.findPaymentByAsaasId(pending.asaasPaymentId);
            if (current?.status === "PENDENTE") return current;
            if (current?.status === "PAGO") throw new AppError(409, "PAGAMENTO_JA_RECEBIDO", "O pagamento deste evento já foi recebido.");
          }
          await release(pending, now);
        } else {
          await release(pending, now);
        }
      }

      const cobranca = calcularCobranca(event.cache);
      const customer = await ensureCustomer(user);
      // A referência identifica a mesma tentativa após uma resposta perdida do POST.
      const reference = `${event.id}:${candidateId}`;
      const asaasPaymentId = await asaas.findPendingPixCharge(reference, customer, cobranca.total)
        ?? await asaas.createPixCharge({
          customer,
          value: cobranca.total,
          dueDate: dueDateInSaoPaulo(now),
          description: `Muve — contratação de músico para "${event.titulo}"`,
          externalReference: reference,
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
    async syncCheckout(user: AuthUser, eventId: string, _now = new Date()): Promise<PaymentRecord | null> {
      await findOwnedEvent(user, eventId);
      const latest = await payments.findLatestPayment(eventId);
      if (latest?.status === "EXPIRADO") {
        // A primeira tentativa de cancelar na Asaas pode ter falhado após o banco expirar.
        if (!latest.latePaymentDetectedAt) {
          const remote = await asaas.getPayment(latest.asaasPaymentId);
          if (remote && ASAAS_PAID.includes(remote.status) && remote.value >= latest.valor) {
            await confirm(latest.asaasPaymentId);
          } else if (remote) {
            await asaas.cancelCharge(latest.asaasPaymentId);
          }
        }
        return payments.findLatestPayment(eventId);
      }
      if (latest?.status !== "PENDENTE") return latest;

      const remote = await asaas.getPayment(latest.asaasPaymentId);
      if (remote && ASAAS_PAID.includes(remote.status) && remote.value >= latest.valor) {
        await confirm(latest.asaasPaymentId);
      } else if (await payments.expirePayment(latest.id)) {
        await asaas.cancelCharge(latest.asaasPaymentId);
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
     * Uma intenção por pagamento é reservada no banco antes do POST. Depois de
     * ENVIADO, nenhuma falha de rede libera um segundo envio automático.
     */
    async payout(eventId: string): Promise<void> {
      let intent: PayoutIntentRecord | null = null;
      try {
        const payment = await payments.findLatestPayment(eventId);
        if (payment?.status !== "PAGO") return;

        intent = await payments.findPayoutIntentByPaymentId(payment.id);
        if (intent) {
          if (intent.state !== "CONCLUIDO" && intent.state !== "RESERVADO") await reconcilePayout(intent);
          return;
        }
        if (payment.repasseStatus !== "RETIDO" && payment.repasseStatus !== "FALHOU") return;

        const event = await events.findEvent(eventId);
        const musician = event?.musicoContratadoId ? await accounts.findAccount(event.musicoContratadoId) : null;
        if (!event || !musician?.chavePix || !musician.chavePixTipo) {
          await payments.markPayoutPreflightFailure(payment.id);
          return;
        }

        intent = await payments.reservePayoutIntent({
          paymentId: payment.id,
          eventId: event.id,
          musicianId: event.musicoContratadoId!,
          amount: payment.valorCache,
          pixKey: musician.chavePix,
          pixKeyType: musician.chavePixTipo,
        });
        if (!intent || !(await payments.markPayoutSent(intent.id))) return;

        const transfer = await asaas.transferPix({
          value: intent.amount,
          pixAddressKey: intent.pixKey!,
          pixAddressKeyType: intent.pixKeyType!,
          description: "Muve — cachê de \"" + event.titulo + "\"",
          externalReference: intent.id,
        });
        if (!(await payments.linkPayoutTransfer(intent.id, transfer.id))) {
          await payments.markPayoutUnknown(intent.id);
          return;
        }
        await reconcilePayout({ ...intent, asaasTransferId: transfer.id });
      } catch (error) {
        if (intent) await payments.markPayoutUnknown(intent.id).catch(() => {});
        console.error("Repasse sem confirmação conclusiva", intent?.id ?? eventId, error instanceof AppError ? error.code : "falha incerta");
      }
    },
    /** Apenas reconcilia uma intenção existente: nunca cria outra transferência. */
    async reconcilePayoutIntent(id: string) {
      const intent = await payments.findPayoutIntentById(id);
      if (!intent) return "DESCONHECIDO" as const;
      if ((intent.state === "CONCLUIDO" || intent.state === "FALHOU") && !intent.reconciliationRequired) return intent.state;
      return reconcilePayout(intent);
    },
    /** Consulta um estorno já solicitado; não envia nova solicitação à Asaas. */
    async reconcileRefundById(id: string): Promise<PaymentRecord | null> {
      const payment = await payments.findPaymentById(id);
      if (!payment || (payment.refundStatus !== "PROCESSANDO" && payment.refundStatus !== "NEGADO")) return payment;
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote) return payment;
      if (remote.status === "REFUNDED" && remote.value >= payment.valor) await completeRefund(payment);
      else if (payment.refundStatus === "PROCESSANDO" && remote.refunds?.length &&
               remote.refunds.every((refund) => refund.status === "CANCELLED")) {
        await payments.setRefundStatus(payment.id, "NEGADO");
      }
      return payments.findPaymentById(id);
    },    /** Solicita estorno, mantendo a contratação até confirmação pela Asaas. */
    async refundHiring(eventId: string, action: RefundAction): Promise<"PROCESSANDO" | "ESTORNADO"> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status !== "PAGO") throw new AppError(409, "PAGAMENTO_NAO_CONFIRMADO", "Não há pagamento confirmado para estornar nesta contratação.");
      if (payment.repasseStatus === "PROCESSANDO" || payment.repasseStatus === "REPASSADO") {
        throw new AppError(409, "REPASSE_JA_REALIZADO", "O cachê deste evento já foi repassado ao músico.");
      }
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote || remote.value < payment.valor) throw new AppError(409, "ESTORNO_COBRANCA_DIVERGENTE", "A cobrança no Asaas não corresponde ao pagamento registrado. Contate o suporte.");
      if (payment.refundStatus === "PROCESSANDO") {
        const latest = await refreshRefund(payment);
        return latest.status === "ESTORNADO" ? "ESTORNADO" : "PROCESSANDO";
      }
      if (remote.status !== "RECEIVED" && remote.status !== "CONFIRMED" && remote.status !== "REFUNDED") {
        throw new AppError(409, "ESTORNO_COBRANCA_DIVERGENTE", "A cobrança não está confirmada no Asaas. Atualize a contratação e tente novamente.");
      }
      if (!(await payments.claimRefund(payment.id, action))) return "PROCESSANDO";
      const claimed = { ...payment, refundStatus: "PROCESSANDO" as const, refundAction: action };
      if (remote.status === "REFUNDED") {
        await completeRefund(claimed);
        return "ESTORNADO";
      }
      if (remote.refunds?.some((refund) => refund.status === "PENDING")) return "PROCESSANDO";
      try {
        await asaas.refundPayment(payment.asaasPaymentId);
      } catch (error) {
        if (error instanceof AppError && (error.code.startsWith("ESTORNO_") || error.code === "PAGAMENTO_CREDENCIAIS_INVALIDAS" || error.code === "PAGAMENTO_NAO_CONFIGURADO")) {
          await payments.setRefundStatus(payment.id, "NEGADO");
          throw error;
        }
        // Timeout: a Asaas pode ter recebido o pedido. Não repetir automaticamente.
        throw new AppError(503, "ESTORNO_VERIFICACAO", "A solicitação de estorno está em verificação. Nenhum novo pedido será enviado até confirmar a situação no Asaas.");
      }
      try {
        const latest = await refreshRefund(claimed);
        return latest.status === "ESTORNADO" ? "ESTORNADO" : "PROCESSANDO";
      } catch {
        return "PROCESSANDO";
      }
    },

    async refreshRefund(eventId: string): Promise<PaymentRecord | null> {
      const payment = await payments.findLatestPayment(eventId);
      if (!payment) return null;
      return refreshRefund(payment);
    },

    async ensurePaidForNoRefund(eventId: string): Promise<void> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status !== "PAGO" || payment.refundStatus) throw new AppError(409, "PAGAMENTO_INDISPONIVEL", "O pagamento deste evento não está disponível para cancelamento sem estorno.");
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote || !ASAAS_PAID.includes(remote.status) || remote.value < payment.valor) {
        throw new AppError(409, "PAGAMENTO_DIVERGENTE", "O pagamento no Asaas não corresponde ao registro do evento. Contate o suporte.");
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

    /**
     * Processa uma notificação da Asaas. A autenticidade do remetente é checada na
     * camada HTTP; aqui o status é reconfirmado na API da Asaas antes de contratar.
     * Só lança em falha inesperada (ex.: banco fora do ar), para a Asaas reenviar:
     * respostas de erro repetidas fazem a Asaas pausar a fila de notificações.
     */
    async handleWebhook(notification: AsaasWebhook): Promise<void> {
      if (await payments.webhookEventExists(notification.id)) return;

      const asaasTransferId = notification.transfer?.id;
      const transferEvents = [
        "TRANSFER_CREATED", "TRANSFER_PENDING", "TRANSFER_IN_BANK_PROCESSING",
        "TRANSFER_BLOCKED", "TRANSFER_DONE", "TRANSFER_FAILED", "TRANSFER_CANCELLED",
      ];
      if (asaasTransferId && transferEvents.includes(notification.event)) {
        // O evento pode chegar fora de ordem: a situação atual vem de uma consulta
        // autenticada à Asaas, nunca apenas do corpo do webhook.
        const remote = await asaas.getTransfer(asaasTransferId);
        if (remote?.id === asaasTransferId) {
          let intent = await payments.findPayoutIntentByTransferId(remote.id);
          if (!intent && remote.externalReference && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(remote.externalReference)) {
            intent = await payments.findPayoutIntentById(remote.externalReference);
          }
          if (intent) await payments.applyPayoutTransfer(intent.id, remote);
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
            if (local.status === "PENDENTE") await payments.expirePayment(local.id);
            break;
          case "PAYMENT_DELETED":
            if (local.status === "PENDENTE") await payments.setPaymentStatus(local.id, "CANCELADO");
            break;
          case "PAYMENT_REFUNDED":
            // Nem o webhook sozinho comprova devolução integral: reconfirma na Asaas.
            {
              const remote = await asaas.getPayment(asaasPaymentId);
              if (!remote || remote.status !== "REFUNDED" || remote.value < local.valor) return;
              if (local.status === "PAGO") await completeRefund(local);
              else if (local.status === "PENDENTE") await payments.setPaymentStatus(local.id, "CANCELADO");
            }
            break;
          case "PAYMENT_REFUND_IN_PROGRESS":
            // O pedido local já está registrado; o webhook não antecipa a conclusão.
            break;
          case "PAYMENT_REFUND_DENIED":
            if (local.refundStatus === "PROCESSANDO") {
              const remote = await asaas.getPayment(asaasPaymentId);
              if (remote?.status === "REFUNDED" && remote.value >= local.valor) await completeRefund(local);
              else if (!remote?.refunds?.some((refund) => refund.status === "PENDING")) await payments.setRefundStatus(local.id, "NEGADO");
            }
            break;
        }
      }

      // Registrado só ao final: se o processamento falhar, o reenvio da Asaas é aceito.
      await payments.recordWebhookEvent({ id: notification.id, tipo: notification.event, asaasPaymentId, asaasTransferId, payload: notification });
    },
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
