import { CONCLUSAO_AUTOMATICA_MS, eventMatchesMusician, hasCancellationNotice, imageProblem } from "../../../shared/dominio.ts";
import type { Account, Role } from "../domain/account.ts";
import type { CandidateRecord, EventInput, EventRecord, MessageRecord, ReviewInput } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser, type ImageStore } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import type { PaymentService } from "./paymentService.ts";
import type { EventStore } from "./ports.ts";

const prazoEncerrado = (event: EventRecord, now: Date) => now.getTime() - event.inicio.getTime() >= CONCLUSAO_AUTOMATICA_MS;

const naoEncontrado = () => new AppError(404, "EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");

function assertImage(file: File): void {
  const problem = imageProblem(file);
  if (problem) throw new AppError(400, "IMAGEM_INVALIDA", problem);
}

type Party = "contratante" | "musico";

const changedForCandidates = (before: EventRecord, after: EventRecord) =>
  before.inicio.getTime() !== after.inicio.getTime()
  || before.duracaoMinutos !== after.duracaoMinutos
  || before.cache !== after.cache
  || before.uf !== after.uf
  || before.cidade !== after.cidade
  || before.estilosMusicais.join() !== after.estilosMusicais.join();

const partyOf = (event: EventRecord, user: AuthUser): Party | null =>
  event.contractorId === user.id ? "contratante" : event.musicoContratadoId === user.id ? "musico" : null;

