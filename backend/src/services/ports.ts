import type { CandidateRecord, EventInput, EventRecord, PaymentRecord, PaymentStatus, PayoutStatus, RefundAction, RefundStatus } from "../domain/event.ts";

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
  insertCandidate(eventId: string, musicianId: string): Promise<CandidateRecord>;
  deleteCandidate(id: string): Promise<void>;

  insertReview(review: { eventId: string; authorId: string; reviewedId: string; rating: number; comment?: string }): Promise<void>;
  hasReviewed(eventId: string, authorId: string): Promise<boolean>;
}

export interface PaymentStore {
  findPendingPayment(eventId: string): Promise<PaymentRecord | null>;
  findLatestPayment(eventId: string): Promise<PaymentRecord | null>;
  findPaymentByAsaasId(asaasPaymentId: string): Promise<PaymentRecord | null>;
  findPaymentByTransferId(asaasTransferId: string): Promise<PaymentRecord | null>;
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
}
