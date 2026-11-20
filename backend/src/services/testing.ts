import type { Account } from "../domain/account.ts";
import { MULTA_AUSENCIA_PERCENTUAL, VISIBILIDADE_REDUZIDA_DIAS } from "../../../shared/dominio.ts";
import { AppError } from "../domain/errors.ts";
import type { CandidateRecord, DisputeRecord, EventRecord, MessageRecord, PaymentRecord, PayoutAttempt, PenaltyRecord, PendingDisputeRecord } from "../domain/event.ts";
import type { AccountStore, ImageStore } from "./accountService.ts";
import type { Inbox, Mailer, NotificationInput } from "./notifications.ts";
import type { AlertaRepasse, AsaasGateway, EventStore, EvidenciaDeAusencia, PaymentStore, TravaDaRotina } from "./ports.ts";

export const NOW = new Date("2030-06-10T12:00:00Z");
export const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 60 * 60 * 1000);

export const DECLARACAO_AUSENCIA = "Declaro que conferi no painel da Asaas que esta tentativa de repasse não gerou transferência. Entendo que as buscas automáticas e os prazos de espera reduzem o risco de Pix duplicado, mas não comprovam a ausência.";

const ABERTAS: PayoutAttempt["estado"][] = ["SOLICITANDO", "PENDENTE", "INCONCLUSIVA", "EM_VERIFICACAO"];
const PENDENTES: DisputeRecord["status"][] = ["ABERTA", "AGUARDANDO_ESTORNO"];
const HORA_MS = 60 * 60 * 1000;

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
  const messages: MessageRecord[] = [];
  const penalties: (PenaltyRecord & { quitada: boolean; estornoPaymentId: string | null; reservaPaymentId: string | null })[] = [];
  const tentativas: (PayoutAttempt & { encerradaEm: Date | null; pedidoEnviadoEm?: Date | null })[] = [];
  const alertas: { tentativaId: string; tipo: AlertaRepasse; asaasTransferId: string; status: string | null; detalhes?: Record<string, unknown> }[] = [];
  const decisoes: { tentativaId: string; etapa: "VERIFICACAO" | "CONFIRMACAO"; operadorNomeInformado: string; identidadeAutenticada: false; declaracao: string | null; paginas: number; listadas: number }[] = [];
  const disputes: DisputeRecord[] = [];
  const pagamentoDaContestacao = new Map<string, string | null>();
  const resolucaoDaContestacao = new Map<string, Date>();
  const favorites = new Set<string>();
  const invites = new Set<string>();
  const notifications: (NotificationInput & { lida: boolean })[] = [];
  const payments = new Map<string, PaymentRecord & { createdAt: number }>();
  const asaasTransfers = new Map<string, string>();
  const asaasSubscriptions = new Map<string, { customer: string; value: number; payments: { id: string; status: string; dueDate: string }[]; cancelled: boolean }>();
  const reviews: { eventId: string; authorId: string; reviewedId: string; rating: number }[] = [];
  const images = new Set<string>();
  const customers = new Map<string, string>();
  const webhookEvents = new Set<string>();
  const asaasCharges = new Map<string, { status: string; value: number }>();
  const asaasCalls = {
    createCustomer: 0,
    createPixCharge: [] as { value: number; customer: string }[],
    cancelCharge: [] as string[],
    refundPayment: [] as string[],
    transferPix: [] as { value: number; pixAddressKey: string; pixAddressKeyType: string; externalReference: string }[],
    findTransfersByReference: [] as { reference: string; maxPages: number | undefined }[],
  };
  const failures = { refund: false, transfer: false, transferLost: false, transferUnavailable: false, staleCustomer: false, transferSearchIncomplete: false };
  const asaasTransferDetails = new Map<string, { externalReference: string; value: number }>();
  const toTransfer = (id: string) => ({ id, status: asaasTransfers.get(id)!, externalReference: asaasTransferDetails.get(id)!.externalReference, value: asaasTransferDetails.get(id)!.value });
  let sequence = 1;
  const nextId = (prefix: string) => `${prefix}${sequence++}`;

  const inbox: Inbox = {
    add: async (notification) => void notifications.push({ ...notification, lida: false }),
    markAllRead: async (userId) => {
      for (const notification of notifications) if (notification.userId === userId) notification.lida = true;
    },
  };

  const accountStore = {
    findAccount: async (id: string) => accounts.get(id) ?? null,
    findEmail: async (id: string) => (accounts.has(id) ? `${id}@exemplo.com` : null),
  } as unknown as AccountStore;
  const distances = new Map<string, number>([["PR/toledo", 38.5], ["PR/foz do iguacu", 140], ["PR/curitiba", 430], ["PR/londrina", 380]]);
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

  const marcarParada = (attemptId: string): "SEM_MUDANCA" | "FALHOU" | "INCONCLUSIVA" => {
    const tentativa = tentativas.find((t) => t.id === attemptId);
    if (tentativa?.estado !== "SOLICITANDO" || tentativa.solicitadaEm.getTime() > Date.now() - 10 * 60 * 1000) return "SEM_MUDANCA";
    if (!tentativa.pedidoEnviadoEm) {
      encerrarSemRepasse(tentativa, "FALHOU");
      return "FALHOU";
    }
    tentativa.estado = "INCONCLUSIVA";
    return "INCONCLUSIVA";
  };
  const copiaDaTentativa = (tentativa: (PayoutAttempt & { encerradaEm: Date | null }) | undefined): PayoutAttempt | null => {
    if (!tentativa) return null;
    const { encerradaEm: _encerradaEm, ...copia } = tentativa;
    return { ...copia };
  };
  const registrarAlerta = (tentativaId: string, tipo: AlertaRepasse, asaasTransferId: string, status: string | null) => {
    if (!alertas.some((a) => a.tentativaId === tentativaId && a.tipo === tipo && a.asaasTransferId === asaasTransferId)) alertas.push({ tentativaId, tipo, asaasTransferId, status });
  };
  const registrarRepasseEEstorno = (tentativa: PayoutAttempt, ordem: "ESTORNO_ANTES_DA_CONCLUSAO" | "ESTORNO_DEPOIS_DA_CONCLUSAO") => {
    const payment = payments.get(tentativa.paymentId)!;
    if (payment.status !== "ESTORNADO" || tentativa.estado !== "CONCLUIDA" || !tentativa.asaasTransferId) return false;
    if (alertas.some((a) => a.tentativaId === tentativa.id && a.tipo === "REPASSE_E_ESTORNO")) return false;
    const multas = penalties.filter((p) => p.reservaPaymentId === payment.id);
    alertas.push({
      tentativaId: tentativa.id,
      tipo: "REPASSE_E_ESTORNO",
      asaasTransferId: tentativa.asaasTransferId,
      status: "DONE",
      detalhes: {
        ordem,
        paymentId: payment.id,
        valorRetido: payment.multaDescontada,
        valorTransferido: Math.round((payment.valorCache - payment.multaDescontada) * 100) / 100,
        valorPendente: multas.reduce((soma, p) => Math.round((soma + p.multa) * 100) / 100, 0),
        multas: multas.map((p) => ({ id: p.id, multa: p.multa, reservaPaymentId: p.reservaPaymentId, quitada: p.quitada })),
      },
    });
    for (const penalty of multas) penalty.quitada = false;
    return true;
  };
  const encerrarSemRepasse = (tentativa: PayoutAttempt & { encerradaEm: Date | null }, estado: "FALHOU" | "AUSENCIA_CONFIRMADA") => {
    Object.assign(tentativa, { estado, encerradaEm: new Date() });
    Object.assign(payments.get(tentativa.paymentId)!, { repasseStatus: "FALHOU", multaDescontada: 0, asaasTransferId: null });
    for (const penalty of penalties) if (penalty.reservaPaymentId === tentativa.paymentId && !penalty.quitada) penalty.reservaPaymentId = null;
  };
  const validarBusca = (tentativa: PayoutAttempt, inicioMinimo: number, evidencia: EvidenciaDeAusencia): string | null => {
    const agora = Date.now();
    const busca = evidencia.iniciadaEm.getTime();
    const limiteDaJanela = new Date(tentativa.solicitadaEm.getTime() - 24 * HORA_MS).toISOString().slice(0, 10);
    if (agora < inicioMinimo) return "PRAZO_NAO_ATINGIDO";
    if (busca < inicioMinimo) return "BUSCA_ANTES_DO_PRAZO";
    if (busca > agora || busca < agora - 10 * 60 * 1000) return "BUSCA_DESATUALIZADA";
    if (!evidencia.completa || evidencia.paginas < 1 || evidencia.listadas < 0) return "BUSCA_INCOMPLETA";
    if (evidencia.encontradas !== 0) return "TRANSFERENCIA_ENCONTRADA";
    if (evidencia.referencia !== tentativa.referenciaExterna) return "REFERENCIA_DIVERGENTE";
    if (evidencia.desde > limiteDaJanela) return "JANELA_INSUFICIENTE";
    if (evidencia.operador.trim().length < 3) return "OPERADOR_INVALIDO";
    return null;
  };

  const pagoDoEvento = (eventId: string) => [...payments.values()].find((p) => p.eventId === eventId && p.status === "PAGO");
  const reabrirContestacaoDoEvento = (eventId: string) => {
    const dispute = disputes.find((d) => d.eventId === eventId && d.status === "AGUARDANDO_ESTORNO");
    if (!dispute) return null;
    Object.assign(dispute, { status: "ABERTA", decisao: null });
    return dispute.id;
  };
  const reabrirContestacaoDoPagamento = (paymentId: string) => {
    const dispute = disputes.find((d) => pagamentoDaContestacao.get(d.id) === paymentId && d.status === "AGUARDANDO_ESTORNO");
    if (!dispute) return null;
    Object.assign(dispute, { status: "ABERTA", decisao: null });
    return dispute.id;
  };

  const reopenEvent = (event: EventRecord) => {
    for (const [id, candidate] of candidates) {
      if (candidate.eventId !== event.id) continue;
      if (candidate.musicianId === event.musicoContratadoId) candidates.delete(id);
      else if (candidate.status === "RECUSADO" && candidate.motivoRecusa === "OUTRO_CONTRATADO") Object.assign(candidate, { status: "PENDENTE", motivoRecusa: null });
    }
    Object.assign(event, { status: "ABERTO", musicoContratadoId: null, confirmacaoMusico: false, confirmacaoContratante: false });
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
        inscricoesEncerradas: false,
        ausenciaInformadaEm: null,
        createdAt: hoursFromNow(-48),
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
    distanceKm: async (eventId, musicianId) => {
      const event = events.get(eventId)!;
      const musician = accounts.get(musicianId)!;
      const same = event.uf === musician.uf && event.cidade.toLowerCase() === (musician.cidade ?? "").toLowerCase();
      return same ? 0 : (distances.get(`${event.uf}/${event.cidade.toLowerCase()}`) ?? null);
    },
    hasOngoingHiring: async (userId) => {
      const involved = (e: EventRecord) => e.contractorId === userId || e.musicoContratadoId === userId;
      if ([...events.values()].some((e) => e.status === "CONTRATADO" && involved(e))) return true;
      return [...payments.values()].some((p) => {
        const event = p.eventId ? events.get(p.eventId) : undefined;
        const unsettled = (p.status === "PAGO" && p.repasseStatus !== null && p.repasseStatus !== "REPASSADO") || p.refundStatus === "PROCESSANDO";
        return Boolean(event && involved(event) && unsettled);
      });
    },
    listCandidates: async (eventId) => [...candidates.values()].filter((c) => c.eventId === eventId),
    setApplicationsClosed: async (eventId, closed) => {
      const event = events.get(eventId);
      if (event?.status === "ABERTO") event.inscricoesEncerradas = closed;
    },
    declineCandidate: async (id, motivo) => {
      const candidate = candidates.get(id);
      if (candidate?.status !== "PENDENTE") return false;
      candidate.status = "RECUSADO";
      candidate.motivoRecusa = motivo;
      return true;
    },
    listEventsOf: async (userId, role) =>
      role === "CONTRACTOR"
        ? [...events.values()].filter((e) => e.contractorId === userId)
        : [...candidates.values()].filter((c) => c.musicianId === userId && c.status === "PENDENTE").map((c) => events.get(c.eventId)!),
    openDispute: async (dispute) => {
      const pago = [...payments.values()].find((p) => p.eventId === dispute.eventId && p.status === "PAGO");
      if (pago?.repasseStatus === "PROCESSANDO" || pago?.repasseStatus === "REPASSADO") return null;
      if ([...payments.values()].some((p) => p.eventId === dispute.eventId && p.refundStatus === "PROCESSANDO" && p.refundAction !== "NENHUMA")) return null;
      if (disputes.some((d) => d.eventId === dispute.eventId && PENDENTES.includes(d.status))) {
        throw new AppError(409, "CONTESTACAO_EXISTENTE", "Já existe uma contestação aberta para este evento.");
      }
      const record: DisputeRecord = { ...dispute, id: nextId("disp"), status: "ABERTA", decisao: null, observacao: null, createdAt: new Date() };
      disputes.push(record);
      pagamentoDaContestacao.set(record.id, pago?.id ?? null);
      return record;
    },
    findDueHirings: async (startedBefore) =>
      [...events.values()].filter((event) => event.status === "CONTRATADO" && event.inicio <= startedBefore).map((event) => event.id),
    reportAbsence: async (eventId, informadaEm) => {
      const event = events.get(eventId);
      if (!event || event.status !== "CONTRATADO" || event.confirmacaoMusico || event.confirmacaoContratante || event.ausenciaInformadaEm) return false;
      event.ausenciaInformadaEm = informadaEm;
      return true;
    },
    withdrawAbsence: async (eventId) => {
      const event = events.get(eventId);
      if (event?.status === "CONTRATADO") event.ausenciaInformadaEm = null;
    },
    findExpiredAbsences: async (reportedBefore) =>
      [...events.values()].filter((event) => event.status === "CONTRATADO" && event.ausenciaInformadaEm !== null && event.ausenciaInformadaEm <= reportedBefore).map((event) => event.id),
    findOpenDispute: async (eventId) => disputes.find((d): d is PendingDisputeRecord => d.eventId === eventId && PENDENTES.includes(d.status)) ?? null,
    findLatestResolvedDispute: async (eventId, paymentId) => {
      const instante = (d: DisputeRecord) => resolucaoDaContestacao.get(d.id)?.getTime() ?? -Infinity;
      const resolvida = disputes
        .filter((d) => d.eventId === eventId && pagamentoDaContestacao.get(d.id) === paymentId && d.status === "RESOLVIDA" && d.decisao)
        .sort((a, b) => instante(b) - instante(a) || b.createdAt.getTime() - a.createdAt.getTime())[0];
      return resolvida?.decisao ? { decisao: resolvida.decisao, resolvidaEm: resolucaoDaContestacao.get(resolvida.id) ?? null } : null;
    },
    findDispute: async (id) => disputes.find((d) => d.id === id) ?? null,
    decideDispute: async (id, decisao, observacao) => {
      const dispute = disputes.find((d) => d.id === id);
      if (!dispute) return "NAO_ENCONTRADA";
      if (dispute.status === "ABERTA") {
        Object.assign(dispute, { status: decisao === "PAGAR_MUSICO" ? "RESOLVIDA" : "AGUARDANDO_ESTORNO", decisao, observacao });
        if (decisao === "PAGAR_MUSICO") resolucaoDaContestacao.set(dispute.id, new Date());
        return "DECIDIDA";
      }
      const estorno = pagoDoEvento(dispute.eventId)?.refundStatus;
      if (dispute.status === "AGUARDANDO_ESTORNO" && decisao === "DEVOLVER_CONTRATANTE" && estorno !== "PROCESSANDO" && estorno !== "CONFIRMADO") return "RETOMADA";
      return "JA_DECIDIDA";
    },
    reopenDisputeWithoutRefund: async (id) => {
      const dispute = disputes.find((d) => d.id === id);
      const pago = dispute && pagoDoEvento(dispute.eventId);
      if (!dispute || !pago || pago.refundStatus === "PROCESSANDO" || pago.refundStatus === "CONFIRMADO") return false;
      return reabrirContestacaoDoEvento(dispute.eventId) !== null;
    },
    hasAppliedToContractor: async (musicianId, contractorId) =>
      [...candidates.values()].some((c) => c.musicianId === musicianId && events.get(c.eventId)?.contractorId === contractorId),
    setFavorite: async (contractorId, musicianId, favorite) => {
      const key = `${contractorId}:${musicianId}`;
      if (favorite) favorites.add(key);
      else favorites.delete(key);
    },
    isFavorite: async (contractorId, musicianId) => favorites.has(`${contractorId}:${musicianId}`),
    insertInvite: async (eventId, musicianId) => void invites.add(`${eventId}:${musicianId}`),
    hasInvite: async (eventId, musicianId) => invites.has(`${eventId}:${musicianId}`),
    musicianHasConflict: async (musicianId, eventId) => {
      const alvo = events.get(eventId);
      if (!alvo) return false;
      const fim = (e: EventRecord) => e.inicio.getTime() + e.duracaoMinutos * 60_000;
      return [...events.values()].some((e) => e.id !== eventId && e.status === "CONTRATADO" && e.musicoContratadoId === musicianId && e.inicio.getTime() < fim(alvo) && alvo.inicio.getTime() < fim(e));
    },
    findCandidate: async (eventId, musicianId) =>
      [...candidates.values()].find((c) => c.eventId === eventId && c.musicianId === musicianId) ?? null,
    findCandidateById: async (id) => candidates.get(id) ?? null,
    insertCandidate: async (eventId, musicianId, valorProposto) => {
      if ([...candidates.values()].some((c) => c.eventId === eventId && c.musicianId === musicianId)) {
        throw new AppError(409, "JA_INSCRITO", "Você já se inscreveu neste evento.");
      }
      const candidate: CandidateRecord = { id: nextId("cand"), eventId, musicianId, status: "PENDENTE", valorProposto, motivoRecusa: null };
      candidates.set(candidate.id, candidate);
      return candidate;
    },
    updateCandidateProposal: async (id, valorProposto) => {
      const candidate = candidates.get(id);
      if (candidate?.status === "PENDENTE") candidate.valorProposto = valorProposto;
    },
    deleteCandidate: async (id) => void candidates.delete(id),
    insertMessage: async ({ valor, ...message }) => {
      const record: MessageRecord = valor === undefined
        ? { ...message, tipo: "TEXTO", valor: null, statusProposta: null, id: nextId("msg"), createdAt: new Date() }
        : { ...message, tipo: "PROPOSTA", valor, statusProposta: "ABERTA", id: nextId("msg"), createdAt: new Date() };
      messages.push(record);
      return record;
    },
    findMessage: async (id) => messages.find((m) => m.id === id) ?? null,
    closeOpenProposals: async (candidateId) => {
      for (const m of messages) if (m.candidateId === candidateId && m.statusProposta === "ABERTA") m.statusProposta = "SUBSTITUIDA";
    },
    answerProposal: async (id, status) => {
      const message = messages.find((m) => m.id === id);
      if (message?.statusProposta !== "ABERTA") return false;
      message.statusProposta = status;
      return true;
    },
    insertReview: async (review) => {
      if (reviews.some((r) => r.eventId === review.eventId && r.authorId === review.authorId)) {
        throw new AppError(409, "JA_AVALIADO", "Você já avaliou este evento.");
      }
      reviews.push(review);
    },
    hasReviewed: async (eventId, authorId) => reviews.some((r) => r.eventId === eventId && r.authorId === authorId),
  };

  const paymentStore: PaymentStore = {
    findRefundPenalty: async (paymentId) => {
      const penalty = penalties.find((p) => p.estornoPaymentId === paymentId);
      const ate = penalty && accounts.get(penalty.musicianId)?.visibilidadeReduzidaAte;
      return penalty && ate ? { musicianId: penalty.musicianId, tipo: penalty.tipo, multa: penalty.multa, visibilidadeReduzidaAte: ate } : null;
    },
    findPendingPayment: async (eventId) => [...payments.values()].find((p) => p.eventId === eventId && p.status === "PENDENTE") ?? null,
    findLatestPayment: async (eventId) =>
      [...payments.values()].filter((p) => p.eventId === eventId).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
    findPaymentByAsaasId: async (asaasPaymentId) => [...payments.values()].find((p) => p.asaasPaymentId === asaasPaymentId) ?? null,
    findPaymentById: async (id) => payments.get(id) ?? null,
    findFinanceFollowUps: async (now) => {
      const all = [...payments.values()];
      const eventIds = (keep: (payment: PaymentRecord) => boolean) => all.filter(keep).flatMap((p) => (p.eventId ? [p.eventId] : []));
      return {
        expiredCharges: eventIds((p) => p.status === "PENDENTE" && p.expiraEm <= now),
        refunds: eventIds((p) => p.refundStatus === "PROCESSANDO"),
        payouts: eventIds((p) => p.status === "PAGO" && (p.repasseStatus === "PROCESSANDO" || (p.repasseStatus === "RETIDO" && ["CONCLUIDO", "CANCELADO"].includes(events.get(p.eventId ?? "")?.status ?? "")))),
      };
    },
    findLateRefundsToRetry: async (eventId) =>
      [...payments.values()].filter((p) => p.eventId === eventId && p.refundAction === "NENHUMA" && p.status !== "ESTORNADO" && (p.refundStatus === null || p.refundStatus === "NEGADO")),
    insertPayment: async (data) => {
      if ([...payments.values()].some((p) => p.eventId === data.eventId && p.status === "PENDENTE")) {
        throw new AppError(409, "COBRANCA_EM_ANDAMENTO", "Já existe uma cobrança em andamento para este evento.");
      }
      const payment = {
        ...data,
        id: nextId("p"),
        status: "PENDENTE" as const,
        valorCache: Math.round((data.valor - data.valorComissao) * 100) / 100,
        repasseStatus: null,
        asaasTransferId: null,
        multaDescontada: 0,
        refundStatus: null,
        refundAction: null,
        refundRequestedAt: null,
        createdAt: sequence,
      };
      payments.set(payment.id, payment);
      return payment;
    },
    setPaymentStatus: async (id, status) => {
      const payment = payments.get(id)!;
      if ((status === "EXPIRADO" || status === "CANCELADO") && payment.status !== "PENDENTE") return;
      payment.status = status;
    },
    claimRefund: async (id, action, contestacaoId = null) => {
      const payment = payments.get(id)!;
      if (tentativas.some((t) => t.paymentId === id && ABERTAS.includes(t.estado))) return false;
      const pendente = payment.status === "PAGO" ? disputes.find((d) => d.eventId === payment.eventId && PENDENTES.includes(d.status)) : undefined;
      if (pendente && !(pendente.status === "AGUARDANDO_ESTORNO" && pendente.id === contestacaoId && action === "NAO_COMPARECIMENTO")) return false;
      if (!((payment.status === "PAGO" && (payment.repasseStatus === "RETIDO" || payment.repasseStatus === "FALHOU")) || (action === "NENHUMA" && (payment.status === "PENDENTE" || payment.status === "EXPIRADO" || payment.status === "CANCELADO"))) || (payment.refundStatus !== null && payment.refundStatus !== "NEGADO")) return false;
      payment.refundStatus = "PROCESSANDO";
      payment.refundAction = action;
      payment.refundRequestedAt = new Date();
      return true;
    },
    denyRefund: async (id) => {
      const payment = payments.get(id)!;
      if (payment.refundStatus !== "PROCESSANDO") return null;
      payment.refundStatus = "NEGADO";
      return reabrirContestacaoDoPagamento(id);
    },
    releaseRefund: async (id, previous) => {
      const payment = payments.get(id)!;
      if (payment.refundStatus !== "PROCESSANDO") return null;
      payment.refundStatus = previous.refundStatus;
      payment.refundAction = previous.refundAction;
      return reabrirContestacaoDoPagamento(id);
    },
    finalizeRefund: async (id) => {
      const payment = payments.get(id)!;
      if (payment.status === "ESTORNADO") return "JA_PROCESSADO";
      if (payment.status !== "PAGO" && payment.refundAction !== "NENHUMA") throw new Error("pagamento nao esta elegivel para estorno");
      const payoutConflict = payment.repasseStatus === "PROCESSANDO" || payment.repasseStatus === "REPASSADO"
        || tentativas.some((t) => t.paymentId === id && ABERTAS.includes(t.estado));
      const event = payment.eventId ? events.get(payment.eventId) : null;
      const musicianId = event?.musicoContratadoId ?? null;
      if (event?.status === "CONTRATADO" && payment.refundAction !== "NENHUMA") {
        if (payment.refundAction === "REABRIR" && !payoutConflict) reopenEvent(event);
        else event.status = "CANCELADO";
      }
      payment.status = "ESTORNADO";
      for (const dispute of disputes) {
        if (pagamentoDaContestacao.get(dispute.id) !== id || dispute.status === "RESOLVIDA") continue;
        if (dispute.status === "ABERTA") dispute.observacao = [dispute.observacao, "Valor devolvido ao contratante por estorno confirmado fora da decisão do suporte."].filter(Boolean).join("\n");
        dispute.status = "RESOLVIDA";
        dispute.decisao = "DEVOLVER_CONTRATANTE";
        resolucaoDaContestacao.set(dispute.id, new Date());
      }
      payment.refundStatus = "CONFIRMADO";
      if (!payoutConflict) payment.repasseStatus = null;
      if (payoutConflict) {
        for (const tentativa of tentativas.filter((t) => t.paymentId === id && t.estado === "CONCLUIDA")) registrarRepasseEEstorno(tentativa, "ESTORNO_DEPOIS_DA_CONCLUSAO");
        return "REPASSE_CONFLITANTE";
      }
      const ausencia = payment.refundAction === "NAO_COMPARECIMENTO";
      const tardia = payment.refundAction === "REABRIR" && payment.refundRequestedAt !== null && event !== null && event !== undefined
        && event.inicio.getTime() - payment.refundRequestedAt.getTime() <= 24 * 60 * 60 * 1000;
      if (event && musicianId && (ausencia || tardia) && !penalties.some((p) => p.estornoPaymentId === id)) {
        penalties.push({
          id: nextId("pen"), musicianId, eventId: event.id, tipo: ausencia ? "AUSENCIA" : "DESISTENCIA_TARDIA",
          multa: ausencia ? Math.round(payment.valorCache * MULTA_AUSENCIA_PERCENTUAL) / 100 : 0, quitada: false, estornoPaymentId: id, reservaPaymentId: null,
        });
        const account = accounts.get(musicianId);
        const ate = new Date(Date.now() + VISIBILIDADE_REDUZIDA_DIAS * 24 * 60 * 60 * 1000);
        if (account) account.visibilidadeReduzidaAte = account.visibilidadeReduzidaAte && account.visibilidadeReduzidaAte > ate ? account.visibilidadeReduzidaAte : ate;
      }
      return "CONFIRMADO";
    },
    confirmPayment: async (asaasPaymentId) => {
      const payment = [...payments.values()].find((p) => p.asaasPaymentId === asaasPaymentId);
      if (!payment) return "PAGAMENTO_NAO_ENCONTRADO";
      if (payment.status === "PAGO") return "JA_PROCESSADO";
      if (payment.status !== "PENDENTE" || payment.refundStatus !== null) return "EVENTO_INDISPONIVEL";
      const event = payment.eventId ? events.get(payment.eventId) : undefined;
      const chosen = payment.candidateId ? candidates.get(payment.candidateId) : undefined;
      if (!event || event.status !== "ABERTO" || !chosen || event.inicio.getTime() <= Date.now()) return "EVENTO_INDISPONIVEL";
      if (await eventStore.musicianHasConflict(chosen.musicianId, event.id)) return "EVENTO_INDISPONIVEL";
      payment.status = "PAGO";
      payment.repasseStatus = "RETIDO";
      event.status = "CONTRATADO";
      event.musicoContratadoId = chosen.musicianId;
      Object.assign(chosen, { status: "APROVADO", motivoRecusa: null });
      for (const candidate of candidates.values()) {
        if (candidate.eventId === event.id && candidate.id !== chosen.id && candidate.status === "PENDENTE") Object.assign(candidate, { status: "RECUSADO", motivoRecusa: "OUTRO_CONTRATADO" });
      }
      return "CONTRATADO";
    },
    claimPayout: async (id) => {
      const payment = payments.get(id)!;
      const aberta = tentativas.some((t) => t.paymentId === id && ABERTAS.includes(t.estado));
      const contestada = disputes.some((d) => d.eventId === payment.eventId && PENDENTES.includes(d.status));
      if (payment.status !== "PAGO" || payment.refundStatus === "PROCESSANDO" || payment.repasseStatus !== "RETIDO" || payment.asaasTransferId || aberta || contestada) {
        return { tentativaId: null, desconto: payment.multaDescontada };
      }
      const musicianId = payment.eventId ? events.get(payment.eventId)?.musicoContratadoId : null;
      let desconto = 0;
      if (musicianId) {
        const reservadas = penalties.filter((p) => p.reservaPaymentId === id && !p.quitada);
        if (reservadas.length > 0) desconto = reservadas.reduce((soma, p) => Math.round((soma + p.multa) * 100) / 100, 0);
        else {
          let restante = payment.valorCache;
          for (const penalty of penalties.filter((p) => p.musicianId === musicianId && !p.quitada && !p.reservaPaymentId && p.multa > 0)) {
            if (penalty.multa >= restante) continue;
            penalty.reservaPaymentId = id;
            restante = Math.round((restante - penalty.multa) * 100) / 100;
            desconto = Math.round((desconto + penalty.multa) * 100) / 100;
          }
        }
      }
      const tentativaId = `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
      tentativas.push({ id: tentativaId, paymentId: id, origem: "ATUAL", estado: "SOLICITANDO", referenciaExterna: tentativaId, asaasTransferId: null, solicitadaEm: new Date(), verificacaoIniciadaEm: null, encerradaEm: null, pedidoEnviadoEm: null });
      payment.repasseStatus = "PROCESSANDO";
      payment.multaDescontada = desconto;
      return { tentativaId, desconto };
    },
    findOpenAttempt: async (paymentId) => copiaDaTentativa(tentativas.find((t) => t.paymentId === paymentId && ABERTAS.includes(t.estado))),
    findOpenAttempts: async () => tentativas.filter((t) => ABERTAS.includes(t.estado)).map((t) => copiaDaTentativa(t)!),
    findAttempt: async (id) => copiaDaTentativa(tentativas.find((t) => t.id === id)),
    findAttemptByTransferId: async (transferId) => copiaDaTentativa(tentativas.find((t) => t.asaasTransferId === transferId)),
    registerTransfer: async (attemptId, transferId) => {
      const tentativa = tentativas.find((t) => t.id === attemptId);
      if (!tentativa || !transferId) return "RECUSADA";
      if (tentativa.asaasTransferId === transferId) return "JA_REGISTRADA";
      if (tentativas.some((t) => t.asaasTransferId === transferId)) return "RECUSADA";
      if (tentativa.estado === "FALHOU" || tentativa.estado === "AUSENCIA_CONFIRMADA") {
        registrarAlerta(attemptId, "RESPOSTA_TARDIA", transferId, null);
        return "TARDIA";
      }
      if (tentativa.asaasTransferId) {
        registrarAlerta(attemptId, "POSSIVEL_DUPLICIDADE", transferId, null);
        return "RECUSADA";
      }
      Object.assign(tentativa, { estado: "PENDENTE", asaasTransferId: transferId });
      payments.get(tentativa.paymentId)!.asaasTransferId = transferId;
      return "REGISTRADA";
    },
    markAttemptInconclusive: async (attemptId) => {
      const tentativa = tentativas.find((t) => t.id === attemptId);
      if (tentativa?.estado !== "SOLICITANDO") return false;
      tentativa.estado = "INCONCLUSIVA";
      return true;
    },
    registerRequestSent: async (attemptId) => {
      const tentativa = tentativas.find((t) => t.id === attemptId);
      if (tentativa?.estado !== "SOLICITANDO") return false;
      tentativa.pedidoEnviadoEm ??= new Date();
      return true;
    },
    markStaleAttempt: async (attemptId) => marcarParada(attemptId),
    markStaleAttempts: async () => {
      const paradas = tentativas.filter((t) => t.estado === "SOLICITANDO" && t.solicitadaEm.getTime() <= Date.now() - 10 * 60 * 1000);
      return paradas.filter((tentativa) => marcarParada(tentativa.id) !== "SEM_MUDANCA").length;
    },
    completeAttempt: async (attemptId, transferId) => {
      const tentativa = tentativas.find((t) => t.id === attemptId);
      if (!tentativa || !transferId) return "RECUSADA";
      if (tentativa.estado === "FALHOU" || tentativa.estado === "AUSENCIA_CONFIRMADA") {
        registrarAlerta(attemptId, "POSSIVEL_DUPLICIDADE", transferId, "DONE");
        return "ALERTA";
      }
      if (tentativa.asaasTransferId !== transferId) return "RECUSADA";
      const payment = payments.get(tentativa.paymentId)!;
      if (payment.status === "ESTORNADO") {
        if (tentativa.estado !== "CONCLUIDA") {
          Object.assign(tentativa, { estado: "CONCLUIDA", encerradaEm: new Date() });
          payment.repasseStatus = "REPASSADO";
        }
        registrarRepasseEEstorno(tentativa, "ESTORNO_ANTES_DA_CONCLUSAO");
        return "REPASSE_E_ESTORNO";
      }
      for (const penalty of penalties) if (penalty.reservaPaymentId === tentativa.paymentId && !penalty.quitada) penalty.quitada = true;
      if (tentativa.estado === "CONCLUIDA") return "JA_CONCLUIDA";
      Object.assign(tentativa, { estado: "CONCLUIDA", encerradaEm: new Date() });
      payments.get(tentativa.paymentId)!.repasseStatus = "REPASSADO";
      return "CONCLUIDA";
    },
    failAttempt: async (attemptId, transferId) => {
      const tentativa = tentativas.find((t) => t.id === attemptId);
      if (!tentativa) return false;
      if (transferId === null ? tentativa.estado !== "SOLICITANDO" || tentativa.asaasTransferId !== null : !["PENDENTE", "INCONCLUSIVA"].includes(tentativa.estado) || tentativa.asaasTransferId !== transferId) return false;
      encerrarSemRepasse(tentativa, "FALHOU");
      return true;
    },
    reopenFailedPayouts: async (musicianId) => {
      const fechadas = ["FALHOU", "AUSENCIA_CONFIRMADA"];
      const reabrir = [...payments.values()].filter((p) => p.status === "PAGO" && p.repasseStatus === "FALHOU" && p.asaasTransferId === null
        && p.refundStatus !== "PROCESSANDO" && p.refundStatus !== "CONFIRMADO"
        && events.get(p.eventId ?? "")?.musicoContratadoId === musicianId
        && tentativas.every((t) => t.paymentId !== p.id || fechadas.includes(t.estado))
        && !alertas.some((a) => tentativas.some((t) => t.id === a.tentativaId && t.paymentId === p.id)));
      for (const p of reabrir) p.repasseStatus = "RETIDO";
      return reabrir.length;
    },
    recordAttemptAlert: async (attemptId, tipo, transferId, status) => registrarAlerta(attemptId, tipo, transferId, status),
    absenceDeclaration: async () => DECLARACAO_AUSENCIA,
    startAbsenceCheck: async (attemptId, evidencia) => {
      const tentativa = tentativas.find((t) => t.id === attemptId);
      if (!tentativa) return "TENTATIVA_NAO_ENCONTRADA";
      if (tentativa.estado !== "INCONCLUSIVA") return "ESTADO_INVALIDO";
      if (tentativa.asaasTransferId) return "TRANSFERENCIA_CONHECIDA";
      const recusa = validarBusca(tentativa, tentativa.solicitadaEm.getTime() + 24 * HORA_MS, evidencia);
      if (recusa) return recusa;
      Object.assign(tentativa, { estado: "EM_VERIFICACAO", verificacaoIniciadaEm: new Date() });
      decisoes.push({ tentativaId: attemptId, etapa: "VERIFICACAO", operadorNomeInformado: evidencia.operador.trim(), identidadeAutenticada: false, declaracao: null, paginas: evidencia.paginas, listadas: evidencia.listadas });
      return "VERIFICACAO_INICIADA";
    },
    confirmAbsence: async (attemptId, evidencia, declaracao) => {
      if (declaracao !== DECLARACAO_AUSENCIA) return "DECLARACAO_INVALIDA";
      const tentativa = tentativas.find((t) => t.id === attemptId);
      if (!tentativa) return "TENTATIVA_NAO_ENCONTRADA";
      if (tentativa.estado !== "EM_VERIFICACAO" || payments.get(tentativa.paymentId)!.repasseStatus !== "PROCESSANDO") return "ESTADO_INVALIDO";
      const recusa = validarBusca(tentativa, tentativa.verificacaoIniciadaEm!.getTime() + HORA_MS, evidencia);
      if (recusa) return recusa;
      encerrarSemRepasse(tentativa, "AUSENCIA_CONFIRMADA");
      decisoes.push({ tentativaId: attemptId, etapa: "CONFIRMACAO", operadorNomeInformado: evidencia.operador.trim(), identidadeAutenticada: false, declaracao, paginas: evidencia.paginas, listadas: evidencia.listadas });
      return "AUSENCIA_CONFIRMADA";
    },
    getAsaasCustomerId: async (contractorId) => customers.get(contractorId) ?? null,
    setAsaasCustomerId: async (contractorId, customerId) => void customers.set(contractorId, customerId),
    webhookEventExists: async (id) => webhookEvents.has(id),
    recordWebhookEvent: async (event) => void webhookEvents.add(event.id),
  };

  const asaas: AsaasGateway = {
    createCustomer: async () => {
      asaasCalls.createCustomer++;
      return nextId("cus_");
    },
    createPixCharge: async (charge) => {
      if (failures.staleCustomer) {
        failures.staleCustomer = false;
        throw new AppError(502, "PAGAMENTO_CLIENTE_INVALIDO", "cliente de outra conta da Asaas");
      }
      asaasCalls.createPixCharge.push({ value: charge.value, customer: charge.customer });
      const id = nextId("pay_");
      asaasCharges.set(id, { status: "PENDING", value: charge.value });
      return id;
    },
    getPixQrCode: async (paymentId) => ({ payload: `pix-${paymentId}`, encodedImage: "base64" }),
    getPayment: async (paymentId) => asaasCharges.get(paymentId) ?? null,
    cancelCharge: async (paymentId) => {
      asaasCalls.cancelCharge.push(paymentId);
      asaasCharges.delete(paymentId);
      return { removida: true };
    },
    refundPayment: async (paymentId) => {
      if (failures.refund) throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "falha simulada no estorno");
      asaasCalls.refundPayment.push(paymentId);
      asaasCharges.set(paymentId, { ...asaasCharges.get(paymentId)!, status: "REFUNDED" });
    },
    transferPix: async (transfer) => {
      if (failures.transfer) throw new AppError(422, "PAGAMENTO_DADOS_INVALIDOS", "falha simulada na transferência");
      if (failures.transferUnavailable) throw new AppError(503, "PAGAMENTO_LIMITE", "a Asaas recusou o pedido antes de criar a transferência");
      asaasCalls.transferPix.push({ value: transfer.value, pixAddressKey: transfer.pixAddressKey, pixAddressKeyType: transfer.pixAddressKeyType, externalReference: transfer.externalReference });
      const id = nextId("tra_");
      asaasTransfers.set(id, "PENDING");
      asaasTransferDetails.set(id, { externalReference: transfer.externalReference, value: transfer.value });
      if (failures.transferLost) throw new AppError(502, "PAGAMENTO_INDISPONIVEL", "resposta perdida depois de a Asaas criar a transferência");
      return { id, status: asaasTransfers.get(id)! };
    },
    getTransfer: async (transferId) => (asaasTransfers.has(transferId) ? toTransfer(transferId) : null),
    findTransfersByReference: async (reference, createdSince, maxPages) => {
      asaasCalls.findTransfersByReference.push({ reference, maxPages });
      if (failures.transferSearchIncomplete) throw new AppError(502, "PAGAMENTO_BUSCA_INCOMPLETA", "busca de transferências incompleta");
      const todas = [...asaasTransfers.keys()].map(toTransfer);
      return {
        encontradas: todas.filter((transfer) => transfer.externalReference === reference),
        referencia: reference,
        desde: new Date(createdSince.getTime() - 24 * HORA_MS).toISOString().slice(0, 10),
        iniciadaEm: new Date(),
        paginas: 1,
        listadas: todas.length,
      };
    },
    createSubscription: async (subscription) => {
      if (failures.staleCustomer) {
        failures.staleCustomer = false;
        throw new AppError(502, "PAGAMENTO_CLIENTE_INVALIDO", "cliente de outra conta da Asaas");
      }
      const id = nextId("sub_");
      asaasSubscriptions.set(id, { ...subscription, payments: [{ id: nextId("pay_"), status: "PENDING", dueDate: subscription.nextDueDate }], cancelled: false });
      return id;
    },
    listSubscriptionPayments: async (subscriptionId) => asaasSubscriptions.get(subscriptionId)?.payments ?? [],
    cancelSubscription: async (subscriptionId) => {
      const subscription = asaasSubscriptions.get(subscriptionId);
      if (subscription) subscription.cancelled = true;
    },
  };

  const travaDaRotina = criarTravaEmMemoria();

  return {
    accounts,
    events,
    enderecos,
    candidates,
    messages,
    penalties,
    tentativas,
    alertas,
    decisoes,
    asaasTransferDetails,
    disputes,
    pagamentoDaContestacao,
    resolucaoDaContestacao,
    favorites,
    invites,
    notifications,
    payments,
    reviews,
    images,
    webhookEvents,
    asaasCharges,
    asaasTransfers,
    asaasSubscriptions,
    asaasCalls,
    failures,
    sent,
    stores: { accounts: accountStore, events: eventStore, payments: paymentStore, images: imageStore, asaas, mailer, inbox, trava: travaDaRotina.store },
    travaDaRotina: travaDaRotina.estado,
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
        inscricoesEncerradas: false,
        ausenciaInformadaEm: null,
        createdAt: hoursFromNow(-48),
        ...overrides,
      };
      events.set(event.id, event);
      enderecos.set(event.id, "Rua das Flores, 123 - Centro");
      return event;
    },
    seedCandidate(eventId: string, musicianId: string, status: CandidateRecord["status"] = "PENDENTE"): CandidateRecord {
      const candidate: CandidateRecord = { id: nextId("cand"), eventId, musicianId, status, valorProposto: null, motivoRecusa: status === "RECUSADO" ? "CONTRATANTE" : null };
      candidates.set(candidate.id, candidate);
      return candidate;
    },
  };
}

export function payAtAsaas(world: ReturnType<typeof memoryWorld>, asaasPaymentId: string): void {
  const charge = world.asaasCharges.get(asaasPaymentId)!;
  world.asaasCharges.set(asaasPaymentId, { ...charge, status: "RECEIVED" });
}

export function criarTravaEmMemoria(relogio: () => number = Date.now) {
  const estado = {
    dono: null as string | null,
    geracao: 0,
    validaAte: null as number | null,
    ultimoResultado: null as "SUCESSO" | "FALHA" | "EXPIRADA" | null,
    ultimoSucessoEm: null as number | null,
    ultimoErro: null as string | null,
    chamadas: { adquirir: 0, renovar: 0, encerrar: 0 },
  };
  const store: TravaDaRotina = {
    adquirir: async (dono, validadeSegundos) => {
      estado.chamadas.adquirir++;
      const agora = relogio();
      if (estado.dono && estado.validaAte !== null && estado.validaAte > agora) return null;
      if (estado.dono) Object.assign(estado, { ultimoResultado: "EXPIRADA", ultimoErro: "A execução anterior perdeu a validade sem encerrar." });
      Object.assign(estado, { dono, geracao: estado.geracao + 1, validaAte: agora + validadeSegundos * 1000 });
      return estado.geracao;
    },
    renovar: async (dono, geracao, validadeSegundos) => {
      estado.chamadas.renovar++;
      const agora = relogio();
      if (estado.dono !== dono || estado.geracao !== geracao || estado.validaAte === null || estado.validaAte <= agora) return false;
      estado.validaAte = agora + validadeSegundos * 1000;
      return true;
    },
    encerrar: async (dono, geracao, resultado, erro) => {
      estado.chamadas.encerrar++;
      if (estado.dono !== dono || estado.geracao !== geracao) return false;
      Object.assign(estado, {
        dono: null,
        validaAte: null,
        ultimoResultado: resultado,
        ultimoSucessoEm: resultado === "SUCESSO" ? relogio() : estado.ultimoSucessoEm,
        ultimoErro: resultado === "SUCESSO" ? null : (erro ?? "Falha sem detalhe.").slice(0, 500),
      });
      return true;
    },
  };
  return { estado, store };
}
