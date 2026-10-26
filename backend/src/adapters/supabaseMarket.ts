import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../domain/errors.ts";
import type { CandidateRecord, CandidateStatus, EventInput, EventRecord, EventStatus, MessageRecord, PaymentRecord, PaymentStatus, PayoutStatus, RefundAction, RefundStatus } from "../domain/event.ts";
import type { Inbox } from "../services/notifications.ts";
import type { ConfirmPaymentResult, EventStore, PaymentStore } from "../services/ports.ts";

const UNIQUE_VIOLATION = "23505";

interface EventRow {
  id: string;
  contractor_id: string;
  musico_contratado_id: string | null;
  titulo: string;
  tipo_evento: string;
  inicio: string;
  duracao_minutos: number;
  uf: string;
  cidade: string;
  estilos_musicais: string[];
  formacao: string;
  som_disponivel: boolean;
  cache: number | string;
  imagem_url: string;
  descricao: string | null;
  status: EventStatus;
  confirmacao_musico: boolean;
  confirmacao_contratante: boolean;
}

interface CandidateRow {
  id: string;
  event_id: string;
  musician_id: string;
  status: CandidateStatus;
  valor_proposto: number | string | null;
}

interface MessageRow {
  id: string;
  candidate_id: string;
  author_id: string;
  texto: string;
  created_at: string;
}

interface PaymentRow {
  id: string;
  event_id: string | null;
  candidate_id: string | null;
  asaas_payment_id: string;
  valor: number | string;
  valor_comissao: number | string;
  valor_cache: number | string;
  status: PaymentStatus;
  repasse_status: PayoutStatus | null;
  repasse_asaas_id: string | null;
  refund_status: RefundStatus | null;
  refund_action: RefundAction | null;
  refund_requested_at: string | null;
  pix_copia_cola: string | null;
  pix_qr_code: string | null;
  expira_em: string;
}

const toEvent = (row: EventRow): EventRecord => ({
  id: row.id,
  contractorId: row.contractor_id,
  musicoContratadoId: row.musico_contratado_id,
  titulo: row.titulo,
  tipoEvento: row.tipo_evento,
  inicio: new Date(row.inicio),
  duracaoMinutos: row.duracao_minutos,
  uf: row.uf,
  cidade: row.cidade,
  estilosMusicais: row.estilos_musicais,
  formacao: row.formacao,
  somDisponivel: row.som_disponivel,
  cache: Number(row.cache),
  imagemUrl: row.imagem_url,
  descricao: row.descricao,
  status: row.status,
  confirmacaoMusico: row.confirmacao_musico,
  confirmacaoContratante: row.confirmacao_contratante,
});

const toCandidate = (row: CandidateRow): CandidateRecord => ({
  id: row.id,
  eventId: row.event_id,
  musicianId: row.musician_id,
  status: row.status,
  valorProposto: row.valor_proposto === null ? null : Number(row.valor_proposto),
});

const toMessage = (row: MessageRow): MessageRecord => ({
  id: row.id,
  candidateId: row.candidate_id,
  authorId: row.author_id,
  texto: row.texto,
  createdAt: new Date(row.created_at),
});

const toPayment = (row: PaymentRow): PaymentRecord => ({
  id: row.id,
  eventId: row.event_id,
  candidateId: row.candidate_id,
  asaasPaymentId: row.asaas_payment_id,
  valor: Number(row.valor),
  valorComissao: Number(row.valor_comissao),
  valorCache: Number(row.valor_cache),
  status: row.status,
  repasseStatus: row.repasse_status,
  asaasTransferId: row.repasse_asaas_id ?? null,
  refundStatus: row.refund_status ?? null,
  refundAction: row.refund_action ?? null,
  refundRequestedAt: row.refund_requested_at ? new Date(row.refund_requested_at) : null,
  pixCopiaCola: row.pix_copia_cola,
  pixQrCode: row.pix_qr_code,
  expiraEm: new Date(row.expira_em),
});

const eventColumns = (data: EventInput & { imagemUrl?: string }) => ({
  titulo: data.titulo,
  tipo_evento: data.tipoEvento,
  inicio: data.inicio.toISOString(),
  duracao_minutos: data.duracaoMinutos,
  uf: data.uf,
  cidade: data.cidade,
  estilos_musicais: data.estilosMusicais,
  formacao: data.formacao,
  som_disponivel: data.somDisponivel,
  cache: data.cache,
  descricao: data.descricao || null,
  ...(data.imagemUrl ? { imagem_url: data.imagemUrl } : {}),
});

