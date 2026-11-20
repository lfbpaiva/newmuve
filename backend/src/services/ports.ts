import type { CandidateRecord, DecisaoContestacao, DisputeRecord, EventInput, EventRecord, MessageRecord, MotivoRecusa, PayoutAttempt, PendingDisputeRecord, ResolvedDisputeRecord, StatusProposta, TipoPenalidade, PaymentRecord, PaymentStatus, RefundAction } from "../domain/event.ts";

export type ConfirmPaymentResult = "CONTRATADO" | "JA_PROCESSADO" | "PAGAMENTO_NAO_ENCONTRADO" | "EVENTO_INDISPONIVEL";
export type RegistroTransferencia = "REGISTRADA" | "JA_REGISTRADA" | "TARDIA" | "RECUSADA";
export type ConclusaoTentativa = "CONCLUIDA" | "JA_CONCLUIDA" | "ALERTA" | "RECUSADA" | "REPASSE_E_ESTORNO";
export type AlertaRepasse = "POSSIVEL_DUPLICIDADE" | "RESPOSTA_TARDIA" | "REPASSE_E_ESTORNO";

export interface TravaDaRotina {
  adquirir(dono: string, validadeSegundos: number): Promise<number | null>;
  renovar(dono: string, geracao: number, validadeSegundos: number): Promise<boolean>;
  encerrar(dono: string, geracao: number, resultado: "SUCESSO" | "FALHA", erro: string | null): Promise<boolean>;
}

export interface EvidenciaDeAusencia {
  operador: string;
  referencia: string;
  desde: string;
  iniciadaEm: Date;
  completa: boolean;
  paginas: number;
  listadas: number;
  encontradas: number;
}

export interface EventStore {
  findEvent(id: string): Promise<EventRecord | null>;
  findEndereco(eventId: string): Promise<string | null>;
  insertEvent(contractorId: string, data: EventInput & { imagemUrl: string }): Promise<EventRecord>;
  updateEvent(id: string, data: EventInput & { imagemUrl?: string }): Promise<EventRecord>;
  deleteEvent(id: string): Promise<void>;
  setConfirmation(eventId: string, party: "musico" | "contratante"): Promise<EventRecord>;
  concludeEvent(eventId: string): Promise<EventRecord>;
  findDueHirings(startedBefore: Date): Promise<string[]>;
  cancelEvent(eventId: string): Promise<void>;
  hasOngoingHiring(userId: string): Promise<boolean>;
  distanceKm(eventId: string, musicianId: string): Promise<number | null>;

  findCandidate(eventId: string, musicianId: string): Promise<CandidateRecord | null>;
  findCandidateById(id: string): Promise<CandidateRecord | null>;
  listCandidates(eventId: string): Promise<CandidateRecord[]>;
  listEventsOf(userId: string, role: "MUSICIAN" | "CONTRACTOR"): Promise<EventRecord[]>;
  openDispute(dispute: { eventId: string; abertaPor: string; motivo: string }): Promise<DisputeRecord | null>;
  findOpenDispute(eventId: string): Promise<PendingDisputeRecord | null>;
  findLatestResolvedDispute(eventId: string, paymentId: string): Promise<ResolvedDisputeRecord | null>;
  findDispute(id: string): Promise<DisputeRecord | null>;
  decideDispute(id: string, decisao: DecisaoContestacao, observacao: string | null): Promise<"DECIDIDA" | "RETOMADA" | "JA_DECIDIDA" | "NAO_ENCONTRADA">;
  reopenDisputeWithoutRefund(id: string): Promise<boolean>;
  setApplicationsClosed(eventId: string, closed: boolean): Promise<void>;
  declineCandidate(id: string, motivo: MotivoRecusa): Promise<boolean>;
  musicianHasConflict(musicianId: string, eventId: string): Promise<boolean>;
  hasAppliedToContractor(musicianId: string, contractorId: string): Promise<boolean>;
  setFavorite(contractorId: string, musicianId: string, favorite: boolean): Promise<void>;
  isFavorite(contractorId: string, musicianId: string): Promise<boolean>;
  insertInvite(eventId: string, musicianId: string): Promise<void>;
  hasInvite(eventId: string, musicianId: string): Promise<boolean>;
  insertCandidate(eventId: string, musicianId: string, valorProposto: number | null): Promise<CandidateRecord>;
  updateCandidateProposal(id: string, valorProposto: number | null): Promise<void>;
  deleteCandidate(id: string): Promise<void>;
  insertMessage(message: { candidateId: string; authorId: string; texto: string; valor?: number }): Promise<MessageRecord>;
  findMessage(id: string): Promise<MessageRecord | null>;
  closeOpenProposals(candidateId: string): Promise<void>;
  answerProposal(id: string, status: Exclude<StatusProposta, "ABERTA" | "SUBSTITUIDA">): Promise<boolean>;

  insertReview(review: { eventId: string; authorId: string; reviewedId: string; rating: number; comment?: string }): Promise<void>;
  hasReviewed(eventId: string, authorId: string): Promise<boolean>;
}

