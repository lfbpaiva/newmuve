import { EMAIL_SUPORTE } from "../../../shared/dominio.ts";
import { formatCurrency, formatDateTime } from "../../../shared/formato.ts";
import type { CandidateRecord, EventRecord } from "../domain/event.ts";
import type { AccountStore } from "./accountService.ts";
import type { EventStore } from "./ports.ts";

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export interface NotificationInput {
  userId: string;
  titulo: string;
  texto: string;
  link: string | null;
}

export interface Inbox {
  add(notification: NotificationInput): Promise<void>;
  markAllRead(userId: string): Promise<void>;
}

export function createNotifier(deps: { accounts: AccountStore; events: EventStore; inbox: Inbox; mailer: Mailer; appUrl: string }) {
  const { accounts, events, inbox, mailer, appUrl } = deps;

  async function notify(userId: string | null, titulo: string, texto: string, link: string | null, { email = true } = {}): Promise<void> {
    if (!userId) return;
    try {
      await inbox.add({ userId, titulo, texto, link });
    } catch (error) {
      console.error("Falha ao registrar notificação", titulo, error);
    }
    if (!email) return;
    try {
      const address = await accounts.findEmail(userId);
      if (!address) return;
      await mailer.send({ to: address, subject: `Muve — ${titulo}`, text: `${texto}\n\nAcesse: ${appUrl}` });
    } catch (error) {
      console.error("Falha ao enviar e-mail", titulo, error);
    }
  }

  const when = (event: EventRecord) => `${formatDateTime(event.inicio, event.uf)} em ${event.cidade}, ${event.uf}`;
  const eventLink = (event: EventRecord) => `/event/${event.id}`;
  const hiringLink = (event: EventRecord) => `/event/${event.id}/hiring`;

  return {
    async hiringConfirmed(eventId: string, cache: number): Promise<void> {
      const event = await events.findEvent(eventId).catch(() => null);
      if (!event) return;
      const others = (await events.listCandidates(eventId).catch(() => [] as CandidateRecord[])).filter((c) => c.motivoRecusa === "OUTRO_CONTRATADO");
      await Promise.all([
        notify(
          event.musicoContratadoId,
          `Você foi contratado para "${event.titulo}"`,
          `O contratante aprovou sua inscrição e pagou o cachê de ${formatCurrency(cache)}, que fica retido até a conclusão do show (${when(event)}). O endereço e o telefone do contratante já estão no comprovante.`,
          hiringLink(event),
        ),
        notify(
          event.contractorId,
          `Pagamento confirmado: "${event.titulo}"`,
          `Recebemos seu pagamento e o músico foi avisado. O show está marcado para ${when(event)}. O cachê fica retido até as duas partes confirmarem a realização.`,
          hiringLink(event),
        ),
        ...others.map((candidate) => notify(
          candidate.musicianId,
          `Outro músico foi escolhido para "${event.titulo}"`,
          "O contratante fechou com outro músico. Obrigado pelo interesse; novos eventos aparecem no seu início.",
          eventLink(event),
          { email: false },
        )),
      ]);
    },

    async hiringCancelled(event: EventRecord, cancelledBy: "contratante" | "musico", refunded: boolean): Promise<void> {
      if (cancelledBy === "musico") {
        const reopened = await events.findEvent(event.id).catch(() => null);
        const back = (await events.listCandidates(event.id).catch(() => [] as CandidateRecord[])).filter((c) => c.status === "PENDENTE");
        await Promise.all([
          notify(
            event.contractorId,
            `O músico desistiu de "${event.titulo}"`,
            `O músico contratado cancelou a participação no show de ${when(event)}. O valor pago foi devolvido integralmente e o evento voltou a ficar aberto${reopened?.inscricoesEncerradas ? ", com as inscrições ainda encerradas" : ""}. ${back.length > 0 ? "Os demais inscritos voltaram a concorrer." : ""}`.trim(),
            eventLink(event),
          ),
          ...back.map((candidate) => notify(
            candidate.musicianId,
            `Você voltou a concorrer em "${event.titulo}"`,
            "O músico escolhido desistiu. Sua inscrição voltou a aguardar a resposta do contratante.",
            eventLink(event),
            { email: false },
          )),
        ]);
        return;
      }
      await notify(
        event.musicoContratadoId,
        `Contratação cancelada: "${event.titulo}"`,
        refunded
          ? `O contratante cancelou o show de ${when(event)} com mais de 24 horas de antecedência. O valor foi devolvido a ele.`
          : `O contratante cancelou o show de ${when(event)} com menos de 24 horas de antecedência. Como compensação, o cachê será repassado para a sua chave Pix.`,
        hiringLink(event),
      );
    },

    async noShowReported(event: EventRecord): Promise<void> {
      await notify(
        event.musicoContratadoId,
        `Não comparecimento registrado: "${event.titulo}"`,
        `O contratante registrou que você não compareceu ao show de ${when(event)}. O valor foi devolvido a ele.`,
        hiringLink(event),
      );
    },

    async newApplication(event: EventRecord, valorProposto: number | null): Promise<void> {
      await notify(
        event.contractorId,
        `Nova inscrição em "${event.titulo}"`,
        valorProposto === null
          ? `Um músico se inscreveu aceitando o cachê de ${formatCurrency(event.cache)}.`
          : `Um músico se inscreveu propondo um cachê de ${formatCurrency(valorProposto)}.`,
        eventLink(event),
        { email: false },
      );
    },

    async newMessage(event: EventRecord, candidate: CandidateRecord, authorId: string): Promise<void> {
      const recipient = authorId === candidate.musicianId ? event.contractorId : candidate.musicianId;
      await notify(recipient, `Nova mensagem sobre "${event.titulo}"`, "Abra a conversa para responder.", `/conversa/${candidate.id}`, { email: false });
    },

    async candidateDeclined(event: EventRecord, musicianId: string): Promise<void> {
      await notify(
        musicianId,
        `Inscrição não selecionada: "${event.titulo}"`,
        "O contratante decidiu seguir com outros músicos para este evento.",
        eventLink(event),
        { email: false },
      );
    },

    async eventUpdated(event: EventRecord, musicianIds: string[]): Promise<void> {
      await Promise.all(musicianIds.map((musicianId) => notify(
        musicianId,
        `"${event.titulo}" foi alterado`,
        `O contratante mudou os dados do evento: agora é ${when(event)}, com cachê oferecido de ${formatCurrency(event.cache)}. O valor da sua inscrição continua o mesmo; você pode alterá-lo no evento.`,
        eventLink(event),
        { email: false },
      )));
    },

    async completionConfirmed(event: EventRecord, by: "contratante" | "musico"): Promise<void> {
      await notify(
        by === "contratante" ? event.musicoContratadoId : event.contractorId,
        `Show confirmado pela outra parte: "${event.titulo}"`,
        "Confirme você também para concluir a contratação. Sem a sua confirmação, o show é dado como realizado 7 dias após a data.",
        hiringLink(event),
      );
    },

    async eventDeleted(event: EventRecord, musicianIds: string[]): Promise<void> {
      await Promise.all(musicianIds.map((musicianId) => notify(
        musicianId,
        `"${event.titulo}" foi excluído`,
        `O contratante excluiu o evento de ${when(event)}. Sua inscrição foi encerrada.`,
        null,
        { email: false },
      )));
    },

    async candidateOutOfRange(event: EventRecord, musicianId: string): Promise<void> {
      await notify(
        musicianId,
        `"${event.titulo}" mudou e não combina mais com seu perfil`,
        "O contratante mudou a cidade ou os estilos do evento. Sua inscrição foi encerrada.",
        eventLink(event),
        { email: false },
      );
    },

    async applicantLeft(event: EventRecord): Promise<void> {
      await notify(event.contractorId, `Um inscrito saiu de "${event.titulo}"`, "Um músico inscrito excluiu a conta; a inscrição dele foi removida.", eventLink(event), { email: false });
    },

    async latePayment(event: EventRecord, refundDenied: boolean): Promise<void> {
      await notify(
        event.contractorId,
        refundDenied ? `Devolução pendente: "${event.titulo}"` : `Pix recebido fora de hora: "${event.titulo}"`,
        refundDenied
          ? `A Asaas recusou a devolução de um Pix pago depois que a cobrança deixou de valer. Vamos tentar de novo quando você abrir o evento. Se persistir, escreva para ${EMAIL_SUPORTE}.`
          : "Recebemos um Pix depois que a cobrança deixou de valer (ela expirou, foi trocada ou o músico não está mais disponível). O valor será devolvido integralmente.",
        eventLink(event),
      );
    },

    async refundDenied(event: EventRecord, requestedBy: "contratante" | "musico"): Promise<void> {
      await Promise.all([
        notify(
          event.contractorId,
          `Devolução recusada: "${event.titulo}"`,
          `A Asaas recusou a devolução do valor. A contratação continua ativa; tente de novo pelo comprovante ou escreva para ${EMAIL_SUPORTE}.`,
          hiringLink(event),
        ),
        requestedBy === "musico"
          ? notify(
            event.musicoContratadoId,
            `Sua desistência não foi concluída: "${event.titulo}"`,
            "A Asaas recusou a devolução ao contratante, então você continua contratado. Tente desistir de novo pelo comprovante.",
            hiringLink(event),
          )
          : Promise.resolve(),
      ]);
    },

    async payoutFailed(event: EventRecord): Promise<void> {
      await notify(
        event.musicoContratadoId,
        `Repasse não concluído: "${event.titulo}"`,
        "A transferência do cachê falhou. Confira sua chave Pix em Editar perfil; tentaremos de novo quando o comprovante for aberto.",
        hiringLink(event),
      );
    },

    async payoutDone(event: EventRecord): Promise<void> {
      await notify(event.musicoContratadoId, `Cachê repassado: "${event.titulo}"`, "A transferência para a sua chave Pix foi concluída.", hiringLink(event));
    },
  };
}

export type Notifier = ReturnType<typeof createNotifier>;