export function createEventStore(admin: SupabaseClient): EventStore {
  async function updateReturning(id: string, changes: Record<string, unknown>): Promise<EventRecord> {
    const { data, error } = await admin.from("events").update(changes).eq("id", id).select().single();
    if (error) throw error;
    return toEvent(data);
  }

  return {
    async findEvent(id) {
      const { data, error } = await admin.from("events").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data && toEvent(data);
    },

    async findEndereco(eventId) {
      const { data, error } = await admin.from("event_locations").select("endereco").eq("event_id", eventId).maybeSingle();
      if (error) throw error;
      return data?.endereco ?? null;
    },

    async insertEvent(contractorId, input) {
      const { data, error } = await admin.from("events").insert({ contractor_id: contractorId, ...eventColumns(input) }).select().single();
      if (error) throw error;
      const location = await admin.from("event_locations").insert({ event_id: data.id, endereco: input.endereco });
      if (location.error) {
        await admin.from("events").delete().eq("id", data.id);
        throw location.error;
      }
      return toEvent(data);
    },

    async updateEvent(id, input) {
      const location = await admin.from("event_locations").upsert({ event_id: id, endereco: input.endereco });
      if (location.error) throw location.error;
      return updateReturning(id, eventColumns(input));
    },

    async deleteEvent(id) {
      const { error } = await admin.from("events").delete().eq("id", id);
      if (error) throw error;
    },

    setConfirmation: (eventId, party) =>
      updateReturning(eventId, { [party === "musico" ? "confirmacao_musico" : "confirmacao_contratante"]: true }),

    concludeEvent: (eventId) => updateReturning(eventId, { confirmacao_musico: true, confirmacao_contratante: true }),

    async cancelEvent(eventId) {
      const { error } = await admin.from("events").update({ status: "CANCELADO" }).eq("id", eventId);
      if (error) throw error;
    },

    async hasOngoingHiring(userId) {
      const { data, error } = await admin.rpc("has_open_obligations", { p_user_id: userId });
      if (error) throw error;
      return data === true;
    },

    async distanceKm(eventId, musicianId) {
      const { data, error } = await admin.rpc("event_distance_km", { p_event_id: eventId, p_musician_id: musicianId });
      if (error) throw error;
      return data === null || data === undefined ? null : Number(data);
    },

    async findCandidate(eventId, musicianId) {
      const { data, error } = await admin.from("event_candidates").select("*").eq("event_id", eventId).eq("musician_id", musicianId).maybeSingle();
      if (error) throw error;
      return data && toCandidate(data);
    },

    async findCandidateById(id) {
      const { data, error } = await admin.from("event_candidates").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data && toCandidate(data);
    },

    async listCandidates(eventId) {
      const { data, error } = await admin.from("event_candidates").select("*").eq("event_id", eventId);
      if (error) throw error;
      return data.map(toCandidate);
    },

    async declineCandidate(id) {
      const { data, error } = await admin.from("event_candidates").update({ status: "RECUSADO" }).eq("id", id).eq("status", "PENDENTE").select("id");
      if (error) throw error;
      return data.length > 0;
    },

    async insertCandidate(eventId, musicianId, valorProposto) {
      const { data, error } = await admin.from("event_candidates").insert({ event_id: eventId, musician_id: musicianId, valor_proposto: valorProposto }).select().single();
      if (error?.code === UNIQUE_VIOLATION) throw new AppError(409, "JA_INSCRITO", "Você já se inscreveu neste evento.");
      if (error) throw error;
      return toCandidate(data);
    },

    async updateCandidateProposal(id, valorProposto) {
      const { error } = await admin.from("event_candidates").update({ valor_proposto: valorProposto }).eq("id", id).eq("status", "PENDENTE");
      if (error) throw error;
    },

    async insertMessage(message) {
      const { data, error } = await admin
        .from("candidate_messages")
        .insert({ candidate_id: message.candidateId, author_id: message.authorId, texto: message.texto })
        .select()
        .single();
      if (error) throw error;
      return toMessage(data);
    },

    async deleteCandidate(id) {
      const { error } = await admin.from("event_candidates").delete().eq("id", id);
      if (error) throw error;
    },

    async insertReview(review) {
      const { error } = await admin.from("reviews").insert({
        event_id: review.eventId,
        author_id: review.authorId,
        reviewed_id: review.reviewedId,
        rating: review.rating,
        comment: review.comment ?? null,
      });
      if (error?.code === UNIQUE_VIOLATION) throw new AppError(409, "JA_AVALIADO", "Você já avaliou este evento.");
      if (error) throw error;
    },

    async hasReviewed(eventId, authorId) {
      const { data, error } = await admin.from("reviews").select("id").eq("event_id", eventId).eq("author_id", authorId).maybeSingle();
      if (error) throw error;
      return data !== null;
    },
  };
}

