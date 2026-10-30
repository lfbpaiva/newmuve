<<<<<<< HEAD
import { calcularCobranca } from "../../../shared/dominio.ts";
import type { AsaasWebhook, PaymentRecord, RefundAction } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import type { AsaasGateway, EventStore, PaymentStore, PayoutIntentRecord } from "./ports.ts";
=======
import { calcularCobranca, COBRANCA_VALIDADE_MS, comissaoPercentual, EMAIL_SUPORTE, hasCancellationNotice, MULTA_AUSENCIA_PERCENTUAL, VISIBILIDADE_REDUZIDA_DIAS } from "../../../shared/dominio.ts";
import type { AsaasWebhook, EventRecord, PaymentRecord, RefundAction } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import type { AsaasGateway, AsaasPayment, EventStore, PaymentStore } from "./ports.ts";
>>>>>>> upstream/main

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
<<<<<<< HEAD
  notifier: Pick<Notifier, "hiringConfirmed" | "hiringCancelled" | "noShowReported">;
}) {
  const { events, payments, accounts, asaas, notifier } = deps;

  async function completeRefund(payment: PaymentRecord): Promise<void> {
    const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
=======
  notifier: Pick<Notifier, "hiringConfirmed" | "hiringCancelled" | "noShowReported" | "payoutDone" | "payoutFailed" | "latePayment" | "refundDenied" | "penaltyApplied">;
}) {
  const { events, payments, accounts, asaas, notifier } = deps;

  async function settlePayout(payment: PaymentRecord, transferStatus: string): Promise<void> {
    if (transferStatus === "DONE") {
      await payments.setPayout(payment.id, { status: "REPASSADO" });
      const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
      if (event) void notifier.payoutDone(event);
    }
    if (transferStatus === "FAILED" || transferStatus === "CANCELLED") {
      await payments.setPayout(payment.id, { status: "FALHOU" });
      await warnPayoutFailed(payment);
    }
  }

  async function warnPayoutFailed(payment: PaymentRecord): Promise<void> {
    if (payment.repasseStatus === "FALHOU") return;
    const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
    if (event) void notifier.payoutFailed(event);
  }

  async function markRefundDenied(payment: PaymentRecord): Promise<void> {
    await payments.setRefundStatus(payment.id, "NEGADO");
    const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
    if (!event) return;
    if (payment.refundAction === "NENHUMA") void notifier.latePayment(event, true);
    else void notifier.refundDenied(event, payment.refundAction === "REABRIR" ? "musico" : "contratante");
  }

  async function penalize(event: EventRecord, musicianId: string | null, payment: PaymentRecord): Promise<void> {
    if (!musicianId) return;
    const ausencia = payment.refundAction === "NAO_COMPARECIMENTO";
    const desistenciaTardia = payment.refundAction === "REABRIR" && payment.refundRequestedAt !== null && !hasCancellationNotice(event.inicio, payment.refundRequestedAt);
    if (!ausencia && !desistenciaTardia) return;
    const multa = ausencia ? Math.round(payment.valorCache * MULTA_AUSENCIA_PERCENTUAL) / 100 : 0;
    const ate = new Date(Date.now() + VISIBILIDADE_REDUZIDA_DIAS * 24 * 60 * 60 * 1000);
    await payments.addPenalty({ musicianId, eventId: event.id, tipo: ausencia ? "AUSENCIA" : "DESISTENCIA_TARDIA", multa });
    await accounts.reduceVisibility(musicianId, ate);
    void notifier.penaltyApplied(event, musicianId, multa, ate);
  }

  async function completeRefund(payment: PaymentRecord): Promise<void> {
    const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
    const musicianId = event?.musicoContratadoId ?? null;
>>>>>>> upstream/main
    const result = await payments.finalizeRefund(payment.id);
    if (result === "REPASSE_CONFLITANTE") {
      console.error("Estorno confirmado depois do início do repasse; requer conciliação manual", payment.id);
    }
    if (result !== "CONFIRMADO" || !event) return;
    if (payment.refundAction === "REABRIR") void notifier.hiringCancelled(event, "musico", true);
    if (payment.refundAction === "CANCELAR") void notifier.hiringCancelled(event, "contratante", true);
    if (payment.refundAction === "NAO_COMPARECIMENTO") void notifier.noShowReported(event);
<<<<<<< HEAD
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
=======
    await penalize(event, musicianId, payment).catch((error: unknown) => console.error("Falha ao registrar penalidade", payment.id, error));
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
      await markRefundDenied(payment);
    } else if (requestSettled && isIdleAtAsaas(remote)) {
      await payments.releaseRefund(payment.id, { refundStatus: null, refundAction: null });
    }
    return reload(payment);
  }

  async function undoFailedRefund(claimed: PaymentRecord, previous: RefundState, error: unknown): Promise<PaymentRecord> {
    if (error instanceof AppError && error.code.startsWith("ESTORNO_")) {
      await markRefundDenied(claimed);
      return reload(claimed);
    }
    const remote = await asaas.getPayment(claimed.asaasPaymentId).catch(() => null);
    if (remote && !isIdleAtAsaas(remote)) return refreshRefund(claimed);
    await payments.releaseRefund(claimed.id, previous);
    return reload(claimed);
  }

  async function refundLatePayment(payment: PaymentRecord): Promise<void> {
    const current = await refreshRefund(payment);
    if (current.refundStatus === "PROCESSANDO" || current.refundStatus === "CONFIRMADO") return;
    const previous: RefundState = { refundStatus: current.refundStatus, refundAction: "NENHUMA" };
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

>>>>>>> upstream/main
  async function confirm(asaasPaymentId: string): Promise<void> {
    const result = await payments.confirmPayment(asaasPaymentId);
    const payment = await payments.findPaymentByAsaasId(asaasPaymentId);
    if (!payment) return;

    if (result === "PAGAMENTO_EXPIRADO") return;

    if (result === "EVENTO_INDISPONIVEL") {
<<<<<<< HEAD
      // O dinheiro pode ter sido recebido. Registra para conciliação humana,
      // sem presumir o horário efetivo do Pix e sem solicitar novo estorno.
      await payments.markLatePaymentDetected(payment.id);
      if (payment.refundStatus === "PROCESSANDO") await refreshRefund(payment);
=======
      if (payment.status === "PENDENTE" && payment.refundStatus === null) {
        await payments.setPaymentStatus(payment.id, "CANCELADO");
        const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
        if (event) void notifier.latePayment(event, false);
      }
      await refundLatePayment(await reload(payment));
>>>>>>> upstream/main
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
    async startCheckout(user: AuthUser, eventId: string, candidateId: string, now = new Date()): Promise<PaymentRecord> {
      const event = await findOwnedEvent(user, eventId);
      if (event.status !== "ABERTO") throw new AppError(409, "EVENTO_INDISPONIVEL", "Este evento não está mais aberto para contratação.");
      if (event.inicio <= now) throw new AppError(409, "EVENTO_JA_INICIADO", "Este evento já começou e não pode mais receber contratações.");

      const candidate = await events.findCandidateById(candidateId);
      if (!candidate || candidate.eventId !== eventId) throw new AppError(404, "CANDIDATURA_NAO_ENCONTRADA", "Candidatura não encontrada.");
      if (candidate.status !== "PENDENTE") throw new AppError(409, "CANDIDATURA_INDISPONIVEL", "Esta candidatura não está mais disponível.");
      if (await events.musicianHasConflict(candidate.musicianId, eventId)) {
        throw new AppError(409, "MUSICO_OCUPADO", "Este músico já tem um show contratado nesse horário.");
      }

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

      const contratante = await accounts.findAccount(user.id);
      const cobranca = calcularCobranca(candidate.valorProposto ?? event.cache, comissaoPercentual(contratante?.casaAte, now));
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
        await asaas.cancelCharge(asaasPaymentId).catch((cleanupError) => console.error("Falha ao cancelar cobrança órfã", cleanupError));
        throw error;
      }
    },

<<<<<<< HEAD
    /**
     * Situação atual da cobrança do evento, conferida na Asaas. Complementa o
     * webhook: mesmo que a notificação atrase ou se perca, a tela de checkout
     * descobre o pagamento, e uma cobrança expirada é cancelada na Asaas.
     */
    async syncCheckout(user: AuthUser, eventId: string, _now = new Date()): Promise<PaymentRecord | null> {
=======
    async syncCheckout(user: AuthUser, eventId: string, now = new Date()): Promise<PaymentRecord | null> {
>>>>>>> upstream/main
      await findOwnedEvent(user, eventId);
      for (const late of await payments.findLateRefundsToRetry(eventId)) await refundLatePayment(late).catch(() => {});
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

    async ensureNoActiveCheckout(eventId: string, now = new Date()): Promise<void> {
      const pending = await payments.findPendingPayment(eventId);
      if (!pending) return;
      if (pending.expiraEm > now) throw new AppError(409, "PAGAMENTO_EM_ANDAMENTO", "Há um pagamento em andamento para este evento.");
      await release(pending, now);
    },

<<<<<<< HEAD
    /**
     * Uma intenção por pagamento é reservada no banco antes do POST. Depois de
     * ENVIADO, nenhuma falha de rede libera um segundo envio automático.
     */
    async payout(eventId: string): Promise<void> {
      let intent: PayoutIntentRecord | null = null;
=======
    async payout(eventId: string): Promise<void> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status === "PAGO" && payment.repasseStatus === "PROCESSANDO" && payment.asaasTransferId) {
        const transferStatus = await asaas.getTransferStatus(payment.asaasTransferId).catch(() => null);
        if (transferStatus) await settlePayout(payment, transferStatus);
        return;
      }
      if (payment?.status !== "PAGO" || (payment.repasseStatus !== "RETIDO" && payment.repasseStatus !== "FALHOU")) return;
      if (await events.findOpenDispute(eventId)) return;
      if (!(await payments.claimPayout(payment.id))) return;

>>>>>>> upstream/main
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

        const multas: string[] = [];
        let desconto = 0;
        for (const fine of await payments.openFines(musician.id)) {
          if (desconto + fine.multa >= payment.valorCache) break;
          desconto = Math.round((desconto + fine.multa) * 100) / 100;
          multas.push(fine.id);
        }
        await payments.setPayoutDiscount(payment.id, desconto);

        const transfer = await asaas.transferPix({
<<<<<<< HEAD
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
=======
          value: Math.round((payment.valorCache - desconto) * 100) / 100,
          pixAddressKey: musician.chavePix,
          pixAddressKeyType: musician.chavePixTipo,
          description: `Muve — cachê de "${event!.titulo}"`,
          externalReference: payment.id,
        });
        await payments.setPayout(payment.id, { status: transfer.status === "DONE" ? "REPASSADO" : "PROCESSANDO", asaasTransferId: transfer.id });
        await payments.settleFines(multas, payment.id);
      } catch (error) {
        console.error("Falha no repasse do pagamento", payment.id, error);
        await payments.setPayout(payment.id, { status: "FALHOU" }).catch(() => {});
        await warnPayoutFailed(payment).catch(() => {});
      }
    },

>>>>>>> upstream/main
    async refundHiring(eventId: string, action: RefundAction): Promise<"PROCESSANDO" | "ESTORNADO"> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status !== "PAGO") throw new AppError(409, "PAGAMENTO_NAO_CONFIRMADO", "Não há pagamento confirmado para estornar nesta contratação.");
      if (payment.repasseStatus === "PROCESSANDO" || payment.repasseStatus === "REPASSADO") {
        throw new AppError(409, "REPASSE_JA_REALIZADO", "O cachê deste evento já foi repassado ao músico.");
      }
      const remote = await asaas.getPayment(payment.asaasPaymentId);
<<<<<<< HEAD
      if (!remote || remote.value < payment.valor) throw new AppError(409, "ESTORNO_COBRANCA_DIVERGENTE", "A cobrança no Asaas não corresponde ao pagamento registrado. Contate o suporte.");
      if (payment.refundStatus === "PROCESSANDO") {
        const latest = await refreshRefund(payment);
        return latest.status === "ESTORNADO" ? "ESTORNADO" : "PROCESSANDO";
=======
      if (!remote || remote.value < payment.valor) throw new AppError(409, "ESTORNO_COBRANCA_DIVERGENTE", `A cobrança no Asaas não corresponde ao pagamento registrado. Escreva para ${EMAIL_SUPORTE}.`);
      let current = payment;
      if (current.refundStatus === "PROCESSANDO") {
        current = await refreshRefund(current);
        if (current.status === "ESTORNADO") return "ESTORNADO";
        if (current.refundStatus === "PROCESSANDO") return "PROCESSANDO";
>>>>>>> upstream/main
      }
      if (remote.status !== "RECEIVED" && remote.status !== "CONFIRMED" && remote.status !== "REFUNDED") {
        throw new AppError(409, "ESTORNO_COBRANCA_DIVERGENTE", "A cobrança não está confirmada no Asaas. Atualize a contratação e tente novamente.");
      }
<<<<<<< HEAD
      if (!(await payments.claimRefund(payment.id, action))) return "PROCESSANDO";
      const claimed = { ...payment, refundStatus: "PROCESSANDO" as const, refundAction: action };
=======
      const previous: RefundState = { refundStatus: current.refundStatus, refundAction: current.refundAction };
      if (!(await payments.claimRefund(current.id, action))) return "PROCESSANDO";
      const claimed: PaymentRecord = { ...current, refundStatus: "PROCESSANDO", refundAction: action, refundRequestedAt: new Date() };
>>>>>>> upstream/main
      if (remote.status === "REFUNDED") {
        await completeRefund(claimed);
        return "ESTORNADO";
      }
      if (remote.refunds?.some((refund) => refund.status === "PENDING")) return "PROCESSANDO";
      try {
<<<<<<< HEAD
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
=======
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
>>>>>>> upstream/main
    },

    async refreshRefund(eventId: string): Promise<PaymentRecord | null> {
      const payment = await payments.findLatestPayment(eventId);
      if (!payment) return null;
      return refreshRefund(payment);
    },

    async ensurePaidForNoRefund(eventId: string): Promise<void> {
      const payment = await payments.findLatestPayment(eventId);
<<<<<<< HEAD
      if (payment?.status !== "PAGO" || payment.refundStatus) throw new AppError(409, "PAGAMENTO_INDISPONIVEL", "O pagamento deste evento não está disponível para cancelamento sem estorno.");
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote || !ASAAS_PAID.includes(remote.status) || remote.value < payment.valor) {
        throw new AppError(409, "PAGAMENTO_DIVERGENTE", "O pagamento no Asaas não corresponde ao registro do evento. Contate o suporte.");
=======
      if (payment?.status !== "PAGO" || payment.refundStatus === "PROCESSANDO") throw new AppError(409, "PAGAMENTO_INDISPONIVEL", "O pagamento deste evento não está disponível para cancelamento sem estorno.");
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote || !ASAAS_PAID.includes(remote.status) || remote.value < payment.valor) {
        throw new AppError(409, "PAGAMENTO_DIVERGENTE", `O pagamento no Asaas não corresponde ao registro do evento. Escreva para ${EMAIL_SUPORTE}.`);
>>>>>>> upstream/main
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

<<<<<<< HEAD
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
=======
      if (notification.transfer) {
        const payment = await payments.findPaymentByTransferId(notification.transfer.id);
        if (payment?.repasseStatus === "PROCESSANDO") await settlePayout(payment, notification.event.replace("TRANSFER_", ""));
>>>>>>> upstream/main
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
            if (local.status === "PENDENTE") await payments.expirePayment(local.id);
            break;
          case "PAYMENT_DELETED":
            if (local.status === "PENDENTE") await payments.setPaymentStatus(local.id, "CANCELADO");
            break;
<<<<<<< HEAD
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
=======
          case "PAYMENT_REFUNDED": {
            const remote = await asaas.getPayment(asaasPaymentId);
            if (!remote || remote.status !== "REFUNDED" || remote.value < local.valor) return;
            if (local.status === "PAGO" || local.refundStatus !== null) await completeRefund(local);
            else if (local.status === "PENDENTE") await payments.setPaymentStatus(local.id, "CANCELADO");
            break;
          }
>>>>>>> upstream/main
          case "PAYMENT_REFUND_DENIED":
            if (local.refundStatus === "PROCESSANDO") {
              const remote = await asaas.getPayment(asaasPaymentId);
              if (remote?.status === "REFUNDED" && remote.value >= local.valor) await completeRefund(local);
              else if (!remote?.refunds?.some((refund) => refund.status === "PENDING")) await payments.setRefundStatus(local.id, "NEGADO");
            }
            break;
        }
      }

<<<<<<< HEAD
      // Registrado só ao final: se o processamento falhar, o reenvio da Asaas é aceito.
      await payments.recordWebhookEvent({ id: notification.id, tipo: notification.event, asaasPaymentId, asaasTransferId, payload: notification });
=======
      await payments.recordWebhookEvent({ id: notification.id, tipo: notification.event, asaasPaymentId, payload: notification });
>>>>>>> upstream/main
    },
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
