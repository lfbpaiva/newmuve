import { AUSENCIA_PRAZO_RESPOSTA_MS, CONCLUSAO_AUTOMATICA_MS, emAcessoAntecipado, eventMatchesMusician, hasCancellationNotice, imageProblem, isPro, liberadoParaTodosEm, PRO_RAIO_MAXIMO_KM, RAIO_MAXIMO_KM, valorDaInscricao } from "../../../shared/dominio.ts";
import { formatCurrency, formatDateTime } from "../../../shared/formato.ts";
import type { Account, Role } from "../domain/account.ts";
import type { CandidateRecord, DecisaoContestacao, EventInput, EventRecord, MessageRecord, ReviewInput } from "../domain/event.ts";
import { AppError } from "../domain/errors.ts";
import { assertProfileComplete, type AccountStore, type AuthUser, type ImageStore } from "./accountService.ts";
import type { Notifier } from "./notifications.ts";
import type { PaymentService } from "./paymentService.ts";
import type { EventStore } from "./ports.ts";
import { seguirApesarDe } from "./falhas.ts";

const prazoEncerrado = (event: EventRecord, now: Date) => now.getTime() - event.inicio.getTime() >= CONCLUSAO_AUTOMATICA_MS;
const prazoDaResposta = (informadaEm: Date) => new Date(informadaEm.getTime() + AUSENCIA_PRAZO_RESPOSTA_MS);
const ausenciaPendente = (event: EventRecord) => event.status === "CONTRATADO" && event.ausenciaInformadaEm !== null;
const respostaEncerrada = (event: EventRecord, now: Date) => event.ausenciaInformadaEm !== null && now >= prazoDaResposta(event.ausenciaInformadaEm);
const respostaForaDoPrazo = () => new AppError(409, "PRAZO_DE_RESPOSTA_ENCERRADO", "O prazo de 24 horas para responder ao não comparecimento terminou.");
const MOTIVO_DA_RESPOSTA = "O contratante informou que o músico não compareceu, e o músico confirmou que fez o show.";

const podeContestar = (event: EventRecord, payment: { status: string; repasseStatus: string | null; refundStatus: string | null } | null, now: Date) =>
  (event.status === "CONTRATADO" || event.status === "CONCLUIDO")
  && event.inicio <= now
  && payment?.status === "PAGO"
  && (payment.repasseStatus === "RETIDO" || payment.repasseStatus === "FALHOU")
  && payment.refundStatus !== "PROCESSANDO";

