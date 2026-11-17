import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../domain/errors.ts";
import type { CandidateRecord, CandidateStatus, DecisaoContestacao, DisputeRecord, EventInput, EventRecord, EventStatus, MessageRecord, MotivoRecusa, PayoutAttempt, PendingDisputeRecord, StatusProposta, PaymentRecord, PaymentStatus, PayoutStatus, RefundAction, RefundStatus, TipoPenalidade } from "../domain/event.ts";
import type { Inbox } from "../services/notifications.ts";
import type { ConfirmPaymentResult, EventStore, EvidenciaDeAusencia, PaymentStore, TravaDaRotina } from "../services/ports.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  status: DisputeRecord["status"];
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

type AttemptRow = {
  id: string;
  payment_id: string;
  origem: PayoutAttempt["origem"];
  estado: PayoutAttempt["estado"];
  referencia_externa: string;
  asaas_transfer_id: string | null;
  solicitada_em: string;
  verificacao_iniciada_em: string | null;
};

const toAttempt = (row: AttemptRow): PayoutAttempt => ({
  id: row.id,
  paymentId: row.payment_id,
  origem: row.origem,
  estado: row.estado,
  referenciaExterna: row.referencia_externa,
  asaasTransferId: row.asaas_transfer_id,
  solicitadaEm: new Date(row.solicitada_em),
  verificacaoIniciadaEm: row.verificacao_iniciada_em ? new Date(row.verificacao_iniciada_em) : null,
});

