import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../domain/errors.ts";
<<<<<<< HEAD
import type { CandidateRecord, EventInput, EventRecord, PaymentRecord } from "../domain/event.ts";
import type { ConfirmPaymentResult, EventStore, PaymentStore, PayoutIntentRecord, PayoutIntentState } from "../services/ports.ts";
=======
import type { CandidateRecord, CandidateStatus, DisputeRecord, EventInput, EventRecord, EventStatus, MessageRecord, MotivoRecusa, StatusProposta, PaymentRecord, PaymentStatus, PayoutStatus, RefundAction, RefundStatus } from "../domain/event.ts";
import type { Inbox } from "../services/notifications.ts";
import type { ConfirmPaymentResult, EventStore, PaymentStore } from "../services/ports.ts";
>>>>>>> upstream/main

const UNIQUE_VIOLATION = "23505";

interface EventRow {
  id: string;
  contractor_id: string | null;
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
  inscricoes_encerradas: boolean;
  created_at: string;
}

interface CandidateRow {
  id: string;
  event_id: string;
  musician_id: string;
  status: CandidateStatus;
  valor_proposto: number | string | null;
  motivo_recusa: MotivoRecusa | null;
}

interface MessageRow {
  id: string;
  candidate_id: string;
  author_id: string;
  texto: string;
  tipo: "TEXTO" | "PROPOSTA";
  valor: number | string | null;
  status_proposta: StatusProposta | null;
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
  multa_descontada: number | string;
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
  inscricoesEncerradas: row.inscricoes_encerradas,
  createdAt: new Date(row.created_at),
});

const toCandidate = (row: CandidateRow): CandidateRecord => ({
  id: row.id,
  eventId: row.event_id,
  musicianId: row.musician_id,
  status: row.status,
  valorProposto: row.valor_proposto === null ? null : Number(row.valor_proposto),
  motivoRecusa: row.motivo_recusa ?? null,
});

interface DisputeRow {
  id: string;
  event_id: string;
  aberta_por: string | null;
  motivo: string;
  status: "ABERTA" | "RESOLVIDA";
  decisao: DisputeRecord["decisao"];
  observacao: string | null;
  created_at: string;
}

const toDispute = (row: DisputeRow): DisputeRecord => ({
  id: row.id,
  eventId: row.event_id,
  abertaPor: row.aberta_por,
  motivo: row.motivo,
  status: row.status,
  decisao: row.decisao,
  observacao: row.observacao,
  createdAt: new Date(row.created_at),
});

const toMessage = (row: MessageRow): MessageRecord => ({
  id: row.id,
  candidateId: row.candidate_id,
  authorId: row.author_id,
  texto: row.texto,
  tipo: row.tipo,
  valor: row.valor === null ? null : Number(row.valor),
  statusProposta: row.status_proposta,
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
<<<<<<< HEAD
  refundStatus: row.refund_status ?? null,
  refundAction: row.refund_action ?? null,
  latePaymentDetectedAt: row.late_payment_detected_at ? new Date(row.late_payment_detected_at) : null,
=======
  asaasTransferId: row.repasse_asaas_id ?? null,
  multaDescontada: Number(row.multa_descontada ?? 0),
  refundStatus: row.refund_status ?? null,
  refundAction: row.refund_action ?? null,
  refundRequestedAt: row.refund_requested_at ? new Date(row.refund_requested_at) : null,
>>>>>>> upstream/main
  pixCopiaCola: row.pix_copia_cola,
  pixQrCode: row.pix_qr_code,
  expiraEm: new Date(row.expira_em),
});