const musicoOcupado = () => new AppError(409, "MUSICO_OCUPADO", "O músico já tem um show contratado nesse horário.");
const contestacaoPendente = () => new AppError(409, "CONTESTACAO_ABERTA", "Há uma contestação aberta; o suporte vai decidir o resultado do show.");
const contestacaoIndisponivel = () =>
  new AppError(409, "CONTESTACAO_INDISPONIVEL", "A contestação fica disponível depois do início do show e até o repasse do cachê.");

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
  payments: Pick<PaymentService, "ensureNoActiveCheckout" | "refundHiring" | "findPayment" | "refreshRefund" | "ensurePaidForNoRefund">;
  notifier: Pick<Notifier, "hiringCancelled" | "noShowReported" | "absenceReported" | "newApplication" | "newMessage" | "candidateDeclined" | "eventUpdated" | "completionConfirmed" | "eventDeleted" | "candidateOutOfRange" | "applicantLeft" | "disputeOpened" | "disputeResolved" | "invited">;
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
      await images.removeByUrl("event-banners", current.imagemUrl).catch(seguirApesarDe("Capa antiga do evento não removida", undefined));
      return updated;
    } catch (error) {
      await images.removeByUrl("event-banners", imagemUrl).catch(seguirApesarDe("Capa nova do evento não removida depois da falha", undefined));
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

  async function findOpenNegotiation(user: AuthUser, candidateId: string, now: Date): Promise<{ event: EventRecord; candidate: CandidateRecord }> {
    const found = await findConversation(user, candidateId);
    if (found.event.status !== "ABERTO" || found.candidate.status !== "PENDENTE" || found.event.inicio <= now) {
      throw new AppError(409, "NEGOCIACAO_ENCERRADA", "O valor só pode ser negociado enquanto a inscrição aguarda resposta.");
    }
    await payments.ensureNoActiveCheckout(found.event.id, now);
    return found;
  }

  async function pedirEstornoDaAusenciaVencida(eventId: string, now: Date): Promise<{ situacao: "ESTORNADO" | "ESTORNO_PROCESSANDO" } | null> {
    const event = await events.findEvent(eventId);
    if (!event || !ausenciaPendente(event) || event.confirmacaoMusico || !respostaEncerrada(event, now)) return null;
    if (await events.findOpenDispute(eventId)) return null;
    const status = await payments.refundHiring(eventId, "NAO_COMPARECIMENTO");
    return { situacao: status === "ESTORNADO" ? "ESTORNADO" : "ESTORNO_PROCESSANDO" };
  }

  async function findEventAsParty(user: AuthUser, eventId: string): Promise<{ event: EventRecord; party: Party }> {
    const event = await events.findEvent(eventId);
    const party = event && partyOf(event, user);
    if (!event || !party) throw naoEncontrado();
    return { event, party };
  }

  const contact = (account: Account | null) => account && { nome: account.nome, telefone: account.telefone ?? "", fotoPerfilUrl: account.fotoPerfilUrl ?? "" };

  return {
    async createEvent(user: AuthUser, input: EventInput, imagem: File | null, now = new Date()): Promise<EventRecord & { semanasCriadas: number }> {
      const contractor = await requireRole(user, "CONTRACTOR", "Apenas contratantes podem criar eventos.");
      assertProfileComplete(contractor, "criarEvento");
      assertFuture(input.inicio, now);
      if (!imagem) throw new AppError(400, "IMAGEM_OBRIGATORIA", "Adicione uma foto ilustrativa do evento.");
      assertImage(imagem);
      if (input.repetirSemanas > 1 && !isPro(contractor.casaAte, now)) {
        throw new AppError(403, "RECURSO_CASA", "Eventos recorrentes fazem parte do Muve Casa.");
      }

      const envios = await Promise.allSettled(Array.from({ length: input.repetirSemanas }, () => images.upload("event-banners", user.id, imagem)));
      const descartar = (urls: string[]) => Promise.all(urls.map((url) => images.removeByUrl("event-banners", url).catch(seguirApesarDe("Capa da recorrência não removida", undefined))));
      const criados: EventRecord[] = [];
      for (let semana = 0; semana < envios.length; semana++) {
        const envio = envios[semana];
        const restantes = envios.slice(semana + 1).flatMap((e) => (e.status === "fulfilled" ? [e.value] : []));
        if (envio.status === "rejected") {
          await descartar(restantes);
          if (criados.length === 0) throw envio.reason;
          break;
        }
        const inicio = new Date(input.inicio.getTime() + semana * 7 * 24 * 60 * 60 * 1000);
        try {
          criados.push(await events.insertEvent(user.id, { ...input, inicio, imagemUrl: envio.value }));
        } catch (error) {
          await descartar([envio.value, ...restantes]);
          if (criados.length === 0) throw error;
          break;
        }
      }
      return { ...criados[0], semanasCriadas: criados.length };
    },

    async updateEvent(user: AuthUser, eventId: string, input: EventInput, imagem: File | null, now = new Date()): Promise<EventRecord> {
      const current = await findEditableEvent(user, eventId, now);
      assertFuture(input.inicio, now);
      const updated = await saveEvent(user, current, input, imagem);
      const pending = (await events.listCandidates(eventId)).filter((c) => c.status === "PENDENTE");
      if (pending.length === 0 || !changedForCandidates(current, updated)) return updated;

      const stillValid: string[] = [];
      for (const candidate of pending) {
        if (updated.cache !== current.cache && candidate.valorProposto === null) {
          await events.updateCandidateProposal(candidate.id, current.cache);
        }
        const musician = await accounts.findAccount(candidate.musicianId);
        const distancia = await events.distanceKm(eventId, candidate.musicianId);
        const combina = musician?.uf && musician.cidade
          && eventMatchesMusician(updated, { uf: musician.uf, cidade: musician.cidade, estilosMusicais: musician.estilosMusicais ?? [] }, distancia, isPro(musician.proAte, now) ? PRO_RAIO_MAXIMO_KM : RAIO_MAXIMO_KM);
        if (combina) stillValid.push(candidate.musicianId);
        else if (await events.declineCandidate(candidate.id, "EVENTO_ALTERADO")) void notifier.candidateOutOfRange(updated, candidate.musicianId);
      }
      if (stillValid.length > 0) void notifier.eventUpdated(updated, stillValid);
      return updated;
    },

    async deleteEvent(user: AuthUser, eventId: string, now = new Date()): Promise<void> {
      const event = await findEditableEvent(user, eventId, now);
      const candidatos = await events.listCandidates(eventId);
      const pending = candidatos.filter((c) => c.status === "PENDENTE").map((c) => c.musicianId);
      if (candidatos.length > 0) {
        await events.cancelEvent(eventId);
      } else {
        await events.deleteEvent(eventId);
        await images.removeByUrl("event-banners", event.imagemUrl).catch(seguirApesarDe("Capa do evento excluído não removida", undefined));
      }
      if (pending.length > 0) void notifier.eventDeleted(event, pending);
    },

    async apply(user: AuthUser, eventId: string, valorProposto: number | null = null, now = new Date()): Promise<void> {
      const musician = await requireRole(user, "MUSICIAN", "Apenas músicos podem se inscrever em eventos.");
      assertProfileComplete(musician, "candidatar");
      if (musician.visibilidadeReduzidaAte && musician.visibilidadeReduzidaAte > now) {
        const ate = formatDateTime(musician.visibilidadeReduzidaAte, musician.uf ?? undefined);
        throw new AppError(403, "VISIBILIDADE_REDUZIDA", `Por causa de uma desistência em cima da hora ou de uma ausência, você não pode se inscrever em novos eventos até ${ate}.`);
      }
      const event = await events.findEvent(eventId);
      if (!event) throw naoEncontrado();
      const convidado = await events.hasInvite(eventId, user.id);
      if (event.status !== "ABERTO" || event.inicio <= now || (event.inscricoesEncerradas && !convidado)) {
        throw new AppError(409, "INSCRICOES_ENCERRADAS", "As inscrições para este evento estão encerradas.");
      }
      const pro = isPro(musician.proAte, now);
      if (!pro && !convidado && emAcessoAntecipado({ inicio: event.inicio, criadoEm: event.createdAt }, now)) {
        const libera = formatDateTime(liberadoParaTodosEm(event.createdAt), event.uf);
        throw new AppError(409, "ACESSO_ANTECIPADO", `Este evento está em acesso antecipado para músicos Pro. Ele abre para todos em ${libera}.`);
      }
      const distanciaKm = await events.distanceKm(eventId, user.id);
      if (!convidado && !eventMatchesMusician(event, { uf: musician.uf!, cidade: musician.cidade!, estilosMusicais: musician.estilosMusicais ?? [] }, distanciaKm, pro ? PRO_RAIO_MAXIMO_KM : RAIO_MAXIMO_KM)) {
        throw new AppError(403, "EVENTO_INCOMPATIVEL", "Este evento não é compatível com a região e os estilos do seu perfil.");
      }
      if (await events.musicianHasConflict(user.id, eventId)) throw musicoOcupado();
      const candidate = await events.insertCandidate(eventId, user.id, valorDaInscricao(valorProposto, event.cache));
      void notifier.newApplication(event, candidate.valorProposto);
    },

    async openDispute(user: AuthUser, eventId: string, motivo: string, now = new Date()): Promise<void> {
      const { event, party } = await findEventAsParty(user, eventId);
      const payment = await payments.findPayment(eventId);
      if (!podeContestar(event, payment, now)) throw contestacaoIndisponivel();
      if (ausenciaPendente(event) && respostaEncerrada(event, now)) throw respostaForaDoPrazo();
      if (!(await events.openDispute({ eventId, abertaPor: user.id, motivo }))) throw contestacaoIndisponivel();
      void notifier.disputeOpened(event, party, motivo);
    },

    async resolveDispute(disputeId: string, decisao: DecisaoContestacao, observacao: string | null): Promise<void> {
      const dispute = await events.findDispute(disputeId);
      const event = dispute && (await events.findEvent(dispute.eventId));
      if (!dispute || !event) throw new AppError(404, "CONTESTACAO_NAO_ENCONTRADA", "Contestação não encontrada.");
      const resultado = await events.decideDispute(disputeId, decisao, observacao);
      if (resultado === "NAO_ENCONTRADA") throw new AppError(404, "CONTESTACAO_NAO_ENCONTRADA", "Contestação não encontrada.");
      if (resultado === "JA_DECIDIDA") throw new AppError(409, "CONTESTACAO_RESOLVIDA", "Esta contestação já foi decidida.");
      if (decisao === "PAGAR_MUSICO") {
        if (event.status === "CONTRATADO") await events.concludeEvent(event.id);
      } else {
        try {
          await payments.refundHiring(event.id, "NAO_COMPARECIMENTO", disputeId);
        } catch (error) {
          await events.reopenDisputeWithoutRefund(disputeId).catch((falha: unknown) => console.error("Falha ao devolver a contestação para análise", disputeId, falha));
          throw error;
        }
        if ((await events.findDispute(disputeId))?.status === "ABERTA") {
          throw new AppError(409, "ESTORNO_RECUSADO", "A Asaas recusou o estorno, e a contestação voltou para análise.");
        }
      }
      void notifier.disputeResolved(event, decisao, observacao);
    },

    async setFavorite(user: AuthUser, musicianId: string, favorite: boolean, now = new Date()): Promise<void> {
      const [contratante, inscreveu] = await Promise.allSettled([
        requireRole(user, "CONTRACTOR", "Apenas contratantes salvam músicos favoritos."),
        favorite ? events.hasAppliedToContractor(musicianId, user.id) : Promise.resolve(true),
      ]);
      if (contratante.status === "rejected") throw contratante.reason;
      if (favorite && !isPro(contratante.value.casaAte, now)) throw new AppError(403, "RECURSO_CASA", "Músicos favoritos fazem parte do Muve Casa.");
      if (inscreveu.status === "rejected") throw inscreveu.reason;
      if (favorite && !inscreveu.value) {
        throw new AppError(404, "MUSICO_NAO_ENCONTRADO", "Só é possível favoritar músicos que já se inscreveram nos seus eventos.");
      }
      await events.setFavorite(user.id, musicianId, favorite);
    },

    async inviteMusician(user: AuthUser, eventId: string, musicianId: string, now = new Date()): Promise<void> {
      const contractor = await requireRole(user, "CONTRACTOR", "Apenas contratantes convidam músicos.");
      if (!isPro(contractor.casaAte, now)) throw new AppError(403, "RECURSO_CASA", "Convidar músicos faz parte do Muve Casa.");
      const event = await events.findEvent(eventId);
      if (!event || event.contractorId !== user.id) throw naoEncontrado();
      if (event.status !== "ABERTO" || event.inicio <= now) throw new AppError(409, "EVENTO_INDISPONIVEL", "Só é possível convidar para eventos abertos.");
      if (!(await events.isFavorite(user.id, musicianId))) throw new AppError(409, "NAO_FAVORITO", "Salve o músico nos favoritos antes de convidar.");
      if (await events.findCandidate(eventId, musicianId)) throw new AppError(409, "JA_INSCRITO", "Este músico já está inscrito neste evento.");
      await events.insertInvite(eventId, musicianId);
      void notifier.invited(event, musicianId, contractor.nome);
    },

    async releaseAccount(user: AuthUser, role: Role): Promise<void> {
      const mine = await events.listEventsOf(user.id, role);
      if (role === "CONTRACTOR") {
        for (const event of mine.filter((evento) => evento.status === "ABERTO")) await payments.ensureNoActiveCheckout(event.id);
      }
      for (const event of mine) {
        if (role === "CONTRACTOR" && event.status === "ABERTO") {
          const pending = (await events.listCandidates(event.id)).filter((c) => c.status === "PENDENTE").map((c) => c.musicianId);
          await events.deleteEvent(event.id);
          await images.removeByUrl("event-banners", event.imagemUrl).catch(seguirApesarDe("Capa do evento excluído não removida", undefined));
          if (pending.length > 0) void notifier.eventDeleted(event, pending);
        }
        if (role === "MUSICIAN" && event.status === "ABERTO") void notifier.applicantLeft(event);
      }
    },

    async setApplicationsClosed(user: AuthUser, eventId: string, closed: boolean): Promise<void> {
      const event = await events.findEvent(eventId);
      if (!event || event.contractorId !== user.id) throw naoEncontrado();
      if (event.status !== "ABERTO") throw new AppError(409, "EVENTO_INDISPONIVEL", "As inscrições só podem ser abertas ou encerradas antes da contratação.");
      await events.setApplicationsClosed(eventId, closed);
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
      if (await events.declineCandidate(candidateId, "CONTRATANTE")) void notifier.candidateDeclined(event, candidate.musicianId);
    },

    async updateProposal(user: AuthUser, eventId: string, valorProposto: number | null, now = new Date()): Promise<void> {
      const event = await events.findEvent(eventId);
      const candidate = event && (await events.findCandidate(eventId, user.id));
      if (!event || !candidate) throw new AppError(404, "CANDIDATURA_NAO_ENCONTRADA", "Inscrição não encontrada.");
      if (event.status !== "ABERTO" || candidate.status !== "PENDENTE" || event.inicio <= now) {
        throw new AppError(409, "PROPOSTA_INDISPONIVEL", "O valor só pode ser alterado enquanto a inscrição aguarda resposta.");
      }
      await payments.ensureNoActiveCheckout(eventId, now);
      await events.updateCandidateProposal(candidate.id, valorDaInscricao(valorProposto, event.cache));
    },

    async proposeValue(user: AuthUser, candidateId: string, valor: number, now = new Date()): Promise<MessageRecord> {
      const { event, candidate } = await findOpenNegotiation(user, candidateId, now);
      await events.closeOpenProposals(candidateId);
      const message = await events.insertMessage({ candidateId, authorId: user.id, texto: `Proposta de cachê: ${formatCurrency(valor)}`, valor });
      void notifier.newMessage(event, candidate, user.id);
      return message;
    },

    async answerProposal(user: AuthUser, candidateId: string, messageId: string, aceitar: boolean, now = new Date()): Promise<MessageRecord> {
      const { event, candidate } = await findOpenNegotiation(user, candidateId, now);
      const proposal = await events.findMessage(messageId);
      if (!proposal || proposal.candidateId !== candidateId || proposal.tipo !== "PROPOSTA") {
        throw new AppError(404, "PROPOSTA_NAO_ENCONTRADA", "Proposta não encontrada.");
      }
      if (proposal.authorId === user.id) throw new AppError(409, "PROPOSTA_PROPRIA", "Quem responde a proposta é a outra parte.");
      if (!(await events.answerProposal(messageId, aceitar ? "ACEITA" : "RECUSADA"))) {
        throw new AppError(409, "PROPOSTA_ENCERRADA", "Esta proposta já foi respondida ou substituída.");
      }
      if (aceitar) await events.updateCandidateProposal(candidate.id, valorDaInscricao(proposal.valor, event.cache));
      const texto = aceitar ? `Proposta de ${formatCurrency(proposal.valor!)} aceita. Esse é o valor da contratação.` : `Proposta de ${formatCurrency(proposal.valor!)} recusada.`;
      const message = await events.insertMessage({ candidateId, authorId: user.id, texto });
      void notifier.newMessage(event, candidate, user.id);
      return message;
    },

    async sendMessage(user: AuthUser, candidateId: string, texto: string, now = new Date()): Promise<MessageRecord> {
      const { event, candidate } = await findConversation(user, candidateId);
      const encerradoSemContratacao = event.status === "ABERTO" && event.inicio <= now;
      if (candidate.status === "RECUSADO" || encerradoSemContratacao || (event.status !== "ABERTO" && event.status !== "CONTRATADO")) {
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
      if (event.status !== "ABERTO" || candidate.status !== "PENDENTE") {
        throw new AppError(409, "INSCRICAO_ENCERRADA", "Esta inscrição não está mais aguardando resposta e continua no histórico.");
      }
      if (!hasCancellationNotice(event.inicio, now)) {
        throw new AppError(409, "CANCELAMENTO_INDISPONIVEL", "Cancelamento indisponível (menos de 24h para o evento).");
      }
      await payments.ensureNoActiveCheckout(eventId, now);
      await events.deleteCandidate(candidate.id);
    },

    async applyExpiredAbsence(eventId: string, now = new Date()) {
      return pedirEstornoDaAusenciaVencida(eventId, now);
    },

    async settleDueHiring(eventId: string, now = new Date()): Promise<void> {
      const event = await events.findEvent(eventId);
      if (event && ausenciaPendente(event)) {
        await pedirEstornoDaAusenciaVencida(eventId, now);
        return;
      }
      if (event?.status !== "CONTRATADO" || !prazoEncerrado(event, now)) return;
      if ((await payments.findPayment(eventId))?.refundStatus === "PROCESSANDO" || (await events.findOpenDispute(eventId))) return;
      await events.concludeEvent(eventId);
    },

    async getHiring(user: AuthUser, eventId: string, now = new Date()) {
      const first = await findEventAsParty(user, eventId);
      if (ausenciaPendente(first.event)) {
        await pedirEstornoDaAusenciaVencida(eventId, now).catch(seguirApesarDe("Estorno da ausência sem resposta não pedido", null));
      }
      const refund = await payments.refreshRefund(eventId).catch((error: unknown) => {
        console.error("Falha ao consultar estorno da contratação", error instanceof AppError ? error.code : "falha inesperada");
        return undefined;
      });
      const found = refund === undefined || refund?.refundStatus ? await findEventAsParty(user, eventId) : first;
      const { party } = found;
      let { event } = found;
      if (event.status === "ABERTO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento ainda não tem um músico contratado.");

      const [atual, contestacao] = await Promise.all([refund === undefined ? payments.findPayment(eventId) : refund, events.findOpenDispute(eventId)]);
      const estornoPendente = atual?.refundStatus === "PROCESSANDO";
      if (event.status === "CONTRATADO" && !estornoPendente && !contestacao && !event.ausenciaInformadaEm && prazoEncerrado(event, now)) {
        event = await events.concludeEvent(eventId);
      }

      const [contratante, musico, endereco, payment, avaliou] = await Promise.all([
        event.contractorId ? accounts.findAccount(event.contractorId) : null,
        event.musicoContratadoId ? accounts.findAccount(event.musicoContratadoId) : null,
        events.findEndereco(eventId),
        payments.findPayment(eventId),
        events.hasReviewed(eventId, user.id),
      ]);
      const contestacaoResolvida = payment ? await events.findLatestResolvedDispute(eventId, payment.id) : null;
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
          multaDescontada: payment.multaDescontada,
        },
        avaliou,
        contestacao: contestacao && { motivo: contestacao.motivo, abertaPorMim: contestacao.abertaPor === user.id, status: contestacao.status },
        contestacaoResolvida: contestacaoResolvida && { status: "RESOLVIDA" as const, decisao: contestacaoResolvida.decisao, resolvidaEm: contestacaoResolvida.resolvidaEm?.toISOString() ?? null },
        podeContestar: !contestacao && podeContestar(event, payment, now) && !(ausenciaPendente(event) && respostaEncerrada(event, now)),
        ausencia: ausenciaPendente(event) ? { informadaEm: event.ausenciaInformadaEm!.toISOString(), prazo: prazoDaResposta(event.ausenciaInformadaEm!).toISOString() } : null,
        naoComparecimento: { permitido: party === "contratante" && event.status === "CONTRATADO" && !antesDoInicio && !event.confirmacaoMusico && !event.confirmacaoContratante && !event.ausenciaInformadaEm && !prazoEncerrado(event, now) && !contestacao && payment?.refundStatus !== "PROCESSANDO" },
        cancelamento: {
          permitido: event.status === "CONTRATADO" && antesDoInicio && payment?.refundStatus !== "PROCESSANDO",
          reembolso: party === "musico" || hasCancellationNotice(event.inicio, now),
        },
      };
    },

    async cancelHiring(user: AuthUser, eventId: string, esperado?: "COM_ESTORNO" | "SEM_ESTORNO", now = new Date()): Promise<{ situacao: "ESTORNADO" | "ESTORNO_PROCESSANDO" | "SEM_ESTORNO" }> {
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
      if (esperado && esperado !== (reembolsado ? "COM_ESTORNO" : "SEM_ESTORNO")) {
        throw new AppError(409, "PRAZO_ALTERADO", "O prazo de 24 horas mudou enquanto você decidia. Confira as condições na tela e confirme de novo.");
      }
      if (reembolsado) {
        const status = await payments.refundHiring(eventId, "CANCELAR");
        return { situacao: status === "ESTORNADO" ? "ESTORNADO" : "ESTORNO_PROCESSANDO" };
      }
      await payments.ensurePaidForNoRefund(eventId);
      await events.cancelEvent(eventId);
      void notifier.hiringCancelled(event, "contratante", false);
      return { situacao: "SEM_ESTORNO" };
    },

    async reportNoShow(user: AuthUser, eventId: string, now = new Date()): Promise<{ situacao: "AGUARDANDO_MUSICO"; prazo: string }> {
      const { event, party } = await findEventAsParty(user, eventId);
      if (party !== "contratante") throw naoEncontrado();
      if (event.status !== "CONTRATADO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento não tem uma contratação ativa.");
      if (event.inicio > now) throw new AppError(409, "EVENTO_NAO_INICIADO", "O não comparecimento só pode ser registrado após o horário do evento.");
      if (event.confirmacaoMusico) {
        throw new AppError(409, "MUSICO_CONFIRMOU", "O músico confirmou a realização do show. Se ele não compareceu, abra uma contestação no comprovante.");
      }
      if (event.confirmacaoContratante) {
        throw new AppError(409, "CONTRATANTE_CONFIRMOU", "Você já confirmou a realização do show.");
      }
      if (prazoEncerrado(event, now)) {
        throw new AppError(409, "PRAZO_ENCERRADO", "O prazo de 7 dias para registrar o não comparecimento terminou.");
      }
      if (event.ausenciaInformadaEm) {
        throw new AppError(409, "AUSENCIA_JA_INFORMADA", `Você já informou o não comparecimento. O músico tem até ${formatDateTime(prazoDaResposta(event.ausenciaInformadaEm), event.uf)} para responder.`);
      }
      if (await events.findOpenDispute(eventId)) throw contestacaoPendente();
      if ((await payments.findPayment(eventId))?.refundStatus === "PROCESSANDO") {
        throw new AppError(409, "ESTORNO_PENDENTE", "Já existe um estorno em andamento para esta contratação.");
      }
      if (!(await events.reportAbsence(eventId, now))) throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento não tem uma contratação ativa.");
      const prazo = prazoDaResposta(now);
      void notifier.absenceReported(event, prazo);
      return { situacao: "AGUARDANDO_MUSICO", prazo: prazo.toISOString() };
    },

    async confirmCompletion(user: AuthUser, eventId: string, now = new Date()): Promise<EventRecord> {
      const { event, party } = await findEventAsParty(user, eventId);
      if (event.status === "CONCLUIDO") return event;
      if (event.status !== "CONTRATADO") throw new AppError(409, "EVENTO_NAO_CONTRATADO", "Este evento não tem um músico contratado.");
      if (event.inicio > now) throw new AppError(409, "EVENTO_NAO_INICIADO", "A confirmação fica disponível após o início do evento.");
      if ((await payments.findPayment(eventId))?.refundStatus === "PROCESSANDO") {
        throw new AppError(409, "ESTORNO_PENDENTE", "A confirmação do show fica suspensa até a resolução do estorno.");
      }
      if (await events.findOpenDispute(eventId)) throw contestacaoPendente();

      if (ausenciaPendente(event)) {
        if (party === "contratante") {
          await events.withdrawAbsence(eventId);
        } else {
          if (respostaEncerrada(event, now)) throw respostaForaDoPrazo();
          const confirmado = await events.setConfirmation(eventId, party);
          if (!(await events.openDispute({ eventId, abertaPor: user.id, motivo: MOTIVO_DA_RESPOSTA }))) throw contestacaoIndisponivel();
          void notifier.disputeOpened(confirmado, party, MOTIVO_DA_RESPOSTA);
          return confirmado;
        }
      }

      const updated = await events.setConfirmation(eventId, party);
      if (updated.status !== "CONCLUIDO") void notifier.completionConfirmed(updated, party);
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
