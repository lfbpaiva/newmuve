import type { CandidateRecord, EventInput, EventRecord, PaymentRecord, PaymentStatus, RefundAction, RefundStatus } from "../domain/event.ts";

// Portas de eventos, candidaturas e pagamentos. Os serviços dependem destas
// interfaces; as implementações reais ficam em adapters/.

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
  /** Marca as duas confirmações (conclusão automática por prazo). */
  concludeEvent(eventId: string): Promise<EventRecord>;
  cancelEvent(eventId: string): Promise<void>;
  /** Devolve um evento contratado ao estado ABERTO (função reopen_event). */
  reopenEvent(eventId: string): Promise<void>;
  /** O usuário é parte de algum evento com status CONTRATADO? */
  hasOngoingHiring(userId: string): Promise<boolean>;
  /** Distância em km entre as cidades do evento e do músico; nulo se desconhecida. */
  distanceKm(eventId: string, musicianId: string): Promise<number | null>;

  findCandidate(eventId: string, musicianId: string): Promise<CandidateRecord | null>;
  findCandidateById(id: string): Promise<CandidateRecord | null>;
  /** Lança AppError 409 JA_INSCRITO se a candidatura já existir. */
  insertCandidate(eventId: string, musicianId: string): Promise<CandidateRecord>;
  deleteCandidate(id: string): Promise<void>;

  /** Lança AppError 409 JA_AVALIADO se o autor já avaliou o evento. */
  insertReview(review: { eventId: string; authorId: string; reviewedId: string; rating: number; comment?: string }): Promise<void>;
  hasReviewed(eventId: string, authorId: string): Promise<boolean>;
}

export interface PaymentStore {
  findPendingPayment(eventId: string): Promise<PaymentRecord | null>;
  /** Cobrança mais recente do evento, em qualquer status. */
  findLatestPayment(eventId: string): Promise<PaymentRecord | null>;
  findPaymentByAsaasId(asaasPaymentId: string): Promise<PaymentRecord | null>;
  findPaymentById(id: string): Promise<PaymentRecord | null>;
  findPaymentByTransferId(asaasTransferId: string): Promise<PaymentRecord | null>;
  /** Lança AppError 409 COBRANCA_EM_ANDAMENTO se já houver cobrança pendente para o evento. */
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
  /** Reserva a expiração só após o prazo, pelo relógio do banco. */
  expirePayment(id: string): Promise<boolean>;
  /** Reserva um único estorno antes da chamada externa, inclusive entre processos. */
  claimRefund(id: string, action: RefundAction): Promise<boolean>;
  setRefundStatus(id: string, status: RefundStatus): Promise<void>;
  /** Confirma pagamento, evento e candidaturas em uma transação após confirmação da Asaas. */
  finalizeRefund(id: string): Promise<"CONFIRMADO" | "JA_PROCESSADO" | "REPASSE_CONFLITANTE">;
  /** Efetiva a contratação em uma única transação (função confirm_asaas_payment). */
  confirmPayment(asaasPaymentId: string): Promise<ConfirmPaymentResult>;
  markLatePaymentDetected(id: string): Promise<void>;

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

  getAsaasCustomerId(contractorId: string): Promise<string | null>;
  setAsaasCustomerId(contractorId: string, customerId: string): Promise<void>;

  webhookEventExists(id: string): Promise<boolean>;
  recordWebhookEvent(event: { id: string; tipo: string; asaasPaymentId?: string; asaasTransferId?: string; payload: unknown }): Promise<void>;
}

export interface AsaasGateway {
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
  refundPayment(paymentId: string): Promise<void>;
  /** Transferência Pix do saldo da plataforma para uma chave. */
  transferPix(transfer: {
    value: number;
    pixAddressKey: string;
    pixAddressKeyType: string;
    description: string;
    externalReference: string;
  }): Promise<{ id: string; status: string }>;
}
