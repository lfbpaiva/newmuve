<<<<<<< HEAD
import type { CandidateRecord, EventInput, EventRecord, PaymentRecord, PaymentStatus, RefundAction, RefundStatus } from "../domain/event.ts";

// Portas de eventos, candidaturas e pagamentos. Os serviços dependem destas
// interfaces; as implementações reais ficam em adapters/.
=======
import type { CandidateRecord, DecisaoContestacao, DisputeRecord, EventInput, EventRecord, MessageRecord, MotivoRecusa, PenaltyRecord, StatusProposta, TipoPenalidade, PaymentRecord, PaymentStatus, PayoutStatus, RefundAction, RefundStatus } from "../domain/event.ts";
>>>>>>> upstream/main

export type ConfirmPaymentResult = "CONTRATADO" | "JA_PROCESSADO" | "PAGAMENTO_NAO_ENCONTRADO" | "EVENTO_INDISPONIVEL" | "PAGAMENTO_EXPIRADO";

export type PayoutIntentState = "RESERVADO" | "ENVIADO" | "PENDENTE" | "CONCLUIDO" | "FALHOU" | "CONCILIACAO";

export interface PayoutIntentRecord {
  id: string;
  paymentId: string;
  eventId: string;
  musicianId: string;
  amount: number;
  pixKey: string | null;
  pixKeyType: string | null;
  state: PayoutIntentState;
  asaasTransferId: string | null;
  createdAt: Date;
  reconciliationRequired?: boolean;
}

export interface AsaasTransferRecord {
  id: string;
  status: string;
  externalReference: string | null;
  value: number;
  operationType: string | null;
  pixAddressKey: string | null;
}
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
  findPaymentById(id: string): Promise<PaymentRecord | null>;
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
  }): Promise<PaymentRecord>;
  setPaymentStatus(id: string, status: PaymentStatus): Promise<void>;
<<<<<<< HEAD
  /** Reserva a expiração só após o prazo, pelo relógio do banco. */
  expirePayment(id: string): Promise<boolean>;
  /** Reserva um único estorno antes da chamada externa, inclusive entre processos. */
  claimRefund(id: string, action: RefundAction): Promise<boolean>;
  setRefundStatus(id: string, status: RefundStatus): Promise<void>;
  /** Confirma pagamento, evento e candidaturas em uma transação após confirmação da Asaas. */
  finalizeRefund(id: string): Promise<"CONFIRMADO" | "JA_PROCESSADO" | "REPASSE_CONFLITANTE">;
  /** Efetiva a contratação em uma única transação (função confirm_asaas_payment). */
=======
  claimRefund(id: string, action: RefundAction): Promise<boolean>;
  setRefundStatus(id: string, status: RefundStatus): Promise<void>;
  releaseRefund(id: string, previous: Pick<PaymentRecord, "refundStatus" | "refundAction">): Promise<void>;
  finalizeRefund(id: string): Promise<"CONFIRMADO" | "JA_PROCESSADO" | "REPASSE_CONFLITANTE">;
>>>>>>> upstream/main
  confirmPayment(asaasPaymentId: string): Promise<ConfirmPaymentResult>;
  markLatePaymentDetected(id: string): Promise<void>;

<<<<<<< HEAD
  findPayoutIntentByPaymentId(paymentId: string): Promise<PayoutIntentRecord | null>;
  findPayoutIntentById(id: string): Promise<PayoutIntentRecord | null>;
  findPayoutIntentByTransferId(transferId: string): Promise<PayoutIntentRecord | null>;
  reservePayoutIntent(data: {
    paymentId: string;
    eventId: string;
    musicianId: string;
    amount: number;
    pixKey: string;
    pixKeyType: string;
  }): Promise<PayoutIntentRecord | null>;
  markPayoutSent(id: string): Promise<boolean>;
  markPayoutUnknown(id: string): Promise<void>;
  linkPayoutTransfer(id: string, transferId: string): Promise<boolean>;
  applyPayoutTransfer(id: string, transfer: AsaasTransferRecord): Promise<PayoutIntentState | "DESCONHECIDO">;
  markPayoutPreflightFailure(id: string): Promise<void>;
=======
  claimPayout(id: string): Promise<boolean>;
  setPayout(id: string, payout: { status: PayoutStatus | null; asaasTransferId?: string }): Promise<void>;
>>>>>>> upstream/main

  getAsaasCustomerId(contractorId: string): Promise<string | null>;
  setAsaasCustomerId(contractorId: string, customerId: string): Promise<void>;

  webhookEventExists(id: string): Promise<boolean>;
  recordWebhookEvent(event: { id: string; tipo: string; asaasPaymentId?: string; asaasTransferId?: string; payload: unknown }): Promise<void>;
}

export interface AsaasPayment {
  status: string;
  value: number;
  refunds?: Array<{ status: string; value: number }>;
}

export interface AsaasGateway {
<<<<<<< HEAD
  getCustomer(id: string): Promise<{ id: string; cpfCnpj: string; externalReference: string | null } | null>;
  findCustomerByReference(reference: string, cpfCnpj: string): Promise<{ id: string; cpfCnpj: string; externalReference: string | null } | null>;
  createCustomer(customer: { name: string; cpfCnpj: string; email: string; externalReference: string }): Promise<string>;
  findPendingPixCharge(reference: string, customer: string, value: number): Promise<string | null>;
  createPixCharge(charge: { customer: string; value: number; dueDate: string; description: string; externalReference: string }): Promise<string>;
  getPixQrCode(paymentId: string): Promise<{ payload: string; encodedImage: string }>;
  getPayment(paymentId: string): Promise<{ status: string; value: number; refunds?: Array<{ status: string; value: number }>; paymentDate?: string | null; clientPaymentDate?: string | null; confirmedDate?: string | null } | null>;
  cancelCharge(paymentId: string): Promise<void>;
  getTransfer(id: string): Promise<AsaasTransferRecord | null>;
  findTransfersByReference(reference: string, createdAt: Date): Promise<{ matches: string[]; complete: boolean }>;
  /** Estorno integral de uma cobrança Pix já recebida. */
=======
  createCustomer(customer: { name: string; cpfCnpj: string; email: string; externalReference: string }): Promise<string>;
  createPixCharge(charge: { customer: string; value: number; dueDate: string; description: string; externalReference: string }): Promise<string>;
  getPixQrCode(paymentId: string): Promise<{ payload: string; encodedImage: string }>;
  getPayment(paymentId: string): Promise<AsaasPayment | null>;
  cancelCharge(paymentId: string): Promise<void>;
>>>>>>> upstream/main
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
