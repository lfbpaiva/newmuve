import { randomUUID } from "node:crypto";
import { calcularCobranca, CHECKOUT_TEMPO_LIMITE_APP_MS, COBRANCA_VALIDADE_MS, comissaoPercentual, EMAIL_SUPORTE } from "../../../shared/dominio.ts";
import type { AsaasWebhook, EventRecord, PaymentRecord, PayoutAttempt, RefundAction } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import { COBRANCA_REMOVIDA_NA_ASAAS, cobrancaQuitada, type AsaasGateway, type AsaasPayment, type AsaasTransfer, type BuscaDeTransferencias, type ContextoAsaas, type EventStore, type PaymentStore } from "./ports.ts";

export const CHECKOUT_MARGEM_DO_APP_MS = 10_000;
export const CHECKOUT_ORCAMENTO_MS = CHECKOUT_TEMPO_LIMITE_APP_MS - CHECKOUT_MARGEM_DO_APP_MS;
export const CHECKOUT_RESERVA_ENCERRAMENTO_MS = 12_000;
export const REMOCAO_TEMPO_LIMITE_MS = 6_000;
export const VERIFICACAO_REMOCAO_TEMPO_LIMITE_MS = 5_000;
export const CHECKOUT_TEMPO_MINIMO_QR_MS = 5_000;
export const CHECKOUT_TEMPO_MINIMO_CRIACAO_MS = 2_000;
const REQUISICAO_PADRAO_MS = 15_000;
const tempoAte = (prazo: number, maximoMs: number) => Math.max(1, Math.min(maximoMs, prazo - Date.now()));
const cobrancaEmConciliacao = () =>
  new AppError(409, "COBRANCA_EM_CONCILIACAO", "A cobrança anterior ainda não foi encerrada na Asaas. Tente novamente em instantes.");
const tempoInsuficiente = () =>
  new AppError(503, "PAGAMENTO_TEMPO_INSUFICIENTE", "O serviço de pagamentos demorou para responder. Tente novamente em instantes.");
const REFUND_REQUEST_GRACE_MS = 60_000;
const TRANSFER_DEAD = ["FAILED", "CANCELLED"];
const BUSCA_PAGINAS_ROTINA = 5;
const BUSCA_PAGINAS_SUPORTE = 50;
const ESTORNO_EM_ANDAMENTO_NA_ASAAS = ["PENDING", "AWAITING_CRITICAL_ACTION_AUTHORIZATION", "AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION"];

export type SituacaoDoEstornoNaAsaas = "EM_ANDAMENTO" | "CONCLUIDO" | "ENCERRADO_SEM_DEVOLUCAO" | "DESCONHECIDA";

export function situacaoDoEstornoNaAsaas(status: string): SituacaoDoEstornoNaAsaas {
  if (ESTORNO_EM_ANDAMENTO_NA_ASAAS.includes(status)) return "EM_ANDAMENTO";
  if (status === "DONE") return "CONCLUIDO";
  if (status === "CANCELLED") return "ENCERRADO_SEM_DEVOLUCAO";
  return "DESCONHECIDA";
}

const semEstornoAtivoNaAsaas = (remote: AsaasPayment | null) =>
  !remote?.refunds?.some((refund) => situacaoDoEstornoNaAsaas(refund.status) !== "ENCERRADO_SEM_DEVOLUCAO");

const estornosEncerradosSemDevolucao = (remote: AsaasPayment | null) => Boolean(remote?.refunds?.length) && semEstornoAtivoNaAsaas(remote);
type ResultadoDaRemocao = "REMOVIDA" | "ATIVA" | "RECEBIDA" | "INCONCLUSIVA";

const registrarCheckout = (registro: Record<string, unknown>, falha: boolean) => {
  const linha = `Checkout ${JSON.stringify({ origem: "checkout", ...registro })}`;
  if (falha) console.error(linha);
  else console.info(linha);
};

const ESPERA_VERIFICACAO_MS = 24 * 60 * 60 * 1000;
const ESPERA_CONFIRMACAO_MS = 60 * 60 * 1000;
const ESTADOS_SEM_RESPOSTA = ["INCONCLUSIVA", "EM_VERIFICACAO"];