const TENTATIVA_ABERTA = ["SOLICITANDO", "PENDENTE", "INCONCLUSIVA", "EM_VERIFICACAO"];

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
  multaDescontada: Number(row.multa_descontada ?? 0),
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

    async findDueHirings(startedBefore) {
      const { data, error } = await admin.from("events").select("id").eq("status", "CONTRATADO").lte("inicio", startedBefore.toISOString());
      if (error) throw error;
      return data.map((row) => row.id);
    },

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
        .rpc("abrir_contestacao", { p_event_id: dispute.eventId, p_aberta_por: dispute.abertaPor, p_motivo: dispute.motivo })
        .single<{ resultado: "ABERTA" | "REPASSE_INICIADO" | "ESTORNO_EM_ANDAMENTO" | "CONTESTACAO_EXISTENTE"; contestacao_id: string | null }>();
      if (error) throw error;
      if (data.resultado === "CONTESTACAO_EXISTENTE") throw new AppError(409, "CONTESTACAO_EXISTENTE", "Já existe uma contestação aberta para este evento.");
      if (data.resultado === "REPASSE_INICIADO" || !data.contestacao_id) return null;
      const aberta = await admin.from("disputes").select("*").eq("id", data.contestacao_id).single<DisputeRow>();
      if (aberta.error) throw aberta.error;
      return toDispute(aberta.data);
    },

    async findOpenDispute(eventId) {
      const { data, error } = await admin.from("disputes").select("*").eq("event_id", eventId).in("status", ["ABERTA", "AGUARDANDO_ESTORNO"]).maybeSingle<DisputeRow>();
      if (error) throw error;
      return data && (toDispute(data) as PendingDisputeRecord);
    },

    async findLatestResolvedDispute(eventId, paymentId) {
      const { data, error } = await admin
        .from("disputes")
        .select("decisao, resolvida_em")
        .eq("event_id", eventId)
        .eq("payment_id", paymentId)
        .eq("status", "RESOLVIDA")
        .order("resolvida_em", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ decisao: DecisaoContestacao; resolvida_em: string | null }>();
      if (error) throw error;
      return data && { decisao: data.decisao, resolvidaEm: data.resolvida_em ? new Date(data.resolvida_em) : null };
    },

    async findDispute(id) {
      const { data, error } = await admin.from("disputes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data && toDispute(data);
    },

    async decideDispute(id, decisao, observacao) {
      if (!UUID.test(id)) return "NAO_ENCONTRADA";
      const { data, error } = await admin.rpc("decidir_contestacao", { p_dispute_id: id, p_decisao: decisao, p_observacao: observacao });
      if (error) throw error;
      return data as Awaited<ReturnType<EventStore["decideDispute"]>>;
    },

    async reopenDisputeWithoutRefund(id) {
      const { data, error } = await admin.rpc("reabrir_contestacao_sem_estorno", { p_dispute_id: id });
      if (error) throw error;
      return data === true;
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

const evidenciaParams = (evidencia: EvidenciaDeAusencia) => ({
  p_operador: evidencia.operador,
  p_referencia: evidencia.referencia,
  p_busca_desde: evidencia.desde,
  p_busca_iniciada_em: evidencia.iniciadaEm.toISOString(),
  p_busca_completa: evidencia.completa,
  p_paginas: evidencia.paginas,
  p_listadas: evidencia.listadas,
  p_encontradas: evidencia.encontradas,
});

export function createTravaDaRotina(admin: SupabaseClient): TravaDaRotina {
  return {
    async adquirir(dono, validadeSegundos) {
      const { data, error } = await admin.rpc("adquirir_rotina_financeira", { p_dono: dono, p_validade_segundos: validadeSegundos });
      if (error) throw error;
      return data === null ? null : Number(data);
    },
    async renovar(dono, geracao, validadeSegundos) {
      const { data, error } = await admin.rpc("renovar_rotina_financeira", { p_dono: dono, p_geracao: geracao, p_validade_segundos: validadeSegundos });
      if (error) throw error;
      return data === true;
    },
    async encerrar(dono, geracao, resultado, erro) {
      const { data, error } = await admin.rpc("encerrar_rotina_financeira", { p_dono: dono, p_geracao: geracao, p_resultado: resultado, p_erro: erro });
      if (error) throw error;
      return data === true;
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
    async findRefundPenalty(paymentId) {
      const { data, error } = await admin
        .from("penalties")
        .select("musician_id, tipo, multa, musician:musician_profiles!inner(visibilidade_reduzida_ate)")
        .eq("estorno_payment_id", paymentId)
        .maybeSingle<{ musician_id: string; tipo: TipoPenalidade; multa: number | string; musician: { visibilidade_reduzida_ate: string | null } }>();
      if (error) throw error;
      if (!data?.musician.visibilidade_reduzida_ate) return null;
      return { musicianId: data.musician_id, tipo: data.tipo, multa: Number(data.multa), visibilidadeReduzidaAte: new Date(data.musician.visibilidade_reduzida_ate) };
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

    async findPaymentById(id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await admin.from("payments").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data && toPayment(data);
    },

    async findFinanceFollowUps(now) {
      const eventIds = async (query: PromiseLike<{ data: { event_id: string | null }[] | null; error: unknown }>) => {
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).flatMap((row) => (row.event_id ? [row.event_id] : []));
      };
      const [expiredCharges, refunds, emProcessamento, retidos] = await Promise.all([
        eventIds(admin.from("payments").select("event_id").eq("status", "PENDENTE").lte("expira_em", now.toISOString())),
        eventIds(admin.from("payments").select("event_id").eq("refund_status", "PROCESSANDO")),
        eventIds(admin.from("payments").select("event_id").eq("status", "PAGO").eq("repasse_status", "PROCESSANDO")),
        eventIds(admin.from("payments").select("event_id, event:events!inner(status)").eq("status", "PAGO").eq("repasse_status", "RETIDO").in("event.status", ["CONCLUIDO", "CANCELADO"])),
      ]);
      return { expiredCharges, refunds, payouts: [...emProcessamento, ...retidos] };
    },

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

    async claimRefund(id, action, contestacaoId = null) {
      const { data, error } = await admin.rpc("claim_asaas_refund", { p_payment_id: id, p_refund_action: action, p_contestacao_id: contestacaoId });
      if (error) throw error;
      return data === true;
    },

    async denyRefund(id) {
      const { data, error } = await admin.rpc("negar_estorno", { p_payment_id: id });
      if (error) throw error;
      return (data as string | null) ?? null;
    },

    async releaseRefund(id, previous) {
      const { data, error } = await admin.rpc("liberar_estorno", { p_payment_id: id, p_refund_status: previous.refundStatus, p_refund_action: previous.refundAction });
      if (error) throw error;
      return (data as string | null) ?? null;
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
      const { data, error } = await admin.rpc("claim_payout", { p_payment_id: id }).single<{ tentativa_id: string | null; desconto: number | string }>();
      if (error) throw error;
      return { tentativaId: data.tentativa_id, desconto: Number(data.desconto) };
    },

    async findOpenAttempt(paymentId) {
      const { data, error } = await admin.from("repasse_tentativas").select("*").eq("payment_id", paymentId).in("estado", TENTATIVA_ABERTA).maybeSingle<AttemptRow>();
      if (error) throw error;
      return data && toAttempt(data);
    },

    async findOpenAttempts() {
      const { data, error } = await admin.from("repasse_tentativas").select("*").in("estado", TENTATIVA_ABERTA).order("solicitada_em");
      if (error) throw error;
      return (data as AttemptRow[]).map(toAttempt);
    },

    async findAttempt(id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await admin.from("repasse_tentativas").select("*").eq("id", id).maybeSingle<AttemptRow>();
      if (error) throw error;
      return data && toAttempt(data);
    },

    async findAttemptByTransferId(asaasTransferId) {
      const { data, error } = await admin.from("repasse_tentativas").select("*").eq("asaas_transfer_id", asaasTransferId).maybeSingle<AttemptRow>();
      if (error) throw error;
      return data && toAttempt(data);
    },

    async registerTransfer(attemptId, asaasTransferId) {
      const { data, error } = await admin.rpc("registrar_transferencia", { p_tentativa_id: attemptId, p_transfer_id: asaasTransferId });
      if (error) throw error;
      return data as Awaited<ReturnType<PaymentStore["registerTransfer"]>>;
    },

    async markAttemptInconclusive(attemptId) {
      const { data, error } = await admin.rpc("marcar_tentativa_inconclusiva", { p_tentativa_id: attemptId });
      if (error) throw error;
      return data === true;
    },

    async registerRequestSent(attemptId) {
      const { data, error } = await admin.rpc("registrar_pedido_enviado", { p_tentativa_id: attemptId });
      if (error) throw error;
      return data === true;
    },

    async markStaleAttempt(attemptId) {
      const { data, error } = await admin.rpc("marcar_tentativa_parada", { p_tentativa_id: attemptId });
      if (error) throw error;
      return data as Awaited<ReturnType<PaymentStore["markStaleAttempt"]>>;
    },

    async markStaleAttempts() {
      const { data, error } = await admin.rpc("marcar_solicitacoes_paradas");
      if (error) throw error;
      return Number(data);
    },

    async completeAttempt(attemptId, asaasTransferId) {
      const { data, error } = await admin.rpc("concluir_tentativa", { p_tentativa_id: attemptId, p_transfer_id: asaasTransferId });
      if (error) throw error;
      return data as Awaited<ReturnType<PaymentStore["completeAttempt"]>>;
    },

    async failAttempt(attemptId, asaasTransferId) {
      const { data, error } = await admin.rpc("falhar_tentativa", { p_tentativa_id: attemptId, p_transfer_id: asaasTransferId });
      if (error) throw error;
      return data === true;
    },

    async recordAttemptAlert(attemptId, tipo, asaasTransferId, status) {
      const { error } = await admin.rpc("registrar_alerta_repasse", { p_tentativa_id: attemptId, p_tipo: tipo, p_transfer_id: asaasTransferId, p_status: status });
      if (error) throw error;
    },

    async absenceDeclaration() {
      const { data, error } = await admin.rpc("declaracao_ausencia_repasse");
      if (error) throw error;
      return String(data);
    },

    async startAbsenceCheck(attemptId, evidencia) {
      const { data, error } = await admin.rpc("iniciar_verificacao_ausencia", { p_tentativa_id: attemptId, ...evidenciaParams(evidencia) });
      if (error) throw error;
      return String(data);
    },

    async confirmAbsence(attemptId, evidencia, declaracao) {
      const { data, error } = await admin.rpc("confirmar_ausencia", { p_tentativa_id: attemptId, p_declaracao: declaracao, ...evidenciaParams(evidencia) });
      if (error) throw error;
      return String(data);
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
