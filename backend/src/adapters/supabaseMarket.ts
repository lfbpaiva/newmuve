import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../domain/errors.ts";
import type { CandidateRecord, EventInput, EventRecord, PaymentRecord } from "../domain/event.ts";
import type { ConfirmPaymentResult, EventStore, PaymentStore } from "../services/ports.ts";

// Acesso a dados de eventos, candidaturas, avaliações e pagamentos.

const UNIQUE_VIOLATION = "23505";

// Linha crua devolvida pelo PostgREST.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const toEvent = (row: Row): EventRecord => ({
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

const toCandidate = (row: Row): CandidateRecord => ({
  id: row.id,
  eventId: row.event_id,
  musicianId: row.musician_id,
  status: row.status,
});

const toPayment = (row: Row): PaymentRecord => ({
  id: row.id,
  eventId: row.event_id,
  candidateId: row.candidate_id,
  asaasPaymentId: row.asaas_payment_id,
  valor: Number(row.valor),
  valorComissao: Number(row.valor_comissao),
  valorCache: Number(row.valor_cache),
  status: row.status,
  repasseStatus: row.repasse_status,
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
  async function updateReturning(id: string, changes: Row): Promise<EventRecord> {
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
        // O evento não pode existir sem endereço.
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

    // A trigger events_conclude_when_both_confirm muda o status para CONCLUIDO.
    concludeEvent: (eventId) => updateReturning(eventId, { confirmacao_musico: true, confirmacao_contratante: true }),

    async cancelEvent(eventId) {
      const { error } = await admin.from("events").update({ status: "CANCELADO" }).eq("id", eventId);
      if (error) throw error;
    },

    async reopenEvent(eventId) {
      const { error } = await admin.rpc("reopen_event", { p_event_id: eventId });
      if (error) throw error;
    },

    async hasOngoingHiring(userId) {
      const { data, error } = await admin
        .from("events")
        .select("id")
        .eq("status", "CONTRATADO")
        .or(`contractor_id.eq.${userId},musico_contratado_id.eq.${userId}`)
        .limit(1);
      if (error) throw error;
      return data.length > 0;
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

    async insertCandidate(eventId, musicianId) {
      const { data, error } = await admin.from("event_candidates").insert({ event_id: eventId, musician_id: musicianId }).select().single();
      if (error?.code === UNIQUE_VIOLATION) throw new AppError(409, "JA_INSCRITO", "Você já se inscreveu neste evento.");
      if (error) throw error;
      return toCandidate(data);
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
      const { error } = await admin.from("payments").update({ status }).eq("id", id);
      if (error) throw error;
    },

    async confirmPayment(asaasPaymentId) {
      const { data, error } = await admin.rpc("confirm_asaas_payment", { p_asaas_payment_id: asaasPaymentId });
      if (error) throw error;
      return data as ConfirmPaymentResult;
    },

    // Um único UPDATE condicional: só uma execução concorrente recebe a linha de volta.
    async claimPayout(id) {
      const { data, error } = await admin
        .from("payments")
        .update({ repasse_status: "PROCESSANDO" })
        .eq("id", id)
        .eq("status", "PAGO")
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
