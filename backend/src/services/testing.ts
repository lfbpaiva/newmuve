import { COBRANCA_VALIDADE_MS } from "../../../shared/dominio.ts";
import type { Account } from "../domain/account.ts";
import { AppError } from "../domain/errors.ts";
import type { CandidateRecord, EventRecord, PaymentRecord } from "../domain/event.ts";
import type { AccountStore, ImageStore } from "./accountService.ts";
import type { Mailer } from "./notifications.ts";
import type { AsaasGateway, AsaasTransferRecord, EventStore, PaymentStore, PayoutIntentRecord } from "./ports.ts";

// Implementações em memória das portas, usadas apenas pelos testes dos serviços.

export const NOW = new Date("2030-06-10T12:00:00Z");
export const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 60 * 60 * 1000);

export const contratante = { id: "c1", email: "bar@exemplo.com" };
export const outroContratante = { id: "c2", email: "outro@exemplo.com" };
export const musico = { id: "m1", email: "ana@exemplo.com" };
export const outroMusico = { id: "m2", email: "beto@exemplo.com" };

const account = (id: string, role: Account["role"]): Account => ({
  id,
  role,
  nome: id,
  documento: role === "MUSICIAN" ? "52998224725" : "11222333000181",
  telefone: "45999990000",
  uf: "PR",
  cidade: "Cascavel",
  fotoPerfilUrl: `https://cdn.test/${id}.png`,
  avaliacaoMedia: 0,
  totalAvaliacoes: 0,
  ...(role === "MUSICIAN" ? { estilosMusicais: ["Rock", "MPB"], chavePixTipo: "EMAIL", chavePix: `${id}@exemplo.com` } : {}),
});