const RECUSAS_DA_LIBERACAO: Record<string, string> = {
  PRAZO_NAO_ATINGIDO: "O prazo de espera desta etapa ainda não terminou.",
  BUSCA_ANTES_DO_PRAZO: "A busca precisa ser feita depois do prazo de espera.",
  BUSCA_DESATUALIZADA: "A busca ficou antiga. Faça a conferência de novo.",
  BUSCA_INCOMPLETA: "A busca não percorreu todas as páginas da Asaas.",
  TRANSFERENCIA_ENCONTRADA: "Há transferência para esta tentativa na Asaas.",
  TRANSFERENCIA_CONHECIDA: "Esta tentativa tem transferência registrada; use a conferência da transferência.",
  REFERENCIA_DIVERGENTE: "A busca não usou a referência desta tentativa.",
  JANELA_INSUFICIENTE: "A busca não cobriu o período da tentativa.",
  OPERADOR_INVALIDO: "Informe o nome de quem está fazendo a conferência.",
  DECLARACAO_INVALIDA: "A declaração enviada não é a declaração padrão.",
  ESTADO_INVALIDO: "Esta tentativa não está na etapa esperada.",
  VERIFICACAO_AUSENTE: "A primeira verificação não foi registrada.",
  TENTATIVA_NAO_ENCONTRADA: "Tentativa de repasse não encontrada.",
};

const repasseEmAndamento = () =>
  new AppError(409, "REPASSE_EM_CONFERENCIA", `Há um repasse deste show em andamento ou em conferência, e o estorno fica bloqueado até ele terminar. Escreva para ${EMAIL_SUPORTE}.`);

const liberacaoRecusada = (codigo: string) =>
  new AppError(409, `LIBERACAO_${codigo}`, RECUSAS_DA_LIBERACAO[codigo] ?? "A liberação do repasse foi recusada.");

const transferMayExist = (error: unknown) => !(error instanceof AppError) || error.status === 502;

type RefundState = Pick<PaymentRecord, "refundStatus" | "refundAction">;

const dueDateInSaoPaulo = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);