export interface PaymentStore {
  findRefundPenalty(paymentId: string): Promise<{ musicianId: string; tipo: TipoPenalidade; multa: number; visibilidadeReduzidaAte: Date } | null>;
  findPendingPayment(eventId: string): Promise<PaymentRecord | null>;
  findLatestPayment(eventId: string): Promise<PaymentRecord | null>;
  findPaymentByAsaasId(asaasPaymentId: string): Promise<PaymentRecord | null>;
  findPaymentById(id: string): Promise<PaymentRecord | null>;
  findFinanceFollowUps(now: Date): Promise<{ expiredCharges: string[]; refunds: string[]; payouts: string[] }>;
  findLateRefundsToRetry(eventId: string): Promise<PaymentRecord[]>;
  insertPayment(payment: {
    eventId: string;
    candidateId: string;
    contractorId: string;
    asaasPaymentId: string;
    valor: number;
    valorComissao: number;
    pixCopiaCola: string | null;
    pixQrCode: string | null;
    expiraEm: Date;
  }): Promise<PaymentRecord>;
  setPaymentStatus(id: string, status: PaymentStatus): Promise<void>;
  claimRefund(id: string, action: RefundAction, contestacaoId?: string | null): Promise<boolean>;
  denyRefund(id: string): Promise<string | null>;
  releaseRefund(id: string, previous: Pick<PaymentRecord, "refundStatus" | "refundAction">): Promise<string | null>;
  finalizeRefund(id: string): Promise<"CONFIRMADO" | "JA_PROCESSADO" | "REPASSE_CONFLITANTE">;
  confirmPayment(asaasPaymentId: string): Promise<ConfirmPaymentResult>;

  claimPayout(id: string): Promise<{ tentativaId: string | null; desconto: number }>;
  findOpenAttempt(paymentId: string): Promise<PayoutAttempt | null>;
  findOpenAttempts(): Promise<PayoutAttempt[]>;
  findAttempt(id: string): Promise<PayoutAttempt | null>;
  findAttemptByTransferId(asaasTransferId: string): Promise<PayoutAttempt | null>;
  registerTransfer(attemptId: string, asaasTransferId: string): Promise<RegistroTransferencia>;
  markAttemptInconclusive(attemptId: string): Promise<boolean>;
  registerRequestSent(attemptId: string): Promise<boolean>;
  markStaleAttempt(attemptId: string): Promise<"SEM_MUDANCA" | "FALHOU" | "INCONCLUSIVA">;
  markStaleAttempts(): Promise<number>;
  completeAttempt(attemptId: string, asaasTransferId: string): Promise<ConclusaoTentativa>;
  failAttempt(attemptId: string, asaasTransferId: string | null): Promise<boolean>;
  recordAttemptAlert(attemptId: string, tipo: AlertaRepasse, asaasTransferId: string, status: string | null): Promise<void>;
  absenceDeclaration(): Promise<string>;
  startAbsenceCheck(attemptId: string, evidencia: EvidenciaDeAusencia): Promise<string>;
  confirmAbsence(attemptId: string, evidencia: EvidenciaDeAusencia, declaracao: string): Promise<string>;

  getAsaasCustomerId(contractorId: string): Promise<string | null>;
  setAsaasCustomerId(contractorId: string, customerId: string): Promise<void>;

  webhookEventExists(id: string): Promise<boolean>;
  recordWebhookEvent(event: { id: string; tipo: string; asaasPaymentId?: string; payload: unknown }): Promise<void>;
}

export const COBRANCA_REMOVIDA_NA_ASAAS = "DELETED";

export interface AsaasPayment {
  status: string;
  value: number;
  refunds?: Array<{ status: string; value: number }>;
}

export interface AsaasTransfer {
  id: string;
  status: string;
  externalReference: string | null;
  value: number;
}

export interface BuscaDeTransferencias {
  encontradas: AsaasTransfer[];
  referencia: string;
  desde: string;
  iniciadaEm: Date;
  paginas: number;
  listadas: number;
}

export interface ContextoAsaas {
  correlacao?: string;
  etapa?: string;
  tentativa?: number;
  timeoutMs?: number;
}

export interface AsaasGateway {
  createCustomer(customer: { name: string; cpfCnpj: string; email: string; externalReference: string }, contexto?: ContextoAsaas): Promise<string>;
  createPixCharge(charge: { customer: string; value: number; dueDate: string; description: string; externalReference: string }, contexto?: ContextoAsaas): Promise<string>;
  getPixQrCode(paymentId: string, opcoes?: { prazo?: number; correlacao?: string }): Promise<{ payload: string; encodedImage: string }>;
  getPayment(paymentId: string, opcoes?: { timeoutMs?: number; correlacao?: string; etapa?: string }): Promise<AsaasPayment | null>;
  cancelCharge(paymentId: string, opcoes?: { timeoutMs?: number; correlacao?: string }): Promise<{ removida: boolean }>;
  refundPayment(paymentId: string): Promise<void>;
  transferPix(transfer: {
    value: number;
    pixAddressKey: string;
    pixAddressKeyType: string;
    description: string;
    externalReference: string;
  }): Promise<{ id: string; status: string }>;
  getTransfer(transferId: string): Promise<AsaasTransfer | null>;
  findTransfersByReference(reference: string, createdSince: Date, maxPages?: number): Promise<BuscaDeTransferencias>;
  createSubscription(subscription: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string }): Promise<string>;
  listSubscriptionPayments(subscriptionId: string): Promise<{ id: string; status: string; dueDate: string }[]>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export const COBRANCA_QUITADA = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];

export const cobrancaQuitada = (status: string) => COBRANCA_QUITADA.includes(status);