export function memoryWorld() {
  const accounts = new Map<string, Account>([
    ["c1", account("c1", "CONTRACTOR")],
    ["c2", account("c2", "CONTRACTOR")],
    ["m1", account("m1", "MUSICIAN")],
    ["m2", account("m2", "MUSICIAN")],
  ]);
  const events = new Map<string, EventRecord>();
  const enderecos = new Map<string, string>();
  const candidates = new Map<string, CandidateRecord>();
  const payments = new Map<string, PaymentRecord & { asaasTransferId?: string; createdAt: number }>();
  const payoutIntents = new Map<string, PayoutIntentRecord>();
  const asaasTransfers = new Map<string, AsaasTransferRecord>();
  const reviews: { eventId: string; authorId: string; reviewedId: string; rating: number }[] = [];
  const images = new Set<string>();
  const customers = new Map<string, string>();
  const asaasCustomers = new Map<string, { cpfCnpj: string; externalReference: string }>();
  const webhookEvents = new Set<string>();
  // Estado da "Asaas": cobranças, estornos e transferências.
  const asaasCharges = new Map<string, { status: string; value: number; customer?: string; externalReference?: string }>();
  const asaasCalls = {
    createCustomer: 0,
    createPixCharge: [] as { value: number; customer: string }[],
    cancelCharge: [] as string[],
    refundPayment: [] as string[],
    transferPix: [] as { value: number; pixAddressKey: string; pixAddressKeyType: string; externalReference: string }[],
  };
  const failures = { refund: false, chargeAfterCreate: false, transfer: false, transferAfterCreate: false, transferLookup: false, transferQuery: false, cancel: false };
  let sequence = 1;
  let databaseTime = NOW;
  const nextId = (prefix: string) => `${prefix}${sequence++}`;

  const accountStore = {
    findAccount: async (id: string) => accounts.get(id) ?? null,
    findEmail: async (id: string) => (accounts.has(id) ? `${id}@exemplo.com` : null),
  } as unknown as AccountStore;
  // Distâncias entre cidades (km), por "uf/cidade" normalizada; ausente = desconhecida.
  const distances = new Map<string, number>([["PR/toledo", 38.5], ["PR/foz do iguacu", 140], ["PR/curitiba", 430]]);
  const sent: { to: string; subject: string; text: string }[] = [];
  const mailer: Mailer = { send: async (message) => void sent.push(message) };

  const imageStore: ImageStore = {
    upload: async (bucket, ownerId, file) => {
      const url = `https://cdn.test/storage/v1/object/public/${bucket}/${ownerId}/${file.name}`;
      images.add(url);
      return url;
    },
    removeByUrl: async (_bucket, url) => void images.delete(url),
    removeAllOf: async () => {},
  };

  const eventStore: EventStore = {
    findEvent: async (id) => events.get(id) ?? null,
    findEndereco: async (id) => enderecos.get(id) ?? null,
    insertEvent: async (contractorId, { endereco, ...data }) => {
      const event: EventRecord = {
        ...data,
        id: nextId("e"),
        contractorId,
        musicoContratadoId: null,
        descricao: data.descricao ?? null,
        status: "ABERTO",
        confirmacaoMusico: false,
        confirmacaoContratante: false,
      };
      events.set(event.id, event);
      enderecos.set(event.id, endereco);
      return event;
    },
    updateEvent: async (id, { endereco, ...data }) => {
      const current = events.get(id)!;
      const updated = { ...current, ...data, imagemUrl: data.imagemUrl ?? current.imagemUrl, descricao: data.descricao ?? null };
      events.set(id, updated);
      enderecos.set(id, endereco);
      return updated;
    },
    deleteEvent: async (id) => void events.delete(id),
    setConfirmation: async (eventId, party) => {
      const event = events.get(eventId)!;
      if (party === "musico") event.confirmacaoMusico = true;
      else event.confirmacaoContratante = true;
      // Mesmo comportamento da trigger events_conclude_when_both_confirm.
      if (event.status === "CONTRATADO" && event.confirmacaoMusico && event.confirmacaoContratante) event.status = "CONCLUIDO";
      return event;
    },
    concludeEvent: async (eventId) => {
      const event = events.get(eventId)!;
      event.confirmacaoMusico = event.confirmacaoContratante = true;
      if (event.status === "CONTRATADO") event.status = "CONCLUIDO";
      return event;
    },
    cancelEvent: async (eventId) => void (events.get(eventId)!.status = "CANCELADO"),
    // Mesmo comportamento da função reopen_event.
    reopenEvent: async (eventId) => {
      const event = events.get(eventId)!;
      for (const [id, candidate] of candidates) {
        if (candidate.eventId !== eventId) continue;
        if (candidate.musicianId === event.musicoContratadoId) candidates.delete(id);
        else candidate.status = "PENDENTE";
      }
      Object.assign(event, { status: "ABERTO", musicoContratadoId: null, confirmacaoMusico: false, confirmacaoContratante: false });
    },
    distanceKm: async (eventId, musicianId) => {
      const event = events.get(eventId)!;
      const musician = accounts.get(musicianId)!;
      const same = event.uf === musician.uf && event.cidade.toLowerCase() === (musician.cidade ?? "").toLowerCase();
      return same ? 0 : (distances.get(`${event.uf}/${event.cidade.toLowerCase()}`) ?? null);
    },
    hasOngoingHiring: async (userId) =>
      [...events.values()].some((e) => e.status === "CONTRATADO" && (e.contractorId === userId || e.musicoContratadoId === userId)),
    findCandidate: async (eventId, musicianId) =>
      [...candidates.values()].find((c) => c.eventId === eventId && c.musicianId === musicianId) ?? null,
    findCandidateById: async (id) => candidates.get(id) ?? null,
    insertCandidate: async (eventId, musicianId) => {
      if ([...candidates.values()].some((c) => c.eventId === eventId && c.musicianId === musicianId)) {
        throw new AppError(409, "JA_INSCRITO", "Você já se inscreveu neste evento.");
      }
      const candidate: CandidateRecord = { id: nextId("cand"), eventId, musicianId, status: "PENDENTE" };
      candidates.set(candidate.id, candidate);
      return candidate;
    },
    deleteCandidate: async (id) => void candidates.delete(id),
    insertReview: async (review) => {
      if (reviews.some((r) => r.eventId === review.eventId && r.authorId === review.authorId)) {
        throw new AppError(409, "JA_AVALIADO", "Você já avaliou este evento.");
      }
      reviews.push(review);
    },
    hasReviewed: async (eventId, authorId) => reviews.some((r) => r.eventId === eventId && r.authorId === authorId),
  };

  const paymentStore: PaymentStore = {
    findPendingPayment: async (eventId) => [...payments.values()].find((p) => p.eventId === eventId && p.status === "PENDENTE") ?? null,
    findLatestPayment: async (eventId) =>
      [...payments.values()].filter((p) => p.eventId === eventId).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
    findPaymentByAsaasId: async (asaasPaymentId) => [...payments.values()].find((p) => p.asaasPaymentId === asaasPaymentId) ?? null,
    findPaymentById: async (id) => payments.get(id) ?? null,
    findPaymentByTransferId: async (transferId) => [...payments.values()].find((p) => p.asaasTransferId === transferId) ?? null,
    insertPayment: async (data) => {
      if ([...payments.values()].some((p) => p.eventId === data.eventId && p.status === "PENDENTE")) {
        throw new AppError(409, "COBRANCA_EM_ANDAMENTO", "Já existe uma cobrança em andamento para este evento.");
      }
      const payment = {
        ...data,
        expiraEm: new Date(databaseTime.getTime() + COBRANCA_VALIDADE_MS),
        id: nextId("p"),
        status: "PENDENTE" as const,
        valorCache: Math.round((data.valor - data.valorComissao) * 100) / 100,
        repasseStatus: null,
        refundStatus: null,
        refundAction: null,
        latePaymentDetectedAt: null,
        createdAt: sequence,
      };
      payments.set(payment.id, payment);
      return payment;
    },
    expirePayment: async (id) => {
      const payment = payments.get(id)!;
      if (payment.status !== "PENDENTE" || payment.expiraEm > databaseTime) return false;
      payment.status = "EXPIRADO";
      return true;
    },
    setPaymentStatus: async (id, status) => {
      const payment = payments.get(id)!;
      if ((status === "EXPIRADO" || status === "CANCELADO") && payment.status !== "PENDENTE") return;
      payment.status = status;
    },
    claimRefund: async (id, action) => {
      const payment = payments.get(id)!;
      if (!((payment.status === "PAGO" && (payment.repasseStatus === "RETIDO" || payment.repasseStatus === "FALHOU")) || (action === "NENHUMA" && (payment.status === "PENDENTE" || payment.status === "EXPIRADO" || payment.status === "CANCELADO"))) || (payment.refundStatus !== null && payment.refundStatus !== "NEGADO")) return false;
      payment.refundStatus = "PROCESSANDO";
      payment.refundAction = action;
      return true;
    },
    setRefundStatus: async (id, status) => {
      const payment = payments.get(id)!;
      if (payment.refundStatus === "PROCESSANDO") payment.refundStatus = status;
    },
    finalizeRefund: async (id) => {
      const payment = payments.get(id)!;
      if (payment.status === "ESTORNADO") return "JA_PROCESSADO";
      if (payment.status !== "PAGO" && payment.refundAction !== "NENHUMA") throw new Error("pagamento nao esta elegivel para estorno");
      const payoutConflict = payment.repasseStatus === "PROCESSANDO" || payment.repasseStatus === "REPASSADO";
      const event = payment.eventId ? events.get(payment.eventId) : null;
      if (event?.status === "CONTRATADO" && payment.refundAction !== "NENHUMA") {
        if (payment.refundAction === "REABRIR" && !payoutConflict) await eventStore.reopenEvent(event.id);
        else await eventStore.cancelEvent(event.id);
      }
      payment.status = "ESTORNADO";
      payment.refundStatus = "CONFIRMADO";
      if (!payoutConflict) payment.repasseStatus = null;
      return payoutConflict ? "REPASSE_CONFLITANTE" : "CONFIRMADO";
    },
    // Mesmo comportamento da função confirm_asaas_payment.
    confirmPayment: async (asaasPaymentId) => {
      const payment = [...payments.values()].find((p) => p.asaasPaymentId === asaasPaymentId);
      if (!payment) return "PAGAMENTO_NAO_ENCONTRADO";
      if (payment.status === "PAGO") return "JA_PROCESSADO";
      if (payment.status === "EXPIRADO" || (payment.status === "PENDENTE" && payment.expiraEm <= databaseTime)) {
        payment.status = "EXPIRADO";
        payment.latePaymentDetectedAt ??= databaseTime;
        const expiredEvent = payment.eventId ? events.get(payment.eventId) : null;
        return expiredEvent?.status === "ABERTO" ? "PAGAMENTO_EXPIRADO" : "EVENTO_INDISPONIVEL";
      }
      if (payment.status !== "PENDENTE") return "EVENTO_INDISPONIVEL";
      const event = payment.eventId ? events.get(payment.eventId) : undefined;
      const chosen = payment.candidateId ? candidates.get(payment.candidateId) : undefined;
      if (!event || event.status !== "ABERTO" || !chosen) return "EVENTO_INDISPONIVEL";
      payment.status = "PAGO";
      payment.repasseStatus = "RETIDO";
      event.status = "CONTRATADO";
      event.musicoContratadoId = chosen.musicianId;
      for (const candidate of candidates.values()) {
        if (candidate.eventId === event.id) candidate.status = candidate.id === chosen.id ? "APROVADO" : "RECUSADO";
      }
      return "CONTRATADO";
    },
    markLatePaymentDetected: async (id) => {
      const payment = payments.get(id);
      if (payment && payment.status !== "PAGO") payment.latePaymentDetectedAt ??= databaseTime;
    },    findPayoutIntentByPaymentId: async (paymentId) =>
      [...payoutIntents.values()].find((intent) => intent.paymentId === paymentId) ?? null,
    findPayoutIntentById: async (id) => payoutIntents.get(id) ?? null,
    findPayoutIntentByTransferId: async (transferId) =>
      [...payoutIntents.values()].find((intent) => intent.asaasTransferId === transferId) ?? null,
    reservePayoutIntent: async (data) => {
      const payment = payments.get(data.paymentId);
      const event = events.get(data.eventId);
      if (!payment || payment.status !== "PAGO" || payment.refundStatus !== null ||
          (payment.repasseStatus !== "RETIDO" && payment.repasseStatus !== "FALHOU") ||
          payment.eventId !== data.eventId || payment.valorCache !== data.amount ||
          event?.musicoContratadoId !== data.musicianId ||
          [...payoutIntents.values()].some((intent) => intent.paymentId === data.paymentId)) return null;
      const id = "00000000-0000-4000-8000-" + String(sequence++).padStart(12, "0");
      const intent: PayoutIntentRecord = {
        id,
        paymentId: data.paymentId,
        eventId: data.eventId,
        musicianId: data.musicianId,
        amount: data.amount,
        pixKey: data.pixKey,
        pixKeyType: data.pixKeyType,
        state: "RESERVADO",
        asaasTransferId: null,
        createdAt: NOW,
      };
      payoutIntents.set(id, intent);
      payment.repasseStatus = "PROCESSANDO";
      return intent;
    },
    markPayoutSent: async (id) => {
      const intent = payoutIntents.get(id)!;
      if (intent.state !== "RESERVADO") return false;
      intent.state = "ENVIADO";
      return true;
    },
    markPayoutUnknown: async (id) => {
      const intent = payoutIntents.get(id)!;
      if (intent && (intent.state === "RESERVADO" || intent.state === "ENVIADO" || intent.state === "PENDENTE")) {
        intent.state = "CONCILIACAO";
      }
    },
    linkPayoutTransfer: async (id, transferId) => {
      const intent = payoutIntents.get(id)!;
      if (intent.asaasTransferId === transferId) return true;
      if (intent.asaasTransferId || [...payoutIntents.values()].some((other) => other.id !== id && other.asaasTransferId === transferId)) {
        if (intent.state !== "CONCLUIDO" && intent.state !== "FALHOU") intent.state = "CONCILIACAO";
        return false;
      }
      intent.asaasTransferId = transferId;
      payments.get(intent.paymentId)!.asaasTransferId = transferId;
      return true;
    },
    applyPayoutTransfer: async (id, remote) => {
      const intent = payoutIntents.get(id);
      if (!intent) return "DESCONHECIDO";
      const payment = payments.get(intent.paymentId)!;
      if (!intent.asaasTransferId && [...payoutIntents.values()].some((other) => other.id !== id && other.asaasTransferId === remote.id)) {
        if (intent.state !== "CONCLUIDO" && intent.state !== "FALHOU") intent.state = "CONCILIACAO";
        return "CONCILIACAO";
      }
      if (!intent.asaasTransferId) {
        intent.asaasTransferId = remote.id;
        payment.asaasTransferId = remote.id;
      }
      const valid = intent.asaasTransferId === remote.id &&
        remote.externalReference === intent.id &&
        remote.value === intent.amount &&
        remote.operationType === "PIX" &&
        remote.pixAddressKey === intent.pixKey &&
        intent.pixKey !== null &&
        payment.status === "PAGO" &&
        payment.refundStatus === null &&
        ["PENDING", "IN_BANK_PROCESSING", "BLOCKED", "DONE", "FAILED", "CANCELLED"].includes(remote.status);
      if (!valid || (intent.state === "CONCLUIDO" && remote.status !== "DONE") ||
          (intent.state === "FALHOU" && remote.status !== "FAILED" && remote.status !== "CANCELLED")) {
        if (intent.state !== "CONCLUIDO" && intent.state !== "FALHOU") intent.state = "CONCILIACAO";
        if (payment.repasseStatus === "FALHOU") payment.repasseStatus = "PROCESSANDO";
        return "CONCILIACAO";
      }
      if (intent.state === "CONCLUIDO" || intent.state === "FALHOU") return intent.state;
      if (remote.status === "DONE") {
        intent.state = "CONCLUIDO";
        payment.repasseStatus = "REPASSADO";
      } else if (remote.status === "FAILED" || remote.status === "CANCELLED") {
        intent.state = "FALHOU";
        payment.repasseStatus = "FALHOU";
      } else {
        intent.state = "PENDENTE";
        payment.repasseStatus = "PROCESSANDO";
      }
      return intent.state;
    },
    markPayoutPreflightFailure: async (id) => {
      const payment = payments.get(id)!;
      if (payment.status === "PAGO" && payment.refundStatus === null &&
          (payment.repasseStatus === "RETIDO" || payment.repasseStatus === "FALHOU")) {
        payment.repasseStatus = "FALHOU";
      }
    },
    getAsaasCustomerId: async (contractorId) => customers.get(contractorId) ?? null,
    setAsaasCustomerId: async (contractorId, customerId) => void customers.set(contractorId, customerId),
    webhookEventExists: async (id) => webhookEvents.has(id),
    recordWebhookEvent: async (event) => void webhookEvents.add(event.id),
  };

  const asaas: AsaasGateway = {
    getCustomer: async (id) => {
      const customer = asaasCustomers.get(id);
      return customer ? { id, ...customer } : null;
    },
    findCustomerByReference: async (reference, cpfCnpj) => {
      const found = [...asaasCustomers].find(([, customer]) => customer.externalReference === reference && customer.cpfCnpj === cpfCnpj);
      return found ? { id: found[0], ...found[1] } : null;
    },
    createCustomer: async (customer) => {
      asaasCalls.createCustomer++;
      const id = nextId("cus_");
      asaasCustomers.set(id, { cpfCnpj: customer.cpfCnpj, externalReference: customer.externalReference });
      return id;
    },
    findPendingPixCharge: async (reference, customer, value) => {
      const matches = [...asaasCharges].filter(([, charge]) => charge.externalReference === reference &&
        charge.customer === customer && charge.status === "PENDING");
      if (matches.length > 1 || matches.some(([, charge]) => charge.value !== value)) {
        throw new AppError(409, "COBRANCA_CONCILIACAO", "Cobrança em verificação.");
      }
      return matches[0]?.[0] ?? null;
    },
    createPixCharge: async (charge) => {
      asaasCalls.createPixCharge.push({ value: charge.value, customer: charge.customer });
      const id = nextId("pay_");
      asaasCharges.set(id, { status: "PENDING", value: charge.value, customer: charge.customer, externalReference: charge.externalReference });
      if (failures.chargeAfterCreate) throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "resposta perdida após criação");
      return id;
    },
    getPixQrCode: async (paymentId) => ({ payload: `pix-${paymentId}`, encodedImage: "base64" }),
    getPayment: async (paymentId) => asaasCharges.get(paymentId) ?? null,
    cancelCharge: async (paymentId) => {
      if (failures.cancel) throw new AppError(502, "ASAAS_INDISPONIVEL", "falha simulada no cancelamento");
      asaasCalls.cancelCharge.push(paymentId);
      asaasCharges.delete(paymentId);
    },
    refundPayment: async (paymentId) => {
      if (failures.refund) throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "falha simulada no estorno");
      asaasCalls.refundPayment.push(paymentId);
      asaasCharges.set(paymentId, { ...asaasCharges.get(paymentId)!, status: "REFUNDED" });
    },
    getTransfer: async (id) => {
      if (failures.transferLookup) throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "falha simulada na consulta da transferência");
      return asaasTransfers.get(id) ?? null;
    },
    findTransfersByReference: async (reference) => {
      if (failures.transferQuery) throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "falha simulada na listagem");
      return {
        matches: [...asaasTransfers.values()].filter((transfer) => transfer.externalReference === reference).map((transfer) => transfer.id),
        complete: true,
      };
    },
    transferPix: async (transfer) => {
      if (failures.transfer) throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "falha simulada antes do envio");
      const id = nextId("tra_");
      const remote: AsaasTransferRecord = {
        id,
        status: "PENDING",
        externalReference: transfer.externalReference,
        value: transfer.value,
        operationType: "PIX",
        pixAddressKey: transfer.pixAddressKey,
      };
      asaasTransfers.set(id, remote);
      asaasCalls.transferPix.push({
        value: transfer.value,
        pixAddressKey: transfer.pixAddressKey,
        pixAddressKeyType: transfer.pixAddressKeyType,
        externalReference: transfer.externalReference,
      });
      if (failures.transferAfterCreate) throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "resposta perdida após aceite");
      return { id, status: remote.status };
    },
  };

  return {
    accounts,
    asaasCustomers,
    events,
    enderecos,
    candidates,
    payments,
    payoutIntents,
    asaasTransfers,
    reviews,
    images,
    webhookEvents,
    asaasCharges,
    asaasCalls,
    failures,
    sent,
    setDatabaseTime: (time: Date) => { databaseTime = time; },
    stores: { accounts: accountStore, events: eventStore, payments: paymentStore, images: imageStore, asaas, mailer },
    /** Atalho: evento aberto de c1, compatível com os músicos m1 e m2. */
    seedEvent(overrides: Partial<EventRecord> = {}): EventRecord {
      const event: EventRecord = {
        id: nextId("e"),
        contractorId: "c1",
        musicoContratadoId: null,
        titulo: "Noite de rock",
        tipoEvento: "Bar e restaurante",
        inicio: hoursFromNow(72),
        duracaoMinutos: 120,
        uf: "PR",
        cidade: "Cascavel",
        estilosMusicais: ["Rock"],
        formacao: "Indiferente",
        somDisponivel: false,
        cache: 500,
        imagemUrl: "https://cdn.test/storage/v1/object/public/event-banners/c1/banner.png",
        descricao: null,
        status: "ABERTO",
        confirmacaoMusico: false,
        confirmacaoContratante: false,
        ...overrides,
      };
      events.set(event.id, event);
      enderecos.set(event.id, "Rua das Flores, 123 - Centro");
      return event;
    },
    seedCandidate(eventId: string, musicianId: string, status: CandidateRecord["status"] = "PENDENTE"): CandidateRecord {
      const candidate: CandidateRecord = { id: nextId("cand"), eventId, musicianId, status };
      candidates.set(candidate.id, candidate);
      return candidate;
    },
  };
}

/** Marca na "Asaas" que a cobrança foi paga, como aconteceria após o Pix do contratante. */
export function payAtAsaas(world: ReturnType<typeof memoryWorld>, asaasPaymentId: string): void {
  const charge = world.asaasCharges.get(asaasPaymentId)!;
  world.asaasCharges.set(asaasPaymentId, { ...charge, status: "RECEIVED" });
}
