import type { CandidateRecord, EventInput, EventRecord, PaymentRecord, PaymentStatus, PayoutStatus } from "../domain/event.ts";

// Portas de eventos, candidaturas e pagamentos. Os serviços dependem destas
// interfaces; as implementações reais ficam em adapters/.

export type ConfirmPaymentResult = "CONTRATADO" | "JA_PROCESSADO" | "PAGAMENTO_NAO_ENCONTRADO" | "EVENTO_INDISPONIVEL";

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
    expiraEm: Date;
  }): Promise<PaymentRecord>;
  setPaymentStatus(id: string, status: PaymentStatus): Promise<void>;
  /** Efetiva a contratação em uma única transação (função confirm_asaas_payment). */
  confirmPayment(asaasPaymentId: string): Promise<ConfirmPaymentResult>;

  /**
   * Reserva o repasse para esta execução (RETIDO/FALHOU → PROCESSANDO) de forma
   * atômica. Devolve false se outra execução já o reservou: evita repasse em dobro.
   */
  claimPayout(id: string): Promise<boolean>;
  setPayout(id: string, payout: { status: PayoutStatus | null; asaasTransferId?: string }): Promise<void>;

  getAsaasCustomerId(contractorId: string): Promise<string | null>;
  setAsaasCustomerId(contractorId: string, customerId: string): Promise<void>;

  webhookEventExists(id: string): Promise<boolean>;
  recordWebhookEvent(event: { id: string; tipo: string; asaasPaymentId?: string; payload: unknown }): Promise<void>;
}

export interface AsaasGateway {
  createCustomer(customer: { name: string; cpfCnpj: string; email: string; mobilePhone: string; externalReference: string }): Promise<string>;
  createPixCharge(charge: { customer: string; value: number; dueDate: string; description: string; externalReference: string }): Promise<string>;
  getPixQrCode(paymentId: string): Promise<{ payload: string; encodedImage: string }>;
  getPayment(paymentId: string): Promise<{ status: string; value: number } | null>;
  cancelCharge(paymentId: string): Promise<void>;
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