const toPayoutIntent = (row: Row): PayoutIntentRecord => ({
  id: row.id,
  paymentId: row.payment_id,
  eventId: row.event_id,
  musicianId: row.musician_id,
  amount: Number(row.amount),
  pixKey: row.pix_key,
  pixKeyType: row.pix_key_type,
  state: row.state,
  asaasTransferId: row.asaas_transfer_id,
  createdAt: new Date(row.created_at),
  reconciliationRequired: row.reconciliation_required ?? false,
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

    async setApplicationsClosed(eventId, closed) {
      const { error } = await admin.from("events").update({ inscricoes_encerradas: closed }).eq("id", eventId).eq("status", "ABERTO");
      if (error) throw error;
    },

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

    async declineCandidate(id, motivo) {
      const { data, error } = await admin.from("event_candidates").update({ status: "RECUSADO", motivo_recusa: motivo }).eq("id", id).eq("status", "PENDENTE").select("id");
      if (error) throw error;
      return data.length > 0;
    },

    async listEventsOf(userId, role) {
      if (role === "CONTRACTOR") {
        const { data, error } = await admin.from("events").select("*").eq("contractor_id", userId);
        if (error) throw error;
        return data.map(toEvent);
      }
      const { data, error } = await admin.from("event_candidates").select("event:events(*)").eq("musician_id", userId).eq("status", "PENDENTE");
      if (error) throw error;
      return (data as unknown as { event: EventRow }[]).map((row) => toEvent(row.event));
    },

    async openDispute(dispute) {
      const { data, error } = await admin
        .from("disputes")
        .insert({ event_id: dispute.eventId, aberta_por: dispute.abertaPor, motivo: dispute.motivo })
        .select()
        .single();
      if (error?.code === UNIQUE_VIOLATION) throw new AppError(409, "CONTESTACAO_EXISTENTE", "Já existe uma contestação aberta para este evento.");
      if (error) throw error;
      return toDispute(data);
    },

    async findOpenDispute(eventId) {
      const { data, error } = await admin.from("disputes").select("*").eq("event_id", eventId).eq("status", "ABERTA").maybeSingle();
      if (error) throw error;
      return data && toDispute(data);
    },

    async findDispute(id) {
      const { data, error } = await admin.from("disputes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data && toDispute(data);
    },

    async resolveDispute(id, decisao, observacao) {
      const { data, error } = await admin
        .from("disputes")
        .update({ status: "RESOLVIDA", decisao, observacao, resolvida_em: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "ABERTA")
        .select("id");
      if (error) throw error;
      return data.length > 0;
    },

    async hasAppliedToContractor(musicianId, contractorId) {
      const { data, error } = await admin.from("event_candidates").select("id, event:events!inner(contractor_id)").eq("musician_id", musicianId).eq("event.contractor_id", contractorId).limit(1);
      if (error) throw error;
      return data.length > 0;
    },

    async setFavorite(contractorId, musicianId, favorite) {
      const { error } = favorite
        ? await admin.from("contractor_favorites").upsert({ contractor_id: contractorId, musician_id: musicianId })
        : await admin.from("contractor_favorites").delete().eq("contractor_id", contractorId).eq("musician_id", musicianId);
      if (error) throw error;
    },

    async isFavorite(contractorId, musicianId) {
      const { data, error } = await admin.from("contractor_favorites").select("musician_id").eq("contractor_id", contractorId).eq("musician_id", musicianId).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },

    async insertInvite(eventId, musicianId) {
      const { error } = await admin.from("event_invites").upsert({ event_id: eventId, musician_id: musicianId });
      if (error) throw error;
    },

    async hasInvite(eventId, musicianId) {
      const { data, error } = await admin.from("event_invites").select("event_id").eq("event_id", eventId).eq("musician_id", musicianId).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },

    async musicianHasConflict(musicianId, eventId) {
      const { data, error } = await admin.rpc("musician_has_conflict", { p_musician_id: musicianId, p_event_id: eventId });
      if (error) throw error;
      return data === true;
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
        .insert({
          candidate_id: message.candidateId,
          author_id: message.authorId,
          texto: message.texto,
          ...(message.valor === undefined ? {} : { tipo: "PROPOSTA", valor: message.valor, status_proposta: "ABERTA" }),
        })
        .select()
        .single();
      if (error) throw error;
      return toMessage(data);
    },

    async findMessage(id) {
      const { data, error } = await admin.from("candidate_messages").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data && toMessage(data);
    },

    async closeOpenProposals(candidateId) {
      const { error } = await admin.from("candidate_messages").update({ status_proposta: "SUBSTITUIDA" }).eq("candidate_id", candidateId).eq("status_proposta", "ABERTA");
      if (error) throw error;
    },

    async answerProposal(id, status) {
      const { data, error } = await admin.from("candidate_messages").update({ status_proposta: status }).eq("id", id).eq("status_proposta", "ABERTA").select("id");
      if (error) throw error;
      return data.length > 0;
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

  async function findIntent(column: string, value: string): Promise<PayoutIntentRecord | null> {
    const { data, error } = await admin.from("payout_intents").select("*").eq(column, value).maybeSingle();
    if (error) throw error;
    return data ? toPayoutIntent(data) : null;
  }
  return {
    async addPenalty(penalty) {
      const { error } = await admin.from("penalties").insert({ musician_id: penalty.musicianId, event_id: penalty.eventId, tipo: penalty.tipo, multa: penalty.multa });
      if (error) throw error;
    },

    async openFines(musicianId) {
      const { data, error } = await admin.from("penalties").select("*").eq("musician_id", musicianId).is("quitada_em", null).gt("multa", 0).order("created_at");
      if (error) throw error;
      return data.map((row) => ({ id: row.id, musicianId: row.musician_id, eventId: row.event_id, tipo: row.tipo, multa: Number(row.multa) }));
    },

    async settleFines(ids, paymentId) {
      if (ids.length === 0) return;
      const { error } = await admin.from("penalties").update({ quitada_em: new Date().toISOString(), payment_id: paymentId }).in("id", ids).is("quitada_em", null);
      if (error) throw error;
    },

    async setPayoutDiscount(paymentId, valor) {
      const { error } = await admin.from("payments").update({ multa_descontada: valor }).eq("id", paymentId);
      if (error) throw error;
    },

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
    findPaymentById: (id) => findOne("id", id),
    findPaymentByTransferId: (asaasTransferId) => findOne("repasse_asaas_id", asaasTransferId),

    async findLateRefundsToRetry(eventId) {
      const { data, error } = await admin
        .from("payments")
        .select("*")
        .eq("event_id", eventId)
        .eq("refund_action", "NENHUMA")
        .neq("status", "ESTORNADO")
        .or("refund_status.is.null,refund_status.eq.NEGADO");
      if (error) throw error;
      return data.map(toPayment);
    },

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
          // O banco define expira_em a partir do horário da inserção.
        })
        .select()
        .single();
      if (error?.code === UNIQUE_VIOLATION) {
        throw new AppError(409, "COBRANCA_EM_ANDAMENTO", "Já existe uma cobrança em andamento para este evento.");
      }
      if (error) throw error;
      return toPayment(data);
    },

    async expirePayment(id) {
      const { data, error } = await admin.rpc("expire_asaas_payment", { p_payment_id: id });
      if (error) throw error;
      return data === true;
    },

    async setPaymentStatus(id, status) {
      let query = admin.from("payments").update({ status }).eq("id", id);
<<<<<<< HEAD
      // Um webhook de vencimento/exclusão pode chegar junto da confirmação paga.
      // A transição para PAGO nunca deve ser sobrescrita por uma leitura antiga.
=======
>>>>>>> upstream/main
      if (status === "EXPIRADO" || status === "CANCELADO") query = query.eq("status", "PENDENTE");
      const { error } = await query;
      if (error) throw error;
    },

<<<<<<< HEAD
      async claimRefund(id, action) {
        const { data, error } = await admin.rpc("claim_asaas_refund", { p_payment_id: id, p_refund_action: action });
        if (error) throw error;
        return data === true;
      },

      async setRefundStatus(id, status) {
        const { error } = await admin.from("payments")
          .update({ refund_status: status })
          .eq("id", id)
          .eq("refund_status", "PROCESSANDO");
        if (error) throw error;
      },

      async finalizeRefund(id) {
        const { data, error } = await admin.rpc("finalize_asaas_refund", { p_payment_id: id });
        if (error) throw error;
        return data as "CONFIRMADO" | "JA_PROCESSADO" | "REPASSE_CONFLITANTE";
      },
=======
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
>>>>>>> upstream/main

    async confirmPayment(asaasPaymentId) {
      const { data, error } = await admin.rpc("confirm_asaas_payment", { p_asaas_payment_id: asaasPaymentId });
      if (error) throw error;
      return data as ConfirmPaymentResult;
    },

<<<<<<< HEAD
    async markLatePaymentDetected(id) {
      const { error } = await admin.rpc("mark_late_payment_detected", { p_payment_id: id });
      if (error) throw error;
    },
    findPayoutIntentByPaymentId: (paymentId) => findIntent("payment_id", paymentId),
    findPayoutIntentById: (id) => findIntent("id", id),
    findPayoutIntentByTransferId: (transferId) => findIntent("asaas_transfer_id", transferId),

    async reservePayoutIntent(payout) {
      const { data, error } = await admin.rpc("reserve_payout_intent", {
        p_payment_id: payout.paymentId,
        p_event_id: payout.eventId,
        p_musician_id: payout.musicianId,
        p_amount: payout.amount,
        p_pix_key: payout.pixKey,
        p_pix_key_type: payout.pixKeyType,
      });
      if (error) throw error;
      return data ? findIntent("id", String(data)) : null;
    },

    async markPayoutSent(id) {
      const { data, error } = await admin.rpc("mark_payout_sent", { p_intent_id: id });
      if (error) throw error;
      return data === true;
    },

    async markPayoutUnknown(id) {
      const { error } = await admin.rpc("mark_payout_unknown", { p_intent_id: id });
      if (error) throw error;
    },

    async linkPayoutTransfer(id, transferId) {
      const { data, error } = await admin.rpc("link_payout_transfer", { p_intent_id: id, p_transfer_id: transferId });
      if (error) throw error;
      return data === true;
    },

    async applyPayoutTransfer(id, transfer) {
      const { data, error } = await admin.rpc("apply_payout_transfer", {
        p_intent_id: id,
        p_transfer_id: transfer.id,
        p_external_reference: transfer.externalReference,
        p_status: transfer.status,
        p_value: transfer.value,
        p_operation_type: transfer.operationType,
        p_pix_key: transfer.pixAddressKey,
      });
      if (error) throw error;
      return data as PayoutIntentState | "DESCONHECIDO";
    },
    async markPayoutPreflightFailure(id) {
      const { error } = await admin.from("payments")
        .update({ repasse_status: "FALHOU" })
        .eq("id", id)
        .eq("status", "PAGO")
        .is("refund_status", null)
        .in("repasse_status", ["RETIDO", "FALHOU"]);
=======
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
>>>>>>> upstream/main
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
        .upsert({ id: event.id, tipo: event.tipo, asaas_payment_id: event.asaasPaymentId ?? null, asaas_transfer_id: event.asaasTransferId ?? null, payload: event.payload }, { onConflict: "id", ignoreDuplicates: true });
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
