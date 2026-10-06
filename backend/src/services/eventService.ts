import { CONCLUSAO_AUTOMATICA_MS, eventMatchesMusician, hasCancellationNotice, imageProblem } from "../../../shared/dominio.ts";
import type { Account, Role } from "../domain/account.ts";
import type { EventInput, EventRecord, ReviewInput } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser, type ImageStore } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import type { PaymentService } from "./paymentService.ts";
import type { EventStore } from "./ports.ts";

const naoEncontrado = () => new AppError(404, "EVENTO_NAO_ENCONTRADO", "Evento não encontrado.");

function assertImage(file: File): void {
  const problem = imageProblem(file);
  if (problem) throw new AppError(400, "IMAGEM_INVALIDA", problem);
}

type Party = "contratante" | "musico";

const partyOf = (event: EventRecord, user: AuthUser): Party | null =>
  event.contractorId === user.id ? "contratante" : event.musicoContratadoId === user.id ? "musico" : null;

export function createEventService(deps: {
  events: EventStore;
  accounts: AccountStore;
  images: ImageStore;
  payments: Pick<PaymentService, "ensureNoActiveCheckout" | "payout" | "refundHiring" | "findPayment">;
  notifier: Pick<Notifier, "hiringCancelled" | "noShowReported">;
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

  /** Evento do próprio contratante, ainda aberto e sem cobrança em andamento. */
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

  /** Evento em que o usuário é parte (contratante ou músico contratado). */
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
      if (!imagem) return events.updateEvent(eventId, input);

      assertImage(imagem);
      const imagemUrl = await images.upload("event-banners", user.id, imagem);
      try {
        const updated = await events.updateEvent(eventId, { ...input, imagemUrl });
        await images.removeByUrl("event-banners", current.imagemUrl).catch(() => {});
        return updated;
      } catch (error) {
        await images.removeByUrl("event-banners", imagemUrl).catch(() => {});
        throw error;
      }
    },

    async deleteEvent(user: AuthUser, eventId: string, now = new Date()): Promise<void> {
      const event = await findEditableEvent(user, eventId, now);
      await events.deleteEvent(eventId);
      await images.removeByUrl("event-banners", event.imagemUrl).catch(() => {});
    },

    async apply(user: AuthUser, eventId: string, now = new Date()): Promise<void> {
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
      await events.insertCandidate(eventId, user.id);
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

    /**
     * Comprovante da contratação, visível apenas às duas partes: dados do evento,
     * endereço, contato de cada lado, valores e situação do pagamento e do repasse.
     */
    async getHiring(user: AuthUser, eventId: string, now = new Date()) {
      const found = await findEventAsParty(user, eventId);
      const { party } = found;
      let { event } = found;
      if (event.status === "ABERTO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento ainda não tem um músico contratado.");

      // Sem agendador de tarefas, a conclusão por prazo é avaliada quando uma das partes consulta.
      const umaConfirmacao = event.confirmacaoMusico || event.confirmacaoContratante;
      if (event.status === "CONTRATADO" && umaConfirmacao && now.getTime() - event.inicio.getTime() >= CONCLUSAO_AUTOMATICA_MS) {
        event = await events.concludeEvent(eventId);
      }
      if (event.status === "CONCLUIDO") await payments.payout(eventId);

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
        },
        avaliou,
        // Garantia: após o horário do evento, enquanto o músico não confirmar, o contratante pode registrar o não comparecimento.
        naoComparecimento: { permitido: party === "contratante" && event.status === "CONTRATADO" && !antesDoInicio && !event.confirmacaoMusico },
        cancelamento: {
          permitido: event.status === "CONTRATADO" && antesDoInicio,
          // O músico sempre devolve o valor ao desistir; o contratante só é reembolsado com 24h de antecedência.
          reembolso: party === "musico" || hasCancellationNotice(event.inicio, now),
        },
      };
    },

    /**
     * Cancela uma contratação antes do início do evento.
     *   - Contratante, com mais de 24h de antecedência: estorno integral; evento cancelado.
     *   - Contratante, com menos de 24h: sem estorno; o cachê é repassado ao músico.
     *   - Músico contratado: estorno integral ao contratante; o evento volta a ficar aberto.
     */
    async cancelHiring(user: AuthUser, eventId: string, now = new Date()): Promise<{ reembolsado: boolean }> {
      const { event, party } = await findEventAsParty(user, eventId);
      if (event.status !== "CONTRATADO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento não tem uma contratação ativa.");
      if (event.inicio <= now) {
        throw new AppError(409, "EVENTO_JA_INICIADO", "O evento já começou. Use a confirmação do show para concluir a contratação.");
      }

      if (party === "musico") {
        await payments.refundHiring(eventId);
        await events.reopenEvent(eventId);
        void notifier.hiringCancelled(event, "musico", true);
        return { reembolsado: true };
      }
      const reembolsado = hasCancellationNotice(event.inicio, now);
      if (reembolsado) await payments.refundHiring(eventId);
      await events.cancelEvent(eventId);
      if (!reembolsado) await payments.payout(eventId);
      void notifier.hiringCancelled(event, "contratante", reembolsado);
      return { reembolsado };
    },

    /**
     * Garantia do contratante: se o músico não compareceu (e não confirmou o show),
     * o valor é devolvido integralmente. Se o músico já confirmou, há conflito de
     * versões, que o MVP não arbitra.
     */
    async reportNoShow(user: AuthUser, eventId: string, now = new Date()): Promise<void> {
      const { event, party } = await findEventAsParty(user, eventId);
      if (party !== "contratante") throw naoEncontrado();
      if (event.status !== "CONTRATADO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento não tem uma contratação ativa.");
      if (event.inicio > now) throw new AppError(409, "EVENTO_NAO_INICIADO", "O não comparecimento só pode ser registrado após o horário do evento.");
      if (event.confirmacaoMusico) {
        throw new AppError(409, "MUSICO_CONFIRMOU", "O músico confirmou a realização do show. Para contestar, entre em contato com o suporte.");
      }
      await payments.refundHiring(eventId);
      await events.cancelEvent(eventId);
      void notifier.noShowReported(event);
    },

    /** Cada parte confirma, pelo próprio acesso, que o show aconteceu. A conclusão libera o repasse. */
    async confirmCompletion(user: AuthUser, eventId: string, now = new Date()): Promise<EventRecord> {
      const { event, party } = await findEventAsParty(user, eventId);
      if (event.status === "CONCLUIDO") return event;
      if (event.status !== "CONTRATADO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento não tem um músico contratado.");
      if (event.inicio > now) throw new AppError(409, "EVENTO_NAO_INICIADO", "A confirmação fica disponível após o início do evento.");

      const updated = await events.setConfirmation(eventId, party);
      if (updated.status === "CONCLUIDO") await payments.payout(eventId);
      return updated;
    },

    /** Avaliação mútua, liberada após a conclusão: cada parte avalia a outra uma única vez. */
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