export function createPaymentStore(admin: SupabaseClient): PaymentStore {
  async function findOne(column: string, value: string): Promise<PaymentRecord | null> {
    const { data, error } = await admin.from("payments").select("*").eq(column, value).maybeSingle();
    if (error) throw error;
    return data && toPayment(data);
  }

  return {
    async findPendingPayment(eventId) {
      const { data, error } = await admin.from("payments").select("*").eq("event_id", eventId).eq("status", "PENDENTE").maybeSingle();
      if (error) throw error;
      return data && toPayment(data);
    },

    async findLatestPayment(eventId) {
      const { data, error } = await admin
        .from("payments")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data && toPayment(data);
    },

    findPaymentByAsaasId: (asaasPaymentId) => findOne("asaas_payment_id", asaasPaymentId),
    findPaymentByTransferId: (asaasTransferId) => findOne("repasse_asaas_id", asaasTransferId),

    async insertPayment(payment) {
      const { data, error } = await admin
        .from("payments")
        .insert({
          event_id: payment.eventId,
          candidate_id: payment.candidateId,
          contractor_id: payment.contractorId,
          asaas_payment_id: payment.asaasPaymentId,
          valor: payment.valor,
          valor_comissao: payment.valorComissao,
          pix_copia_cola: payment.pixCopiaCola,
          pix_qr_code: payment.pixQrCode,
          expira_em: payment.expiraEm.toISOString(),
        })
        .select()
        .single();
      if (error?.code === UNIQUE_VIOLATION) {
        throw new AppError(409, "COBRANCA_EM_ANDAMENTO", "Já existe uma cobrança em andamento para este evento.");
      }
      if (error) throw error;
      return toPayment(data);
    },

    async setPaymentStatus(id, status) {
      let query = admin.from("payments").update({ status }).eq("id", id);
      if (status === "EXPIRADO" || status === "CANCELADO") query = query.eq("status", "PENDENTE");
      const { error } = await query;
      if (error) throw error;
    },

    async claimRefund(id, action) {
      const { data, error } = await admin.rpc("claim_asaas_refund", { p_payment_id: id, p_refund_action: action });
      if (error) throw error;
      return data === true;
    },

    async setRefundStatus(id, status) {
      const { error } = await admin.from("payments").update({ refund_status: status }).eq("id", id).eq("refund_status", "PROCESSANDO");
      if (error) throw error;
    },

    async releaseRefund(id, previous) {
      const { error } = await admin
        .from("payments")
        .update({ refund_status: previous.refundStatus, refund_action: previous.refundAction })
        .eq("id", id)
        .eq("refund_status", "PROCESSANDO");
      if (error) throw error;
    },

    async finalizeRefund(id) {
      const { data, error } = await admin.rpc("finalize_asaas_refund", { p_payment_id: id });
      if (error) throw error;
      return data as "CONFIRMADO" | "JA_PROCESSADO" | "REPASSE_CONFLITANTE";
    },

    async confirmPayment(asaasPaymentId) {
      const { data, error } = await admin.rpc("confirm_asaas_payment", { p_asaas_payment_id: asaasPaymentId });
      if (error) throw error;
      return data as ConfirmPaymentResult;
    },

    async claimPayout(id) {
      const { data, error } = await admin
        .from("payments")
        .update({ repasse_status: "PROCESSANDO" })
        .eq("id", id)
        .eq("status", "PAGO")
        .or("refund_status.is.null,refund_status.neq.PROCESSANDO")
        .in("repasse_status", ["RETIDO", "FALHOU"])
        .select("id");
      if (error) throw error;
      return data.length === 1;
    },

    async setPayout(id, payout) {
      const { error } = await admin
        .from("payments")
        .update({
          repasse_status: payout.status,
          ...(payout.asaasTransferId ? { repasse_asaas_id: payout.asaasTransferId } : {}),
          ...(payout.status === "REPASSADO" ? { repassado_em: new Date().toISOString() } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },

    async getAsaasCustomerId(contractorId) {
      const { data, error } = await admin.from("contractor_profiles").select("asaas_customer_id").eq("user_id", contractorId).maybeSingle();
      if (error) throw error;
      return data?.asaas_customer_id ?? null;
    },

    async setAsaasCustomerId(contractorId, customerId) {
      const { error } = await admin.from("contractor_profiles").update({ asaas_customer_id: customerId }).eq("user_id", contractorId);
      if (error) throw error;
    },

    async webhookEventExists(id) {
      const { data, error } = await admin.from("asaas_webhook_events").select("id").eq("id", id).maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    async recordWebhookEvent(event) {
      const { error } = await admin
        .from("asaas_webhook_events")
        .upsert({ id: event.id, tipo: event.tipo, asaas_payment_id: event.asaasPaymentId ?? null, payload: event.payload });
      if (error) throw error;
    },
  };
}

export function createInbox(admin: SupabaseClient): Inbox {
  return {
    async add(notification) {
      const { error } = await admin.from("notifications").insert({
        user_id: notification.userId,
        titulo: notification.titulo,
        texto: notification.texto,
        link: notification.link,
      });
      if (error) throw error;
    },

    async markAllRead(userId) {
      const { error } = await admin.from("notifications").update({ lida: true }).eq("user_id", userId).eq("lida", false);
      if (error) throw error;
    },
  };
}
