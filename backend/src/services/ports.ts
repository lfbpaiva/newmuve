import type { CandidateRecord, DecisaoContestacao, DisputeRecord, EventInput, EventRecord, MessageRecord, MotivoRecusa, PenaltyRecord, StatusProposta, TipoPenalidade, PaymentRecord, PaymentStatus, PayoutStatus, RefundAction, RefundStatus } from "../domain/event.ts";

export type ConfirmPaymentResult = "CONTRATADO" | "JA_PROCESSADO" | "PAGAMENTO_NAO_ENCONTRADO" | "EVENTO_INDISPONIVEL";

export interface EventStore {
  findEvent(id: string): Promise<EventRecord | null>;
  findEndereco(eventId: string): Promise<string | null>;
  insertEvent(contractorId: string, data: EventInput & { imagemUrl: string }): Promise<EventRecord>;
  updateEvent(id: string, data: EventInput & { imagemUrl?: string }): Promise<EventRecord>;
  deleteEvent(id: string): Promise<void>;
  setConfirmation(eventId: string, party: "musico" | "contratante"): Promise<EventRecord>;
  concludeEvent(eventId: string): Promise<EventRecord>;
  cancelEvent(eventId: string): Promise<void>;
  hasOngoingHiring(userId: string): Promise<boolean>;
  distanceKm(eventId: string, musicianId: string): Promise<number | null>;

  findCandidate(eventId: string, musicianId: string): Promise<CandidateRecord | null>;
  findCandidateById(id: string): Promise<CandidateRecord | null>;
  listCandidates(eventId: string): Promise<CandidateRecord[]>;
  listEventsOf(userId: string, role: "MUSICIAN" | "CONTRACTOR"): Promise<EventRecord[]>;
  openDispute(dispute: { eventId: string; abertaPor: string; motivo: string }): Promise<DisputeRecord>;
  findOpenDispute(eventId: string): Promise<DisputeRecord | null>;
  findDispute(id: string): Promise<DisputeRecord | null>;
  resolveDispute(id: string, decisao: DecisaoContestacao, observacao: string | null): Promise<boolean>;
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
  addPenalty(penalty: { musicianId: string; eventId: string | null; tipo: TipoPenalidade; multa: number }): Promise<void>;
  openFines(musicianId: string): Promise<PenaltyRecord[]>;
  settleFines(ids: string[], paymentId: string): Promise<void>;
  setPayoutDiscount(paymentId: string, valor: number): Promise<void>;
  findPendingPayment(eventId: string): Promise<PaymentRecord | null>;
  findLatestPayment(eventId: string): Promise<PaymentRecord | null>;
  findPaymentByAsaasId(asaasPaymentId: string): Promise<PaymentRecord | null>;
  findPaymentByTransferId(asaasTransferId: string): Promise<PaymentRecord | null>;
  findLateRefundsToRetry(eventId: string): Promise<PaymentRecord[]>;
  insertPayment(payment: {
    eventId: string;
    candidateId: string;
    contractorId: string;
    asaasPaymentId: string;
    valor: number;
    valorComissao: number;
    pixCopiaCola: string;
    pixQrCode: string;
    expiraEm: Date;
  }): Promise<PaymentRecord>;
  setPaymentStatus(id: string, status: PaymentStatus): Promise<void>;
  claimRefund(id: string, action: RefundAction): Promise<boolean>;
  setRefundStatus(id: string, status: RefundStatus): Promise<void>;
  releaseRefund(id: string, previous: Pick<PaymentRecord, "refundStatus" | "refundAction">): Promise<void>;
  finalizeRefund(id: string): Promise<"CONFIRMADO" | "JA_PROCESSADO" | "REPASSE_CONFLITANTE">;
  confirmPayment(asaasPaymentId: string): Promise<ConfirmPaymentResult>;

  claimPayout(id: string): Promise<boolean>;
  setPayout(id: string, payout: { status: PayoutStatus | null; asaasTransferId?: string }): Promise<void>;

  getAsaasCustomerId(contractorId: string): Promise<string | null>;
  setAsaasCustomerId(contractorId: string, customerId: string): Promise<void>;

  webhookEventExists(id: string): Promise<boolean>;
  recordWebhookEvent(event: { id: string; tipo: string; asaasPaymentId?: string; payload: unknown }): Promise<void>;
}

export interface AsaasPayment {
  status: string;
  value: number;
  refunds?: Array<{ status: string; value: number }>;
}

export interface AsaasGateway {
  createCustomer(customer: { name: string; cpfCnpj: string; email: string; externalReference: string }): Promise<string>;
  createPixCharge(charge: { customer: string; value: number; dueDate: string; description: string; externalReference: string }): Promise<string>;
  getPixQrCode(paymentId: string): Promise<{ payload: string; encodedImage: string }>;
  getPayment(paymentId: string): Promise<AsaasPayment | null>;
  cancelCharge(paymentId: string): Promise<void>;
  refundPayment(paymentId: string): Promise<void>;
  transferPix(transfer: {
    value: number;
    pixAddressKey: string;
    pixAddressKeyType: string;
    description: string;
    externalReference: string;
  }): Promise<{ id: string; status: string }>;
  getTransferStatus(transferId: string): Promise<string | null>;
  createSubscription(subscription: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string }): Promise<string>;
  listSubscriptionPayments(subscriptionId: string): Promise<{ id: string; status: string; dueDate: string }[]>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}