export function createEventService(deps: {
  events: EventStore;
  accounts: AccountStore;
  images: ImageStore;
  payments: Pick<PaymentService, "ensureNoActiveCheckout" | "payout" | "refundHiring" | "findPayment" | "refreshRefund" | "ensurePaidForNoRefund">;
  notifier: Pick<Notifier, "hiringCancelled" | "noShowReported" | "newApplication" | "newMessage" | "candidateDeclined" | "eventUpdated" | "completionConfirmed">;
}) {
  const { events, accounts, images, payments, notifier } = deps;

  async function requireRole(user: AuthUser, role: Role, message: string): Promise<Account> {
    const account = await accounts.findAccount(user.id);
    if (account?.role !== role) throw new AppError(403, "PERFIL_NAO_AUTORIZADO", message);
    return account;
  }

  function assertFuture(inicio: Date, now: Date): void {
    if (inicio <= now) throw new AppError(400, "DATA_NO_PASSADO", "O horário de início não pode ser inferior ao horário atual.");
  }

  async function findEditableEvent(user: AuthUser, eventId: string, now: Date): Promise<EventRecord> {
    const event = await events.findEvent(eventId);
    if (!event || event.contractorId !== user.id) throw naoEncontrado();
    if (event.status !== "ABERTO" || event.musicoContratadoId) {
      throw new AppError(
        409,
        "EVENTO_BLOQUEADO",
        "Evento com músico contratado. Não é mais possível alterar os dados ou excluir esta oportunidade.",
      );
    }
    await payments.ensureNoActiveCheckout(eventId, now);
    return event;
  }

  async function saveEvent(user: AuthUser, current: EventRecord, input: EventInput, imagem: File | null): Promise<EventRecord> {
    if (!imagem) return events.updateEvent(current.id, input);
    assertImage(imagem);
    const imagemUrl = await images.upload("event-banners", user.id, imagem);
    try {
      const updated = await events.updateEvent(current.id, { ...input, imagemUrl });
      await images.removeByUrl("event-banners", current.imagemUrl).catch(() => {});
      return updated;
    } catch (error) {
      await images.removeByUrl("event-banners", imagemUrl).catch(() => {});
      throw error;
    }
  }

  async function findConversation(user: AuthUser, candidateId: string): Promise<{ event: EventRecord; candidate: CandidateRecord }> {
    const candidate = await events.findCandidateById(candidateId);
    const event = candidate && (await events.findEvent(candidate.eventId));
    if (!event || !candidate || (candidate.musicianId !== user.id && event.contractorId !== user.id)) {
      throw new AppError(404, "CONVERSA_NAO_ENCONTRADA", "Conversa não encontrada.");
    }
    return { event, candidate };
  }

  async function findEventAsParty(user: AuthUser, eventId: string): Promise<{ event: EventRecord; party: Party }> {
    const event = await events.findEvent(eventId);
    const party = event && partyOf(event, user);
    if (!event || !party) throw naoEncontrado();
    return { event, party };
  }

  const contact = (account: Account | null) => account && { nome: account.nome, telefone: account.telefone ?? "", fotoPerfilUrl: account.fotoPerfilUrl ?? "" };

  return {
    async createEvent(user: AuthUser, input: EventInput, imagem: File | null, now = new Date()): Promise<EventRecord> {
      const contractor = await requireRole(user, "CONTRACTOR", "Apenas contratantes podem criar eventos.");
      assertProfileComplete(contractor, "criarEvento");
      assertFuture(input.inicio, now);
      if (!imagem) throw new AppError(400, "IMAGEM_OBRIGATORIA", "Adicione uma foto ilustrativa do evento.");
      assertImage(imagem);

      const imagemUrl = await images.upload("event-banners", user.id, imagem);
      try {
        return await events.insertEvent(user.id, { ...input, imagemUrl });
      } catch (error) {
        await images.removeByUrl("event-banners", imagemUrl).catch(() => {});
        throw error;
      }
    },

    async updateEvent(user: AuthUser, eventId: string, input: EventInput, imagem: File | null, now = new Date()): Promise<EventRecord> {
      const current = await findEditableEvent(user, eventId, now);
      assertFuture(input.inicio, now);
      const updated = await saveEvent(user, current, input, imagem);
      const pending = (await events.listCandidates(eventId)).filter((c) => c.status === "PENDENTE").map((c) => c.musicianId);
      if (pending.length > 0 && changedForCandidates(current, updated)) void notifier.eventUpdated(updated, pending);
      return updated;
    },

    async deleteEvent(user: AuthUser, eventId: string, now = new Date()): Promise<void> {
      const event = await findEditableEvent(user, eventId, now);
      await events.deleteEvent(eventId);
      await images.removeByUrl("event-banners", event.imagemUrl).catch(() => {});
    },

    async apply(user: AuthUser, eventId: string, valorProposto: number | null = null, now = new Date()): Promise<void> {
      const musician = await requireRole(user, "MUSICIAN", "Apenas músicos podem se inscrever em eventos.");
      assertProfileComplete(musician, "candidatar");
      const event = await events.findEvent(eventId);
      if (!event) throw naoEncontrado();
      if (event.status !== "ABERTO" || event.inicio <= now) {
        throw new AppError(409, "INSCRICOES_ENCERRADAS", "As inscrições para este evento estão encerradas.");
      }
      const distanciaKm = await events.distanceKm(eventId, user.id);
      if (!eventMatchesMusician(event, { uf: musician.uf!, cidade: musician.cidade!, estilosMusicais: musician.estilosMusicais ?? [] }, distanciaKm)) {
        throw new AppError(403, "EVENTO_INCOMPATIVEL", "Este evento não é compatível com a região e os estilos do seu perfil.");
      }
      const candidate = await events.insertCandidate(eventId, user.id, valorProposto === event.cache ? null : valorProposto);
      void notifier.newApplication(event, candidate.valorProposto);
    },

    async declineCandidate(user: AuthUser, eventId: string, candidateId: string, now = new Date()): Promise<void> {
      const event = await events.findEvent(eventId);
      if (!event || event.contractorId !== user.id) throw naoEncontrado();
      const candidate = await events.findCandidateById(candidateId);
      if (!candidate || candidate.eventId !== eventId) throw new AppError(404, "CANDIDATURA_NAO_ENCONTRADA", "Inscrição não encontrada.");
      if (event.status !== "ABERTO" || candidate.status !== "PENDENTE") {
        throw new AppError(409, "CANDIDATURA_INDISPONIVEL", "Esta inscrição não está mais aguardando resposta.");
      }
      await payments.ensureNoActiveCheckout(eventId, now);
      if (await events.declineCandidate(candidateId)) void notifier.candidateDeclined(event, candidate.musicianId);
    },

    async updateProposal(user: AuthUser, eventId: string, valorProposto: number | null, now = new Date()): Promise<void> {
      const event = await events.findEvent(eventId);
      const candidate = event && (await events.findCandidate(eventId, user.id));
      if (!event || !candidate) throw new AppError(404, "CANDIDATURA_NAO_ENCONTRADA", "Inscrição não encontrada.");
      if (event.status !== "ABERTO" || candidate.status !== "PENDENTE") {
        throw new AppError(409, "PROPOSTA_INDISPONIVEL", "O valor só pode ser alterado enquanto a inscrição aguarda resposta.");
      }
      await payments.ensureNoActiveCheckout(eventId, now);
      await events.updateCandidateProposal(candidate.id, valorProposto === event.cache ? null : valorProposto);
    },

    async sendMessage(user: AuthUser, candidateId: string, texto: string): Promise<MessageRecord> {
      const { event, candidate } = await findConversation(user, candidateId);
      if (candidate.status === "RECUSADO" || (event.status !== "ABERTO" && event.status !== "CONTRATADO")) {
        throw new AppError(409, "CONVERSA_ENCERRADA", "Esta conversa está encerrada.");
      }
      const message = await events.insertMessage({ candidateId, authorId: user.id, texto });
      void notifier.newMessage(event, candidate, user.id);
      return message;
    },

    async cancelApplication(user: AuthUser, eventId: string, now = new Date()): Promise<void> {
      const event = await events.findEvent(eventId);
      const candidate = event && (await events.findCandidate(eventId, user.id));
      if (!event || !candidate) throw new AppError(404, "CANDIDATURA_NAO_ENCONTRADA", "Inscrição não encontrada.");
      if (candidate.status === "APROVADO") {
        throw new AppError(409, "JA_CONTRATADO", "Você já foi contratado para este evento. Para desistir, cancele a contratação.");
      }
      if (!hasCancellationNotice(event.inicio, now)) {
        throw new AppError(409, "CANCELAMENTO_INDISPONIVEL", "Cancelamento indisponível (menos de 24h para o evento).");
      }
      await payments.ensureNoActiveCheckout(eventId, now);
      await events.deleteCandidate(candidate.id);
    },

    async getHiring(user: AuthUser, eventId: string, now = new Date()) {
      await findEventAsParty(user, eventId);
      await payments.refreshRefund(eventId).catch((error: unknown) => {
        console.error("Falha ao consultar estorno da contratação", error instanceof AppError ? error.code : "falha inesperada");
      });
      const found = await findEventAsParty(user, eventId);
      const { party } = found;
      let { event } = found;
      if (event.status === "ABERTO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento ainda não tem um músico contratado.");

      const estornoPendente = (await payments.findPayment(eventId))?.refundStatus === "PROCESSANDO";
      if (event.status === "CONTRATADO" && !estornoPendente && prazoEncerrado(event, now)) {
        event = await events.concludeEvent(eventId);
      }
      if ((event.status === "CONCLUIDO" || event.status === "CANCELADO") && !estornoPendente) await payments.payout(eventId);

      const [contratante, musico, endereco, payment, avaliou] = await Promise.all([
        accounts.findAccount(event.contractorId),
        event.musicoContratadoId ? accounts.findAccount(event.musicoContratadoId) : null,
        events.findEndereco(eventId),
        payments.findPayment(eventId),
        events.hasReviewed(eventId, user.id),
      ]);
      const antesDoInicio = event.inicio > now;

      return {
        papel: party,
        evento: {
          id: event.id,
          titulo: event.titulo,
          tipoEvento: event.tipoEvento,
          inicio: event.inicio.toISOString(),
          duracaoMinutos: event.duracaoMinutos,
          cidade: event.cidade,
          uf: event.uf,
          endereco,
          estilosMusicais: event.estilosMusicais,
          formacao: event.formacao,
          somDisponivel: event.somDisponivel,
          status: event.status,
          confirmacaoMusico: event.confirmacaoMusico,
          confirmacaoContratante: event.confirmacaoContratante,
        },
        contratante: contact(contratante),
        musico: contact(musico),
        pagamento: payment && {
          cache: payment.valorCache,
          comissao: payment.valorComissao,
          total: payment.valor,
          status: payment.status,
          repasseStatus: payment.repasseStatus,
          refundStatus: payment.refundStatus,
        },
        avaliou,
        naoComparecimento: { permitido: party === "contratante" && event.status === "CONTRATADO" && !antesDoInicio && !event.confirmacaoMusico && !event.confirmacaoContratante && !prazoEncerrado(event, now) && payment?.refundStatus !== "PROCESSANDO" },
        cancelamento: {
          permitido: event.status === "CONTRATADO" && antesDoInicio && payment?.refundStatus !== "PROCESSANDO",
          reembolso: party === "musico" || hasCancellationNotice(event.inicio, now),
        },
      };
    },

    async cancelHiring(user: AuthUser, eventId: string, now = new Date()): Promise<{ situacao: "ESTORNADO" | "ESTORNO_PROCESSANDO" | "SEM_ESTORNO" }> {
      const { event, party } = await findEventAsParty(user, eventId);
      if (event.status !== "CONTRATADO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento não tem uma contratação ativa.");
      if (event.inicio <= now) {
        throw new AppError(409, "EVENTO_JA_INICIADO", "O evento já começou. Use a confirmação do show para concluir a contratação.");
      }

      if (party === "musico") {
        const status = await payments.refundHiring(eventId, "REABRIR");
        return { situacao: status === "ESTORNADO" ? "ESTORNADO" : "ESTORNO_PROCESSANDO" };
      }
      const reembolsado = hasCancellationNotice(event.inicio, now);
      if (reembolsado) {
        const status = await payments.refundHiring(eventId, "CANCELAR");
        return { situacao: status === "ESTORNADO" ? "ESTORNADO" : "ESTORNO_PROCESSANDO" };
      }
      await payments.ensurePaidForNoRefund(eventId);
      await events.cancelEvent(eventId);
      await payments.payout(eventId);
      void notifier.hiringCancelled(event, "contratante", false);
      return { situacao: "SEM_ESTORNO" };
    },

    async reportNoShow(user: AuthUser, eventId: string, now = new Date()): Promise<{ situacao: "ESTORNADO" | "ESTORNO_PROCESSANDO" }> {
      const { event, party } = await findEventAsParty(user, eventId);
      if (party !== "contratante") throw naoEncontrado();
      if (event.status !== "CONTRATADO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento não tem uma contratação ativa.");
      if (event.inicio > now) throw new AppError(409, "EVENTO_NAO_INICIADO", "O não comparecimento só pode ser registrado após o horário do evento.");
      if (event.confirmacaoMusico) {
        throw new AppError(409, "MUSICO_CONFIRMOU", "O músico confirmou a realização do show. Para contestar, entre em contato com o suporte.");
      }
      if (event.confirmacaoContratante) {
        throw new AppError(409, "CONTRATANTE_CONFIRMOU", "Você já confirmou a realização do show.");
      }
      if (prazoEncerrado(event, now)) {
        throw new AppError(409, "PRAZO_ENCERRADO", "O prazo de 7 dias para registrar o não comparecimento terminou.");
      }
      const status = await payments.refundHiring(eventId, "NAO_COMPARECIMENTO");
      return { situacao: status === "ESTORNADO" ? "ESTORNADO" : "ESTORNO_PROCESSANDO" };
    },

    async confirmCompletion(user: AuthUser, eventId: string, now = new Date()): Promise<EventRecord> {
      const { event, party } = await findEventAsParty(user, eventId);
      if (event.status === "CONCLUIDO") return event;
      if (event.status !== "CONTRATADO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento não tem um músico contratado.");
      if (event.inicio > now) throw new AppError(409, "EVENTO_NAO_INICIADO", "A confirmação fica disponível após o início do evento.");
      if ((await payments.findPayment(eventId))?.refundStatus === "PROCESSANDO") {
        throw new AppError(409, "ESTORNO_PENDENTE", "A confirmação do show fica suspensa até a resolução do estorno.");
      }

      const updated = await events.setConfirmation(eventId, party);
      if (updated.status === "CONCLUIDO") await payments.payout(eventId);
      else void notifier.completionConfirmed(updated, party);
      return updated;
    },

    async review(user: AuthUser, eventId: string, input: ReviewInput): Promise<void> {
      const { event, party } = await findEventAsParty(user, eventId);
      if (event.status !== "CONCLUIDO") {
        throw new AppError(409, "EVENTO_NAO_CONCLUIDO", "A avaliação é liberada após as duas partes confirmarem o evento.");
      }
      const reviewedId = party === "contratante" ? event.musicoContratadoId : event.contractorId;
      if (!reviewedId) throw new AppError(409, "AVALIADO_INDISPONIVEL", "A outra parte não está mais na plataforma.");
      await events.insertReview({ eventId, authorId: user.id, reviewedId, rating: input.rating, comment: input.comment || undefined });
    },
  };
}

export type EventService = ReturnType<typeof createEventService>;