export function createPaymentService(deps: {
  events: EventStore;
  payments: PaymentStore;
  accounts: AccountStore;
  asaas: AsaasGateway;
  notifier: Pick<Notifier, "hiringConfirmed" | "hiringCancelled" | "noShowReported" | "payoutDone" | "payoutFailed" | "latePayment" | "refundDenied" | "penaltyApplied" | "disputeReopened">;
}) {
  const { events, payments, accounts, asaas, notifier } = deps;

  async function warnPayout(paymentId: string, done: boolean): Promise<void> {
    const payment = await payments.findPaymentById(paymentId);
    if (payment?.status !== "PAGO") return;
    const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
    if (event) void (done ? notifier.payoutDone(event) : notifier.payoutFailed(event));
  }

  async function settleAttempt(attempt: PayoutAttempt, transfer: { id: string; status: string }): Promise<void> {
    if (transfer.status === "DONE") {
      const conclusao = await payments.completeAttempt(attempt.id, transfer.id);
      if (conclusao === "CONCLUIDA") await warnPayout(attempt.paymentId, true);
      if (conclusao === "ALERTA") {
        console.error("Transferência concluída para uma tentativa de repasse encerrada; possível duplicidade, requer conciliação manual", attempt.paymentId, attempt.id, transfer.id);
      }
      if (conclusao === "REPASSE_E_ESTORNO") warnRefundedPayout(attempt, transfer.id);
      return;
    }
    if (TRANSFER_DEAD.includes(transfer.status) && (await payments.failAttempt(attempt.id, transfer.id))) await warnPayout(attempt.paymentId, false);
  }

  function warnRefundedPayout(attempt: PayoutAttempt, transferId: string): void {
    console.error("Transferência concluída para um pagamento estornado; alerta REPASSE_E_ESTORNO registrado, requer conciliação manual", attempt.paymentId, attempt.id, transferId);
  }

  function belongsToCurrentPayout(payment: PaymentRecord | null, latest: PaymentRecord | null): boolean {
    return payment !== null && latest?.id === payment.id && payment.status === "PAGO";
  }

  async function adoptTransfer(attempt: PayoutAttempt, transfer: { id: string; status: string }): Promise<void> {
    const registro = await payments.registerTransfer(attempt.id, transfer.id);
    if (registro === "REGISTRADA" || registro === "JA_REGISTRADA") return settleAttempt(attempt, transfer);
    if (registro === "TARDIA") {
      console.error("Resposta tardia de uma tentativa de repasse encerrada; requer conciliação manual", attempt.paymentId, attempt.id, transfer.id);
      if (transfer.status === "DONE") await settleAttempt(attempt, transfer);
      return;
    }
    console.error("Transferência recusada para a tentativa de repasse; requer conciliação manual", attempt.paymentId, attempt.id, transfer.id);
  }

  async function adoptFound(attempt: PayoutAttempt, encontradas: AsaasTransfer[]): Promise<void> {
    if (encontradas.length === 1) return adoptTransfer(attempt, encontradas[0]!);
    for (const transfer of encontradas) await payments.recordAttemptAlert(attempt.id, "POSSIVEL_DUPLICIDADE", transfer.id, transfer.status);
    console.error("Mais de uma transferência para a mesma tentativa de repasse; requer conciliação manual", attempt.paymentId, attempt.id);
  }

  async function applyTransfer(transfer: AsaasTransfer): Promise<void> {
    const known = await payments.findAttemptByTransferId(transfer.id);
    if (known) {
      if (ESTADOS_SEM_RESPOSTA.includes(known.estado)) {
        console.error("Transferência de tentativa legada sem resposta; requer conciliação manual", known.paymentId, known.id, transfer.id);
        return;
      }
      return settleAttempt(known, transfer);
    }
    const attempt = transfer.externalReference ? await payments.findAttempt(transfer.externalReference) : null;
    if (attempt?.origem !== "ATUAL") {
      if (transfer.externalReference) console.warn("Transferência sem tentativa de repasse atual correspondente; ignorada", transfer.id);
      return;
    }
    await adoptTransfer(attempt, transfer);
  }

  async function reconcileAttempt(aberta: PayoutAttempt): Promise<"LIBERADO" | "AGUARDANDO"> {
    let attempt = aberta;
    if (attempt.estado === "SOLICITANDO") {
      const parada = await payments.markStaleAttempt(attempt.id);
      if (parada === "FALHOU") return "LIBERADO";
      if (parada === "SEM_MUDANCA") return "AGUARDANDO";
      attempt = { ...attempt, estado: "INCONCLUSIVA" };
    }
    if (attempt.estado === "PENDENTE" && attempt.asaasTransferId) {
      const transfer = await asaas.getTransfer(attempt.asaasTransferId).catch(() => null);
      if (transfer) await settleAttempt(attempt, transfer);
      return "AGUARDANDO";
    }
    if (attempt.origem !== "ATUAL" || !ESTADOS_SEM_RESPOSTA.includes(attempt.estado)) return "AGUARDANDO";
    const busca = await asaas.findTransfersByReference(attempt.referenciaExterna, attempt.solicitadaEm, BUSCA_PAGINAS_ROTINA).catch(() => null);
    if (busca && busca.encontradas.length > 0) await adoptFound(attempt, busca.encontradas);
    return "AGUARDANDO";
  }

  async function findAttemptOrFail(attemptId: string): Promise<PayoutAttempt> {
    const attempt = await payments.findAttempt(attemptId);
    if (!attempt) throw new AppError(404, "TENTATIVA_NAO_ENCONTRADA", "Tentativa de repasse não encontrada.");
    return attempt;
  }

  async function searchForAbsence(attempt: PayoutAttempt): Promise<BuscaDeTransferencias | null> {
    const busca = await asaas.findTransfersByReference(attempt.referenciaExterna, attempt.solicitadaEm, BUSCA_PAGINAS_SUPORTE);
    if (busca.encontradas.length === 0) return busca;
    await adoptFound(attempt, busca.encontradas);
    return null;
  }

  const evidencia = (operador: string, busca: BuscaDeTransferencias) => ({
    operador,
    referencia: busca.referencia,
    desde: busca.desde,
    iniciadaEm: busca.iniciadaEm,
    completa: true,
    paginas: busca.paginas,
    listadas: busca.listadas,
    encontradas: busca.encontradas.length,
  });

  async function explainRefusedRefund(paymentId: string): Promise<"PROCESSANDO" | "ESTORNADO"> {
    const latest = await payments.findPaymentById(paymentId);
    if (latest?.status === "ESTORNADO") return "ESTORNADO";
    if (latest?.refundStatus === "PROCESSANDO") return "PROCESSANDO";
    if (latest?.eventId && (await events.findOpenDispute(latest.eventId))) {
      throw new AppError(409, "CONTESTACAO_ABERTA", "Há uma contestação aberta; o suporte vai decidir o resultado do show.");
    }
    if ((await payments.findOpenAttempt(paymentId)) || latest?.repasseStatus === "PROCESSANDO" || latest?.repasseStatus === "REPASSADO") throw repasseEmAndamento();
    return "PROCESSANDO";
  }

  async function warnDisputeReopened(payment: PaymentRecord, reaberta: string | null, avisarReabertura: boolean): Promise<boolean> {
    if (!reaberta) return false;
    if (!avisarReabertura) return true;
    const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
    if (event) void notifier.disputeReopened(event);
    return true;
  }

  async function markRefundDenied(payment: PaymentRecord, avisarReabertura: boolean): Promise<void> {
    if (await warnDisputeReopened(payment, await payments.denyRefund(payment.id), avisarReabertura)) return;
    const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
    if (!event) return;
    if (payment.refundAction === "NENHUMA") void notifier.latePayment(event, true);
    else void notifier.refundDenied(event, payment.refundAction === "REABRIR" ? "musico" : "contratante");
  }

  async function warnPenalty(event: EventRecord, payment: PaymentRecord): Promise<void> {
    const penalty = await payments.findRefundPenalty(payment.id);
    if (penalty) void notifier.penaltyApplied(event, penalty.musicianId, penalty.multa, penalty.visibilidadeReduzidaAte);
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
    await warnPenalty(event, payment).catch((error: unknown) => console.error("Falha ao avisar a penalidade", payment.id, error));
  }

  const reload = async (payment: PaymentRecord) => (await payments.findPaymentByAsaasId(payment.asaasPaymentId)) ?? payment;

  const isIdleAtAsaas = (remote: AsaasPayment | null) =>
    remote !== null && cobrancaQuitada(remote.status) && semEstornoAtivoNaAsaas(remote);

  async function atualizarEstorno(payment: PaymentRecord, avisarReabertura = true): Promise<PaymentRecord> {
    if (payment.refundStatus !== "PROCESSANDO") return payment;
    const remote = await asaas.getPayment(payment.asaasPaymentId);
    const requestSettled = !payment.refundRequestedAt || Date.now() - payment.refundRequestedAt.getTime() >= REFUND_REQUEST_GRACE_MS;
    if (remote?.status === "REFUNDED" && remote.value >= payment.valor) {
      await completeRefund(payment);
    } else if (estornosEncerradosSemDevolucao(remote)) {
      await markRefundDenied(payment, avisarReabertura);
    } else if (requestSettled && isIdleAtAsaas(remote)) {
      await warnDisputeReopened(payment, await payments.releaseRefund(payment.id, { refundStatus: null, refundAction: null }), avisarReabertura);
    }
    return reload(payment);
  }

  async function undoFailedRefund(claimed: PaymentRecord, previous: RefundState, error: unknown): Promise<PaymentRecord> {
    if (error instanceof AppError && error.code.startsWith("ESTORNO_")) {
      await markRefundDenied(claimed, false);
      return reload(claimed);
    }
    const remote = await asaas.getPayment(claimed.asaasPaymentId).catch(() => null);
    if (remote && !isIdleAtAsaas(remote)) return atualizarEstorno(claimed, false);
    await payments.releaseRefund(claimed.id, previous);
    return reload(claimed);
  }

  async function refundLatePayment(payment: PaymentRecord): Promise<void> {
    const current = await atualizarEstorno(payment);
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
    await atualizarEstorno(claimed).catch(() => {});
  }

  async function confirm(asaasPaymentId: string): Promise<void> {
    const result = await payments.confirmPayment(asaasPaymentId);
    const payment = await payments.findPaymentByAsaasId(asaasPaymentId);
    if (!payment) return;

    if (result === "EVENTO_INDISPONIVEL") {
      if (payment.status === "PENDENTE" && payment.refundStatus === null) {
        await payments.setPaymentStatus(payment.id, "CANCELADO");
        const event = payment.eventId ? await events.findEvent(payment.eventId) : null;
        if (event) void notifier.latePayment(event, false);
      }
      await refundLatePayment(await reload(payment));
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

  async function release(pending: PaymentRecord, now: Date, orcamento?: { prazo: number; correlacao: string }): Promise<void> {
    const limite = () => orcamento && { timeoutMs: tempoAte(orcamento.prazo, REQUISICAO_PADRAO_MS), correlacao: orcamento.correlacao };
    const remote = await asaas.getPayment(pending.asaasPaymentId, limite() && { ...limite(), etapa: "liberacao" });
    if (remote && cobrancaQuitada(remote.status)) {
      await confirm(pending.asaasPaymentId);
      throw new AppError(409, "PAGAMENTO_JA_RECEBIDO", "O pagamento deste evento já foi recebido.");
    }
    const remocao = await asaas.cancelCharge(pending.asaasPaymentId, limite());
    if (!remocao?.removida) throw cobrancaEmConciliacao();
    await payments.setPaymentStatus(pending.id, pending.expiraEm <= now ? "EXPIRADO" : "CANCELADO");
  }

  async function ensureCustomer(user: AuthUser, recreate = false, contexto?: ContextoAsaas): Promise<string> {
    const existing = recreate ? null : await payments.getAsaasCustomerId(user.id);
    if (existing) return existing;

    const account = await accounts.findAccount(user.id);
    if (!account) throw new AppError(404, "CONTA_NAO_ENCONTRADA", "Conta não encontrada.");
    assertProfileComplete(account, "pagar");
    const customerId = await asaas.createCustomer({
      name: account.nome,
      cpfCnpj: account.documento!,
      email: user.email,
      externalReference: user.id,
    }, contexto);
    await payments.setAsaasCustomerId(user.id, customerId);
    return customerId;
  }

  async function encerrarCobrancaSemQr(asaasPaymentId: string, correlacao: string, prazo: number): Promise<ResultadoDaRemocao> {
    const remocao = await asaas.cancelCharge(asaasPaymentId, { timeoutMs: tempoAte(prazo, REMOCAO_TEMPO_LIMITE_MS), correlacao }).catch(() => null);
    if (remocao?.removida) return "REMOVIDA";
    const remota = await asaas.getPayment(asaasPaymentId, { timeoutMs: tempoAte(prazo, VERIFICACAO_REMOCAO_TEMPO_LIMITE_MS), correlacao, etapa: "verificacao_remocao" }).catch(() => undefined);
    if (remota === undefined) return "INCONCLUSIVA";
    if (remota === null || remota.status === COBRANCA_REMOVIDA_NA_ASAAS) return "REMOVIDA";
    return cobrancaQuitada(remota.status) ? "RECEBIDA" : "ATIVA";
  }

  async function findOwnedEvent(user: AuthUser, eventId: string) {
    const event = await events.findEvent(eventId);
    if (!event || event.contractorId !== user.id) throw new AppError(404, "EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
    return event;
  }

  async function syncPending(eventId: string, now = new Date()): Promise<PaymentRecord | null> {
    return sincronizarUltimoPagamento(eventId, await payments.findLatestPayment(eventId), now);
  }

  async function sincronizarUltimoPagamento(eventId: string, latest: PaymentRecord | null, now: Date): Promise<PaymentRecord | null> {
    if (latest?.status !== "PENDENTE") return latest;

    const remote = await asaas.getPayment(latest.asaasPaymentId);
    if (remote && cobrancaQuitada(remote.status) && remote.value >= latest.valor) {
      await confirm(latest.asaasPaymentId);
    } else if (remote?.status === COBRANCA_REMOVIDA_NA_ASAAS) {
      await payments.setPaymentStatus(latest.id, latest.expiraEm <= now ? "EXPIRADO" : "CANCELADO");
    } else if (latest.expiraEm <= now) {
      const remocao = await asaas.cancelCharge(latest.asaasPaymentId);
      if (remocao?.removida) await payments.setPaymentStatus(latest.id, "EXPIRADO");
      else console.error(`Checkout ${JSON.stringify({ origem: "checkout", evento: eventId, cobranca: latest.asaasPaymentId, alerta: "REMOCAO_NAO_CONFIRMADA" })}`);
    }
    return payments.findLatestPayment(eventId);
  }

  return {
    async startCheckout(user: AuthUser, eventId: string, candidateId: string, now = new Date(), cacheEsperado?: number): Promise<PaymentRecord> {
      const correlacao = randomUUID();
      const inicio = Date.now();
      const prazoFinal = inicio + CHECKOUT_ORCAMENTO_MS;
      const prazoDoQr = prazoFinal - CHECKOUT_RESERVA_ENCERRAMENTO_MS;
      const prazoDaCriacao = prazoDoQr - CHECKOUT_TEMPO_MINIMO_QR_MS;
      const event = await findOwnedEvent(user, eventId);
      if (event.status !== "ABERTO") throw new AppError(409, "EVENTO_INDISPONIVEL", "Este evento não está mais aberto para contratação.");
      if (event.inicio <= now) throw new AppError(409, "EVENTO_JA_INICIADO", "Este evento já começou e não pode mais receber contratações.");

      const candidate = await events.findCandidateById(candidateId);
      if (!candidate || candidate.eventId !== eventId) throw new AppError(404, "CANDIDATURA_NAO_ENCONTRADA", "Candidatura não encontrada.");
      if (candidate.status !== "PENDENTE") throw new AppError(409, "CANDIDATURA_INDISPONIVEL", "Esta candidatura não está mais disponível.");
      const cacheDaInscricao = candidate.valorProposto ?? event.cache;
      if (cacheEsperado !== undefined && Math.abs(cacheEsperado - cacheDaInscricao) > 0.005) {
        throw new AppError(409, "VALOR_ALTERADO", `O valor da inscrição mudou para ${cacheDaInscricao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Confira antes de pagar.`);
      }
      if (await events.musicianHasConflict(candidate.musicianId, eventId)) {
        throw new AppError(409, "MUSICO_OCUPADO", "Este músico já tem um show contratado nesse horário.");
      }

      const pending = await payments.findPendingPayment(eventId);
      if (pending) {
        if (pending.candidateId === candidateId && pending.expiraEm > now) return pending;
        await release(pending, now, { prazo: prazoDaCriacao - CHECKOUT_TEMPO_MINIMO_CRIACAO_MS, correlacao });
      }

      const contexto = () => {
        if (prazoDaCriacao - Date.now() < CHECKOUT_TEMPO_MINIMO_CRIACAO_MS) throw tempoInsuficiente();
        return { correlacao, timeoutMs: tempoAte(prazoDaCriacao, REQUISICAO_PADRAO_MS) };
      };
      const contratante = await accounts.findAccount(user.id);
      const cobranca = calcularCobranca(cacheDaInscricao, comissaoPercentual(contratante?.casaAte, now));
      const charge = (customer: string) => asaas.createPixCharge({
        customer,
        value: cobranca.total,
        dueDate: dueDateInSaoPaulo(now),
        description: `Muve — contratação de músico para "${event.titulo}"`,
        externalReference: event.id,
      }, contexto());
      const asaasPaymentId = await charge(await ensureCustomer(user, false, contexto())).catch(async (error: unknown) => {
        if (!(error instanceof AppError) || error.code !== "PAGAMENTO_CLIENTE_INVALIDO") throw error;
        return charge(await ensureCustomer(user, true, contexto()));
      });
      const base = { correlacao, evento: eventId, cobranca: asaasPaymentId };
      try {
        const qrCode = await asaas.getPixQrCode(asaasPaymentId, { prazo: prazoDoQr, correlacao });
        const pagamento = await payments.insertPayment({
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
        registrarCheckout({ ...base, resultado: "COBRANCA_GERADA", duracaoMs: Date.now() - inicio }, false);
        return pagamento;
      } catch (error) {
        const remocao = await encerrarCobrancaSemQr(asaasPaymentId, correlacao, prazoFinal);
        let registradaParaConciliacao = false;
        if (remocao !== "REMOVIDA") {
          registradaParaConciliacao = await payments.insertPayment({
            eventId,
            candidateId,
            contractorId: user.id,
            asaasPaymentId,
            valor: cobranca.total,
            valorComissao: cobranca.comissao,
            pixCopiaCola: null,
            pixQrCode: null,
            expiraEm: new Date(),
          }).then(() => true, () => false);
        }
        registrarCheckout({
          ...base,
          resultado: "FALHA",
          erro: error instanceof AppError ? error.code : "falha inesperada",
          remocao,
          registradaParaConciliacao,
          duracaoMs: Date.now() - inicio,
        }, true);
        if (remocao !== "REMOVIDA" && !registradaParaConciliacao) {
          console.error(`Checkout ${JSON.stringify({ origem: "checkout", ...base, alerta: "COBRANCA_SEM_REGISTRO_LOCAL", remocao })}`);
        }
        throw error;
      }
    },

    async syncCheckout(user: AuthUser, eventId: string, now = new Date()): Promise<PaymentRecord | null> {
      const [evento, atrasados, ultimo] = await Promise.allSettled([events.findEvent(eventId), payments.findLateRefundsToRetry(eventId), payments.findLatestPayment(eventId)]);
      if (evento.status === "rejected") throw evento.reason;
      if (!evento.value || evento.value.contractorId !== user.id) throw new AppError(404, "EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");
      if (atrasados.status === "rejected") throw atrasados.reason;
      if (atrasados.value.length > 0) {
        for (const late of atrasados.value) await refundLatePayment(late).catch(() => {});
        return syncPending(eventId, now);
      }
      if (ultimo.status === "rejected") throw ultimo.reason;
      return sincronizarUltimoPagamento(eventId, ultimo.value, now);
    },

    syncPending,

    async ensureNoActiveCheckout(eventId: string, now = new Date()): Promise<void> {
      const pending = await payments.findPendingPayment(eventId);
      if (!pending) return;
      if (pending.expiraEm > now) throw new AppError(409, "PAGAMENTO_EM_ANDAMENTO", "Há um pagamento em andamento para este evento.");
      await release(pending, now);
    },

    async payout(eventId: string): Promise<void> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status === "PAGO" && payment.repasseStatus === "PROCESSANDO") {
        const attempt = await payments.findOpenAttempt(payment.id);
        if (!attempt) {
          console.error("Repasse em processamento sem tentativa aberta; requer conciliação manual", payment.id);
          return;
        }
        await reconcileAttempt(attempt);
        return;
      }
      if (payment?.status !== "PAGO" || payment.repasseStatus !== "RETIDO") return;
      if (await events.findOpenDispute(eventId)) return;
      const { tentativaId, desconto } = await payments.claimPayout(payment.id);
      if (!tentativaId) return;

      let transferRequested = false;
      let transfer: { id: string; status: string };
      try {
        const event = await events.findEvent(eventId);
        const musician = event?.musicoContratadoId ? await accounts.findAccount(event.musicoContratadoId) : null;
        if (!musician?.chavePix || !musician.chavePixTipo) throw new Error("músico sem chave Pix cadastrada");
        const registro = await payments.registerRequestSent(tentativaId).catch((error: unknown) => {
          console.error("Registro do envio do repasse sem resposta; a tentativa segue a regra de solicitação parada", payment.id, tentativaId, error);
          return null;
        });
        if (registro === null) return;
        if (!registro) {
          console.error("Tentativa de repasse encerrada antes do envio; a transferência não foi pedida", payment.id, tentativaId);
          return;
        }

        transferRequested = true;
        transfer = await asaas.transferPix({
          value: Math.round((payment.valorCache - desconto) * 100) / 100,
          pixAddressKey: musician.chavePix,
          pixAddressKeyType: musician.chavePixTipo,
          description: `Muve — cachê de "${event!.titulo}"`,
          externalReference: tentativaId,
        });
      } catch (error) {
        console.error("Falha no repasse do pagamento", payment.id, error instanceof AppError ? error.code : error);
        if (transferRequested && transferMayExist(error)) {
          await payments.markAttemptInconclusive(tentativaId).catch(() => false);
          return;
        }
        if (await payments.failAttempt(tentativaId, null).catch(() => false)) await warnPayout(payment.id, false).catch(() => {});
        return;
      }

      const attempt: PayoutAttempt = {
        id: tentativaId,
        paymentId: payment.id,
        origem: "ATUAL",
        estado: "SOLICITANDO",
        referenciaExterna: tentativaId,
        asaasTransferId: null,
        solicitadaEm: new Date(),
        verificacaoIniciadaEm: null,
      };
      await adoptTransfer(attempt, transfer).catch((error: unknown) => {
        console.error("Transferência criada sem registro na tentativa; a rotina concilia pela referência", payment.id, tentativaId, transfer.id, error instanceof AppError ? error.code : "falha inesperada");
      });
    },

    markStalePayoutRequests: () => payments.markStaleAttempts(),

    async reconcileOutsidePayout(): Promise<number> {
      let conciliadas = 0;
      for (const attempt of await payments.findOpenAttempts()) {
        const payment = await payments.findPaymentById(attempt.paymentId);
        const latest = payment?.eventId ? await payments.findLatestPayment(payment.eventId) : null;
        if (belongsToCurrentPayout(payment, latest) && payment!.repasseStatus === "PROCESSANDO") continue;
        conciliadas++;
        const resultado = await reconcileAttempt(attempt).catch((error: unknown) => {
          console.error("Falha ao conciliar tentativa de repasse fora do pagamento atual", attempt.paymentId, attempt.id, error instanceof AppError ? error.code : "falha inesperada");
          return null;
        });
        if (resultado === "LIBERADO") {
          console.warn("Tentativa de repasse fora do pagamento atual encerrada sem envio; nenhum repasse novo é feito", attempt.paymentId, attempt.id);
        }
      }
      return conciliadas;
    },

    async verifyPayoutAbsence(attemptId: string, operador: string): Promise<{ resultado: "VERIFICACAO_INICIADA" | "TRANSFERENCIA_ENCONTRADA"; confirmarAPartirDe?: string }> {
      const attempt = await findAttemptOrFail(attemptId);
      if (attempt.estado !== "INCONCLUSIVA") throw liberacaoRecusada("ESTADO_INVALIDO");
      if (attempt.asaasTransferId) throw liberacaoRecusada("TRANSFERENCIA_CONHECIDA");
      if (Date.now() < attempt.solicitadaEm.getTime() + ESPERA_VERIFICACAO_MS) throw liberacaoRecusada("PRAZO_NAO_ATINGIDO");
      const busca = await searchForAbsence(attempt);
      if (!busca) return { resultado: "TRANSFERENCIA_ENCONTRADA" };
      const resultado = await payments.startAbsenceCheck(attempt.id, evidencia(operador, busca));
      if (resultado !== "VERIFICACAO_INICIADA") throw liberacaoRecusada(resultado);
      return { resultado, confirmarAPartirDe: new Date(Date.now() + ESPERA_CONFIRMACAO_MS).toISOString() };
    },

    async confirmPayoutAbsence(attemptId: string, operador: string, declaracao: string): Promise<{ resultado: "AUSENCIA_CONFIRMADA" | "TRANSFERENCIA_ENCONTRADA" }> {
      const attempt = await findAttemptOrFail(attemptId);
      if (attempt.estado !== "EM_VERIFICACAO" || !attempt.verificacaoIniciadaEm) throw liberacaoRecusada("ESTADO_INVALIDO");
      if (declaracao !== (await payments.absenceDeclaration())) throw liberacaoRecusada("DECLARACAO_INVALIDA");
      if (Date.now() < attempt.verificacaoIniciadaEm.getTime() + ESPERA_CONFIRMACAO_MS) throw liberacaoRecusada("PRAZO_NAO_ATINGIDO");
      const busca = await searchForAbsence(attempt);
      if (!busca) return { resultado: "TRANSFERENCIA_ENCONTRADA" };
      const resultado = await payments.confirmAbsence(attempt.id, evidencia(operador, busca), declaracao);
      if (resultado !== "AUSENCIA_CONFIRMADA") throw liberacaoRecusada(resultado);
      return { resultado };
    },

    async checkPayoutTransfer(attemptId: string): Promise<"CONCLUIDA" | "FALHOU" | "SEM_MUDANCA" | "REPASSE_E_ESTORNO"> {
      const attempt = await findAttemptOrFail(attemptId);
      if (!attempt.asaasTransferId || (attempt.estado !== "PENDENTE" && attempt.estado !== "INCONCLUSIVA")) {
        throw new AppError(409, "TENTATIVA_SEM_TRANSFERENCIA", "Esta tentativa não tem transferência registrada em aberto.");
      }
      const transfer = await asaas.getTransfer(attempt.asaasTransferId);
      if (!transfer) throw new AppError(409, "TRANSFERENCIA_NAO_ENCONTRADA", "A transferência registrada não foi encontrada na Asaas; concilie manualmente.");
      const conclusao = transfer.status === "DONE" ? await payments.completeAttempt(attempt.id, transfer.id) : null;
      if (conclusao === "CONCLUIDA") {
        await warnPayout(attempt.paymentId, true);
        return "CONCLUIDA";
      }
      if (conclusao === "REPASSE_E_ESTORNO") {
        warnRefundedPayout(attempt, transfer.id);
        return "REPASSE_E_ESTORNO";
      }
      if (TRANSFER_DEAD.includes(transfer.status) && (await payments.failAttempt(attempt.id, transfer.id))) {
        await warnPayout(attempt.paymentId, false);
        return "FALHOU";
      }
      return "SEM_MUDANCA";
    },

    async refundHiring(eventId: string, action: RefundAction, contestacaoId: string | null = null): Promise<"PROCESSANDO" | "ESTORNADO"> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status !== "PAGO") throw new AppError(409, "PAGAMENTO_NAO_CONFIRMADO", "Não há pagamento confirmado para estornar nesta contratação.");
      if (payment.repasseStatus === "REPASSADO") {
        throw new AppError(409, "REPASSE_JA_REALIZADO", "O cachê deste evento já foi repassado ao músico.");
      }
      if (payment.repasseStatus === "PROCESSANDO" || (await payments.findOpenAttempt(payment.id))) throw repasseEmAndamento();
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote || remote.value < payment.valor) throw new AppError(409, "ESTORNO_COBRANCA_DIVERGENTE", `A cobrança no Asaas não corresponde ao pagamento registrado. Escreva para ${EMAIL_SUPORTE}.`);
      let current = payment;
      if (current.refundStatus === "PROCESSANDO") {
        current = await atualizarEstorno(current);
        if (current.status === "ESTORNADO") return "ESTORNADO";
        if (current.refundStatus === "PROCESSANDO") return "PROCESSANDO";
      }
      if (!cobrancaQuitada(remote.status) && remote.status !== "REFUNDED") {
        throw new AppError(409, "ESTORNO_COBRANCA_DIVERGENTE", "A cobrança não está confirmada no Asaas. Atualize a contratação e tente novamente.");
      }
      const previous: RefundState = { refundStatus: current.refundStatus, refundAction: current.refundAction };
      if (!(await payments.claimRefund(current.id, action, contestacaoId))) return explainRefusedRefund(current.id);
      const claimed: PaymentRecord = { ...current, refundStatus: "PROCESSANDO", refundAction: action, refundRequestedAt: new Date() };
      if (remote.status === "REFUNDED") {
        await completeRefund(claimed);
        return "ESTORNADO";
      }
      if (!semEstornoAtivoNaAsaas(remote)) return "PROCESSANDO";
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
      const latest = await atualizarEstorno(claimed, false).catch(() => claimed);
      return latest.status === "ESTORNADO" ? "ESTORNADO" : "PROCESSANDO";
    },

    async refreshRefund(eventId: string): Promise<PaymentRecord | null> {
      const payment = await payments.findLatestPayment(eventId);
      if (!payment) return null;
      return atualizarEstorno(payment);
    },

    async ensurePaidForNoRefund(eventId: string): Promise<void> {
      const payment = await payments.findLatestPayment(eventId);
      if (payment?.status !== "PAGO" || payment.refundStatus === "PROCESSANDO") throw new AppError(409, "PAGAMENTO_INDISPONIVEL", "O pagamento deste evento não está disponível para cancelamento sem estorno.");
      const remote = await asaas.getPayment(payment.asaasPaymentId);
      if (!remote || !cobrancaQuitada(remote.status) || remote.value < payment.valor) {
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
        const transfer = await asaas.getTransfer(notification.transfer.id);
        if (transfer) await applyTransfer(transfer);
      }

      const asaasPaymentId = notification.payment?.id;
      const local = asaasPaymentId ? await payments.findPaymentByAsaasId(asaasPaymentId) : null;
      if (asaasPaymentId && local) {
        switch (notification.event) {
          case "PAYMENT_RECEIVED":
          case "PAYMENT_CONFIRMED": {
            const remote = await asaas.getPayment(asaasPaymentId);
            if (!remote || !cobrancaQuitada(remote.status) || remote.value < local.valor) {
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
              else if (semEstornoAtivoNaAsaas(remote)) await warnDisputeReopened(local, await payments.denyRefund(local.id), true);
            }
            break;
        }
      }

      await payments.recordWebhookEvent({ id: notification.id, tipo: notification.event, asaasPaymentId, payload: notification });
    },
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
